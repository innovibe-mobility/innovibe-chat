"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  userId: string;
  className?: string;
};

export default function PresenceDot({
  userId,
  className = "",
}: Props) {
  const [online, setOnline] = useState(false);

  const load = useCallback(async () => {
    if (!userId) {
      setOnline(false);
      return;
    }

    const { data, error } = await supabase
      .from("user_presence")
      .select("status, last_seen_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Presence check failed:", error);
      setOnline(false);
      return;
    }

    if (!data) {
      setOnline(false);
      return;
    }

    const lastSeen = new Date(data.last_seen_at).getTime();

    const fresh =
      Date.now() - lastSeen < 2 * 60 * 1000;

    setOnline(
      data.status === "online" && fresh
    );
  }, [userId]);

  useEffect(() => {
    void load();

    // Refresh presence every 30 seconds.
    const interval = window.setInterval(() => {
      void load();
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [load]);

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        online ? "bg-green-500" : "bg-gray-300"
      } ${className}`}
      title={online ? "Online" : "Offline"}
    />
  );
}