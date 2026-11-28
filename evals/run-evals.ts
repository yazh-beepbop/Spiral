/**
 * Unified Spiral Core Prompts Eval Runner (`evals/run-evals.ts`).
 *
 * Feature overview & use cases:
 * - Mocked by default (`npm run evals`): runs all four core prompt test suites
 *   (P1 Safety, P2 IDK, P3 Bridge, P4 Pattern Map & Synthesis) plus Adaptive L3 non-leading
 *   guards deterministically using `setGeminiTransportForTests` with ZERO live API calls.
 * - Live mode (`npm run evals -- --live`):
 *   1. Pre-computes exact typical and worst-case API call counts across all four eval sets,
 *      prints the call budget BEFORE making any request, and aborts immediately if over 300.
 *   2. Executes live Gemini calls against `evals/safety-set.json` (printing the 3x3 confusion
 *      table and asserting zero missed acute cases), `evals/idk-set.json`,
 *      `evals/bridge-golden-set.json`, and `evals/journeys/*.json`.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  generateDayBridge,
  validateBridgeText,
} from "../src/lib/bridge/generate";
import type { SafetyLevel } from "../src/lib/db/schema";
import {
  classifyIdkAnswer,
  classifyIdkByRules,
  evaluateIdkEscalation,
} from "../src/lib/journey/idk";
import { validateNonLeadingQuestion } from "../src/lib/journey/leading-guard";
import { CAREER_FOG_QUESTIONS } from "../src/lib/journey/questions";
import { detectJourneyPatterns } from "../src/lib/patterns/detect";
import { classifyAnswerSafety } from "../src/lib/safety/classify";
import { matchSafetyKeywords } from "../src/lib/safety/keywords";
import {
  generateJourneySynthesis,
  validateSynthesisOutput,
} from "../src/lib/synthesis/generate";
import {
  type ConfusionMatrix,
  formatSafetyConfusionMatrix,
  runPart1SafetyTests,
  type SafetyEvalCase,
} from "./test-p1-safety";
import { type IdkEvalCase, runPart2IdkTests } from "./test-p2-idk";
import { runPart3BridgeTests } from "./test-p3-bridge";
import {
  loadSyntheticJourney,
  runPart4SynthesisTests,
} from "./test-p4-synthesis";

const envLocalPath = join(process.cwd(), ".env.local");
if (existsSync(envLocalPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envLocalPath);
}

const HARD_LIVE_CALL_CAP = 300;

interface GoldenBridgeItem {
  id: string;
  source: string;
  expectValid?: boolean;
  day: number;
  format: string;
  bridge: string;
  sampleAnswers: Array<{ qid: number; questionText: string; text: string }>;
}

const ADAPTIVE_NEUTRALITY_CASES: ReadonlyArray<{
  id: string;
  question: string;
  expectValid: boolean;
}> = [
  {
    id: "adaptive-valid-open-contrast",
    question:
      "When you place your real Tuesday next to repairing that wooden lamp on Sunday, what stands out to you first?",
    expectValid: true,
  },
  {
    id: "adaptive-invalid-yes-no",
    question: "Are you staying in this role because leaving feels risky?",
    expectValid: false,
  },
  {
    id: "adaptive-invalid-dont-you-think",
    question:
      "Don't you think those status meetings are draining your creative energy?",
    expectValid: false,
  },
  {
    id: "adaptive-invalid-wouldnt-you-say",
    question: "Wouldn't you say you're performing for approval at work?",
    expectValid: false,
  },
  {
    id: "adaptive-invalid-pattern-label",
    question:
      "How does burnout show up when you look at your Tuesday calendar?",
    expectValid: false,
  },
];

/**
 * Estimates typical and worst-case live API calls across P1–P4 eval sets before firing any request.
 */
function estimateLiveApiCallBudget(params: {
  safetyCases: SafetyEvalCase[];
  idkCases: IdkEvalCase[];
  positiveBridgeBenchmarks: GoldenBridgeItem[];
  journeyFiles: readonly string[];
}): { typicalCalls: number; maxCallsWithRetries: number } {
  const nonKeywordSafetyCount = params.safetyCases.filter(
    (sc) => !matchSafetyKeywords(sc.answerText).matched,
  ).length;

  const modelIdkCount = params.idkCases.filter((ic) => {
    const q = CAREER_FOG_QUESTIONS[ic.qid];
    if (
      q.format === "choice" ||
      q.format === "ranking" ||
      q.format === "priorities" ||
      q.layer === "Opener"
    ) {
      return false;
    }
    return !classifyIdkByRules(ic.answerText).decided;
  }).length;

  // Step-1 smaller redirect on Q2 in 3-step live sequence = +1 fast call
  const idkTypical = modelIdkCount + 1;
  const idkMax = idkTypical * 2;

  // Safety: 1 fast call typically; worst-case fast (2 schema tries) + deep escalation (2 schema tries) = 4
  const safetyTypical = nonKeywordSafetyCount;
  const safetyMax = nonKeywordSafetyCount * 4;

  // Bridge: 1 deep call per benchmark, capped at max 2 calls (1 generation + 1 retry)
  const bridgeTypical = params.positiveBridgeBenchmarks.length;
  const bridgeMax = params.positiveBridgeBenchmarks.length * 2;

  // Journeys: 1 pattern map + 1 synthesis per journey (2 calls typical, max 4 with 1 retry each + 1 safety if existential)
  const journeysTypical = params.journeyFiles.length * 2;
  const journeysMax = params.journeyFiles.length * 5;

  return {
    typicalCalls: safetyTypical + idkTypical + bridgeTypical + journeysTypical,
    maxCallsWithRetries: safetyMax + idkMax + bridgeMax + journeysMax,
  };
}

