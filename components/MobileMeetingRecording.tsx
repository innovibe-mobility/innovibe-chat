"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  channelId: string;
  channelName: string;
};

type Stage =
  | "idle"
  | "loading"
  | "meeting"
  | "transcribing"
  | "processing"
  | "done";

type JitsiAPI = {
  executeCommand: (command: string, ...args: any[]) => void;
  addListener: (event: string, listener: (data: any) => void) => void;
  removeListener?: (
    event: string,
    listener: (data: any) => void
  ) => void;
  dispose: () => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (
      domain: string,
      options: any
    ) => JitsiAPI;
  }
}

export default function MobileMeetingRecording({
  channelId,
  channelName,
}: Props) {
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const jitsiApiRef = useRef<JitsiAPI | null>(null);

  const transcriptMapRef = useRef<
    Map<string, string>
  >(new Map());

  const transcriptParticipantsRef = useRef<
    Map<string, string>
  >(new Map());

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");

  const roomName = `InnoVibe-${channelName}`;

  useEffect(() => {
    return () => {
      try {
        jitsiApiRef.current?.dispose();
      } catch {}

      jitsiApiRef.current = null;
    };
  }, []);

  function resetTranscript() {
    transcriptMapRef.current.clear();
    transcriptParticipantsRef.current.clear();
    setTranscript("");
  }

  function buildTranscript() {
    const lines: string[] = [];

    for (const [messageId, text] of transcriptMapRef.current) {
      const participant =
        transcriptParticipantsRef.current.get(messageId) ||
        "Participant";

      if (text.trim()) {
        lines.push(`${participant}: ${text.trim()}`);
      }
    }

    return lines.join("\n");
  }

  function updateTranscript() {
    setTranscript(buildTranscript());
  }

  function addTranscriptChunk(event: any) {
    const messageId =
      event?.messageID ||
      `${event?.participant?.id || "unknown"}-${Date.now()}`;

    const participant =
      event?.participant?.name ||
      "Participant";

    const text =
      event?.final ||
      event?.stable ||
      event?.unstable ||
      "";

    if (!text.trim()) return;

    transcriptParticipantsRef.current.set(
      messageId,
      participant
    );

    transcriptMapRef.current.set(
      messageId,
      text.trim()
    );

    updateTranscript();

    console.log("JITSI TRANSCRIPT:", {
      messageId,
      participant,
      text,
      final: event?.final,
      stable: event?.stable,
      unstable: event?.unstable,
    });
  }

  function attachJitsiListeners(api: JitsiAPI) {
    api.addListener(
      "transcriptionChunkReceived",
      addTranscriptChunk
    );

    api.addListener(
      "transcribingStatusChanged",
      (event: any) => {
        console.log(
          "JITSI TRANSCRIBING STATUS:",
          event
        );

        if (event?.on) {
          setStage("transcribing");
        }
      }
    );

    api.addListener(
      "recordingStatusChanged",
      (event: any) => {
        console.log(
          "JITSI RECORDING STATUS:",
          event
        );
      }
    );

    api.addListener(
      "micError",
      (event: any) => {
        console.error(
          "JITSI MIC ERROR:",
          event
        );

        setError(
          event?.message ||
            "Jitsi could not access the microphone."
        );
      }
    );

    api.addListener(
      "errorOccurred",
      (event: any) => {
        console.error(
          "JITSI ERROR:",
          event
        );
      }
    );

    api.addListener(
      "readyToClose",
      () => {
        console.log("Jitsi ready to close");
      }
    );
  }

  async function loadJitsi() {
    if (window.JitsiMeetExternalAPI) {
      createJitsi();
      return;
    }

    const existingScript =
      document.querySelector(
        'script[src="https://meet.jit.si/external_api.js"]'
      );

    if (existingScript) {
      const waitForJitsi = () => {
        if (window.JitsiMeetExternalAPI) {
          createJitsi();
        } else {
          setTimeout(waitForJitsi, 100);
        }
      };

      waitForJitsi();
      return;
    }

    const script =
      document.createElement("script");

    script.src =
      "https://meet.jit.si/external_api.js";

    script.async = true;

    script.onload = () => {
      if (!window.JitsiMeetExternalAPI) {
        setError(
          "Jitsi API loaded but could not be initialized."
        );
        setStage("idle");
        return;
      }

      createJitsi();
    };

    script.onerror = () => {
      setError(
        "Could not load Jitsi. Please check your internet connection."
      );
      setStage("idle");
    };

    document.head.appendChild(script);
  }

  function createJitsi() {
    if (!jitsiContainerRef.current) {
      setError(
        "Jitsi meeting container is not ready."
      );
      setStage("idle");
      return;
    }

    if (!window.JitsiMeetExternalAPI) {
      setError(
        "Jitsi API is unavailable."
      );
      setStage("idle");
      return;
    }

    try {
      jitsiApiRef.current?.dispose();
    } catch {}

    jitsiApiRef.current = null;

    jitsiContainerRef.current.innerHTML = "";

    const api =
      new window.JitsiMeetExternalAPI(
        "meet.jit.si",
        {
          roomName,
          parentNode:
            jitsiContainerRef.current,
          width: "100%",
          height: "100%",

          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            prejoinPageEnabled: true,
            disableAP: true,
          },

          interfaceConfigOverwrite: {
            MOBILE_APP_PROMO: false,
            TOOLBAR_BUTTONS: [
              "microphone",
              "camera",
              "chat",
              "tileview",
              "hangup",
            ],
          },

          userInfo: {
            displayName: "InnoVibe User",
            email: "user@innovibe.local",
          },
        }
      );

    jitsiApiRef.current = api;

    attachJitsiListeners(api);

    setStage("meeting");
  }

  async function openMeeting() {
    console.log(
      "INNOVIBE MOBILE MEETING CLICKED"
    );

    setError("");
    resetTranscript();
    setStage("loading");
    setOpen(true);

    setTimeout(() => {
      void loadJitsi();
    }, 100);
  }

  function closeMeeting() {
    if (
      stage === "processing"
    ) {
      return;
    }

    try {
      jitsiApiRef.current?.dispose();
    } catch {}

    jitsiApiRef.current = null;

    setOpen(false);
    setStage("idle");
    resetTranscript();
    setError("");
  }

  function startTranscription() {
    const api = jitsiApiRef.current;

    if (!api) {
      setError(
        "Jitsi is not ready yet. Please wait a moment."
      );
      return;
    }

    resetTranscript();
    setError("");

    try {
      console.log(
        "STARTING JITSI TRANSCRIPTION"
      );

      api.executeCommand(
        "startRecording",
        {
          transcription: true,
        }
      );

      setStage("transcribing");
    } catch (err: any) {
      console.error(
        "START TRANSCRIPTION ERROR:",
        err
      );

      setError(
        err?.message ||
          "Could not start transcription."
      );
    }
  }

  async function stopTranscription() {
    const api = jitsiApiRef.current;

    if (!api) {
      setError(
        "Jitsi meeting is not available."
      );
      return;
    }

    setStage("processing");
    setError("");

    try {
      console.log(
        "STOPPING JITSI TRANSCRIPTION"
      );

      api.executeCommand(
        "stopRecording",
        "local",
        true
      );
    } catch (err) {
      console.warn(
        "Jitsi stop warning:",
        err
      );
    }

    /*
     * Give Jitsi a moment to deliver
     * the final transcription chunks.
     */
    await new Promise((resolve) =>
      setTimeout(resolve, 2500)
    );

    const finalTranscript =
      buildTranscript().trim();

    console.log(
      "FINAL TRANSCRIPT:",
      finalTranscript
    );

    if (!finalTranscript) {
      setStage("transcribing");

      setError(
        "Jitsi did not return any transcript. Please make sure participants are speaking and transcription is available for this meeting."
      );

      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error(
          "Your session has expired. Please sign in again."
        );
      }

      const response = await fetch(
        "/api/mobile-meeting-transcript",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },

          body: JSON.stringify({
            channel_id: channelId,
            transcript: finalTranscript,
          }),
        }
      );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result?.error ||
            "Failed to generate the meeting MOM."
        );
      }

      setStage("done");
    } catch (err: any) {
      console.error(
        "MOBILE MOM ERROR:",
        err
      );

      setStage("transcribing");

      setError(
        err?.message ||
          "Something went wrong while generating the MOM."
      );
    }
  }
    return (
    <>
      {/* MOBILE BUTTON */}
      <div
  className="md:hidden fixed left-3 right-3 bottom-[90px] z-[9999] rounded-xl px-4 py-3 text-center bg-[#0E1320] border border-white/[0.08] shadow-lg"
>
  <p className="text-sm font-semibold text-white">
    🎙️ Meeting Recording
  </p>

  <p className="text-xs text-white/50 mt-1">
    Meeting recording is available on desktop/laptop.
  </p>

  <p className="text-xs text-white/50">
    Please open InnoVibe Office on a desktop or laptop to record this meeting.
  </p>
</div>
  
      {/* FULL-SCREEN MEETING OVERLAY */}
      {typeof document !== "undefined" &&
        createPortal(
          open ? (
            <div
              className="fixed inset-0 bg-[#060810] flex flex-col"
              style={{
                zIndex: 2147483647,
                width: "100vw",
                height: "100dvh",
                minHeight: "100dvh",
                pointerEvents: "auto",
              }}
            >
              {/* HEADER */}
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
                  onClick={closeMeeting}
                  disabled={stage === "processing"}
                  className="h-9 w-9 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.08] disabled:opacity-30"
                >
                  ×
                </button>
              </div>

              {/* JITSI */}
              <div
                ref={jitsiContainerRef}
                className="flex-1 min-h-0 bg-black"
                style={{
                  width: "100%",
                  minHeight: 0,
                }}
              />

              {/* CONTROLS */}
              <div className="shrink-0 bg-[#0E1320] border-t border-white/[0.08] p-3">
                {stage === "loading" && (
                  <div className="text-center py-2">
                    <div className="text-2xl mb-2 animate-pulse">
                      📹
                    </div>

                    <p className="text-white font-semibold">
                      Opening Jitsi...
                    </p>

                    <p className="text-xs text-white/40 mt-1">
                      Connecting to the meeting.
                    </p>
                  </div>
                )}

                {stage === "meeting" && (
                  <div>
                    <p className="text-xs text-white/45 mb-2 text-center">
                      Join the meeting and make sure your microphone works.
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

                {stage === "transcribing" && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-red-300">
                        🔴 Transcription active
                      </div>

                      <div className="text-xs text-white/40">
                        {transcript
                          ? `${transcript.length} characters`
                          : "Listening..."}
                      </div>
                    </div>

                    {transcript && (
                      <div className="mb-3 max-h-24 overflow-y-auto rounded-lg bg-black/30 border border-white/[0.06] p-2 text-xs text-white/60 whitespace-pre-wrap">
                        {transcript}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={stopTranscription}
                      className="w-full rounded-xl bg-gradient-to-b from-[#E0574F] to-[#C43E37] text-white py-3 text-sm font-semibold"
                    >
                      ⏹ Stop Meeting & Generate MOM
                    </button>
                  </div>
                )}

                {stage === "processing" && (
                  <div className="text-center py-2">
                    <div className="text-2xl mb-2 animate-pulse">
                      🤖
                    </div>

                    <p className="text-white font-semibold">
                      Generating MOM...
                    </p>

                    <p className="text-xs text-white/40 mt-1">
                      Creating the MOM from the real meeting transcript.
                    </p>
                  </div>
                )}

                {stage === "done" && (
                  <div className="text-center py-2">
                    <div className="text-3xl mb-2">
                      ✅
                    </div>

                    <p className="text-white font-semibold">
                      MOM generated successfully
                    </p>

                    <p className="text-xs text-white/40 mt-1">
                      The meeting MOM has been posted to #{channelName}.
                    </p>

                    <button
                      type="button"
                      onClick={closeMeeting}
                      className="mt-3 w-full rounded-xl bg-white text-[#101522] py-2.5 text-sm font-semibold"
                    >
                      Done
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
          ) : null,
          document.body
        )}
    </>
  );

  
}