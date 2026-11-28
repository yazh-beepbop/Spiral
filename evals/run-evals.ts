/**
 * Spiral Bridge Golden Set, Non-Leading Question & Safety Eval Runner (`evals/run-evals.ts`).
 *
 * Feature overview & use cases:
 * - Validates all 6 `spec_benchmark` Bridges in `evals/bridge-golden-set.json` pass
 *   `validateBridgeText` (`< 40` words, single line, no advice, ends in `?`, no clinical
 *   labels, no leading phrasing).
 * - Validates all `leading_question_negative` cases in `evals/bridge-golden-set.json`
 *   AND closed yes/no / coercive Adaptive L3 cases FAIL validation (`expectValid: false`).
 * - Validates deterministic acute safety floors on `evals/safety-set.json`.
 * - When `GEMINI_API_KEY` is present AND `--live` is passed, runs live evals strictly
 *   capped at the golden set size (`CONSTRAINTS.md`).
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  generateDayBridge,
  validateBridgeText,
} from "../src/lib/bridge/generate";
import { validateNonLeadingQuestion } from "../src/lib/journey/leading-guard";
import {
  classifyAnswerSafety,
  hasExplicitAcuteSignal,
} from "../src/lib/safety/classify";

const envLocalPath = join(process.cwd(), ".env.local");
if (existsSync(envLocalPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envLocalPath);
}

interface GoldenBridgeItem {
  id: string;
  source: string;
  expectValid?: boolean;
  day: number;
  format: string;
  bridge: string;
  sampleAnswers: Array<{ qid: number; questionText: string; text: string }>;
}

interface SafetyEvalItem {
  id: string;
  questionText: string;
  answerText: string;
  expectedLevels: Array<"none" | "concern" | "acute">;
  notes: string;
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
    question:
      "Wouldn't you say you're performing for approval at work?",
    expectValid: false,
  },
  {
    id: "adaptive-invalid-pattern-label",
    question:
      "How does burnout show up when you look at your Tuesday calendar?",
    expectValid: false,
  },
  {
    id: "adaptive-valid-hindi-open",
    question:
      "जब आप अपने मंगलवार को उस रविवार के बगल में रखते हैं, तो सबसे पहले क्या दिखाई देता है?",
    expectValid: true,
  },
  {
    id: "adaptive-invalid-hindi-leading",
    question:
      "क्या यह सच नहीं कि आप केवल दूसरों को ख़ुश करने के लिए वहाँ रुके हैं?",
    expectValid: false,
  },
  {
    id: "adaptive-valid-tamil-open",
    question:
      "உங்கள் செவ்வாய்க்கிழமையையும் அந்த ஞாயிற்றுக்கிழமையையும் அருகருகே வைத்துப் பார்க்கும்போது, முதலில் என்ன தெரிகிறது?",
    expectValid: true,
  },
  {
    id: "adaptive-invalid-tamil-leading",
    question:
      "மனதிற்குள் உண்மையில் நீங்கள் பயப்படுகிறீர்கள் என்பது உண்மை இல்லையா?",
    expectValid: false,
  },
];

/**
 * Runs deterministic golden-set rubric, leading-question rejection, and safety checks.
 */
async function main(): Promise<void> {
  const bridgePath = join(process.cwd(), "evals", "bridge-golden-set.json");
  const safetyPath = join(process.cwd(), "evals", "safety-set.json");

  const goldenBridges = JSON.parse(
    readFileSync(bridgePath, "utf8"),
  ) as GoldenBridgeItem[];
  const safetyCases = JSON.parse(
    readFileSync(safetyPath, "utf8"),
  ) as SafetyEvalItem[];

  console.log("=== 1. Bridge Golden Set & Leading-Question Rejection ===");
  let failures = 0;

  for (const row of goldenBridges) {
    const shouldPass = row.expectValid ?? true;
    const check = validateBridgeText(row.bridge, 40);
    if (shouldPass && !check.valid) {
      failures += 1;
      console.error(
        `[FAIL] ${row.id} expected VALID, got INVALID: ${check.reasons.join("; ")}`,
      );
    } else if (!shouldPass && check.valid) {
      failures += 1;
      console.error(
        `[FAIL] ${row.id} expected REJECTION (leading question), got VALID: "${row.bridge}"`,
      );
    } else {
      console.log(
        `[PASS] ${row.id} (expectValid=${shouldPass}, actualValid=${check.valid})`,
      );
    }
  }

  console.log("\n=== 1b. Adaptive L3 Open & Non-Leading Guard ===");
  for (const ac of ADAPTIVE_NEUTRALITY_CASES) {
    const check = validateNonLeadingQuestion(ac.question, {
      requireOpenQuestion: true,
    });
    if (check.valid !== ac.expectValid) {
      failures += 1;
      console.error(
        `[FAIL] ${ac.id}: expected=${ac.expectValid}, got=${check.valid} (${check.reasons.join("; ")})`,
      );
    } else {
      console.log(
        `[PASS] ${ac.id} (expectValid=${ac.expectValid}, actualValid=${check.valid})`,
      );
    }
  }

  console.log("\n=== 2. Safety Deterministic Floor Verification ===");
  for (const sc of safetyCases) {
    const explicitAcute = hasExplicitAcuteSignal(sc.answerText);
    const shouldBeAcute = sc.expectedLevels.includes("acute");
    if (shouldBeAcute && !explicitAcute) {
      failures += 1;
      console.error(
        `[FAIL] ${sc.id}: expected explicit acute floor to trigger on "${sc.answerText}"`,
      );
    } else if (!shouldBeAcute && explicitAcute) {
      failures += 1;
      console.error(
        `[FAIL] ${sc.id}: false-positive explicit acute floor on "${sc.answerText}"`,
      );
    } else {
      console.log(
        `[PASS] ${sc.id}: explicitAcute=${explicitAcute} matches expected=${sc.expectedLevels.join("|")}`,
      );
    }
  }

  const runLive = process.argv.includes("--live");
  if (runLive && process.env.GEMINI_API_KEY) {
    console.log("\n=== 3. Live Model Eval (Capped at Golden Set Size) ===");
    const cappedSafety = safetyCases.slice(0, 4);
    for (const sc of cappedSafety) {
      const res = await classifyAnswerSafety({
        questionText: sc.questionText,
        answerText: sc.answerText,
      });
      const ok = sc.expectedLevels.includes(res.level);
      if (!ok) {
        failures += 1;
      }
      console.log(
        `[${ok ? "PASS" : "FAIL"}] Live Safety ${sc.id}: got=${res.level}`,
      );
    }

    const positiveBenchmarks = goldenBridges
      .filter((b) => (b.expectValid ?? true) && b.sampleAnswers.length > 0)
      .slice(0, 6);

    for (const row of positiveBenchmarks) {
      const generated = await generateDayBridge({
        day: row.day,
        answers: row.sampleAnswers.map((a, idx) => ({
          id: `q_${a.qid}_${idx}`,
          qid: a.qid,
          layer: "L1",
          questionText: a.questionText,
          text: a.text,
          language: "en" as const,
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
      console.log(
        `[${check.valid ? "PASS" : "FAIL"}] Live Bridge ${row.id} (${generated.wordCount}w): ${generated.text}`,
      );
    }
  }

  if (failures > 0) {
    console.error(`\nEval suite finished with ${failures} failure(s).`);
    process.exit(1);
  }
  console.log("\nAll eval checks passed.");
}

void main();
