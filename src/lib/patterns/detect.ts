/**
 * Day 5 Structured Pattern Detector (`src/lib/patterns/detect.ts`).
 *
 * Feature overview & use cases:
 * - Runs on Day 5 (`FLOW.md` Section 4) using the `deep` model (`thinkingLevel: "high"`).
 * - Validates with `zod` that every detected pattern:
 *   1. Uses a valid `patternKey` in `PATTERN_TAXONOMY`
 *   2. Cites at least 2 verbatim quotes (`evidence.length >= 2`) across at least 2 distinct
 *      days (`sessions/{day}/...`) written BEFORE `firstBridgeHintDay` (`CONSTRAINTS.md`).
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import { getServerConfig } from "@/lib/config";
import {
  type AnswerDoc,
  type BridgeDoc,
  type CrisisType,
  CrisisTypeSchema,
  PatternCategorySchema,
  type PatternFlagDoc,
} from "@/lib/db/schema";
import { generateStructuredInteraction } from "@/lib/gemini/client";
import { logInfo } from "@/lib/log";
import {
  buildPatternDetectionPrompt,
  PATTERN_MAP_SYSTEM_INSTRUCTION,
  PROMPT_VERSION,
} from "@/lib/patterns/prompt";
import { VALID_PATTERN_KEYS } from "@/lib/patterns/taxonomy";

/**
 * Extracts the 1-based day number (`1..5`) from a Firestore answer path (`sessions/3/answers/q_12`).
 */
export function extractDayFromAnswerPath(answerPath: string): number | null {
  logInfo("patterns.extractDayFromAnswerPath", { pathLength: answerPath.length });
  const sessionMatch = /sessions\/([1-5])\b/i.exec(answerPath);
  if (sessionMatch) {
    return Number(sessionMatch[1]);
  }
  const dayMatch = /\bday[_\s-]*([1-5])\b/i.exec(answerPath);
  if (dayMatch) {
    return Number(dayMatch[1]);
  }
  return null;
}

const PatternFlagCandidateSchema = z
  .object({
    patternKey: z
      .string()
      .refine((key) => VALID_PATTERN_KEYS.has(key), {
        message: "patternKey must match an entry in PATTERN_TAXONOMY",
      }),
    category: PatternCategorySchema,
    firstBridgeHintDay: z.number().int().min(1).max(5).nullable().default(null),
    evidence: z
      .array(
        z.object({
          answerPath: z.string().min(1),
          quote: z.string().min(2),
        }),
      )
      .min(2),
    confidence: z.number().min(0).max(1),
  })
  .superRefine((flag, ctx) => {
    const preBridgeDays = new Set<number>();
    for (const ev of flag.evidence) {
      const day = extractDayFromAnswerPath(ev.answerPath);
      if (day !== null) {
        if (
          flag.firstBridgeHintDay === null ||
          day <= flag.firstBridgeHintDay
        ) {
          preBridgeDays.add(day);
        }
      }
    }
    if (preBridgeDays.size < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Pattern "${flag.patternKey}" must cite at least 2 answers from at least 2 different days written BEFORE firstBridgeHintDay (${String(flag.firstBridgeHintDay)}).`,
      });
    }
  });

const PatternDetectionResponseSchema = z.object({
  crisisType: CrisisTypeSchema,
  flags: z.array(PatternFlagCandidateSchema).min(3).max(5),
});

export interface PatternMapOutput {
  crisisType: CrisisType;
  flags: PatternFlagDoc[];
  model: string;
  promptVersion: string;
}

/**
 * Detects 3–5 pre-Bridge multi-day evidence-backed patterns and the journey's `crisisType`.
 */
export async function detectJourneyPatterns(params: {
  answers: Array<AnswerDoc & { day: number }>;
  bridges: BridgeDoc[];
}): Promise<PatternMapOutput> {
  const config = getServerConfig();
  const safeAnswers = params.answers.filter((a) => !a.excludedFromAI);
  logInfo("patterns.detectJourneyPatterns", {
    safeAnswerCount: safeAnswers.length,
    bridgeCount: params.bridges.length,
    promptVersion: PROMPT_VERSION,
  });

  const prompt = buildPatternDetectionPrompt({
    answers: safeAnswers,
    bridges: params.bridges,
  });

  const result = await generateStructuredInteraction(
    {
      caller: "patterns.detect.day5",
      tier: "deep",
      thinkingLevel: "medium",
      temperature: 0.25,
      timeoutMs: config.synthesisTimeoutMs,
      maxRetries: config.synthesisMaxRetries,
      fallbackModel: config.synthesisFallbackModel,
      fallbackThinkingLevel: "low",
      systemInstruction: PATTERN_MAP_SYSTEM_INSTRUCTION,
      prompt,
    },
    PatternDetectionResponseSchema,
  );

  const flags: PatternFlagDoc[] = result.data.flags.map((f, index) => ({
    id: `pf_${index + 1}_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
    patternKey: f.patternKey,
    category: f.category,
    firstBridgeHintDay: f.firstBridgeHintDay ?? null,
    evidence: f.evidence,
    confidence: f.confidence,
    model: result.raw.modelUsed,
  }));

  return {
    crisisType: result.data.crisisType,
    flags,
    model: result.raw.modelUsed,
    promptVersion: PROMPT_VERSION,
  };
}
