"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Vendor = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  logo_url: string | null;
  status: string;
  must_change_password: boolean;
};

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_type: "vendor" | "employee";
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  created_at: string;
};

export default function VendorWorkspacePage() {
  const router = useRouter();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [openingFile, setOpeningFile] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        router.replace("/vendor-login");
        return;
      }

      const { data: vendorData, error: vendorError } = await supabase
        .from("vendors")
        .select(
          "id, company_name, contact_name, email, logo_url, status, must_change_password"
        )
        .eq("auth_user_id", data.session.user.id)
        .maybeSingle();

      if (vendorError || !vendorData) {
        await supabase.auth.signOut();
        router.replace("/vendor-login");
        return;
      }

      if (vendorData.status !== "approved") {
        await supabase.auth.signOut();
        router.replace("/vendor-login");
        return;
      }

      if (vendorData.must_change_password) {
        router.replace("/vendor-change-password");
        return;
      }

      const { data: chat, error: chatError } = await supabase
        .from("vendor_chats")
        .select("id")
        .eq("vendor_id", vendorData.id)
        .single();

      if (chatError || !chat) {
        console.error(chatError);
        setLoading(false);
        return;
      }

      const { data: messageData, error: messagesError } = await supabase
        .from("vendor_messages")
        .select("*")
        .eq("chat_id", chat.id)
        .order("created_at", { ascending: true });

      if (messagesError) {
        console.error(messagesError);
      }

      if (cancelled) return;

      setVendor(vendorData as Vendor);
      setChatId(chat.id);
      setMessages((messageData ?? []) as Message[]);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!chatId) return;

    const channel = supabase
      .channel(`vendor-chat-${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vendor_messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          const message = payload.new as Message;

          setMessages((prev) =>
            prev.some((m) => m.id === message.id)
              ? prev
              : [...prev, message]
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * Open a vendor-chat attachment using a temporary signed URL.
   *
   * file_url contains the Supabase Storage PATH, not a public URL.
   */
  async function openAttachment(message: Message) {
    if (!message.file_url) return;

    setOpeningFile(message.id);

    try {
      const { data, error } = await supabase.storage
        .from("vendor-chat-files")
        .createSignedUrl(message.file_url, 60 * 60);

      if (error || !data?.signedUrl) {
        console.error("Could not create signed URL:", error);
        alert(
          error?.message ??
            "Could not open this attachment. Please try again."
        );
        return;
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Attachment error:", error);
      alert("Could not open this attachment. Please try again.");
    } finally {
      setOpeningFile(null);
    }
  }

  async function sendMessage() {
    if (!chatId || (!draft.trim() && !file)) return;

    setSending(true);

    let fileUrl: string | null = null;
    let fileName: string | null = null;

    if (file) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${chatId}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("vendor-chat-files")
        .upload(path, file);

      if (uploadError) {
        alert(uploadError.message);
        setSending(false);
        return;
      }

      /*
       * Store only the Storage path in vendor_messages.
       * We generate a signed URL only when the user clicks the file.
       */
      fileUrl = path;
      fileName = file.name;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (!userId) {
      setSending(false);
      return;
    }

    const { error } = await supabase.from("vendor_messages").insert({
      chat_id: chatId,
      sender_id: userId,
      sender_type: "vendor",
      content: draft.trim() || null,
      file_url: fileUrl,
      file_name: fileName,
    });

    if (error) {
      alert(error.message);
    } else {
      setDraft("");
      setFile(null);
    }

    setSending(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/vendor-login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EEF4F9] flex items-center justify-center text-sm text-[#718596]">
        Loading your vendor workspace...
      </div>
    );
  }

  if (!vendor) return null;

  return (
    <main className="h-screen bg-[#EEF4F9] flex flex-col text-[#0F2438]">
      <header className="bg-[#0E2A40] text-white px-5 md:px-8 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-white flex items-center justify-center overflow-hidden">
            {vendor.logo_url ? (
              <img
                src={vendor.logo_url}
                alt={vendor.company_name}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-xl">🏢</span>
            )}
          </div>

          <div>
            <p className="font-bold text-sm md:text-base">
              {vendor.company_name}
            </p>

            <p className="text-[11px] uppercase tracking-[0.15em] text-[#7FB6C9]">
              Private Vendor Workspace
            </p>
          </div>
        </div>

        <button
          onClick={signOut}
          className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15"
        >
          Sign out
        </button>
      </header>

      <div className="flex-1 max-w-5xl w-full mx-auto p-3 md:p-6 flex flex-col min-h-0">
        <section className="flex-1 min-h-0 bg-white rounded-3xl border border-white shadow-[0_20px_60px_-25px_rgba(15,36,56,0.25)] overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-[#E7EEF3]">
            <p className="font-bold">InnoVibe Support Chat</p>

            <p className="text-xs text-[#718596] mt-1">
              This conversation is private to your company.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center text-center">
                <div>
                  <div className="h-14 w-14 mx-auto rounded-2xl bg-[#EEF4F9] flex items-center justify-center text-2xl">
                    💬
                  </div>

                  <p className="mt-3 font-semibold">
                    Start your conversation with InnoVibe
                  </p>

                  <p className="mt-1 text-xs text-[#8395A3]">
                    Ask questions, share updates, or send documents here.
                  </p>
                </div>
              </div>
            )}

            {messages.map((message) => {
              const mine = message.sender_type === "vendor";

              return (
                <div
                  key={message.id}
                  className={`flex ${
                    mine ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      mine
                        ? "bg-[#26648B] text-white rounded-br-sm"
                        : "bg-[#F1F5F8] text-[#0F2438] rounded-bl-sm"
                    }`}
                  >
                    <p className="text-[11px] opacity-65 mb-1">
                      {mine ? "You" : "InnoVibe"}
                    </p>

                    {message.content && (
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {message.content}
                      </p>
                    )}

                    {message.file_url && (
                      <button
                        type="button"
                        onClick={() => void openAttachment(message)}
                        disabled={openingFile === message.id}
                        className={`mt-2 block text-xs underline text-left ${
                          openingFile === message.id
                            ? "opacity-50 cursor-wait"
                            : "hover:opacity-80"
                        }`}
                      >
                        📎{" "}
                        {openingFile === message.id
                          ? "Opening..."
                          : message.file_name ?? "Attachment"}
                      </button>
                    )}

                    <p className="text-[10px] opacity-50 mt-2">
                      {new Date(message.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}

            <div ref={bottomRef} />
          </div>

          <div className="border-t border-[#E7EEF3] p-3 md:p-4">
            {file && (
              <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-[#EEF7FA] px-3 py-2 text-xs">
                📎 {file.name}

                <button
                  onClick={() => setFile(null)}
                  className="text-red-500"
                >
                  ×
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void sendMessage();
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 min-w-0 rounded-xl border border-[#D8E4EC] px-4 py-3 text-sm outline-none focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/10"
              />

              <input
                id="vendor-file"
                type="file"
                className="hidden"
                onChange={(e) =>
                  setFile(e.target.files?.[0] ?? null)
                }
              />

              <label
                htmlFor="vendor-file"
                className="cursor-pointer rounded-xl border border-[#D8E4EC] bg-white px-4 py-3 text-sm hover:bg-[#F7FAFC]"
                title="Attach file"
              >
                📎
              </label>

              <button
                onClick={sendMessage}
                disabled={sending || (!draft.trim() && !file)}
                className="rounded-xl bg-[#26648B] text-white px-5 text-sm font-bold disabled:opacity-50"
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}