/**
 * Prompt definitions for Spiral's signature Bridge Question (`src/lib/bridge/prompt.ts`).
 *
 * Feature overview & use cases:
 * - Crafts the concise end-of-day prompt sent to the `deep` model using ONLY today's
 *   safety-screened answers (`excludedFromAI === false`), day number/theme, previous Bridges
 *   (to prevent repetition), and `crisisType` when detected.
 * - Includes all 6 benchmark Bridges from `Design.md` Section 6 labelled by format, plus
 *   3 explicit negative examples (generic, advice, cruel) with failure reasons.
 * - Exports `PROMPT_VERSION` per `MODELS.md`.
 */

import type { AnswerDoc, BridgeDoc, CrisisType } from "@/lib/db/schema";
import { logInfo } from "@/lib/log";

export const PROMPT_VERSION = "bridge-v1";

export interface BuildBridgePromptParams {
  day: number;
  dayTitle: string;
  todaysAnswers: AnswerDoc[];
  previousBridges?: Array<Pick<BridgeDoc, "day" | "text" | "format">>;
  crisisType?: CrisisType | null;
}

export const BRIDGE_SYSTEM_INSTRUCTION = `You write the end-of-day Bridge Question for Spiral, a calm, unbiased self-inquiry clarity guide.
The Bridge Question is ONE line left with the person before a 10-hour gap.

Hard rules (violating any fails validation):
1. ONE single line, strictly UNDER 40 words, ending with "?".
2. NO advice, NO instructions: never use "you should", "try", "try to", "make sure", "consider", "remember to", or commands.
3. NO clinical words, diagnoses, or internal pattern names ("burnout", "people-pleasing", "toxic positivity", "limiting belief", "coping mechanism", "over-intellectualizing", "self-minimization").
4. Screenshot-safe: never expose private names, employer names, or raw identifying details.
5. No leading tags ("isn't it true", "don't you think", "wouldn't you say", "deep down").

Quality rules:
- Reference something ONLY this person said today; echo their own words where natural.
- Notice what is missing as well as what is present (for example, never using the word "enjoy").
- Warm, plain-spoken, never cruel or shaming. Culturally calibrated (honor family care without mocking gratitude).
- Never repeat themes or phrasing from previous Bridges.

Good examples (labelled by format):
1. [pattern_observation] "You described your entire life without using the word 'enjoy' once. Was that deliberate, or did you just notice?"
2. [pattern_observation] "The things that make you feel most alive are the things you've stopped making time for. What replaced them, and why did you let it?"
3. [pattern_observation] "You listed five worlds where you performed. Then whispered the one where you were real. Why does the real one get the smallest voice?"
4. [reframe_question] "You want to disappear from the performances. But you still want to be seen. Just not like this. What would 'being seen right' actually look like?"
5. [reframe_question] "What if the answer was never a career? What if it was a life, and the work just had to fit inside it?"
6. [belief_challenge] "I notice you described rest as something you earn, not something you deserve. Where did that belief start?"

Bad examples (DO NOT write like these):
- Generic: "What would make you happy?" -> Fails: generic; could apply to anyone and references nothing specific this person said.
- Advice: "Try journaling about this tonight." -> Fails: gives advice/instruction ("Try...") instead of leaving a lingering question.
- Cruel: "Why do you keep lying to yourself?" -> Fails: cruel and accusatory instead of warm and curious.

Return ONLY valid JSON:
{"text": "Single-line Bridge under 40 words ending with ?", "format": "pattern_observation" | "belief_challenge" | "reframe_question", "word_count": number, "source_qid": number | null}`;

/**
 * Formats today's non-excluded answers, day theme, prior Bridges, and optional `crisisType`
 * into a concise Bridge generation prompt.
 */
export function buildBridgePrompt(
  paramsOrDay: BuildBridgePromptParams | number,
  legacyDayTitle?: string,
  legacyTodaysAnswers?: AnswerDoc[],
): string {
  const params: BuildBridgePromptParams =
    typeof paramsOrDay === "number"
      ? {
          day: paramsOrDay,
          dayTitle: legacyDayTitle ?? "",
          todaysAnswers: legacyTodaysAnswers ?? [],
        }
      : paramsOrDay;

  const safeAnswers = params.todaysAnswers.filter((a) => !a.excludedFromAI);
  const priorBridges = params.previousBridges ?? [];

  logInfo("bridgePrompt.buildBridgePrompt", {
    day: params.day,
    answerCount: safeAnswers.length,
    priorBridgeCount: priorBridges.length,
    hasCrisisType: Boolean(params.crisisType),
  });

  const answersBlock = safeAnswers
    .map(
      (a) =>
        `[Q${a.qid}] ${a.questionText}\nAnswer${a.idkFlagged ? " (left open after 3 IDKs)" : ""}: ${a.text}`,
    )
    .join("\n\n");

  const priorBlock =
    priorBridges.length > 0
      ? `\nPrevious Bridges (do NOT repeat):\n${priorBridges
          .map((b) => `- Day ${b.day} (${b.format}): ${b.text}`)
          .join("\n")}\n`
      : "";

  const crisisLine = params.crisisType
    ? `\nDetected crisis context (internal only, never print label): ${params.crisisType}\n`
    : "";

  return `Day ${params.day} of 5 · ${params.dayTitle}${crisisLine}${priorBlock}
Today's answers:
${answersBlock}

Return JSON {"text", "format", "word_count", "source_qid"}.`;
}
