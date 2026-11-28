/**
 * End-of-day Bridge Question Generator, Rule Validator & Rubric Scorer (`src/lib/bridge/generate.ts`).
 *
 * Feature overview & use cases:
 * - Implements Part 3 & `Design.md` Section 6:
 *   1. Calls ONLY the `deep` model (`tier: "deep"`, no fast-model downgrade), capped strictly
 *      at 1 generation + at most 1 retry per day (`<= 2` deep-model calls total).
 *   2. Validates JSON output with Zod (`text`, `format`, `word_count`, `source_qid`) and runs
 *      post-generation code checks: single line, `< 40` words, ends with `?`, zero advice
 *      phrases (`"you should"`, `"try"`, `"make sure"`, etc.), zero leaked pattern names from
 *      `Design.md` Section 8, zero cruel/shaming phrases, and zero leading tags.
 *   3. Regenerates at most once if parsing or any check fails; if the retry also fails, falls
 *      back deterministically to `getFallbackBridge(day)` (`src/lib/bridge/fallbacks.ts`).
 *   4. Scores every Bridge `0 | 1` across the 6 rubric dimensions (`under40Words`, `noAdvice`,
 *      `specific`, `lingering`, `notCruel`, `culturallyCalibrated`) so scores save with the Bridge.
 */

import { z } from "zod";
import { getFallbackBridge } from "@/lib/bridge/fallbacks";
import {
  BRIDGE_SYSTEM_INSTRUCTION,
  buildBridgePrompt,
  PROMPT_VERSION,
} from "@/lib/bridge/prompt";
import { getServerConfig } from "@/lib/config";
import {
  type AnswerDoc,
  type BridgeDoc,
  type BridgeFormat,
  BridgeFormatSchema,
  type BridgeRubricScores,
  type CrisisType,
} from "@/lib/db/schema";
import { cleanJsonFence, generateInteraction } from "@/lib/gemini/client";
import { validateNonLeadingQuestion } from "@/lib/journey/leading-guard";
import { getDayMetadata } from "@/lib/journey/questions";
import { logError, logInfo, logWarn } from "@/lib/log";
import { findLeakedPatternLabels } from "@/lib/patterns/taxonomy";

export const BridgeModelOutputSchema = z.object({
  text: z.string().min(8),
  format: BridgeFormatSchema,
  word_count: z.number().int().nonnegative().optional(),
  source_qid: z.number().int().positive().nullable().optional(),
});

const ADVICE_PATTERNS: readonly RegExp[] = [
  /\byou\s+should\b/i,
  /\btry\b/i,
  /\bmake\s+sure\b/i,
  /\byou\s+need\s+to\b/i,
  /\byou\s+ought\s+to\b/i,
  /\byou\s+must\b/i,
  /\bi\s+(?:recommend|suggest|advise)\b/i,
  /\bconsider\s+(?:taking|doing|making|leaving|quitting|journaling|writing|talking)\b/i,
  /\bremember\s+to\b/i,
  /\bdon'?t\s+forget\s+to\b/i,
  /\btake\s+some\s+time\s+to\b/i,
];

const CRUEL_OR_SHAMING_PATTERNS: readonly RegExp[] = [
  /\bwhy\s+do\s+you\s+keep\s+lying\s+to\s+yourself\b/i,
  /\blying\s+to\s+yourself\b/i,
  /\bstop\s+making\s+excuses\b/i,
  /\bwhat'?s\s+wrong\s+with\s+you\b/i,
  /\bbeing\s+a\s+coward\b/i,
  /\bpathetic\b/i,
];

const GENERIC_BRIDGE_PATTERNS: readonly RegExp[] = [
  /^what\s+would\s+make\s+you\s+happy\??$/i,
  /^what\s+do\s+you\s+really\s+want(?:\s+in\s+life)?\??$/i,
  /^how\s+does\s+that\s+make\s+you\s+feel\??$/i,
  /^what\s+are\s+your\s+goals\??$/i,
];

const CULTURAL_MISFIRE_PATTERNS: readonly RegExp[] = [
  /\byour\s+(?:toxic|controlling|selfish)\s+(?:parents|family)\b/i,
  /\bstop\s+feeling\s+grateful\b/i,
  /\benmeshed\b/i,
  /\bcodependent\b/i,
];

const STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "always",
  "around",
  "because",
  "before",
  "being",
  "between",
  "could",
  "every",
  "everything",
  "first",
  "never",
  "other",
  "people",
  "really",
  "right",
  "something",
  "still",
  "their",
  "there",
  "these",
  "things",
  "think",
  "those",
  "today",
  "under",
  "where",
  "which",
  "while",
  "without",
  "would",
  "wrote",
]);

export interface BridgeValidationCheck {
  valid: boolean;
  wordCount: number;
  normalizedText: string;
  reasons: string[];
}

/**
 * Counts whitespace-delimited words in a string.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

/**
 * Validates a Bridge candidate against `< 40` words, single-line, `?` ending, no-advice,
 * no-pattern-labels (`Design.md` Section 8), not-cruel, non-generic, and non-leading rules.
 */
export function validateBridgeText(
  rawText: string,
  maxWords = 40,
): BridgeValidationCheck {
  logInfo("bridge.validateBridgeText", {
    rawLength: rawText.length,
    maxWords,
  });
  const reasons: string[] = [];
  const hasNewline = /\r|\n/.test(rawText.trim());
  const normalizedText = rawText
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (hasNewline) {
    reasons.push("Bridge must be a single line with no line breaks.");
  }

  const wordCount = countWords(normalizedText);
  if (wordCount === 0) {
    reasons.push("Bridge text is empty.");
  } else if (wordCount >= maxWords) {
    reasons.push(
      `Bridge has ${wordCount} words; must be strictly under ${maxWords} words.`,
    );
  }

  if (!normalizedText.endsWith("?")) {
    reasons.push("Bridge must end with a question mark ('?').");
  }

  for (const adviceRe of ADVICE_PATTERNS) {
    if (adviceRe.test(normalizedText)) {
      reasons.push(`Contains forbidden advice phrasing (${adviceRe.source}).`);
      break;
    }
  }

  for (const cruelRe of CRUEL_OR_SHAMING_PATTERNS) {
    if (cruelRe.test(normalizedText)) {
      reasons.push(`Contains cruel or shaming phrasing (${cruelRe.source}).`);
      break;
    }
  }

  for (const genericRe of GENERIC_BRIDGE_PATTERNS) {
    if (genericRe.test(normalizedText)) {
      reasons.push("Bridge is generic and fails specificity.");
      break;
    }
  }

  const leakedLabels = findLeakedPatternLabels(normalizedText);
  if (leakedLabels.length > 0) {
    reasons.push(
      `Contains forbidden clinical/pattern label(s): ${leakedLabels.join(", ")}.`,
    );
  }

  const nonLeadingCheck = validateNonLeadingQuestion(normalizedText, {
    requireOpenQuestion: false,
  });
  if (!nonLeadingCheck.valid) {
    for (const r of nonLeadingCheck.reasons) {
      if (!reasons.includes(r)) {
        reasons.push(r);
      }
    }
  }

  return {
    valid: reasons.length === 0,
    wordCount,
    normalizedText,
    reasons,
  };
}

/**
 * Scores a Bridge `0 | 1` on each of the 6 Part 3 rubric dimensions without extra API calls.
 */
export function scoreBridgeRubric(params: {
  text: string;
  answers: AnswerDoc[];
  isFallback?: boolean;
  maxWords?: number;
}): BridgeRubricScores {
  const { text, answers, isFallback = false, maxWords = 40 } = params;
  const hasNewline = /\r|\n/.test(text.trim());
  const normalized = text.replace(/\r?\n+/g, " ").replace(/\s+/g, " ").trim();
  const words = countWords(normalized);

  const under40Words: 0 | 1 =
    words > 0 && words < maxWords && !hasNewline ? 1 : 0;
  const noAdvice: 0 | 1 = ADVICE_PATTERNS.some((re) => re.test(normalized))
    ? 0
    : 1;
  const notCruel: 0 | 1 = CRUEL_OR_SHAMING_PATTERNS.some((re) =>
    re.test(normalized),
  )
    ? 0
    : 1;
  const culturallyCalibrated: 0 | 1 =
    findLeakedPatternLabels(normalized).length === 0 &&
    !CULTURAL_MISFIRE_PATTERNS.some((re) => re.test(normalized))
      ? 1
      : 0;
  const lingering: 0 | 1 =
    normalized.endsWith("?") &&
    words >= 10 &&
    !GENERIC_BRIDGE_PATTERNS.some((re) => re.test(normalized))
      ? 1
      : 0;

  let specific: 0 | 1 = 0;
  if (!isFallback && !GENERIC_BRIDGE_PATTERNS.some((re) => re.test(normalized))) {
    const answerTokens = new Set(
      answers
        .flatMap((a) =>
          `${a.questionText} ${a.text}`
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/),
        )
        .filter((tok) => tok.length >= 4 && !STOPWORDS.has(tok)),
    );
    const bridgeTokens = normalized
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((tok) => tok.length >= 4 && !STOPWORDS.has(tok));

    const hasLexicalAnchor = bridgeTokens.some((tok) => answerTokens.has(tok));
    const noticesAbsence =
      /\bwithout\s+(?:using|mentioning|naming)\b/i.test(normalized) ||
      /'[a-z]+'/i.test(normalized);
    specific = hasLexicalAnchor || noticesAbsence || answers.length === 0 ? 1 : 0;
  }

  return {
    under40Words,
    noAdvice,
    specific,
    lingering,
    notCruel,
    culturallyCalibrated,
  };
}

