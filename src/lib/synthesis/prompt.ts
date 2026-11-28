/**
 * Prompt builder for Day 5 Synthesis (`src/lib/synthesis/prompt.ts`).
 *
 * Feature overview & use cases:
 * - Implements Part 4 Synthesis prompt on the `deep` model:
 *   1. Sends ONLY the structured pattern map and relevant quotes (plus any unanswered QID
 *      text and user-written Q29 priorities), keeping prompt token usage tight (`COST RULES`).
 *   2. Enforces the exact 6-part structure in order:
 *      (1) Opening in their words -> (2) 3 to 5 insights -> (3) Contradictions ->
 *      (4) The unanswered question (if flagged) -> (5) 2 to 3 possible open directions
 *      grounded strictly in their own words -> (6) A warm close that ends the journey.
 *   3. Shapes framing by `crisis_type` (`burnout` -> rest before direction; `identity` ->
 *      selfhood, not job titles; `existential` -> gentle grounding; `already_knows.value` ->
 *      centers their own stated answer).
 *   4. Outputs each insight separately with an ID/patternKey so `/synthesis` renders
 *      `"Did this land?"` controls writing to `insights[].landed`.
 * - Exports `PROMPT_VERSION` per `MODELS.md`.
 */

import type {
  AlreadyKnows,
  AnswerDoc,
  BridgeDoc,
  CrisisType,
  PatternContradiction,
  PatternFlagDoc,
} from "@/lib/db/schema";
import { CAREER_FOG_QUESTIONS } from "@/lib/journey/questions";
import { logInfo } from "@/lib/log";
import { extractDayFromAnswerPath } from "@/lib/patterns/detect";

export const PROMPT_VERSION = "synthesis-v1";

export interface BuildSynthesisPromptParams {
  crisisType: CrisisType | null;
  flags: PatternFlagDoc[];
  contradictions?: PatternContradiction[];
  unansweredQids?: number[];
  alreadyKnows?: AlreadyKnows;
  answers?: Array<AnswerDoc & { day: number }>;
  bridges?: BridgeDoc[];
}

export const SYNTHESIS_SYSTEM_INSTRUCTION = `You write the closing Day 5 reflection for Spiral, a calm, plain-spoken self-inquiry clarity guide.
Pattern keys in the input are for your internal reasoning ONLY and must NEVER appear anywhere in your output text.

STRUCTURE OF "text" (500 to 800 words, in this exact order across 5 to 6 paragraphs separated by "\\n\\n"):
1. Opening: what this 5-day journey was really about for them, anchored in their own words.
2. Core threads (3 to 5 insights): reflect the main patterns plainly, quoting their exact words ("...").
3. Contradictions: reflect the tension between what they value and how their week actually ran, quoting their words.
4. The unanswered question (include if unanswered_qids is non-empty): weave in "There was a question you could not answer. That silence might be the most important data point of your entire Spiral."
5. 2 to 3 possible directions: reflect 2 to 3 open, hedged possibilities drawn strictly from their own Day 5 answers — NEVER a single answer, and NEVER prescriptive advice ("you should", "try to", "make sure").
6. A warm close that ends the journey cleanly (no streaks, no open-ended chat; if Q29 priorities are provided, ask "Is this yours, or was it handed to you?").

NON-NEGOTIABLE RULES:
- Length: "text" MUST be strictly 500 to 800 words.
- Hedged, non-diagnostic language ONLY ("it sounds like", "you might notice", "one possibility is").
- Quote their exact words in double quotation marks ("...").
- ZERO pattern names or clinical labels outside quoted user text ("people-pleasing", "burnout", "burned out", "toxic positivity", "limiting belief", "coping mechanism", "over-intellectualizing", "performative self-awareness", "institutional dependency", "comparison spiral", "childhood conditioning", "self-minimization").
- INSIGHTS ARRAY (3 to 5 items):
  - Each item corresponds to one detected pattern ("patternKey" is internal metadata).
  - Each insight's "text" MUST include at least 2 verbatim quotes ("...") from at least 2 different days AND end with an explicit alternative reading starting with: "Or it may simply be that..."

Return ONLY valid JSON:
{
  "text": "500 to 800 word reflection following parts 1..6...",
  "insights": [
    {
      "patternKey": "internal_key",
      "evidenceDays": [1, 3],
      "text": "Plain-spoken insight quoting \"exact words\" and \"second quote\"... Or it may simply be that..."
    }
  ]
}`;

/**
 * Returns crisis-type and `already_knows` framing instructions per Part 4 rules.
 */
