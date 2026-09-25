"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ChangePasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setError("Your session has expired. Please log in again.");
        setLoading(false);
        return;
      }

      const { error: passwordError } =
        await supabase.auth.updateUser({
          password,
        });

      if (passwordError) {
        setError(passwordError.message);
        setLoading(false);
        return;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          must_change_password: false,
        })
        .eq("id", user.id);

      if (profileError) {
        setError(profileError.message);
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Unable to change password.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#EEF4F9] flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        <div className="rounded-[28px] bg-white border border-[#DCEAF2] shadow-xl overflow-hidden">

          <div className="h-1.5 bg-gradient-to-r from-[#26648B] via-[#53D2DB] to-[#FFE3B3]" />

          <div className="p-8 sm:p-10">

            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-[#0F2438]">
                Change Your Password
              </h1>

              <p className="mt-2 text-sm text-[#648097]">
                Please create a new password before continuing.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">

              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#648097] mb-2"
                >
                  New Password
                </label>

                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-[#D6E4EC] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/15"
                  placeholder="Enter new password"
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#648097] mb-2"
                >
                  Confirm Password
                </label>

                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full border border-[#D6E4EC] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/15"
                  placeholder="Confirm new password"
                />
              </div>

              {error && (
                <div className="text-sm text-[#B42318] bg-[#FFF5F4] border border-[#F5C7C3] rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#26648B] to-[#1F7894] text-white font-semibold rounded-xl py-3.5 disabled:opacity-60"
              >
                {loading ? "Updating..." : "Set New Password"}
              </button>

            </form>

          </div>
        </div>

      </div>
    </div>
  );
}