import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: authData } = await userClient.auth.getUser(token);
    const user = authData.user;
    if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const form = await req.formData();
    const audio = form.get("audio");
    const chatId = String(form.get("chat_id") ?? "");
    const callId = String(form.get("call_id") ?? "");

    if (!(audio instanceof File) || !chatId || !callId) {
      return NextResponse.json({ error: "audio, chat_id and call_id are required." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const { data: vendorMembership } = await admin
      .from("vendor_users")
      .select("vendor_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: staff } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const { data: chat } = await admin
      .from("vendor_chats")
      .select("vendor_id")
      .eq("id", chatId)
      .maybeSingle();

    if (!chat || (staff?.role !== "ceo" && staff?.role !== "hr" && chat.vendor_id !== vendorMembership?.vendor_id)) {
      return NextResponse.json({ error: "You are not allowed to use this vendor chat." }, { status: 403 });
    }

    await admin.from("vendor_calls").update({ transcript_status: "pending" }).eq("id", callId);

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return NextResponse.json({ error: "GROQ_API_KEY is not configured." }, { status: 500 });

    const whisperForm = new FormData();
    whisperForm.append("file", audio, "vendor-call.webm");
    whisperForm.append("model", "whisper-large-v3-turbo");
    whisperForm.append("response_format", "json");

    const whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}` },
      body: whisperForm,
    });

    if (!whisperRes.ok) {
      const errorText = await whisperRes.text();
      await admin.from("vendor_calls").update({ transcript_status: "failed" }).eq("id", callId);
      return NextResponse.json({ error: `Transcription failed: ${errorText}` }, { status: 500 });
    }

    const whisperData = await whisperRes.json();
    const transcript = String(whisperData.text ?? "").trim();
    if (!transcript) {
      await admin.from("vendor_calls").update({ transcript_status: "failed" }).eq("id", callId);
      return NextResponse.json({ error: "No transcript was produced from the recorded audio." }, { status: 400 });
    }

    const summaryRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "Summarize only the supplied vendor meeting transcript. Never invent names, decisions, deadlines or action items. Return concise sections: Summary, Key Discussions, Decisions, Action Items, Follow-ups. If a section has no evidence, say None recorded.",
          },
          { role: "user", content: transcript },
        ],
      }),
    });

    if (!summaryRes.ok) {
      const errorText = await summaryRes.text();
      await admin.from("vendor_calls").update({ transcript, transcript_status: "completed" }).eq("id", callId);
      return NextResponse.json({ error: `Summary generation failed: ${errorText}`, transcript }, { status: 500 });
    }

    const summaryData = await summaryRes.json();
    const summary = String(summaryData.choices?.[0]?.message?.content ?? "").trim();

    await admin.from("vendor_calls").update({
      transcript,
      transcript_status: "completed",
      summary: summary || null,
    }).eq("id", callId);

    if (summary) {
      await admin.from("vendor_messages").insert({
        chat_id: chatId,
        sender_id: user.id,
        sender_type: "employee",
        content: `📋 Vendor meeting summary\n\n${summary}`,
      });
    }

    return NextResponse.json({ success: true, transcript, summary });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Unexpected vendor summary error." }, { status: 500 });
  }
}