export function buildSynthesisFramingGuidance(
  crisisType: CrisisType | null,
  alreadyKnows?: AlreadyKnows,
): string {
  const directives: string[] = [];

  switch (crisisType) {
    case "burnout":
      directives.push(
        "CRISIS FRAMING (burnout — NEVER print the word 'burnout' or 'burned out'): Lead with rest, recovery, and energy before career direction.",
      );
      break;
    case "identity":
      directives.push(
        "CRISIS FRAMING (identity): Talk about who they are underneath performances and roles, rather than job titles or career ladders.",
      );
      break;
    case "existential":
      directives.push(
        "CRISIS FRAMING (existential): Ground them gently in ordinary, concrete physical moments and human connections they named. Do not excavate into abstract emptiness.",
      );
      break;
    case "transition":
      directives.push(
        "CRISIS FRAMING (transition): Acknowledge that multiple chapters are shifting at once, keeping possibilities calm and unhurried.",
      );
      break;
    default:
      directives.push(
        "CRISIS FRAMING: Keep the reflection grounded, calm, and anchored in their own contrasts.",
      );
      break;
  }

  if (alreadyKnows?.value && alreadyKnows.answer) {
    directives.push(
      `ALREADY KNOWS RULE: They already named what they know they need to do ("${alreadyKnows.answer}"). Reflect their own answer back as the central direction alongside gentle open context, rather than inventing new options.`,
    );
  }

  return directives.join("\n");
}

/**
 * Builds a compact Day 5 synthesis prompt sending ONLY the pattern map, exact quotes,
 * contradictions, unanswered QID context, and Q29 user-written priorities.
 */
export function buildSynthesisPrompt(params: BuildSynthesisPromptParams): string {
  const {
    crisisType,
    flags,
    contradictions = [],
    answers = [],
    alreadyKnows,
  } = params;

  const unansweredQids =
    params.unansweredQids ??
    Array.from(new Set(answers.filter((a) => a.idkFlagged).map((a) => a.qid)));

  logInfo("synthesisPrompt.buildSynthesisPrompt", {
    crisisType: crisisType ?? "none",
    flagCount: flags.length,
    contradictionCount: contradictions.length,
    unansweredCount: unansweredQids.length,
    alreadyKnows: Boolean(alreadyKnows?.value),
  });

  const framingBlock = buildSynthesisFramingGuidance(crisisType, alreadyKnows);

  const patternsBlock = flags
    .map((f) => {
      const quotes = f.evidence
        .map((ev) => {
          const d = ev.day ?? extractDayFromAnswerPath(ev.answerPath) ?? "?";
          return `[Day ${d}${ev.qid ? ` · Q${ev.qid}` : ""}] "${ev.quote}"`;
        })
        .join(" | ");
      return `- Reasoning key (NEVER write key in output): ${f.patternKey} (${f.category})\n  Quotes: ${quotes}`;
    })
    .join("\n");

  const contradictionsBlock =
    contradictions.length > 0
      ? contradictions
          .map(
            (c) =>
              `- Value (${c.stated_value}): [Q${c.value_quote.qid}] "${c.value_quote.quote}" vs Behaviour (${c.actual_behaviour}): [Q${c.behaviour_quote.qid}] "${c.behaviour_quote.quote}"`,
          )
          .join("\n")
      : answers
          .filter((a) => a.qid === 19 || a.qid === 20 || a.qid === 22)
          .map((a) => `[Day ${a.day} · Q${a.qid}] "${a.text}"`)
          .join("\n") || "Use tensions visible across the pattern quotes above.";

  const unansweredBlock =
    unansweredQids.length > 0
      ? unansweredQids
          .map((qid) => {
            const qText = CAREER_FOG_QUESTIONS[qid]?.text ?? `Question ${qid}`;
            return `- Q${qid} (left open after 3 IDKs): "${qText}"`;
          })
          .join("\n")
      : "None";

  const day5DirectionQuotes = answers
    .filter((a) => a.day === 5 && !a.excludedFromAI && a.qid >= 24)
    .map((a) => `[Day 5 · Q${a.qid}] "${a.text}"`)
    .join("\n");

  const q29Answer = answers.find((a) => a.qid === 29 && !a.excludedFromAI);
  const q29Rule =
    q29Answer && q29Answer.text.trim().length > 0
      ? `\nUser's Q29 Priorities ("In your words" — reflect without adding prescriptive actions, and ask "Is this yours, or was it handed to you?"):\n${q29Answer.text}\n`
      : "";

  return `${framingBlock}

Pattern Map & Verbatim Quotes:
${patternsBlock}

Contradictions & Value Quotes:
${contradictionsBlock}

Unanswered Question(s) Flagged:
${unansweredBlock}
${day5DirectionQuotes ? `\nDay 5 Direction Quotes:\n${day5DirectionQuotes}\n` : ""}${q29Rule}
Write the Day 5 synthesis JSON now (500 to 800 words, parts 1..6 in order, hedged language, zero pattern labels outside quoted user text, 3 to 5 insights with IDs/quotes).`;
}
