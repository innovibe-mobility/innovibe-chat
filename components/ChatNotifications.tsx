"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Notification = {
  id: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
};

type Props = {
  userId: string;
};

export default function ChatNotifications({ userId }: Props) {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError("");

    const { data, error: loadError } = await supabase
      .from("notifications")
      .select("id, title, body, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (loadError) {
      console.error("Failed to load notifications:", loadError);
      setError("Couldn't load notifications.");
      setItems([]);
      setLoading(false);
      return;
    }

    setItems((data ?? []) as Notification[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("Notification realtime subscription failed.");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, load]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const unread = items.filter((item) => !item.is_read).length;

  async function markAllRead() {
    if (unread === 0 || markingRead) return;

    setMarkingRead(true);
    setError("");

    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (updateError) {
      console.error("Failed to mark notifications read:", updateError);
      setError("Couldn't mark notifications as read.");
      setMarkingRead(false);
      return;
    }

    setItems((current) =>
      current.map((item) => ({ ...item, is_read: true }))
    );
    setMarkingRead(false);
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void load();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.06] text-sm text-white/75 hover:text-white hover:bg-white/[0.06] transition-colors"
        title="Notifications"
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-[#0A0E18]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed md:absolute left-3 right-3 md:left-auto md:right-0 top-[4.5rem] md:top-11 z-[100] w-auto md:w-80 max-h-[min(28rem,calc(100vh-6rem))] overflow-hidden rounded-xl border border-white/[0.1] bg-[#0E1320] shadow-[0_24px_70px_-20px_rgba(0,0,0,0.8)] ring-1 ring-black/20"
        >
          <div className="sticky top-0 z-10 px-3.5 py-3 border-b border-white/[0.07] bg-[#0E1320]/95 backdrop-blur-xl flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Notifications</p>
              {unread > 0 && (
                <p className="text-[10px] text-white/35 mt-0.5">
                  {unread} unread
                </p>
              )}
            </div>

            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                disabled={markingRead}
                className="shrink-0 text-xs font-medium text-[#8EA3FF] hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {markingRead ? "Marking…" : "Mark all read"}
              </button>
            )}
          </div>

          <div className="max-h-[calc(100vh-10rem)] overflow-y-auto overscroll-contain">
            {loading && items.length === 0 ? (
              <div className="px-4 py-8 text-sm text-white/40 text-center">
                Loading notifications…
              </div>
            ) : error ? (
              <div className="px-4 py-8 text-sm text-red-200/80 text-center">
                {error}
                <button
                  type="button"
                  onClick={() => void load()}
                  className="block mx-auto mt-2 text-xs text-[#9FB0FF] hover:text-white underline underline-offset-2"
                >
                  Try again
                </button>
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-sm text-white/35 text-center">
                No notifications
              </p>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className={`px-3.5 py-3 border-b border-white/[0.05] last:border-b-0 ${
                    item.is_read ? "bg-transparent" : "bg-[#5B78FF]/[0.07]"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!item.is_read && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#6C8AFF]" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white/85 break-words">
                        {item.title}
                      </p>
                      {item.body && (
                        <p className="text-xs text-white/50 mt-1 line-clamp-3 break-words">
                          {item.body}
                        </p>
                      )}
                      <p className="text-[10px] text-white/30 mt-1.5">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
