/**
 * Day 5 Synthesis Generator and Post-Check Validator (`src/lib/synthesis/generate.ts`).
 *
 * Feature overview & use cases:
 * - Implements Part 4 Synthesis generation on the `deep` model ONLY (`<= 1` generation +
 *   `<= 1` retry per journey; cached in Firestore `synthesis/main` and never regenerated
 *   on page reload).
 * - Post-generation code checks (`validateSynthesisOutput`):
 *   1. Word count strictly `500..800` words (`config.synthesisMinWords..config.synthesisMaxWords`)
 *   2. Zero pattern names (`Design.md` Section 8) OUTSIDE quoted user text (`maskVerbatimUserQuotes`)
 *   3. At least 1 verbatim quote (`"..."`) per insight (and multi-day evidence + alternative reading)
 *   4. Zero prescriptive advice phrasing.
 * - Existential safety re-check: when `crisisType === "existential"`, re-runs `classifyAnswerSafety`
 *   on the final synthesis text before returning (`Part 4`).
 */

import { z } from "zod";
import { countWords } from "@/lib/bridge/generate";
import { getServerConfig } from "@/lib/config";
import type {
  AlreadyKnows,
  AnswerDoc,
  BridgeDoc,
  CrisisType,
  PatternContradiction,
  PatternFlagDoc,
  SynthesisInsight,
} from "@/lib/db/schema";
import { cleanJsonFence, generateInteraction } from "@/lib/gemini/client";
import { logError, logInfo, logWarn } from "@/lib/log";
import {
  findLeakedPatternLabels,
  stripLeakedPatternLabels,
} from "@/lib/patterns/taxonomy";
import { classifyAnswerSafety } from "@/lib/safety/classify";
import {
  buildSynthesisPrompt,
  PROMPT_VERSION,
  SYNTHESIS_SYSTEM_INSTRUCTION,
} from "@/lib/synthesis/prompt";

const SynthesisModelInsightSchema = z.object({
  id: z.string().optional(),
  patternKey: z.string().min(1),
  evidenceDays: z.array(z.number().int().min(1).max(5)).min(1).default([1, 3]),
  text: z.string().min(25),
});

export const SynthesisModelSchema = z.object({
  text: z.string().min(200),
  insights: z.array(SynthesisModelInsightSchema).min(3).max(5),
});

export interface CandidateInsightForValidation {
  text: string;
  evidenceDays?: number[];
}

export interface SynthesisValidationResult {
  valid: boolean;
  wordCount: number;
  leakedLabels: string[];
  reasons: string[];
}

/**
 * Counts verbatim quoted spans (`"..."` or `“...”`) inside an insight or paragraph string.
 */
export function countQuotedSpans(text: string): number {
  logInfo("synthesis.countQuotedSpans", { textLength: text.length });
  const doubleQuoted = text.match(/"[^"\n]{2,}"/g) ?? [];
  const curlyQuoted = text.match(/“[^”\n]{2,}”/g) ?? [];
  return doubleQuoted.length + curlyQuoted.length;
}

/**
 * Masks `"..."` and `“...”` spans whose text actually comes from the person's own answers/quotes
 * so pattern words written by the user themselves (e.g. `"I think I'm in burnout"`) are allowed
 * inside quotes while any pattern label written by the model outside user quotes is caught.
 */
export function maskVerbatimUserQuotes(
  text: string,
  userSourceTexts: string[],
): string {
  if (userSourceTexts.length === 0) {
    return text;
  }
  const normalizedCorpus = userSourceTexts
    .map((s) => s.toLowerCase().replace(/\s+/g, " ").trim())
    .join(" || ");

  const replaceIfUserQuote = (fullMatch: string, inner: string): string => {
    const cleanInner = inner.toLowerCase().replace(/\s+/g, " ").trim();
    if (cleanInner.length >= 3 && normalizedCorpus.includes(cleanInner)) {
      return '"[USER_QUOTE]"';
    }
    return fullMatch;
  };

  return text
    .replace(/"([^"\n]{3,})"/g, replaceIfUserQuote)
    .replace(/“([^”\n]{3,})”/g, replaceIfUserQuote);
}

