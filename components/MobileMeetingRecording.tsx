"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { JitsiMeeting } from "@jitsi/react-sdk";

type Props = {
  channelId: string;
  channelName: string;
};

type Stage = "idle" | "meeting" | "recording" | "processing" | "done";

export default function MobileMeetingRecording({
  channelId,
  channelName,
}: Props) {
  const jitsiApiRef = useRef<any>(null);
  const transcriptRef = useRef<string[]>([]);

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");

  function reset() {
    transcriptRef.current = [];
    setTranscript("");
    setError("");
    setStage("idle");
  }

  function close() {
    if (stage === "processing") return;

    try {
      jitsiApiRef.current?.dispose?.();
    } catch {}

    jitsiApiRef.current = null;
    setOpen(false);
    reset();
  }

  function openMeeting() {
    setError("");
    setOpen(true);
    setStage("meeting");
  }

  function startTranscription() {
    const api = jitsiApiRef.current;

    if (!api) {
      setError("Jitsi meeting is not ready yet.");
      return;
    }

    transcriptRef.current = [];
    setTranscript("");
    setError("");

    try {
      api.executeCommand("startRecording", {
        transcription: true,
      });

      setStage("recording");
    } catch (err: any) {
      console.error("Failed to start transcription:", err);
      setError(
        err?.message || "Could not start meeting transcription."
      );
    }
  }

  async function stopTranscription() {
    const api = jitsiApiRef.current;

    if (!api) return;

    setStage("processing");

    try {
      api.executeCommand("stopRecording", "local", true);
    } catch (err) {
      console.warn("Jitsi transcription stop warning:", err);
    }

    // Give Jitsi a moment to deliver the final transcript chunk.
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const finalTranscript = transcriptRef.current
      .join("\n")
      .trim();

    if (!finalTranscript) {
      setStage("recording");
      setError(
        "No transcript was received. Make sure the meeting participants are speaking and transcription is enabled."
      );
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const response = await fetch("/api/mobile-meeting-transcript", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          channel_id: channelId,
          transcript: finalTranscript,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error || "Failed to generate the meeting MOM."
        );
      }

      setStage("done");
    } catch (err: any) {
      console.error("MOM generation error:", err);
      setStage("recording");
      setError(
        err?.message || "Something went wrong generating the MOM."
      );
    }
  }

  return (
    <>
      {/* Mobile button */}
      <button
        type="button"
        onClick={openMeeting}
        className="md:hidden fixed left-3 right-3 bottom-[90px] z-40 rounded-xl px-4 py-3 text-sm font-semibold text-white bg-gradient-to-b from-[#3D9BD6] to-[#2C7BB0] shadow-lg"
      >
        🎙️ Meeting + MOM
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] bg-[#060810] flex flex-col">
          {/* Header */}
          <div className="shrink-0 px-4 py-3 border-b border-white/[0.08] flex items-center justify-between bg-[#0E1320]">
            <div className="min-w-0">
              <h3 className="font-semibold text-white text-[15px]">
                Meeting + MOM
              </h3>

              <p className="text-xs text-white/40 truncate">
                #{channelName}
              </p>
            </div>

            <button
              type="button"
              onClick={close}
              disabled={stage === "processing"}
              className="h-8 w-8 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] disabled:opacity-30"
            >
              ×
            </button>
          </div>

          {/* Jitsi */}
          <div className="flex-1 min-h-0 relative">
            <JitsiMeeting
              domain="meet.jit.si"
              roomName={`InnoVibe-${channelName}`}
              configOverwrite={{
                startWithAudioMuted: false,
                startWithVideoMuted: false,
                prejoinPageEnabled: true,
              }}
              interfaceConfigOverwrite={{
                MOBILE_APP_PROMO: false,
                TOOLBAR_BUTTONS: [
                  "microphone",
                  "camera",
                  "chat",
                  "tileview",
                  "hangup",
                ],
              }}
              userInfo={{
                displayName: "InnoVibe User",
                email: "user@innovibe.local",
              }}
              onApiReady={(api) => {
                jitsiApiRef.current = api;

                api.addListener(
                  "transcriptionChunkReceived",
                  (event: any) => {
                    const text =
                      event?.final ||
                      event?.stable ||
                      "";

                    if (!text.trim()) return;

                    const participant =
                      event?.participant?.name || "Participant";

                    const line = `${participant}: ${text.trim()}`;

                    const existing =
                      transcriptRef.current;

                    const last =
                      existing[existing.length - 1];

                    // Avoid duplicate chunks.
                    if (last === line) return;

                    existing.push(line);

                    const combined = existing.join("\n");

                    setTranscript(combined);
                  }
                );

                api.addListener(
                  "transcribingStatusChanged",
                  (event: any) => {
                    console.log(
                      "Jitsi transcription status:",
                      event
                    );
                  }
                );

                api.addListener(
                  "recordingStatusChanged",
                  (event: any) => {
                    console.log(
                      "Jitsi recording/transcription status:",
                      event
                    );
                  }
                );
              }}
              onReadyToClose={() => {
                jitsiApiRef.current = null;
              }}
              getIFrameRef={(iframeRef) => {
                iframeRef.style.height = "100%";
                iframeRef.style.width = "100%";
                iframeRef.style.border = "0";
              }}
            />
          </div>

          {/* Controls */}
          <div className="shrink-0 bg-[#0E1320] border-t border-white/[0.08] p-3">
            {stage === "done" ? (
              <div className="text-center py-2">
                <div className="text-3xl mb-2">✅</div>

                <p className="text-white font-semibold">
                  MOM generated successfully
                </p>

                <p className="text-xs text-white/40 mt-1">
                  The meeting MOM has been posted to #{channelName}.
                </p>

                <button
                  type="button"
                  onClick={close}
                  className="mt-3 w-full rounded-xl bg-white text-[#101522] py-2.5 text-sm font-semibold"
                >
                  Done
                </button>
              </div>
            ) : stage === "processing" ? (
              <div className="text-center py-2">
                <div className="text-2xl mb-2 animate-pulse">
                  🤖
                </div>

                <p className="text-white font-semibold">
                  Generating MOM...
                </p>

                <p className="text-xs text-white/40 mt-1">
                  Creating the meeting minutes from the real transcript.
                </p>
              </div>
            ) : stage === "recording" ? (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs text-white/60">
                    🔴 Transcription active
                  </div>

                  <div className="text-xs text-white/30">
                    {transcript
                      ? `${transcript.length} characters`
                      : "Listening..."}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={stopTranscription}
                  className="w-full rounded-xl bg-gradient-to-b from-[#E0574F] to-[#C43E37] text-white py-3 text-sm font-semibold"
                >
                  ⏹ Stop Meeting & Generate MOM
                </button>
              </div>
            ) : (
              <div>
                <p className="text-xs text-white/45 mb-2 text-center">
                  Join the meeting first, then start transcription.
                </p>

                <button
                  type="button"
                  onClick={startTranscription}
                  className="w-full rounded-xl bg-gradient-to-b from-[#3D9BD6] to-[#2C7BB0] text-white py-3 text-sm font-semibold"
                >
                  🎙️ Start Meeting Transcription
                </button>
              </div>
            )}

            {error && (
              <div className="mt-2 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}