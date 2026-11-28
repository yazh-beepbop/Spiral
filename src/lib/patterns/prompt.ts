/**
 * Prompt builder for Day 5 Structured Pattern Detection (`src/lib/patterns/prompt.ts`).
 *
 * Feature overview & use cases:
 * - Implements Part 4 Pattern Map prompt:
 *   Feeds all 5 days of non-excluded answers (`qid`, `questionText`, `text`, `day`),
 *   all daily Bridges, overnight reflections, IDK flags (`unanswered_qids`), and the full
 *   `Design.md` Section 8 pattern taxonomy (including India cultural calibration notes)
 *   to the `deep` model to produce a strict, quote-backed JSON pattern map.
 * - Exports `PROMPT_VERSION` per `MODELS.md`.
 */

import type { AnswerDoc, BridgeDoc } from "@/lib/db/schema";
import { logInfo } from "@/lib/log";
import { PATTERN_TAXONOMY } from "@/lib/patterns/taxonomy";

export const PROMPT_VERSION = "patterns-v1";

export interface OvernightReflectionInput {
  day: number;
  text: string;
}

export interface BuildPatternPromptParams {
  answers: Array<AnswerDoc & { day: number }>;
  bridges: BridgeDoc[];
  overnightReflections?: OvernightReflectionInput[];
  idkFlaggedQids?: number[];
}

export const PATTERN_MAP_SYSTEM_INSTRUCTION = `You are the internal Day 5 analytical layer for Spiral.
Read the person's 5-day journey and produce a structured JSON pattern map. Your output is internal reasoning only — never shown directly to the user.

NON-NEGOTIABLE RULES:
1. Select 3 to 5 strong patterns using ONLY exact "key" and "category" values from the provided Pattern Taxonomy. Fewer, stronger patterns beat many weak ones.
2. MULTI-DAY VERBATIM QUOTE RULE:
   - Every pattern MUST have at least 2 exact verbatim quotes ("evidence": [{"qid": number, "day": number, "quote": "exact words from their answer"}]) from AT LEAST 2 DIFFERENT DAYS.
   - No quote, no pattern. Quotes must come from answers written BEFORE any Bridge first hinted at that pattern.
3. CULTURAL CALIBRATION RULE:
   - Check the taxonomy's cultural note before applying any pattern. Family duty, care, or gratitude in an Indian household is NOT automatically "people_pleasing" or "toxic_positivity" unless the person's own words show fear of disapproval or self-erasure. Never cast parents as villains.
4. Set "crisis_type" to "burnout" | "identity" | "existential" | "transition" | null.
5. Capture "contradictions" (stated value vs actual behaviour, each with {"qid", "quote"} in exact words).
6. List "unanswered_qids" (all QIDs flagged with IDK after 3 tries).
7. Set "already_knows": {"value": boolean, "answer": string | null} — true when the person named a clear, immediate answer on Day 5 (especially Q28/Q25) that they already know they need to act on.

Return ONLY valid JSON:
{
  "patterns": [
    {
      "key": "exact_taxonomy_key",
      "category": "coping_mechanism" | "limiting_belief" | "root_cause" | "signal_flag" | "meta",
      "firstBridgeHintDay": null | 2 | 3 | 4 | 5,
      "evidence": [
        { "qid": 3, "day": 1, "quote": "exact words from Day 1" },
        { "qid": 13, "day": 3, "quote": "exact words from Day 3" }
      ],
      "confidence": 0.0-1.0
    }
  ],
  "crisis_type": "burnout" | "identity" | "existential" | "transition" | null,
  "contradictions": [
    {
      "stated_value": "short plain summary",
      "actual_behaviour": "short plain summary",
      "value_quote": { "qid": 19, "quote": "exact words" },
      "behaviour_quote": { "qid": 20, "quote": "exact words" }
    }
  ],
  "unanswered_qids": [17],
  "already_knows": { "value": false, "answer": null }
}`;

/**
 * Builds the Day 5 pattern detection prompt from all non-excluded answers, Bridges,
 * overnight reflections, IDK flags, and the full Section 8 cultural pattern taxonomy.
 */
export function buildPatternDetectionPrompt(
  params: BuildPatternPromptParams,
): string {
  const safeAnswers = params.answers.filter((a) => !a.excludedFromAI);
  const flaggedQids =
    params.idkFlaggedQids ??
    Array.from(
      new Set(safeAnswers.filter((a) => a.idkFlagged).map((a) => a.qid)),
    );
  const reflections =
    params.overnightReflections ??
    safeAnswers
      .filter((a) => a.qid === 6 && a.text.trim().length > 0)
      .map((a) => ({ day: a.day, text: a.text }));

  logInfo("patternsPrompt.buildPatternDetectionPrompt", {
    answerCount: safeAnswers.length,
    bridgeCount: params.bridges.length,
    reflectionCount: reflections.length,
    flaggedQidCount: flaggedQids.length,
  });

  const taxonomyCatalog = PATTERN_TAXONOMY.map(
    (p) =>
      `- ${p.key} [${p.category}]: ${p.description} | Cultural note: ${p.culturalCalibration}`,
  ).join("\n");

  const answersBlock = safeAnswers
    .map(
      (a) =>
        `[Day ${a.day} · Q${a.qid}${a.idkFlagged ? " · IDK_FLAGGED" : ""}] ${a.questionText}\nAnswer: ${a.text}`,
    )
    .join("\n\n");

  const bridgesBlock =
    params.bridges.length > 0
      ? params.bridges
          .map((b) => `Day ${b.day} Bridge (${b.format}): ${b.text}`)
          .join("\n")
      : "None";

  const reflectionsBlock =
    reflections.length > 0
      ? reflections.map((r) => `Day ${r.day} overnight: ${r.text}`).join("\n")
      : "None";

  return `Pattern Taxonomy (Design.md Section 8 + Cultural Notes):
${taxonomyCatalog}

---
IDK-Flagged Unanswered QIDs: ${flaggedQids.length > 0 ? flaggedQids.join(", ") : "none"}

Overnight Reflections:
${reflectionsBlock}

Daily Bridges (shown at END of each day):
${bridgesBlock}

5-Day Screened Answers:
${answersBlock}

Return the JSON pattern map (3 to 5 patterns, each with >= 2 exact quotes from >= 2 different days).`;
}
