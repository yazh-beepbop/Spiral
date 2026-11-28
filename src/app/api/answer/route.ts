/**
 * Answer submission pipeline (`src/app/api/answer/route.ts`).
 *
 * Feature overview & use cases:
 * - Implements the exact "life of one answer" pipeline in `FLOW.md` Section 2:
 *   1. Verify Firebase ID token and load active journey
 *   2. Enforce server-time gap lock (`403` with `lockedUntil` if before `nextUnlockAt`)
 *   3. Run `classifyAnswerSafety` (with recent 2 answers & entryPoint) BEFORE anything else:
 *      - `acute`: save answer with `excludedFromAI = true`, record `safetyEvent`, set
 *        `journey.status = "paused"`, return `{ action: "paused", redirectTo: "/paused" }`
 *      - `concern`: record `safetyEvent` and continue gently
 *   4. Run Standard Mode `evaluateIdkEscalation` (only after safety check passes):
 *      - IDK #1 -> return smaller version of question
 *      - IDK #2 -> return gentle naming of avoidance
 *      - IDK #3 -> accept, set `idkFlagged = true`, save answer
 *   5. Save screened answer under `persons/{uid}/journeys/{jid}/sessions/{day}/answers/q_{qid}`
 *   6. Return the next question for today (resolving Opener/Adaptive L3 text) or signal
 *      `day_complete` so the client calls `/api/bridge`.
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getBridgeForDay,
  getLatestJourney,
  getOrCreateSession,
  listDayAnswers,
  recordSafetyEvent,
  saveAnswer,
  updateJourney,
  updateSession,
} from "@/lib/db/repository";
import {
  UnauthorizedError,
  verifyRequestPersonId,
} from "@/lib/firebase/admin";
import {
  DailyCallCapExceededError,
  runWithUsageContext,
} from "@/lib/gemini/client";
import { resolveAdaptiveQuestionText } from "@/lib/journey/adaptive";
import { evaluateGapLock } from "@/lib/journey/gap";
import { evaluateIdkEscalation } from "@/lib/journey/idk";
import {
  formatOpenerQuestion,
  getDayMetadata,
  getQuestionsForDay,
} from "@/lib/journey/questions";
import { logError, logInfo } from "@/lib/log";
import { classifyAnswerSafety } from "@/lib/safety/classify";

const AnswerRequestSchema = z.object({
  qid: z.number().int().positive(),
  text: z
    .string()
    .trim()
    .min(1, "Write even a few words before continuing.")
    .max(6000),
});

/**
 * Handles `POST /api/answer` through safety screening, IDK escalation, storage, and question progression.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  logInfo("api.answer.POST");
  try {
    const personId = await verifyRequestPersonId(request);
    return await runWithUsageContext({ personId }, async () => {
      const rawBody: unknown = await request.json();
      const parsed = AnswerRequestSchema.safeParse(rawBody);

      if (!parsed.success) {
        return NextResponse.json(
          {
            error:
              parsed.error.issues[0]?.message ??
              "Please enter an answer first.",
          },
          { status: 400 },
        );
      }

      const { qid, text } = parsed.data;
      const journey = await getLatestJourney(personId);
      if (!journey) {
        return NextResponse.json(
          { error: "No active journey found." },
          { status: 404 },
        );
      }

      if (journey.status === "paused") {
        return NextResponse.json(
          {
            error: "Journey is paused.",
            action: "paused",
            redirectTo: "/paused",
          },
          { status: 403 },
        );
      }

      if (journey.status === "completed") {
        return NextResponse.json(
          { error: "Journey is already completed.", redirectTo: "/synthesis" },
          { status: 403 },
        );
      }

      const serverNow = new Date();
      const gap = evaluateGapLock(journey.nextUnlockAt, serverNow);
      if (gap.locked) {
        return NextResponse.json(
          {
            error: "Next session is locked until the gap finishes.",
            state: "locked",
            lockedUntil: gap.lockedUntilIso,
            serverNow: gap.serverNowIso,
            remainingMs: gap.remainingMs,
          },
          { status: 403 },
        );
      }

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
      const expectedIdx = scheduled.findIndex((q) => !answeredQids.has(q.qid));

      if (expectedIdx === -1) {
        return NextResponse.json({
          action: "day_complete",
          day,
        });
      }

      const currentQuestion = scheduled[expectedIdx];
      if (currentQuestion.qid !== qid) {
        return NextResponse.json(
          {
            error: `Out-of-order question submission. Expected QID ${currentQuestion.qid}.`,
            expectedQid: currentQuestion.qid,
          },
          { status: 409 },
        );
      }

      let questionSnapshot = currentQuestion.text;
      if (currentQuestion.qid === 6 && day >= 2) {
        const prevBridge = await getBridgeForDay(personId, journey.id, day - 1);
        questionSnapshot = formatOpenerQuestion(prevBridge?.text ?? null);
      } else if (currentQuestion.isAdaptive) {
        questionSnapshot = await resolveAdaptiveQuestionText({
          personId,
          journeyId: journey.id,
          day,
          qid: currentQuestion.qid,
          session,
        });
      }

      const priorIdkCount = session.idkCounts[String(qid)] ?? 0;

      // Gather up to 2 previous non-excluded answers for safety context
      let contextPool = [...dayAnswers];
      if (contextPool.length < 2 && day > 1) {
        const prevDayAnswers = await listDayAnswers(
          personId,
          journey.id,
          day - 1,
          { excludeFlaggedSafety: true },
        );
        contextPool = [...prevDayAnswers, ...contextPool];
      }
      const previousAnswers = contextPool.slice(-2).map((a) => ({
        qid: a.qid,
        questionText: a.questionText,
        text: a.text,
      }));

      // 1. SAFETY FIRST — every answer is screened before anything else happens to it
      const safetyResult = await classifyAnswerSafety({
        questionText: questionSnapshot,
        answerText: text,
        previousAnswers,
        entryPoint: journey.entryPoint,
        personId,
      });

      if (safetyResult.level === "acute") {
        const savedAcute = await saveAnswer(personId, journey.id, day, {
          qid,
          layer: currentQuestion.layer,
          questionText: questionSnapshot,
          text,
          idkCount: priorIdkCount,
          idkFlagged: false,
          safety: {
            level: "acute",
            model: safetyResult.model,
            escalated: safetyResult.escalated,
          },
          excludedFromAI: true,
        });

        const answerPath = `persons/${personId}/journeys/${journey.id}/sessions/${day}/answers/${savedAcute.id}`;
        await recordSafetyEvent(personId, {
          level: "acute",
          answerPath,
          action: "journey_paused_resources_shown",
        });
        await updateJourney(personId, journey.id, { status: "paused" });

        return NextResponse.json({
          action: "paused",
          redirectTo: "/paused",
        });
      }

      // 2. IDK CHECK (runs ONLY after safety check has passed the answer)
      const step2RotationIndex = Object.values(session.idkCounts).filter(
        (c) => c >= 2,
      ).length;
      const idkDecision = await evaluateIdkEscalation({
        question: currentQuestion,
        answerText: text,
        priorIdkCount,
        idkMode: journey.idkMode,
        safetyLevel: safetyResult.level,
        step2RotationIndex,
        personId,
      });

      if (idkDecision.action === "redirect") {
        await updateSession(personId, journey.id, day, {
          idkCounts: {
            ...session.idkCounts,
            [String(qid)]: idkDecision.idkCount,
          },
        });

        if (safetyResult.level === "concern") {
          await recordSafetyEvent(personId, {
            level: "concern",
            answerPath: `persons/${personId}/journeys/${journey.id}/sessions/${day}/qid_${qid}_idk_${idkDecision.idkCount}`,
            action: "concern_logged_during_idk_redirect",
          });
        }

        return NextResponse.json({
          action: "idk_redirect",
          idkCount: idkDecision.idkCount,
          redirectPrompt: idkDecision.promptMessage,
          canExitNextPass: idkDecision.canExitNextPass,
          gentleCheckIn:
            safetyResult.level === "concern"
              ? "Take all the time you need here. There is no rush."
              : null,
        });
      }

      // 3. SAVE FINAL SCREENED ANSWER
      const savedAnswer = await saveAnswer(personId, journey.id, day, {
        qid,
        layer: currentQuestion.layer,
        questionText: questionSnapshot,
        text,
        idkCount: idkDecision.idkCount,
        idkFlagged: idkDecision.idkFlagged,
        safety: {
          level: safetyResult.level,
          model: safetyResult.model,
          escalated: safetyResult.escalated,
        },
        excludedFromAI: false,
      });

      if (safetyResult.level === "concern") {
        await recordSafetyEvent(personId, {
          level: "concern",
          answerPath: `persons/${personId}/journeys/${journey.id}/sessions/${day}/answers/${savedAnswer.id}`,
          action: "gentle_continue_logged",
        });
      }

      if (qid === 6) {
        await updateSession(personId, journey.id, day, {
          overnightReflection: text,
        });
      }

      // 4. ADVANCE TO NEXT QUESTION OR END OF DAY
      const nextIdx = expectedIdx + 1;
      if (nextIdx >= scheduled.length) {
        return NextResponse.json({
          action: "day_complete",
          day,
          idkExitMessage: idkDecision.exitMessage,
        });
      }

      const nextQuestion = scheduled[nextIdx];
      const dayMeta = getDayMetadata(day);
      const refreshedSession = await getOrCreateSession(
        personId,
        journey.id,
        day,
      );

      let nextText = nextQuestion.text;
      if (nextQuestion.isAdaptive) {
        nextText = await resolveAdaptiveQuestionText({
          personId,
          journeyId: journey.id,
          day,
          qid: nextQuestion.qid,
          session: refreshedSession,
        });
      }

      return NextResponse.json({
        action: "next_question",
        day,
        dayTitle: dayMeta.title,
        headerLabel: dayMeta.headerLabel,
        questionIndex: nextIdx,
        totalQuestions: scheduled.length,
        idkExitMessage: idkDecision.exitMessage,
        gentleCheckIn:
          safetyResult.level === "concern"
            ? "Thank you for being honest about how heavy things feel. Go gently on this next one."
            : null,
        question: {
          qid: nextQuestion.qid,
          layer: nextQuestion.layer,
          format: nextQuestion.format,
          text: nextText,
          choices: nextQuestion.choices ?? null,
          rankingItems: nextQuestion.rankingItems ?? null,
          priorIdkCount:
            refreshedSession.idkCounts[String(nextQuestion.qid)] ?? 0,
        },
      });
    });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof DailyCallCapExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    logError("api.answer.error", error);
    return NextResponse.json(
      { error: "Could not save your answer. Please try again." },
      { status: 500 },
    );
  }
}
