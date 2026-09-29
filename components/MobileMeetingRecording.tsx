"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { JitsiMeeting } from "@jitsi/react-sdk";

type Props = {
  channelId: string;
  channelName: string;
};

type Stage =
  | "idle"
  | "meeting"
  | "recording"
  | "uploading"
  | "processing"
  | "done";

const MAX_FILE_SIZE = 49 * 1024 * 1024;

const ACCEPT = [
  ".webm",
  ".mp4",
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
  const jitsiApiRef = useRef<any>(null);

  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [recordingStarted, setRecordingStarted] = useState(false);

  function reset() {
    setStage("idle");
    setProgress(0);
    setError("");
    setRecordingStarted(false);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function close() {
    if (
      stage === "recording" ||
      stage === "uploading" ||
      stage === "processing"
    ) {
      return;
    }

    try {
      jitsiApiRef.current?.dispose();
    } catch {}

    jitsiApiRef.current = null;

    setOpen(false);
    reset();
  }

  function openMeeting() {
    reset();
    setOpen(true);
    setStage("meeting");
  }

  function startJitsiRecording() {
    if (!jitsiApiRef.current) {
      setError("The meeting is still loading. Please wait a moment.");
      return;
    }

    try {
      jitsiApiRef.current.executeCommand("startRecording", {
        mode: "local",
        onlySelf: false,
      });

      setRecordingStarted(true);
      setStage("recording");
      setError("");
    } catch (err: any) {
      console.error("Jitsi recording start failed:", err);

      setError(
        err?.message ||
          "Jitsi could not start the recording on this device."
      );
    }
  }

  function stopJitsiRecording() {
    if (!jitsiApiRef.current) {
      return;
    }

    try {
      jitsiApiRef.current.executeCommand(
        "stopRecording",
        "local",
        false
      );

      setRecordingStarted(false);

      /*
       * Jitsi local recording saves the recording
       * to the phone's device storage.
       *
       * We then ask the user to select that file
       * and send it through the existing MOM pipeline.
       */
      setStage("meeting");

      setTimeout(() => {
        inputRef.current?.click();
      }, 1200);
    } catch (err: any) {
      console.error("Jitsi recording stop failed:", err);

      setError(
        err?.message ||
          "Could not stop the Jitsi recording."
      );
    }
  }

  async function uploadRecording(file: File) {
    setError("");

    const extension =
      "." +
      (file.name.split(".").pop()?.toLowerCase() ?? "");

    if (!ACCEPT.includes(extension)) {
      setError(
        "Unsupported recording format. Please select the WebM recording created by Jitsi."
      );
      return;
    }

    if (file.size === 0) {
      setError("The selected recording is empty.");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(
        "The recording is larger than 49 MB. Please make a shorter recording."
      );
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token || !session.user) {
      setError(
        "Your session has expired. Please sign in again."
      );
      return;
    }

    const safeName = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const path =
      `${session.user.id}/${channelId}/` +
      `${crypto.randomUUID()}-${safeName}`;

    try {
      setStage("uploading");
      setProgress(5);

      /*
       * Use the normal Supabase upload for these
       * small audio recordings.
       *
       * Jitsi local recording should be much smaller
       * than a full screen recording.
       */
      const { error: uploadError } =
        await supabase.storage
          .from("meeting-recordings")
          .upload(path, file, {
            cacheControl: "3600",
            contentType:
              file.type || "audio/webm",
            upsert: false,
          });

      if (uploadError) {
        throw new Error(
          `Upload failed: ${uploadError.message}`
        );
      }

      setProgress(50);
      setStage("processing");

      const response = await fetch(
        "/api/mobile-meeting-recording",
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel_id: channelId,
            storage_path: path,
            original_name: file.name,
            mime_type:
              file.type || "audio/webm",
          }),
        }
      );

      const data =
        await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            `Meeting processing failed (${response.status}).`
        );
      }

      setProgress(100);
      setStage("done");
    } catch (err: any) {
      console.error(
        "Mobile meeting processing failed:",
        err
      );

      setStage("meeting");
      setProgress(0);

      setError(
        err?.message ||
          "Something went wrong while processing the meeting."
      );
    }
  }

  return (
    <>
      {/* MOBILE BUTTON */}
      <button
        type="button"
        onClick={openMeeting}
        className="
          md:hidden
          fixed
          left-3
          right-3
          bottom-[76px]
          z-[55]
          flex
          items-center
          justify-center
          gap-1.5
          rounded-xl
          border
          border-white/[0.1]
          bg-gradient-to-b
          from-[#9B6CFF]
          to-[#7650D8]
          px-3
          py-2.5
          text-xs
          font-semibold
          text-white
          shadow-[0_10px_30px_-10px_rgba(118,80,216,0.8)]
        "
      >
        <span className="text-[14px]">
          🎙️
        </span>

        <span>
          Record Meeting
        </span>
      </button>

      {open && (
        <div
          className="
            fixed
            inset-0
            z-[100]
            flex
            items-center
            justify-center
            bg-black/80
            p-2
            sm:p-4
          "
        >
          <div
            className="
              relative
              flex
              h-[92vh]
              w-full
              flex-col
              overflow-hidden
              rounded-2xl
              border
              border-white/[0.1]
              bg-[#101522]
              shadow-2xl
            "
          >
            {/* HEADER */}

            <div
              className="
                flex
                shrink-0
                items-center
                gap-3
                border-b
                border-white/[0.08]
                px-4
                py-3
              "
            >
              <div
                className="
                  flex
                  h-9
                  w-9
                  shrink-0
                  items-center
                  justify-center
                  rounded-xl
                  bg-[#8B63E8]/15
                "
              >
                🎙️
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white">
                  Meeting Recording
                </h3>

                <p className="truncate text-[11px] text-white/40">
                  #{channelName}
                </p>
              </div>

              <button
                type="button"
                onClick={close}
                disabled={
                  stage === "recording" ||
                  stage === "uploading" ||
                  stage === "processing"
                }
                className="
                  h-8
                  w-8
                  rounded-lg
                  text-lg
                  text-white/50
                  hover:bg-white/[0.06]
                  hover:text-white
                  disabled:opacity-30
                "
              >
                ×
              </button>
            </div>

            {/* JITSI */}

            {stage !== "done" &&
              stage !== "uploading" &&
              stage !== "processing" && (
                <div className="min-h-0 flex-1">
                  <JitsiMeeting
                    domain="meet.jit.si"
                    roomName={`InnoVibe-${channelName}`}
                    configOverwrite={{
                      startWithAudioMuted: false,
                      startWithVideoMuted: false,
                      disableAP: false,
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
                    onApiReady={(externalApi) => {
                      jitsiApiRef.current =
                        externalApi;

                      externalApi.addListener(
                        "recordingStatusChanged",
                        (event: any) => {
                          console.log(
                            "Jitsi recording status:",
                            event
                          );

                          if (event.on) {
                            setRecordingStarted(true);
                            setStage("recording");
                          } else {
                            setRecordingStarted(false);
                          }
                        }
                      );
                    }}
                    getIFrameRef={(iframeRef) => {
                      iframeRef.style.height = "100%";
                      iframeRef.style.width = "100%";
                    }}
                  />
                </div>
              )}

            {/* UPLOADING */}

            {(stage === "uploading" ||
              stage === "processing") && (
              <div
                className="
                  flex
                  flex-1
                  flex-col
                  items-center
                  justify-center
                  px-6
                  text-center
                "
              >
                <div className="mb-4 text-4xl">
                  🤖
                </div>

                <h3 className="text-base font-semibold text-white">
                  Generating Meeting MOM
                </h3>

                <p className="mt-2 text-sm text-white/50">
                  Uploading the recording and
                  generating the transcript...
                </p>

                <div
                  className="
                    mt-6
                    h-2
                    w-full
                    max-w-xs
                    overflow-hidden
                    rounded-full
                    bg-white/[0.08]
                  "
                >
                  <div
                    className="
                      h-full
                      rounded-full
                      bg-[#8B63E8]
                      transition-all
                    "
                    style={{
                      width: `${progress}%`,
                    }}
                  />
                </div>

                <p className="mt-2 text-xs text-white/40">
                  {progress}%
                </p>
              </div>
            )}

            {/* DONE */}

            {stage === "done" && (
              <div
                className="
                  flex
                  flex-1
                  flex-col
                  items-center
                  justify-center
                  px-6
                  text-center
                "
              >
                <div className="mb-4 text-5xl">
                  ✅
                </div>

                <h3 className="text-lg font-semibold text-white">
                  Meeting MOM ready
                </h3>

                <p className="mt-2 max-w-sm text-sm text-white/50">
                  The transcript and AI-generated
                  MOM have been saved and posted
                  to this channel.
                </p>

                <button
                  type="button"
                  onClick={close}
                  className="
                    mt-6
                    w-full
                    max-w-xs
                    rounded-xl
                    bg-white
                    py-3
                    text-sm
                    font-semibold
                    text-[#101522]
                  "
                >
                  Done
                </button>
              </div>
            )}

            {/* ERROR */}

            {error && (
              <div
                className="
                  absolute
                  bottom-24
                  left-3
                  right-3
                  z-20
                  rounded-xl
                  border
                  border-red-400/20
                  bg-red-950/90
                  px-4
                  py-3
                  text-xs
                  text-red-200
                  shadow-xl
                "
              >
                {error}
              </div>
            )}

            {/* RECORDING CONTROLS */}

            {stage !== "done" &&
              stage !== "uploading" &&
              stage !== "processing" && (
                <div
                  className="
                    absolute
                    bottom-3
                    left-3
                    right-3
                    z-20
                    flex
                    gap-2
                  "
                >
                  {!recordingStarted ? (
                    <button
                      type="button"
                      onClick={
                        startJitsiRecording
                      }
                      className="
                        flex-1
                        rounded-xl
                        bg-red-600
                        px-4
                        py-3
                        text-sm
                        font-semibold
                        text-white
                        shadow-lg
                      "
                    >
                      🔴 Start Recording
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={
                        stopJitsiRecording
                      }
                      className="
                        flex-1
                        rounded-xl
                        bg-red-600
                        px-4
                        py-3
                        text-sm
                        font-semibold
                        text-white
                        shadow-lg
                      "
                    >
                      ⏹ Stop & Process MOM
                    </button>
                  )}
                </div>
              )}
          </div>

          {/* FILE PICKER */}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT.join(",")}
            className="hidden"
            onChange={(event) => {
              const file =
                event.target.files?.[0];

              if (file) {
                void uploadRecording(file);
              }
            }}
          />
        </div>
      )}
    </>
  );
}