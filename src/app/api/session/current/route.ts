/**
 * Current session state route handler (`src/app/api/session/current/route.ts`).
 *
 * Feature overview & use cases:
 * - Serves as the authoritative server state snapshot on page load/reload (`FLOW.md` Section 5):
 *   "On reload, `/api/session/current` tells the app exactly where the person is:
 *   mid-session, locked until a time, paused, or complete."
 * - Compares `journey.nextUnlockAt` exclusively against server `new Date()` so changing
 *   the client device clock cannot bypass the gap (`ROADMAP.md` T8).
 * - Resolves Day 2–5 Opener (`QID 6`) with yesterday's Bridge and caches Adaptive L3
 *   question wording (`QIDs 11, 16, 23`).
 */

import { type NextRequest, NextResponse } from "next/server";
import {
  getBridgeForDay,
  getLatestJourney,
  getOrCreateSession,
  listDayAnswers,
  updateJourney,
} from "@/lib/db/repository";
import {
  UnauthorizedError,
  verifyRequestPersonId,
} from "@/lib/firebase/admin";
import { resolveAdaptiveQuestionText } from "@/lib/journey/adaptive";
import { evaluateGapLock } from "@/lib/journey/gap";
import {
  formatLocalizedOpenerQuestion,
  getLocalizedDayMetadata,
  getLocalizedQuestion,
} from "@/lib/i18n";
import { getQuestionsForDay } from "@/lib/journey/questions";
import { logError, logInfo } from "@/lib/log";

/**
 * Returns the person's exact server-enforced journey state (`no_journey`, `paused`,
 * `completed`, `locked`, `ready_for_bridge`, `ready_for_synthesis`, or `question`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  logInfo("api.session.current.GET");
  try {
    const personId = await verifyRequestPersonId(request);
    const journey = await getLatestJourney(personId);

    if (!journey) {
      return NextResponse.json({ state: "no_journey" });
    }

    if (journey.status === "paused") {
      return NextResponse.json({
        state: "paused",
        journeyId: journey.id,
        currentDay: journey.currentDay,
      });
    }

    if (journey.status === "completed") {
      const bridge5 = await getBridgeForDay(personId, journey.id, 5);
      return NextResponse.json({
        state: "completed",
        journeyId: journey.id,
        bridge: bridge5
          ? { day: 5, text: bridge5.text, format: bridge5.format }
          : null,
      });
    }

    const serverNow = new Date();
    const gap = evaluateGapLock(journey.nextUnlockAt, serverNow);
    if (gap.locked) {
      const completedDay = Math.max(1, journey.currentDay - 1);
      const prevBridge = await getBridgeForDay(
        personId,
        journey.id,
        completedDay,
      );
      return NextResponse.json({
        state: "locked",
        journeyId: journey.id,
        completedDay,
        nextDay: journey.currentDay,
        bridge: prevBridge
          ? {
              day: prevBridge.day,
              text: prevBridge.text,
              format: prevBridge.format,
            }
          : null,
        lockedUntil: gap.lockedUntilIso,
        serverNow: gap.serverNowIso,
        remainingMs: gap.remainingMs,
      });
    }

    // Server time has passed nextUnlockAt — clear the lock field cleanly
    if (journey.nextUnlockAt !== null) {
      await updateJourney(personId, journey.id, { nextUnlockAt: null });
    }

    const day = journey.currentDay;
    const session = await getOrCreateSession(personId, journey.id, day);
    const dayAnswers = await listDayAnswers(personId, journey.id, day, {
      excludeFlaggedSafety: true,
    });
    const answeredQids = new Set(dayAnswers.map((a) => a.qid));
    const scheduled = getQuestionsForDay(day);
    const nextIdx = scheduled.findIndex((q) => !answeredQids.has(q.qid));

    if (nextIdx === -1) {
      const existingBridge = await getBridgeForDay(personId, journey.id, day);
      if (day === 5 && existingBridge) {
        return NextResponse.json({
          state: "ready_for_synthesis",
          journeyId: journey.id,
          day: 5,
          bridge: {
            day: 5,
            text: existingBridge.text,
            format: existingBridge.format,
          },
        });
      }
      return NextResponse.json({
        state: "ready_for_bridge",
        journeyId: journey.id,
        day,
      });
    }

    const language = journey.language ?? "en";
    const baseQuestion = scheduled[nextIdx];
    const currentQuestion =
      getLocalizedQuestion(baseQuestion.qid, language) ?? baseQuestion;
    const dayMeta = getLocalizedDayMetadata(day, language);

    let resolvedText = currentQuestion.text;
    let previousBridgeText: string | null = null;

    if (currentQuestion.qid === 6 && day >= 2) {
      const prevBridge = await getBridgeForDay(personId, journey.id, day - 1);
      previousBridgeText = prevBridge?.text ?? null;
      resolvedText = formatLocalizedOpenerQuestion(
        previousBridgeText,
        language,
      );
    } else if (currentQuestion.isAdaptive) {
      resolvedText = await resolveAdaptiveQuestionText({
        personId,
        journeyId: journey.id,
        day,
        qid: currentQuestion.qid,
        session,
        language,
      });
    }

    return NextResponse.json({
      state: "question",
      journeyId: journey.id,
      language,
      day,
      dayTitle: dayMeta.title,
      headerLabel: dayMeta.headerLabel,
      questionIndex: nextIdx,
      totalQuestions: scheduled.length,
      previousBridgeText,
      question: {
        qid: currentQuestion.qid,
        layer: currentQuestion.layer,
        format: currentQuestion.format,
        text: resolvedText,
        choices: currentQuestion.choices ?? null,
        rankingItems: currentQuestion.rankingItems ?? null,
        priorIdkCount: session.idkCounts[String(currentQuestion.qid)] ?? 0,
      },
    });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logError("api.session.current.error", error);
    return NextResponse.json(
      { error: "Unable to load your current Spiral session." },
      { status: 500 },
    );
  }
}
