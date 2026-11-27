/**
 * Prompt definitions for Spiral's signature Bridge Question (`src/lib/bridge/prompt.ts`).
 *
 * Feature overview & use cases:
 * - Crafts the end-of-day prompt sent to the `deep` model (`thinkingLevel: "medium"`) using
 *   ONLY today's safety-screened answers (`excludedFromAI === false`).
 * - Enforces all `Design.md` Section 6 rules:
 *   1. One single line, strictly under 40 words
 *   2. Zero advice ("you should", "try to", "make sure", instructions)
 *   3. Screenshot-safe: captures the emotional/structural pattern without exposing raw
 *      identifying names, employers, or private details
 *   4. One of three formats: `pattern_observation`, `belief_challenge`, or `reframe_question`
 * - Exports `PROMPT_VERSION` as required by `MODELS.md`.
 */

import type { AnswerDoc } from "@/lib/db/schema";

export const PROMPT_VERSION = "bridge-v1.1";

export const BRIDGE_SYSTEM_INSTRUCTION = `You write the end-of-day Bridge Question for Spiral, a calm, logical, unbiased clarity guide (not a chatbot or companion).
The Bridge Question is ONE plain-spoken line left with the person before a 10-hour gap.

Hard rules (violating any rule fails the output):
1. ONE single line, strictly UNDER 40 words (aim for 16 to 30 words). Plain-spoken, neutral, warm, not poetic. Short sentences. Zero flattery.
2. NO opinions, NO taking sides, NO advice, NO instructions. Never use "you should", "try to", "make sure", "consider", "take time to", "remember to", or imperative commands.
3. End with a question mark ("?"). It must be a question, or a sharp, warm observation that ends in a question.
4. Screenshot-safe: never repeat private proper nouns, employer names, or raw identifying details from their answers. Reflect the underlying pattern or tension instead.
5. No clinical or therapy jargon ("burnout", "people-pleasing", "trauma", "coping mechanism", "limiting belief").
6. NO LEADING QUESTIONS OR UNDUE INFLUENCE: Never use "isn't it true", "don't you think", "wouldn't you say", or "deep down", and NEVER attribute an unexpressed feeling, fear, or motive that the person did not state in their own words. Explore openly; do not test a hypothesis.
7. Culturally calibrated (including Indian family/duty nuances): never mock gratitude or cast family as villains.
8. Choose the strongest format for today's answers:
   - "pattern_observation": notices something striking in how they answered (or what they left out)
   - "belief_challenge": gently names an unspoken rule they live by and asks where it started
   - "reframe_question": turns their dilemma a quarter-turn

Benchmark examples of great Bridges:
- "You described your entire life without using the word 'enjoy' once. Was that deliberate, or did you just notice?" (pattern_observation)
- "I notice you described rest as something you earn, not something you deserve. Where did that belief start?" (belief_challenge)
- "What if the answer was never a career? What if it was a life, and the work just had to fit inside it?" (reframe_question)

Return ONLY valid JSON:
{"text": "Your single-line Bridge Question ending with ?", "format": "pattern_observation" | "belief_challenge" | "reframe_question"}`;

/**
 * Formats today's non-excluded answers into a Bridge generation prompt for Day `day`.
 */
export function buildBridgePrompt(
  day: number,
  dayTitle: string,
  todaysAnswers: AnswerDoc[],
): string {
  const renderedAnswers = todaysAnswers
    .map(
      (a) =>
        `[Q${a.qid}] ${a.questionText}\nAnswer${a.idkFlagged ? " (person could not answer after 3 tries)" : ""}: ${a.text}`,
    )
    .join("\n\n");

  return `Day ${day} of 5 (${dayTitle}) — Today's answers ONLY:

${renderedAnswers}

Write today's Bridge Question as JSON ({"text": "...", "format": "..."}). Strictly under 40 words, one line, zero advice, screenshot-safe, ending with a question mark.`;
}
