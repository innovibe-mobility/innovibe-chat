"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Channel = {
  id: string;
  name: string;
  description: string | null;
  is_private?: boolean;
  created_by?: string | null;
  post_roles?: string[] | null;
};

type Message = {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  sender_name?: string;
};

type SearchResult = {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
  channel_name?: string;
};

export default function ChatPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("employee");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [dmChannels, setDmChannels] = useState<Channel[]>([]);
  const [dmNames, setDmNames] = useState<Record<string, string>>({});
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [profileRoles, setProfileRoles] = useState<Record<string, string>>({});
  const [showSidebar, setShowSidebar] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 1. Check auth, load channels
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/login");
        return;
      }
      setUserId(data.session.user.id);
      supabase
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .single()
        .then(({ data: profile }) => {
          if (profile?.role) setUserRole(profile.role);
        });
    });

    supabase
      .from("channels")
      .select("id, name, description, is_private, created_by, post_roles")
      .eq("is_private", false)
      .order("name")
      .then(({ data }) => {
        if (data) {
          setChannels(data as Channel[]);
          setActiveChannel((data as Channel[])[0] ?? null);
        }
      });

    supabase
      .from("profiles")
      .select("id, full_name, role")
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          const roleMap: Record<string, string> = {};
          data.forEach((p: any) => {
            map[p.id] = p.full_name;
            roleMap[p.id] = p.role ?? "employee";
          });
          setProfiles(map);
          setProfileRoles(roleMap);
        }
      });
  }, [router]);

  // Load the user's DM channels (private channels they belong to) + names
  async function loadDMs(uid: string, profileMap: Record<string, string>) {
    const { data: memberships } = await supabase
      .from("channel_members")
      .select("channel_id")
      .eq("user_id", uid);

    const channelIds = (memberships ?? []).map((m: any) => m.channel_id);
    if (channelIds.length === 0) return;

    const { data: dms } = await supabase
      .from("channels")
      .select("id, name, description, is_private, created_by")
      .in("id", channelIds)
      .eq("is_private", true);

    if (!dms) return;
    setDmChannels(dms as Channel[]);

    const names: Record<string, string> = {};
    for (const dm of dms) {
      const { data: members } = await supabase
        .from("channel_members")
        .select("user_id")
        .eq("channel_id", dm.id)
        .neq("user_id", uid);
      const otherId = members?.[0]?.user_id;
      names[dm.id] = otherId ? profileMap[otherId] ?? "Employee" : "Direct Message";
    }
    setDmNames(names);
  }

  useEffect(() => {
    if (userId && Object.keys(profiles).length > 0) {
      loadDMs(userId, profiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profiles]);

  // Start (or open, if it already exists) a DM with another employee
  async function startDM(otherUserId: string) {
    if (!userId) return;
    const dmName = `dm-${[userId, otherUserId].sort().join("-")}`;

    const { data: existing } = await supabase
      .from("channels")
      .select("id, name, description, is_private, created_by")
      .eq("name", dmName)
      .maybeSingle();

    let channel = existing as Channel | null;

    if (!channel) {
      const { data: created, error } = await supabase
        .from("channels")
        .insert({ name: dmName, is_private: true, created_by: userId })
        .select()
        .single();
      if (error || !created) {
        alert(`Couldn't start this DM: ${error?.message ?? "unknown error"}`);
        return;
      }
      channel = created as Channel;

      const { error: memberError } = await supabase.from("channel_members").insert([
        { channel_id: channel.id, user_id: userId },
        { channel_id: channel.id, user_id: otherUserId },
      ]);

      if (memberError) {
        alert(
          `Couldn't fully set up this DM: ${memberError.message}\n\nMake sure supabase/update-dm-policy.sql has been run in Supabase.`
        );
        return;
      }

      setDmNames((prev) => ({
        ...prev,
        [channel!.id]: profiles[otherUserId] ?? "Employee",
      }));
      setDmChannels((prev) => [...prev, channel!]);
    }

    setActiveChannel(channel);
    setShowNewDM(false);
    setShowSidebar(false);
  }

  // Search messages by keyword (RLS already limits results to channels the user can access)
  async function runSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const { data } = await supabase
      .from("messages")
      .select("id, channel_id, sender_id, content, created_at")
      .ilike("content", `%${searchQuery.trim()}%`)
      .order("created_at", { ascending: false })
      .limit(30);
    setSearchResults((data as SearchResult[]) ?? []);
    setSearching(false);
  }

  function jumpToSearchResult(result: SearchResult) {
    const all = [...channels, ...dmChannels];
    const found = all.find((c) => c.id === result.channel_id);
    if (found) {
      setActiveChannel(found);
      setShowSearch(false);
      setSearchQuery("");
      setSearchResults([]);
    }
  }

  // 2. Load messages for active channel + subscribe to new ones live
  useEffect(() => {
    if (!activeChannel) return;

    supabase
      .from("messages")
      .select("*")
      .eq("channel_id", activeChannel.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data) setMessages(data as Message[]);
      });

    const channel = supabase
      .channel(`messages:${activeChannel.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${activeChannel.id}`,
        },
        (payload) => {
          const incoming = payload.new as Message;
          // Extra safety: never show a message unless it truly belongs
          // to the channel currently open, and never add the same
          // message twice (e.g. once from our own instant-preview,
          // once from the live broadcast).
          if (incoming.channel_id !== activeChannel.id) return;
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChannel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function canPostHere(): boolean {
    if (!activeChannel) return false;
    if (activeChannel.is_private) return true; // DMs: always postable
    if (!activeChannel.post_roles || activeChannel.post_roles.length === 0)
      return true; // unrestricted channel
    const normalizedUserRole = userRole.trim().toLowerCase();
    return activeChannel.post_roles
      .map((r) => r.trim().toLowerCase())
      .includes(normalizedUserRole);
  }

  async function sendMessage() {
    if (!activeChannel || !userId) return;
    if (!draft.trim() && !file) return;
    setSending(true);

    let file_url: string | null = null;
    let file_name: string | null = null;

    if (file) {
      const path = `${activeChannel.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("chat-files")
        .upload(path, file);
      if (uploadError) {
        alert(`File upload failed: ${uploadError.message}`);
        setSending(false);
        return;
      }
      const { data } = supabase.storage
        .from("chat-files")
        .getPublicUrl(path);
      file_url = data.publicUrl;
      file_name = file.name;
    }

    const { data: sentMessage, error: sendError } = await supabase
      .from("messages")
      .insert({
        channel_id: activeChannel.id,
        sender_id: userId,
        content: draft.trim() || null,
        file_url,
        file_name,
      })
      .select()
      .single();

    if (sendError) {
      alert(`Message failed to send: ${sendError.message}`);
      setSending(false);
      return;
    }

    // Show it immediately for the sender, even if live-updates
    // haven't kicked in yet for any reason
    if (sentMessage) {
      setMessages((prev) =>
        prev.some((m) => m.id === sentMessage.id)
          ? prev
          : [...prev, sentMessage as Message]
      );
    }

    setDraft("");
    setFile(null);
    setSending(false);
  }

  async function startRecording() {
    const confirmed = window.confirm(
      "This will record this call's audio and generate an AI summary that gets posted to this channel. Make sure everyone on the call knows it's being recorded. Continue?"
    );
    if (!confirmed) return;

    try {
      // Prompts the person to pick a tab/window and MUST check
      // "Share tab audio" -- this is what lets us capture the Jitsi
      // call's sound without touching Jitsi's servers at all.
      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        alert(
          'No audio was shared. When the picker opens, make sure to check "Share tab audio" (or "Share system audio"), otherwise there\'s nothing to transcribe.'
        );
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
        return;
      }

      const audioOnlyStream = new MediaStream(audioTracks);
      const recorder = new MediaRecorder(audioOnlyStream);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err: any) {
      alert(`Couldn't start recording: ${err?.message ?? "permission denied"}`);
    }
  }

  async function stopRecordingAndSummarize() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || !activeChannel || !userId) return;

    setIsRecording(false);
    setIsSummarizing(true);

    recorder.stop();
    await new Promise((resolve) => (recorder.onstop = resolve));

    const audioBlob = new Blob(recordedChunksRef.current, { type: "audio/webm" });

    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "call.webm");

      const res = await fetch("/api/summarize-call", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();

      if (!res.ok) {
        alert(`Couldn't generate summary: ${result.error}`);
        setIsSummarizing(false);
        return;
      }

      // Save it, and post it as a message so everyone in the channel sees it
      await supabase.from("call_summaries").insert({
        channel_id: activeChannel.id,
        created_by: userId,
        transcript: result.transcript,
        summary: result.summary,
      });

      await supabase.from("messages").insert({
        channel_id: activeChannel.id,
        sender_id: userId,
        content: `📋 **Call Summary**\n\n${result.summary}`,
      });
    } catch (err: any) {
      alert(`Something went wrong generating the summary: ${err?.message}`);
    } finally {
      setIsSummarizing(false);
    }
  }


  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div className="flex h-screen relative overflow-hidden">
      {/* Sidebar - slides in on mobile, always visible on desktop */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-30
          w-64 bg-graphite-900 text-graphite-200 flex flex-col
          transform transition-transform duration-200
          ${showSidebar ? "translate-x-0" : "-translate-x-full"} md:translate-x-0
        `}
      >
        <div className="px-4 py-4 border-b border-graphite-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-signal-500 text-graphite-900 flex items-center justify-center text-sm font-bold">
              ⚡
            </span>
            <span className="font-display font-semibold text-white tracking-tight">
              InnoVibe
            </span>
          </div>
          <button
            onClick={() => setShowSidebar(false)}
            className="md:hidden text-graphite-400 text-xl leading-none"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setActiveChannel(c);
                setShowSidebar(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-graphite-800 transition border-l-2 border-transparent ${
                activeChannel?.id === c.id ? "bg-graphite-800 border-l-2 border-signal-500 font-semibold text-white" : ""
              }`}
            >
              # {c.name}
            </button>
          ))}

          <div className="mt-4 px-4 flex items-center justify-between text-xs uppercase tracking-wide text-graphite-400">
            <span>Direct Messages</span>
            <button
              onClick={() => setShowNewDM(true)}
              className="text-graphite-400 hover:text-signal-400 text-sm leading-none"
              aria-label="Start a new direct message"
              title="Start a new direct message"
            >
              +
            </button>
          </div>
          {dmChannels.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setActiveChannel(c);
                setShowSidebar(false);
              }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-graphite-800 transition border-l-2 border-transparent ${
                activeChannel?.id === c.id ? "bg-graphite-800 border-l-2 border-signal-500 font-semibold text-white" : ""
              }`}
            >
              @ {dmNames[c.id] ?? "Employee"}
            </button>
          ))}
        </nav>
        <button
          onClick={signOut}
          className="px-4 py-3 text-sm text-graphite-400 hover:text-signal-400 border-t border-graphite-700 text-left"
        >
          Sign out
        </button>
      </aside>

      {/* Dim background behind sidebar on mobile */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Main chat area */}
      <main className="flex-1 flex flex-col w-full min-w-0">
        <header className="border-b border-gray-200 px-3 md:px-6 py-3 bg-white flex items-center gap-3">
          <button
            onClick={() => setShowSidebar(true)}
            className="md:hidden text-xl leading-none px-1"
            aria-label="Open channel menu"
          >
            ☰
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold truncate">
              {activeChannel?.is_private
                ? `@ ${dmNames[activeChannel.id] ?? "Employee"}`
                : `# ${activeChannel?.name ?? "..."}`}
            </h2>
            {activeChannel?.description && !activeChannel?.is_private && (
              <p className="text-xs text-graphite-400 truncate">
                {activeChannel.description}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowSearch(true)}
            className="shrink-0 text-xs md:text-sm border border-graphite-200 hover:bg-graphite-50 font-medium rounded-md px-2 md:px-3 py-1.5 text-graphite-700"
            title="Search messages"
          >
            🔍
          </button>
          {activeChannel && (
            <a
              href={`https://meet.jit.si/InnoVibe-${activeChannel.name}`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs md:text-sm bg-signal-500 hover:bg-signal-600 text-white font-medium rounded-md px-2 md:px-3 py-1.5 flex items-center gap-1"
              title="Start a free video/audio call for this channel"
            >
              📹 <span className="hidden sm:inline">Call</span>
            </a>
          )}
          {activeChannel && !isRecording && !isSummarizing && (
            <button
              onClick={startRecording}
              className="shrink-0 text-xs md:text-sm bg-amber-500 hover:bg-amber-600 text-graphite-900 font-medium rounded-md px-2 md:px-3 py-1.5 flex items-center gap-1"
              title='Record the call tab (choose "share tab audio" when prompted) and generate a summary afterward'
            >
              🎙️ <span className="hidden sm:inline">Record</span>
            </button>
          )}
          {isRecording && (
            <button
              onClick={stopRecordingAndSummarize}
              className="shrink-0 text-xs md:text-sm bg-red-600 hover:bg-red-700 text-white font-medium rounded-md px-2 md:px-3 py-1.5 flex items-center gap-1 animate-pulse"
              title="Stop recording and generate a summary"
            >
              ⏹️ <span className="hidden sm:inline">Stop & Summarize</span>
            </button>
          )}
          {isSummarizing && (
            <span className="shrink-0 text-xs md:text-sm text-gray-500 flex items-center gap-1 px-2">
              ⏳ <span className="hidden sm:inline">Summarizing...</span>
            </span>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-4 bg-canvas">
          {messages.map((m) => {
            const isMine = m.sender_id === userId;
            const name = isMine ? "You" : profiles[m.sender_id] ?? "Employee";
            const role = profileRoles[m.sender_id];
            const initials = (profiles[m.sender_id] ?? "E").slice(0, 1).toUpperCase();

            return (
              <div
                key={m.id}
                className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : ""}`}
              >
                {!isMine && (
                  <div className="w-7 h-7 rounded-full bg-graphite-200 text-graphite-700 text-xs font-semibold flex items-center justify-center shrink-0 mb-0.5">
                    {initials}
                  </div>
                )}
                <div className={`max-w-[78%] md:max-w-md ${isMine ? "items-end" : "items-start"} flex flex-col`}>
                  <div
                    className={`flex items-center gap-1.5 mb-1 text-xs ${
                      isMine ? "flex-row-reverse" : ""
                    }`}
                  >
                    <span className="font-medium text-gray-700">{name}</span>
                    {!isMine && role && role !== "employee" && (
                      <span className="text-[10px] tracking-wide bg-graphite-200/70 text-graphite-700 rounded px-1.5 py-0.5 font-medium">
                        {role}
                      </span>
                    )}
                    <span className="text-gray-400">
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div
                    className={`rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                      isMine
                        ? "bg-signal-500 text-graphite-900 rounded-br-sm"
                        : "bg-white text-graphite-900 border border-graphite-200/60 rounded-bl-sm"
                    }`}
                  >
                    {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                    {m.file_url && (
                      <a
                        href={m.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className={`mt-1 flex items-center gap-1 text-xs underline ${
                          isMine ? "text-white/90" : "text-brand-600"
                        }`}
                      >
                        📎 {m.file_name}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-gray-200 px-2 md:px-6 py-2 md:py-3 bg-white">
          {canPostHere() ? (
            <>
              {file && (
                <div className="flex items-center gap-2 mb-2 text-xs bg-brand-50 border border-brand-200 text-brand-700 rounded-md px-3 py-1.5 w-fit">
                  📎 <span className="font-semibold">{file.name}</span>
                  <span className="text-brand-500">ready — click Send</span>
                  <button
                    onClick={() => setFile(null)}
                    className="text-brand-400 hover:text-brand-700 font-medium"
                    title="Remove attachment"
                  >
                    ✕
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  placeholder={
                    activeChannel?.is_private
                      ? `Message @${dmNames[activeChannel.id] ?? ""}`
                      : `Message #${activeChannel?.name ?? ""}`
                  }
                  className="flex-1 min-w-0 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
                />
                <input
                  type="file"
                  id="file-input"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <label
                  htmlFor="file-input"
                  className={`cursor-pointer text-sm px-3 py-2 border rounded-md shrink-0 ${
                    file
                      ? "border-signal-500 bg-signal-50 text-signal-600"
                      : "border-gray-300 hover:bg-gray-50"
                  }`}
                  title={file ? file.name : "Attach a file"}
                >
                  📎
                </label>
                <button
                  onClick={sendMessage}
                  disabled={sending}
                  className="bg-brand-600 hover:bg-graphite-900 text-graphite-200 text-sm font-medium rounded-md px-3 md:px-4 py-2 shrink-0 disabled:opacity-60"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </>
          ) : (
            <p className="flex-1 text-sm text-graphite-400 text-center py-2">
              🔒 Only {activeChannel?.post_roles?.join(" or ")} can post in this channel.
            </p>
          )}
        </div>
      </main>

      {/* New Direct Message picker */}
      {showNewDM && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4"
          onClick={() => setShowNewDM(false)}
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-sm max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-gray-200 font-medium text-sm flex items-center justify-between">
              Start a direct message
              <button
                onClick={() => setShowNewDM(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <div className="py-1">
              {Object.entries(profiles)
                .filter(([id]) => id !== userId)
                .map(([id, name]) => (
                  <button
                    key={id}
                    onClick={() => startDM(id)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50"
                  >
                    {name}
                  </button>
                ))}
              {Object.keys(profiles).length <= 1 && (
                <p className="px-4 py-3 text-sm text-gray-400">
                  No other employees found yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search overlay */}
      {showSearch && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-start justify-center pt-16 md:pt-24 px-4"
          onClick={() => setShowSearch(false)}
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-gray-200 flex items-center gap-2">
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="Search messages..."
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              <button
                onClick={runSearch}
                className="bg-brand-600 hover:bg-graphite-900 text-graphite-200 text-sm font-medium rounded-md px-3 py-2 shrink-0"
              >
                Search
              </button>
            </div>
            <div className="py-1">
              {searching && (
                <p className="px-4 py-3 text-sm text-gray-400">Searching...</p>
              )}
              {!searching && searchResults.length === 0 && searchQuery && (
                <p className="px-4 py-3 text-sm text-gray-400">No messages found.</p>
              )}
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => jumpToSearchResult(r)}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100"
                >
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-0.5">
                    <span>{profiles[r.sender_id] ?? "Employee"}</span>
                    <span>{new Date(r.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="truncate">{r.content}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
