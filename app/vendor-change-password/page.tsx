"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function VendorChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/vendor-login");
      } else {
        setChecking(false);
      }
    });
  }, [router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    const { data } = await supabase.auth.getSession();

    if (!data.session) {
      setError("Your session expired. Please log in again.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/vendor/password", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
      },
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error ?? "Could not finish password setup.");
      setSaving(false);
      return;
    }

    router.replace("/vendor");
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-[#EEF4F9] flex items-center justify-center text-sm text-[#718596]">
        Checking your vendor account...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#EEF4F9] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-3xl border border-white shadow-[0_25px_70px_-25px_rgba(15,36,56,0.3)] p-8">
        <img
          src="/innovibe-logo.png"
          alt="InnoVibe Mobility"
          className="h-11 w-auto mx-auto object-contain mb-6"
        />

        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#4F8FBF] text-center">
          First-time setup
        </p>

        <h1 className="mt-2 text-2xl font-bold text-[#0F2438] text-center">
          Create your new password
        </h1>

        <p className="mt-2 text-sm text-[#718596] text-center leading-6">
          Your temporary password has been accepted. Please create a private
          password before entering your vendor workspace.
        </p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <input
            required
            minLength={8}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="w-full rounded-xl border border-[#D8E4EC] px-4 py-3 text-sm outline-none focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/10"
          />

          <input
            required
            minLength={8}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className="w-full rounded-xl border border-[#D8E4EC] px-4 py-3 text-sm outline-none focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/10"
          />

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            disabled={saving}
            className="w-full rounded-xl bg-[#26648B] text-white py-3.5 text-sm font-bold disabled:opacity-60"
          >
            {saving ? "Saving..." : "Set password & continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
