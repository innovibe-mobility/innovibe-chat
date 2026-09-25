"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [loginType, setLoginType] = useState<"employee" | "vendor">(
    "employee"
  );

  const [loginUsername, setLoginUsername] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          login_username: loginUsername,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Invalid Login ID or password.");
        setLoading(false);
        return;
      }

      /*
       * IMPORTANT:
       * Store the Supabase session in the existing browser client.
       * This keeps the existing dashboard authentication/session
       * system working.
       */
      const { error: sessionError } =
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }

      setLoading(false);

      /*
       * If this is the employee's first login, send them to the
       * password-change page.
       */
      if (data.user?.must_change_password === true) {
        router.push("/change-password?firstLogin=true");
        router.refresh();
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Unable to sign in.");
      setLoading(false);
    }
  }

  function switchLoginType(type: "employee" | "vendor") {
    setLoginType(type);
    setError(null);
    setLoginUsername("");
    setPassword("");

    if (type === "vendor") {
      router.push("/vendor-login");
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#EEF4F9] text-[#0F2438] flex items-center justify-center px-4">

      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-[420px] w-[420px] rounded-full bg-[#53D2DB]/20 blur-[120px]" />

        <div className="absolute top-1/3 -right-32 h-[460px] w-[460px] rounded-full bg-[#4F8FBF]/15 blur-[130px]" />

        <div className="absolute -bottom-40 left-1/3 h-[420px] w-[420px] rounded-full bg-[#FFE3B3]/25 blur-[130px]" />

        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.85),transparent_65%)]" />
      </div>

      {/* Login card */}
      <div className="relative z-10 w-full max-w-md">

        <div className="rounded-[28px] border border-white/80 bg-white/90 backdrop-blur-xl shadow-[0_30px_80px_-25px_rgba(15,36,56,0.28)] overflow-hidden">

          <div className="h-1.5 bg-gradient-to-r from-[#26648B] via-[#53D2DB] to-[#FFE3B3]" />

          <div className="p-8 sm:p-10">

            {/* Logo */}
            <div className="flex justify-center mb-7">
              <div className="relative">

                <div className="absolute -inset-3 rounded-3xl bg-[#53D2DB]/20 blur-xl" />

                <div className="relative rounded-2xl bg-white px-5 py-3 shadow-[0_12px_30px_-15px_rgba(15,36,56,0.35)] ring-1 ring-[#DCEAF2]">

                  <Image
                    src="/innovibe-logo.png"
                    alt="InnoVibe Mobility"
                    width={1024}
                    height={490}
                    className="h-12 w-auto object-contain"
                    priority
                  />

                </div>
              </div>
            </div>

            {/* Heading */}
            <div className="text-center mb-7">

              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0F2438]">
                Welcome back
              </h1>

              <p className="mt-2 text-sm text-[#648097]">
                Sign in to your InnoVibe workspace
              </p>

            </div>

            {/* Login type selector */}
            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-[#EEF4F9] border border-[#DCEAF2] mb-7">

              <button
                type="button"
                onClick={() => setLoginType("employee")}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  loginType === "employee"
                    ? "bg-white text-[#26648B] shadow-sm ring-1 ring-[#DCEAF2]"
                    : "text-[#648097] hover:text-[#26648B]"
                }`}
              >
                Employee
              </button>

              <button
                type="button"
                onClick={() => switchLoginType("vendor")}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#648097] hover:text-[#26648B] transition-all"
              >
                Vendor
              </button>

            </div>

            {/* Employee indicator */}
            <div className="mb-5 flex items-center gap-3 rounded-2xl bg-[#F4FAFC] border border-[#DCEAF2] px-4 py-3">

              <div className="h-9 w-9 rounded-xl bg-[#26648B] flex items-center justify-center text-white text-sm font-bold shadow-sm">
                E
              </div>

              <div className="min-w-0">

                <p className="text-sm font-semibold text-[#0F2438]">
                  Employee Workspace
                </p>

                <p className="text-xs text-[#71879A]">
                  Internal InnoVibe office access
                </p>

              </div>

            </div>

            {/* Login form */}
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Login ID */}
              <div>

                <label
                  htmlFor="loginUsername"
                  className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#648097] mb-2"
                >
                  Login ID
                </label>

                <input
                  id="loginUsername"
                  required
                  type="text"
                  autoComplete="username"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full border border-[#D6E4EC] bg-white rounded-xl px-4 py-3 text-sm text-[#0F2438] placeholder:text-[#9AAEBC] shadow-sm outline-none transition focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/15"
                  placeholder="greeshma.it"
                />

              </div>

              {/* Password */}
              <div>

                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-[0.12em] text-[#648097] mb-2"
                >
                  Password
                </label>

                <input
                  id="password"
                  required
                  type="password"
                  minLength={6}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-[#D6E4EC] bg-white rounded-xl px-4 py-3 text-sm text-[#0F2438] placeholder:text-[#9AAEBC] shadow-sm outline-none transition focus:border-[#53D2DB] focus:ring-4 focus:ring-[#53D2DB]/15"
                  placeholder="Enter your password"
                />

              </div>

              {/* Forgot password */}
              <div className="text-right">

                <button
                  type="button"
                  onClick={() => router.push("/forgot-password")}
                  className="text-sm font-semibold text-[#26648B] hover:text-[#174C6C] transition"
                >
                  Forgot Password?
                </button>

              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-3 text-sm text-[#B42318] bg-[#FFF5F4] border border-[#F5C7C3] rounded-xl px-4 py-3">

                  <span className="mt-0.5">!</span>

                  <p>{error}</p>

                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#26648B] to-[#1F7894] hover:from-[#214F70] hover:to-[#26648B] text-white text-sm font-semibold rounded-xl py-3.5 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_12px_28px_-12px_rgba(38,100,139,0.55)] hover:shadow-[0_16px_32px_-12px_rgba(38,100,139,0.65)] hover:-translate-y-0.5"
              >
                {loading ? "Signing you in..." : "Sign in to Workspace"}
              </button>

            </form>

            {/* Vendor access */}
            <div className="mt-7 pt-6 border-t border-[#E5EEF3]">

              <div className="text-center">

                <p className="text-xs text-[#8093A3] mb-2">
                  Are you an InnoVibe vendor?
                </p>

                <button
                  type="button"
                  onClick={() => router.push("/vendor-login")}
                  className="text-sm font-semibold text-[#26648B] hover:text-[#174C6C] transition"
                >
                  Vendor Login →
                </button>

              </div>

              <div className="text-center mt-3">

                <p className="text-xs text-[#9AAEBC]">
                  Need vendor access?{" "}
                  <button
                    type="button"
                    onClick={() => router.push("/vendor-apply")}
                    className="font-semibold text-[#4F8FBF] hover:text-[#26648B]"
                  >
                    Apply here
                  </button>
                </p>

              </div>

            </div>

          </div>

          <div className="px-8 py-4 bg-[#F7FAFC] border-t border-[#E5EEF3] text-center">

            <p className="text-[11px] text-[#94A5B3]">
              InnoVibe Mobility · Internal Workspace
            </p>

          </div>

        </div>

      </div>

    </div>
  );
}