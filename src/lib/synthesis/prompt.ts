/**
 * Prompt builder for Day 5 Synthesis (`src/lib/synthesis/prompt.ts`).
 *
 * Feature overview & use cases:
 * - Crafts the Day 5 synthesis prompt for the `deep` model (`thinkingLevel: "high"`),
 *   enforcing `Design.md` Sections 1, 7 & 7b and `CONSTRAINTS.md`:
 *   1. Role & tone: calm, logical, unbiased clarity guide (not a chatbot or companion);
 *      plain-spoken, neutral, warm, not poetic; short sentences; zero flattery; never gives
 *      opinions, takes sides, or offers advice.
 *   2. 500 to 800 words (`text`), hedged plain language, zero clinical/taxonomy labels.
 *   3. NEVER suggests priorities, directions, or actions itself. May reflect the user's
 *      self-written Q29 priorities/steps back and ask `"Is this yours, or was it handed to you?"`.
 *   4. 3 to 5 `insights`, each quoting `>= 2` verbatim answers from `>= 2` distinct pre-Bridge
 *      days AND stating one explicit alternative reading (`"Or it may simply be that..."`).
 */

import type {
  AnswerDoc,
  BridgeDoc,
  CrisisType,
  PatternFlagDoc,
} from "@/lib/db/schema";
import {
  buildGeminiLanguageDirective,
  getTranslations,
  type SupportedLanguage,
} from "@/lib/i18n";
import { logInfo } from "@/lib/log";
import { extractDayFromAnswerPath } from "@/lib/patterns/detect";

export const PROMPT_VERSION = "synthesis-v1.3";

export const SYNTHESIS_SYSTEM_INSTRUCTION = `You write the closing Day 5 reflection for Spiral.
Spiral is a calm, logical, unbiased anchor — a clarity guide, not a chatbot or companion.

NON-NEGOTIABLE RULES:
1. TONE & ROLE: Plain-spoken, neutral, warm, NOT poetic. Short, clear sentences. Zero flattery. Reflect back what the user said. NEVER give opinions, NEVER take sides, and NEVER offer advice.
2. WORD COUNT: The main "text" field MUST be between 500 and 800 words (aim for 560 to 680 words), structured into 4 to 6 clear paragraphs separated by "\\n\\n".
3. NO SUGGESTED PRIORITIES OR ACTIONS: NEVER suggest priorities, career directions, next steps, or actions yourself. The user wrote their own top 3 priorities and next steps on Q29 (which the UI displays verbatim under "In your words"). You may reflect their exact stated priorities back and ask "Is this yours, or was it handed to you?", and nothing more prescriptive than that.
4. HEDGED FRAMING ONLY: Use humble, non-diagnostic language ("it sounds like", "you might notice", "one possibility is"). Never introduce a feeling, belief, or motive the person did not state in their own words.
5. ZERO PATTERN LABELS: NEVER write any internal or clinical labels anywhere in "text" or "insights[].text" ("people-pleasing", "people pleaser", "burnout", "burned out", "toxic positivity", "limiting belief", "coping mechanism", "over-intellectualizing", "performative self-awareness", "institutional dependency", "comparison spiral", "childhood conditioning").
6. INSIGHTS ARRAY (3 to 5 items):
   - Every insight's "text" MUST include AT LEAST TWO verbatim quotes wrapped in double quotes ("...") from AT LEAST TWO DIFFERENT DAYS written BEFORE that pattern was first hinted at in a Bridge.
   - Every insight's "text" MUST end with one explicit alternative reading sentence starting with the exact words: "Or it may simply be that..."
   - Include "evidenceDays": [dayA, dayB] listing the >= 2 distinct pre-Bridge day numbers quoted.

Return ONLY valid JSON:
{
  "text": "500 to 800 word plain-spoken, unbiased reflection...",
  "insights": [
    {
      "patternKey": "pattern_key_from_map",
      "evidenceDays": [1, 3],
      "text": "Plain-spoken reflection quoting \"first quote from Day 1\" and \"second quote from Day 3\"... Or it may simply be that..."
    }
  ]
}`;

