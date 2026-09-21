import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const groqKey = process.env.GROQ_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!groqKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured." },
        { status: 500 }
      );
    }

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase server configuration is missing." },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // AUTHENTICATE REQUESTING USER
    // ---------------------------------------------------------

    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace("Bearer ", "");

    // Client used ONLY to validate the user's JWT.
    const authClient = createClient(
      supabaseUrl,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid or expired session." },
        { status: 401 }
      );
    }

    // ---------------------------------------------------------
    // SERVER CLIENT
    // Bypasses RLS after the user has already been authenticated.
    // ---------------------------------------------------------

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // ---------------------------------------------------------
    // VERIFY INTERNAL EMPLOYEE
    // ---------------------------------------------------------

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "Employee profile not found." },
        { status: 403 }
      );
    }

    const role = String(profile.role ?? "employee").toLowerCase();

    if (!["employee", "ceo", "hr", "admin"].includes(role)) {
      return NextResponse.json(
        { error: "You are not allowed to access this vendor chat." },
        { status: 403 }
      );
    }

    // ---------------------------------------------------------
    // REQUEST
    // ---------------------------------------------------------

    const body = await req.json();

    const chatId = body.chat_id;
    const momDate =
      body.date ||
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(new Date());

    if (!chatId) {
      return NextResponse.json(
        { error: "chat_id is required." },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // VERIFY THAT THE CHAT EXISTS
    // ---------------------------------------------------------

    const { data: vendorChat, error: chatError } = await supabase
      .from("vendor_chats")
      .select("id, vendor_id")
      .eq("id", chatId)
      .single();

    if (chatError || !vendorChat) {
      return NextResponse.json(
        { error: "Vendor chat not found." },
        { status: 404 }
      );
    }

    // ---------------------------------------------------------
    // GET VENDOR
    // ---------------------------------------------------------

    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id, company_name, contact_name")
      .eq("id", vendorChat.vendor_id)
      .single();

    if (vendorError || !vendor) {
      return NextResponse.json(
        { error: "Vendor not found." },
        { status: 404 }
      );
    }

    // ---------------------------------------------------------
    // INDIA DATE RANGE
    // ---------------------------------------------------------

    const start = new Date(
      `${momDate}T00:00:00+05:30`
    );

    const end = new Date(
      `${momDate}T23:59:59.999+05:30`
    );

    // ---------------------------------------------------------
    // LOAD VENDOR CHAT MESSAGES
    // ---------------------------------------------------------

    const { data: messages, error: messagesError } = await supabase
      .from("vendor_messages")
      .select(
        "id, sender_id, sender_type, content, file_name, created_at, updated_at"
      )
      .eq("chat_id", chatId)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .order("created_at", { ascending: true });

    if (messagesError) {
      return NextResponse.json(
        {
          error: `Could not load vendor messages: ${messagesError.message}`,
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // GET SENDER NAMES
    // ---------------------------------------------------------

    const senderIds = Array.from(
      new Set(
        (messages ?? [])
          .map((message: any) => message.sender_id)
          .filter(Boolean)
      )
    );

    const names: Record<string, string> = {};

    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", senderIds);

      for (const p of profiles ?? []) {
        names[p.id] = p.full_name ?? "Employee";
      }
    }

    // ---------------------------------------------------------
    // FORMAT CHAT
    // ---------------------------------------------------------

    const chatConversation = (messages ?? [])
      .map((message: any) => {
        const sender =
          message.sender_type === "vendor"
            ? vendor.contact_name || vendor.company_name
            : names[message.sender_id] || "InnoVibe Employee";

        const time = new Date(
          message.created_at
        ).toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "2-digit",
          minute: "2-digit",
        });

        let content = message.content?.trim() ?? "";

        if (!content && message.file_name) {
          content = `[File shared: ${message.file_name}]`;
        }

        if (!content) {
          content = "[Message with no text]";
        }

        return `[${time}] ${sender}: ${content}`;
      })
      .join("\n");

    const messageCount = messages?.length ?? 0;

    if (messageCount === 0) {
      return NextResponse.json(
        {
          error: `There are no vendor chat messages for ${momDate}.`,
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // GROQ
    // ---------------------------------------------------------

    const systemPrompt = `
You are the Vendor Daily MOM assistant for InnoVibe Mobility.

Create a professional Daily Meeting Minutes report from the
actual vendor chat messages supplied.

IMPORTANT RULES:

- Use ONLY the supplied messages.
- Never invent meetings, decisions, people, deadlines, tasks,
  numbers or events.
- Do not invent information that is not present.
- Ignore greetings and meaningless small talk.
- Clearly distinguish vendor updates from InnoVibe employee updates.
- Keep the report concise and professional.

Return exactly these sections:

## Vendor Daily MOM

Give a concise overview of the day's important vendor-related activity.

## Key Discussions

List the important topics discussed.

## Decisions Made

List decisions actually made.

If none:
No specific decisions recorded.

## Action Items

List:

- Task — Responsible person — Deadline if explicitly mentioned.

Never invent responsibility or deadlines.

If none:
No specific action items recorded.

## Vendor Updates

List important updates provided by the vendor.

## InnoVibe Updates

List important updates provided by InnoVibe employees.

## Follow-ups

List clearly identified future follow-ups.

If none:
No follow-ups identified.
`;

    const userPrompt = `
VENDOR:
${vendor.company_name}

DATE:
${momDate}

MESSAGES ANALYZED:
${messageCount}

==================================================
VENDOR CHAT
==================================================

${chatConversation}
`;

    const summaryRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
        }),
      }
    );

    if (!summaryRes.ok) {
      const errorText = await summaryRes.text();

      return NextResponse.json(
        {
          error: `Vendor Daily MOM generation failed: ${errorText}`,
        },
        { status: 500 }
      );
    }

    const summaryData = await summaryRes.json();

    const momContent =
      summaryData.choices?.[0]?.message?.content?.trim() ?? "";

    if (!momContent) {
      return NextResponse.json(
        {
          error: "AI returned an empty Vendor Daily MOM.",
        },
        { status: 500 }
      );
    }

    // ---------------------------------------------------------
    // RETURN
    // ---------------------------------------------------------

    return NextResponse.json({
      success: true,
      mom: {
        content: momContent,
      },
      vendor: vendor.company_name,
      date: momDate,
      messages: messageCount,
      generated_by: profile.full_name,
    });
  } catch (error: any) {
    console.error("Vendor Daily MOM error:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unexpected error while generating Vendor Daily MOM.",
      },
      { status: 500 }
    );
  }
}