"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  channelId: string;
  channelName: string;
};

type Stage = "idle" | "uploading" | "processing" | "done";

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const ACCEPT = [
  ".mp4",
  ".webm",
  ".m4a",
  ".mp3",
  ".mpeg",
  ".mpga",
  ".ogg",
  ".wav",
];

export default function MobileMeetingRecording({
  channelId,
  channelName,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  function reset() {
    setStage("idle");
    setProgress(0);
    setError("");

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function close() {
    if (stage === "uploading" || stage === "processing") {
      return;
    }

    setOpen(false);
    reset();
  }

  async function uploadRecording(file: File) {
    setError("");

    const extension =
      file.name.split(".").pop()?.toLowerCase() ?? "";

    if (!ACCEPT.includes(`.${extension}`)) {
      setError(
        "This recording format is not supported. Use MP4, WebM, M4A, MP3, MPEG, OGG or WAV."
      );
      return;
    }

    if (file.size === 0) {
      setError("The selected recording is empty.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(
        "The recording is larger than 100 MB. Please use a shorter recording or lower recording quality."
      );
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token || !session.user) {
      setError("Your session has expired. Please sign in again.");
      return;
    }

    const safeName = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const path = `${session.user.id}/${channelId}/${crypto.randomUUID()}-${safeName}`;

    try {
      setStage("uploading");
      setProgress(5);

      const { error: uploadError } = await supabase.storage
        .from("meeting-recordings")
        .upload(path, file, {
          cacheControl: "3600",
          contentType: file.type || undefined,
          upsert: false,
        });

      if (uploadError) {
        throw new Error(
          `Upload failed: ${uploadError.message}`
        );
      }

      setProgress(45);
      setStage("processing");

      const response = await fetch(
        "/api/mobile-meeting-recording",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel_id: channelId,
            storage_path: path,
            original_name: file.name,
            mime_type: file.type,
          }),
        }
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            `Meeting processing failed (${response.status}).`
        );
      }

      setProgress(100);
      setStage("done");
    } catch (err: any) {
      setStage("idle");
      setProgress(0);

      setError(
        err?.message ||
          "Something went wrong while processing the meeting."
      );
    }
  }

  return (
    <>
      {/* Mobile-only button */}
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="md:hidden shrink-0 text-xs font-semibold text-white rounded-lg px-2.5 py-2 flex items-center gap-1.5 bg-gradient-to-b from-[#9B6CFF] to-[#7650D8] hover:from-[#AA80FF] hover:to-[#835CE5] transition-all"
        title="Upload a phone screen recording and generate the meeting MOM"
      >
        <span className="text-[14px] leading-none">
          🎙️
        </span>

        <span>Record / Upload</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-white/[0.1] bg-[#101522] shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="px-5 py-4 border-b border-white/[0.07] flex items-center gap-3">

              <div className="h-10 w-10 rounded-xl bg-[#8B63E8]/15 border border-[#8B63E8]/25 flex items-center justify-center">
                🎙️
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-white text-[15px]">
                  Record / Upload Meeting
                </h3>

                <p className="text-xs text-white/40 truncate">
                  #{channelName}
                </p>
              </div>

              <button
                type="button"
                onClick={close}
                disabled={
                  stage === "uploading" ||
                  stage === "processing"
                }
                className="h-8 w-8 rounded-lg text-white/50 hover:text-white hover:bg-white/[0.06] disabled:opacity-30"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="p-5">

              {/* Completed */}
              {stage === "done" ? (
                <div className="text-center py-5">

                  <div className="text-4xl mb-3">
                    ✅
                  </div>

                  <h4 className="text-white font-semibold">
                    Meeting MOM ready
                  </h4>

                  <p className="text-sm text-white/50 mt-2">
                    The transcript and AI-generated MOM
                    have been saved and posted to this
                    channel.
                  </p>

                  <button
                    type="button"
                    onClick={close}
                    className="mt-5 w-full rounded-xl bg-white text-[#101522] py-2.5 text-sm font-semibold"
                  >
                    Done
                  </button>
                </div>

              ) : stage === "uploading" ||
                stage === "processing" ? (

                <div className="py-5">

                  <div className="text-center mb-5">

                    <div className="text-3xl mb-3">
                      {stage === "uploading"
                        ? "☁️"
                        : "🤖"}
                    </div>

                    <h4 className="text-white font-semibold">
                      {stage === "uploading"
                        ? "Uploading recording…"
                        : "Preparing your MOM…"}
                    </h4>

                    <p className="text-sm text-white/45 mt-2">
                      {stage === "uploading"
                        ? "Keep this page open until the upload finishes."
                        : "Transcribing the meeting and generating the AI MOM. This can take a little while."}
                    </p>
                  </div>

                  <div className="h-2 rounded-full bg-white/[0.07] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#8B63E8] transition-all duration-300"
                      style={{
                        width: `${progress}%`,
                      }}
                    />
                  </div>

                  <p className="text-center text-xs text-white/40 mt-2">
                    {progress}%
                  </p>
                </div>

              ) : (

                <>
                  {/* Instructions */}
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">

                    <h4 className="text-sm font-semibold text-white mb-3">
                      📱 How to record your meeting
                    </h4>

                    <ol className="space-y-2 text-sm text-white/60">

                      <li>
                        <span className="text-white font-medium">
                          1.
                        </span>{" "}
                        Start your phone's Screen Recording.
                      </li>

                      <li>
                        <span className="text-white font-medium">
                          2.
                        </span>{" "}
                        Open the InnoVibe Jitsi meeting.
                      </li>

                      <li>
                        <span className="text-white font-medium">
                          3.
                        </span>{" "}
                        Conduct your meeting normally.
                      </li>

                      <li>
                        <span className="text-white font-medium">
                          4.
                        </span>{" "}
                        Stop Screen Recording after the meeting.
                      </li>

                      <li>
                        <span className="text-white font-medium">
                          5.
                        </span>{" "}
                        Return here and upload the recording.
                      </li>

                    </ol>
                  </div>

                  {/* Warning */}
                  <div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.05] p-3">
                    <p className="text-xs text-amber-200/70">
                      Make sure everyone on the meeting knows
                      that the meeting is being recorded.
                    </p>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="mt-3 rounded-xl border border-red-400/20 bg-red-400/[0.06] p-3">
                      <p className="text-xs text-red-200">
                        {error}
                      </p>
                    </div>
                  )}

                  {/* Upload */}
                  <button
                    type="button"
                    onClick={() =>
                      inputRef.current?.click()
                    }
                    className="mt-5 w-full rounded-xl bg-[#8B63E8] hover:bg-[#7955CE] text-white py-3 text-sm font-semibold transition-colors"
                  >
                    📤 Upload Recording
                  </button>

                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT.join(",")}
                    className="hidden"
                    onChange={(event) => {
                      const file =
                        event.target.files?.[0];

                      if (file) {
                        uploadRecording(file);
                      }
                    }}
                  />

                  <p className="text-[11px] text-white/30 text-center mt-3">
                    Maximum recording size: 100 MB
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}