/**
 * Shapes crisis-type-specific framing instructions without leaking labels or giving advice.
 */
function getCrisisFramingGuidance(crisisType: CrisisType): string {
  switch (crisisType) {
    case "burnout":
      return "FRAMING NOTE: Reflect the contrast between energy and depletion plainly in their own words without using the word 'burnout' or 'burned out' and without giving advice.";
    case "identity":
      return "FRAMING NOTE: Reflect the contrast they described between roles that felt like a performance and moments that felt like themselves, without taking sides.";
    case "existential":
      return "FRAMING NOTE: Keep the reflection grounded in concrete, ordinary moments from their own answers rather than abstract speculation.";
    case "transition":
      return "FRAMING NOTE: Reflect the shifting chapters they named plainly and calmly without pushing for premature certainty.";
  }
}

/**
 * Builds the Day 5 synthesis prompt with pre-Bridge multi-day evidence and user-written Q29 priorities.
 */
export function buildSynthesisPrompt(params: {
  crisisType: CrisisType;
  flags: PatternFlagDoc[];
  answers: Array<AnswerDoc & { day: number }>;
  bridges: BridgeDoc[];
  language?: SupportedLanguage;
}): string {
  const { crisisType, flags, answers, bridges, language = "en" } = params;
  const dict = getTranslations(language);
  const altPrefix = dict.synthesis.alternativeReadingPrefix;
  const langDirective = buildGeminiLanguageDirective(language);

  logInfo("synthesisPrompt.buildSynthesisPrompt", {
    crisisType,
    flagCount: flags.length,
    answerCount: answers.length,
    language,
  });

  const hasFlaggedIdk = answers.some((a) => a.idkFlagged);
  const q29Answer = answers.find((a) => a.qid === 29);

  const patternSummary = flags
    .map((f) => {
      const quotesWithDays = f.evidence
        .map((e) => {
          const dayNum = extractDayFromAnswerPath(e.answerPath);
          return `[Day ${dayNum ?? "?"}] "${e.quote}"`;
        })
        .join(" | ");
      return `- Internal key (DO NOT print key): ${f.patternKey} | First hinted in Bridge: ${f.firstBridgeHintDay ? `Day ${f.firstBridgeHintDay}` : "never"}\n  Pre-Bridge multi-day quotes to cite: ${quotesWithDays}`;
    })
    .join("\n");

  const journeyTranscript = answers
    .map(
      (a) =>
        `[Day ${a.day} · Q${a.qid}] ${a.questionText}\nAnswer${a.idkFlagged ? " (could not answer after 3 tries)" : ""}: ${a.text}`,
    )
    .join("\n\n");

  const bridgeTranscript = bridges
    .map((b) => `End of Day ${b.day} Bridge: ${b.text}`)
    .join("\n");

  const specialInstructions: string[] = [
    langDirective,
    getCrisisFramingGuidance(crisisType),
  ];

  if (hasFlaggedIdk) {
    specialInstructions.push(
      `IDK SILENCE RULE: Include the meaning of this sentence naturally in the requested language: "There was a question you could not answer. That silence might be the most important data point of your entire Spiral."`,
    );
  }

  if (q29Answer && q29Answer.text.trim().length > 0) {
    specialInstructions.push(
      `USER'S OWN PRIORITIES RULE (Q29): They wrote these priorities and next steps in their own words:\n${q29Answer.text}\nReflect these back plainly without suggesting any priorities or actions of your own, and close by asking: "${dict.synthesis.isThisYoursQuestion}"`,
    );
  }

  return `${specialInstructions.join("\n\n")}

---
Validated Pre-Bridge Pattern Map:
${patternSummary}

---
5-Day Answers:
${journeyTranscript}

---
5-Day Bridges:
${bridgeTranscript}

Write the Day 5 synthesis JSON now in the requested language ("text" plain-spoken unbiased tone, ZERO suggested priorities/actions, ZERO clinical/pattern labels, 3 to 5 "insights" each with >= 2 verbatim "..." quotes across >= 2 pre-Bridge days AND ending with "${altPrefix}...").`;
}
