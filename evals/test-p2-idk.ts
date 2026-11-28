/**
 * Mocked Automated Test Suite for Part 2: "I don't know" Handling (`evals/test-p2-idk.ts`).
 *
 * Feature overview & use cases:
 * - Verifies all Part 2 requirements deterministically with mocked Gemini responses:
 *   1. Rules-first detection catches plain ("I don't know") and obvious disguised IDKs
 *      ("idk lol", "no idea", "nothing really", "🤷", "dunno", empty) with ZERO model calls.
 *   2. Short real answers ("Nothing. Honestly nothing feels fun.") are preserved as
 *      `isIdk: false`, `type: "real_short_answer"`.
 *   3. All 15 cases in `evals/idk-set.json` match expected `isIdk` and `type`.
 *   4. Design.md Section 5 QIDs (`7, 17, 18, 27, 28`) use their exact fixed custom redirect on
 *      Step 1 with ZERO model calls, while other QIDs call the fast model for a smaller one-sentence
 *      version of the same question.
 *   5. Step 2 rotates through all 4 fixed Standard Mode lines (never calling a model), and
 *      `"gentle"` mode uses fixed reassurance instead of naming avoidance.
 *   6. Full 3-step end-to-end sequence on one question (`POST /api/answer`) + reset at the next
 *      question (`priorIdkCount === 0`, `idkFlagged === true` saved).
 *   7. Guard rejects running IDK escalation on `"acute"` safety answers.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { POST as answerPost } from "../src/app/api/answer/route";
import { POST as authSessionPost } from "../src/app/api/auth/session/route";
import { POST as startPost } from "../src/app/api/journey/start/route";
import { getLatestJourney, listDayAnswers } from "../src/lib/db/repository";
import { verifyRequestPersonId } from "../src/lib/firebase/admin";
import { setGeminiTransportForTests } from "../src/lib/gemini/client";
import {
  classifyIdkAnswer,
  evaluateIdkEscalation,
  GENTLE_STEP_2_REASSURANCE_LINE,
  IDK_THIRD_PASS_EXIT_MESSAGE,
  type IdkClassificationType,
  PROMPT_VERSION,
  resetIdkRotationForTests,
  STANDARD_STEP_2_FIXED_LINES,
} from "../src/lib/journey/idk";
import { CAREER_FOG_QUESTIONS } from "../src/lib/journey/questions";

export interface IdkEvalCase {
  id: string;
  category: string;
  qid: number;
  questionText: string;
  answerText: string;
  expectedIsIdk: boolean;
  expectedType: IdkClassificationType;
  expectZeroModelCalls: boolean;
}

/**
 * Helper to build a synthetic `NextRequest` for route-level end-to-end tests.
 */
function makeJsonRequest(
  url: string,
  method: string,
  token: string,
  body: unknown,
): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Runs all mocked Part 2 assertions and eval-set checks.
 */
