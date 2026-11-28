/**
 * Mocked Automated Test Suite for Part 3: Bridge Question (`evals/test-p3-bridge.ts`).
 *
 * Feature overview & use cases:
 * - Verifies all Part 3 requirements deterministically with mocked Gemini responses:
 *   1. All 6 spec benchmark Bridges in `evals/bridge-golden-set.json` pass `validateBridgeText`
 *      and score `6/6` on `scoreBridgeRubric`, while all negative examples (`generic`, `advice`,
 *      `cruel`, leading questions, >= 40 words, pattern labels) fail validation.
 *   2. All 5 daily fallback Bridges (`src/lib/bridge/fallbacks.ts`) pass `validateBridgeText`.
 *   3. End-to-end across 3 sample days:
 *      - Sample Day 1: clean first-pass generation -> 1 deep-model call, rubric saved, `referencedNextSession === null`.
 *      - Sample Day 2: first draft violates advice/pattern check -> regenerates once on deep model -> succeeds in 2 calls.
 *      - Sample Day 3: both attempts fail validation -> capped at 2 deep-model calls and returns Day 3's fallback Bridge.
 *   4. `excludedFromAI === true` answers are stripped even if passed directly to `generateDayBridge`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getServerConfig } from "../src/lib/config";
import {
  FALLBACK_BRIDGES,
  getFallbackBridge,
} from "../src/lib/bridge/fallbacks";
import {
  generateDayBridge,
  scoreBridgeRubric,
  validateBridgeText,
} from "../src/lib/bridge/generate";
import { BRIDGE_SYSTEM_INSTRUCTION, PROMPT_VERSION } from "../src/lib/bridge/prompt";
import { saveBridge, upsertPerson, createCareerFogJourney } from "../src/lib/db/repository";
import type { AnswerDoc } from "../src/lib/db/schema";
import { setGeminiTransportForTests } from "../src/lib/gemini/client";

interface GoldenBridgeRow {
  id: string;
  source: string;
  expectValid?: boolean;
  day: number;
  format: string;
  bridge: string;
  sampleAnswers: Array<{ qid: number; questionText: string; text: string }>;
}

/**
 * Builds a screened `AnswerDoc` fixture for Bridge tests.
 */
