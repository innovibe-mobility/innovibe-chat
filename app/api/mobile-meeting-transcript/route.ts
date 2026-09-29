import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const groqApiKey = process.env.GROQ_API_KEY!;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Missing authentication token." },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json(
        { error: "Invalid or expired session." },
        { status: 401 }
      );
    }

    const body = await request.json();

    const channelId = String(body.channel_id || "").trim();
    const transcript = String(body.transcript || "").trim();

    if (!channelId) {
      return NextResponse.json(
        { error: "Missing channel_id." },
        { status: 400 }
      );
    }

    if (!transcript) {
      return NextResponse.json(
        { error: "No transcript was received." },
        { status: 400 }
      );
    }

    if (transcript.length < 10) {
      return NextResponse.json(
        { error: "The transcript is too short to generate a useful MOM." },
        { status: 400 }
      );
    }

    const admin = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    // Verify that the user belongs to the channel.
    const { data: channel } = await admin
      .from("channels")
      .select("id, name, is_private")
      .eq("id", channelId)
      .maybeSingle();

    if (!channel) {
      return NextResponse.json(
        { error: "Channel not found." },
        { status: 404 }
      );
    }

    if (channel.is_private) {
      const { data: membership } = await admin
        .from("channel_members")
        .select("channel_id")
        .eq("channel_id", channelId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json(
          { error: "You do not have access to this channel." },
          { status: 403 }
        );
      }
    }

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: `
You are an accurate meeting-minutes assistant.

Create a concise professional MOM from the supplied transcript.

IMPORTANT:
- Use ONLY information present in the transcript.
- Never invent names, decisions, deadlines, tasks, or facts.
- If something is unclear, say "Not specified".
- Do not claim something happened if it is not in the transcript.

Use this format:

## Meeting Summary
Brief summary.

## Key Discussion Points
- Point 1
- Point 2

## Decisions
- Decision 1
- If none: Not specified.

## Action Items
- Person: task — deadline
- If owner or deadline is not specified, write "Owner not specified" or "Deadline not specified".

## Next Steps
- Next step 1
- If none: Not specified.
              `.trim(),
            },
            {
              role: "user",
              content: transcript,
            },
          ],
        }),
      }
    );

    const groqData = await groqResponse.json();

    if (!groqResponse.ok) {
      console.error("Groq error:", groqData);

      return NextResponse.json(
        {
          error:
            groqData?.error?.message ||
            "MOM generation failed.",
        },
        { status: 500 }
      );
    }

    const summary =
      groqData?.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      return NextResponse.json(
        { error: "Groq returned an empty MOM." },
        { status: 500 }
      );
    }

    // Save call summary.
    const { error: summaryError } = await admin
      .from("call_summaries")
      .insert({
        channel_id: channelId,
        created_by: user.id,
        transcript,
        summary,
      });

    if (summaryError) {
      console.error(
        "Failed to save call summary:",
        summaryError
      );
    }

    // Post MOM into the originating channel.
    const { error: messageError } = await admin
      .from("messages")
      .insert({
        channel_id: channelId,
        sender_id: user.id,
        content: `📋 **Meeting MOM**\n\n${summary}`,
      });

    if (messageError) {
      console.error(
        "Failed to post MOM:",
        messageError
      );

      return NextResponse.json(
        { error: "MOM was generated but could not be posted." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      summary,
      transcript,
    });
  } catch (error: any) {
    console.error(
      "Mobile meeting transcript error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Unexpected server error.",
      },
      { status: 500 }
    );
  }
}