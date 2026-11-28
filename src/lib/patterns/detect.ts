/**
 * Day 5 Structured Pattern Detector (`src/lib/patterns/detect.ts`).
 *
 * Feature overview & use cases:
 * - Implements Part 4 Pattern Map detection on the `deep` model (`tier: "deep"`, capped at
 *   1 generation + at most 1 retry).
 * - Validates with `zod` that every detected pattern:
 *   1. Uses a valid `key` in `PATTERN_TAXONOMY`
 *   2. Includes at least 2 non-empty exact quotes (`evidence`) from at least 2 DIFFERENT days
 *      (resolving day numbers from `qid`, `day`, or `answerPath`, and respecting `firstBridgeHintDay`).
 * - Returns both `flags: PatternFlagDoc[]` for Firestore persistence (`patternFlags`) and the
 *   complete structured `PatternMapOutput` (`patterns`, `crisis_type`, `contradictions`,
 *   `unanswered_qids`, `already_knows`) consumed by Day 5 synthesis.
 */

import { randomUUID } from "crypto";
import { z } from "zod";
import { getServerConfig } from "@/lib/config";
import {
  type AlreadyKnows,
  AlreadyKnowsSchema,
  type AnswerDoc,
  type BridgeDoc,
  type CrisisType,
  CrisisTypeSchema,
  PatternCategorySchema,
  type PatternContradiction,
  PatternContradictionSchema,
  type PatternFlagDoc,
} from "@/lib/db/schema";
import { cleanJsonFence, generateInteraction } from "@/lib/gemini/client";
import { CAREER_FOG_QUESTIONS } from "@/lib/journey/questions";
import { logError, logInfo, logWarn } from "@/lib/log";
import {
  buildPatternDetectionPrompt,
  type OvernightReflectionInput,
  PATTERN_MAP_SYSTEM_INSTRUCTION,
  PROMPT_VERSION,
} from "@/lib/patterns/prompt";
import { VALID_PATTERN_KEYS } from "@/lib/patterns/taxonomy";

/**
 * Extracts the 1-based day number (`1..5`) from a Firestore answer path (`sessions/3/answers/q_12`).
 */