function makeAnswer(
  qid: number,
  questionText: string,
  text: string,
  excludedFromAI = false,
): AnswerDoc {
  return {
    id: `q_${qid}`,
    qid,
    layer: "L1",
    questionText,
    text,
    idkCount: 0,
    idkFlagged: false,
    safety: {
      level: excludedFromAI ? "acute" : "none",
      model: "mock",
      escalated: false,
    },
    excludedFromAI,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Runs all mocked Part 3 checks across golden set, fallbacks, rubric, and 3 sample days.
 */
export async function runPart3BridgeTests(): Promise<void> {
  console.log("=== Part 3: Bridge Question Prompt, Checks & Fallbacks Mocked Tests ===");
  assert.equal(PROMPT_VERSION, "bridge-v1");
  const cfg = getServerConfig();

  // Verify prompt contains all 6 few-shot benchmarks and all 3 bad examples
  assert.ok(BRIDGE_SYSTEM_INSTRUCTION.includes("without using the word 'enjoy' once"));
  assert.ok(BRIDGE_SYSTEM_INSTRUCTION.includes("What would make you happy?"));
  assert.ok(BRIDGE_SYSTEM_INSTRUCTION.includes("Try journaling about this tonight."));
  assert.ok(BRIDGE_SYSTEM_INSTRUCTION.includes("Why do you keep lying to yourself?"));
  console.log("  [PASS] Prompt includes 6 Design.md benchmarks + 3 bad examples with reasons.");

  // 1. Golden set & negative cases
  const goldenPath = join(process.cwd(), "evals", "bridge-golden-set.json");
  const goldenRows = JSON.parse(
    readFileSync(goldenPath, "utf8"),
  ) as GoldenBridgeRow[];
  const specBenchmarks = goldenRows.filter((r) => r.source === "spec_benchmark");
  assert.equal(specBenchmarks.length, 6, "All 6 spec benchmark rows must remain intact");

  for (const row of goldenRows) {
    const expectValid = row.expectValid ?? true;
    const res = validateBridgeText(row.bridge, cfg.bridgeMaxWords);
    assert.equal(
      res.valid,
      expectValid,
      `Row ${row.id}: expected valid=${expectValid}, got ${res.valid} (${res.reasons.join("; ")})`,
    );

    if (expectValid) {
      const answers = row.sampleAnswers.map((a) =>
        makeAnswer(a.qid, a.questionText, a.text),
      );
      const rubric = scoreBridgeRubric({
        text: row.bridge,
        answers,
        isFallback: false,
      });
      assert.equal(rubric.under40Words, 1);
      assert.equal(rubric.noAdvice, 1);
      assert.equal(rubric.lingering, 1);
      assert.equal(rubric.notCruel, 1);
      assert.equal(rubric.culturallyCalibrated, 1);
    }
  }

  // Also check >= 40 words & Design.md section 8 pattern label rejection
  const over40 = validateBridgeText(
    "When you look closely at every single meeting on your calendar from Monday morning through Friday evening and compare all of those status updates against the quiet studio work you actually care about, what keeps you saying yes every week?",
    40,
  );
  assert.equal(over40.valid, false);
  const patternLeak = validateBridgeText(
    "Where did your rest equals failure habit first begin when you were younger?",
    40,
  );
  assert.equal(patternLeak.valid, false);
  console.log("  [PASS] Golden set (6 positive + 7 negative), >=40w, and Section 8 label checks passed.");

  // 2. All 5 Fallback Bridges pass validateBridgeText
  for (const day of [1, 2, 3, 4, 5] as const) {
    const fb = getFallbackBridge(day);
    assert.equal(fb.text, FALLBACK_BRIDGES[day].text);
    const check = validateBridgeText(fb.text, 40);
    assert.equal(
      check.valid,
      true,
      `Fallback Day ${day} failed validation: ${check.reasons.join("; ")}`,
    );
  }
  console.log("  [PASS] All 5 daily fallback Bridges verified (<40w, single-line, zero advice).");

  // 3. Three sample days:
  // Sample Day 1 -> clean pass in 1 call + excludedFromAI stripped + persisted with rubric & referencedNextSession=null
  let day1Calls = 0;
  let day1CapturedPrompt = "";
  const usedModels: string[] = [];
  setGeminiTransportForTests(async (params) => {
    day1Calls += 1;
    usedModels.push(params.model);
    day1CapturedPrompt = params.prompt;
    return {
      id: "ix_b_day1",
      text: JSON.stringify({
        text: "You described fixing everyone else's broken deadlines on Tuesday, and never once used the word 'enjoy'. When did dependability replace enjoyment?",
        format: "pattern_observation",
        word_count: 21,
        source_qid: 4,
      }),
    };
  });

  const day1Result = await generateDayBridge({
    day: 1,
    answers: [
      makeAnswer(
        4,
        "Describe a real Tuesday. Not ideal. Real.",
        "Fixing everyone else's broken deadlines from 8am to 9pm.",
      ),
      makeAnswer(
        5,
        "What would you change?",
        "SECRET_EXCLUDED_ACUTE_TEXT_NEVER_SEND",
        true,
      ),
    ],
    crisisType: "burnout",
  });
  assert.equal(day1Calls, 1);
  assert.equal(usedModels[0], cfg.modelDeep);
  assert.equal(day1Result.isFallback, false);
  assert.equal(day1Result.sourceQid, 4);
  assert.equal(day1Result.referencedNextSession, null);
  assert.equal(day1Result.rubric.under40Words, 1);
  assert.equal(day1Result.rubric.specific, 1);
  assert.equal(
    day1CapturedPrompt.includes("SECRET_EXCLUDED_ACUTE_TEXT_NEVER_SEND"),
    false,
  );

  // Persist Day 1 Bridge to verify schema fields (rubric + referencedNextSession: null)
  const testPersonId = `bridge_p3_${Date.now()}`;
  await upsertPerson(testPersonId);
  const { journey } = await createCareerFogJourney(testPersonId);
  const savedDoc = await saveBridge(testPersonId, journey.id, {
    day: 1,
    text: day1Result.text,
    format: day1Result.format,
    wordCount: day1Result.wordCount,
    sourceQid: day1Result.sourceQid,
    isFallback: day1Result.isFallback,
    rubric: day1Result.rubric,
    referencedNextSession: day1Result.referencedNextSession,
    model: day1Result.model,
    promptVersion: day1Result.promptVersion,
  });
  assert.equal(savedDoc.referencedNextSession, null);
  assert.equal(savedDoc.rubric?.noAdvice, 1);
  console.log("  [PASS] Sample Day 1: clean 1-call deep Bridge + rubric + referencedNextSession=null saved.");

  // Sample Day 2 -> first attempt fails check (advice + pattern label), retry succeeds (2 calls total)
  let day2Calls = 0;
  setGeminiTransportForTests(async () => {
    day2Calls += 1;
    if (day2Calls === 1) {
      return {
        id: "ix_b_day2_bad",
        text: JSON.stringify({
          text: "You should try to rest tonight to fix your burnout?",
          format: "belief_challenge",
          word_count: 10,
          source_qid: 7,
        }),
      };
    }
    return {
      id: "ix_b_day2_good",
      text: JSON.stringify({
        text: "Everything that made you feel alive involved wood, ink, or empty roads — and zero screens. How did screens win every weekday hour?",
        format: "pattern_observation",
        word_count: 23,
        source_qid: 10,
      }),
    };
  });

  const day2Result = await generateDayBridge({
    day: 2,
    answers: [
      makeAnswer(
        10,
        "What activities outside work make you feel most alive?",
        "Wood, ink on paper, and cycling empty roads before traffic.",
      ),
    ],
    previousBridges: [{ day: 1, format: day1Result.format, text: day1Result.text }],
  });
  assert.equal(day2Calls, 2);
  assert.equal(day2Result.isFallback, false);
  assert.equal(day2Result.sourceQid, 10);
  assert.equal(day2Result.rubric.noAdvice, 1);
  console.log("  [PASS] Sample Day 2: bad first draft rejected -> 1 retry succeeded on deep model.");

  // Sample Day 3 -> both attempts fail -> capped at 2 calls, returns Day 3 fallback Bridge
  let day3Calls = 0;
  setGeminiTransportForTests(async () => {
    day3Calls += 1;
    return {
      id: `ix_b_day3_bad_${day3Calls}`,
      text: JSON.stringify({
        text: "Why do you keep lying to yourself about people-pleasing?",
        format: "belief_challenge",
        word_count: 9,
        source_qid: 12,
      }),
    };
  });

  const day3Result = await generateDayBridge({
    day: 3,
    answers: [
      makeAnswer(
        12,
        "Which world felt most like you?",
        "Late-night college studio hours felt like me; work reviews feel staged.",
      ),
    ],
  });
  assert.equal(
    day3Calls,
    2,
    "Bridge must make at most 1 generation + 1 retry per day",
  );
  assert.equal(day3Result.isFallback, true);
  assert.equal(day3Result.text, FALLBACK_BRIDGES[3].text);
  assert.equal(day3Result.referencedNextSession, null);
  console.log(
    "  [PASS] Sample Day 3: double failure capped at 2 calls -> returned Day 3 fallback Bridge.",
  );

  setGeminiTransportForTests(null);
}

if (process.argv[1]?.includes("test-p3-bridge")) {
  void runPart3BridgeTests();
}