export interface GeneratedBridgeOutput {
  text: string;
  format: BridgeFormat;
  wordCount: number;
  sourceQid: number | null;
  isFallback: boolean;
  rubric: BridgeRubricScores;
  referencedNextSession: boolean | null;
  model: string;
  promptVersion: string;
}

/**
 * Parses raw model JSON and checks all Bridge constraints in one pass.
 */
function parseAndValidateCandidate(
  rawText: string,
  maxWords: number,
):
  | {
      ok: true;
      text: string;
      format: BridgeFormat;
      wordCount: number;
      sourceQid: number | null;
    }
  | { ok: false; reasons: string[]; candidatePreview: string } {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(cleanJsonFence(rawText));
  } catch (err: unknown) {
    return {
      ok: false,
      reasons: [
        err instanceof Error ? `Invalid JSON: ${err.message}` : "Invalid JSON",
      ],
      candidatePreview: rawText.slice(0, 120),
    };
  }

  const schemaRes = BridgeModelOutputSchema.safeParse(parsedJson);
  if (!schemaRes.success) {
    return {
      ok: false,
      reasons: schemaRes.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
      candidatePreview: rawText.slice(0, 120),
    };
  }

  const check = validateBridgeText(schemaRes.data.text, maxWords);
  if (!check.valid) {
    return {
      ok: false,
      reasons: check.reasons,
      candidatePreview: check.normalizedText,
    };
  }

  return {
    ok: true,
    text: check.normalizedText,
    format: schemaRes.data.format,
    wordCount: check.wordCount,
    sourceQid: schemaRes.data.source_qid ?? null,
  };
}

/**
 * Generates today's Bridge Question on the `deep` model ONLY (`<= 1` generation + `<= 1` retry).
 * Falls back cleanly to `getFallbackBridge(day)` if both attempts fail parsing or code checks.
 */
