/**
 * Prompt definitions for Spiral's "I don't know" (IDK) Detection & Step-1 Redirect (`src/lib/journey/idk-prompt.ts`).
 *
 * Feature overview & use cases:
 * - Supports Part 2 ("I don't know" handling in Standard Mode):
 *   1. `IDK_DETECT_SYSTEM_INSTRUCTION` & `buildIdkDetectionPrompt`: called on the `fast` model
 *      ONLY when deterministic plain-code rules are unsure whether a brief or sarcastic answer
 *      is a genuine short answer vs a disguised IDK dodge.
 *   2. `IDK_SMALLER_REDIRECT_SYSTEM_INSTRUCTION` & `buildSmallerQuestionPrompt`: called on the
 *      `fast` model on Step 1 ONLY for questions that do not have a fixed custom redirect in
 *      `Design.md` Section 5 (`QIDs 7, 17, 18, 27, 28`), producing a smaller, more concrete
 *      one-sentence version of the same question with zero judgment and no new topic.
 * - Exports `PROMPT_VERSION` per `MODELS.md`.
 */

import { logInfo } from "@/lib/log";

export const PROMPT_VERSION = "idk-v1";

export const IDK_DETECT_SYSTEM_INSTRUCTION = `Classify whether a user's answer in Spiral is an "I don't know" / non-answer dodge versus a real short answer.
Return ONLY valid JSON:
{"isIdk": boolean, "type": "plain" | "disguised" | "real_short_answer"}

Definitions:
- "plain": direct "I don't know" or "do not know" (` + "`isIdk: true`" + `).
- "disguised": dodges or non-answers such as "idk lol", "no idea", "nothing really", shrug emojis, "if I knew I wouldn't be here", or single-word brush-offs (` + "`isIdk: true`" + `).
- "real_short_answer": a genuine answer that happens to be brief, blunt, or heavy (` + "`isIdk: false`" + `).

Critical rule:
- A short real answer is NOT an IDK. For example, "Nothing. Honestly nothing feels fun." is a real answer and an emotional signal -> {"isIdk": false, "type": "real_short_answer"}.
- Brief concrete answers ("My sister.", "Sunday mornings.", "Drained, mostly.") and sarcastic descriptions of real work ("Answering 47 Slack threads before lunch, apparently.") are real answers -> {"isIdk": false, "type": "real_short_answer"}.`;

export const IDK_SMALLER_REDIRECT_SYSTEM_INSTRUCTION = `Rewrite the given self-inquiry question into a smaller, more concrete version of the exact same question after the user said "I don't know".
Rules:
1. Exactly ONE short sentence ending with "?".
2. Open and neutral (start with What, When, Where, Which, or How — never a closed yes/no question).
3. Zero judgment, zero flattery, zero therapy jargon, and NO new topic.
4. Return ONLY valid JSON: {"redirect": "One concrete sentence ending with ?"}`;

/**
 * Builds the short prompt for ambiguous IDK classification on the fast model.
 */
export function buildIdkDetectionPrompt(
  questionText: string,
  answerText: string,
): string {
  logInfo("idkPrompt.buildIdkDetectionPrompt", {
    questionLength: questionText.length,
    answerLength: answerText.length,
  });
  return `Question: ${questionText}\nAnswer: ${answerText}`;
}

/**
 * Builds the short prompt asking the fast model for a smaller, more concrete one-sentence version
 * of `questionText` on Step 1 when no fixed `Design.md` redirect exists.
 */
export function buildSmallerQuestionPrompt(questionText: string): string {
  logInfo("idkPrompt.buildSmallerQuestionPrompt", {
    questionLength: questionText.length,
  });
  return `Original question: ${questionText}\nWrite one smaller, more concrete sentence asking the same question.`;
}
