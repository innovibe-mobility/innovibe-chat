"use client";

import { useState } from "react";

export default function CreateVendorPage() {
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [password, setPassword] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    const res = await fetch("/api/admin/create-vendor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName, contactEmail, password, logoUrl, adminEmail }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error);
      return;
    }
    setResult(
      `Done! ${data.email} can now sign in with the password you set. Their private channel is #${data.channelName}.`
    );
    setCompanyName("");
    setContactEmail("");
    setPassword("");
    setLogoUrl("");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-graphite-900 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-graphite-100 p-8">
        <h1 className="text-lg font-display font-semibold text-graphite-900 mb-1">
          Create a vendor account
        </h1>
        <p className="text-sm text-graphite-400 mb-6">
          One click instead of manual SQL -- creates their login, profile,
          and private channel all at once.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-graphite-700">
              Company name
            </label>
            <input
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="w-full border border-graphite-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-graphite-700">
              Vendor's login email
            </label>
            <input
              required
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full border border-graphite-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-graphite-700">
              Set their password
            </label>
            <input
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-graphite-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-graphite-700">
              Logo URL (copy from their vendor_applications row)
            </label>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              className="w-full border border-graphite-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-graphite-700">
              Your own admin email (to join their channel too)
            </label>
            <input
              required
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className="w-full border border-graphite-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal-500"
              placeholder="greeshmasatyasrid@gmail.com"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {result && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
              {result}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-signal-500 hover:bg-signal-600 text-graphite-900 text-sm font-semibold rounded-lg py-2.5 transition disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create vendor account"}
          </button>
        </form>
      </div>
    </div>
  );
}
