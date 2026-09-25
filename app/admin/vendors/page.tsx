"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Application = {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  logo_url: string | null;
  website: string | null;
  category: string | null;
  status: string;
  created_at: string;
};

type Vendor = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  logo_url: string | null;
  status: string;
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
  deleted_at?: string | null;
  parent_message_id?: string | null;
};

type Reaction = {
  message_id: string;
  user_id: string;
  reaction: string;
};

type Pin = {
  message_id: string;
  pinned_by: string;
  pinned_at: string;
};

const REACTIONS = ["👍", "❤️", "😂", "👏", "🚀", "✅"];

export default function VendorAdminPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [pins, setPins] = useState<Pin[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [reactionMessage, setReactionMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [openingFile, setOpeningFile] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [momLoading, setMomLoading] = useState(false);
  const [mom, setMom] = useState("");
  const [credentials, setCredentials] = useState<{
    company: string;
    email: string;
    password: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const pending = useMemo(
    () => applications.filter((a) => a.status === "pending"),
    [applications]
  );

  const visibleMessages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) =>
      [m.content ?? "", m.file_name ?? ""].some((value) =>
        value.toLowerCase().includes(q)
      )
    );
  }, [messages, search]);

  function getReactionCount(messageId: string, reaction: string) {
    return reactions.filter(
      (r) => r.message_id === messageId && r.reaction === reaction
    ).length;
  }


  function isPinned(messageId: string) {
    return pins.some((p) => p.message_id === messageId);
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function getCurrentUserId() {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  }

  async function load() {
    setLoading(true);
    setError(null);

    const token = await getToken();
    if (!token) {
      setError("Please log in again.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/admin/vendors", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Could not load vendors.");
      setLoading(false);
      return;
    }

    setApplications(data.applications ?? []);
    setVendors(data.vendors ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function approve(application: Application) {
    if (!window.confirm(`Approve ${application.company_name}?`)) return;
    setWorkingId(application.id);
    setError(null);

    const token = await getToken();
    if (!token) {
      setError("Please log in again.");
      setWorkingId(null);
      return;
    }

    const res = await fetch("/api/admin/vendors/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ application_id: application.id }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Approval failed.");
      setWorkingId(null);
      return;
    }

    setCredentials({
      company: data.vendor.company_name,
      email: data.credentials.email,
      password: data.credentials.temporary_password,
    });

    setWorkingId(null);
    await load();
  }

  async function reject(application: Application) {
    if (!window.confirm(`Reject ${application.company_name}?`)) return;
    setWorkingId(application.id);
    setError(null);

    const token = await getToken();
    if (!token) {
      setError("Please log in again.");
      setWorkingId(null);
      return;
    }

    const res = await fetch("/api/admin/vendors/reject", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ application_id: application.id }),
    });
    const data = await res.json();

    if (!res.ok) setError(data.error ?? "Rejection failed.");
    setWorkingId(null);
    await load();
  }


  async function openVendor(vendor: Vendor) {
    setSelectedVendor(vendor);
    setSelectedChatId(null);
    setMessages([]);
    setReactions([]);
    setPins([]);
    setDraft("");
    setSearch("");
    setMom("");
    setReplyingTo(null);
    setEditingMessage(null);
    setFile(null);
    setError(null);

    const { data: chat, error: chatError } = await supabase
      .from("vendor_chats")
      .select("id")
      .eq("vendor_id", vendor.id)
      .single();

    if (chatError || !chat) {
      setError(chatError?.message ?? "Vendor chat not found.");
      return;
    }

    setSelectedChatId(chat.id);

    const { data: chatMessages, error: messageError } = await supabase
      .from("vendor_messages")
      .select("*")
      .eq("chat_id", chat.id)
      .order("created_at", { ascending: true });

    if (messageError) {
      setError(messageError.message);
      return;
    }

    const loadedMessages = (chatMessages ?? []) as Message[];
    setMessages(loadedMessages);

    const ids = loadedMessages.map((m) => m.id);
    if (ids.length) {
      const [{ data: reactionData }, { data: pinData }] = await Promise.all([
        supabase
          .from("vendor_message_reactions")
          .select("message_id, user_id, reaction")
          .in("message_id", ids),
        supabase
          .from("vendor_pinned_messages")
          .select("message_id, pinned_by, pinned_at")
          .in("message_id", ids),
      ]);
      setReactions((reactionData ?? []) as Reaction[]);
      setPins((pinData ?? []) as Pin[]);
    }

    const userId = await getCurrentUserId();
    if (userId) {
      const unread = loadedMessages.filter(
        (m) => m.sender_id !== userId
      );
      if (unread.length) {
        await supabase.from("vendor_message_reads").insert(
          unread.map((m) => ({ message_id: m.id, user_id: userId }))
        );
      }
    }
  }

  useEffect(() => {
    if (!selectedChatId) return;

    const channel = supabase
      .channel(`vendor-admin-chat-${selectedChatId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "vendor_messages",
          filter: `chat_id=eq.${selectedChatId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const message = payload.new as Message;
            setMessages((prev) =>
              prev.some((m) => m.id === message.id)
                ? prev
                : [...prev, message]
            );
          } else if (payload.eventType === "UPDATE") {
            const message = payload.new as Message;
            setMessages((prev) =>
              prev.map((m) => (m.id === message.id ? message : m))
            );
          } else if (payload.eventType === "DELETE") {
            const oldMessage = payload.old as Message;
            setMessages((prev) =>
              prev.filter((m) => m.id !== oldMessage.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedChatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    if (!selectedChatId || (!draft.trim() && !file)) return;
    setSending(true);
    setError(null);

    const userId = await getCurrentUserId();
    if (!userId) {
      setError("Please log in again.");
      setSending(false);
      return;
    }

    let fileUrl: string | null = null;
    let fileName: string | null = null;

    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${selectedChatId}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("vendor-chat-files")
        .upload(path, file);

      if (uploadError) {
        setError(uploadError.message);
        setSending(false);
        return;
      }

      fileUrl = path;
      fileName = file.name;
    }

    const { error: sendError } = await supabase
      .from("vendor_messages")
      .insert({
        chat_id: selectedChatId,
        sender_id: userId,
        sender_type: "employee",
        content: draft.trim() || null,
        file_url: fileUrl,
        file_name: fileName,
        parent_message_id: replyingTo?.id ?? null,
      });

    if (sendError) {
      setError(sendError.message);
    } else {
      setDraft("");
      setFile(null);
      setReplyingTo(null);
    }

    setSending(false);
  }

  async function saveEdit() {
    if (!editingMessage || !editDraft.trim()) return;

    const { error: updateError } = await supabase
      .from("vendor_messages")
      .update({
        content: editDraft.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", editingMessage.id)
      .eq("sender_id", editingMessage.sender_id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setEditingMessage(null);
    setEditDraft("");
  }

  async function deleteMessage(message: Message) {
    if (!window.confirm("Delete this message? It will remain as a deleted-message placeholder.")) {
      return;
    }

    const { error: deleteError } = await supabase
      .from("vendor_messages")
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        content: null,
        file_url: null,
        file_name: null,
      })
      .eq("id", message.id)
      .eq("sender_id", message.sender_id);

    if (deleteError) setError(deleteError.message);
  }

  async function toggleReaction(messageId: string, reaction: string) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    const existing = reactions.find(
      (r) =>
        r.message_id === messageId &&
        r.user_id === userId &&
        r.reaction === reaction
    );

    if (existing) {
      const { error: removeError } = await supabase
        .from("vendor_message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", userId)
        .eq("reaction", reaction);
      if (removeError) setError(removeError.message);
      else setReactions((prev) => prev.filter((r) => r !== existing));
    } else {
      const { data, error: addError } = await supabase
        .from("vendor_message_reactions")
        .insert({ message_id: messageId, user_id: userId, reaction })
        .select("message_id, user_id, reaction")
        .single();
      if (addError) setError(addError.message);
      else if (data) setReactions((prev) => [...prev, data as Reaction]);
    }
  }

  async function togglePin(messageId: string) {
    const userId = await getCurrentUserId();
    if (!userId) return;

    if (isPinned(messageId)) {
      const { error: removeError } = await supabase
        .from("vendor_pinned_messages")
        .delete()
        .eq("message_id", messageId);
      if (removeError) setError(removeError.message);
      else setPins((prev) => prev.filter((p) => p.message_id !== messageId));
    } else {
      const { data, error: pinError } = await supabase
        .from("vendor_pinned_messages")
        .insert({ message_id: messageId, pinned_by: userId })
        .select("message_id, pinned_by, pinned_at")
        .single();
      if (pinError) setError(pinError.message);
      else if (data) setPins((prev) => [...prev, data as Pin]);
    }
  }

  async function openAttachment(message: Message) {
    if (!message.file_url) return;
    setOpeningFile(message.id);

    const { data, error: signedError } = await supabase.storage
      .from("vendor-chat-files")
      .createSignedUrl(message.file_url, 60 * 60);

    if (signedError || !data?.signedUrl) {
      setError(signedError?.message ?? "Could not open this attachment.");
    } else {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }

    setOpeningFile(null);
  }

  async function startRecording() {
    if (!selectedChatId || recording) return;

    try {
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTracks = stream.getAudioTracks();
      if (!audioTracks.length) {
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        setError("No tab/system audio was shared. Please enable audio when sharing the call tab.");
        return;
      }

      const audioStream = new MediaStream(audioTracks);
      const recorder = new MediaRecorder(audioStream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : undefined,
      });

      recordedChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      };

      recorderRef.current = recorder;
      recorder.start(1000);
      setRecording(true);
    } catch (recordError: any) {
      setError(recordError?.message ?? "Recording could not be started.");
    }
  }

  async function stopRecordingAndSummarize() {
    const recorder = recorderRef.current;
    if (!recorder || !selectedChatId) return;

    setRecording(false);
    setSummarizing(true);

    await new Promise<void>((resolve) => {
      recorder.addEventListener("stop", () => resolve(), { once: true });
      recorder.stop();
    });

    const audioBlob = new Blob(recordedChunksRef.current, {
      type: "audio/webm",
    });

    if (!audioBlob.size) {
      setError("No audio was captured, so no summary was generated.");
      setSummarizing(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "vendor-call.webm");
      formData.append("chat_id", selectedChatId);

      const response = await fetch("/api/vendor/summarize-call", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Vendor call summary failed.");
      }

      const summary = data.summary?.trim();
      if (!summary) {
        throw new Error("The AI returned an empty summary.");
      }

      const userId = await getCurrentUserId();
      if (userId) {
        await supabase.from("vendor_messages").insert({
          chat_id: selectedChatId,
          sender_id: userId,
          sender_type: "employee",
          content: `📋 Vendor Call Summary\n\n${summary}`,
        });
      }
    } catch (summaryError: any) {
      setError(summaryError?.message ?? "Could not generate the call summary.");
    } finally {
      setSummarizing(false);
      recorderRef.current = null;
      recordedChunksRef.current = [];
    }
  }

  async function generateVendorMOM() {
    if (!selectedChatId) return;
    setMomLoading(true);
    setMom("");
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error("Please log in again.");

      const response = await fetch("/api/vendor/daily-mom", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          chat_id: selectedChatId,
          date: new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Kolkata",
          }).format(new Date()),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Vendor Daily MOM generation failed.");
      }

      const content = data.mom?.content ?? data.mom ?? data.content ?? "";
      setMom(typeof content === "string" ? content : JSON.stringify(content, null, 2));
    } catch (momError: any) {
      setError(momError?.message ?? "Could not generate Vendor Daily MOM.");
    } finally {
      setMomLoading(false);
    }
  }

  async function copyCredentials() {
    if (!credentials) return;
    await navigator.clipboard.writeText(
      `InnoVibe Vendor Portal\nCompany: ${credentials.company}\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}`
    );
  }

  return (
    <div className="min-h-screen bg-[#EEF4F9] text-[#0F2438]">
      <header className="bg-[#0E2A40] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#7FB6C9]">InnoVibe Mobility</p>
          <h1 className="text-xl font-bold">Vendor Management</h1>
        </div>
        <a
        href="/admin/employees"
        className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
        >
          Employees
        </a>
        <a href="/dashboard" className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15">Back to Chat</a>
      </header>

      <main className="max-w-[1500px] mx-auto p-4 md:p-6">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {credentials && (
          <div className="mb-5 rounded-2xl border border-[#FFE3B3] bg-[#FFF8EA] p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8A6729]">Save these credentials now</p>
                <h2 className="mt-1 font-bold text-lg">{credentials.company}</h2>
                <p className="text-sm mt-2">Email: <strong>{credentials.email}</strong></p>
                <p className="text-sm">Temporary password: <strong className="font-mono">{credentials.password}</strong></p>
              </div>
              <button onClick={copyCredentials} className="rounded-xl bg-[#0E2A40] text-white px-4 py-2.5 text-sm font-semibold">Copy credentials</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center">Loading vendor management...</div>
        ) : (
          <div className="grid xl:grid-cols-[330px_minmax(0,1fr)] gap-5">
            <section className="space-y-5">
              <div className="bg-white rounded-2xl border border-[#DDE8F0] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E7EEF3] flex justify-between items-center">
                  <div><h2 className="font-bold">Pending Applications</h2><p className="text-xs text-[#718596] mt-1">{pending.length} awaiting review</p></div>
                  <span className="rounded-full bg-[#FFF4DF] px-3 py-1 text-xs font-bold text-[#765A28]">{pending.length}</span>
                </div>
                <div className="divide-y divide-[#EEF2F5]">
                  {pending.length === 0 && <p className="p-5 text-sm text-[#7B8C99]">No pending applications.</p>}
                  {pending.map((application) => (
                    <div key={application.id} className="p-5">
                      <div className="flex gap-3">
                        {application.logo_url ? <img src={application.logo_url} alt="" className="h-11 w-11 rounded-xl object-contain border bg-white" /> : <div className="h-11 w-11 rounded-xl bg-[#EEF4F9] flex items-center justify-center">🏢</div>}
                        <div className="min-w-0"><p className="font-semibold truncate">{application.company_name}</p><p className="text-xs text-[#718596]">{application.contact_name}</p><p className="text-xs text-[#718596] truncate">{application.contact_email}</p></div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button disabled={workingId === application.id} onClick={() => void approve(application)} className="flex-1 rounded-lg bg-[#26648B] text-white px-3 py-2 text-xs font-bold disabled:opacity-50">{workingId === application.id ? "Working..." : "Approve"}</button>
                        <button disabled={workingId === application.id} onClick={() => void reject(application)} className="flex-1 rounded-lg border border-red-200 text-red-600 px-3 py-2 text-xs font-bold disabled:opacity-50">Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-[#DDE8F0] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E7EEF3]"><h2 className="font-bold">Approved Vendors</h2><p className="text-xs text-[#718596] mt-1">Select a vendor to open its private chat.</p></div>
                <div className="divide-y divide-[#EEF2F5]">
                  {vendors.length === 0 && <p className="p-5 text-sm text-[#7B8C99]">No vendors yet.</p>}
                  {vendors.map((vendor) => (
                    <button key={vendor.id} onClick={() => void openVendor(vendor)} className={`w-full text-left p-4 flex items-center gap-3 hover:bg-[#F6FAFC] ${selectedVendor?.id === vendor.id ? "bg-[#EEF7FA]" : ""}`}>
                      {vendor.logo_url ? <img src={vendor.logo_url} alt={vendor.company_name} className="h-10 w-10 rounded-xl object-contain border bg-white" /> : <div className="h-10 w-10 rounded-xl bg-[#EEF4F9] flex items-center justify-center">🏢</div>}
                      <div className="min-w-0 flex-1"><p className="font-semibold text-sm truncate">{vendor.company_name}</p><p className="text-xs text-[#718596] truncate">{vendor.contact_name}</p></div>
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-[#DDE8F0] shadow-sm min-h-[700px] flex flex-col overflow-hidden">
              {selectedVendor ? (
                <>
                  <div className="px-5 py-4 border-b border-[#E7EEF3] flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {selectedVendor.logo_url ? <img src={selectedVendor.logo_url} alt={selectedVendor.company_name} className="h-11 w-11 rounded-xl object-contain border bg-white" /> : <div className="h-11 w-11 rounded-xl bg-[#EEF4F9] flex items-center justify-center">🏢</div>}
                      <div className="min-w-0"><h2 className="font-bold truncate">{selectedVendor.company_name}</h2><p className="text-xs text-[#718596]">Private vendor workspace • {selectedVendor.contact_name}</p></div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chat" className="w-36 md:w-44 rounded-lg border border-[#D8E4EC] px-3 py-2 text-xs outline-none focus:border-[#53D2DB]" />
                      <a href={`https://meet.jit.si/InnoVibe-Vendor-${selectedChatId}`} target="_blank" rel="noreferrer" className="rounded-lg bg-[#26648B] text-white px-3 py-2 text-xs font-semibold">📹 Video</a>
                      <a href={`https://meet.jit.si/InnoVibe-Vendor-${selectedChatId}`} target="_blank" rel="noreferrer" className="rounded-lg bg-[#4F8FBF] text-white px-3 py-2 text-xs font-semibold">🎙️ Audio</a>
                      {!recording && !summarizing ? <button onClick={() => void startRecording()} className="rounded-lg bg-[#FFE3B3] text-[#6B4B1E] px-3 py-2 text-xs font-semibold">🔴 Record</button> : <button onClick={() => void stopRecordingAndSummarize()} className="rounded-lg bg-red-600 text-white px-3 py-2 text-xs font-semibold">⏹ Stop & Summarize</button>}
                      <button onClick={() => void generateVendorMOM()} disabled={momLoading} className="rounded-lg bg-[#0E2A40] text-white px-3 py-2 text-xs font-semibold">{momLoading ? "Generating..." : "📋 Daily MOM"}</button>
                    </div>
                  </div>

                  {mom && (
                    <div className="mx-5 mt-4 rounded-xl border border-[#DDE8F0] bg-[#F7FAFC] p-4 max-h-64 overflow-y-auto">
                      <div className="flex items-center justify-between mb-2"><h3 className="font-bold text-sm">Vendor Daily MOM</h3><button onClick={() => setMom("")} className="text-xs text-[#718596]">Close</button></div>
                      <div className="text-sm whitespace-pre-wrap leading-6">{mom}</div>
                    </div>
                  )}

                  <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {visibleMessages.length === 0 && <div className="h-full min-h-[450px] flex items-center justify-center text-sm text-[#8A9AA7]">{search ? "No messages match your search." : "No messages yet."}</div>}
                    {visibleMessages.map((message) => {
                      const mine = message.sender_type === "employee";
                      const replies = messages.filter((m) => m.parent_message_id === message.id).length;
                      return (
                        <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div className={`group max-w-[88%] md:max-w-[78%] rounded-2xl px-4 py-3 ${mine ? "bg-[#26648B] text-white rounded-br-sm" : "bg-[#F1F5F8] text-[#0F2438] rounded-bl-sm"}`}>
                            <p className="text-[11px] opacity-65 mb-1">{mine ? "InnoVibe" : selectedVendor.contact_name}</p>

                            {message.deleted_at ? (
                              <p className="text-sm italic opacity-60">This message was deleted.</p>
                            ) : (
                              <>
                                {message.parent_message_id && <div className="mb-2 rounded-lg bg-black/5 px-2 py-1 text-[11px] opacity-70">↩ Reply in thread</div>}
                                {message.content && <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>}
                                {message.file_url && <button type="button" onClick={() => void openAttachment(message)} disabled={openingFile === message.id} className="mt-2 block text-xs underline text-left">📎 {openingFile === message.id ? "Opening..." : message.file_name ?? "Attachment"}</button>}
                              </>
                            )}

                            <div className="flex items-center gap-2 mt-2 text-[10px] opacity-50">
                              <span>{new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                              {message.updated_at && !message.deleted_at && <span>edited</span>}
                              {isPinned(message.id) && <span>📌 pinned</span>}
                            </div>

                            {!message.deleted_at && (
                              <div className="mt-2 flex flex-wrap gap-1 items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                                <button onClick={() => setReplyingTo(message)} className="rounded-md bg-black/5 px-2 py-1 text-[10px]">↩ Reply</button>
                                <button onClick={() => setReactionMessage(reactionMessage === message.id ? null : message.id)} className="rounded-md bg-black/5 px-2 py-1 text-[10px]">😀 React</button>
                                <button onClick={() => void togglePin(message.id)} className="rounded-md bg-black/5 px-2 py-1 text-[10px]">{isPinned(message.id) ? "📌 Unpin" : "📌 Pin"}</button>
                                {mine && <button onClick={() => { setEditingMessage(message); setEditDraft(message.content ?? ""); }} className="rounded-md bg-black/5 px-2 py-1 text-[10px]">✏️ Edit</button>}
                                {mine && <button onClick={() => void deleteMessage(message)} className="rounded-md bg-black/5 px-2 py-1 text-[10px]">🗑 Delete</button>}
                              </div>
                            )}

                            {reactionMessage === message.id && !message.deleted_at && (
                              <div className="mt-2 flex flex-wrap gap-1 rounded-lg bg-white/80 p-1 text-[#0F2438]">
                                {REACTIONS.map((reaction) => <button key={reaction} onClick={() => void toggleReaction(message.id, reaction)} className="rounded px-2 py-1 hover:bg-slate-100" title={reaction}>{reaction} {getReactionCount(message.id, reaction) || ""}</button>)}
                              </div>
                            )}

                            {REACTIONS.filter((r) => getReactionCount(message.id, r) > 0).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {REACTIONS.filter((r) => getReactionCount(message.id, r) > 0).map((r) => <span key={r} className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] text-[#0F2438]">{r} {getReactionCount(message.id, r)}</span>)}
                              </div>
                            )}

                            {replies > 0 && <p className="mt-1 text-[10px] opacity-60">{replies} {replies === 1 ? "reply" : "replies"}</p>}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>

                  <div className="border-t border-[#E7EEF3] p-4">
                    {replyingTo && (
                      <div className="mb-2 rounded-xl bg-[#EEF7FA] border border-[#D8E9EE] px-3 py-2 text-xs flex items-center justify-between">
                        <span>↩ Replying to <strong>{replyingTo.sender_type === "employee" ? "InnoVibe" : selectedVendor.contact_name}</strong>: {replyingTo.content?.slice(0, 100) ?? "attachment"}</span>
                        <button onClick={() => setReplyingTo(null)} className="text-[#718596]">×</button>
                      </div>
                    )}
                    {file && (
                      <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-[#EEF7FA] px-3 py-2 text-xs">📎 {file.name}<button onClick={() => setFile(null)} className="text-red-500">×</button></div>
                    )}
                    <div className="flex gap-2">
                      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} placeholder={`Message ${selectedVendor.company_name}...`} className="flex-1 min-w-0 rounded-xl border border-[#D8E4EC] px-4 py-3 text-sm outline-none focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/10" />
                      <input id="vendor-admin-file" type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                      <label htmlFor="vendor-admin-file" className="cursor-pointer rounded-xl border border-[#D8E4EC] bg-white px-4 py-3 text-sm hover:bg-[#F7FAFC]" title="Attach file">📎</label>
                      <button onClick={() => void sendMessage()} disabled={sending || (!draft.trim() && !file)} className="rounded-xl bg-[#26648B] text-white px-5 text-sm font-bold disabled:opacity-50">{sending ? "..." : "Send"}</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-8 text-center"><div><div className="mx-auto h-16 w-16 rounded-2xl bg-[#EEF4F9] flex items-center justify-center text-2xl">🏢</div><h2 className="mt-4 font-bold text-lg">Select a vendor</h2><p className="mt-1 text-sm text-[#718596]">Each vendor has its own isolated conversation.</p></div></div>
              )}
            </section>
          </div>
        )}
      </main>

      {editingMessage && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl p-5">
            <h2 className="font-bold">Edit message</h2>
            <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={4} className="mt-3 w-full rounded-xl border border-[#D8E4EC] p-3 text-sm outline-none focus:border-[#53D2DB]" />
            <div className="mt-4 flex justify-end gap-2"><button onClick={() => setEditingMessage(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button onClick={() => void saveEdit()} className="rounded-lg bg-[#26648B] px-4 py-2 text-sm font-semibold text-white">Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
