"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  userId: string;
  className?: string;
};

export default function PresenceDot({ userId, className = "" }: Props) {
  const [online, setOnline] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("user_presence")
      .select("status, last_seen_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (!data) {
      setOnline(false);
      return;
    }

    const lastSeen = new Date(data.last_seen_at).getTime();
    const fresh = Date.now() - lastSeen < 2 * 60 * 1000;
    setOnline(data.status === "online" && fresh);
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel(`presence:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_presence",
          filter: `user_id=eq.${userId}`,
        },
        load
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        online ? "bg-green-500" : "bg-gray-300"
      } ${className}`}
      title={online ? "Online" : "Offline"}
    />
  );
}
