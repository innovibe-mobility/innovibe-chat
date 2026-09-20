"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

function AIAssistantContent() {
  const searchParams = useSearchParams();
  const channelId = searchParams.get("channel_id");

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [momLoading, setMomLoading] = useState(false);
  const [error, setError] = useState("");
  const [specificDate, setSpecificDate] = useState("");

  async function getAccessToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Authentication required. Please log in again.");
    }

    return session.access_token;
  }

  async function askAI() {
    if (!question.trim()) return;

    setLoading(true);
    setError("");
    setAnswer("");

    try {
      const accessToken = await getAccessToken();

      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          question,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "AI request failed.");
      }

      setAnswer(data.answer);
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateMOM(date?: string) {
    if (!channelId) {
      setError("Please open AI Assistant from a chat channel.");
      return;
    }

    setMomLoading(true);
    setError("");
    setAnswer("");

    try {
      const accessToken = await getAccessToken();

      const response = await fetch("/api/daily-mom", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          channel_id: channelId,
          ...(date ? { date } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "MOM generation failed.");
      }

      setAnswer(
        data.mom?.content ??
          data.mom ??
          "No MOM was returned."
      );
    } catch (error: any) {
      setError(error.message);
    } finally {
      setMomLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-8">
      <div className="max-w-5xl mx-auto">

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              InnoVibe AI
            </h1>

            <p className="text-gray-500 mt-1">
              Your internal meeting assistant
            </p>
          </div>

          <Link
            href="/dashboard"
            className="border bg-white px-4 py-2 rounded-lg"
          >
            ← Chat
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border p-6">

          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask something like: What decisions were made today?"
            rows={4}
            className="w-full border rounded-xl p-4 outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div className="flex flex-wrap gap-3 mt-4">

            <button
              onClick={askAI}
              disabled={loading || momLoading}
              className="bg-black text-white px-5 py-3 rounded-xl disabled:opacity-50"
            >
              {loading ? "Thinking..." : "Ask AI"}
            </button>

            <button
              onClick={() => void generateMOM()}
              disabled={loading || momLoading}
              className="bg-blue-600 text-white px-5 py-3 rounded-xl disabled:opacity-50"
            >
              {momLoading ? "Generating..." : "📋 Today's MOM"}
            </button>

          </div>

          <div className="mt-6 border-t pt-5">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">

              <div className="flex-1">
                <label
                  htmlFor="mom-date"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  📅 MOM for a specific date
                </label>

                <input
                  id="mom-date"
                  type="date"
                  value={specificDate}
                  onChange={(e) => setSpecificDate(e.target.value)}
                  className="w-full border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                onClick={() => void generateMOM(specificDate)}
                disabled={loading || momLoading || !specificDate}
                className="bg-gray-800 text-white px-5 py-3 rounded-xl disabled:opacity-50"
              >
                {momLoading ? "Generating..." : "Generate MOM"}
              </button>

            </div>

            <p className="text-xs text-gray-500 mt-2">
              Today's MOM uses today's date automatically. Use the date picker only when you need an older day's MOM.
            </p>
          </div>

          {error && (
            <div className="mt-6 bg-red-50 text-red-700 p-4 rounded-xl">
              {error}
            </div>
          )}

          {answer && (
            <div className="mt-6 bg-gray-50 border rounded-xl p-6">
              <div className="whitespace-pre-wrap leading-7 text-gray-800">
                {answer}
              </div>
            </div>
          )}

        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-6">

          <button
            onClick={() =>
              setQuestion("What meetings happened today?")
            }
            className="bg-white border rounded-xl p-5 text-left"
          >
            📅 What meetings happened today?
          </button>

          <button
            onClick={() =>
              setQuestion("What decisions were made today?")
            }
            className="bg-white border rounded-xl p-5 text-left"
          >
            ✅ What decisions were made?
          </button>

          <button
            onClick={() =>
              setQuestion("What action items were assigned today?")
            }
            className="bg-white border rounded-xl p-5 text-left"
          >
            📌 What action items were assigned?
          </button>

          <button
            onClick={() =>
              setQuestion(
                "What unresolved issues were discussed recently?"
              )
            }
            className="bg-white border rounded-xl p-5 text-left"
          >
            ⚠️ What issues are still pending?
          </button>

        </div>

      </div>
    </main>
  );
}

export default function AIAssistantPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-gray-600">
            Loading InnoVibe AI...
          </div>
        </main>
      }
    >
      <AIAssistantContent />
    </Suspense>
  );
}