export function extractDayFromAnswerPath(answerPath: string): number | null {
  logInfo("patterns.extractDayFromAnswerPath", {
    pathLength: answerPath.length,
  });
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

const RawEvidenceItemSchema = z.object({
  qid: z.number().int().positive(),
  day: z.number().int().min(1).max(5).optional(),
  answerPath: z.string().optional(),
  quote: z.string().trim().min(2, "Quote must not be empty"),
});

const RawPatternItemSchema = z.object({
  key: z.string().refine((k) => VALID_PATTERN_KEYS.has(k), {
    message: "Pattern key must match an entry in Design.md Section 8 taxonomy",
  }),
  category: PatternCategorySchema,
  firstBridgeHintDay: z.number().int().min(1).max(5).nullable().optional(),
  evidence: z.array(RawEvidenceItemSchema).min(2),
  confidence: z.number().min(0).max(1),
});

export const PatternMapModelSchema = z.object({
  patterns: z.array(RawPatternItemSchema).min(3).max(5),
  crisis_type: CrisisTypeSchema.nullable(),
  contradictions: z.array(PatternContradictionSchema).default([]),
  unanswered_qids: z.array(z.number().int().positive()).default([]),
  already_knows: AlreadyKnowsSchema,
});

export interface DetectedPatternItem {
  key: string;
  category: z.infer<typeof PatternCategorySchema>;
  firstBridgeHintDay: number | null;
  evidence: Array<{
    qid: number;
    day: number;
    answerPath: string;
    quote: string;
  }>;
  confidence: number;
}

export interface PatternMapOutput {
  patterns: DetectedPatternItem[];
  flags: PatternFlagDoc[];
  crisisType: CrisisType | null;
  crisis_type: CrisisType | null;
  contradictions: PatternContradiction[];
  unanswered_qids: number[];
  already_knows: AlreadyKnows;
  model: string;
  promptVersion: string;
}

/**
 * Resolves the day (`1..5`) of an evidence item `{ qid, day?, answerPath?, quote }` against
 * the journey's actual answers and permanent question bank.
 */
function resolveEvidenceDay(
  ev: z.infer<typeof RawEvidenceItemSchema>,
  safeAnswers: Array<AnswerDoc & { day: number }>,
): number | null {
  if (typeof ev.day === "number" && ev.day >= 1 && ev.day <= 5) {
    return ev.day;
  }
  if (ev.answerPath) {
    const parsedDay = extractDayFromAnswerPath(ev.answerPath);
    if (parsedDay !== null) {
      return parsedDay;
    }
  }

  const normalizedQuote = ev.quote.toLowerCase().trim();
  const matchingAnswer = safeAnswers.find(
    (a) =>
      a.qid === ev.qid &&
      a.text.toLowerCase().includes(normalizedQuote.slice(0, 24)),
  );
  if (matchingAnswer) {
    return matchingAnswer.day;
  }

  const anySameQid = safeAnswers.find((a) => a.qid === ev.qid);
  if (anySameQid) {
    return anySameQid.day;
  }

  const questionDef = CAREER_FOG_QUESTIONS[ev.qid];
  if (questionDef && typeof questionDef.day === "number") {
    return questionDef.day;
  }
  return null;
}

/**
 * Parses and validates raw JSON pattern map output against `PatternMapModelSchema` AND enforces
 * multi-day distinct quote evidence for every pattern.
 */
function parseAndValidatePatternMap(
  rawText: string,
  safeAnswers: Array<AnswerDoc & { day: number }>,
):
  | {
      ok: true;
      parsed: z.infer<typeof PatternMapModelSchema>;
      resolvedPatterns: DetectedPatternItem[];
    }
  | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = JSON.parse(cleanJsonFence(rawText));
  } catch (err: unknown) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Invalid JSON syntax",
    };
  }

  const validated = PatternMapModelSchema.safeParse(json);
  if (!validated.success) {
    return {
      ok: false,
      reason: validated.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    };
  }

  const resolvedPatterns: DetectedPatternItem[] = [];

  for (const pat of validated.data.patterns) {
    const firstHint = pat.firstBridgeHintDay ?? null;
    const preBridgeDays = new Set<number>();
    const allDays = new Set<number>();
    const enrichedEvidence: DetectedPatternItem["evidence"] = [];

    for (const ev of pat.evidence) {
      const day = resolveEvidenceDay(ev, safeAnswers);
      if (day === null) {
        return {
          ok: false,
          reason: `Pattern "${pat.key}" cited QID ${ev.qid} whose day could not be resolved.`,
        };
      }
      allDays.add(day);
      if (firstHint === null || day <= firstHint) {
        preBridgeDays.add(day);
      }
      enrichedEvidence.push({
        qid: ev.qid,
        day,
        answerPath: ev.answerPath ?? `sessions/${day}/answers/q_${ev.qid}`,
        quote: ev.quote.trim(),
      });
    }

    if (allDays.size < 2) {
      return {
        ok: false,
        reason: `Pattern "${pat.key}" must cite at least 2 quotes from different days (got days: ${Array.from(allDays).join(", ")}).`,
      };
    }

    if (preBridgeDays.size < 2) {
      return {
        ok: false,
        reason: `Pattern "${pat.key}" must cite at least 2 distinct-day quotes written BEFORE firstBridgeHintDay (${String(firstHint)}).`,
      };
    }

    resolvedPatterns.push({
      key: pat.key,
      category: pat.category,
      firstBridgeHintDay: firstHint,
      evidence: enrichedEvidence,
      confidence: pat.confidence,
    });
  }

  return {
    ok: true,
    parsed: validated.data,
    resolvedPatterns,
  };
}

/**
 * Detects 3–5 multi-day quote-backed patterns, `crisis_type`, `contradictions`,
 * `unanswered_qids`, and `already_knows` using the `deep` model (1 generation + at most 1 retry).
 */
