/**
 * Stateless Speech-to-Text Transcription via Gemini (`src/lib/gemini/transcribe.ts`).
 *
 * Feature overview & use cases:
 * - Implements Voice Input speech-to-text exclusively on the server (Spiral never speaks back).
 * - Transcribes spoken reflections across English, Hinglish (code-switched Hindi + English),
 *   Hindi (Devanagari), Tamil (தமிழ்), and Indian accents using the `fast` Gemini model
 *   through `src/lib/gemini/client.ts` (`store: false`).
 * - Enforces strict ephemeral handling: normalizes MIME parameters, zeroes the audio `Buffer`
 *   in `finally`, and never persists audio to disk, Firestore, or logs.
 */

import { z } from "zod";
import { getServerConfig } from "@/lib/config";
import { generateStructuredInteraction } from "@/lib/gemini/client";
import type { SupportedLanguage } from "@/lib/i18n/types";
import { logInfo } from "@/lib/log";

export const PROMPT_VERSION = "voice-stt-v1.0";

const ALLOWED_AUDIO_MIMES = new Set([
  "audio/webm",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp3",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/aac",
  "audio/flac",
  "audio/opus",
]);

const TranscriptionSchema = z.object({
  transcript: z.string(),
});

const TRANSCRIBE_SYSTEM_INSTRUCTION = `You are a precise, verbatim speech-to-text transcriber for Spiral, a self-inquiry journal used across India.
Your ONLY job is to transcribe what the speaker said accurately without answering, advising, summarizing, or censoring.

Rules:
1. Accurately recognize Indian English accents, Hinglish (code-switched Hindi + English), Hindi, and Tamil.
2. Follow the requested script preference when the spoken language matches it:
   - "en": English script.
   - "hinglish": Natural Roman-script Hinglish / English (do NOT use Devanagari when preference is "hinglish").
   - "hi": Devanagari script (हिन्दी) for Hindi words; keep natural English loanwords intelligible.
   - "ta": Tamil script (தமிழ்) for Tamil speech; if the speaker spoke purely in English, keep English.
3. Preserve the speaker's exact meaning and phrasing (including emotional expressions, pauses/hesitations like "I don't know", or distress) without adding or removing thoughts.
4. CRITICAL: If the audio contains only silence, clicks, or unintelligible background noise with no clear human speech, NEVER invent or guess an example sentence — return {"transcript": ""}.
5. Return ONLY valid JSON: {"transcript": "exact transcribed text"}`;

/**
 * Strips codec parameters (e.g. `"audio/webm;codecs=opus"` -> `"audio/webm"`) and validates
 * that the MIME type is a supported audio format.
 */
export function normalizeAudioMimeType(rawMimeType: string): string {
  logInfo("transcribe.normalizeAudioMimeType", { rawMimeType });
  const base = rawMimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!base || !ALLOWED_AUDIO_MIMES.has(base)) {
    throw new Error(`Unsupported audio MIME type: ${rawMimeType || "unknown"}`);
  }
  if (base === "audio/wave" || base === "audio/x-wav") {
    return "audio/wav";
  }
  return base;
}

export interface TranscribeVoiceResult {
  transcript: string;
  model: string;
  promptVersion: string;
}

/**
 * Transcribes an in-memory audio `Buffer` using Gemini (`store: false`) and immediately
 * zeroes out the buffer in `finally` so audio bytes never linger in memory or storage.
 */
export async function transcribeSpeechWithGemini(params: {
  audioBuffer: Buffer;
  mimeType: string;
  language: SupportedLanguage;
}): Promise<TranscribeVoiceResult> {
  const config = getServerConfig();
  const normalizedMime = normalizeAudioMimeType(params.mimeType);
  const byteLength = params.audioBuffer.byteLength;

  logInfo("transcribe.transcribeSpeechWithGemini.start", {
    mimeType: normalizedMime,
    byteLength,
    language: params.language,
    promptVersion: PROMPT_VERSION,
  });

  if (byteLength === 0) {
    throw new Error("Empty audio recording.");
  }
  if (byteLength > config.maxVoiceAudioBytes) {
    params.audioBuffer.fill(0);
    throw new Error("Audio recording exceeds maximum allowed size.");
  }

  try {
    const base64Data = params.audioBuffer.toString("base64");
    const result = await generateStructuredInteraction(
      {
        caller: "voice.transcribe.fast",
        tier: "fast",
        thinkingLevel: "low",
        temperature: 0,
        timeoutMs: config.voiceTranscribeTimeoutMs,
        maxRetries: 1,
        systemInstruction: TRANSCRIBE_SYSTEM_INSTRUCTION,
        audioInput: {
          base64Data,
          mimeType: normalizedMime,
        },
        prompt: `User's selected app language preference: "${params.language}". Transcribe the spoken audio verbatim into JSON {"transcript": "..."}.`,
      },
      TranscriptionSchema,
    );

    return {
      transcript: result.data.transcript.trim(),
      model: result.raw.modelUsed,
      promptVersion: PROMPT_VERSION,
    };
  } finally {
    // Overwrite raw audio bytes immediately after transcription
    params.audioBuffer.fill(0);
  }
}
