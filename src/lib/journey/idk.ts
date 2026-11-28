/**
 * "I don't know" (IDK) Rules-First Detection & Standard Mode Escalation (`src/lib/journey/idk.ts`).
 *
 * Feature overview & use cases:
 * - Implements Part 2 ("I don't know" handling) & `Design.md` Section 5:
 *   1. Runs ONLY after the safety classifier has screened and passed the answer (`level !== "acute"`).
 *   2. Rules-first detection (`classifyIdkByRules`): catches plain ("I don't know") and obvious
 *      disguised IDKs ("idk", "idk lol", "no idea", "nothing", "nothing really", "dunno", 🤷,
 *      empty, single-word dodges) without spending a model call, while preserving genuine brief
 *      signals like "Nothing. Honestly nothing feels fun." Calls the `fast` model only when unsure.
 *   3. Per-question 3-step escalation (resets at the next question, never more than 3 asks):
 *      - **First IDK (`count = 1`)**: Uses the question's own redirect from `Design.md` Section 5
 *        (`QIDs 7, 17, 18, 27, 28`); for other questions, asks the `fast` model for a smaller,
 *        more concrete one-sentence version of the same question.
 *      - **Second IDK (`count = 2`)**:
 *        - `"standard"` mode (Career Fog): rotates through the 4 fixed avoidance-naming lines
 *          (never generated).
 *        - `"gentle"` mode placeholder (later spokes): uses fixed gentle reassurance instead of
 *          naming avoidance.
 *      - **Third IDK (`count = 3`)**: Replies `"Okay. We'll leave that one open."`, sets
 *        `idkFlagged = true`, and moves to the next question.
 */

import { z } from "zod";
import type { IdkMode, SafetyLevel } from "@/lib/db/schema";
import { generateStructuredInteraction } from "@/lib/gemini/client";
import {
  buildIdkDetectionPrompt,
  buildSmallerQuestionPrompt,
  IDK_DETECT_SYSTEM_INSTRUCTION,
  IDK_SMALLER_REDIRECT_SYSTEM_INSTRUCTION,
  PROMPT_VERSION,
} from "@/lib/journey/idk-prompt";
import { validateNonLeadingQuestion } from "@/lib/journey/leading-guard";
import type { QuestionDefinition } from "@/lib/journey/questions";
import { logError, logInfo, logWarn } from "@/lib/log";

export { PROMPT_VERSION };

export type IdkClassificationType =
  | "plain"
  | "disguised"
  | "real_short_answer";

export interface IdkDetectionOutput {
  isIdk: boolean;
  type: IdkClassificationType;
  source: "rules" | "model";
}

export const IdkDetectionSchema = z.object({
  isIdk: z.boolean(),
  type: z.enum(["plain", "disguised", "real_short_answer"]),
});

const SmallerRedirectSchema = z.object({
  redirect: z.string().min(8),
});

/**
 * Fixed Step-2 lines for Standard Mode (`Career Fog`): rotated deterministically, NEVER generated.
 */
export const STANDARD_STEP_2_FIXED_LINES = [
  "Sometimes 'I don't know' means 'I don't want to look.' What came up right before you typed that?",
  "No pressure to get it right. What would you say if nobody would ever read it?",
  "It's okay if the answer feels messy or small. What's the first thing your mind went to?",
  "I notice this one is hard to answer. What makes it hard?",
] as const;

/**
 * Fixed Step-2 reassurance line for Gentle Mode (placeholder for Amber/Red spokes), NEVER generated.
 */
export const GENTLE_STEP_2_REASSURANCE_LINE =
  "It's completely okay not to have words for this right now. Take a breath — if something small comes up, share it, or we can leave this one open.";

/**
 * Fixed Step-3 clean exit reply when leaving a question open (`idkFlagged = true`).
 */
export const IDK_THIRD_PASS_EXIT_MESSAGE = "Okay. We'll leave that one open.";

