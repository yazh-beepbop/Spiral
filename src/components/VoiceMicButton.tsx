/**
 * Stateless Speech-to-Text Microphone Button (`src/components/VoiceMicButton.tsx`).
 *
 * Feature overview & use cases:
 * - Placed directly alongside each answer input box on `/session` (speech-to-text ONLY —
 *   Spiral never speaks back).
 * - Tap once to record, tap again to stop.
 * - Requests microphone permission ONLY on the user's first tap (never on mount), showing a
 *   plain-spoken explanation line beforehand so the visitor knows why permission is asked
 *   and that audio is deleted right after transcription.
 * - Uploads in-memory audio to `POST /api/voice/transcribe`, appends the transcript into the
 *   answer box so the visitor can read and edit it before sending, and discards all audio
 *   chunks immediately.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/LanguageProvider";
import { authorizedFetch } from "@/lib/firebase/client";
import { logError, logInfo } from "@/lib/log";
import styles from "./VoiceMicButton.module.css";

const PREFERRED_MIMES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
] as const;

let micPermissionExplainedInSession = false;

export interface VoiceMicButtonProps {
  onTranscript: (transcript: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

/**
 * Selects the best supported browser `MediaRecorder` audio MIME type.
 */
function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }
  for (const candidate of PREFERRED_MIMES) {
    if (
      typeof MediaRecorder.isTypeSupported === "function" &&
      MediaRecorder.isTypeSupported(candidate)
    ) {
      return candidate;
    }
  }
  return "";
}

/**
 * Renders the tap-to-record / tap-to-stop voice input control alongside an answer box.
 */
export function VoiceMicButton({
  onTranscript,
  disabled = false,
  compact = false,
}: VoiceMicButtonProps) {
  const { language, t } = useI18n();
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [showFirstTapNote, setShowFirstTapNote] = useState(
    !micPermissionExplainedInSession,
  );
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  /**
   * Stops and releases all active microphone hardware tracks immediately.
   */
  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    recorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      chunksRef.current = [];
      releaseStream();
    };
  }, [releaseStream]);

  /**
   * Sends the recorded audio blob to `/api/voice/transcribe` and clears memory immediately.
   */
  const uploadAndTranscribe = useCallback(
    async (blob: Blob, mimeType: string): Promise<void> => {
      setTranscribing(true);
      setVoiceNotice(null);
      try {
        const formData = new FormData();
        const ext = mimeType.includes("mp4")
          ? "m4a"
          : mimeType.includes("ogg")
            ? "ogg"
            : "webm";
        formData.append("audio", blob, `voice-input.${ext}`);
        formData.append("language", language);

        const res = await authorizedFetch("/api/voice/transcribe", {
          method: "POST",
          createSessionIfMissing: true,
          body: formData,
        });

        const payload = (await res.json()) as {
          transcript?: string;
          error?: string;
        };

        if (!res.ok) {
          setVoiceNotice(payload.error ?? t.voice.transcribeFailed);
          return;
        }

        const cleanTranscript = (payload.transcript ?? "").trim();
        if (!cleanTranscript) {
          setVoiceNotice(t.voice.emptyTranscript);
          return;
        }

        onTranscript(cleanTranscript);
      } catch (error: unknown) {
        logError("VoiceMicButton.uploadAndTranscribe.failed", error);
        setVoiceNotice(t.voice.transcribeFailed);
      } finally {
        chunksRef.current = [];
        setTranscribing(false);
      }
    },
    [language, onTranscript, t.voice.emptyTranscript, t.voice.transcribeFailed],
  );

  /**
   * Toggles voice recording: first tap requests mic permission (if needed) and starts recording;
   * second tap stops recording and transcribes into the answer box.
   */
  const handleToggleMic = async (): Promise<void> => {
    if (disabled || transcribing) {
      return;
    }

    if (recording && recorderRef.current) {
      logInfo("VoiceMicButton.stopRecording");
      setRecording(false);
      recorderRef.current.stop();
      return;
    }

    setVoiceNotice(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setVoiceNotice(t.voice.unsupportedBrowser);
      return;
    }

    try {
      logInfo("VoiceMicButton.startRecording", { language });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micPermissionExplainedInSession = true;
      setShowFirstTapNote(false);
      streamRef.current = stream;
      chunksRef.current = [];

      const chosenMime = pickRecorderMimeType();
      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const recordedMime = recorder.mimeType || chosenMime || "audio/webm";
        const combinedBlob = new Blob(chunksRef.current, {
          type: recordedMime,
        });
        chunksRef.current = [];
        releaseStream();
        if (combinedBlob.size > 0) {
          void uploadAndTranscribe(combinedBlob, recordedMime);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (error: unknown) {
      logError("VoiceMicButton.permissionOrRecordFailed", error);
      releaseStream();
      setRecording(false);
      setVoiceNotice(t.voice.permissionDenied);
    }
  };

  return (
    <div className={compact ? styles.wrapCompact : styles.wrap}>
      <button
        type="button"
        disabled={disabled || transcribing}
        aria-pressed={recording}
        aria-label={recording ? t.voice.micAriaStop : t.voice.micAriaRecord}
        className={
          recording
            ? `${styles.micBtn} ${styles.micBtnRecording}`
            : styles.micBtn
        }
        onClick={() => void handleToggleMic()}
      >
        <span
          className={
            recording
              ? `${styles.micIndicator} ${styles.micIndicatorLive}`
              : styles.micIndicator
          }
          aria-hidden="true"
        />
        <span>
          {transcribing
            ? t.voice.micTranscribing
            : recording
              ? t.voice.micTapToStop
              : t.voice.micTapToRecord}
        </span>
      </button>

      {showFirstTapNote && !compact ? (
        <p className={styles.explainLine}>{t.voice.firstTapExplain}</p>
      ) : null}

      {voiceNotice ? (
        <p className={styles.noticeLine} role="status">
          {voiceNotice}
        </p>
      ) : null}
    </div>
  );
}