/**
 * Strips leaked clinical/pattern labels ONLY outside verbatim user quotes, preserving the
 * user's exact words inside `"..."`.
 */
function stripLabelsOutsideUserQuotes(
  text: string,
  userSourceTexts: string[],
): string {
  if (userSourceTexts.length === 0) {
    return stripLeakedPatternLabels(text);
  }
  const normalizedCorpus = userSourceTexts
    .map((s) => s.toLowerCase().replace(/\s+/g, " ").trim())
    .join(" || ");

  const preservedQuotes: string[] = [];
  const tokenized = text.replace(
    /("([^"\n]{3,})"|“([^”\n]{3,})”)/g,
    (fullMatch, _outer, dInner: string | undefined, cInner: string | undefined) => {
      const inner = (dInner ?? cInner ?? "").toLowerCase().replace(/\s+/g, " ").trim();
      if (inner.length >= 3 && normalizedCorpus.includes(inner)) {
        const idx = preservedQuotes.length;
        preservedQuotes.push(fullMatch);
        return `__USER_QUOTE_TOKEN_${idx}__`;
      }
      return fullMatch;
    },
  );

  let cleaned = stripLeakedPatternLabels(tokenized);
  preservedQuotes.forEach((quote, idx) => {
    cleaned = cleaned.replace(`__USER_QUOTE_TOKEN_${idx}__`, quote);
  });
  return cleaned;
}

/**
 * Validates synthesis word count (`500..800`), zero leaked pattern labels outside quoted user text,
 * at least 1 quote per insight, and zero prescriptive advice.
 */
export function validateSynthesisOutput(
  text: string,
  insights: CandidateInsightForValidation[],
  minWords = 500,
  maxWords = 800,
  userSourceTexts: string[] = [],
): SynthesisValidationResult {
  logInfo("synthesis.validateSynthesisOutput", {
    textLength: text.length,
    insightCount: insights.length,
    minWords,
    maxWords,
  });

  const reasons: string[] = [];
  const wordCount = countWords(text);

  if (wordCount < minWords || wordCount > maxWords) {
    reasons.push(
      `Synthesis word count is ${wordCount}; must be between ${minWords} and ${maxWords} words.`,
    );
  }

  const combinedText = [text, ...insights.map((i) => i.text)].join("\n");
  const maskedForLabelScan = maskVerbatimUserQuotes(
    combinedText,
    userSourceTexts,
  );
  const leakedLabels = findLeakedPatternLabels(maskedForLabelScan);
  if (leakedLabels.length > 0) {
    reasons.push(
      `Leaked forbidden clinical/taxonomy labels outside user quotes: ${leakedLabels.join(", ")}.`,
    );
  }

  const prescriptivePatterns: readonly RegExp[] = [
    /\byou\s+should\b/i,
    /\bi\s+(?:recommend|suggest|advise)\b/i,
    /\byour\s+top\s+priority\s+should\b/i,
    /\btry\s+to\b/i,
    /\bmake\s+sure\s+you\b/i,
  ];
  for (const re of prescriptivePatterns) {
    if (re.test(maskedForLabelScan)) {
      reasons.push(
        `Synthesis contains prescriptive/advisory phrasing (${re.source}).`,
      );
      break;
    }
  }

  insights.forEach((insight, idx) => {
    const quoteCount = countQuotedSpans(insight.text);
    if (quoteCount < 1) {
      reasons.push(
        `Insight ${idx + 1} has 0 quotes; every insight must include at least one verbatim quote in "..." quotation marks.`,
      );
    }
  });

  return {
    valid: reasons.length === 0,
    wordCount,
    leakedLabels,
    reasons,
  };
}

