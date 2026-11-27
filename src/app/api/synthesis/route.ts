/**
 * Day 5 Synthesis & Insight Feedback route handler (`src/app/api/synthesis/route.ts`).
 *
 * Feature overview & use cases:
 * - Implements `FLOW.md` Section 4:
 *   1. `GET /api/synthesis`: returns existing client-safe synthesis (stripping internal
 *      `patternKey` and `model` fields) if already generated.
 *   2. `POST /api/synthesis`: loads all 5 days of non-excluded answers + Bridges, runs
 *      `detectJourneyPatterns` (Zod-validated), saves `patternFlags`, runs
 *      `generateJourneySynthesis`, saves `synthesis/main`, marks journey `completed`,
 *      and returns the client-safe synthesis.
 *   3. `PATCH /api/synthesis`: persists per-insight `"Did this land?"` (`true` / `false`)
 *      feedback to `synthesis/main.insights[].landed`.
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateDayBridge } from "@/lib/bridge/generate";
import {
  getBridgeForDay,
  getCachedDemoSynthesis,
  getLatestJourney,
  getSynthesis,
  listDayAnswers,
  listJourneyAnswers,
  listJourneyBridges,
  saveBridge,
  saveCachedDemoSynthesis,
  savePatternFlags,
  saveSynthesis,
  updateSynthesisInsightFeedback,
  updateSynthesisNoneFitMe,
} from "@/lib/db/repository";
import {
  type AnswerDoc,
  type JourneyDoc,
  type SynthesisDoc,
  toClientSafeSynthesis,
} from "@/lib/db/schema";
import {
  UnauthorizedError,
  verifyRequestPersonId,
} from "@/lib/firebase/admin";
import { getQuestionsForDay } from "@/lib/journey/questions";
import { logError, logInfo } from "@/lib/log";
import { detectJourneyPatterns } from "@/lib/patterns/detect";
import { generateJourneySynthesis } from "@/lib/synthesis/generate";

const FeedbackPatchSchema = z.union([
  z.object({
    insightId: z.string().min(1),
    landed: z.boolean(),
  }),
  z.object({
    noneFitMe: z.boolean(),
  }),
]);

const inFlightSyntheses = new Map<string, Promise<SynthesisDoc>>();

const DEMO_FALLBACK_DAY5_BRIDGE =
  "What if the answer was never a bigger title? What if it was a quieter morning, and work that fits inside it?";

/**
 * If `journey` is a seeded demo journey with Day 5 completed and a saved demo synthesis already
 * exists in Firestore (`demoCache/career_fog_synthesis`), copies that result onto `journey`
 * (keeping the visitor's own Q29 priorities) so `/synthesis` loads instantly with zero live Gemini calls.
 */
async function materializeCachedDemoSynthesisIfReady(
  personId: string,
  journey: JourneyDoc,
  preloadedDay5Answers?: AnswerDoc[],
): Promise<SynthesisDoc | null> {
  if (!journey.isDemoSeed || journey.currentDay < 5) {
    return null;
  }

  const day5Answers =
    preloadedDay5Answers ??
    (await listDayAnswers(personId, journey.id, 5, {
      excludeFlaggedSafety: true,
    }));
  const day5Qids = new Set(day5Answers.map((a) => a.qid));
  const missingDay5 = getQuestionsForDay(5).filter((q) => !day5Qids.has(q.qid));
  if (missingDay5.length > 0) {
    return null;
  }

  const cached = await getCachedDemoSynthesis();
  if (!cached) {
    return null;
  }

  logInfo("api.synthesis.demoCacheHit", { journeyId: journey.id });

  const existingBridge5 = await getBridgeForDay(personId, journey.id, 5);
  if (!existingBridge5) {
    await saveBridge(personId, journey.id, {
      day: 5,
      text: DEMO_FALLBACK_DAY5_BRIDGE,
      format: "reframe_question",
      wordCount: DEMO_FALLBACK_DAY5_BRIDGE.split(/\s+/).length,
      model: "demo-cache",
      promptVersion: "bridge-v1.0",
    });
  }

  await savePatternFlags(
    personId,
    journey.id,
    cached.flags,
    cached.crisisType,
  );

  const q29OwnPriorities =
    day5Answers.find((a) => a.qid === 29)?.text.trim() ??
    cached.synthesis.ownPrioritiesText ??
    null;

  return saveSynthesis(personId, journey.id, {
    text: cached.synthesis.text,
    insights: cached.synthesis.insights.map((ins) => ({
      ...ins,
      landed: null,
    })),
    ownPrioritiesText: q29OwnPriorities,
    noneFitMe: false,
    model: cached.synthesis.model,
    promptVersion: cached.synthesis.promptVersion,
  });
}