const PLAIN_IDK_PATTERNS: readonly RegExp[] = [
  /^(?:(?:really|honestly|genuinely)[,\s]+)?(?:i\s*)?(?:(?:really|honestly|genuinely)\s+)?(?:don'?t|do\s+not)\s+know[.!?]*$/i,
  /^don'?t\s+know[.!?]*$/i,
];

const DISGUISED_IDK_PATTERNS: readonly RegExp[] = [
  /^idk(?:\s+(?:lol|lmao|haha|tbh|man|yaar|bro|honestly|really))?[.!?🤷‍♂️🤷‍♀️\s]*$/i,
  /^(?:i\s+have\s+|honestly\s+)?no\s+(?:idea|clue)(?:\s+(?:at\s+all|lol|tbh|man|yaar|honestly))?[.!?]*$/i,
  /^(?:i'?m\s+)?not\s+(?:really\s+)?sure[.!?]*$/i,
  /^(?:nothing(?:\s+really|\s+much)?|none)[.!?]*$/i,
  /^(?:nothing|none)\s+comes\s+to\s+mind[.!?]*$/i,
  /^can'?t\s+think\s+of\s+(?:anything|one)[.!?]*$/i,
  /^(?:dunno|beats\s+me|blank|drawing\s+a\s+blank|unsure|whatever|meh|pass|skip|move\s+on|n\/a|na|nope|\?+|\.+)[.!?]*$/i,
  /^(?:🤷|🤷‍♂️|🤷‍♀️|¯\\_\(ツ\)_\/¯)+[.!?\s]*$/u,
  /^(?:pata\s+nahi(?:\s+yaar)?|kuch\s+nahi|theriyala(?:\s+pa|\s+bro)?|onnum\s+theriyala)[.!?]*$/i,
];

const DODGE_CUE_SUBSTRINGS =
  /\b(?:don'?t\s+know|do\s+not\s+know|idk|no\s+idea|no\s+clue|not\s+sure|dunno|blank|beats\s+me|pass|skip|pata\s+nahi|theriyala|wouldn'?t\s+be\s+(?:here|using|on\s+this)|ask\s+my)\b|🤷/i;

let standardStep2RotationCounter = 0;

export type IdkDecision =
  | {
      action: "accept";
      detection: IdkDetectionOutput;
      idkCount: number;
      idkFlagged: boolean;
      exitMessage: string | null;
    }
  | {
      action: "redirect";
      detection: IdkDetectionOutput;
      idkCount: 1 | 2;
      promptMessage: string;
      canExitNextPass: boolean;
    };

/**
 * Resets the Step-2 fixed-line rotation counter during deterministic unit tests.
 */
export function resetIdkRotationForTests(): void {
  standardStep2RotationCounter = 0;
}

/**
 * Returns the next rotated fixed Step-2 line for Standard Mode (`0..3`), never calling a model.
 */
export function getNextStandardStep2Line(explicitIndex?: number): string {
  if (typeof explicitIndex === "number" && explicitIndex >= 0) {
    return STANDARD_STEP_2_FIXED_LINES[
      explicitIndex % STANDARD_STEP_2_FIXED_LINES.length
    ];
  }
  const line =
    STANDARD_STEP_2_FIXED_LINES[
      standardStep2RotationCounter % STANDARD_STEP_2_FIXED_LINES.length
    ];
  standardStep2RotationCounter += 1;
  return line;
}

/**
 * Checks whether an answer text is deterministically a plain or disguised IDK without a model call.
 */
export function isDeterministicIdkPhrase(text: string): boolean {
  const ruleCheck = classifyIdkByRules(text);
  return ruleCheck.decided && ruleCheck.result.isIdk;
}

/**
 * Attempts to classify `text` using plain-code regex rules before considering any model call.
 * Returns `{ decided: false }` when phrasing is nuanced (e.g. "Nothing. Honestly nothing feels fun."
 * or sarcastic one-liners) so the fast model can judge accurately in question context.
 */
export function classifyIdkByRules(
  text: string,
): { decided: true; result: IdkDetectionOutput } | { decided: false } {
  logInfo("idk.classifyIdkByRules", { textLength: text.length });
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return {
      decided: true,
      result: { isIdk: true, type: "disguised", source: "rules" },
    };
  }

  if (PLAIN_IDK_PATTERNS.some((re) => re.test(trimmed))) {
    return {
      decided: true,
      result: { isIdk: true, type: "plain", source: "rules" },
    };
  }

  if (DISGUISED_IDK_PATTERNS.some((re) => re.test(trimmed))) {
    return {
      decided: true,
      result: { isIdk: true, type: "disguised", source: "rules" },
    };
  }

  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount >= 10 && !DODGE_CUE_SUBSTRINGS.test(trimmed)) {
    return {
      decided: true,
      result: { isIdk: false, type: "real_short_answer", source: "rules" },
    };
  }

  return { decided: false };
}

