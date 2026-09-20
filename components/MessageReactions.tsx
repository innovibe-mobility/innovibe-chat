"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  messageId: string;
  userId: string;
};

export default function MessageReactions({
  messageId,
  userId,
}: Props) {
  const [count, setCount] = useState(0);
  const [liked, setLiked] = useState(false);

  async function loadLike() {
    const { data, error } = await supabase
      .from("message_reactions")
      .select("user_id")
      .eq("message_id", messageId)
      .eq("reaction", "👍");

    if (error) {
      console.error(
        "Failed to load likes:",
        error
      );
      return;
    }

    const rows = data ?? [];

    setCount(rows.length);
    setLiked(
      rows.some(
        (row) => row.user_id === userId
      )
    );
  }

  useEffect(() => {
    loadLike();

    const channel = supabase
      .channel(`likes:${messageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
          filter: `message_id=eq.${messageId}`,
        },
        () => {
          loadLike();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [messageId, userId]);

  async function toggleLike() {
    if (liked) {
      const { error } = await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", userId)
        .eq("reaction", "👍");

      if (error) {
        console.error(
          "Failed to remove like:",
          error
        );
        return;
      }
    } else {
      const { error } = await supabase
        .from("message_reactions")
        .insert({
          message_id: messageId,
          user_id: userId,
          reaction: "👍",
        });

      if (error) {
        console.error(
          "Failed to add like:",
          error
        );
        return;
      }
    }

    await loadLike();
  }

  return (
    <button
      type="button"
      onClick={toggleLike}
      title="Like message"
      className={`
        flex items-center gap-1
        rounded-full
        border
        px-2 py-0.5
        text-xs
        transition
        ${
          liked
            ? "bg-blue-50 border-blue-300 text-blue-600"
            : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
        }
      `}
    >
      <span className="text-sm">👍</span>

      {count > 0 && (
        <span>{count}</span>
      )}
    </button>
  );
}