/**
 * Fetches an already-generated Day 5 synthesis (`GET /api/synthesis`).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  logInfo("api.synthesis.GET");
  try {
    const personId = await verifyRequestPersonId(request);
    const journey = await getLatestJourney(personId);
    if (!journey) {
      return NextResponse.json({ state: "no_journey" }, { status: 404 });
    }
    if (journey.status === "paused") {
      return NextResponse.json({ state: "paused" }, { status: 403 });
    }

    const existing = await getSynthesis(personId, journey.id);
    if (existing) {
      return NextResponse.json({
        state: "ready",
        synthesis: toClientSafeSynthesis(existing),
      });
    }

    const demoCached = await materializeCachedDemoSynthesisIfReady(
      personId,
      journey,
    );
    if (demoCached) {
      return NextResponse.json({
        state: "ready",
        synthesis: toClientSafeSynthesis(demoCached),
      });
    }

    return NextResponse.json({
      state: "pending",
      currentDay: journey.currentDay,
    });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logError("api.synthesis.GET.error", error);
    return NextResponse.json(
      { error: "Unable to load your synthesis." },
      { status: 500 },
    );
  }
}

/**
 * Generates (idempotently) the Day 5 pattern map and hedged synthesis (`POST /api/synthesis`).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  logInfo("api.synthesis.POST");
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

    const existing = await getSynthesis(personId, journey.id);
    if (existing) {
      return NextResponse.json({
        state: "ready",
        synthesis: toClientSafeSynthesis(existing),
      });
    }

    if (journey.currentDay < 5) {
      return NextResponse.json(
        { error: "Synthesis unlocks after completing Day 5." },
        { status: 400 },
      );
    }

    const day5Answers = await listDayAnswers(personId, journey.id, 5, {
      excludeFlaggedSafety: true,
    });
    const day5Qids = new Set(day5Answers.map((a) => a.qid));
    const missingDay5 = getQuestionsForDay(5).filter(
      (q) => !day5Qids.has(q.qid),
    );

    if (missingDay5.length > 0) {
      return NextResponse.json(
        { error: "Complete all Day 5 questions before generating synthesis." },
        { status: 400 },
      );
    }

    const demoCached = await materializeCachedDemoSynthesisIfReady(
      personId,
      journey,
      day5Answers,
    );
    if (demoCached) {
      return NextResponse.json({
        state: "ready",
        synthesis: toClientSafeSynthesis(demoCached),
      });
    }

    const flightKey = `${personId}:${journey.id}`;
    let runningPromise = inFlightSyntheses.get(flightKey);
    if (!runningPromise) {
      runningPromise = (async (): Promise<SynthesisDoc> => {
        // Ensure Day 5 Bridge exists as part of the full 5-Bridge record
        const existingBridge5 = await getBridgeForDay(personId, journey.id, 5);
        if (!existingBridge5) {
          const bridge5 = await generateDayBridge({
            day: 5,
            answers: day5Answers,
          });
          await saveBridge(personId, journey.id, {
            day: 5,
            text: bridge5.text,
            format: bridge5.format,
            wordCount: bridge5.wordCount,
            model: bridge5.model,
            promptVersion: bridge5.promptVersion,
          });
        }

        const [allAnswers, allBridges] = await Promise.all([
          listJourneyAnswers(personId, journey.id, {
            excludeFlaggedSafety: true,
          }),
          listJourneyBridges(personId, journey.id),
        ]);

        const patternMap = await detectJourneyPatterns({
          answers: allAnswers,
          bridges: allBridges,
        });

        await savePatternFlags(
          personId,
          journey.id,
          patternMap.flags,
          patternMap.crisisType,
        );

        const generated = await generateJourneySynthesis({
          crisisType: patternMap.crisisType,
          flags: patternMap.flags,
          answers: allAnswers,
          bridges: allBridges,
        });

        const q29OwnPriorities =
          day5Answers.find((a) => a.qid === 29)?.text.trim() ?? null;

        const savedDoc = await saveSynthesis(personId, journey.id, {
          text: generated.text,
          insights: generated.insights,
          ownPrioritiesText: q29OwnPriorities,
          noneFitMe: false,
          model: generated.model,
          promptVersion: generated.promptVersion,
        });

        if (journey.isDemoSeed) {
          await saveCachedDemoSynthesis({
            crisisType: patternMap.crisisType,
            flags: patternMap.flags,
            synthesis: savedDoc,
          });
        }

        return savedDoc;
      })();

      inFlightSyntheses.set(flightKey, runningPromise);
    }

    let saved: SynthesisDoc;
    try {
      saved = await runningPromise;
    } finally {
      if (inFlightSyntheses.get(flightKey) === runningPromise) {
        inFlightSyntheses.delete(flightKey);
      }
    }

    return NextResponse.json({
      state: "ready",
      synthesis: toClientSafeSynthesis(saved),
    });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logError("api.synthesis.POST.error", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate your Day 5 reflection.",
      },
      { status: 500 },
    );
  }
}

/**
 * Records `"Did this land?"` per-insight feedback OR `"None of these fit me"` (`PATCH /api/synthesis`).
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  logInfo("api.synthesis.PATCH");
  try {
    const personId = await verifyRequestPersonId(request);
    const rawBody: unknown = await request.json();
    const parsed = FeedbackPatchSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Provide either { insightId, landed } or { noneFitMe: boolean }.",
        },
        { status: 400 },
      );
    }

    const journey = await getLatestJourney(personId);
    if (!journey) {
      return NextResponse.json(
        { error: "No journey found." },
        { status: 404 },
      );
    }

    const updated =
      "noneFitMe" in parsed.data
        ? await updateSynthesisNoneFitMe(
            personId,
            journey.id,
            parsed.data.noneFitMe,
          )
        : await updateSynthesisInsightFeedback(
            personId,
            journey.id,
            parsed.data.insightId,
            parsed.data.landed,
          );

    return NextResponse.json({
      ok: true,
      synthesis: toClientSafeSynthesis(updated),
    });
  } catch (error: unknown) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logError("api.synthesis.PATCH.error", error);
    return NextResponse.json(
      { error: "Unable to save feedback." },
      { status: 500 },
    );
  }
}
