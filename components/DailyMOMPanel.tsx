"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type DailyMOMPanelProps = {
  channelId: string;
  channelName: string;
  userId: string;
  onClose: () => void;
};

type DailyMOM = {
  id: string;
  channel_id: string;
  mom_date: string;
  title: string;
  content: string;
  source_message_count: number;
  created_at: string;
  updated_at: string;
};

function getIndiaDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function DailyMOMPanel({
  channelId,
  channelName,
  userId,
  onClose,
}: DailyMOMPanelProps) {
  const [date, setDate] = useState(getIndiaDate());
  const [mom, setMom] = useState<DailyMOM | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  async function loadExistingMom(selectedDate: string) {
    setLoading(true);
    setError("");

    const { data, error: loadError } = await supabase
      .from("daily_moms")
      .select(
        "id, channel_id, mom_date, title, content, source_message_count, created_at, updated_at"
      )
      .eq("channel_id", channelId)
      .eq("mom_date", selectedDate)
      .maybeSingle();

    if (loadError) {
      setError(loadError.message);
      setMom(null);
    } else {
      setMom((data as DailyMOM | null) ?? null);
    }

    setLoading(false);
  }

  useEffect(() => {
    void loadExistingMom(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, date]);

  async function generateMom() {
    setGenerating(true);
    setError("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Please log in again.");
      }

      const response = await fetch("/api/daily-mom", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          channel_id: channelId,
          date,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Could not generate Daily MOM.");
      }

      setMom(result.mom as DailyMOM);
    } catch (err: any) {
      setError(err?.message ?? "Could not generate Daily MOM.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center px-3 md:px-6"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-3xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              📋 Daily MOM
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              #{channelName} · AI-generated work summary
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-gray-400 hover:text-gray-700 text-2xl leading-none"
            aria-label="Close Daily MOM"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">
              MOM date
            </label>
            <input
              type="date"
              value={date}
              max={getIndiaDate()}
              onChange={(event) => setDate(event.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            />
          </div>

          <button
            type="button"
            onClick={() => void generateMom()}
            disabled={generating || loading}
            className="mt-4 px-4 py-2 rounded-lg bg-signal-500 hover:bg-signal-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium"
          >
            {generating ? "Generating..." : mom ? "Regenerate MOM" : "Generate MOM"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-500">
              Loading Daily MOM...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-medium text-red-700">
                Could not load Daily MOM
              </p>
              <p className="text-xs text-red-600 mt-1 break-words">{error}</p>
            </div>
          ) : !mom ? (
            <div className="py-16 text-center">
              <div className="text-4xl mb-3">📋</div>
              <p className="font-medium text-gray-800">
                No Daily MOM for this date
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Generate one from the messages in this channel.
              </p>
            </div>
          ) : (
            <article>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {mom.title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {mom.source_message_count} messages analyzed · {mom.mom_date}
                  </p>
                </div>
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-100">
                  AI generated
                </span>
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 md:p-5">
                <div className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-800">
                  {mom.content}
                </div>
              </div>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