export async function detectJourneyPatterns(params: {
  answers: Array<AnswerDoc & { day: number }>;
  bridges: BridgeDoc[];
  overnightReflections?: OvernightReflectionInput[];
  personId?: string;
}): Promise<PatternMapOutput> {
  const config = getServerConfig();
  const safeAnswers = params.answers.filter((a) => !a.excludedFromAI);
  const deterministicFlaggedQids = Array.from(
    new Set(safeAnswers.filter((a) => a.idkFlagged).map((a) => a.qid)),
  ).sort((a, b) => a - b);

  logInfo("patterns.detectJourneyPatterns", {
    safeAnswerCount: safeAnswers.length,
    bridgeCount: params.bridges.length,
    flaggedQidCount: deterministicFlaggedQids.length,
    promptVersion: PROMPT_VERSION,
  });

  const basePrompt = buildPatternDetectionPrompt({
    answers: safeAnswers,
    bridges: params.bridges,
    overnightReflections: params.overnightReflections,
    idkFlaggedQids: deterministicFlaggedQids,
  });

  const first = await generateInteraction({
    caller: "patterns.detect.day5.attempt_1",
    tier: "deep",
    thinkingLevel: "medium",
    temperature: 0.2,
    timeoutMs: config.synthesisTimeoutMs,
    maxRetries: 0,
    fallbackModel: null,
    responseMimeType: "application/json",
    systemInstruction: PATTERN_MAP_SYSTEM_INSTRUCTION,
    prompt: basePrompt,
    personId: params.personId,
    promptVersion: PROMPT_VERSION,
  });

  let check = parseAndValidatePatternMap(first.text, safeAnswers);
  let modelUsed = first.modelUsed;

  if (!check.ok) {
    logWarn(
      "patterns.detectJourneyPatterns.retryingOnce",
      "Pattern map failed Zod/multi-day quote check; retrying once on deep model",
      { reason: check.reason },
    );

    const retry = await generateInteraction({
      caller: "patterns.detect.day5.attempt_2",
      tier: "deep",
      thinkingLevel: "medium",
      temperature: 0.15,
      timeoutMs: config.synthesisTimeoutMs,
      maxRetries: 0,
      fallbackModel: null,
      responseMimeType: "application/json",
      systemInstruction: PATTERN_MAP_SYSTEM_INSTRUCTION,
      prompt: `${basePrompt}\n\nIMPORTANT CORRECTION: Your previous JSON failed validation (${check.reason}). Ensure 3 to 5 valid taxonomy keys, each with at least 2 exact quotes from 2 DIFFERENT days. Return valid JSON only.`,
      personId: params.personId,
      promptVersion: PROMPT_VERSION,
    });

    check = parseAndValidatePatternMap(retry.text, safeAnswers);
    modelUsed = retry.modelUsed;

    if (!check.ok) {
      const err = new Error(
        `Pattern map failed validation after retry: ${check.reason}`,
      );
      logError("patterns.detectJourneyPatterns.failed", err);
      throw err;
    }
  }

  const mergedUnanswered = Array.from(
    new Set([...deterministicFlaggedQids, ...check.parsed.unanswered_qids]),
  ).sort((a, b) => a - b);

  const flags: PatternFlagDoc[] = check.resolvedPatterns.map((p, idx) => ({
    id: `pf_${idx + 1}_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
    patternKey: p.key,
    category: p.category,
    firstBridgeHintDay: p.firstBridgeHintDay,
    evidence: p.evidence.map((ev) => ({
      qid: ev.qid,
      day: ev.day,
      answerPath: ev.answerPath,
      quote: ev.quote,
    })),
    confidence: p.confidence,
    model: modelUsed,
  }));

  return {
    patterns: check.resolvedPatterns,
    flags,
    crisisType: check.parsed.crisis_type,
    crisis_type: check.parsed.crisis_type,
    contradictions: check.parsed.contradictions,
    unanswered_qids: mergedUnanswered,
    already_knows: check.parsed.already_knows,
    model: modelUsed,
    promptVersion: PROMPT_VERSION,
  };
}
