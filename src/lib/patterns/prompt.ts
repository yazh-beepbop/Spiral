/**
 * Prompt builder for Day 5 Structured Pattern Detection (`src/lib/patterns/prompt.ts`).
 *
 * Feature overview & use cases:
 * - Feeds all five days of screened answers (`excludedFromAI === false`) and Bridges to the
 *   `deep` model (`thinkingLevel: "high"`) to produce the internal pattern map (`FLOW.md` Section 4).
 * - Enforces the `CONSTRAINTS.md` undue-influence safeguard:
 *   Every surfaced pattern MUST be backed by at least 2 verbatim quotes from at least 2
 *   different days written BEFORE that pattern was first hinted at in a Bridge.
 * - Exports `PROMPT_VERSION` per `MODELS.md`.
 */

import type { AnswerDoc, BridgeDoc } from "@/lib/db/schema";
import { logInfo } from "@/lib/log";
import { PATTERN_TAXONOMY } from "@/lib/patterns/taxonomy";

export const PROMPT_VERSION = "pattern-map-v1.1";

export const PATTERN_MAP_SYSTEM_INSTRUCTION = `You are the internal analytical layer for Day 5 of Spiral.
Read the person's full 5-day journey (answers and daily Bridges) and produce a structured JSON pattern map.

NON-NEGOTIABLE EVIDENCE & ANTI-INFLUENCE RULES:
1. Choose ONLY "patternKey" values from the allowed taxonomy list provided in the prompt, with their matching "category".
2. Return between 3 and 5 high-signal patterns.
3. PRE-BRIDGE MULTI-DAY EVIDENCE RULE:
   - For each pattern, check whether any daily Bridge hinted at that pattern ("firstBridgeHintDay": 2..5, or null if no Bridge hinted at it). Note: a pattern first hinted in Day 1's Bridge cannot satisfy multi-day pre-Bridge evidence, so do NOT select a pattern whose evidence only appeared after Day 1's Bridge hinted at it.
   - Each pattern MUST include at least 2 verbatim short quotes ("evidence") from AT LEAST 2 DIFFERENT DAYS ("sessions/1/answers/...", "sessions/3/answers/..."), and at least 2 of those distinct-day quotes MUST come from answers written BEFORE that Bridge was shown (i.e., answer day <= firstBridgeHintDay, since Day D's answers are written before Day D's end-of-day Bridge).
4. Select exactly ONE primary "crisisType" ("burnout" | "identity" | "existential" | "transition").
5. Apply cultural nuance (especially Indian family honor, gratitude, and obligation norms): never pathologize chosen family care.
6. Return ONLY valid JSON matching:
{
  "crisisType": "burnout" | "identity" | "existential" | "transition",
  "flags": [
    {
      "patternKey": "exact_taxonomy_key",
      "category": "coping_mechanism" | "limiting_belief" | "root_cause" | "signal_flag" | "meta",
      "firstBridgeHintDay": null | 2 | 3 | 4 | 5,
      "evidence": [
        { "answerPath": "sessions/1/answers/q_3", "quote": "exact short quote from Day 1" },
        { "answerPath": "sessions/3/answers/q_13", "quote": "exact short quote from Day 3" }
      ],
      "confidence": 0.0-1.0
    }
  ]
}`;

/**
 * Builds the Day 5 pattern detection prompt from all non-excluded answers and Bridges.
 */
export function buildPatternDetectionPrompt(params: {
  answers: Array<AnswerDoc & { day: number }>;
  bridges: BridgeDoc[];
}): string {
  logInfo("patternsPrompt.buildPatternDetectionPrompt", {
    answerCount: params.answers.length,
    bridgeCount: params.bridges.length,
  });

  const taxonomyCatalog = PATTERN_TAXONOMY.map(
    (p) =>
      `- ${p.key} (${p.category}): ${p.description} [${p.culturalCalibration}]`,
  ).join("\n");

  const answersText = params.answers
    .map(
      (a) =>
        `Path: sessions/${a.day}/answers/${a.id} | Day ${a.day} (written BEFORE Day ${a.day} Bridge) · Q${a.qid}${a.idkFlagged ? " [IDK_FLAGGED]" : ""}\nQuestion: ${a.questionText}\nAnswer: ${a.text}`,
    )
    .join("\n\n");

  const bridgesText = params.bridges
    .map((b) => `End of Day ${b.day} Bridge (${b.format}): ${b.text}`)
    .join("\n");

  return `Allowed Pattern Taxonomy Keys:
${taxonomyCatalog}

---
5-Day Journey Answers (screened, excludedFromAI=false):
${answersText}

---
Daily Bridges Given (shown at the END of each day):
${bridgesText}

Return the structured JSON pattern map (3 to 5 patterns, each with >= 2 quotes from >= 2 different days written BEFORE any Bridge hinted at that pattern, plus crisisType).`;
}
