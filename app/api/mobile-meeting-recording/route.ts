import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const SUPPORTED_EXTENSIONS = new Set([
  "mp4",
  "webm",
  "m4a",
  "mp3",
  "mpeg",
  "mpga",
  "ogg",
  "wav",
]);

function getExtension(filename: string) {
  return filename
    .split(".")
    .pop()
    ?.toLowerCase() || "";
}

function groqErrorMessage(raw: string) {
  const lower = raw.toLowerCase();

  if (
    lower.includes("file too large") ||
    lower.includes("request too large") ||
    lower.includes("413")
  ) {
    return "The recording is too large for the current transcription limit. Please use a shorter recording or lower recording quality.";
  }

  if (
    lower.includes("unsupported") ||
    lower.includes("format")
  ) {
    return "This recording format is not supported by the transcription service.";
  }

  return `Transcription failed: ${raw}`;
}

export async function POST(req: NextRequest) {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  const groqKey =
    process.env.GROQ_API_KEY;

  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    !serviceRoleKey
  ) {
    return NextResponse.json(
      {
        error:
          "Supabase server configuration is incomplete.",
      },
      { status: 500 }
    );
  }

  if (!groqKey) {
    return NextResponse.json(
      {
        error:
          "GROQ_API_KEY is not configured.",
      },
      { status: 500 }
    );
  }

  /*
   * ----------------------------------------------------
   * AUTHENTICATION
   * ----------------------------------------------------
   */

  const authHeader =
    req.headers.get("authorization");

  if (
    !authHeader ||
    !authHeader.startsWith("Bearer ")
  ) {
    return NextResponse.json(
      {
        error: "Authentication required.",
      },
      { status: 401 }
    );
  }

  const accessToken =
    authHeader.slice("Bearer ".length).trim();

  const userClient = createClient(
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
  } =
    await userClient.auth.getUser(accessToken);

  if (userError || !user) {
    return NextResponse.json(
      {
        error:
          "Invalid or expired session.",
      },
      { status: 401 }
    );
  }

  /*
   * ----------------------------------------------------
   * REQUEST BODY
   * ----------------------------------------------------
   */

  let body: {
    channel_id?: string;
    storage_path?: string;
    original_name?: string;
    mime_type?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid request body.",
      },
      { status: 400 }
    );
  }

  const channelId =
    body.channel_id?.trim();

  const storagePath =
    body.storage_path?.trim();

  const originalName =
    body.original_name?.trim() ||
    "meeting-recording";

  if (!channelId || !storagePath) {
    return NextResponse.json(
      {
        error:
          "channel_id and storage_path are required.",
      },
      { status: 400 }
    );
  }

  /*
   * ----------------------------------------------------
   * SECURITY
   * ----------------------------------------------------
   *
   * Recording must be inside:
   *
   * user-id/channel-id/file
   *
   */

  const expectedPrefix =
    `${user.id}/${channelId}/`;

  if (!storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json(
      {
        error:
          "Invalid recording path.",
      },
      { status: 403 }
    );
  }

  /*
   * ----------------------------------------------------
   * FILE TYPE
   * ----------------------------------------------------
   */

  const extension =
    getExtension(originalName);

  if (
    !SUPPORTED_EXTENSIONS.has(extension)
  ) {
    return NextResponse.json(
      {
        error:
          "This recording format is not supported. Use MP4, WebM, M4A, MP3, MPEG, OGG or WAV.",
      },
      { status: 400 }
    );
  }

  /*
   * ----------------------------------------------------
   * CHANNEL ACCESS
   * ----------------------------------------------------
   */

  const {
    data: channel,
    error: channelError,
  } = await userClient
    .from("channels")
    .select(
      "id, name, is_private"
    )
    .eq("id", channelId)
    .single();

  if (
    channelError ||
    !channel
  ) {
    return NextResponse.json(
      {
        error:
          "Channel not found or you do not have access.",
      },
      { status: 404 }
    );
  }

  /*
   * ----------------------------------------------------
   * ADMIN CLIENT
   * ----------------------------------------------------
   */

  const admin = createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const objectName =
    storagePath.split("/").pop() || "";

  /*
   * ----------------------------------------------------
   * VERIFY UPLOAD
   * ----------------------------------------------------
   */

  const {
    data: objectList,
    error: listError,
  } =
    await admin.storage
      .from("meeting-recordings")
      .list(
        `${user.id}/${channelId}`,
        {
          limit: 1000,
          search: objectName,
        }
      );

  if (listError) {
    return NextResponse.json(
      {
        error:
          `Could not verify the uploaded recording: ${listError.message}`,
      },
      { status: 500 }
    );
  }

  const uploadedObject =
    objectList?.find(
      (item) =>
        item.name === objectName
    );

  if (!uploadedObject) {
    return NextResponse.json(
      {
        error:
          "Uploaded recording was not found.",
      },
      { status: 404 }
    );
  }

  const uploadedSize =
    Number(
      uploadedObject.metadata?.size || 0
    );

  if (
    uploadedSize > MAX_FILE_SIZE
  ) {
    await admin.storage
      .from("meeting-recordings")
      .remove([storagePath]);

    return NextResponse.json(
      {
        error:
          "The recording is larger than the 100 MB processing limit.",
      },
      { status: 413 }
    );
  }

  /*
   * ----------------------------------------------------
   * PROCESS
   * ----------------------------------------------------
   */

  try {
    /*
     * Create temporary signed URL.
     *
     * The recording itself is NOT sent through
     * the Next.js request body.
     */

    const {
      data: signed,
      error: signedError,
    } =
      await admin.storage
        .from("meeting-recordings")
        .createSignedUrl(
          storagePath,
          10 * 60
        );

    if (
      signedError ||
      !signed?.signedUrl
    ) {
      throw new Error(
        `Could not create a temporary recording URL: ${
          signedError?.message ||
          "unknown error"
        }`
      );
    }

    /*
     * ------------------------------------------------
     * TRANSCRIPTION
     * ------------------------------------------------
     */

    const transcriptionForm =
      new FormData();

    transcriptionForm.append(
      "url",
      signed.signedUrl
    );

    transcriptionForm.append(
      "model",
      "whisper-large-v3"
    );

    transcriptionForm.append(
      "response_format",
      "json"
    );

    const transcriptionResponse =
      await fetch(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${groqKey}`,
          },

          body:
            transcriptionForm,
        }
      );

    if (
      !transcriptionResponse.ok
    ) {
      const raw =
        await transcriptionResponse.text();

      throw new Error(
        groqErrorMessage(raw)
      );
    }

    const transcription =
      await transcriptionResponse.json();

    const transcript =
      String(
        transcription?.text || ""
      ).trim();

    if (!transcript) {
      throw new Error(
        "No speech was detected in the meeting recording."
      );
    }

    /*
     * ------------------------------------------------
     * AI MOM
     * ------------------------------------------------
     */

    const summaryResponse =
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
                  `You are the InnoVibe meeting assistant.

Create a professional Meeting Minutes of Meeting (MOM) from the transcript.

Use these sections:

Key Discussion Points
Decisions Made
Action Items
Owners and Deadlines

Do not invent:
- names
- decisions
- owners
- deadlines

Keep the MOM concise and useful for an office team.

Ignore greetings and unrelated small talk.`,
              },

              {
                role: "user",
                content: transcript,
              },
            ],
          }),
        }
      );

    if (
      !summaryResponse.ok
    ) {
      const raw =
        await summaryResponse.text();

      throw new Error(
        `MOM generation failed: ${raw}`
      );
    }

    const summaryData =
      await summaryResponse.json();

    const summary =
      String(
        summaryData?.choices?.[0]
          ?.message?.content || ""
      ).trim();

    if (!summary) {
      throw new Error(
        "The AI did not return a meeting MOM."
      );
    }

    /*
     * ------------------------------------------------
     * SAVE MOM
     * ------------------------------------------------
     */

    const {
      error:
        summaryInsertError,
    } = await admin
      .from("call_summaries")
      .insert({
        channel_id: channelId,
        created_by: user.id,
        transcript,
        summary,
      });

    if (
      summaryInsertError
    ) {
      throw new Error(
        `The transcript was generated, but saving the meeting MOM failed: ${summaryInsertError.message}`
      );
    }

    /*
     * ------------------------------------------------
     * POST TO CHANNEL
     * ------------------------------------------------
     */

    const {
      data: message,
      error: messageError,
    } = await admin
      .from("messages")
      .insert({
        channel_id: channelId,
        sender_id: user.id,
        content:
          `📋 **Meeting MOM**\n\n${summary}`,
      })
      .select()
      .single();

    if (messageError) {
      throw new Error(
        `The MOM was generated, but posting it to the channel failed: ${messageError.message}`
      );
    }

    return NextResponse.json({
      success: true,
      transcript,
      summary,
      message_id:
        message?.id ?? null,
      channel_name:
        channel.name,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Meeting processing failed.",
      },
      { status: 500 }
    );
  } finally {
    /*
     * ------------------------------------------------
     * DELETE TEMPORARY RECORDING
     * ------------------------------------------------
     */

    await admin.storage
      .from("meeting-recordings")
      .remove([
        storagePath,
      ]);
  }
}