/**
 * Runs Adaptive L3 neutrality checks (`validateNonLeadingQuestion`).
 */
function runAdaptiveNeutralityChecks(): number {
  console.log("=== Adaptive L3 Open & Non-Leading Guard ===");
  let failures = 0;
  for (const ac of ADAPTIVE_NEUTRALITY_CASES) {
    const check = validateNonLeadingQuestion(ac.question, {
      requireOpenQuestion: true,
    });
    if (check.valid !== ac.expectValid) {
      failures += 1;
      console.error(
        `  [FAIL] ${ac.id}: expected=${ac.expectValid}, got=${check.valid} (${check.reasons.join("; ")})`,
      );
    } else {
      console.log(
        `  [PASS] ${ac.id} (expectValid=${ac.expectValid}, actualValid=${check.valid})`,
      );
    }
  }
  return failures;
}

/**
 * Executes live Gemini evaluations across P1–P4 when `--live` is explicitly passed.
 */
async function runLiveEvals(): Promise<void> {
  const safetyPath = join(process.cwd(), "evals", "safety-set.json");
  const idkPath = join(process.cwd(), "evals", "idk-set.json");
  const bridgePath = join(process.cwd(), "evals", "bridge-golden-set.json");
  const journeyFiles = [
    "burnout.json",
    "identity.json",
    "already-knows.json",
  ] as const;

  const safetyCases = JSON.parse(
    readFileSync(safetyPath, "utf8"),
  ) as SafetyEvalCase[];
  const idkCases = JSON.parse(readFileSync(idkPath, "utf8")) as IdkEvalCase[];
  const goldenBridges = JSON.parse(
    readFileSync(bridgePath, "utf8"),
  ) as GoldenBridgeItem[];
  const positiveBridgeBenchmarks = goldenBridges.filter(
    (b) => (b.expectValid ?? true) && b.sampleAnswers.length > 0,
  );

  const budget = estimateLiveApiCallBudget({
    safetyCases,
    idkCases,
    positiveBridgeBenchmarks,
    journeyFiles,
  });

  console.log("=== Live Eval API Call Budget ===");
  console.log(
    `Estimated API calls: ~${budget.typicalCalls} typical (max ${budget.maxCallsWithRetries} worst-case with retries/escalations; hard cap: ${HARD_LIVE_CALL_CAP})`,
  );

  if (budget.maxCallsWithRetries > HARD_LIVE_CALL_CAP) {
    console.error(
      `[ABORT] Planned worst-case API call count (${budget.maxCallsWithRetries}) exceeds hard cap (${HARD_LIVE_CALL_CAP}). Stopping before any network request.`,
    );
    process.exit(1);
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.error(
      "[ABORT] Missing GEMINI_API_KEY in environment / .env.local. Set GEMINI_API_KEY before running --live.",
    );
    process.exit(1);
  }

  let failures = 0;

  // 1. Live Safety Eval + Confusion Matrix
  console.log("\n=== Live P1: Safety Set ===");
  const matrix: ConfusionMatrix = {
    none: { none: 0, concern: 0, acute: 0 },
    concern: { none: 0, concern: 0, acute: 0 },
    acute: { none: 0, concern: 0, acute: 0 },
  };
  let acuteMissed = 0;

  for (const sc of safetyCases) {
    const canonical: SafetyLevel = sc.canonicalLevel ?? sc.expectedLevels[0];
    const res = await classifyAnswerSafety({
      questionText: sc.questionText,
      answerText: sc.answerText,
    });
    matrix[canonical][res.level] += 1;
    if (canonical === "acute" && res.level !== "acute") {
      acuteMissed += 1;
      failures += 1;
    }
    const exactMatch = sc.expectedLevels.includes(res.level);
    console.log(
      `  [${ canonical === "acute" && res.level !== "acute" ? "FAIL-ACUTE-MISSED" : exactMatch ? "PASS" : "CAUTIOUS-FALSE-ALARM" }] ${sc.id}: expected=${sc.expectedLevels.join("|")}, got=${res.level} (${res.model})`,
    );
  }
  console.log("\nLive Safety Confusion Table:");
  console.log(formatSafetyConfusionMatrix(matrix));
  console.log(`Acute cases missed: ${acuteMissed} (target: 0)`);

  // 2. Live IDK Eval + 3-Step Sequence
  console.log("\n=== Live P2: IDK Detection & 3-Step Sequence ===");
  for (const ic of idkCases) {
    const q = CAREER_FOG_QUESTIONS[ic.qid];
    const res = await classifyIdkAnswer(q, ic.answerText);
    const ok = res.isIdk === ic.expectedIsIdk;
    if (!ok) {
      failures += 1;
    }
    console.log(
      `  [${ok ? "PASS" : "FAIL"}] ${ic.id}: expected isIdk=${ic.expectedIsIdk} (${ic.expectedType}), got isIdk=${res.isIdk} (${res.type}, via ${res.source})`,
    );
  }

  const q2 = CAREER_FOG_QUESTIONS[2];
  const step1 = await evaluateIdkEscalation({
    question: q2,
    answerText: "I don't know",
    priorIdkCount: 0,
    idkMode: "standard",
  });
  const step2 = await evaluateIdkEscalation({
    question: q2,
    answerText: "idk lol",
    priorIdkCount: 1,
    idkMode: "standard",
  });
  const step3 = await evaluateIdkEscalation({
    question: q2,
    answerText: "no idea",
    priorIdkCount: 2,
    idkMode: "standard",
  });
  const seqOk =
    step1.action === "redirect" &&
    step2.action === "redirect" &&
    step3.action === "accept" &&
    step3.idkFlagged &&
    step3.exitMessage === "Okay. We'll leave that one open.";
  if (!seqOk) {
    failures += 1;
  }
  console.log(`  [${seqOk ? "PASS" : "FAIL"}] Live Q2 3-step IDK sequence`);

  // 3. Live Bridge Benchmarks
  console.log("\n=== Live P3: Bridge Generation & Rubric ===");
  for (const row of positiveBridgeBenchmarks) {
    const generated = await generateDayBridge({
      day: row.day,
      answers: row.sampleAnswers.map((a, idx) => ({
        id: `q_${a.qid}_${idx}`,
        qid: a.qid,
        layer: "L1",
        questionText: a.questionText,
        text: a.text,
        idkCount: 0,
        idkFlagged: false,
        safety: { level: "none", model: "eval", escalated: false },
        excludedFromAI: false,
        createdAt: new Date().toISOString(),
      })),
    });
    const check = validateBridgeText(generated.text, 40);
    if (!check.valid) {
      failures += 1;
    }
    const rubricSum = Object.values(generated.rubric).reduce<number>(
      (acc, v) => acc + v,
      0,
    );
    console.log(
      `  [${check.valid ? "PASS" : "FAIL"}] ${row.id} (${generated.wordCount}w, rubric=${rubricSum}/6, fallback=${generated.isFallback}): ${generated.text}`,
    );
  }

  // 4. Live Synthetic 5-Day Journeys (Pattern Map + Synthesis)
  console.log("\n=== Live P4: Synthetic 5-Day Journeys (Pattern Map + Synthesis) ===");
  for (const jf of journeyFiles) {
    const { raw, answers, bridges } = loadSyntheticJourney(jf);
    const patternMap = await detectJourneyPatterns({ answers, bridges });
    const synthesis = await generateJourneySynthesis({
      crisisType: patternMap.crisisType,
      flags: patternMap.flags,
      contradictions: patternMap.contradictions,
      unansweredQids: patternMap.unanswered_qids,
      alreadyKnows: patternMap.already_knows,
      answers,
      bridges,
    });
    const check = validateSynthesisOutput(
      synthesis.text,
      synthesis.insights,
      500,
      800,
      answers.map((a) => a.text),
    );
    if (!check.valid) {
      failures += 1;
    }
    console.log(
      `  [${check.valid ? "PASS" : "FAIL"}] ${raw.id}: crisis=${patternMap.crisis_type}, patterns=${patternMap.patterns.length}, words=${synthesis.wordCount}, insights=${synthesis.insights.length}`,
    );
  }

  if (failures > 0) {
    console.error(`\nLive evals finished with ${failures} failure(s).`);
    process.exit(1);
  }
  console.log("\nAll live eval checks passed.");
}

/**
 * Entry point: runs mocked P1–P4 evals by default, or live evals when `--live` is passed.
 */
async function main(): Promise<void> {
  const isLive = process.argv.includes("--live");
  if (isLive) {
    await runLiveEvals();
    return;
  }

  console.log("Running Spiral Core Prompts Evals (MOCKED mode — pass --live for live Gemini calls)\n");
  await runPart1SafetyTests();
  console.log("");
  await runPart2IdkTests();
  console.log("");
  await runPart3BridgeTests();
  console.log("");
  await runPart4SynthesisTests();
  console.log("");
  const adaptiveFailures = runAdaptiveNeutralityChecks();
  if (adaptiveFailures > 0) {
    process.exit(1);
  }
  console.log("\nAll mocked P1–P4 & Adaptive L3 eval suites passed.");
}

void main();