export async function generateDayBridge(params: {
  day: number;
  answers: AnswerDoc[];
  previousBridges?: Array<Pick<BridgeDoc, "day" | "text" | "format">>;
  crisisType?: CrisisType | null;
  personId?: string;
}): Promise<GeneratedBridgeOutput> {
  const {
    day,
    answers,
    previousBridges = [],
    crisisType = null,
    personId,
  } = params;
  const config = getServerConfig();

  // Safety invariant: double-filter so excludedFromAI answers can NEVER enter Bridge prompts
  const safeAnswers = answers.filter((a) => !a.excludedFromAI);
  if (safeAnswers.length === 0) {
    throw new Error(
      "Cannot generate a Bridge without at least one screened, non-excluded answer.",
    );
  }

  const dayMeta = getDayMetadata(day);
  const basePrompt = buildBridgePrompt({
    day,
    dayTitle: dayMeta.title,
    todaysAnswers: safeAnswers,
    previousBridges,
    crisisType,
  });

  logInfo("bridge.generateDayBridge.start", {
    day,
    safeAnswerCount: safeAnswers.length,
    previousBridgeCount: previousBridges.length,
    promptVersion: PROMPT_VERSION,
  });

  let firstFailureReasons: string[] = [];
  let firstPreview = "";

  // Attempt 1 (deep model only, 0 internal retries so total daily Bridge calls <= 2)
  try {
    const first = await generateInteraction({
      caller: `bridge.day_${day}.attempt_1`,
      tier: "deep",
      thinkingLevel: "medium",
      temperature: 0.6,
      maxRetries: 0,
      fallbackModel: null,
      responseMimeType: "application/json",
      systemInstruction: BRIDGE_SYSTEM_INSTRUCTION,
      prompt: basePrompt,
      personId,
      promptVersion: PROMPT_VERSION,
    });

    const check1 = parseAndValidateCandidate(first.text, config.bridgeMaxWords);
    if (check1.ok) {
      const rubric = scoreBridgeRubric({
        text: check1.text,
        answers: safeAnswers,
        isFallback: false,
        maxWords: config.bridgeMaxWords,
      });
      return {
        text: check1.text,
        format: check1.format,
        wordCount: check1.wordCount,
        sourceQid: check1.sourceQid,
        isFallback: false,
        rubric,
        referencedNextSession: null,
        model: first.modelUsed,
        promptVersion: PROMPT_VERSION,
      };
    }

    firstFailureReasons = check1.reasons;
    firstPreview = check1.candidatePreview;
  } catch (err1: unknown) {
    logWarn(
      "bridge.generateDayBridge.attempt1Failed",
      "First deep-model Bridge attempt errored; retrying once",
      {
        day,
        reason: err1 instanceof Error ? err1.message : String(err1),
      },
    );
    firstFailureReasons = [
      err1 instanceof Error ? err1.message : "Model call failed",
    ];
  }

  logWarn(
    "bridge.generateDayBridge.retryingOnce",
    "Bridge attempt 1 failed checks; regenerating once on deep model",
    {
      day,
      reasons: firstFailureReasons,
    },
  );

  const retryPrompt = `${basePrompt}

CORRECTION FOR RETRY: Your previous draft (${firstPreview ? `"${firstPreview}"` : "invalid output"}) failed checks: ${firstFailureReasons.join(" ")}
Return ONLY valid JSON {"text", "format", "word_count", "source_qid"} with ONE single line strictly under 35 words, ending with "?", zero advice, zero pattern labels, referencing only what this person wrote.`;

  // Attempt 2 (final retry on deep model)
  try {
    const second = await generateInteraction({
      caller: `bridge.day_${day}.attempt_2`,
      tier: "deep",
      thinkingLevel: "medium",
      temperature: 0.45,
      maxRetries: 0,
      fallbackModel: null,
      responseMimeType: "application/json",
      systemInstruction: BRIDGE_SYSTEM_INSTRUCTION,
      prompt: retryPrompt,
      personId,
      promptVersion: PROMPT_VERSION,
    });

    const check2 = parseAndValidateCandidate(
      second.text,
      config.bridgeMaxWords,
    );
    if (check2.ok) {
      const rubric = scoreBridgeRubric({
        text: check2.text,
        answers: safeAnswers,
        isFallback: false,
        maxWords: config.bridgeMaxWords,
      });
      return {
        text: check2.text,
        format: check2.format,
        wordCount: check2.wordCount,
        sourceQid: check2.sourceQid,
        isFallback: false,
        rubric,
        referencedNextSession: null,
        model: second.modelUsed,
        promptVersion: PROMPT_VERSION,
      };
    }

    logWarn(
      "bridge.generateDayBridge.usingFallbackAfterRetry",
      "Bridge retry failed validation; using day's fallback Bridge",
      {
        day,
        reasons: check2.reasons,
      },
    );
  } catch (err2: unknown) {
    logError("bridge.generateDayBridge.attempt2FailedUsingFallback", err2, {
      day,
    });
  }

  // Deterministic fallback Bridge after 1 generation + 1 retry
  const fallback = getFallbackBridge(day);
  const fallbackWords = countWords(fallback.text);
  const fallbackRubric = scoreBridgeRubric({
    text: fallback.text,
    answers: safeAnswers,
    isFallback: true,
    maxWords: config.bridgeMaxWords,
  });

  return {
    text: fallback.text,
    format: fallback.format,
    wordCount: fallbackWords,
    sourceQid: null,
    isFallback: true,
    rubric: fallbackRubric,
    referencedNextSession: null,
    model: "fallback-bridge",
    promptVersion: PROMPT_VERSION,
  };
}
