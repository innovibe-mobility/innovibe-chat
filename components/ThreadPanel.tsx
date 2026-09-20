"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Message = {
  id: string;
  sender_id: string;
  content: string | null;
  file_name: string | null;
  created_at: string;
  parent_message_id?: string | null;
};

type Props = {
  root: Message;
  channelId: string;
  userId: string;
  profiles: Record<string, string>;
  onClose: () => void;
  onSent: () => void;
};

export default function ThreadPanel({
  root,
  channelId,
  userId,
  profiles,
  onClose,
  onSent,
}: Props) {
  const [replies, setReplies] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, content, file_name, created_at, parent_message_id")
      .eq("channel_id", channelId)
      .eq("parent_message_id", root.id)
      .order("created_at", { ascending: true });

    setReplies((data as Message[]) ?? []);
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel(`thread:${root.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload) => {
          const message = payload.new as Message;
          if (message.parent_message_id === root.id) {
            setReplies((prev) =>
              prev.some((m) => m.id === message.id)
                ? prev
                : [...prev, message]
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [root.id, channelId]);

  async function send() {
    if (!draft.trim()) return;

    setSending(true);

    const { error } = await supabase.from("messages").insert({
      channel_id: channelId,
      sender_id: userId,
      content: draft.trim(),
      parent_message_id: root.id,
    });

    if (!error) {
      setDraft("");
      await load();
      onSent();
    } else {
      alert(`Couldn't send thread reply: ${error.message}`);
    }

    setSending(false);
  }

  const rootName =
    root.sender_id === userId
      ? "You"
      : profiles[root.sender_id] ?? "Employee";

  return (
    <aside className="fixed md:absolute right-0 top-0 bottom-0 z-40 w-full sm:w-[380px] bg-white border-l border-gray-200 shadow-xl flex flex-col">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">Thread</p>
          <p className="text-xs text-gray-400">{replies.length} replies</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 text-xl"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
          <p className="text-xs font-semibold text-gray-600">{rootName}</p>
          <p className="text-sm text-gray-800 whitespace-pre-wrap mt-1">
            {root.content ??
              (root.file_name ? `📎 ${root.file_name}` : "Message")}
          </p>
        </div>

        {replies.map((reply) => {
          const name =
            reply.sender_id === userId
              ? "You"
              : profiles[reply.sender_id] ?? "Employee";

          return (
            <div key={reply.id} className="rounded-lg border border-gray-100 p-3">
              <p className="text-xs font-semibold text-gray-600">{name}</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap mt-1">
                {reply.content ??
                  (reply.file_name ? `📎 ${reply.file_name}` : "Message")}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">
                {new Date(reply.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Reply in thread..."
          className="flex-1 min-w-0 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || !draft.trim()}
          className="px-3 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          {sending ? "..." : "Send"}
        </button>
      </div>
    </aside>
  );
}
