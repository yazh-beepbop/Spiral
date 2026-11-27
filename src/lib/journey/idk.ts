/**
 * "I don't know" (IDK) detection and Standard Mode escalation (`src/lib/journey/idk.ts`).
 *
 * Feature overview & use cases:
 * - Implements `Design.md` Section 5 & `CONSTRAINTS.md`:
 *   1. Detects `"I don't know"` and close avoidance variants via deterministic matching +
 *      the `fast` Gemini model (`thinkingLevel: "low"`).
 *   2. Escalates gently across three passes on the same question:
 *      - **First IDK (`count = 1`)**: Offers a smaller, neutral version of the question
 *        (using the question's custom redirect from `Design.md` when defined).
 *      - **Second IDK (`count = 2`)**: Names the hesitation kindly without projecting
 *        unexpressed motives, and enables a clean exit on the third pass.
 *      - **Third IDK (`count = 3`)**: Offers the explicit exit `"It's fine not to know. We can move on."`,
 *        accepts the answer, sets `idkFlagged = true`, and moves on. Accepted answers are never pushed for more.
 */

import { z } from "zod";
import type { IdkMode } from "@/lib/db/schema";
import { generateStructuredInteraction } from "@/lib/gemini/client";
import type { QuestionDefinition } from "@/lib/journey/questions";
import { logError, logInfo } from "@/lib/log";

export const PROMPT_VERSION = "idk-v1.1";

export const IDK_THIRD_PASS_EXIT_MESSAGE =
  "It's fine not to know. We can move on.";

const IdkModelSchema = z.object({
  isIdk: z.boolean(),
  variant: z.string(),
});

