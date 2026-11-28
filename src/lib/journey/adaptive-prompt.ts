/**
 * Prompt builder for Layer 3 (L3) Adaptive Questions (`src/lib/journey/adaptive-prompt.ts`).
 *
 * Feature overview & use cases:
 * - Constructs system instructions and user-answer context for Career Fog L3 adaptive
 *   questions (`QID 11` on Day 2, `QID 16` on Day 3, `QID 23` on Day 4).
 * - Strictly enforces `CONSTRAINTS.md` ("NO LEADING QUESTIONS / UNDUE INFLUENCE"):
 *   1. Open and neutral only — NO yes/no questions, NO embedded assumptions, NO pattern names
 *   2. Never uses "isn't it true", "don't you think", or "wouldn't you say"
 *   3. Never introduces a feeling, belief, or motive not already expressed in the person's own words
 *   4. Explores openly rather than testing a hypothesis.
 */

import type { AnswerDoc } from "@/lib/db/schema";
import { buildGeminiLanguageDirective, type SupportedLanguage } from "@/lib/i18n";
import { logInfo } from "@/lib/log";

export const PROMPT_VERSION = "adaptive-l3-v1.3";

export const ADAPTIVE_SYSTEM_INSTRUCTION = `You write one open, neutral follow-up question inside Spiral.
Spiral is a calm, logical, unbiased clarity guide — not a chatbot or companion.

NON-NEGOTIABLE NEUTRALITY RULES (NO LEADING QUESTIONS / UNDUE INFLUENCE):
1. Open and neutral ONLY: ask an open exploratory question ("What", "How", "Where", "When", "Which" or their exact equivalent in the requested language). NEVER ask a closed yes/no question.
2. Tone: plain-spoken, neutral, warm, not poetic. Short sentences. Zero flattery, zero opinions, never take sides or offer advice.
3. NEVER use leading or coercive phrases ("isn't it true", "don't you think", "wouldn't you say", "aren't you really", "deep down", or equivalents in any language).
4. NEVER introduce a feeling, belief, fear, or motive that the person has NOT explicitly written in their own words. Reference only words they actually used.
5. NEVER include pattern labels or clinical terms ("people-pleasing", "burnout", "limiting belief", "coping mechanism", "avoidance").
6. Explore openly — never test a hypothesis or steer toward a conclusion. Under 36 words, single line, ending with "?". Output ONLY the plain question text in the requested language.`;

/**
 * Builds the model prompt for generating a neutral, open L3 adaptive question (`qid` 11, 16, or 23)
 * grounded strictly in the person's own earlier words and written in `language`.
 */
export function buildAdaptiveQuestionPrompt(
  qid: number,
  priorAnswers: Array<AnswerDoc & { day: number }>,
  language: SupportedLanguage = "en",
): string {
  logInfo("adaptivePrompt.buildAdaptiveQuestionPrompt", {
    qid,
    answerCount: priorAnswers.length,
    language,
  });

  const langRule = buildGeminiLanguageDirective(language);
  const formattedHistory = priorAnswers
    .map(
      (a) =>
        `[Day ${a.day} · Q${a.qid}] Question: ${a.questionText}\nAnswer: ${a.text}`,
    )
    .join("\n\n");

  if (qid === 11) {
    return `${langRule}

Earlier answers from this person (use ONLY feelings, activities, and words they actually wrote):
${formattedHistory}

Task for QID 11 (Day 2 · Energy Archaeology):
Write ONE open, neutral exploratory question (NEVER yes/no) placing two details from their own Day 1 / Day 2 answers side by side without assuming a motive or cause. Under 35 words, ending with "?". Return only the question in the requested language.`;
  }

  if (qid === 16) {
    return `${langRule}

Earlier answers from this person (use ONLY words they actually wrote):
${formattedHistory}

Task for QID 16 (Day 3 · Identity Excavation):
Follow this structural meaning in the requested language using ONLY their own concrete words:
"You said [activity] gives you energy and [role] feels like a performance. What if you stopped performing?"
Fill [activity] and [role] strictly from their own answers without introducing any unexpressed feeling or motive. Under 38 words, ending with "?". Return only the question.`;
  }

  if (qid === 23) {
    return `${langRule}

Earlier answers from this person (use ONLY words they actually wrote):
${formattedHistory}

Task for QID 23 (Day 4 · Values and Contradictions):
Follow this structural meaning in the requested language using ONLY their own concrete words:
"Your pride image was [X], and your week currently centers on [Y]. What sits between the two?"
Fill [X] from Q21 and [Y] from their own description of last week without assuming why. Under 38 words, ending with "?". Return only the question.`;
  }

  return `${langRule}\n\nEarlier answers:\n${formattedHistory}\n\nWrite one open, neutral reflective question under 35 words using only words they already expressed.`;
}
