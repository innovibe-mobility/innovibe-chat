"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-graphite-900">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-graphite-100 p-8">
        <div className="mb-6">
          <Image
            src="/innovibe-logo.png"
            alt="InnoVibe Mobility"
            width={1024}
            height={490}
            className="h-12 w-auto mb-4"
          />
          <p className="text-sm text-graphite-400 mt-1">
            Sign in with your work account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            {loading ? "Please wait..." : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-xs text-graphite-400 text-center">
          Don't have an account? Contact your admin to get one set up.
        </p>
      </div>
    </div>
  );
}
