"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  messageId: string;
};

export default function MessageReadStatus({ messageId }: Props) {
  const [read, setRead] = useState(false);

  async function load() {
    const { count, error } = await supabase
      .from("message_reads")
      .select("id", { count: "exact", head: true })
      .eq("message_id", messageId);

    if (!error) setRead((count ?? 0) > 0);
  }

  useEffect(() => {
    load();

    const channel = supabase
      .channel(`read-status:${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reads",
          filter: `message_id=eq.${messageId}`,
        },
        load
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId]);

  return (
    <span className="text-[10px] text-gray-400 ml-1" title={read ? "Read" : "Sent"}>
      {read ? "✓✓ Read" : "✓ Sent"}
    </span>
  );
}
