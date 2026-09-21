"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MessageReactions from "@/components/MessageReactions";
import ChatMessageActions from "@/components/ChatMessageActions";
import MessageReadStatus from "@/components/MessageReadStatus";
import ChatNotifications from "@/components/ChatNotifications";
import PresenceDot from "@/components/PresenceDot";
import ThreadPanel from "@/components/ThreadPanel";
import ChatAuditPanel from "@/components/ChatAuditPanel";
import DailyMOMPanel from "@/components/DailyMOMPanel";
type Channel = {
  id: string;
  name: string;
  description: string | null;
  is_private?: boolean;
  created_by?: string | null;
  post_roles?: string[] | null;
};

const DEPARTMENT_NAMES = [
  "innovibe employees",
  "it",
  "r&d",
  "data analytics",
  "hr",
  "service",
];

type Message = {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
  updated_at?: string | null;
  is_deleted?: boolean;
  parent_message_id?: string | null;
  forwarded_from_message_id?: string | null;
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
  const [isAdmin, setIsAdmin] = useState(false);

  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const [channels, setChannels] = useState<Channel[]>([]);
  const [dmChannels, setDmChannels] = useState<Channel[]>([]);
  const [dmNames, setDmNames] = useState<Record<string, string>>({});

  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  
  const [replyingTo, setReplyingTo] =
    useState<Message | null>(null);

  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [profileRoles, setProfileRoles] = useState<Record<string, string>>(
    {}
  );
  const [profileActive, setProfileActive] = useState<Record<string, boolean>>(
    {}
  );

  const [departmentChannels, setDepartmentChannels] = useState<Channel[]>([]);

  const [showSidebar, setShowSidebar] = useState(false);

  // New DM / Group DM
  const [showNewDM, setShowNewDM] = useState(false);
  const [selectedDMUsers, setSelectedDMUsers] = useState<string[]>([]);

  // Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Professional chat enhancements
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [pinnedItems, setPinnedItems] = useState<
    {
      message_id: string;
      pinned_by: string;
      pinned_at: string;
      expires_at: string;
    }[]
  >([]);
  const [showPinnedList, setShowPinnedList] = useState(false);
  const [pinningMessage, setPinningMessage] = useState<Message | null>(null);
  const [pinDuration, setPinDuration] = useState<"24h" | "7d">("24h");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [showDailyMom, setShowDailyMom] = useState(false);

  const hasAdminAccess =
    isAdmin ||
    ["admin", "hr", "ceo"].includes(userRole.trim().toLowerCase());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // =========================================================
  // 1. AUTH + LOAD CHANNELS + LOAD PROFILES
  // =========================================================

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/login");
        return;
      }

      setUserId(data.session.user.id);

      supabase
        .from("profiles")
        .select("role, is_admin, company_name, company_logo_url")
        .eq("id", data.session.user.id)
        .single()
        .then(({ data: profile }) => {
          if (profile?.role) {
            setUserRole(profile.role);
          }

          setIsAdmin(profile?.is_admin === true);

          if (profile?.company_name) {
            setCompanyName(profile.company_name);
          }

          if (profile?.company_logo_url) {
            setCompanyLogo(profile.company_logo_url);
          }
        });
    });

    // Load public channels
    supabase
      .from("channels")
      .select(
        "id, name, description, is_private, created_by, post_roles"
      )
      .eq("is_private", false)
      .order("name")
      .then(({ data }) => {
        if (data) {
          const channelData = data as Channel[];

          setChannels(channelData);

          setActiveChannel(channelData[0] ?? null);
        }
      });

    // Load all employee profiles
    // Keep every profile available for existing message history,
    // but separately track active status for the New Message picker.
    supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to load profiles:", error);
          return;
        }

        if (data) {
          const map: Record<string, string> = {};
          const roleMap: Record<string, string> = {};
          const activeMap: Record<string, boolean> = {};

          data.forEach((p: any) => {
            map[p.id] = p.full_name;
            roleMap[p.id] = p.role ?? "employee";
            activeMap[p.id] = p.is_active === true;
          });

          setProfiles(map);
          setProfileRoles(roleMap);
          setProfileActive(activeMap);
        }
      });

    // Load department channels.
    // Show all six departments in the sidebar even when Supabase RLS
    // does not return a private department to the current user.
    // Real channels remain accessible only when the user has access;
    // missing/private departments are displayed as locked placeholders.
    supabase
      .from("channels")
      .select(
        "id, name, description, is_private, created_by, post_roles"
      )
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to load department channels:", error);
          return;
        }

        const returnedDepartments = ((data ?? []) as Channel[]).filter(
          (channel) =>
            DEPARTMENT_NAMES.includes(channel.name.trim().toLowerCase())
        );

        const byName = new Map(
          returnedDepartments.map((channel) => [
            channel.name.trim().toLowerCase(),
            channel,
          ])
        );

        const allDepartments: Channel[] = DEPARTMENT_NAMES.map(
          (departmentName) => {
            const existing = byName.get(departmentName);

            if (existing) {
              return existing;
            }

            const displayName =
              departmentName === "innovibe employees"
                ? "InnoVibe Employees"
                : departmentName === "it"
                  ? "IT"
                  : departmentName === "r&d"
                    ? "R&D"
                    : departmentName === "data analytics"
                      ? "Data Analytics"
                      : departmentName === "hr"
                        ? "HR"
                        : "Service";

            return {
              id: `department-placeholder:${departmentName}`,
              name: displayName,
              description: "You are not a member of this department.",
              is_private: true,
              created_by: null,
              post_roles: null,
            };
          }
        );

        setDepartmentChannels(allDepartments);
      });
  }, [router]);

  // =========================================================
  // LOAD USER'S DM CHANNELS
  // =========================================================

  async function loadDMs(
    uid: string,
    profileMap: Record<string, string>
  ) {
    const { data: memberships } = await supabase
      .from("channel_members")
      .select("channel_id")
      .eq("user_id", uid);

    const channelIds = (memberships ?? []).map(
      (m: any) => m.channel_id
    );

    if (channelIds.length === 0) {
      setDmChannels([]);
      setDmNames({});
      return;
    }

    const { data: dms } = await supabase
      .from("channels")
      .select(
        "id, name, description, is_private, created_by"
      )
      .in("id", channelIds)
      .eq("is_private", true);

    if (!dms) return;

    // Department channels are private channels too, so keep them out of
    // Direct Messages. They are displayed in the Departments section.
    const directMessageChannels = (dms as Channel[]).filter(
      (channel) =>
        !DEPARTMENT_NAMES.includes(channel.name.trim().toLowerCase())
    );

    setDmChannels(directMessageChannels);

    const names: Record<string, string> = {};

    for (const dm of directMessageChannels) {
      const { data: members } = await supabase
        .from("channel_members")
        .select("user_id")
        .eq("channel_id", dm.id)
        .neq("user_id", uid);

      const memberNames = (members ?? [])
        .map(
          (member: any) =>
            profileMap[member.user_id] ?? "Employee"
        )
        .filter(Boolean);

      names[dm.id] =
        memberNames.length > 0
          ? memberNames.join(", ")
          : "Direct Message";
    }

    setDmNames(names);
  }

  useEffect(() => {
    if (userId && Object.keys(profiles).length > 0) {
      loadDMs(userId, profiles);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profiles]);

  // =========================================================
  // START ONE-TO-ONE DM
  // =========================================================

  async function startDM(otherUserId: string) {
    if (!userId) return;

    const dmName = `dm-${[userId, otherUserId].sort().join("-")}`;

    const { data: existing } = await supabase
      .from("channels")
      .select(
        "id, name, description, is_private, created_by"
      )
      .eq("name", dmName)
      .maybeSingle();

    let channel = existing as Channel | null;

    if (!channel) {
      const { data: created, error } = await supabase
        .from("channels")
        .insert({
          name: dmName,
          is_private: true,
          created_by: userId,
        })
        .select()
        .single();

      if (error || !created) {
        alert(
          `Couldn't start this DM: ${
            error?.message ?? "unknown error"
          }`
        );
        return;
      }

      channel = created as Channel;

      const { error: memberError } = await supabase
        .from("channel_members")
        .insert([
          {
            channel_id: channel.id,
            user_id: userId,
          },
          {
            channel_id: channel.id,
            user_id: otherUserId,
          },
        ]);

      if (memberError) {
        alert(
          `Couldn't fully set up this DM: ${memberError.message}\n\nMake sure supabase/update-dm-policy.sql has been run in Supabase.`
        );
        return;
      }

      setDmNames((prev) => ({
        ...prev,
        [channel!.id]:
          profiles[otherUserId] ?? "Employee",
      }));

      setDmChannels((prev) => [
        ...prev,
        channel!,
      ]);
    }

    setActiveChannel(channel);
    setShowNewDM(false);
    setSelectedDMUsers([]);
    setShowSidebar(false);
  }

  // =========================================================
  // START GROUP DM
  // =========================================================

  async function startGroupDM() {
    if (!userId) return;

    if (selectedDMUsers.length < 2) {
      alert("Select at least 2 people for a group DM.");
      return;
    }

    const selectedNames = selectedDMUsers
      .map((id) => profiles[id] ?? "Employee")
      .filter(Boolean);

    const groupName = `group-${crypto.randomUUID()}`;

    const { data: created, error: channelError } =
      await supabase
        .from("channels")
        .insert({
          name: groupName,
          description: selectedNames.join(", "),
          is_private: true,
          created_by: userId,
        })
        .select()
        .single();

    if (channelError || !created) {
      alert(
        `Couldn't create group DM: ${
          channelError?.message ?? "unknown error"
        }`
      );
      return;
    }

    const memberRows = [
      userId,
      ...selectedDMUsers,
    ].map((id) => ({
      channel_id: created.id,
      user_id: id,
    }));

    const { error: memberError } = await supabase
      .from("channel_members")
      .insert(memberRows);

    if (memberError) {
      await supabase
        .from("channels")
        .delete()
        .eq("id", created.id);

      alert(
        `Couldn't add group members: ${memberError.message}`
      );

      return;
    }

    const groupChannel = created as Channel;

    setDmChannels((prev) => [
      ...prev,
      groupChannel,
    ]);

    setDmNames((prev) => ({
      ...prev,
      [groupChannel.id]:
        selectedNames.join(", "),
    }));

    setActiveChannel(groupChannel);

    setSelectedDMUsers([]);
    setShowNewDM(false);
    setShowSidebar(false);
  }

  // =========================================================
  // SEARCH
  // =========================================================

  async function runSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);

    const { data } = await supabase
      .from("messages")
      .select(
        "id, channel_id, sender_id, content, created_at"
      )
      .ilike(
        "content",
        `%${searchQuery.trim()}%`
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(30);

    setSearchResults(
      (data as SearchResult[]) ?? []
    );

    setSearching(false);
  }

  function jumpToSearchResult(
    result: SearchResult
  ) {
    const all = [...channels, ...dmChannels];

    const found = all.find(
      (c) => c.id === result.channel_id
    );

    if (found) {
      setActiveChannel(found);
      setShowSearch(false);
      setSearchQuery("");
      setSearchResults([]);
    }
  }

  // =========================================================
  // LOAD MESSAGES + REALTIME
  // =========================================================

  useEffect(() => {
    if (!activeChannel) return;

    supabase
      .from("messages")
      .select("*")
      .eq("channel_id", activeChannel.id)
      .order("created_at", {
        ascending: true,
      })
      .then(({ data }) => {
        if (data) {
          setMessages(data as Message[]);
        }
      });

    const channel = supabase
      .channel(
        `messages:${activeChannel.id}`
      )
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

          if (incoming.channel_id !== activeChannel.id) {
            return;
          }

          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id)
              ? prev
              : [...prev, incoming]
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${activeChannel.id}`,
        },
        (payload) => {
          const updated = payload.new as Message;

          setMessages((prev) =>
            prev.map((m) =>
              m.id === updated.id ? updated : m
            )
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${activeChannel.id}`,
        },
        (payload) => {
          const deleted = payload.old as Message;

          setMessages((prev) =>
            prev.filter((m) => m.id !== deleted.id)
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChannel]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  // =========================================================
  // PROFESSIONAL CHAT ENHANCEMENTS
  // =========================================================

  async function loadPinnedMessages(channelId: string) {
    const messageIds = messages.map((m) => m.id);

    if (messageIds.length === 0) {
      setPinnedMessageIds([]);
      setPinnedItems([]);
      return;
    }

    await supabase
      .from("pinned_messages")
      .delete()
      .in("message_id", messageIds)
      .lte("expires_at", new Date().toISOString());

    const { data, error } = await supabase
      .from("pinned_messages")
      .select("message_id, pinned_by, pinned_at, expires_at")
      .in("message_id", messageIds)
      .order("pinned_at", { ascending: true });

    if (error) {
      console.error("Failed to load pinned messages:", error);
      return;
    }

    const rows = (data ?? []) as {
      message_id: string;
      pinned_by: string;
      pinned_at: string;
      expires_at: string;
    }[];

    setPinnedItems(rows);
    setPinnedMessageIds(rows.map((row) => row.message_id));
  }

  async function pinMessage() {
    if (!pinningMessage || !userId) return;

    const durationMs =
      pinDuration === "24h"
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMs).toISOString();

    await supabase
      .from("pinned_messages")
      .delete()
      .eq("message_id", pinningMessage.id);

    const { error } = await supabase
      .from("pinned_messages")
      .insert({
        message_id: pinningMessage.id,
        pinned_by: userId,
        pinned_at: now.toISOString(),
        expires_at: expiresAt,
      });

    if (error) {
      alert(`Couldn't pin message: ${error.message}`);
      return;
    }

    setPinnedMessageIds((prev) =>
      prev.includes(pinningMessage.id)
        ? prev
        : [...prev, pinningMessage.id]
    );

    setPinnedItems((prev) => [
      ...prev.filter((item) => item.message_id !== pinningMessage.id),
      {
        message_id: pinningMessage.id,
        pinned_by: userId,
        pinned_at: now.toISOString(),
        expires_at: expiresAt,
      },
    ]);

    await writeAudit(
      "message_pinned",
      pinningMessage.id,
      pinningMessage.channel_id,
      {
        duration: pinDuration,
        expires_at: expiresAt,
      }
    );

    setPinningMessage(null);
  }

  function openPinPicker(message: Message) {
    setPinDuration("24h");
    setPinningMessage(message);
  }


  function jumpToMessage(messageId: string) {
    setShowPinnedList(false);

    const element = document.getElementById(`message-${messageId}`);

    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      element.classList.add("ring-2", "ring-signal-500", "rounded-xl");

      window.setTimeout(() => {
        element.classList.remove(
          "ring-2",
          "ring-signal-500",
          "rounded-xl"
        );
      }, 1800);
    }
  }


  async function markMessagesRead(list: Message[], uid: string) {
    const unread = list
      .filter((m) => m.sender_id !== uid)
      .map((m) => ({
        message_id: m.id,
        user_id: uid,
      }));

    if (unread.length === 0) return;

    const { error } = await supabase
      .from("message_reads")
      .upsert(unread, { onConflict: "message_id,user_id" });

    if (error) {
      console.error("Failed to mark messages read:", error);
    }
  }

  async function writeAudit(
    action: string,
    messageId?: string,
    channelId?: string,
    details: Record<string, unknown> = {}
  ) {
    if (!userId) return;

    const { error } = await supabase.from("chat_audit_logs").insert({
      user_id: userId,
      action,
      message_id: messageId ?? null,
      channel_id: channelId ?? null,
      details,
    });

    if (error) {
      console.error("Audit log failed:", error);
    }
  }

  async function togglePin(message: Message) {
    if (!userId) return;

    const isPinned = pinnedMessageIds.includes(message.id);

    if (isPinned) {
      const { error } = await supabase
        .from("pinned_messages")
        .delete()
        .eq("message_id", message.id);

      if (error) {
        alert(`Couldn't unpin message: ${error.message}`);
        return;
      }

      setPinnedMessageIds((prev) =>
        prev.filter((id) => id !== message.id)
      );
      setPinnedItems((prev) =>
        prev.filter((item) => item.message_id !== message.id)
      );

      await writeAudit(
        "message_unpinned",
        message.id,
        message.channel_id
      );
    } else {
      openPinPicker(message);
    }
  }


  function startEdit(message: Message) {
    if (!message.content) return;

    setEditingMessageId(message.id);
    setEditDraft(message.content);
  }

  async function saveEdit(message: Message) {
    if (!userId || !editDraft.trim()) return;

    const { error } = await supabase
      .from("messages")
      .update({
        content: editDraft.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", message.id)
      .eq("sender_id", userId);

    if (error) {
      alert(`Couldn't edit message: ${error.message}`);
      return;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? {
              ...m,
              content: editDraft.trim(),
              updated_at: new Date().toISOString(),
            }
          : m
      )
    );

    await writeAudit(
      "message_edited",
      message.id,
      message.channel_id
    );

    setEditingMessageId(null);
    setEditDraft("");
  }

  async function deleteMessage(message: Message) {
    if (!userId) return;

    const confirmed = window.confirm(
      "Delete this message? The message will remain in the conversation as deleted."
    );

    if (!confirmed) return;

    const isModerator = ["admin", "hr", "ceo"].includes(
      userRole.trim().toLowerCase()
    );

    let query = supabase
      .from("messages")
      .update({
        is_deleted: true,
        content: null,
        file_url: null,
        file_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", message.id);

    if (!isModerator) {
      query = query.eq("sender_id", userId);
    }

    const { error } = await query;

    if (error) {
      alert(`Couldn't delete message: ${error.message}`);
      return;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.id === message.id
          ? {
              ...m,
              is_deleted: true,
              content: null,
              file_url: null,
              file_name: null,
              updated_at: new Date().toISOString(),
            }
          : m
      )
    );

    await writeAudit(
      isModerator ? "message_moderated_delete" : "message_deleted",
      message.id,
      message.channel_id
    );
  }

  async function forwardMessageToChannel(
    targetChannel: Channel
  ) {
    if (!forwardingMessage || !userId) return;

    const originalText =
      forwardingMessage.content ??
      (forwardingMessage.file_name
        ? `📎 ${forwardingMessage.file_name}`
        : "Message");

    const { error } = await supabase.from("messages").insert({
      channel_id: targetChannel.id,
      sender_id: userId,
      content: `↗ Forwarded message\n\n${originalText}`,
      file_url: forwardingMessage.file_url,
      file_name: forwardingMessage.file_name,
      forwarded_from_message_id: forwardingMessage.id,
    });

    if (error) {
      alert(`Couldn't forward message: ${error.message}`);
      return;
    }

    await writeAudit(
      "message_forwarded",
      forwardingMessage.id,
      targetChannel.id,
      {
        forwarded_from_message_id: forwardingMessage.id,
        target_channel_id: targetChannel.id,
      }
    );

    setForwardingMessage(null);

    if (activeChannel?.id !== targetChannel.id) {
      setActiveChannel(targetChannel);
    }
  }

  async function setPresence(status: "online" | "offline") {
    if (!userId) return;

    const { error } = await supabase
      .from("user_presence")
      .upsert(
        {
          user_id: userId,
          status,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("Presence update failed:", error);
    }
  }

  // Keep the current employee marked online while the dashboard is open.
  useEffect(() => {
    if (!userId) return;

    setPresence("online");

    const interval = window.setInterval(() => {
      setPresence("online");
    }, 60_000);

    const handleBeforeUnload = () => {
      void setPresence("offline");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      void setPresence("offline");
    };
  }, [userId]);

  useEffect(() => {
    if (!activeChannel || messages.length === 0 || !userId) return;

    void markMessagesRead(messages, userId);
    void loadPinnedMessages(activeChannel.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel?.id, messages.length, userId]);

  // =========================================================
  // CHECK WHETHER USER CAN POST
  // =========================================================

  function canPostHere(): boolean {
    if (!activeChannel) return false;

    // DMs and group DMs
    if (activeChannel.is_private) {
      return true;
    }

    // Public channel without restrictions
    if (
      !activeChannel.post_roles ||
      activeChannel.post_roles.length === 0
    ) {
      return true;
    }

    const normalizedUserRole =
      userRole.trim().toLowerCase();

    return activeChannel.post_roles
      .map((r) =>
        r.trim().toLowerCase()
      )
      .includes(normalizedUserRole);
  }

  // =========================================================
  // SEND MESSAGE
  // =========================================================

  async function sendMessage() {
    if (!activeChannel || !userId) return;

    if (!draft.trim() && !file) return;

    setSending(true);

    let file_url: string | null = null;
    let file_name: string | null = null;

    // Upload file if selected
    if (file) {
      const path = `${activeChannel.id}/${Date.now()}-${file.name}`;

      const { error: uploadError } =
        await supabase.storage
          .from("chat-files")
          .upload(path, file);

      if (uploadError) {
        alert(
          `File upload failed: ${uploadError.message}`
        );

        setSending(false);
        return;
      }

      const { data } =
        supabase.storage
          .from("chat-files")
          .getPublicUrl(path);

      file_url = data.publicUrl;
      file_name = file.name;
    }

    const {
      data: sentMessage,
      error: sendError,
    } = await supabase
      .from("messages")
      .insert({
        channel_id: activeChannel.id,
        sender_id: userId,
        content: draft.trim() || null,
        file_url,
        file_name,
        parent_message_id:
          replyingTo?.id ?? null,
      })
      .select()
      .single();

    if (sendError) {
      alert(
        `Message failed to send: ${sendError.message}`
      );

      setSending(false);
      return;
    }

    // Show immediately for sender
    if (sentMessage) {
      setMessages((prev) =>
        prev.some(
          (m) => m.id === sentMessage.id
        )
          ? prev
          : [
              ...prev,
              sentMessage as Message,
            ]
      );
    }

    setDraft("");
    setFile(null);
    setReplyingTo(null);
    setSending(false);
  }

  // =========================================================
  // START RECORDING
  // =========================================================

  async function startRecording() {
    const confirmed = window.confirm(
      "This will record this call's audio and generate an AI summary that gets posted to this channel. Make sure everyone on the call knows it's being recorded. Continue?"
    );

    if (!confirmed) return;

    try {
      const stream =
        await (
          navigator.mediaDevices as any
        ).getDisplayMedia({
          video: true,
          audio: true,
        });

      const audioTracks =
        stream.getAudioTracks();

      if (audioTracks.length === 0) {
        alert(
          'No audio was shared. When the picker opens, make sure to check "Share tab audio" (or "Share system audio"), otherwise there\'s nothing to transcribe.'
        );

        stream
          .getTracks()
          .forEach((t: MediaStreamTrack) =>
            t.stop()
          );

        return;
      }

      const audioOnlyStream =
        new MediaStream(audioTracks);

      const recorder =
        new MediaRecorder(
          audioOnlyStream
        );

      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunksRef.current.push(
            e.data
          );
        }
      };

      recorder.onstop = () => {
        stream
          .getTracks()
          .forEach((t: MediaStreamTrack) =>
            t.stop()
          );
      };

      recorder.start();

      mediaRecorderRef.current =
        recorder;

      setIsRecording(true);
    } catch (err: any) {
      alert(
        `Couldn't start recording: ${
          err?.message ??
          "permission denied"
        }`
      );
    }
  }

  // =========================================================
  // STOP RECORDING + AI SUMMARY
  // =========================================================

  async function stopRecordingAndSummarize() {
    const recorder =
      mediaRecorderRef.current;

    if (
      !recorder ||
      !activeChannel ||
      !userId
    ) {
      return;
    }

    setIsRecording(false);
    setIsSummarizing(true);

    recorder.stop();

    await new Promise((resolve) => {
      recorder.onstop = resolve;
    });

    const audioBlob = new Blob(
      recordedChunksRef.current,
      {
        type: "audio/webm",
      }
    );

    try {
      const formData = new FormData();

      formData.append(
        "audio",
        audioBlob,
        "call.webm"
      );

      const res = await fetch(
        "/api/summarize-call",
        {
          method: "POST",
          body: formData,
        }
      );

      const result = await res.json();

      if (!res.ok) {
        alert(
          `Couldn't generate summary: ${result.error}`
        );

        setIsSummarizing(false);
        return;
      }

      // Save summary
      await supabase
        .from("call_summaries")
        .insert({
          channel_id:
            activeChannel.id,
          created_by: userId,
          transcript:
            result.transcript,
          summary:
            result.summary,
        });

      // Post summary into chat
      await supabase
        .from("messages")
        .insert({
          channel_id:
            activeChannel.id,
          sender_id: userId,
          content: `📋 **Call Summary**\n\n${result.summary}`,
        });
    } catch (err: any) {
      alert(
        `Something went wrong generating the summary: ${err?.message}`
      );
    } finally {
      setIsSummarizing(false);
    }
  }

  // =========================================================
  // SIGN OUT
  // =========================================================

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <div className="flex h-screen relative overflow-hidden bg-[#0B0F1A] text-[#E6EAF2] font-[system-ui,-apple-system,'Segoe_UI',sans-serif] antialiased">

      {/* ============ BACKGROUND ============ */}
      {/* Layered, restrained: one soft gradient, one subtle vignette, faint grain */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_70%_at_50%_-10%,#16203A_0%,#0B0F1A_55%,#080B14_100%)]" />
        <div className="absolute -top-32 left-1/4 h-[500px] w-[500px] rounded-full bg-[#4F6BFF]/[0.07] blur-[140px]" />
        <div className="absolute bottom-[-160px] right-1/4 h-[520px] w-[520px] rounded-full bg-[#8B7CFF]/[0.06] blur-[150px]" />
        {/* Faint film grain */}
        <div
          className="absolute inset-0 opacity-[0.02] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
      </div>

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-30
          w-[19rem] flex flex-col
          bg-[#0A0E18]/85 backdrop-blur-2xl
          border-r border-white/[0.06]
          transform transition-transform duration-300 ease-out
          ${
            showSidebar
              ? "translate-x-0"
              : "-translate-x-full"
          }
          md:translate-x-0
        `}
      >
        {/* Logo */}
        <div className="px-5 py-5 flex items-center justify-between border-b border-white/[0.05]">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={
                userRole === "vendor" &&
                companyLogo
                  ? companyLogo
                  : "/innovibe-logo.png"
              }
              alt={
                userRole === "vendor" &&
                companyName
                  ? companyName
                  : "InnoVibe Mobility"
              }
              className="h-9 w-auto rounded-lg bg-white/95 px-2.5 py-1 object-contain"
            />
            <div className="leading-tight min-w-0">
              <p className="text-[13px] font-semibold tracking-tight text-white truncate">
                {userRole === "vendor" && companyName
                  ? companyName
                  : "InnoVibe"}
              </p>
              <p className="text-[10px] tracking-[0.16em] uppercase text-white/35">
                Workspace
              </p>
            </div>
          </div>

          <button
            onClick={() =>
              setShowSidebar(false)
            }
            className="md:hidden text-white/50 hover:text-white text-xl leading-none rounded-lg p-1.5 hover:bg-white/5 transition"
            aria-label="Close menu"
          >
            ×
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">

          {/* Section label */}
          <div className="px-2.5 pb-2 text-[10px] tracking-[0.18em] uppercase text-white/30 font-semibold">
            Channels
          </div>

          {/* Public channels */}
          <div className="space-y-0.5">
            {channels
              .filter(
                (c) => {
                  const hiddenChannels = [
                    "service-team",
                    "technicians",
                    "vendors",
                    "innovibe employees",
                    "it",
                    "r&d",
                    "data analytics",
                    "hr",
                    "service",
                  ];

                  return !hiddenChannels.includes(
                    c.name.trim().toLowerCase()
                  );
                }
              )
              .map((c) => {
                const active = activeChannel?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveChannel(c);
                    setShowSidebar(false);
                  }}
                  className={`
                    group relative w-full text-left px-3 py-2 text-[13.5px] rounded-lg
                    transition-colors duration-150
                    ${
                      active
                        ? "bg-white/[0.07] text-white font-medium"
                        : "text-white/60 hover:text-white hover:bg-white/[0.04]"
                    }
                  `}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r-full bg-[#6C8AFF]" />
                  )}
                  <span className="flex items-center gap-2">
                    <span className={`text-[14px] ${active ? "text-[#6C8AFF]" : "text-white/30 group-hover:text-white/50"} transition-colors`}>#</span>
                    <span className="truncate">{c.name}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Departments */}
          <div className="mt-6 px-2.5 pb-2 text-[10px] tracking-[0.18em] uppercase text-white/30 font-semibold">
            Departments
          </div>

          <div className="space-y-0.5">
            {departmentChannels.map((department) => {
              const isPlaceholder = department.id.startsWith(
                "department-placeholder:"
              );
              const active =
                !isPlaceholder && activeChannel?.id === department.id;

              return (
                <button
                  key={department.id}
                  type="button"
                  disabled={isPlaceholder}
                  title={
                    isPlaceholder
                      ? "You are not a member of this department"
                      : department.name
                  }
                  onClick={() => {
                    if (isPlaceholder) return;
                    setActiveChannel(department);
                    setShowSidebar(false);
                  }}
                  className={`
                    group relative w-full text-left px-3 py-2 text-[13.5px] rounded-lg
                    transition-colors duration-150
                    ${
                      active
                        ? "bg-white/[0.07] text-white font-medium"
                        : isPlaceholder
                          ? "text-white/25 cursor-not-allowed"
                          : "text-white/60 hover:text-white hover:bg-white/[0.04]"
                    }
                  `}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r-full bg-[#6C8AFF]" />
                  )}

                  <span className="flex items-center gap-2">
                    <span
                      className={`text-[14px] ${
                        active
                          ? "text-[#6C8AFF]"
                          : isPlaceholder
                            ? "text-white/20"
                            : "text-white/30 group-hover:text-white/50"
                      } transition-colors`}
                    >
                      #
                    </span>
                    <span className="truncate">{department.name}</span>
                    {isPlaceholder && (
                      <span className="ml-auto text-[11px] text-white/20" aria-label="Locked">
                        🔒
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Direct Messages header */}
          <div className="mt-6 px-2.5 pb-2 flex items-center justify-between text-[10px] tracking-[0.18em] uppercase text-white/30 font-semibold">
            <span>Direct Messages</span>

            <button
              onClick={() => {
                setShowNewDM(true);
                setSelectedDMUsers([]);
              }}
              className="flex items-center justify-center h-5 w-5 rounded-md text-white/40 hover:text-white hover:bg-white/[0.08] text-base leading-none transition"
              aria-label="Start a new direct message"
              title="Start a new direct message"
            >
              <span className="translate-y-[-1px]">+</span>
            </button>
          </div>

          {/* DM channels */}
          <div className="space-y-0.5">
            {dmChannels.map((c) => {
              const active = activeChannel?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setActiveChannel(c);
                    setShowSidebar(false);
                  }}
                  className={`
                    group relative w-full text-left px-3 py-2 text-[13.5px] rounded-lg
                    transition-colors duration-150
                    ${
                      active
                        ? "bg-white/[0.07] text-white font-medium"
                        : "text-white/60 hover:text-white hover:bg-white/[0.04]"
                    }
                  `}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r-full bg-[#6C8AFF]" />
                  )}
                  <span className="flex items-center gap-2">
                    {(() => {
                      const memberId = Object.entries(profiles).find(
                        ([id, name]) => name === (dmNames[c.id] ?? "")
                      )?.[0];

                      return memberId ? <PresenceDot userId={memberId} /> : null;
                    })()}
                    <span className={`text-[14px] ${active ? "text-[#6C8AFF]" : "text-white/30 group-hover:text-white/50"} transition-colors`}>@</span>
                    <span className="truncate">{dmNames[c.id] ?? "Employee"}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Vendor Management — CEO / HR only */}
          {hasAdminAccess && (
            <div className="mt-6 px-2.5">
              <div className="pb-2 text-[10px] tracking-[0.18em] uppercase text-white/30 font-semibold">
                Administration
              </div>

              <a
                href="/admin/vendors"
                onClick={() => setShowSidebar(false)}
                className="
                  group relative w-full flex items-center gap-3
                  rounded-xl px-3 py-2.5
                  text-[13.5px] text-white/65
                  bg-white/[0.025]
                  border border-white/[0.06]
                  hover:bg-white/[0.07]
                  hover:text-white
                  hover:border-[#53D2DB]/20
                  transition-all duration-200
                "
              >
                <span
                  className="
                    flex h-9 w-9 shrink-0 items-center justify-center
                    rounded-lg
                    bg-gradient-to-br from-[#53D2DB]/15 to-[#4F8FBF]/15
                    border border-[#53D2DB]/10
                    text-base
                    group-hover:scale-105
                    transition-transform duration-200
                  "
                >
                  🏢
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-medium truncate">
                    Vendor Management
                  </span>
                  <span className="block mt-0.5 text-[10px] text-white/35 truncate">
                    Applications & vendor chats
                  </span>
                </span>

                <span className="shrink-0 text-white/25 group-hover:text-[#53D2DB] transition-colors">
                  →
                </span>
              </a>
            </div>
          )}
        </nav>

        {/* Sign out */}
        <div className="p-3 border-t border-white/[0.05]">
          <button
            onClick={signOut}
            className="group w-full flex items-center gap-3 px-3 py-2.5 text-[13.5px] text-white/55 hover:text-white rounded-lg hover:bg-white/[0.04] transition-colors duration-150"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="font-medium">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-[#060810]/70 backdrop-blur-sm z-20 md:hidden"
          onClick={() =>
            setShowSidebar(false)
          }
        />
      )}

      {/* =====================================================
          MAIN CHAT
      ===================================================== */}

      <main className="relative flex-1 flex flex-col w-full min-w-0 overflow-hidden">

        {/* Header */}
        <header className="sticky top-0 z-20 border-b border-white/[0.06] px-3 md:px-6 py-3 bg-[#0A0E18]/70 backdrop-blur-2xl flex items-center gap-3">

          {/* Mobile menu */}
          <button
            onClick={() =>
              setShowSidebar(true)
            }
            className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.06] border border-white/[0.06] transition-colors"
            aria-label="Open channel menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Channel name */}
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-[14.5px] text-white truncate flex items-center gap-1.5">
              {activeChannel?.is_private ? (
                <>
                  <span className="text-white/40">@</span>
                  {dmNames[activeChannel.id] ?? "Employee"}
                </>
              ) : (
                <>
                  <span className="text-white/40">#</span>
                  {activeChannel?.name ?? "..."}
                </>
              )}
            </h2>

            {activeChannel?.description &&
              !activeChannel?.is_private && (
                <p className="text-xs text-white/40 truncate mt-0.5">
                  {
                    activeChannel.description
                  }
                </p>
              )}
          </div>

          {/* Header action cluster */}
          <div className="flex items-center gap-1.5">

            {/* Notifications */}
            {userId && <ChatNotifications userId={userId} />}

            {/* Audit log for chat managers */}
            {hasAdminAccess && (
              <button
                type="button"
                onClick={() => setShowAudit(true)}
                className="shrink-0 text-xs md:text-[12.5px] text-white/70 hover:text-white rounded-lg px-2.5 py-2 flex items-center hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition-all duration-150"
                title="Open chat audit log"
              >
                <span className="text-[14px] leading-none">🛡️</span>
                <span className="hidden sm:inline ml-1.5 font-medium">Audit</span>
              </button>
            )}

            {/* Daily MOM */}
            {activeChannel && (
              <button
                type="button"
                onClick={() => setShowDailyMom(true)}
                className="shrink-0 text-xs md:text-[12.5px] text-white/70 hover:text-white rounded-lg px-2.5 py-2 flex items-center hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition-all duration-150"
                title="Generate or view the Daily MOM"
              >
                <span className="text-[14px] leading-none">📋</span>
                <span className="hidden sm:inline ml-1.5 font-medium">Daily MOM</span>
              </button>
            )}

            {/* AI Assistant */}
            <button
              type="button"
              onClick={() =>
                router.push(
                  activeChannel
                    ? `/ai-assistant?channel_id=${encodeURIComponent(activeChannel.id)}`
                    : "/ai-assistant"
                )
              }
              className="shrink-0 text-xs md:text-[12.5px] font-semibold text-white rounded-lg px-3 py-2 flex items-center gap-1.5 bg-gradient-to-b from-[#5B78FF] to-[#4A63E8] hover:from-[#6B86FF] hover:to-[#5570F0] shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_4px_14px_-6px_rgba(91,120,255,0.7)] transition-all duration-150"
              title="Open AI Assistant"
            >
              <span className="text-[14px] leading-none">🤖</span>
              <span className="hidden sm:inline">AI Assistant</span>
            </button>

            {/* Search */}
            <button
              onClick={() =>
                setShowSearch(true)
              }
              className="shrink-0 flex items-center justify-center text-xs md:text-[12.5px] text-white/70 hover:text-white rounded-lg px-2.5 py-2 hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] transition-all duration-150"
              title="Search messages"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>

            {/* Jitsi Call */}
            {activeChannel && (
              <a
                href={`https://meet.jit.si/InnoVibe-${activeChannel.name}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-xs md:text-[12.5px] font-semibold text-white rounded-lg px-3 py-2 flex items-center gap-1.5 bg-gradient-to-b from-[#3D9BD6] to-[#2C7BB0] hover:from-[#4DABE6] hover:to-[#3588C0] shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_4px_14px_-6px_rgba(61,155,214,0.7)] transition-all duration-150"
                title="Start a free video/audio call for this channel"
              >
                <span className="text-[14px] leading-none">📹</span>
                <span className="hidden sm:inline">Call</span>
              </a>
            )}

            {/* Record */}
            {activeChannel &&
              !isRecording &&
              !isSummarizing && (
                <button
                  onClick={startRecording}
                  className="shrink-0 text-xs md:text-[12.5px] font-semibold text-[#0B0F1A] rounded-lg px-3 py-2 flex items-center gap-1.5 bg-gradient-to-b from-[#F0D9A8] to-[#E0BE7E] hover:from-[#F5E2BC] hover:to-[#E8C98E] shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_4px_14px_-6px_rgba(224,190,126,0.6)] transition-all duration-150"
                  title='Record the call tab (choose "share tab audio" when prompted) and generate a summary afterward'
                >
                  <span className="text-[14px] leading-none">🎙️</span>
                  <span className="hidden sm:inline">Record</span>
                </button>
              )}

            {/* Stop recording */}
            {isRecording && (
              <button
                onClick={
                  stopRecordingAndSummarize
                }
                className="shrink-0 text-xs md:text-[12.5px] font-semibold text-white rounded-lg px-3 py-2 flex items-center gap-1.5 bg-gradient-to-b from-[#E0574F] to-[#C43E37] hover:from-[#EC6660] hover:to-[#CF4A43] shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_4px_14px_-6px_rgba(196,62,55,0.7)] transition-all duration-150"
                title="Stop recording and generate a summary"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-70" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
                <span className="hidden sm:inline">Stop & Summarize</span>
              </button>
            )}

            {/* Summarizing */}
            {isSummarizing && (
              <span className="shrink-0 text-xs md:text-[12.5px] text-white/60 flex items-center gap-2 px-2.5 py-2 rounded-lg border border-white/[0.08]">
                <svg className="animate-spin h-3.5 w-3.5 text-white/50" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <span className="hidden sm:inline font-medium">Summarizing…</span>
              </span>
            )}
          </div>
        </header>

        {/* =================================================
            PINNED MESSAGE BAR
        ================================================= */}
        {pinnedItems.length > 0 && (
          <div className="relative border-b border-amber-500/15 bg-amber-400/[0.04]">
            <button
              type="button"
              onClick={() => {
                if (pinnedItems.length === 1) {
                  jumpToMessage(pinnedItems[0].message_id);
                } else {
                  setShowPinnedList((value) => !value);
                }
              }}
              className="w-full px-4 md:px-6 py-2.5 flex items-center gap-3 text-left hover:bg-amber-400/[0.06] transition-colors duration-150"
            >
              <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center">
                <span className="text-[13px]">📌</span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-semibold text-amber-200/90 tracking-[0.1em] uppercase">
                  Pinned
                  {pinnedItems.length > 1
                    ? ` · ${pinnedItems.length}`
                    : ""}
                </p>

                {(() => {
                  const latestPin =
                    pinnedItems[pinnedItems.length - 1];
                  const pinnedMessage = messages.find(
                    (message) =>
                      message.id === latestPin.message_id
                  );

                  if (!pinnedMessage) {
                    return (
                      <p className="text-xs text-white/50 truncate mt-0.5">
                        View pinned message
                      </p>
                    );
                  }

                  const pinnedName =
                    pinnedMessage.sender_id === userId
                      ? "You"
                      : profiles[pinnedMessage.sender_id] ??
                        "Employee";

                  const preview =
                    pinnedMessage.content ??
                    (pinnedMessage.file_name
                      ? `📎 ${pinnedMessage.file_name}`
                      : "Message");

                  return (
                    <>
                      <p className="text-xs text-white/75 truncate mt-0.5">
                      <span className="font-medium text-white/90">
                        {pinnedName}:
                      </span>{" "}
                      {preview}
                    </p>
                    <p className="text-[10px] text-white/35 mt-0.5">
                      {(() => {
                        const remaining =
                          new Date(latestPin.expires_at).getTime() -
                          Date.now();
                        const hours = Math.max(
                          0,
                          Math.ceil(remaining / (60 * 60 * 1000))
                        );
                        return hours >= 24
                          ? `Expires in ${Math.ceil(hours / 24)} day${Math.ceil(hours / 24) === 1 ? "" : "s"}`
                          : `Expires in ${hours} hour${hours === 1 ? "" : "s"}`;
                      })()}
                    </p>
                    </>
                  );
                })()}
              </div>

              <span className="shrink-0 text-white/40 text-sm">
                {pinnedItems.length > 1 ? "⌄" : "›"}
              </span>
            </button>

            {showPinnedList && pinnedItems.length > 1 && (
              <div className="absolute left-3 right-3 md:left-6 md:right-6 top-full z-40 mt-1.5 rounded-xl border border-white/[0.08] bg-[#0E1320]/95 backdrop-blur-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.7)] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/70">
                    Pinned messages
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPinnedList(false)}
                    className="text-white/40 hover:text-white text-lg leading-none transition"
                  >
                    ×
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {pinnedItems
                    .slice()
                    .reverse()
                    .map((pin) => {
                      const pinnedMessage = messages.find(
                        (message) =>
                          message.id === pin.message_id
                      );

                      if (!pinnedMessage) return null;

                      const pinnedName =
                        pinnedMessage.sender_id === userId
                          ? "You"
                          : profiles[pinnedMessage.sender_id] ??
                            "Employee";

                      const preview =
                        pinnedMessage.content ??
                        (pinnedMessage.file_name
                          ? `📎 ${pinnedMessage.file_name}`
                          : "Message");

                      const pinnedBy =
                        pin.pinned_by === userId
                          ? "You"
                          : profiles[pin.pinned_by] ?? "Employee";

                      return (
                        <button
                          key={pin.message_id}
                          type="button"
                          onClick={() =>
                            jumpToMessage(pin.message_id)
                          }
                          className="w-full px-4 py-3 text-left hover:bg-white/[0.04] border-b border-white/[0.04] last:border-b-0 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold text-white/90 truncate">
                              {pinnedName}
                            </p>
                            <span className="text-[10px] text-white/35 shrink-0">
                              Pinned by {pinnedBy}
                            </span>
                          </div>
                          <p className="text-xs text-white/55 truncate mt-0.5">
                            {preview}
                          </p>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================================================
            MESSAGES
        ================================================= */}

        <div className="relative z-10 flex-1 overflow-y-auto px-3 md:px-10 py-8 space-y-5">

          {messages.map((m) => {
            const isMine =
              m.sender_id === userId;

            const name = isMine
              ? "You"
              : profiles[m.sender_id] ??
                "Employee";

            const role =
              profileRoles[m.sender_id];

            const initials = (
              profiles[m.sender_id] ??
              "E"
            )
              .slice(0, 1)
              .toUpperCase();

            return (
              <div
                id={`message-${m.id}`}
                key={m.id}
                className={`
                  group flex items-end gap-2.5
                  animate-fade-up
                  ${
                    isMine
                      ? "flex-row-reverse"
                      : ""
                  }
                `}
              >
                {/* Avatar */}
                {!isMine && (
                  <div className="w-8 h-8 rounded-full bg-white/[0.06] border border-white/[0.08] text-white/70 text-[11px] font-semibold flex items-center justify-center shrink-0 mb-0.5">
                    {initials}
                  </div>
                )}

                <div
                  className={`
                    max-w-[78%] md:max-w-md
                    ${
                      isMine
                        ? "items-end"
                        : "items-start"
                    }
                    flex flex-col
                  `}
                >
                  {/* Sender info */}
                  <div
                    className={`
                      flex items-center gap-2 mb-1.5 text-xs
                      ${
                        isMine
                          ? "flex-row-reverse"
                          : ""
                      }
                    `}
                  >
                    <span className={`font-semibold ${isMine ? "text-white/90" : "text-white/90"}`}>
                      {name}
                    </span>

                    {!isMine &&
                      role &&
                      role !==
                        "employee" && (
                        <span className="text-[9px] uppercase tracking-[0.1em] text-white/50 rounded-full px-1.5 py-0.5 font-semibold border border-white/[0.1] bg-white/[0.03]">
                          {role}
                        </span>
                      )}

                    <span className="text-white/35 text-[11px]">
                      {new Date(
                        m.created_at
                      ).toLocaleTimeString(
                        [],
                        {
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                    </span>
                  </div>

                  {/* Message bubble */}
                  <div
                    className={`
                      rounded-2xl px-3.5 py-2 text-sm leading-relaxed
                      ${
                        isMine
                          ? "bg-gradient-to-b from-[#5B78FF] to-[#4A63E8] text-white rounded-br-md shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_4px_16px_-8px_rgba(91,120,255,0.55)]"
                          : "bg-white/[0.05] text-white/95 border border-white/[0.07] rounded-bl-md backdrop-blur-sm"
                      }
                    `}
                  >
                    {m.is_deleted ? (
                      <p className="text-sm italic opacity-50">
                        This message was deleted
                      </p>
                    ) : editingMessageId === m.id ? (
                      <div className="flex gap-2 min-w-[220px]">
                        <input
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              void saveEdit(m);
                            }
                            if (e.key === "Escape") {
                              setEditingMessageId(null);
                              setEditDraft("");
                            }
                          }}
                          autoFocus
                          className="flex-1 min-w-0 border border-white/15 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#5B78FF]/50 bg-black/30"
                        />
                        <button
                          type="button"
                          onClick={() => void saveEdit(m)}
                          className="text-xs px-2.5 py-1.5 rounded-md bg-white text-[#0B0F1A] font-semibold hover:bg-white/90 transition"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMessageId(null);
                            setEditDraft("");
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-md border border-white/20 hover:bg-white/5 text-white transition"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Original message being replied to */}
                        {m.parent_message_id && (() => {
                          const repliedMessage = messages.find(
                            (msg) => msg.id === m.parent_message_id
                          );

                          if (!repliedMessage) return null;

                          const repliedName =
                            repliedMessage.sender_id === userId
                              ? "You"
                              : profiles[repliedMessage.sender_id] ?? "Employee";

                          const repliedText =
                            repliedMessage.content ??
                            (repliedMessage.file_name
                              ? `📎 ${repliedMessage.file_name}`
                              : "Message");

                          return (
                            <div
                              className={`
                                mb-2 rounded-md border-l-2 px-2.5 py-1.5
                                ${
                                  isMine
                                    ? "border-white/50 bg-black/15"
                                    : "border-[#6C8AFF]/60 bg-white/[0.03]"
                                }
                              `}
                            >
                              <p className={`text-[11px] font-semibold ${
                                isMine ? "text-white/85" : "text-white/70"
                              }`}>
                                ↩ {repliedName}
                              </p>
                              <p className={`text-xs truncate mt-0.5 ${
                                isMine ? "text-white/65" : "text-white/50"
                              }`}>
                                {repliedText}
                              </p>
                            </div>
                          );
                        })()}

                        {/* Text */}
                        {m.content && (
                          <p className="whitespace-pre-wrap break-words">
                            {m.content}
                          </p>
                        )}

                        {/* File */}
                        {m.file_url && (
                          <a
                            href={m.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className={`
                              mt-1.5 inline-flex items-center gap-1.5 text-xs underline underline-offset-2
                              ${
                                isMine
                                  ? "text-white/90 hover:text-white"
                                  : "text-[#A6B8FF] hover:text-white"
                              }
                            `}
                          >
                            📎 {m.file_name}
                          </a>
                        )}

                        {m.updated_at && (
                          <span className="text-[10px] opacity-50 ml-1.5 italic">
                            (edited)
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* Clean message actions */}
                  {!m.is_deleted && (
                    <div
                      className={`
                        flex items-center gap-1.5 mt-1.5
                        opacity-0 group-hover:opacity-100
                        transition-opacity duration-200
                        ${isMine ? "flex-row-reverse" : ""}
                      `}
                    >
                      {userId && (
                        <MessageReactions
                          messageId={m.id}
                          userId={userId}
                        />
                      )}

                      <ChatMessageActions
                        isMine={isMine}
                        isPinned={pinnedMessageIds.includes(m.id)}
                        canModerate={hasAdminAccess}
                        onReply={() => setReplyingTo(m)}
                        onPin={() => void togglePin(m)}
                        onForward={() => setForwardingMessage(m)}
                        onThread={() => setThreadMessage(m)}
                        onEdit={
                          isMine && m.content
                            ? () => startEdit(m)
                            : undefined
                        }
                        onDelete={() => void deleteMessage(m)}
                      />

                      {isMine && (
                        <MessageReadStatus messageId={m.id} />
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>

        {/* =================================================
            MESSAGE INPUT
        ================================================= */}

        <div className="relative z-20 border-t border-white/[0.06] px-3 md:px-6 py-3.5 bg-[#0A0E18]/70 backdrop-blur-2xl">

          {/* Reply preview */}
          {replyingTo && (
            <div className="mb-2.5 flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] border-l-2 border-l-[#6C8AFF] bg-white/[0.03] px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-white/70">
                  ↩ Replying to{" "}
                  {replyingTo.sender_id === userId
                    ? "yourself"
                    : profiles[replyingTo.sender_id] ?? "Employee"}
                </p>

                <p className="text-xs text-white/45 truncate mt-0.5">
                  {replyingTo.content ??
                    (replyingTo.file_name
                      ? `📎 ${replyingTo.file_name}`
                      : "Message")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="shrink-0 text-white/40 hover:text-white text-lg leading-none transition"
                title="Cancel reply"
              >
                ×
              </button>
            </div>
          )}

          {canPostHere() ? (
            <>
              {/* Selected file */}
              {file && (
                <div className="flex items-center gap-2.5 mb-2 text-xs bg-white/[0.04] border border-white/[0.08] text-white/80 rounded-lg px-3 py-1.5 w-fit">
                  <span className="text-[13px]">📎</span>
                  <span className="font-medium text-white/90">
                    {file.name}
                  </span>

                  <span className="text-white/40">
                    ready — click Send
                  </span>

                  <button
                    onClick={() =>
                      setFile(null)
                    }
                    className="ml-1 text-white/40 hover:text-white transition"
                    title="Remove attachment"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2">

                {/* Text input */}
                <input
                  value={draft}
                  onChange={(e) =>
                    setDraft(e.target.value)
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter"
                    ) {
                      sendMessage();
                    }
                  }}
                  placeholder={
                    replyingTo
                      ? "Write your reply..."
                      : activeChannel?.is_private
                      ? `Message @${
                          dmNames[
                            activeChannel.id
                          ] ?? ""
                        }`
                      : `Message #${
                          activeChannel?.name ??
                          ""
                        }`
                  }
                  className="flex-1 min-w-0 border border-white/[0.08] bg-white/[0.04] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[#5B78FF]/40 focus:border-[#5B78FF]/50 focus:bg-white/[0.06] transition-all duration-150"
                />

                {/* File input */}
                <input
                  type="file"
                  id="file-input"
                  className="hidden"
                  onChange={(e) =>
                    setFile(
                      e.target.files?.[0] ??
                        null
                    )
                  }
                />

                {/* File button */}
                <label
                  htmlFor="file-input"
                  className={`
                    cursor-pointer flex items-center justify-center h-[42px] w-[42px] rounded-xl shrink-0 border transition-all duration-150
                    ${
                      file
                        ? "border-[#5B78FF]/50 bg-[#5B78FF]/10 text-[#A6B8FF]"
                        : "border-white/[0.08] bg-white/[0.04] text-white/60 hover:text-white hover:bg-white/[0.07] hover:border-white/[0.12]"
                    }
                  `}
                  title={
                    file
                      ? file.name
                      : "Attach a file"
                  }
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </label>

                {/* Send */}
                <button
                  onClick={sendMessage}
                  disabled={sending}
                  className="shrink-0 text-sm font-semibold text-white rounded-xl px-4 md:px-5 py-2.5 bg-gradient-to-b from-[#5B78FF] to-[#4A63E8] hover:from-[#6B86FF] hover:to-[#5570F0] disabled:opacity-50 shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_6px_18px_-8px_rgba(91,120,255,0.7)] transition-all duration-150 flex items-center gap-2"
                >
                  {sending ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                      Sending
                    </>
                  ) : (
                    <>
                      Send
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <p className="flex-1 text-sm text-white/45 text-center py-2.5 flex items-center justify-center gap-2">
              <span className="text-base">🔒</span>
              Only{" "}
              <span className="font-medium text-white/70">
                {activeChannel?.post_roles?.join(" or ")}
              </span>{" "}
              can post in this channel.
            </p>
          )}
        </div>
      </main>

      {/* Pin duration picker */}
      {pinningMessage && (
        <div
          className="fixed inset-0 bg-[#060810]/70 backdrop-blur-md z-[60] flex items-center justify-center px-4 animate-fade-in"
          onClick={() => setPinningMessage(null)}
        >
          <div
            className="bg-[#0E1320] rounded-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.08] w-full max-w-sm overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <p className="font-semibold text-white flex items-center gap-2">
                <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-amber-400/10 border border-amber-400/20 text-sm">📌</span>
                Pin message
              </p>
              <p className="text-xs text-white/45 mt-1.5">
                Choose how long this message should stay pinned.
              </p>
            </div>

            <div className="p-4 space-y-2">
              <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all duration-150 ${
                pinDuration === "24h"
                  ? "border-[#5B78FF]/50 bg-[#5B78FF]/[0.08]"
                  : "border-white/[0.08] hover:bg-white/[0.03]"
              }`}>
                <input
                  type="radio"
                  name="pin-duration"
                  checked={pinDuration === "24h"}
                  onChange={() => setPinDuration("24h")}
                  className="accent-[#5B78FF]"
                />
                <div>
                  <p className="text-sm font-medium text-white">24 hours</p>
                  <p className="text-xs text-white/45 mt-0.5">
                    Automatically unpin after one day
                  </p>
                </div>
              </label>

              <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all duration-150 ${
                pinDuration === "7d"
                  ? "border-[#5B78FF]/50 bg-[#5B78FF]/[0.08]"
                  : "border-white/[0.08] hover:bg-white/[0.03]"
              }`}>
                <input
                  type="radio"
                  name="pin-duration"
                  checked={pinDuration === "7d"}
                  onChange={() => setPinDuration("7d")}
                  className="accent-[#5B78FF]"
                />
                <div>
                  <p className="text-sm font-medium text-white">7 days</p>
                  <p className="text-xs text-white/45 mt-0.5">
                    Automatically unpin after one week
                  </p>
                </div>
              </label>
            </div>

            <div className="px-4 py-3 border-t border-white/[0.06] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPinningMessage(null)}
                className="px-3.5 py-2 text-sm rounded-lg border border-white/[0.1] text-white/75 hover:bg-white/[0.05] hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void pinMessage()}
                className="px-4 py-2 text-sm rounded-lg bg-gradient-to-b from-[#5B78FF] to-[#4A63E8] hover:from-[#6B86FF] hover:to-[#5570F0] text-white font-semibold shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_6px_18px_-8px_rgba(91,120,255,0.7)] transition-all"
              >
                Pin message
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Thread panel */}
      {threadMessage && activeChannel && userId && (
        <ThreadPanel
          root={threadMessage}
          channelId={activeChannel.id}
          userId={userId}
          profiles={profiles}
          onClose={() => setThreadMessage(null)}
          onSent={() => {
            // Main realtime subscription will receive the new reply.
          }}
        />
      )}

      {/* Forward message picker */}
      {forwardingMessage && (
        <div
          className="fixed inset-0 bg-[#060810]/70 backdrop-blur-md z-50 flex items-center justify-center px-4 animate-fade-in"
          onClick={() => setForwardingMessage(null)}
        >
          <div
            className="bg-[#0E1320] rounded-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.08] w-full max-w-md max-h-[70vh] overflow-y-auto animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm text-white">Forward message</p>
                <p className="text-xs text-white/40 mt-0.5">
                  Choose a channel or direct message
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForwardingMessage(null)}
                className="text-white/40 hover:text-white text-xl transition"
              >
                ×
              </button>
            </div>

            <div className="p-3.5 border-b border-white/[0.06] bg-white/[0.02]">
              <p className="text-[10px] text-white/40 uppercase tracking-wider font-semibold">Message</p>
              <p className="text-sm text-white/80 mt-1 line-clamp-3">
                {forwardingMessage.content ??
                  (forwardingMessage.file_name
                    ? `📎 ${forwardingMessage.file_name}`
                    : "Message")}
              </p>
            </div>

            <div className="py-1">
              {[
                ...channels,
                ...dmChannels.filter(
                  (dm) => !channels.some((c) => c.id === dm.id)
                ),
              ].map((target) => (
                <button
                  key={target.id}
                  type="button"
                  onClick={() => void forwardMessageToChannel(target)}
                  className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:text-white hover:bg-white/[0.04] border-b border-white/[0.04] last:border-b-0 transition-colors"
                >
                  <span className="text-white/40 mr-1.5">
                    {target.is_private ? "@" : "#"}
                  </span>
                  {target.is_private
                    ? dmNames[target.id] ?? "Direct Message"
                    : target.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Daily MOM */}
      {showDailyMom && activeChannel && userId && (
        <DailyMOMPanel
          channelId={activeChannel.id}
          channelName={
            activeChannel.is_private
              ? dmNames[activeChannel.id] ?? "Direct Message"
              : activeChannel.name
          }
          userId={userId}
          onClose={() => setShowDailyMom(false)}
        />
      )}

      {/* Admin / HR / CEO audit log */}
      {showAudit && (
        <ChatAuditPanel onClose={() => setShowAudit(false)} />
      )}

      {/* =====================================================
          NEW DM / GROUP DM PICKER
      ===================================================== */}


      {showNewDM && (
        <div
          className="fixed inset-0 bg-[#060810]/70 backdrop-blur-md z-40 flex items-center justify-center px-4 animate-fade-in"
          onClick={() => {
            setShowNewDM(false);
            setSelectedDMUsers([]);
          }}
        >
          <div
            className="bg-[#0E1320] rounded-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.08] w-full max-w-sm max-h-[70vh] overflow-y-auto animate-scale-in"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            {/* Header */}
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">

              <div>
                <div className="font-semibold text-sm text-white">
                  New Message
                </div>

                <div className="text-xs text-white/40 font-normal mt-0.5">
                  Select one person for a DM
                  or multiple for a group
                </div>
              </div>

              <button
                onClick={() => {
                  setShowNewDM(false);
                  setSelectedDMUsers([]);
                }}
                className="text-white/40 hover:text-white text-lg leading-none transition"
              >
                ×
              </button>
            </div>

            {/* Employee list */}
            <div className="py-1">
              {Object.entries(profiles)
                .filter(([id]) => {
                  if (id === userId) return false;

                  // New messages should only be available to active users.
                  // Vendor/inactive accounts are excluded from the employee picker.
                  return (
                    profileActive[id] === true &&
                    (profileRoles[id] ?? "employee")
                      .trim()
                      .toLowerCase() !== "vendor"
                  );
                })
                .sort(([, nameA], [, nameB]) =>
                  nameA.localeCompare(nameB)
                )
                .map(([id, name]) => {
                  const selected =
                    selectedDMUsers.includes(
                      id
                    );

                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setSelectedDMUsers(
                          (prev) =>
                            selected
                              ? prev.filter(
                                  (user) =>
                                    user !==
                                    id
                                )
                              : [
                                  ...prev,
                                  id,
                                ]
                        );
                      }}
                      className={`
                        w-full text-left px-4 py-2.5 text-sm text-white/85
                        flex items-center gap-3 transition-colors duration-150
                        ${
                          selected
                            ? "bg-[#5B78FF]/[0.08]"
                            : "hover:bg-white/[0.04]"
                        }
                      `}
                    >

                      {/* Checkbox */}
                      <span
                        className={`
                          w-[18px] h-[18px] rounded-md border
                          flex items-center justify-center
                          text-[10px] shrink-0 transition-all duration-150
                          ${
                            selected
                              ? "bg-[#5B78FF] border-[#5B78FF] text-white"
                              : "border-white/20"
                          }
                        `}
                      >
                        {selected
                          ? "✓"
                          : ""}
                      </span>

                      {/* Employee name */}
                      <span className="font-medium">
                        {name}
                      </span>
                    </button>
                  );
                })}

              {Object.entries(profiles).filter(([id]) => {
                if (id === userId) return false;

                return (
                  profileActive[id] === true &&
                  (profileRoles[id] ?? "employee")
                    .trim()
                    .toLowerCase() !== "vendor"
                );
              }).length === 0 && (
                <p className="px-4 py-3 text-sm text-white/40">
                  No other employees found
                  yet.
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-white/[0.06] px-4 py-3 flex items-center justify-between gap-2">

              <span className="text-xs text-white/45">
                {selectedDMUsers.length}{" "}
                selected
              </span>

              <div className="flex gap-2">

                {/* Cancel */}
                <button
                  onClick={() => {
                    setShowNewDM(false);
                    setSelectedDMUsers([]);
                  }}
                  className="px-3 py-1.5 text-sm border border-white/[0.1] rounded-lg text-white/75 hover:bg-white/[0.05] hover:text-white transition-all"
                >
                  Cancel
                </button>

                {/* Open / Create */}
                <button
                  onClick={() => {
                    if (
                      selectedDMUsers.length ===
                      1
                    ) {
                      startDM(
                        selectedDMUsers[0]
                      );
                    } else {
                      startGroupDM();
                    }
                  }}
                  disabled={
                    selectedDMUsers.length ===
                    0
                  }
                  className="px-3.5 py-1.5 text-sm bg-gradient-to-b from-[#5B78FF] to-[#4A63E8] hover:from-[#6B86FF] hover:to-[#5570F0] text-white rounded-lg font-semibold disabled:opacity-40 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_4px_12px_-6px_rgba(91,120,255,0.6)] disabled:shadow-none transition-all"
                >
                  {selectedDMUsers.length >
                  1
                    ? "Create Group"
                    : "Open Chat"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          SEARCH OVERLAY
      ===================================================== */}

      {showSearch && (
        <div
          className="fixed inset-0 bg-[#060810]/70 backdrop-blur-md z-40 flex items-start justify-center pt-16 md:pt-24 px-4 animate-fade-in"
          onClick={() =>
            setShowSearch(false)
          }
        >
          <div
            className="bg-[#0E1320] rounded-2xl shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/[0.08] w-full max-w-lg max-h-[70vh] overflow-y-auto animate-scale-in"
            onClick={(e) =>
              e.stopPropagation()
            }
          >

            {/* Search input */}
            <div className="p-3 border-b border-white/[0.06] flex items-center gap-2">
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) =>
                  setSearchQuery(
                    e.target.value
                  )
                }
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter"
                  ) {
                    runSearch();
                  }
                }}
                placeholder="Search messages..."
                className="flex-1 border border-white/[0.08] bg-white/[0.04] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-[#5B78FF]/40 focus:border-[#5B78FF]/50 transition-all duration-150"
              />

              <button
                onClick={runSearch}
                className="bg-gradient-to-b from-[#5B78FF] to-[#4A63E8] hover:from-[#6B86FF] hover:to-[#5570F0] text-white text-sm font-semibold rounded-lg px-3.5 py-2.5 shrink-0 shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_4px_12px_-6px_rgba(91,120,255,0.6)] transition-all"
              >
                Search
              </button>
            </div>

            {/* Results */}
            <div className="py-1">

              {searching && (
                <p className="px-4 py-3 text-sm text-white/40">
                  Searching...
                </p>
              )}

              {!searching &&
                searchResults.length ===
                  0 &&
                searchQuery && (
                  <p className="px-4 py-3 text-sm text-white/40">
                    No messages found.
                  </p>
                )}

              {searchResults.map(
                (r) => (
                  <button
                    key={r.id}
                    onClick={() =>
                      jumpToSearchResult(
                        r
                      )
                    }
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/[0.04] border-b border-white/[0.04] last:border-b-0 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs text-white/40 mb-0.5">
                      <span className="text-white/60 font-medium">
                        {profiles[
                          r.sender_id
                        ] ??
                          "Employee"}
                      </span>

                      <span>
                        {new Date(
                          r.created_at
                        ).toLocaleDateString()}
                      </span>
                    </div>

                    <p className="truncate text-white/80">
                      {r.content}
                    </p>
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global keyframes + utilities */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in { animation: fadeIn 0.18s ease-out; }
        .animate-fade-up { animation: fadeUp 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
        .animate-scale-in { animation: scaleIn 0.22s cubic-bezier(0.22, 1, 0.36, 1); }

        /* Refined dark scrollbar */
        .overflow-y-auto::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .overflow-y-auto::-webkit-scrollbar-track {
          background: transparent;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 99px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.16);
          background-clip: padding-box;
        }

        /* Selection */
        ::selection {
          background: rgba(91, 120, 255, 0.4);
          color: white;
        }
      `}</style>
    </div>
  );
}