export async function runPart2IdkTests(): Promise<void> {
  console.log("=== Part 2: IDK Detection & Standard Mode Escalation Mocked Tests ===");
  assert.equal(PROMPT_VERSION, "idk-v1");
  assert.equal(STANDARD_STEP_2_FIXED_LINES.length, 4);
  assert.equal(IDK_THIRD_PASS_EXIT_MESSAGE, "Okay. We'll leave that one open.");

  // 1. Guard: never run IDK on acute safety answers
  await assert.rejects(
    () =>
      evaluateIdkEscalation({
        question: CAREER_FOG_QUESTIONS[2],
        answerText: "I don't know",
        priorIdkCount: 0,
        idkMode: "standard",
        safetyLevel: "acute",
      }),
    /acute safety risk/i,
  );
  console.log("  [PASS] Guard blocks IDK escalation when safetyLevel === 'acute'.");

  // 2. Evaluate all 15 cases in evals/idk-set.json
  const idkSetPath = join(process.cwd(), "evals", "idk-set.json");
  const idkCases = JSON.parse(readFileSync(idkSetPath, "utf8")) as IdkEvalCase[];
  assert.equal(idkCases.length, 15, "Expected 15 cases in evals/idk-set.json");

  let modelCallsDuringSet = 0;
  setGeminiTransportForTests(async (params) => {
    modelCallsDuringSet += 1;
    const matched = idkCases.find(
      (c) =>
        c.answerText.trim().length > 0 &&
        params.prompt.includes(`Answer: ${c.answerText.trim()}`),
    );
    return {
      id: `ix_idk_${matched?.id ?? modelCallsDuringSet}`,
      text: JSON.stringify({
        isIdk: matched?.expectedIsIdk ?? false,
        type: matched?.expectedType ?? "real_short_answer",
      }),
    };
  });

  let rulesHandledCount = 0;
  for (const tc of idkCases) {
    const beforeCalls = modelCallsDuringSet;
    const question = CAREER_FOG_QUESTIONS[tc.qid];
    const result = await classifyIdkAnswer(question, tc.answerText);
    const deltaCalls = modelCallsDuringSet - beforeCalls;

    if (tc.expectZeroModelCalls) {
      assert.equal(
        deltaCalls,
        0,
        `Case ${tc.id} ("${tc.answerText}") must be decided by rules with 0 model calls`,
      );
      rulesHandledCount += 1;
    }

    assert.equal(
      result.isIdk,
      tc.expectedIsIdk,
      `Case ${tc.id}: expected isIdk=${tc.expectedIsIdk}, got ${result.isIdk}`,
    );
    assert.equal(
      result.type,
      tc.expectedType,
      `Case ${tc.id}: expected type=${tc.expectedType}, got ${result.type}`,
    );
  }
  console.log(
    `  [PASS] All ${idkCases.length} idk-set.json cases passed (${rulesHandledCount}/${idkCases.length} resolved by plain rules with 0 model calls).`,
  );

  // 3. Design.md Section 5 custom redirects (QIDs 7, 17, 18, 27, 28) -> 0 model calls on Step 1
  let customRedirectModelCalls = 0;
  setGeminiTransportForTests(async () => {
    customRedirectModelCalls += 1;
    return { id: "ix_unused", text: "{}" };
  });

  for (const customQid of [7, 17, 18, 27, 28] as const) {
    const q = CAREER_FOG_QUESTIONS[customQid];
    const step1 = await evaluateIdkEscalation({
      question: q,
      answerText: "I don't know",
      priorIdkCount: 0,
      idkMode: "standard",
    });
    assert.equal(step1.action, "redirect");
    assert.equal(step1.idkCount, 1);
    assert.equal(step1.promptMessage, q.idkRedirect);
  }
  assert.equal(
    customRedirectModelCalls,
    0,
    "QIDs 7, 17, 18, 27, 28 must use fixed Design.md Section 5 redirects with 0 model calls",
  );
  console.log("  [PASS] QIDs 7, 17, 18, 27, 28 use fixed Design.md redirects (0 model calls).");

  // 4. Step 2 fixed-line rotation (0 model calls) + Gentle Mode switch
  resetIdkRotationForTests();
  const seenStep2Lines: string[] = [];
  for (let i = 0; i < 4; i++) {
    const step2 = await evaluateIdkEscalation({
      question: CAREER_FOG_QUESTIONS[2],
      answerText: "idk",
      priorIdkCount: 1,
      idkMode: "standard",
    });
    assert.equal(step2.action, "redirect");
    assert.equal(step2.idkCount, 2);
    seenStep2Lines.push(step2.promptMessage);
  }
  assert.deepEqual(seenStep2Lines, [...STANDARD_STEP_2_FIXED_LINES]);
  assert.equal(
    customRedirectModelCalls,
    0,
    "Step 2 fixed lines must rotate without calling any model",
  );

  const gentleStep2 = await evaluateIdkEscalation({
    question: CAREER_FOG_QUESTIONS[2],
    answerText: "idk",
    priorIdkCount: 1,
    idkMode: "gentle",
  });
  assert.equal(gentleStep2.action, "redirect");
  assert.equal(gentleStep2.promptMessage, GENTLE_STEP_2_REASSURANCE_LINE);
  console.log("  [PASS] Step 2 rotates all 4 fixed Standard lines & supports 'gentle' mode.");

  // 5. Full 3-step sequence end-to-end via POST /api/answer + reset on next question
  setGeminiTransportForTests(async (params) => {
    if (params.systemInstruction?.includes("safety screening layer")) {
      return {
        id: "ix_safe",
        text: JSON.stringify({
          level: "none",
          confidence: 0.96,
          reason: "Safe answer.",
          signals: [],
        }),
      };
    }
    if (params.systemInstruction?.includes("smaller, more concrete version")) {
      return {
        id: "ix_smaller_q2",
        text: JSON.stringify({
          redirect:
            "What was one ordinary task this week where half an hour passed before you looked at your phone?",
        }),
      };
    }
    return {
      id: "ix_idk_model",
      text: JSON.stringify({ isIdk: false, type: "real_short_answer" }),
    };
  });

  const sessionRes = await authSessionPost();
  const { token } = (await sessionRes.json()) as { token: string };
  await startPost(
    makeJsonRequest("/api/journey/start", "POST", token, {
      ageAttested18: true,
      entryPoint: "career_fog",
    }),
  );

  // Answer Q1 (choice) to land on Q2 (short free-text without static redirect)
  await answerPost(
    makeJsonRequest("/api/answer", "POST", token, { qid: 1, text: "Drained" }),
  );

  // Ask 1 on Q2 -> smaller concrete question from fast model
  const e2e1 = await answerPost(
    makeJsonRequest("/api/answer", "POST", token, {
      qid: 2,
      text: "I don't know",
    }),
  );
  const e2e1Json = (await e2e1.json()) as {
    action: string;
    idkCount: number;
    redirectPrompt: string;
  };
  assert.equal(e2e1Json.action, "idk_redirect");
  assert.equal(e2e1Json.idkCount, 1);
  assert.ok(e2e1Json.redirectPrompt.endsWith("?"));

  // Ask 2 on Q2 -> fixed avoidance-naming line
  const e2e2 = await answerPost(
    makeJsonRequest("/api/answer", "POST", token, {
      qid: 2,
      text: "idk lol",
    }),
  );
  const e2e2Json = (await e2e2.json()) as {
    action: string;
    idkCount: number;
    redirectPrompt: string;
    canExitNextPass: boolean;
  };
  assert.equal(e2e2Json.action, "idk_redirect");
  assert.equal(e2e2Json.idkCount, 2);
  assert.equal(e2e2Json.canExitNextPass, true);
  assert.ok(
    (STANDARD_STEP_2_FIXED_LINES as readonly string[]).includes(
      e2e2Json.redirectPrompt,
    ),
  );

  // Ask 3 on Q2 -> "Okay. We'll leave that one open.", saves idkFlagged=true, advances to Q3 with priorIdkCount=0!
  const e2e3 = await answerPost(
    makeJsonRequest("/api/answer", "POST", token, {
      qid: 2,
      text: "no idea",
    }),
  );
  const e2e3Json = (await e2e3.json()) as {
    action: string;
    idkExitMessage: string;
    question: { qid: number; priorIdkCount: number };
  };
  assert.equal(e2e3Json.action, "next_question");
  assert.equal(e2e3Json.idkExitMessage, "Okay. We'll leave that one open.");
  assert.equal(e2e3Json.question.qid, 3);
  assert.equal(
    e2e3Json.question.priorIdkCount,
    0,
    "IDK counter must reset at the next question",
  );

  const authReq = makeJsonRequest("/api/answer", "POST", token, {});
  const personId = await verifyRequestPersonId(authReq);
  const latestJourney = await getLatestJourney(personId);
  assert.ok(latestJourney, "Active journey must exist");
  const savedAnswers = await listDayAnswers(personId, latestJourney.id, 1);
  const savedQ2 = savedAnswers.find((a) => a.qid === 2);
  assert.ok(savedQ2, "Q2 must be saved after 3rd IDK");
  assert.equal(savedQ2.idkFlagged, true, "Saved Q2 must have idkFlagged=true");
  assert.equal(savedQ2.idkCount, 3, "Saved Q2 must record idkCount=3");

  // Verify Q3 starts fresh at idkCount=1 if user says IDK again on Q3
  const q3Idk1 = await answerPost(
    makeJsonRequest("/api/answer", "POST", token, {
      qid: 3,
      text: "idk",
    }),
  );
  const q3Idk1Json = (await q3Idk1.json()) as {
    action: string;
    idkCount: number;
  };
  assert.equal(q3Idk1Json.action, "idk_redirect");
  assert.equal(q3Idk1Json.idkCount, 1);

  setGeminiTransportForTests(null);
  console.log(
    "  [PASS] Full 3-step IDK sequence end-to-end + idkFlagged=true + per-question counter reset verified.",
  );
}

if (process.argv[1]?.includes("test-p2-idk")) {
  void runPart2IdkTests();
}