/**
 * Classifies an answer into `{ isIdk, type: "plain" | "disguised" | "real_short_answer" }`,
 * trying plain rules first and calling the `fast` Gemini model only when rules are unsure.
 */
export async function classifyIdkAnswer(
  question: QuestionDefinition,
  answerText: string,
  personId?: string,
): Promise<IdkDetectionOutput> {
  logInfo("idk.classifyIdkAnswer", {
    qid: question.qid,
    format: question.format,
    answerLength: answerText.length,
    promptVersion: PROMPT_VERSION,
  });

  if (
    question.format === "choice" ||
    question.format === "ranking" ||
    question.format === "priorities" ||
    question.layer === "Opener"
  ) {
    return { isIdk: false, type: "real_short_answer", source: "rules" };
  }

  const byRules = classifyIdkByRules(answerText);
  if (byRules.decided) {
    return byRules.result;
  }

  try {
    const modelRes = await generateStructuredInteraction(
      {
        caller: `idk.detect.qid_${question.qid}`,
        tier: "fast",
        thinkingLevel: "low",
        temperature: 0,
        systemInstruction: IDK_DETECT_SYSTEM_INSTRUCTION,
        prompt: buildIdkDetectionPrompt(question.text, answerText.trim()),
        personId,
        promptVersion: PROMPT_VERSION,
      },
      IdkDetectionSchema,
    );

    const normalizedType: IdkClassificationType = modelRes.data.isIdk
      ? modelRes.data.type === "plain"
        ? "plain"
        : "disguised"
      : "real_short_answer";

    return {
      isIdk: modelRes.data.isIdk,
      type: normalizedType,
      source: "model",
    };
  } catch (error: unknown) {
    logError("idk.classifyIdkAnswer.fallbackAccept", error, {
      qid: question.qid,
    });
    return {
      isIdk: false,
      type: "real_short_answer",
      source: "rules",
    };
  }
}

/**
 * Boolean convenience wrapper around `classifyIdkAnswer` for callers checking `isIdk`.
 */
export async function detectIdkAnswer(
  question: QuestionDefinition,
  answerText: string,
): Promise<boolean> {
  const classified = await classifyIdkAnswer(question, answerText);
  return classified.isIdk;
}

/**
 * Validates that a generated Step-1 smaller-question redirect is a single, non-leading sentence
 * ending with `?`.
 */
function isValidStep1Redirect(candidate: string): boolean {
  const clean = candidate.replace(/\r?\n+/g, " ").trim();
  if (clean.length < 10 || !clean.endsWith("?")) {
    return false;
  }
  // Ensure single sentence (at most one terminal punctuation mark at the very end)
  const sentenceCount = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
  if (sentenceCount > 1) {
    return false;
  }
  const leadCheck = validateNonLeadingQuestion(clean, {
    requireOpenQuestion: true,
  });
  return leadCheck.valid;
}

