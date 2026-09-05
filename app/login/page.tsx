"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const SELECTABLE_ROLES = [
  { value: "employee", label: "Employee" },
  { value: "technician", label: "Technician" },
  { value: "service_manager", label: "Service Manager" },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("employee");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (mode === "signup") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName, role } },
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      // No manual profile insert needed -- a database trigger
      // (see supabase/auto-create-profile.sql) creates it automatically,
      // using the role picked here.
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-graphite-900">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-graphite-100 p-8">
        <div className="mb-6">
          <div className="w-10 h-10 rounded-xl bg-signal-500 text-graphite-900 flex items-center justify-center font-bold text-lg mb-3">
            ⚡
          </div>
          <h1 className="text-xl font-display font-semibold text-graphite-900 tracking-tight">
            InnoVibe
          </h1>
          <p className="text-sm text-graphite-400 mt-1">
            {mode === "signin"
              ? "Sign in with your work account"
              : "Create your account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1 text-graphite-700">
                  Full name
                </label>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full border border-graphite-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal-500 focus:border-transparent"
                  placeholder="Satya Kumar"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-graphite-700">
                  Your role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full border border-graphite-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal-500 bg-white"
                >
                  {SELECTABLE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-graphite-400 mt-1">
                  CEO/HR access is set separately by an admin.
                </p>
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium mb-1 text-graphite-700">
              Email
            </label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-graphite-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal-500 focus:border-transparent"
              placeholder="you@innovibemobility.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-graphite-700">
              Password
            </label>
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-graphite-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal-500 focus:border-transparent"
              placeholder="••••••••"
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
            className="w-full bg-signal-500 hover:bg-signal-600 text-graphite-900 text-sm font-semibold rounded-lg py-2.5 transition disabled:opacity-60 shadow-sm"
          >
            {loading
              ? "Please wait..."
              : mode === "signin"
              ? "Sign in"
              : "Create account"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-5 text-sm text-signal-600 hover:underline"
        >
          {mode === "signin"
            ? "New employee? Create an account"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
