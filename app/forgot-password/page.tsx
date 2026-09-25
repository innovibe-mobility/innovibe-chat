"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [loginUsername, setLoginUsername] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    setMessage("");
    setError("");

    const username = loginUsername.trim().toLowerCase();

    if (!username) {
      setError("Please enter your Login ID.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          login_username: username,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(
          data?.error || "Unable to process your request."
        );
        return;
      }

      setMessage(
        data?.message ||
          "If the Login ID is registered, a password reset link has been sent to the registered communication email."
      );
    } catch (err: any) {
      setError(
        err?.message ||
          "Unable to process your request. Please try again."
      );
    } finally {
      setLoading(false);
    }
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
          background: "#ffffff",
          borderRadius: "16px",
          padding: "32px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
        }}
      >
        <h1
          style={{
            margin: 0,
            marginBottom: "8px",
            fontSize: "26px",
            fontWeight: 700,
          }}
        >
          Forgot Password
        </h1>

        <p
          style={{
            marginTop: 0,
            marginBottom: "24px",
            color: "#64748b",
            lineHeight: 1.5,
          }}
        >
          Enter your InnoVibe Login ID. If it is registered,
          we will send a password reset link to your registered
          communication email.
        </p>

        <form onSubmit={handleSubmit}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: 600,
            }}
          >
            Login ID
          </label>

          <input
            type="text"
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
            placeholder="e.g. greeshma.it"
            autoComplete="username"
            disabled={loading}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "12px 14px",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              outline: "none",
              marginBottom: "16px",
              fontSize: "15px",
            }}
          />

          {error && (
            <div
              style={{
                marginBottom: "16px",
                padding: "10px 12px",
                borderRadius: "8px",
                background: "#fef2f2",
                color: "#b91c1c",
                fontSize: "14px",
              }}
            >
              {error}
            </div>
          )}

          {message && (
            <div
              style={{
                marginBottom: "16px",
                padding: "10px 12px",
                borderRadius: "8px",
                background: "#f0fdf4",
                color: "#166534",
                fontSize: "14px",
                lineHeight: 1.5,
              }}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "12px",
              border: "none",
              borderRadius: "10px",
              background: "#111827",
              color: "#ffffff",
              fontSize: "15px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => router.push("/login")}
          style={{
            width: "100%",
            marginTop: "14px",
            padding: "10px",
            border: "none",
            background: "transparent",
            color: "#475569",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          ← Back to Login
        </button>
      </div>
    </main>
  );
}