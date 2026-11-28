/**
 * Prompt definitions for Spiral's Safety Classifier (`src/lib/safety/prompt.ts`).
 *
 * Feature overview & use cases:
 * - Defines the concise, structured JSON classification prompt run on free-text answers
 *   whenever the deterministic keyword pre-filter (`src/lib/safety/keywords.ts`) does not
 *   immediately trigger `"acute"`.
 * - Reads one answer alongside the question asked, up to 2 previous answers for context,
 *   and the journey entry point, returning a risk level without ever generating user-facing copy.
 * - Calibrated for Indian English, Hinglish, Tanglish, understatement, sarcasm, and workplace
 *   metaphors so real crisis signals are never missed while figurative language is understood.
 * - Exports `PROMPT_VERSION` per `MODELS.md`.
 */

import { logInfo } from "@/lib/log";

export const PROMPT_VERSION = "safety-v1";

export interface SafetyContextAnswer {
  qid?: number;
  questionText?: string;
  text: string;
}

export interface BuildSafetyPromptParams {
  answerText: string;
  questionText: string;
  previousAnswers?: SafetyContextAnswer[];
  entryPoint?: string;
}

export const SAFETY_SYSTEM_INSTRUCTION = `You are the internal safety screening layer for Spiral, a guided self-inquiry tool.
Read one user answer in context and return ONLY a JSON risk classification. Never write user-facing advice or messages.

Risk level definitions:
- "none": ordinary reflection, including heavy feelings, frustration, sarcasm, and metaphors ("I want to disappear from these performances").
- "concern": hopelessness, exhaustion or meaninglessness, with no intent or plan.
- "acute": any mention of self-harm, suicide or wanting to die, harming someone else, or being in danger right now, including indirect phrasing.

Rules:
1. When torn between two levels, pick the higher one.
2. "I don't know" (and variants like "idk", "no idea", shrugs, blank dodges) is NEVER a safety signal -> always return "none" with high confidence.
3. Read Indian English, Hinglish, Tanglish, and understatement carefully (for example, distinguish "just tired of everything" or "sab bekaar lag raha hai" = "concern" from veiled "nobody would have to worry if I didn't wake up tomorrow" = "acute").
4. Return ONLY valid JSON:
{"level": "none" | "concern" | "acute", "confidence": 0.0-1.0, "reason": "one short internal line", "signals": ["short_signal_tag"]}`;

/**
 * Formats only the essential fields (`entryPoint`, `questionText`, last 2 context answers,
 * and `answerText`) into a compact safety screening prompt.
 */
export function buildSafetyPrompt(
  paramsOrQuestion: BuildSafetyPromptParams | string,
  legacyAnswerText?: string,
): string {
  const params: BuildSafetyPromptParams =
    typeof paramsOrQuestion === "string"
      ? {
          questionText: paramsOrQuestion,
          answerText: legacyAnswerText ?? "",
        }
      : paramsOrQuestion;

  const entryPoint = params.entryPoint ?? "career_fog";
  const recentContext = (params.previousAnswers ?? []).slice(-2);

  logInfo("safetyPrompt.buildSafetyPrompt", {
    entryPoint,
    contextCount: recentContext.length,
    answerLength: params.answerText.length,
  });

  const contextBlock =
    recentContext.length > 0
      ? `Recent context (${recentContext.length}):\n${recentContext
          .map(
            (c, idx) =>
              `[${c.qid ? `Q${c.qid}` : `Prev ${idx + 1}`}] ${c.text.slice(0, 280)}`,
          )
          .join("\n")}\n\n`
      : "";

  return `Entry: ${entryPoint}
${contextBlock}Question: ${params.questionText}
Answer: ${params.answerText}`;
}
