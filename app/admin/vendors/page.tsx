"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Application = {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  logo_url: string | null;
  website: string | null;
  category: string | null;
  status: string;
  created_at: string;
};

type Vendor = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  logo_url: string | null;
  status: string;
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

export default function VendorAdminPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{
    company: string;
    email: string;
    password: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = useMemo(
    () => applications.filter((a) => a.status === "pending"),
    [applications]
  );

  async function getToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function load() {
    setLoading(true);
    setError(null);

    const token = await getToken();

    if (!token) {
      setError("Please log in again.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/admin/vendors", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Could not load vendors.");
      setLoading(false);
      return;
    }

    setApplications(data.applications ?? []);
    setVendors(data.vendors ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function approve(application: Application) {
    if (!window.confirm(`Approve ${application.company_name}?`)) return;

    setWorkingId(application.id);
    setError(null);

    const token = await getToken();

    if (!token) {
      setError("Please log in again.");
      setWorkingId(null);
      return;
    }

    const res = await fetch("/api/admin/vendors/approve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ application_id: application.id }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Approval failed.");
      setWorkingId(null);
      return;
    }

    setCredentials({
      company: data.vendor.company_name,
      email: data.credentials.email,
      password: data.credentials.temporary_password,
    });

    setWorkingId(null);
    await load();
  }

  async function reject(application: Application) {
    if (!window.confirm(`Reject ${application.company_name}?`)) return;

    setWorkingId(application.id);
    setError(null);

    const token = await getToken();

    if (!token) {
      setError("Please log in again.");
      setWorkingId(null);
      return;
    }

    const res = await fetch("/api/admin/vendors/reject", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ application_id: application.id }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error ?? "Rejection failed.");
    }

    setWorkingId(null);
    await load();
  }

  async function openVendor(vendor: Vendor) {
    setSelectedVendor(vendor);
    setMessages([]);
    setDraft("");

    const { data: chat, error: chatError } = await supabase
      .from("vendor_chats")
      .select("id")
      .eq("vendor_id", vendor.id)
      .single();

    if (chatError || !chat) {
      setError(chatError?.message ?? "Vendor chat not found.");
      return;
    }

    setSelectedChatId(chat.id);

    const { data: chatMessages, error: messageError } = await supabase
      .from("vendor_messages")
      .select("*")
      .eq("chat_id", chat.id)
      .order("created_at", { ascending: true });

    if (messageError) {
      setError(messageError.message);
      return;
    }

    setMessages((chatMessages ?? []) as Message[]);
  }

  useEffect(() => {
    if (!selectedChatId) return;

    const channel = supabase
      .channel(`vendor-admin-${selectedChatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vendor_messages",
          filter: `chat_id=eq.${selectedChatId}`,
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
  }, [selectedChatId]);

  async function sendMessage() {
    if (!selectedChatId || !draft.trim()) return;

    setSending(true);

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    if (!userId) {
      setError("Please log in again.");
      setSending(false);
      return;
    }

    const { error: sendError } = await supabase
      .from("vendor_messages")
      .insert({
        chat_id: selectedChatId,
        sender_id: userId,
        sender_type: "employee",
        content: draft.trim(),
      });

    if (sendError) {
      setError(sendError.message);
    } else {
      setDraft("");
    }

    setSending(false);
  }

  async function copyCredentials() {
    if (!credentials) return;

    await navigator.clipboard.writeText(
      `InnoVibe Vendor Portal\nCompany: ${credentials.company}\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}`
    );
  }

  return (
    <div className="min-h-screen bg-[#EEF4F9] text-[#0F2438]">
      <header className="bg-[#0E2A40] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#7FB6C9]">
            InnoVibe Mobility
          </p>
          <h1 className="text-xl font-bold">Vendor Management</h1>
        </div>

        <a
          href="/dashboard"
          className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
        >
          Back to Chat
        </a>
      </header>

      <main className="max-w-7xl mx-auto p-5 md:p-8">
        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {credentials && (
          <div className="mb-6 rounded-2xl border border-[#FFE3B3] bg-[#FFF8EA] p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8A6729]">
                  Save these credentials now
                </p>
                <h2 className="mt-1 font-bold text-lg">
                  {credentials.company}
                </h2>
                <p className="text-sm mt-2">
                  Email: <strong>{credentials.email}</strong>
                </p>
                <p className="text-sm">
                  Temporary password:{" "}
                  <strong className="font-mono">{credentials.password}</strong>
                </p>
                <p className="text-xs text-[#7A6A4B] mt-2">
                  The vendor must change this password on first login.
                </p>
              </div>

              <button
                onClick={copyCredentials}
                className="rounded-xl bg-[#0E2A40] text-white px-4 py-2.5 text-sm font-semibold"
              >
                Copy credentials
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center">
            Loading vendor management...
          </div>
        ) : (
          <div className="grid lg:grid-cols-[360px_1fr] gap-6">
            <section className="space-y-6">
              <div className="bg-white rounded-2xl border border-[#DDE8F0] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E7EEF3]">
                  <div className="flex justify-between items-center">
                    <div>
                      <h2 className="font-bold">Pending Applications</h2>
                      <p className="text-xs text-[#718596] mt-1">
                        {pending.length} awaiting review
                      </p>
                    </div>
                    <span className="rounded-full bg-[#FFF4DF] px-3 py-1 text-xs font-bold text-[#765A28]">
                      {pending.length}
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-[#EEF2F5]">
                  {pending.length === 0 && (
                    <p className="p-5 text-sm text-[#7B8C99]">
                      No pending applications.
                    </p>
                  )}

                  {pending.map((application) => (
                    <div key={application.id} className="p-5">
                      <div className="flex gap-3">
                        {application.logo_url ? (
                          <img
                            src={application.logo_url}
                            alt=""
                            className="h-11 w-11 rounded-xl object-contain border bg-white"
                          />
                        ) : (
                          <div className="h-11 w-11 rounded-xl bg-[#EEF4F9] flex items-center justify-center">
                            🏢
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="font-semibold truncate">
                            {application.company_name}
                          </p>
                          <p className="text-xs text-[#718596]">
                            {application.contact_name}
                          </p>
                          <p className="text-xs text-[#718596] truncate">
                            {application.contact_email}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button
                          disabled={workingId === application.id}
                          onClick={() => approve(application)}
                          className="flex-1 rounded-lg bg-[#26648B] text-white px-3 py-2 text-xs font-bold disabled:opacity-50"
                        >
                          {workingId === application.id
                            ? "Working..."
                            : "Approve"}
                        </button>

                        <button
                          disabled={workingId === application.id}
                          onClick={() => reject(application)}
                          className="flex-1 rounded-lg border border-red-200 text-red-600 px-3 py-2 text-xs font-bold disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-[#DDE8F0] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E7EEF3]">
                  <h2 className="font-bold">Approved Vendors</h2>
                  <p className="text-xs text-[#718596] mt-1">
                    Select a vendor to open its private chat.
                  </p>
                </div>

                <div className="divide-y divide-[#EEF2F5]">
                  {vendors.length === 0 && (
                    <p className="p-5 text-sm text-[#7B8C99]">
                      No vendors yet.
                    </p>
                  )}

                  {vendors.map((vendor) => (
                    <button
                      key={vendor.id}
                      onClick={() => openVendor(vendor)}
                      className={`w-full text-left p-4 flex items-center gap-3 hover:bg-[#F6FAFC] ${
                        selectedVendor?.id === vendor.id
                          ? "bg-[#EEF7FA]"
                          : ""
                      }`}
                    >
                      {vendor.logo_url ? (
                        <img
                          src={vendor.logo_url}
                          alt=""
                          className="h-10 w-10 rounded-xl object-contain border bg-white"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-xl bg-[#EEF4F9] flex items-center justify-center">
                          🏢
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">
                          {vendor.company_name}
                        </p>
                        <p className="text-xs text-[#718596] truncate">
                          {vendor.contact_name}
                        </p>
                      </div>

                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="bg-white rounded-2xl border border-[#DDE8F0] shadow-sm min-h-[600px] flex flex-col overflow-hidden">
              {selectedVendor ? (
                <>
                  <div className="px-6 py-5 border-b border-[#E7EEF3] flex items-center gap-3">
                    {selectedVendor.logo_url ? (
                      <img
                        src={selectedVendor.logo_url}
                        alt={selectedVendor.company_name}
                        className="h-12 w-12 rounded-xl object-contain border bg-white"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-[#EEF4F9] flex items-center justify-center">
                        🏢
                      </div>
                    )}

                    <div>
                      <h2 className="font-bold">
                        {selectedVendor.company_name}
                      </h2>
                      <p className="text-xs text-[#718596]">
                        Private vendor workspace
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {messages.length === 0 && (
                      <div className="h-full min-h-[400px] flex items-center justify-center text-sm text-[#8A9AA7]">
                        No messages yet.
                      </div>
                    )}

                    {messages.map((message) => {
                      const mine = message.sender_type === "employee";

                      return (
                        <div
                          key={message.id}
                          className={`flex ${
                            mine ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                              mine
                                ? "bg-[#26648B] text-white rounded-br-sm"
                                : "bg-[#F1F5F8] text-[#0F2438] rounded-bl-sm"
                            }`}
                          >
                            <p className="text-[11px] opacity-65 mb-1">
                              {mine ? "InnoVibe" : selectedVendor.contact_name}
                            </p>

                            {message.content && (
                              <p className="text-sm whitespace-pre-wrap break-words">
                                {message.content}
                              </p>
                            )}

                            {message.file_url && (
                              <a
                                href={message.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 block text-xs underline"
                              >
                                📎 {message.file_name ?? "Attachment"}
                              </a>
                            )}

                            <p className="text-[10px] opacity-50 mt-2">
                              {new Date(
                                message.created_at
                              ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-[#E7EEF3] p-4">
                    <div className="flex gap-2">
                      <input
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void sendMessage();
                        }}
                        placeholder={`Message ${selectedVendor.company_name}...`}
                        className="flex-1 rounded-xl border border-[#D8E4EC] px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-[#53D2DB]/10 focus:border-[#53D2DB]"
                      />

                      <button
                        onClick={sendMessage}
                        disabled={sending || !draft.trim()}
                        className="rounded-xl bg-[#26648B] text-white px-5 text-sm font-bold disabled:opacity-50"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-8 text-center">
                  <div>
                    <div className="mx-auto h-16 w-16 rounded-2xl bg-[#EEF4F9] flex items-center justify-center text-2xl">
                      🏢
                    </div>
                    <h2 className="mt-4 font-bold text-lg">
                      Select a vendor
                    </h2>
                    <p className="mt-1 text-sm text-[#718596]">
                      Each vendor has its own isolated conversation.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
