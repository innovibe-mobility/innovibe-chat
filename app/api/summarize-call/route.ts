import { NextRequest, NextResponse } from "next/server";

// Uses Groq's free API (console.groq.com) for both steps -- no cost,
// no credit card needed, generous free daily quota for a small team:
// 1. Whisper -- turns the uploaded recording into text
// 2. Llama   -- turns that text into a short summary
//
// This runs on the server, never in the browser, so your Groq API
// key (in .env.local as GROQ_API_KEY) is never exposed to users.

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GROQ_API_KEY is not set on the server." },
      { status: 500 }
    );
  }

  const formData = await req.formData();
  const audioFile = formData.get("audio") as File | null;
  if (!audioFile) {
    return NextResponse.json({ error: "No audio file received." }, { status: 400 });
  }

  // Step 1: transcribe the recording (free -- Whisper via Groq)
  const whisperForm = new FormData();
  whisperForm.append("file", audioFile, "call-recording.webm");
  whisperForm.append("model", "whisper-large-v3");

  const transcriptionRes = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    }
  );

  if (!transcriptionRes.ok) {
    const errText = await transcriptionRes.text();
    return NextResponse.json(
      { error: `Transcription failed: ${errText}` },
      { status: 500 }
    );
  }

  const { text: transcript } = await transcriptionRes.json();

  if (!transcript || !transcript.trim()) {
    return NextResponse.json(
      { error: "No speech was detected in the recording." },
      { status: 400 }
    );
  }

  // Step 2: summarize the transcript (free -- Llama via Groq)
  const summaryRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [
        {
          role: "system",
          content:
            "Summarize this work call transcript in a short, clear format: key points discussed, decisions made, and action items (with who's responsible, if mentioned). Keep it concise and skip small talk.",
        },
        { role: "user", content: transcript },
      ],
    }),
  });

  if (!summaryRes.ok) {
    const errText = await summaryRes.text();
    return NextResponse.json(
      { error: `Summarization failed: ${errText}` },
      { status: 500 }
    );
  }

  const summaryData = await summaryRes.json();
  const summary = summaryData.choices?.[0]?.message?.content ?? "";

  return NextResponse.json({ transcript, summary });
}