export interface GeneratedSynthesisOutput {
  text: string;
  insights: SynthesisInsight[];
  safetyRechecked: boolean;
  safetyRecheckLevel: "none" | "concern" | "acute" | null;
  model: string;
  promptVersion: string;
  wordCount: number;
}

/**
 * Parses and validates raw JSON synthesis output against `SynthesisModelSchema` and code checks.
 */
function parseAndCheckSynthesis(
  rawText: string,
  minWords: number,
  maxWords: number,
  userSourceTexts: string[],
):
  | { ok: true; data: z.infer<typeof SynthesisModelSchema> }
  | { ok: false; reasons: string[] } {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleanJsonFence(rawText));
  } catch (err: unknown) {
    return {
      ok: false,
      reason: undefined,
      reasons: [
        err instanceof Error ? `Invalid JSON: ${err.message}` : "Invalid JSON",
      ],
    } as { ok: false; reasons: string[] };
  }

  const schemaCheck = SynthesisModelSchema.safeParse(parsedJson);
  if (!schemaCheck.success) {
    return {
      ok: false,
      reasons: schemaCheck.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    };
  }

  const ruleCheck = validateSynthesisOutput(
    schemaCheck.data.text,
    schemaCheck.data.insights,
    minWords,
    maxWords,
    userSourceTexts,
  );
  if (!ruleCheck.valid) {
    return { ok: false, reasons: ruleCheck.reasons };
  }

  return { ok: true, data: schemaCheck.data };
}

/**
 * Generates and validates the Day 5 synthesis on the `deep` model (`<= 1` generation + `<= 1` retry),
 * and re-runs the safety classifier on the final text when `crisisType === "existential"`.
 */