const OBVIOUS_IDK_PATTERNS: readonly RegExp[] = [
  /^(?:i\s*)?(?:really\s*|honestly\s*|genuinely\s*)?(?:don'?t|do\s+not)\s+know\.?!?$/i,
  /^idk\.?!?$/i,
  /^(?:i\s+have\s+)?no\s+(?:idea|clue)\.?!?$/i,
  /^(?:i'?m\s+)?not\s+(?:really\s+)?sure\.?!?$/i,
  /^(?:nothing|none)\s+comes\s+to\s+mind\.?!?$/i,
  /^can'?t\s+think\s+of\s+(?:anything|one)\.?!?$/i,
  /^(?:dunno|beats\s+me|blank|drawing\s+a\s+blank|unsure|pass|move\s+on)\.?!?$/i,
];

const IDK_SYSTEM_INSTRUCTION = `Determine whether the person's response is an "I don't know" / blank / "no idea" non-answer vs a substantive attempt to answer the question.
Return JSON: {"isIdk": boolean, "variant": "exact" | "close_variant" | "substantive_answer"}
Rules:
- Mark "isIdk": true ONLY if the answer essentially says they don't know, have no idea, are drawing a blank, or ask to pass without giving an actual reflection.
- Any real thought, even tentative or brief, is an accepted substantive answer ("isIdk": false) and must NEVER be pushed for more.`;

export type IdkDecision =
  | {
      action: "accept";
      idkCount: number;
      idkFlagged: boolean;
      exitMessage: string | null;
    }
  | {
      action: "redirect";
      idkCount: 1 | 2;
      promptMessage: string;
      canExitNextPass: boolean;
    };

/**
 * Checks whether an answer text is an obvious short `"I don't know"` variant.
 */
export function isDeterministicIdkPhrase(text: string): boolean {
  logInfo("idk.isDeterministicIdkPhrase", { textLength: text.length });
  const normalized = text.trim();
  if (!normalized) {
    return true;
  }
  return OBVIOUS_IDK_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Detects whether `answerText` is an `"I don't know"` response for `question`.
 * Choice, ranking, and overnight Opener (`QID 6`) answers are always accepted immediately.
 */
export async function detectIdkAnswer(
  question: QuestionDefinition,
  answerText: string,
): Promise<boolean> {
  logInfo("idk.detectIdkAnswer", {
    qid: question.qid,
    format: question.format,
    answerLength: answerText.length,
  });

  if (
    question.format === "choice" ||
    question.format === "ranking" ||
    question.format === "priorities" ||
    question.layer === "Opener"
  ) {
    return false;
  }

  const trimmed = answerText.trim();
  if (isDeterministicIdkPhrase(trimmed)) {
    return true;
  }

  if (trimmed.length > 60 && !/\b(?:don'?t know|idk|no idea)\b/i.test(trimmed)) {
    return false;
  }

  try {
    const result = await generateStructuredInteraction(
      {
        caller: `idk.detect.qid_${question.qid}`,
        tier: "fast",
        thinkingLevel: "low",
        temperature: 0,
        systemInstruction: IDK_SYSTEM_INSTRUCTION,
        prompt: `Question: ${question.text}\nAnswer: ${trimmed}`,
      },
      IdkModelSchema,
    );
    return result.data.isIdk;
  } catch (error: unknown) {
    logError("idk.detectIdkAnswer.fallback", error, { qid: question.qid });
    return false;
  }
}

/**
 * Builds the first-IDK ("smaller version of the question") redirect message, prioritizing
 * question-specific redirects from `Design.md` Section 5 while keeping framing open.
 */
function buildFirstIdkRedirect(question: QuestionDefinition): string {
  if (question.idkRedirect && question.qid !== 27) {
    return question.idkRedirect;
  }

  if (question.qid === 27) {
    return "Let's make it smaller. Forget the five-year horizon — if you had one quiet Saturday a week to explore one small hunch, what would you spend it on?";
  }

  return `Let's make that smaller. Instead of the whole picture, what is one small, ordinary moment from the past few weeks connected to "${question.text}"?`;
}

/**
 * Builds the second-IDK ("name the hesitation kindly") redirect message without embedding
 * unexpressed motives, and lets the person know they can move on cleanly if nothing comes up.
 */
function buildSecondIdkRedirect(question: QuestionDefinition): string {
  if (question.qid === 27 && question.idkRedirect) {
    return question.idkRedirect;
  }

  return "That's the second time 'I don't know' showed up here. Sometimes a pause sits right next to something hard to put into words — and sometimes the answer genuinely isn't ready yet. Take one unhurried look; if nothing comes up, we can move on cleanly.";
}

/**
 * Evaluates Standard Mode IDK escalation (`1 -> smaller question`, `2 -> kindly name pause`,
 * `3 -> "It's fine not to know. We can move on." + accept & flag`). Accepted answers are never pushed for more.
 */
export async function evaluateIdkEscalation(params: {
  question: QuestionDefinition;
  answerText: string;
  priorIdkCount: number;
  idkMode: IdkMode;
}): Promise<IdkDecision> {
  const { question, answerText, priorIdkCount, idkMode } = params;
  logInfo("idk.evaluateIdkEscalation", {
    qid: question.qid,
    priorIdkCount,
    idkMode,
  });

  const isIdk = await detectIdkAnswer(question, answerText);

  if (!isIdk) {
    return {
      action: "accept",
      idkCount: priorIdkCount,
      idkFlagged: false,
      exitMessage: null,
    };
  }

  const nextCount = priorIdkCount + 1;

  if (idkMode === "gentle") {
    if (nextCount === 1) {
      return {
        action: "redirect",
        idkCount: 1,
        promptMessage: buildFirstIdkRedirect(question),
        canExitNextPass: true,
      };
    }
    return {
      action: "accept",
      idkCount: nextCount,
      idkFlagged: true,
      exitMessage: IDK_THIRD_PASS_EXIT_MESSAGE,
    };
  }

  if (nextCount === 1) {
    return {
      action: "redirect",
      idkCount: 1,
      promptMessage: buildFirstIdkRedirect(question),
      canExitNextPass: false,
    };
  }

  if (nextCount === 2) {
    return {
      action: "redirect",
      idkCount: 2,
      promptMessage: buildSecondIdkRedirect(question),
      canExitNextPass: true,
    };
  }

  return {
    action: "accept",
    idkCount: nextCount,
    idkFlagged: true,
    exitMessage: IDK_THIRD_PASS_EXIT_MESSAGE,
  };
}
