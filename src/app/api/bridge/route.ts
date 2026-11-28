/**
 * End-of-day Bridge Question server route (`src/app/api/bridge/route.ts`).
 *
 * Feature overview & use cases:
 * - Implements `FLOW.md` Section 3 (`POST /api/bridge`):
 *   1. Verifies the person's token and loads their active journey
 *   2. Ensures all scheduled questions for `currentDay` have been answered
 *   3. Generates today's Bridge from `excludedFromAI === false` answers via `generateDayBridge`
 *   4. Saves `bridges/{day}`, marks `sessions/{day}.completedAt`, and for Days 1–4 sets
 *      `nextUnlockAt = serverNow + GAP_MINUTES` and increments `currentDay`
 *   5. On Day 5, saves `bridges/5` without locking so the person can view their Day 5
 *      Bridge and proceed directly to `/synthesis`.
 */

import { type NextRequest, NextResponse } from "next/server";
import { generateDayBridge } from "@/lib/bridge/generate";
import {
  getBridgeForDay,
  getLatestJourney,
  listDayAnswers,
  saveBridge,
  updateJourney,
  updateSession,
} from "@/lib/db/repository";
import {
  UnauthorizedError,
  verifyRequestPersonId,
} from "@/lib/firebase/admin";
import { computeNextUnlockAt, evaluateGapLock } from "@/lib/journey/gap";
import { getQuestionsForDay } from "@/lib/journey/questions";
import { logError, logInfo } from "@/lib/log";

/**
 * Generates (or retrieves idempotently) the end-of-day Bridge and sets the server-enforced gap.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  logInfo("api.bridge.POST");
  try {
    const personId = await verifyRequestPersonId(request);
    const journey = await getLatestJourney(personId);

    if (!journey) {
      return NextResponse.json(
        { error: "No active journey found." },
        { status: 404 },
      );
    }

    if (journey.status === "paused") {
      return NextResponse.json(
        { error: "Journey is paused.", redirectTo: "/paused" },
        { status: 403 },
      );
    }

    const serverNow = new Date();
    const lockCheck = evaluateGapLock(journey.nextUnlockAt, serverNow);
    if (lockCheck.locked) {
      const completedDay = Math.max(1, journey.currentDay - 1);
      const existingLockedBridge = await getBridgeForDay(
        personId,
        journey.id,
        completedDay,
      );
      return NextResponse.json({
        day: completedDay,
        bridge: existingLockedBridge
          ? {
              day: existingLockedBridge.day,
              text: existingLockedBridge.text,
              format: existingLockedBridge.format,
            }
          : null,
        lockedUntil: lockCheck.lockedUntilIso,
        serverNow: lockCheck.serverNowIso,
        remainingMs: lockCheck.remainingMs,
        isDay5Complete: false,
      });
    }

    const day = journey.currentDay;
    const existingBridge = await getBridgeForDay(personId, journey.id, day);
    if (existingBridge) {
      return NextResponse.json({
        day,
        bridge: {
          day: existingBridge.day,
          text: existingBridge.text,
          format: existingBridge.format,
        },
        lockedUntil: null,
        serverNow: serverNow.toISOString(),
        remainingMs: 0,
        isDay5Complete: day === 5,
      });
    }

    const todaysAnswers = await listDayAnswers(personId, journey.id, day, {
      excludeFlaggedSafety: true,
    });
    const scheduled = getQuestionsForDay(day);
    const answeredQids = new Set(todaysAnswers.map((a) => a.qid));
    const missing = scheduled.filter((q) => !answeredQids.has(q.qid));

    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Complete today's remaining question(s) before generating the Bridge.`,
          nextQid: missing[0].qid,
        },
        { status: 400 },
      );
    }

    const language = journey.language ?? "en";
    const generated = await generateDayBridge({
      day,
      answers: todaysAnswers,
      language,
    });

    const savedBridge = await saveBridge(personId, journey.id, {
      day,
      text: generated.text,
      language,
      format: generated.format,
      wordCount: generated.wordCount,
      model: generated.model,
      promptVersion: generated.promptVersion,
    });

    const nowIso = serverNow.toISOString();
    await updateSession(personId, journey.id, day, {
      completedAt: nowIso,
    });

    if (day < 5) {
      const nextUnlockAt = computeNextUnlockAt(serverNow);
      await updateJourney(personId, journey.id, {
        currentDay: day + 1,
        nextUnlockAt,
      });

      const gapEval = evaluateGapLock(nextUnlockAt, serverNow);
      return NextResponse.json({
        day,
        bridge: {
          day: savedBridge.day,
          text: savedBridge.text,
          format: savedBridge.format,
        },
        lockedUntil: gapEval.lockedUntilIso,
        serverNow: gapEval.serverNowIso,
        remainingMs: gapEval.remainingMs,
        isDay5Complete: false,
      });
    }

    await updateJourney(personId, journey.id, {
      nextUnlockAt: null,
    });

    return NextResponse.json({
      day: 5,
      bridge: {
        day: savedBridge.day,
        text: savedBridge.text,
        format: savedBridge.format,
      },
      lockedUntil: null,
      serverNow: nowIso,
      remainingMs: 0,
      isDay5Complete: true,
    });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logError("api.bridge.error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to write today's Bridge Question.",
      },
      { status: 500 },
    );
  }
}