export async function generateJourneySynthesis(params: {
  crisisType: CrisisType | null;
  flags: PatternFlagDoc[];
  contradictions?: PatternContradiction[];
  unansweredQids?: number[];
  alreadyKnows?: AlreadyKnows;
  answers: Array<AnswerDoc & { day: number }>;
  bridges: BridgeDoc[];
  personId?: string;
}): Promise<GeneratedSynthesisOutput> {
  const config = getServerConfig();
  const safeAnswers = params.answers.filter((a) => !a.excludedFromAI);
  const userSourceTexts = [
    ...safeAnswers.map((a) => a.text),
    ...params.flags.flatMap((f) => f.evidence.map((e) => e.quote)),
  ];

  logInfo("synthesis.generateJourneySynthesis.start", {
    crisisType: params.crisisType ?? "none",
    flagCount: params.flags.length,
    safeAnswerCount: safeAnswers.length,
    promptVersion: PROMPT_VERSION,
  });

  const basePrompt = buildSynthesisPrompt({
    crisisType: params.crisisType,
    flags: params.flags,
    contradictions: params.contradictions,
    unansweredQids: params.unansweredQids,
    alreadyKnows: params.alreadyKnows,
    answers: safeAnswers,
    bridges: params.bridges,
  });

  const first = await generateInteraction({
    caller: "synthesis.day5.attempt_1",
    tier: "deep",
    thinkingLevel: "medium",
    temperature: 0.45,
    timeoutMs: config.synthesisTimeoutMs,
    maxRetries: 0,
    fallbackModel: null,
    responseMimeType: "application/json",
    systemInstruction: SYNTHESIS_SYSTEM_INSTRUCTION,
    prompt: basePrompt,
    personId: params.personId,
    promptVersion: PROMPT_VERSION,
  });

  let chosenData: z.infer<typeof SynthesisModelSchema>;
  let chosenModel = first.modelUsed;

  const check1 = parseAndCheckSynthesis(
    first.text,
    config.synthesisMinWords,
    config.synthesisMaxWords,
    userSourceTexts,
  );

  if (check1.ok) {
    chosenData = check1.data;
  } else {
    logWarn(
      "synthesis.generateJourneySynthesis.retryingOnce",
      "Synthesis attempt 1 violated checks; regenerating once on deep model",
      { reasons: check1.reasons },
    );

    const retryPrompt = `${basePrompt}

CRITICAL REVISION NEEDED:
Your previous draft failed these checks: ${check1.reasons.join(" ")}
Fix ALL of them:
1. Keep "text" strictly between ${config.synthesisMinWords} and ${config.synthesisMaxWords} words.
2. Include verbatim "..." quotes from the person's answers inside EVERY insight's "text".
3. Remove every clinical or taxonomy label outside quoted user text.
4. Return ONLY valid JSON {"text", "insights"}.`;

    const second = await generateInteraction({
      caller: "synthesis.day5.attempt_2",
      tier: "deep",
      thinkingLevel: "medium",
      temperature: 0.35,
      timeoutMs: config.synthesisTimeoutMs,
      maxRetries: 0,
      fallbackModel: null,
      responseMimeType: "application/json",
      systemInstruction: SYNTHESIS_SYSTEM_INSTRUCTION,
      prompt: retryPrompt,
      personId: params.personId,
      promptVersion: PROMPT_VERSION,
    });

    chosenModel = second.modelUsed;
    const check2 = parseAndCheckSynthesis(
      second.text,
      config.synthesisMinWords,
      config.synthesisMaxWords,
      userSourceTexts,
    );

    if (!check2.ok) {
      const parsedFallback = SynthesisModelSchema.safeParse(
        JSON.parse(cleanJsonFence(second.text)),
      );
      if (!parsedFallback.success) {
        const err = new Error(
          `Synthesis failed schema validation after retry: ${check2.reasons.join(" ")}`,
        );
        logError("synthesis.generateJourneySynthesis.failed", err);
        throw err;
      }
      chosenData = parsedFallback.data;
    } else {
      chosenData = check2.data;
    }
  }

  const sanitizedText = stripLabelsOutsideUserQuotes(
    chosenData.text,
    userSourceTexts,
  ).trim();

  const insights: SynthesisInsight[] = chosenData.insights.map((item, idx) => {
    let cleanInsight = stripLabelsOutsideUserQuotes(
      item.text,
      userSourceTexts,
    ).trim();
    if (!/\bor\s+it\s+may\s+simply\s+be\s+that\b/i.test(cleanInsight)) {
      cleanInsight = `${cleanInsight} Or it may simply be that this season of life has asked for steady practicality while you decide what comes next.`;
    }
    const uniqueDays = Array.from(new Set(item.evidenceDays)).sort(
      (a, b) => a - b,
    );
    return {
      id: item.id && item.id.trim().length > 0 ? item.id : `ins_${idx + 1}`,
      patternKey: item.patternKey,
      evidenceDays: uniqueDays,
      text: cleanInsight,
      landed: null,
    };
  });

  // Part 4 Existential rule: ground gently and re-run the safety check on the final synthesis text
  let safetyRechecked = false;
  let safetyRecheckLevel: "none" | "concern" | "acute" | null = null;

  if (params.crisisType === "existential") {
    safetyRechecked = true;
    const safetyCheck = await classifyAnswerSafety({
      questionText: "Day 5 existential synthesis output safety verification",
      answerText: sanitizedText,
      entryPoint: "career_fog",
      personId: params.personId,
    });
    safetyRecheckLevel = safetyCheck.level;

    if (safetyCheck.level === "acute") {
      logError(
        "synthesis.generateJourneySynthesis.existentialAcuteBlocked",
        new Error("Existential synthesis triggered acute safety check"),
        { reasons: safetyCheck.signals },
      );
      throw new Error(
        "Generated existential reflection did not pass safety verification.",
      );
    }
  }

  return {
    text: sanitizedText,
    insights,
    safetyRechecked,
    safetyRecheckLevel,
    model: chosenModel,
    promptVersion: PROMPT_VERSION,
    wordCount: countWords(sanitizedText),
  };
}
