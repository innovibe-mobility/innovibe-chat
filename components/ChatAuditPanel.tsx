"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Log = {
  id: string;
  user_id: string;
  action: string;
  message_id: string | null;
  channel_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type Props = {
  onClose: () => void;
};

type Profile = {
  id: string;
  full_name: string | null;
};

type Channel = {
  id: string;
  name: string;
  is_private?: boolean | null;
};

const ACTIONS: Record<
  string,
  { label: string; icon: string; tone: string }
> = {
  message_pinned: {
    label: "Pinned a message",
    icon: "📌",
    tone: "text-amber-700 bg-amber-50",
  },
  message_unpinned: {
    label: "Unpinned a message",
    icon: "📌",
    tone: "text-gray-700 bg-gray-100",
  },
  message_edited: {
    label: "Edited a message",
    icon: "✏️",
    tone: "text-blue-700 bg-blue-50",
  },
  message_deleted: {
    label: "Deleted a message",
    icon: "🗑️",
    tone: "text-red-700 bg-red-50",
  },
  message_moderated_delete: {
    label: "Deleted a message as moderator",
    icon: "🛡️",
    tone: "text-red-700 bg-red-50",
  },
  message_forwarded: {
    label: "Forwarded a message",
    icon: "↗",
    tone: "text-purple-700 bg-purple-50",
  },
};

function actionMeta(action: string) {
  return (
    ACTIONS[action] ?? {
      label: action.replaceAll("_", " "),
      icon: "•",
      tone: "text-gray-700 bg-gray-100",
    }
  );
}

export default function ChatAuditPanel({ onClose }: Props) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [channels, setChannels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [{ data: logData }, { data: profileData }, { data: channelData }] =
        await Promise.all([
          supabase
            .from("chat_audit_logs")
            .select(
              "id, user_id, action, message_id, channel_id, details, created_at"
            )
            .order("created_at", { ascending: false })
            .limit(100),
          supabase.from("profiles").select("id, full_name"),
          supabase.from("channels").select("id, name, is_private"),
        ]);

      const profileMap: Record<string, string> = {};
      (profileData as Profile[] | null)?.forEach((profile) => {
        profileMap[profile.id] = profile.full_name || "Employee";
      });

      const channelMap: Record<string, string> = {};
      (channelData as Channel[] | null)?.forEach((channel) => {
        channelMap[channel.id] = channel.is_private
          ? `@ ${channel.name}`
          : `# ${channel.name}`;
      });

      setProfiles(profileMap);
      setChannels(channelMap);
      setLogs((logData as Log[]) ?? []);
      setLoading(false);
    }

    void load();
  }, []);

  const grouped = useMemo(() => {
    const groups: Record<string, Log[]> = {};

    logs.forEach((log) => {
      const key = new Date(log.created_at).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      (groups[key] ??= []).push(log);
    });

    return Object.entries(groups);
  }, [logs]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-start justify-center px-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-graphite-900 text-white">
              🛡️
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Chat activity</h3>
              <p className="text-xs text-gray-400">
                Administrative record of message actions
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close audit activity"
          >
            ×
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto bg-gray-50/60 px-4 py-4">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">
              Loading activity…
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white py-12 text-center text-sm text-gray-400">
              No chat activity recorded yet.
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([date, entries]) => (
                <section key={date}>
                  <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                    {date}
                  </p>

                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                    {entries.map((log) => {
                      const meta = actionMeta(log.action);
                      const person = profiles[log.user_id] ?? "Employee";
                      const channel = log.channel_id
                        ? channels[log.channel_id]
                        : null;

                      return (
                        <div
                          key={log.id}
                          className="flex gap-3 border-b border-gray-100 px-4 py-3.5 last:border-b-0"
                        >
                          <div
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${meta.tone}`}
                          >
                            {meta.icon}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm text-gray-800">
                                <span className="font-semibold">{person}</span>{" "}
                                {meta.label.toLowerCase()}
                              </p>
                              <time className="shrink-0 text-[11px] text-gray-400">
                                {new Date(log.created_at).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </time>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                              {channel && <span>{channel}</span>}
                              {log.message_id && (
                                <span className="rounded bg-gray-100 px-1.5 py-0.5">
                                  message action
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
