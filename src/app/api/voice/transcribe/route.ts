/**
 * Voice Speech-to-Text API route (`src/app/api/voice/transcribe/route.ts`).
 *
 * Feature overview & use cases:
 * - Accepts an ephemeral `multipart/form-data` audio clip (`audio`) and optional `language`
 *   code (`en`, `hinglish`, `hi`, `ta`) from an authenticated user.
 * - Transcribes the clip on the server via `transcribeSpeechWithGemini` (`store: false`).
 * - Deletes/zeroes the in-memory audio buffer immediately in `finally` — audio is NEVER
 *   written to disk, Cloud Storage, Firestore, or logs.
 * - Returns `{ transcript, language }` so the client places the text into the answer box
 *   for the user to read and edit before submitting through `/api/answer` (which runs the
 *   exact same safety classifier as typed text).
 */

import { type NextRequest, NextResponse } from "next/server";
import {
  UnauthorizedError,
  verifyRequestPersonId,
} from "@/lib/firebase/admin";
import { transcribeSpeechWithGemini } from "@/lib/gemini/transcribe";
import { normalizeLanguage } from "@/lib/i18n";
import { logError, logInfo } from "@/lib/log";

/**
 * Handles `POST /api/voice/transcribe` for stateless speech-to-text transcription.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  logInfo("api.voice.transcribe.POST");
  let audioBuffer: Buffer | null = null;

  try {
    await verifyRequestPersonId(request);
    const formData = await request.formData();
    const audioEntry = formData.get("audio");
    const rawLang = formData.get("language");
    const language = normalizeLanguage(
      typeof rawLang === "string" ? rawLang : "en",
    );

    if (!audioEntry || !(audioEntry instanceof Blob)) {
      return NextResponse.json(
        { error: "Missing audio file in request." },
        { status: 400 },
      );
    }

    const arrayBuf = await audioEntry.arrayBuffer();
    audioBuffer = Buffer.from(arrayBuf);

    const result = await transcribeSpeechWithGemini({
      audioBuffer,
      mimeType: audioEntry.type || "audio/webm",
      language,
    });

    logInfo("api.voice.transcribe.completed", {
      language,
      transcriptLength: result.transcript.length,
      audioDeleted: true,
    });

    return NextResponse.json({
      transcript: result.transcript,
      language,
      audioDeleted: true,
    });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logError("api.voice.transcribe.error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to transcribe audio.",
      },
      { status: 400 },
    );
  } finally {
    if (audioBuffer) {
      audioBuffer.fill(0);
      audioBuffer = null;
    }
  }
}
