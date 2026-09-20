import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    // -----------------------------------------
    // 1. VERIFY EXISTING INNOVIBE LOGIN
    // -----------------------------------------
    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace("Bearer ", "").trim();

    if (!accessToken) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    const supabase = getSupabaseAdmin();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 }
      );
    }

    // -----------------------------------------
    // 2. CHECK GROQ
    // -----------------------------------------
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is not configured." },
        { status: 500 }
      );
    }

    // -----------------------------------------
    // 3. GET QUESTION
    // -----------------------------------------
    const { question } = await req.json();

    if (!question?.trim()) {
      return NextResponse.json(
        { error: "Please enter a question." },
        { status: 400 }
      );
    }

    // -----------------------------------------
    // 4. GET MEETING DATA
    // -----------------------------------------
    const { data: meetings, error } = await supabase
      .from("call_summaries")
      .select(
        "id, channel_id, created_by, transcript, summary, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // -----------------------------------------
    // 5. GET EMPLOYEE NAMES
    // -----------------------------------------
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, role");

    const names: Record<string, string> = {};

    for (const profile of profiles ?? []) {
      names[profile.id] = profile.full_name;
    }

    // -----------------------------------------
    // 6. BUILD AI CONTEXT
    // -----------------------------------------
    const context = (meetings ?? [])
      .map(
        (meeting: any, index: number) => `
MEETING ${index + 1}

Date:
${meeting.created_at}

Recorded by:
${names[meeting.created_by] ?? "Employee"}

Summary:
${meeting.summary ?? "No summary"}

Transcript:
${meeting.transcript ?? "No transcript"}
`
      )
      .join("\n========================\n");

    // -----------------------------------------
    // 7. ASK GROQ
    // -----------------------------------------
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          temperature: 0.15,
          messages: [
            {
              role: "system",
              content: `
You are InnoVibe AI, an internal company meeting assistant.

Use ONLY the meeting information supplied by the system.

Never invent:
- employees
- meetings
- decisions
- deadlines
- action items
- events

If the information is unavailable, say so.

Answer professionally and clearly.

When the user asks for MOM, provide:
1. Meetings
2. Key discussions
3. Decisions
4. Action items
5. Responsible employees
6. Deadlines
7. Pending issues
8. Follow-ups
`,
            },
            {
              role: "user",
              content: `
MEETING INFORMATION:

${context || "No meeting information is available."}

USER QUESTION:

${question}
`,
            },
          ],
        }),
      }
    );

    // -----------------------------------------
    // 8. HANDLE GROQ ERROR
    // -----------------------------------------
    if (!response.ok) {
      const errorText = await response.text();

      return NextResponse.json(
        { error: errorText },
        { status: 500 }
      );
    }

    const result = await response.json();

    // -----------------------------------------
    // 9. RETURN ANSWER
    // -----------------------------------------
    return NextResponse.json({
      answer:
        result.choices?.[0]?.message?.content ??
        "No answer could be generated.",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message ?? "Unexpected server error.",
      },
      { status: 500 }
    );
  }
}