/**
 * Resolves the First-IDK (`count = 1`) redirect:
 * - Uses the exact fixed redirect from `Design.md` Section 5 when `question.idkRedirect` exists
 *   (`QIDs 7, 17, 18, 27, 28`) with ZERO model calls.
 * - Otherwise calls the `fast` model to write a smaller, more concrete one-sentence version
 *   of the same question, falling back to a neutral concrete prompt on failure.
 */
async function resolveFirstIdkRedirect(
  question: QuestionDefinition,
  personId?: string,
): Promise<string> {
  if (question.idkRedirect) {
    return question.idkRedirect;
  }

  const staticFallback =
    "What is one small, concrete moment from the past week that connects to this question?";

  try {
    const generated = await generateStructuredInteraction(
      {
        caller: `idk.smallerRedirect.qid_${question.qid}`,
        tier: "fast",
        thinkingLevel: "low",
        temperature: 0.3,
        systemInstruction: IDK_SMALLER_REDIRECT_SYSTEM_INSTRUCTION,
        prompt: buildSmallerQuestionPrompt(question.text),
        personId,
        promptVersion: PROMPT_VERSION,
      },
      SmallerRedirectSchema,
    );

    const clean = generated.data.redirect
      .replace(/\r?\n+/g, " ")
      .replace(/^["“”']+|["“”']+$/g, "")
      .trim();

    if (isValidStep1Redirect(clean)) {
      return clean;
    }

    logWarn(
      "idk.resolveFirstIdkRedirect.invalidDraft",
      "Generated Step-1 redirect failed single-sentence/non-leading check; using concrete fallback",
      { qid: question.qid },
    );
    return staticFallback;
  } catch (error: unknown) {
    logError("idk.resolveFirstIdkRedirect.fallback", error, {
      qid: question.qid,
    });
    return staticFallback;
  }
}

/**
 * Evaluates IDK escalation (`1 -> smaller question`, `2 -> fixed avoidance/reassurance line`,
 * `3 -> "Okay. We'll leave that one open." + idkFlagged=true`).
 * Throws if invoked on an unscreened `"acute"` safety answer (`CONSTRAINTS.md`).
 */
export async function evaluateIdkEscalation(params: {
  question: QuestionDefinition;
  answerText: string;
  priorIdkCount: number;
  idkMode: IdkMode;
  safetyLevel?: SafetyLevel;
  step2RotationIndex?: number;
  personId?: string;
}): Promise<IdkDecision> {
  const {
    question,
    answerText,
    priorIdkCount,
    idkMode,
    safetyLevel,
    step2RotationIndex,
    personId,
  } = params;

  if (safetyLevel === "acute") {
    throw new Error(
      "IDK escalation must never run on an answer flagged as acute safety risk.",
    );
  }

  logInfo("idk.evaluateIdkEscalation", {
    qid: question.qid,
    priorIdkCount,
    idkMode,
  });

  const detection = await classifyIdkAnswer(question, answerText, personId);

  if (!detection.isIdk) {
    return {
      action: "accept",
      detection,
      idkCount: priorIdkCount,
      idkFlagged: false,
      exitMessage: null,
    };
  }

  const nextCount = priorIdkCount + 1;

  if (nextCount === 1) {
    const promptMessage = await resolveFirstIdkRedirect(question, personId);
    return {
      action: "redirect",
      detection,
      idkCount: 1,
      promptMessage,
      canExitNextPass: false,
    };
  }

  if (nextCount === 2) {
    const promptMessage =
      idkMode === "gentle"
        ? GENTLE_STEP_2_REASSURANCE_LINE
        : getNextStandardStep2Line(step2RotationIndex);
    return {
      action: "redirect",
      detection,
      idkCount: 2,
      promptMessage,
      canExitNextPass: true,
    };
  }

  // Step 3 (never more than 3 asks): leave open, set idkFlagged=true, move to next question
  return {
    action: "accept",
    detection,
    idkCount: 3,
    idkFlagged: true,
    exitMessage: IDK_THIRD_PASS_EXIT_MESSAGE,
  };
}
