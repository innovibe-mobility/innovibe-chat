"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Vendor = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  logo_url: string | null;
  status: string;
  must_change_password: boolean;
};

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_type: "vendor" | "employee";
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  updated_at?: string | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
  parent_message_id?: string | null;
  forwarded_from_message_id?: string | null;
};

type ReactionRow = {
  message_id: string;
  user_id: string;
  reaction: string;
};

type ReadRow = {
  message_id: string;
  user_id: string;
  read_at: string;
};

const REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "✅"];

export default function VendorWorkspacePage() {
  const router = useRouter();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [openingFile, setOpeningFile] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [reactionRows, setReactionRows] = useState<ReactionRow[]>([]);
  const [readRows, setReadRows] = useState<ReadRow[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [showPinned, setShowPinned] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showCall, setShowCall] = useState(false);
  const [callType, setCallType] = useState<"audio" | "video">("video");
  const [callId, setCallId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showMOMDate, setShowMOMDate] = useState(false);
  const [momDate, setMomDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  const loadMessageExtras = useCallback(async (ids: string[], currentUserId: string) => {
    if (!ids.length) {
      setReactionRows([]);
      setReadRows([]);
      setPinnedIds([]);
      setUnreadCount(0);
      return;
    }

    const [{ data: reactions }, { data: reads }, { data: pins }] = await Promise.all([
      supabase
        .from("vendor_message_reactions")
        .select("message_id, user_id, reaction")
        .in("message_id", ids),
      supabase
        .from("vendor_message_reads")
        .select("message_id, user_id, read_at")
        .in("message_id", ids),
      supabase
        .from("vendor_pinned_messages")
        .select("message_id")
        .in("message_id", ids),
    ]);

    const nextReads = (reads ?? []) as ReadRow[];
    setReactionRows((reactions ?? []) as ReactionRow[]);
    setReadRows(nextReads);
    setPinnedIds((pins ?? []).map((p: { message_id: string }) => p.message_id));

    const unread = messages.filter(
      (m) =>
        m.sender_id !== currentUserId &&
        !nextReads.some((r) => r.message_id === m.id && r.user_id === currentUserId)
    ).length;
    setUnreadCount(unread);
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (!session) {
        router.replace("/vendor-login");
        return;
      }

      setUserId(session.user.id);

      const { data: vendorData, error: vendorError } = await supabase
        .from("vendors")
        .select(
          "id, company_name, contact_name, email, logo_url, status, must_change_password"
        )
        .eq("auth_user_id", session.user.id)
        .maybeSingle();

      if (vendorError || !vendorData) {
        await supabase.auth.signOut();
        router.replace("/vendor-login");
        return;
      }

      if (vendorData.status !== "approved") {
        await supabase.auth.signOut();
        router.replace("/vendor-login");
        return;
      }

      if (vendorData.must_change_password) {
        router.replace("/vendor-change-password");
        return;
      }

      const { data: chat, error: chatError } = await supabase
        .from("vendor_chats")
        .select("id")
        .eq("vendor_id", vendorData.id)
        .single();

      if (chatError || !chat) {
        console.error(chatError);
        setLoading(false);
        return;
      }

      const { data: messageData, error: messagesError } = await supabase
        .from("vendor_messages")
        .select("*")
        .eq("chat_id", chat.id)
        .order("created_at", { ascending: true });

      if (messagesError) console.error(messagesError);
      if (cancelled) return;

      setVendor(vendorData as Vendor);
      setChatId(chat.id);
      setMessages((messageData ?? []) as Message[]);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!chatId || !userId) return;

    const channel = supabase
      .channel(`vendor-chat-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vendor_messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          if (payload.eventType === "INSERT") {
            setMessages((prev) =>
              prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
            );

            if (incoming.sender_id !== userId && document.hidden) {
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification(vendor?.company_name ?? "Vendor Chat", {
                  body: incoming.content ?? "New vendor chat message",
                });
              }
            }
          } else if (payload.eventType === "UPDATE") {
            setMessages((prev) =>
              prev.map((m) => (m.id === incoming.id ? incoming : m))
            );
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId, userId, vendor?.company_name]);

  useEffect(() => {
    if (!chatId || !userId) return;
    void loadMessageExtras(messages.map((m) => m.id), userId);
  }, [chatId, userId, messages, loadMessageExtras]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  async function markAllRead() {
    if (!userId) return;
    const incoming = messages.filter((m) => m.sender_id !== userId && !m.is_deleted);
    for (const message of incoming) {
      await supabase.from("vendor_message_reads").insert({
        message_id: message.id,
        user_id: userId,
      });
    }
    setUnreadCount(0);
    await loadMessageExtras(messages.map((m) => m.id), userId);
  }

  async function openAttachment(message: Message) {
    if (!message.file_url) return;
    setOpeningFile(message.id);
    try {
      const { data, error } = await supabase.storage
        .from("vendor-chat-files")
        .createSignedUrl(message.file_url, 60 * 60);
      if (error || !data?.signedUrl) {
        alert(error?.message ?? "Could not open this attachment.");
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setOpeningFile(null);
    }
  }

  async function sendMessage() {
    if (!chatId || !userId || (!draft.trim() && !file)) return;
    setSending(true);

    let fileUrl: string | null = null;
    let fileName: string | null = null;

    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${chatId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("vendor-chat-files")
        .upload(path, file);
      if (uploadError) {
        alert(uploadError.message);
        setSending(false);
        return;
      }
      fileUrl = path;
      fileName = file.name;
    }

    const { data: sent, error } = await supabase
      .from("vendor_messages")
      .insert({
        chat_id: chatId,
        sender_id: userId,
        sender_type: "vendor",
        content: draft.trim() || null,
        file_url: fileUrl,
        file_name: fileName,
        parent_message_id: replyingTo?.id ?? null,
      })
      .select("*")
      .single();

    if (error) {
      alert(error.message);
    } else if (sent) {
      setMessages((prev) =>
        prev.some((m) => m.id === sent.id) ? prev : [...prev, sent as Message]
      );
      setDraft("");
      setFile(null);
      setReplyingTo(null);
    }

    setSending(false);
  }

  async function saveEdit(message: Message) {
    if (!userId || !editingText.trim()) return;
    const { data, error } = await supabase
      .from("vendor_messages")
      .update({ content: editingText.trim(), updated_at: new Date().toISOString() })
      .eq("id", message.id)
      .eq("sender_id", userId)
      .select("*")
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    if (data) setMessages((prev) => prev.map((m) => (m.id === message.id ? (data as Message) : m)));
    setEditingId(null);
    setEditingText("");
  }

  async function deleteMessage(message: Message) {
    if (!userId) return;
    if (!window.confirm("Delete this message? It will remain in the audit history as deleted.")) return;
    const { data, error } = await supabase
      .from("vendor_messages")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        content: null,
        file_url: null,
        file_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", message.id)
      .eq("sender_id", userId)
      .select("*")
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    if (data) setMessages((prev) => prev.map((m) => (m.id === message.id ? (data as Message) : m)));
  }

  async function toggleReaction(messageId: string, reaction: string) {
    if (!userId) return;
    const mine = reactionRows.some(
      (r) => r.message_id === messageId && r.user_id === userId && r.reaction === reaction
    );
    if (mine) {
      await supabase
        .from("vendor_message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", userId)
        .eq("reaction", reaction);
    } else {
      await supabase.from("vendor_message_reactions").insert({
        message_id: messageId,
        user_id: userId,
        reaction,
      });
    }
    await loadMessageExtras(messages.map((m) => m.id), userId);
  }

  async function togglePin(messageId: string) {
    if (!userId) return;
    if (pinnedIds.includes(messageId)) {
      await supabase.from("vendor_pinned_messages").delete().eq("message_id", messageId);
    } else {
      await supabase.from("vendor_pinned_messages").upsert({
        message_id: messageId,
        pinned_by: userId,
        pinned_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }
    await loadMessageExtras(messages.map((m) => m.id), userId);
  }

  async function startCall(type: "audio" | "video") {
    if (!chatId || !userId) return;
    const room = `innovibe-vendor-${chatId}-${crypto.randomUUID()}`;
    const { data, error } = await supabase
      .from("vendor_calls")
      .insert({
        chat_id: chatId,
        initiated_by: userId,
        call_type: type,
        jitsi_room_name: room,
      })
      .select("id, started_at")
      .single();
    if (error || !data) {
      alert(error?.message ?? "Could not start the call.");
      return;
    }
    await supabase.from("vendor_call_participants").insert({
      call_id: data.id,
      user_id: userId,
    });
    setCallId(data.id);
    setCallStartedAt(data.started_at);
    setCallType(type);
    setRoomName(room);
    setShowCall(true);
  }

  async function endCall() {
    if (!callId || !callStartedAt) {
      setShowCall(false);
      return;
    }
    const endedAt = new Date();
    const duration = Math.max(0, Math.floor((endedAt.getTime() - new Date(callStartedAt).getTime()) / 1000));
    await supabase
      .from("vendor_calls")
      .update({
        status: "ended",
        ended_at: endedAt.toISOString(),
        duration_seconds: duration,
      })
      .eq("id", callId);
    if (userId) {
      await supabase
        .from("vendor_call_participants")
        .update({ left_at: endedAt.toISOString() })
        .eq("call_id", callId)
        .eq("user_id", userId)
        .is("left_at", null);
    }
    setShowCall(false);
    setCallId(null);
    setRoomName(null);
    setCallStartedAt(null);
  }

  async function startRecording() {
    if (!callId) return;
    const confirmed = window.confirm(
      "This records the call audio from the shared browser tab and sends the recording for transcription and AI summarization. Make sure everyone knows the call is being recorded. Continue?"
    );
    if (!confirmed) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        alert('No audio was shared. Select "Share tab audio" or "Share system audio" in the browser picker.');
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const audioStream = new MediaStream(audioTracks);
      const recorder = new MediaRecorder(audioStream);
      recordedChunksRef.current = [];
      recordingStreamRef.current = stream;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (error: any) {
      alert(`Could not start recording: ${error?.message ?? "permission denied"}`);
    }
  }

  async function stopRecordingAndSummarize() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || !callId || !chatId) return;
    setIsRecording(false);
    setIsSummarizing(true);

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    mediaRecorderRef.current = null;

    const audioBlob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Please log in again.");
      const form = new FormData();
      form.append("audio", audioBlob, "vendor-call.webm");
      form.append("chat_id", chatId);
      form.append("call_id", callId);
      const response = await fetch("/api/vendor/summarize-call", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not summarize the call.");
      if (result.summary) alert("Call transcription and AI summary completed and posted to the vendor chat.");
    } catch (error: any) {
      alert(error?.message ?? "Could not summarize the call.");
    } finally {
      setIsSummarizing(false);
    }
  }

  async function generateMOM() {
    if (!chatId) return;
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error("Please log in again.");
      const response = await fetch("/api/vendor/daily-mom", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ chat_id: chatId, date: momDate }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not generate Vendor MOM.");
      setShowMOMDate(false);
      alert(`Vendor Daily MOM for ${result.date} was generated and posted to the chat.`);
    } catch (error: any) {
      alert(error?.message ?? "Could not generate Vendor MOM.");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/vendor-login");
  }

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((message) =>
      `${message.content ?? ""} ${message.file_name ?? ""}`.toLowerCase().includes(q)
    );
  }, [messages, searchQuery]);

  function reactionSummary(messageId: string) {
    return REACTIONS.map((reaction) => {
      const rows = reactionRows.filter(
        (row) => row.message_id === messageId && row.reaction === reaction
      );
      if (!rows.length) return null;
      return {
        reaction,
        count: rows.length,
        mine: userId ? rows.some((row) => row.user_id === userId) : false,
      };
    }).filter(Boolean) as { reaction: string; count: number; mine: boolean }[];
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EEF4F9] flex items-center justify-center text-sm text-[#718596]">
        Loading your vendor workspace...
      </div>
    );
  }

  if (!vendor) return null;

  return (
    <main className="h-screen bg-[#EEF4F9] flex flex-col text-[#0F2438]">
      <header className="bg-[#0E2A40] text-white px-4 md:px-8 py-3 flex items-center justify-between shadow-lg gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-white flex items-center justify-center overflow-hidden">
            {vendor.logo_url ? (
              <img src={vendor.logo_url} alt={vendor.company_name} className="h-full w-full object-contain" />
            ) : (
              <span className="text-xl">🏢</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm md:text-base truncate">{vendor.company_name}</p>
            <p className="text-[10px] uppercase tracking-[0.15em] text-[#7FB6C9]">Private Vendor Workspace</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          <button onClick={() => { setShowSearch((v) => !v); setShowPinned(false); }} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15">🔎</button>
          <button onClick={() => setShowPinned((v) => !v)} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15">📌 {pinnedIds.length || ""}</button>
          <button onClick={() => { setMomDate(new Date().toISOString().slice(0, 10)); setShowMOMDate(true); }} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15">📋 MOM</button>
          <button onClick={() => void startCall("audio")} className="rounded-lg bg-[#26648B] px-3 py-2 text-xs font-semibold hover:bg-[#1F5578]">📞</button>
          <button onClick={() => void startCall("video")} className="rounded-lg bg-[#53A8D7] px-3 py-2 text-xs font-semibold hover:bg-[#4296C5]">📹</button>
          <button onClick={signOut} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15">Sign out</button>
        </div>
      </header>

      <div className="flex-1 max-w-6xl w-full mx-auto p-3 md:p-6 flex flex-col min-h-0">
        <section className="flex-1 min-h-0 bg-white rounded-3xl border border-white shadow-[0_20px_60px_-25px_rgba(15,36,56,0.25)] overflow-hidden flex flex-col">
          <div className="px-4 md:px-5 py-3 border-b border-[#E7EEF3] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold">InnoVibe Support Chat</p>
              <p className="text-xs text-[#718596] mt-1">Private conversation for {vendor.company_name}.</p>
            </div>
            <div className="text-xs text-[#718596] shrink-0">{unreadCount > 0 ? `${unreadCount} unread` : "Up to date"}</div>
          </div>

          {showSearch && (
            <div className="px-4 py-2 border-b border-[#E7EEF3] bg-[#F8FBFD]">
              <input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search this vendor conversation..." className="w-full rounded-xl border border-[#D8E4EC] px-3 py-2 text-sm outline-none focus:border-[#53D2DB]" />
            </div>
          )}

          {showPinned && (
            <div className="px-4 py-3 border-b border-[#E7EEF3] bg-[#FFFDF5]">
              <p className="text-xs font-bold mb-2">Pinned messages</p>
              {pinnedIds.length === 0 ? <p className="text-xs text-[#8395A3]">No pinned messages.</p> : pinnedIds.map((id) => {
                const message = messages.find((m) => m.id === id);
                if (!message) return null;
                return <button key={id} onClick={() => document.getElementById(`vendor-message-${id}`)?.scrollIntoView({ behavior: "smooth" })} className="block w-full text-left text-xs py-1 hover:underline truncate">📌 {message.content ?? message.file_name ?? "Pinned message"}</button>;
              })}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3" onClick={() => void markAllRead()}>
            {filteredMessages.length === 0 && (
              <div className="h-full flex items-center justify-center text-center">
                <div>
                  <div className="h-14 w-14 mx-auto rounded-2xl bg-[#EEF4F9] flex items-center justify-center text-2xl">💬</div>
                  <p className="mt-3 font-semibold">{searchQuery ? "No matching messages" : "Start your conversation with InnoVibe"}</p>
                  <p className="mt-1 text-xs text-[#8395A3]">Ask questions, share updates, or send documents here.</p>
                </div>
              </div>
            )}

            {filteredMessages.map((message) => {
              const mine = message.sender_type === "vendor";
              const parent = message.parent_message_id ? messages.find((m) => m.id === message.parent_message_id) : null;
              const reactions = reactionSummary(message.id);
              const readBySomeoneElse = mine && readRows.some((row) => row.message_id === message.id && row.user_id !== userId);

              return (
                <div id={`vendor-message-${message.id}`} key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[88%] md:max-w-[75%]">
                    <div className={`rounded-2xl px-4 py-3 ${mine ? "bg-[#26648B] text-white rounded-br-sm" : "bg-[#F1F5F8] text-[#0F2438] rounded-bl-sm"}`}>
                      <p className="text-[11px] opacity-65 mb-1">{mine ? "You" : "InnoVibe"}</p>

                      {parent && !message.is_deleted && (
                        <div className={`mb-2 rounded-lg px-2 py-1 text-[11px] border-l-2 ${mine ? "bg-white/10 border-white/50" : "bg-white border-[#26648B]"}`}>
                          Replying to: {parent.content ?? parent.file_name ?? "attachment"}
                        </div>
                      )}

                      {message.is_deleted ? (
                        <p className="text-sm italic opacity-60">This message was deleted.</p>
                      ) : editingId === message.id ? (
                        <div className="space-y-2">
                          <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} className="w-full rounded-lg border border-[#D8E4EC] px-2 py-2 text-sm text-[#0F2438]" rows={3} />
                          <div className="flex gap-2">
                            <button onClick={() => void saveEdit(message)} className="rounded-lg bg-white/20 px-3 py-1.5 text-xs font-bold">Save</button>
                            <button onClick={() => setEditingId(null)} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        message.content && <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                      )}

                      {!message.is_deleted && message.file_url && (
                        <button type="button" onClick={() => void openAttachment(message)} disabled={openingFile === message.id} className="mt-2 block text-xs underline text-left hover:opacity-80 disabled:opacity-50">
                          📎 {openingFile === message.id ? "Opening..." : message.file_name ?? "Attachment"}
                        </button>
                      )}

                      <div className="text-[10px] opacity-50 mt-2 flex items-center gap-2">
                        <span>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {message.updated_at && <span>(edited)</span>}
                        {readBySomeoneElse && <span>✓✓ Read</span>}
                      </div>
                    </div>

                    {!message.is_deleted && (
                      <div className="flex flex-wrap items-center gap-1 mt-1 px-1">
                        {reactions.map((item) => (
                          <button key={item.reaction} onClick={() => void toggleReaction(message.id, item.reaction)} className={`rounded-full border px-2 py-0.5 text-[11px] ${item.mine ? "bg-[#E7F4FA] border-[#53A8D7]" : "bg-white border-[#D8E4EC]"}`}>
                            {item.reaction} {item.count}
                          </button>
                        ))}
                        <button onClick={() => void toggleReaction(message.id, "👍")} className="rounded-full border border-[#D8E4EC] bg-white px-2 py-0.5 text-[11px]">＋😀</button>
                        <button onClick={() => setReplyingTo(message)} className="rounded-full border border-[#D8E4EC] bg-white px-2 py-0.5 text-[11px]">↩ Reply</button>
                        <button onClick={() => void togglePin(message.id)} className="rounded-full border border-[#D8E4EC] bg-white px-2 py-0.5 text-[11px]">{pinnedIds.includes(message.id) ? "📌 Unpin" : "📌 Pin"}</button>
                        {mine && (
                          <>
                            <button onClick={() => { setEditingId(message.id); setEditingText(message.content ?? ""); }} className="rounded-full border border-[#D8E4EC] bg-white px-2 py-0.5 text-[11px]">✏️ Edit</button>
                            <button onClick={() => void deleteMessage(message)} className="rounded-full border border-red-200 bg-white px-2 py-0.5 text-[11px] text-red-600">🗑 Delete</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-[#E7EEF3] p-3 md:p-4">
            {replyingTo && (
              <div className="mb-2 flex items-center justify-between rounded-lg bg-[#EEF7FA] px-3 py-2 text-xs">
                <span className="truncate">Replying to: {replyingTo.content ?? replyingTo.file_name ?? "attachment"}</span>
                <button onClick={() => setReplyingTo(null)} className="text-red-500">×</button>
              </div>
            )}

            {file && (
              <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-[#EEF7FA] px-3 py-2 text-xs">
                📎 {file.name}
                <button onClick={() => setFile(null)} className="text-red-500">×</button>
              </div>
            )}

            <div className="flex gap-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} placeholder={replyingTo ? "Write a reply..." : "Type a message..."} className="flex-1 min-w-0 rounded-xl border border-[#D8E4EC] px-4 py-3 text-sm outline-none focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/10" />
              <input id="vendor-file" type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <label htmlFor="vendor-file" className="cursor-pointer rounded-xl border border-[#D8E4EC] bg-white px-4 py-3 text-sm hover:bg-[#F7FAFC]" title="Attach file">📎</label>
              <button onClick={() => void sendMessage()} disabled={sending || (!draft.trim() && !file)} className="rounded-xl bg-[#26648B] text-white px-5 text-sm font-bold disabled:opacity-50">{sending ? "..." : "Send"}</button>
            </div>
          </div>
        </section>
      </div>

      {showMOMDate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="font-bold text-lg">Generate Vendor Daily MOM</h2>
            <p className="text-xs text-[#718596] mt-1">Uses only this vendor chat and recorded vendor-call summaries.</p>
            <input type="date" value={momDate} onChange={(e) => setMomDate(e.target.value)} className="mt-4 w-full rounded-xl border border-[#D8E4EC] px-3 py-2 text-sm" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowMOMDate(false)} className="rounded-lg border px-3 py-2 text-sm">Cancel</button>
              <button onClick={() => void generateMOM()} className="rounded-lg bg-[#26648B] text-white px-4 py-2 text-sm font-bold">Generate</button>
            </div>
          </div>
        </div>
      )}

      {showCall && roomName && (
        <div className="fixed inset-0 z-50 bg-[#050914]/90 flex flex-col">
          <div className="px-4 py-3 bg-[#0E2A40] text-white flex items-center justify-between gap-3">
            <div>
              <p className="font-bold">{callType === "video" ? "Video" : "Audio"} Call</p>
              <p className="text-[11px] text-white/60">Free Jitsi call • vendor-private room</p>
            </div>
            <div className="flex items-center gap-2">
              {!isRecording ? (
                <button onClick={() => void startRecording()} className="rounded-lg bg-[#F1C75B] text-[#352A0B] px-3 py-2 text-xs font-bold">🎙 Record</button>
              ) : (
                <button onClick={() => void stopRecordingAndSummarize()} disabled={isSummarizing} className="rounded-lg bg-red-500 text-white px-3 py-2 text-xs font-bold">{isSummarizing ? "Summarizing..." : "⏹ Stop & Summarize"}</button>
              )}
              <button onClick={() => void endCall()} className="rounded-lg bg-red-600 text-white px-3 py-2 text-xs font-bold">End Call</button>
            </div>
          </div>
          <div className="flex-1 p-2 md:p-4">
            <iframe
              title="InnoVibe Vendor Jitsi Call"
              src={`https://meet.jit.si/${roomName}#config.startWithAudioMuted=false&config.startWithVideoMuted=${callType === "audio" ? "true" : "false"}`}
              className="w-full h-full rounded-2xl border border-white/10 bg-black"
              allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
            />
          </div>
        </div>
      )}
    </main>
  );
}
