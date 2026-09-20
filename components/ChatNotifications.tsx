"use client";

import { useEffect, useState } from "react";
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

  async function load() {
    const { data } = await supabase
      .from("notifications")
      .select("id, title, body, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    setItems((data as Notification[]) ?? []);
  }

  useEffect(() => {
    load();

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
        load
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const unread = items.filter((item) => !item.is_read).length;

  async function markAllRead() {
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    await load();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative shrink-0 text-sm border border-gray-200 hover:bg-gray-50 rounded-md px-2.5 py-1.5"
        title="Notifications"
      >
        🔔
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 max-h-96 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl">
          <div className="px-3 py-2 border-b flex items-center justify-between">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-blue-600 hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="px-3 py-5 text-sm text-gray-400 text-center">
              No notifications
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={`px-3 py-2.5 border-b border-gray-100 ${
                  item.is_read ? "bg-white" : "bg-blue-50/60"
                }`}
              >
                <p className="text-xs font-medium text-gray-700">
                  {item.title}
                </p>
                {item.body && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {item.body}
                  </p>
                )}
                <p className="text-[10px] text-gray-400 mt-1">
                  {new Date(item.created_at).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
