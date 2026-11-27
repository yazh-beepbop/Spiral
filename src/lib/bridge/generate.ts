/**
 * End-of-day Bridge Question generator and rule validator (`src/lib/bridge/generate.ts`).
 *
 * Feature overview & use cases:
 * - Validates candidate Bridges against `CONSTRAINTS.md` and `Design.md` Section 6:
 *   single line, `< 40` words (`config.bridgeMaxWords`), ends with `?`, no advice phrases,
 *   and no leaked clinical pattern labels.
 * - Calls the `deep` model via `generateStructuredInteraction` and retries once with
 *   explicit corrective feedback if any rule check fails (`FLOW.md` & `BUGS.md`).
 */

import { z } from "zod";
import {
  buildBridgePrompt,
  BRIDGE_SYSTEM_INSTRUCTION,
  PROMPT_VERSION,
} from "@/lib/bridge/prompt";
import { getServerConfig } from "@/lib/config";
import {
  type AnswerDoc,
  type BridgeFormat,
  BridgeFormatSchema,
} from "@/lib/db/schema";
import { generateStructuredInteraction } from "@/lib/gemini/client";
import { validateNonLeadingQuestion } from "@/lib/journey/leading-guard";
import { getDayMetadata } from "@/lib/journey/questions";
import { logInfo, logWarn } from "@/lib/log";

export const BridgeCandidateSchema = z.object({
  text: z.string().min(8),
  format: BridgeFormatSchema,
});

const ADVICE_PATTERNS: readonly RegExp[] = [
  /\byou\s+should\b/i,
  /\btry\s+to\b/i,
  /\bmake\s+sure\b/i,
  /\byou\s+need\s+to\b/i,
  /\byou\s+ought\s+to\b/i,
  /\byou\s+must\b/i,
  /\bi\s+(?:recommend|suggest|advise)\b/i,
  /\bconsider\s+(?:taking|doing|making|leaving|quitting)\b/i,
  /\bremember\s+to\b/i,
  /\bdon'?t\s+forget\s+to\b/i,
];

const FORBIDDEN_CLINICAL_PATTERNS: readonly RegExp[] = [
  /\bpeople[- ]pleasing\b/i,
  /\btoxic\s+positivity\b/i,
  /\bcoping\s+mechanism\b/i,
  /\blimiting\s+belief\b/i,
  /\bburnout\b/i,
];

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
 * Validates a Bridge candidate against word-count (`< 40`), single-line, question-ending,
 * no-advice, and no-clinical-jargon rules. Used both at runtime and in `evals/run-evals.ts`.
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

  for (const clinicalRe of FORBIDDEN_CLINICAL_PATTERNS) {
    if (clinicalRe.test(normalizedText)) {
      reasons.push(
        `Contains forbidden clinical/taxonomy label (${clinicalRe.source}).`,
      );
      break;
    }
  }

  const nonLeadingCheck = validateNonLeadingQuestion(normalizedText, {
    requireOpenQuestion: false,
  });
  if (!nonLeadingCheck.valid) {
    reasons.push(...nonLeadingCheck.reasons);
  }

  return {
    valid: reasons.length === 0,
    wordCount,
    normalizedText,
    reasons,
  };
}

export interface GeneratedBridgeOutput {
  text: string;
  format: BridgeFormat;
  wordCount: number;
  model: string;
  promptVersion: string;
}

/**
 * Generates and validates today's Bridge Question from non-excluded answers, retrying once
 * if the model exceeds `< 40` words or includes advice phrasing (`FLOW.md`).
 */
export async function generateDayBridge(params: {
  day: number;
  answers: AnswerDoc[];
}): Promise<GeneratedBridgeOutput> {
  const { day, answers } = params;
  const config = getServerConfig();

  // Safety invariant: double-filter so excludedFromAI answers can NEVER enter Bridge prompts
  const safeAnswers = answers.filter((a) => !a.excludedFromAI);
  if (safeAnswers.length === 0) {
    throw new Error(
      "Cannot generate a Bridge without at least one screened, non-excluded answer.",
    );
  }

  const dayMeta = getDayMetadata(day);
  const basePrompt = buildBridgePrompt(day, dayMeta.title, safeAnswers);

  logInfo("bridge.generateDayBridge.start", {
    day,
    safeAnswerCount: safeAnswers.length,
    promptVersion: PROMPT_VERSION,
  });

  const first = await generateStructuredInteraction(
    {
      caller: `bridge.day_${day}.attempt_1`,
      tier: "deep",
      thinkingLevel: "medium",
      temperature: 0.65,
      systemInstruction: BRIDGE_SYSTEM_INSTRUCTION,
      prompt: basePrompt,
    },
    BridgeCandidateSchema,
  );

  const firstCheck = validateBridgeText(first.data.text, config.bridgeMaxWords);
  if (firstCheck.valid) {
    return {
      text: firstCheck.normalizedText,
      format: first.data.format,
      wordCount: firstCheck.wordCount,
      model: first.raw.modelUsed,
      promptVersion: PROMPT_VERSION,
    };
  }

  logWarn(
    "bridge.generateDayBridge.retryingRuleViolation",
    "Bridge candidate violated rules; regenerating once",
    {
      day,
      reasons: firstCheck.reasons,
      wordCount: firstCheck.wordCount,
    },
  );

  const retryPrompt = `${basePrompt}

CRITICAL CORRECTION: Your previous draft ("${firstCheck.normalizedText}") failed validation because: ${firstCheck.reasons.join(" ")}
Rewrite it as ONE single line under 32 words, zero advice, ending with "?". Return JSON only.`;

  const second = await generateStructuredInteraction(
    {
      caller: `bridge.day_${day}.attempt_2`,
      tier: "deep",
      thinkingLevel: "medium",
      temperature: 0.5,
      systemInstruction: BRIDGE_SYSTEM_INSTRUCTION,
      prompt: retryPrompt,
    },
    BridgeCandidateSchema,
  );

  const secondCheck = validateBridgeText(
    second.data.text,
    config.bridgeMaxWords,
  );
  if (!secondCheck.valid) {
    throw new Error(
      `Bridge failed validation after retry: ${secondCheck.reasons.join(" ")}`,
    );
  }

  return {
    text: secondCheck.normalizedText,
    format: second.data.format,
    wordCount: secondCheck.wordCount,
    model: second.raw.modelUsed,
    promptVersion: PROMPT_VERSION,
  };
}
