"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function VendorApplyPage() {
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let logo_url: string | null = null;

    if (logo) {
      const path = `${Date.now()}-${logo.name}`;
      const { error: uploadError } = await supabase.storage
        .from("vendor-logos")
        .upload(path, logo);
      if (uploadError) {
        setError(`Logo upload failed: ${uploadError.message}`);
        setLoading(false);
        return;
      }
      const { data } = supabase.storage.from("vendor-logos").getPublicUrl(path);
      logo_url = data.publicUrl;
    }

    const { error: insertError } = await supabase.from("vendor_applications").insert({
      company_name: companyName,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone || null,
      logo_url,
    });

    if (insertError) {
      setError(`Submission failed: ${insertError.message}`);
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-graphite-900">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-graphite-100 p-8 text-center">
          <h1 className="text-lg font-display font-semibold text-graphite-900 mb-2">
            Application received
          </h1>
          <p className="text-sm text-graphite-500">
            Thanks — we'll review your details and send you login
            credentials separately once approved.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-graphite-900 py-10">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-graphite-100 p-8">
        <img
          src="/innovibe-logo.png"
          alt="InnoVibe Mobility"
          className="h-10 w-auto mb-4"
        />
        <h1 className="text-lg font-display font-semibold text-graphite-900 mb-1">
          Vendor application
        </h1>
        <p className="text-sm text-graphite-400 mb-6">
          Tell us about your company. We'll review and follow up with your
          login details.
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
              Your name
            </label>
            <input
              required
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full border border-graphite-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-graphite-700">
              Contact email
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
              Contact phone (optional)
            </label>
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="w-full border border-graphite-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-graphite-700">
              Company logo
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-signal-500 hover:bg-signal-600 text-graphite-900 text-sm font-semibold rounded-lg py-2.5 transition disabled:opacity-60"
          >
            {loading ? "Submitting..." : "Submit application"}
          </button>
        </form>
      </div>
    </div>
  );
}
