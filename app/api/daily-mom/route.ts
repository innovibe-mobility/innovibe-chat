import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const groqKey = process.env.GROQ_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!groqKey) {
      return NextResponse.json(
        {
          error: "GROQ_API_KEY is not configured.",
        },
        { status: 500 }
      );
    }

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          error:
            "Supabase environment variables are not configured.",
        },
        { status: 500 }
      );
    }

    // =========================================================
    // AUTHENTICATION
    // =========================================================

    const authHeader = req.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        {
          error: "Authentication required.",
        },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(accessToken);

    if (userError || !user) {
      return NextResponse.json(
        {
          error: "Invalid or expired session.",
        },
        { status: 401 }
      );
    }

    // =========================================================
    // REQUEST
    // =========================================================

    const body = await req.json();

    const channelId = body.channel_id;
    const momDate = body.date;

    if (!channelId) {
      return NextResponse.json(
        {
          error: "channel_id is required.",
        },
        { status: 400 }
      );
    }

    if (!momDate) {
      return NextResponse.json(
        {
          error:
            "date is required. Use YYYY-MM-DD.",
        },
        { status: 400 }
      );
    }

    // =========================================================
    // DATE RANGE — INDIA / IST
    // =========================================================

    const startUtc = new Date(
      `${momDate}T00:00:00+05:30`
    );

    const endUtc = new Date(
      `${momDate}T23:59:59.999+05:30`
    );

    // =========================================================
    // CHANNEL
    // =========================================================

    const {
      data: channel,
      error: channelError,
    } = await supabase
      .from("channels")
      .select(
        "id, name, description, is_private"
      )
      .eq("id", channelId)
      .single();

    if (channelError || !channel) {
      return NextResponse.json(
        {
          error:
            "Channel not found or you do not have access.",
        },
        { status: 404 }
      );
    }

    // =========================================================
    // 1. FETCH CHAT MESSAGES
    // =========================================================

    const {
      data: messages,
      error: messagesError,
    } = await supabase
      .from("messages")
      .select(
        "id, sender_id, content, file_name, created_at, is_deleted"
      )
      .eq("channel_id", channelId)
      .gte(
        "created_at",
        startUtc.toISOString()
      )
      .lte(
        "created_at",
        endUtc.toISOString()
      )
      .order("created_at", {
        ascending: true,
      });

    if (messagesError) {
      return NextResponse.json(
        {
          error:
            `Could not load chat messages: ${messagesError.message}`,
        },
        { status: 500 }
      );
    }

    // =========================================================
    // 2. FETCH MEETING SUMMARIES
    // =========================================================
    //
    // call_summaries columns:
    //
    // id
    // channel_id
    // created_by
    // transcript
    // summary
    // created_at
    //
    // =========================================================

    const {
      data: meetingSummaries,
      error: meetingsError,
    } = await supabase
      .from("call_summaries")
      .select(
        "id, channel_id, created_by, transcript, summary, created_at"
      )
      .eq("channel_id", channelId)
      .gte(
        "created_at",
        startUtc.toISOString()
      )
      .lte(
        "created_at",
        endUtc.toISOString()
      )
      .order("created_at", {
        ascending: true,
      });

    if (meetingsError) {
      return NextResponse.json(
        {
          error:
            `Could not load meeting summaries: ${meetingsError.message}`,
        },
        { status: 500 }
      );
    }

    // =========================================================
    // 3. FETCH EMPLOYEE NAMES FOR CHAT MESSAGES
    // =========================================================

    const senderIds = [
      ...new Set(
        (messages ?? [])
          .map(
            (message) =>
              message.sender_id
          )
          .filter(Boolean)
      ),
    ];

    let profileMap: Record<
      string,
      {
        name: string;
        role: string;
      }
    > = {};

    if (senderIds.length > 0) {
      const {
        data: profiles,
      } = await supabase
        .from("profiles")
        .select(
          "id, full_name, role"
        )
        .in("id", senderIds);

      (profiles ?? []).forEach(
        (profile: any) => {
          profileMap[profile.id] = {
            name:
              profile.full_name ??
              "Employee",
            role:
              profile.role ??
              "employee",
          };
        }
      );
    }

    // =========================================================
    // 4. FORMAT CHAT DATA
    // =========================================================

    const chatConversation = (
      messages ?? []
    )
      .filter(
        (message) =>
          !message.is_deleted
      )
      .map((message) => {
        const sender =
          profileMap[
            message.sender_id
          ]?.name ?? "Employee";

        const time = new Date(
          message.created_at
        ).toLocaleTimeString(
          "en-IN",
          {
            timeZone:
              "Asia/Kolkata",
            hour: "2-digit",
            minute: "2-digit",
          }
        );

        let content =
          message.content?.trim() ??
          "";

        if (
          !content &&
          message.file_name
        ) {
          content =
            `[File shared: ${message.file_name}]`;
        }

        if (!content) {
          content =
            "[Message with no text]";
        }

        return `[${time}] ${sender}: ${content}`;
      })
      .join("\n");

    // =========================================================
    // 5. FORMAT MEETING DATA
    // =========================================================

    const meetingConversation =
      (meetingSummaries ?? [])
        .map(
          (
            meeting,
            index
          ) => {
            const time =
              new Date(
                meeting.created_at
              ).toLocaleTimeString(
                "en-IN",
                {
                  timeZone:
                    "Asia/Kolkata",
                  hour: "2-digit",
                  minute:
                    "2-digit",
                }
              );

            return `
MEETING ${index + 1}
Time: ${time}

MEETING SUMMARY:
${
  meeting.summary ||
  "No summary available."
}

MEETING TRANSCRIPT:
${
  meeting.transcript ||
  "No transcript available."
}
`;
          }
        )
        .join("\n");

    // =========================================================
    // 6. CHECK WHETHER THERE IS ANY INFORMATION
    // =========================================================

    const chatCount =
      messages?.length ?? 0;

    const meetingCount =
      meetingSummaries?.length ?? 0;

    if (
      chatCount === 0 &&
      meetingCount === 0
    ) {
      return NextResponse.json(
        {
          error:
            "There are no chat messages or meeting summaries for this day.",
        },
        { status: 400 }
      );
    }

    // =========================================================
    // 7. SEND EVERYTHING TO GROQ
    // =========================================================

    const systemPrompt = `
You are the Daily MOM assistant for an internal company communication system.

Create one professional Daily MOM from TWO sources:

1. Workplace chat messages
2. Recorded meeting summaries and transcripts

The Daily MOM must combine both sources into one coherent report.

IMPORTANT RULES:

- Only use information actually present in the supplied data.
- Never invent names, decisions, deadlines, tasks, numbers or events.
- Do not treat casual chat as an important business decision unless the conversation clearly indicates it.
- Remove duplicate information when the same topic appears in both a meeting and chat.
- Prioritize actual meetings, decisions, action items and important work updates.
- Mention useful chat updates separately when they add information not covered by meetings.
- Ignore greetings and small talk.

Return exactly these sections:

## Daily MOM

Give a concise overview of the day's important work.

## Meetings

Summarize the important meetings that occurred.
Mention the meeting time when useful.

## Key Discussions

List the important topics discussed across meetings and chat.

## Decisions Made

List decisions that were actually made.

If there were none:
No specific decisions recorded.

## Action Items

List:

- Task — Responsible person — Deadline if explicitly mentioned.

Never invent responsibility or deadlines.

If none:
No specific action items recorded.

## Important Updates

List important progress updates, announcements, issues, files or status changes from the day's work.

## Follow-ups

List things that clearly require future discussion or follow-up.

If none:
No follow-ups identified.

Keep the report professional, concise and easy to scan.
`;

    const userPrompt = `
CHANNEL:
${channel.name}

DATE:
${momDate}

CHAT MESSAGES ANALYZED:
${chatCount}

MEETINGS FOUND:
${meetingCount}

==================================================
CHAT ACTIVITY
==================================================

${
  chatConversation ||
  "No chat messages found."
}


==================================================
MEETING ACTIVITY
==================================================

${
  meetingConversation ||
  "No meeting summaries found."
}
`;

    // =========================================================
    // 8. GROQ AI
    // =========================================================

    const summaryRes =
      await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${groqKey}`,
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            model:
              "openai/gpt-oss-20b",

            temperature: 0.2,

            messages: [
              {
                role: "system",
                content:
                  systemPrompt,
              },
              {
                role: "user",
                content:
                  userPrompt,
              },
            ],
          }),
        }
      );

    if (!summaryRes.ok) {
      const errorText =
        await summaryRes.text();

      return NextResponse.json(
        {
          error:
            `Daily MOM generation failed: ${errorText}`,
        },
        { status: 500 }
      );
    }

    const summaryData =
      await summaryRes.json();

    const momContent =
      summaryData.choices?.[0]
        ?.message?.content
        ?.trim() ?? "";

    if (!momContent) {
      return NextResponse.json(
        {
          error:
            "AI returned an empty Daily MOM.",
        },
        { status: 500 }
      );
    }

    // =========================================================
    // 9. SAVE DAILY MOM
    // =========================================================

    /*
     * Daily MOM is a shared channel/date report.
     *
     * The employee is already authenticated above and has
     * successfully accessed the requested channel.
     *
     * We use the server-side service-role client ONLY for the
     * final save because the existing RLS update policy
     * intentionally prevents one employee from updating a
     * MOM originally created by another employee.
     *
     * We do NOT disable RLS and we do NOT change the existing
     * database policies.
     */

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceRoleKey) {
      return NextResponse.json(
        {
          error:
            "SUPABASE_SERVICE_ROLE_KEY is not configured.",
        },
        { status: 500 }
      );
    }

    const adminSupabase =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            autoRefreshToken:
              false,
            persistSession:
              false,
          },
        }
      );

    // ---------------------------------------------------------
    // Check whether a MOM already exists for this
    // channel + date.
    // ---------------------------------------------------------

    const {
      data: existingMom,
      error: existingMomError,
    } = await adminSupabase
      .from("daily_moms")
      .select(
        "id, created_by"
      )
      .eq(
        "channel_id",
        channelId
      )
      .eq(
        "mom_date",
        momDate
      )
      .maybeSingle();

    if (existingMomError) {
      return NextResponse.json(
        {
          error:
            `Could not check existing Daily MOM: ${existingMomError.message}`,
        },
        { status: 500 }
      );
    }

    let savedMom;

    // ---------------------------------------------------------
    // EXISTING MOM
    // ---------------------------------------------------------

    if (existingMom) {
      /*
       * Update the existing shared MOM.
       *
       * IMPORTANT:
       * We intentionally do NOT update created_by.
       * The original creator remains the creator.
       */

      const {
        data,
        error,
      } = await adminSupabase
        .from("daily_moms")
        .update({
          title:
            `Daily MOM — ${momDate}`,

          content:
            momContent,

          source_message_count:
            chatCount +
            meetingCount,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          existingMom.id
        )
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          {
            error:
              `Could not update Daily MOM: ${error.message}`,
          },
          { status: 500 }
        );
      }

      savedMom = data;
    }

    // ---------------------------------------------------------
    // NEW MOM
    // ---------------------------------------------------------

    else {
      /*
       * No MOM exists yet for this channel/date.
       *
       * The currently authenticated employee becomes the
       * creator of the new MOM.
       */

      const {
        data,
        error,
      } = await adminSupabase
        .from("daily_moms")
        .insert({
          channel_id:
            channelId,

          mom_date:
            momDate,

          created_by:
            user.id,

          title:
            `Daily MOM — ${momDate}`,

          content:
            momContent,

          source_message_count:
            chatCount +
            meetingCount,

          updated_at:
            new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json(
          {
            error:
              `Could not create Daily MOM: ${error.message}`,
          },
          { status: 500 }
        );
      }

      savedMom = data;
    }

    // =========================================================
    // 10. RETURN
    // =========================================================

    return NextResponse.json({
      success: true,

      mom: savedMom,

      date: momDate,

      channel:
        channel.name,

      chat_messages:
        chatCount,

      meetings:
        meetingCount,

      total_sources:
        chatCount +
        meetingCount,
    });
  } catch (error: any) {
    console.error(
      "Daily MOM error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ??
          "Unexpected error while generating Daily MOM.",
      },
      { status: 500 }
    );
  }
}