"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError(
          "This password reset link is invalid or has expired. Please request a new one."
        );
      }

      setChecking(false);
    }

    checkSession();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setMessage("");

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
      const { data, error: userError } =
        await supabase.auth.getUser();

      if (userError || !data.user) {
        setError(
          "Your reset session has expired. Please request a new reset link."
        );
        return;
      }

      const { error: passwordError } =
        await supabase.auth.updateUser({
          password,
        });

      if (passwordError) {
        setError(passwordError.message);
        return;
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          must_change_password: false,
        })
        .eq("id", data.user.id);

      if (profileError) {
        console.error(profileError);
      }

      setMessage(
        "Password updated successfully. Redirecting to login..."
      );

      await supabase.auth.signOut();

      setTimeout(() => {
        router.push("/login");
      }, 1500);
    } catch (err: any) {
      setError(
        err?.message || "Unable to reset your password."
      );
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Checking reset link...
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "#f8fafc",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "#fff",
          borderRadius: "16px",
          padding: "32px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>
          Reset Password
        </h1>

        <p style={{ color: "#64748b" }}>
          Enter your new InnoVibe password.
        </p>

        <form onSubmit={handleSubmit}>
          <label>New Password</label>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            autoComplete="new-password"
            disabled={loading || !!message}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px",
              margin: "8px 0 16px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
            }}
          />

          <label>Confirm Password</label>

          <input
            type="password"
            value={confirmPassword}
            onChange={(e) =>
              setConfirmPassword(e.target.value)
            }
            placeholder="Enter password again"
            autoComplete="new-password"
            disabled={loading || !!message}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px",
              margin: "8px 0 16px",
              borderRadius: "8px",
              border: "1px solid #cbd5e1",
            }}
          />

          {error && (
            <div
              style={{
                marginBottom: "16px",
                padding: "10px",
                borderRadius: "8px",
                background: "#fef2f2",
                color: "#b91c1c",
              }}
            >
              {error}
            </div>
          )}

          {message && (
            <div
              style={{
                marginBottom: "16px",
                padding: "10px",
                borderRadius: "8px",
                background: "#f0fdf4",
                color: "#166534",
              }}
            >
              {message}
            </div>
          )}

          {!message && (
            <button
              type="submit"
              disabled={loading || !!error}
              style={{
                width: "100%",
                padding: "12px",
                border: "none",
                borderRadius: "8px",
                background: "#111827",
                color: "#fff",
                fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          )}
        </form>
      </div>
    </main>
  );
}