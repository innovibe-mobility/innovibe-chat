"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function VendorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function login(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: loginError } =
      await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

    if (loginError || !data.user) {
      setError(loginError?.message ?? "Login failed.");
      setLoading(false);
      return;
    }

    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id, status, must_change_password")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();

    if (vendorError || !vendor) {
      await supabase.auth.signOut();
      setError("This account is not registered as an InnoVibe vendor.");
      setLoading(false);
      return;
    }

    if (vendor.status !== "approved") {
      await supabase.auth.signOut();
      setError(`Vendor account is ${vendor.status}.`);
      setLoading(false);
      return;
    }

    if (vendor.must_change_password) {
      router.push("/vendor-change-password");
    } else {
      router.push("/vendor");
    }
  }

  return (
    <main className="min-h-screen bg-[#EEF4F9] flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="absolute -top-32 -left-20 h-80 w-80 rounded-full bg-[#53D2DB]/20 blur-[110px]" />
      <div className="absolute bottom-[-120px] right-[-100px] h-96 w-96 rounded-full bg-[#FFE3B3]/25 blur-[120px]" />

      <div className="relative w-full max-w-md bg-white rounded-3xl border border-white shadow-[0_25px_70px_-25px_rgba(15,36,56,0.3)] p-8">
        <img
          src="/innovibe-logo.png"
          alt="InnoVibe Mobility"
          className="h-12 w-auto object-contain mx-auto mb-6"
        />

        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#4F8FBF]">
            Vendor Portal
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[#0F2438]">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-[#718596]">
            Sign in to your private InnoVibe vendor workspace.
          </p>
        </div>

        <form onSubmit={login} className="mt-7 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#29465B] mb-2">
              Business email
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-xl border border-[#D8E4EC] bg-[#FBFDFF] px-4 py-3 text-sm outline-none focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/10"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-[#29465B] mb-2">
              Password
            </label>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full rounded-xl border border-[#D8E4EC] bg-[#FBFDFF] px-4 py-3 text-sm outline-none focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/10"
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-[#26648B] to-[#4F8FBF] py-3.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a
            href="/vendor-apply"
            className="text-sm font-semibold text-[#26648B] hover:underline"
          >
            Need vendor access? Apply here
          </a>
        </div>
      </div>
    </main>
  );
}
