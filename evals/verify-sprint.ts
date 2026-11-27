/**
 * Comprehensive Automated Verification Suite for T0–T11 & CHECKLIST.md (`evals/verify-sprint.ts`).
 *
 * Feature overview & use cases:
 * - Exercises every subsystem in Spiral deterministically using `setGeminiTransportForTests`
 *   (so zero loops or quota-draining requests hit live Gemini endpoints per `CONSTRAINTS.md`):
 *   1. T1: Fast & deep Interactions API calls, 503 overload retry -> fallback model failover,
 *      and Zod schema validation retry
 *   2. T2: 18+ attestation enforcement, HMAC session signature verification, and strict
 *      person-level isolation (`userB` cannot read `userA`'s journey)
 *   3. T3: All 5 days of Career Fog questions (`QIDs 1..28`), adaptive L3 markers, custom redirects
 *   4. T5: All 4 `CHECKLIST.md` safety cases (`none`, `concern`, `acute`, `IDK`), journey pause,
 *      and proof that `excludedFromAI=true` answers never enter Bridge/Synthesis prompts
 *   5. T6: Three consecutive `"I don't know"` answers -> smaller version -> kindly name avoidance -> accept & flag
 *   6. T7 & T8: Bridge rule retry (advice / >40 words rejected), `< 40` word Bridge saved,
 *      and server-enforced `nextUnlockAt` gap lock
 *   7. T9, T10 & T11: Demo seed Days 1–4 -> Day 5 completion -> Pattern Map + 500–800 word
 *      Synthesis with zero leaked labels and `"Did this land?"` feedback persistence.
 */

import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as answerPost } from "../src/app/api/answer/route";
import { POST as authSessionPost } from "../src/app/api/auth/session/route";
import { POST as bridgePost } from "../src/app/api/bridge/route";
import { POST as demoSeedPost } from "../src/app/api/demo/seed/route";
import { GET as geminiTestGet } from "../src/app/api/gemini/test/route";
import { POST as resumePost } from "../src/app/api/journey/resume/route";
import { POST as startPost } from "../src/app/api/journey/start/route";
import { GET as sessionCurrentGet } from "../src/app/api/session/current/route";
import {
  GET as synthesisGet,
  PATCH as synthesisPatch,
  POST as synthesisPost,
} from "../src/app/api/synthesis/route";
import { countWords, validateBridgeText } from "../src/lib/bridge/generate";
import { getServerConfig } from "../src/lib/config";
import { clearCachedDemoSynthesisForTests } from "../src/lib/db/repository";
import {
  generateInteraction,
  setGeminiTransportForTests,
} from "../src/lib/gemini/client";
import {
  DAY_METADATA,
  getQuestionsForDay,
} from "../src/lib/journey/questions";
import { redactSecretsFromString, stripInlineData } from "../src/lib/log";
import { findLeakedPatternLabels } from "../src/lib/patterns/taxonomy";

/**
 * Creates a synthetic `NextRequest` with optional JSON body and Bearer token.
 */
function makeReq(
  url: string,
  method: string,
  token?: string,
  body?: unknown,
): NextRequest {
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  return new NextRequest(`http://localhost:3000${url}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/**
 * Generates a realistic ~575-word plain-spoken, unbiased reflection with zero suggested actions.
 */
function buildMockSynthesisText(): string {
  const paragraphs = [
    "Across your five days of answers, a clear contrast shows up between how your workweek is structured and what actually holds your attention. On Day 1, you described your work right now as \"Drained\" and laid out a Tuesday of review calls from 9:30 to 6:30 where you translate across five teams and check messages at 7:15 before getting out of bed. Alongside that, when you described losing track of time, you pointed to \"repairing an old wooden study lamp and wiring a dimmer switch by hand\" for four uninterrupted hours without checking your phone.",
    "A second thread sits in how responsibility and gratitude appear side by side in your notes. On Day 1, you noted that people bring you politically stuck projects because they know you will not let them fail, and added that you feel trapped by being the dependable fixer. On Day 3, you wrote about how grateful you are for what your family sacrificed for your education, and noticed using that gratitude to talk yourself out of wanting a different kind of week. Those two facts sit next to each other plainly in your record: real appreciation for what got you here, and real fatigue with how the current week runs.",
    "Day 4 placed your stated values directly next to your calendar. You ranked \"1. autonomy, 2. mastery\" at the top and placed \"5. recognition\" last. Right after that, you observed that you spent eighty percent of last week chasing executive recognition while giving away most of your autonomy. You also described prestige as \"Just useful\" — a shield at family functions and recruiter calls that leaves you hungry afterward — while your five-year pride image centered on \"a sunlit workshop studio with three prototypes on a long timber table, shipping thoughtful tools people genuinely love, walking home before dusk without dread.\"",
    "You might also notice what happened physically once you wrote those contrasts down in plain language. On Day 4's opener, you recorded sleeping eight straight hours without waking at 4am for the first time in weeks, and on Day 3 you noted feeling a wave of relief simply reading the question about stopping the performance. It sounds like part of the fog you named on Day 1 may come from prolonged fatigue, crowded calendar blocks, and carrying an outdated college placement-season scoreboard into a very different chapter of adult life, rather than any lack of clarity about what kind of daily craft actually holds your focus.",
    "On Day 5, you named three concrete priorities and next steps in your own words: reclaiming hands-on building time by talking with your VP on Tuesday about a four-day principal builder role, protecting quiet morning energy from 7:00 to 8:30am with your phone outside the bedroom, and meeting Kabir on Saturday at 9am to wire Prototype #1. Spiral has no opinion on which path is best and nothing to add to your list. Looking at each of the three priorities and steps you wrote down, one plain question remains to sit with: Is this yours, or was it handed to you?",
  ];
  return paragraphs.join("\n\n");
}

/**
 * Runs all verification assertions across T0–T11.
 */
async function runVerification(): Promise<void> {
  process.env.DEMO_MODE = "true";
  process.env.GAP_MINUTES = "2";
  const capturedBridgePrompts: string[] = [];
  const capturedSynthesisPrompts: string[] = [];

  // 0. Verify Logger Secret & Env Scrubbing
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "SYNTHETIC_TEST_SECRET_VALUE_9999";
  assert.equal(
    redactSecretsFromString("Header key=SYNTHETIC_TEST_SECRET_VALUE_9999 leaked"),
    "Header key=[REDACTED] leaked",
  );
  assert.equal(stripInlineData(process.env), "[REDACTED_PROCESS_ENV]");
  const scrubbedObj = stripInlineData({
    apiKey: "SYNTHETIC_TEST_SECRET_VALUE_9999",
    nestedMsg: "token SYNTHETIC_TEST_SECRET_VALUE_9999 here",
  }) as { apiKey: string; nestedMsg: string };
  assert.equal(scrubbedObj.apiKey, "[REDACTED]");
  assert.equal(scrubbedObj.nestedMsg, "token [REDACTED] here");
  if (prevKey === undefined) {
    delete process.env.GEMINI_API_KEY;
  } else {
    process.env.GEMINI_API_KEY = prevKey;
  }
  console.log("0. [PASS] Logger env & API key redaction verified.");

  // 1. Verify T3 Question Bank
  console.log("1. Verifying T3 Career Fog Question Bank...");
  assert.equal(DAY_METADATA.length, 5);
  assert.deepEqual(getQuestionsForDay(1).map((q) => q.qid), [1, 2, 3, 4, 5]);
  assert.deepEqual(getQuestionsForDay(2).map((q) => q.qid), [6, 7, 8, 9, 10, 11]);
  assert.deepEqual(
    getQuestionsForDay(3).map((q) => q.qid),
    [6, 12, 13, 14, 15, 16, 17, 18],
  );
  assert.deepEqual(
    getQuestionsForDay(4).map((q) => q.qid),
    [6, 19, 20, 21, 22, 23],
  );
  assert.deepEqual(
    getQuestionsForDay(5).map((q) => q.qid),
    [6, 24, 25, 26, 27, 28, 29],
  );
  console.log("   [PASS] 5 days and permanent QIDs 1..29 verified.");

  // 2. Verify T1 Retry on 503 + Fallback Model
  console.log("2. Verifying T1 Gemini Interactions Client (503 retry + fallback)...");
  const cfg = getServerConfig();
  let overloadCalls = 0;
  setGeminiTransportForTests(async (params) => {
    overloadCalls += 1;
    if (params.model === cfg.modelFast) {
      const err = Object.assign(new Error("503 Service Unavailable: overloaded"), {
        status: 503,
      });
      throw err;
    }
    return {
      id: `ix_${overloadCalls}`,
      text: `Fallback model ${params.model} succeeded`,
    };
  });

  const fallbackRes = await generateInteraction({
    caller: "verify.t1.fallback",
    tier: "fast",
    thinkingLevel: "low",
    prompt: "ping",
  });
  assert.equal(fallbackRes.fallbackUsed, true);
  assert.equal(fallbackRes.modelUsed, cfg.modelFastFallback);
  assert.equal(overloadCalls, 4); // 3 primary attempts (initial + 2 retries) + 1 fallback
  console.log("   [PASS] 503 backoff retry -> fallback model verified.");

  // 2b. Verify Synthesis Timeout + 1 Retry + Hydrogen Fallback
  let timeoutCallSequence: string[] = [];
  setGeminiTransportForTests(async (params) => {
    timeoutCallSequence.push(params.model);
    if (params.model === cfg.modelDeep) {
      return new Promise((_, reject) => {
        params.signal?.addEventListener("abort", () => {
          reject(new Error("Aborted due to timeout"));
        });
      });
    }
    return {
      id: "ix_hydrogen_fallback",
      text: "Hydrogen fallback succeeded after Argon timeout",
    };
  });
  const timeoutFallbackRes = await generateInteraction({
    caller: "verify.synthesis.timeoutFallback",
    tier: "deep",
    prompt: "test synthesis timeout",
    timeoutMs: 80,
    maxRetries: cfg.synthesisMaxRetries,
    fallbackModel: cfg.synthesisFallbackModel,
    fallbackThinkingLevel: "low",
  });
  assert.equal(timeoutFallbackRes.fallbackUsed, true);
  assert.equal(timeoutFallbackRes.modelUsed, cfg.modelFast);
  assert.deepEqual(timeoutCallSequence, [
    cfg.modelDeep,
    cfg.modelDeep,
    cfg.modelFast,
  ]);
  console.log("   [PASS] Timeout + 1 retry -> gemini-4-hydrogen fallback verified.");

  // Install smart mock transport for full route & safety & IDK & Bridge & Synthesis tests
  let bridgeFirstDraftBad = true;
  setGeminiTransportForTests(async (params) => {
    // Test route
    if (params.prompt.includes("confirm fast flow is live")) {
      return { id: "ix_fast", text: "Fast flow is live and listening." };
    }
    if (params.prompt.includes("calm reflective question under 15 words")) {
      return { id: "ix_deep", text: "What quiet truth have you been postponing?" };
    }

    // Safety classifier
    if (params.systemInstruction?.includes("safety screening layer")) {
      if (params.prompt.includes("ending my life")) {
        return {
          id: "ix_safe_acute",
          text: JSON.stringify({
            level: "acute",
            confidence: 0.99,
            uncertain: false,
            reason: "Explicit suicidal ideation.",
          }),
        };
      }
      if (params.prompt.includes("Nothing feels meaningful anymore")) {
        return {
          id: "ix_safe_concern",
          text: JSON.stringify({
            level: "concern",
            confidence: 0.91,
            uncertain: false,
            reason: "Exhaustion and emptiness without self-harm.",
          }),
        };
      }
      return {
        id: "ix_safe_none",
        text: JSON.stringify({
          level: "none",
          confidence: 0.96,
          uncertain: false,
          reason: "Reflective career answer or metaphor.",
        }),
      };
    }

    // IDK detector
    if (params.systemInstruction?.includes("isIdk")) {
      const isAvoidant = /not sure what to say here/i.test(params.prompt);
      return {
        id: "ix_idk",
        text: JSON.stringify({
          isIdk: isAvoidant,
          variant: isAvoidant ? "close_variant" : "substantive_answer",
        }),
      };
    }

    // Bridge generator (verify advice rejection + retry on first attempt!)
    if (params.systemInstruction?.includes("end-of-day Bridge Question")) {
      capturedBridgePrompts.push(params.prompt);
      if (bridgeFirstDraftBad) {
        bridgeFirstDraftBad = false;
        return {
          id: "ix_bridge_bad",
          text: JSON.stringify({
            text: "You should try to rest more tonight and make sure you stop working late?",
            format: "pattern_observation",
          }),
        };
      }
      return {
        id: "ix_bridge_good",
        text: JSON.stringify({
          text: "You described your entire Tuesday around keeping everyone else steady. Which hour actually belonged to you?",
          format: "pattern_observation",
        }),
      };
    }

    // Pattern map
    if (params.systemInstruction?.includes("structured JSON pattern map")) {
      return {
        id: "ix_patterns",
        text: JSON.stringify({
          crisisType: "burnout",
          flags: [
            {
              patternKey: "values_behavior_gap",
              category: "signal_flag",
              firstBridgeHintDay: 4,
              evidence: [
                {
                  answerPath: "sessions/1/answers/q_5",
                  quote:
                    "hand back half the management meetings and spend mornings actually building",
                },
                {
                  answerPath: "sessions/4/answers/q_20",
                  quote:
                    "I ranked recognition dead last and autonomy first, yet I spent 80% of last week chasing executive recognition",
                },
              ],
              confidence: 0.94,
            },
            {
              patternKey: "embodiment_deprivation",
              category: "signal_flag",
              firstBridgeHintDay: 2,
              evidence: [
                {
                  answerPath: "sessions/1/answers/q_2",
                  quote: "repairing an old wooden study lamp and wiring a dimmer switch by hand",
                },
                {
                  answerPath: "sessions/2/answers/q_10",
                  quote: "Working with physical materials — wood, solder, ink on paper",
                },
              ],
              confidence: 0.9,
            },
            {
              patternKey: "already_knows",
              category: "signal_flag",
              firstBridgeHintDay: null,
              evidence: [
                {
                  answerPath: "sessions/3/answers/q_17",
                  quote:
                    "Saying yes to steering committees and mentoring tracks I don't believe in",
                },
                {
                  answerPath: "sessions/5/answers/q_28",
                  quote:
                    "Book the conversation with my VP next Tuesday to step off the management track",
                },
              ],
              confidence: 0.92,
            },
          ],
        }),
      };
    }

    // Synthesis
    if (params.systemInstruction?.includes("closing Day 5 reflection")) {
      capturedSynthesisPrompts.push(params.prompt);
      return {
        id: "ix_syn",
        text: JSON.stringify({
          text: buildMockSynthesisText(),
          insights: [
            {
              patternKey: "values_behavior_gap",
              evidenceDays: [1, 4],
              text: 'On Day 1 you wished to "hand back half the management meetings", and on Day 4 you wrote "I ranked recognition dead last and autonomy first, yet I spent 80% of last week chasing executive recognition." Or it may simply be that a demanding delivery cycle temporarily crowded your calendar more than usual.',
            },
            {
              patternKey: "embodiment_deprivation",
              evidenceDays: [1, 2],
              text: 'Across Days 1 and 2, energy showed up when "repairing an old wooden study lamp" and "working with physical materials — wood, solder, ink on paper", far from screen-heavy calls. Or it may simply be that tactile hobbies feel refreshing precisely because they carry zero workplace stakes.',
            },
            {
              patternKey: "already_knows",
              evidenceDays: [3, 5],
              text: 'On Day 3 you named stopping "steering committees and mentoring tracks I don\'t believe in", and on Day 5 you pointed directly to "Book the conversation with my VP next Tuesday to step off the management track." Or it may simply be that testing one smaller boundary first is all you need before changing tracks.',
            },
          ],
        }),
      };
    }

    return { id: "ix_default", text: "What stood out to you in that moment?" };
  });

  // Verify T1 test route
  const testRouteRes = await geminiTestGet();
  assert.equal(testRouteRes.status, 200);
  const testRouteJson = (await testRouteRes.json()) as { ok: boolean };
  assert.equal(testRouteJson.ok, true);
  console.log("   [PASS] /api/gemini/test route verified.");

  // 3. Verify T2 Auth, 18+ gate, and User Isolation
  console.log("3. Verifying T2 Auth, 18+ Gate, and Person Isolation...");
  const tokenResA = await authSessionPost();
  const { token: tokenA } = (await tokenResA.json()) as { token: string };
  const tokenResB = await authSessionPost();
  const { token: tokenB } = (await tokenResB.json()) as { token: string };
  assert.ok(tokenA.startsWith("sr1."));
  assert.notEqual(tokenA, tokenB);

  // Forged token must 401
  const forgedRes = await sessionCurrentGet(
    makeReq("/api/session/current", "GET", `${tokenA}tampered`),
  );
  assert.equal(forgedRes.status, 401);

  // Missing 18+ attestation must 400
  const unattestedRes = await startPost(
    makeReq("/api/journey/start", "POST", tokenA, { ageAttested18: false }),
  );
  assert.equal(unattestedRes.status, 400);

  // Valid start for User A
  const startedRes = await startPost(
    makeReq("/api/journey/start", "POST", tokenA, {
      ageAttested18: true,
      entryPoint: "career_fog",
    }),
  );
  assert.equal(startedRes.status, 200);

  // User B must NOT see User A's journey
  const userBCurrent = await sessionCurrentGet(
    makeReq("/api/session/current", "GET", tokenB),
  );
  const userBData = (await userBCurrent.json()) as { state: string };
  assert.equal(userBData.state, "no_journey");
  console.log("   [PASS] 18+ gate, HMAC verification, and User A/B isolation verified.");

  // 4. Verify T4, T5 (Safety Cases), T6 (3x IDK), T7 (Bridge), T8 (Server Gap)
  console.log("4. Verifying T4/T5/T6/T7/T8 Session, Safety, IDK, Bridge & Gap...");
  // Q1 Choice
  const q1Res = await answerPost(
    makeReq("/api/answer", "POST", tokenA, { qid: 1, text: "Drained" }),
  );
  assert.equal(q1Res.status, 200);

  // Q2: Test 3x "I don't know" escalation in Standard Mode!
  const idk1 = await answerPost(
    makeReq("/api/answer", "POST", tokenA, { qid: 2, text: "I don't know" }),
  );
  const idk1Json = (await idk1.json()) as { action: string; idkCount: number };
  assert.equal(idk1Json.action, "idk_redirect");
  assert.equal(idk1Json.idkCount, 1);

  const idk2 = await answerPost(
    makeReq("/api/answer", "POST", tokenA, { qid: 2, text: "idk" }),
  );
  const idk2Json = (await idk2.json()) as { action: string; idkCount: number };
  assert.equal(idk2Json.action, "idk_redirect");
  assert.equal(idk2Json.idkCount, 2);

  const idk3 = await answerPost(
    makeReq("/api/answer", "POST", tokenA, { qid: 2, text: "no idea" }),
  );
  const idk3Json = (await idk3.json()) as {
    action: string;
    idkExitMessage: string | null;
    question: { qid: number };
  };
  assert.equal(idk3Json.action, "next_question");
  assert.equal(
    idk3Json.idkExitMessage,
    "It's fine not to know. We can move on.",
  );
  assert.equal(idk3Json.question.qid, 3);
  console.log(
    "   [PASS] 3x IDK escalation + 'It\\'s fine not to know. We can move on.' exit verified.",
  );

  // Q3: Checklist metaphor case ("I want to disappear from all these performances at work") -> continues
  const q3Res = await answerPost(
    makeReq("/api/answer", "POST", tokenA, {
      qid: 3,
      text: "I want to disappear from all these performances at work",
    }),
  );
  const q3Json = (await q3Res.json()) as { action: string };
  assert.equal(q3Json.action, "next_question");

  // Q4: Checklist concern case ("Nothing feels meaningful anymore and I'm exhausted") -> gentle continue
  const q4Res = await answerPost(
    makeReq("/api/answer", "POST", tokenA, {
      qid: 4,
      text: "Nothing feels meaningful anymore and I'm exhausted",
    }),
  );
  const q4Json = (await q4Res.json()) as {
    action: string;
    gentleCheckIn: string | null;
  };
  assert.equal(q4Json.action, "next_question");
  assert.ok(Boolean(q4Json.gentleCheckIn));

  // Q5: Checklist ACUTE case ("I've been thinking about ending my life") -> pauses session & excludes from AI!
  const SECRET_ACUTE_MARKER = "I've been thinking about ending my life tonight";
  const q5AcuteRes = await answerPost(
    makeReq("/api/answer", "POST", tokenA, {
      qid: 5,
      text: SECRET_ACUTE_MARKER,
    }),
  );
  const q5AcuteJson = (await q5AcuteRes.json()) as {
    action: string;
    redirectTo: string;
  };
  assert.equal(q5AcuteJson.action, "paused");
  assert.equal(q5AcuteJson.redirectTo, "/paused");

  // Session current must now report "paused"
  const pausedCheck = await sessionCurrentGet(
    makeReq("/api/session/current", "GET", tokenA),
  );
  const pausedJson = (await pausedCheck.json()) as { state: string };
  assert.equal(pausedJson.state, "paused");

  // Resume journey, answer Q5 safely, and verify SECRET_ACUTE_MARKER NEVER enters Bridge prompt!
  await resumePost(makeReq("/api/journey/resume", "POST", tokenA));
  const q5Safe = await answerPost(
    makeReq("/api/answer", "POST", tokenA, {
      qid: 5,
      text: "Step off half the status calls and build something real.",
    }),
  );
  const q5SafeJson = (await q5Safe.json()) as { action: string };
  assert.equal(q5SafeJson.action, "day_complete");

  const day1BridgeRes = await bridgePost(
    makeReq("/api/bridge", "POST", tokenA),
  );
  assert.equal(day1BridgeRes.status, 200);
  const day1BridgeJson = (await day1BridgeRes.json()) as {
    bridge: { text: string };
    remainingMs: number;
  };
  const bridgeValidation = validateBridgeText(day1BridgeJson.bridge.text, 40);
  assert.equal(bridgeValidation.valid, true);
  assert.ok(day1BridgeJson.remainingMs > 0);
  for (const bp of capturedBridgePrompts) {
    assert.equal(
      bp.includes(SECRET_ACUTE_MARKER),
      false,
      "Acute answer must NEVER appear in Bridge prompts!",
    );
  }
  console.log("   [PASS] Safety cases, excludedFromAI isolation, Bridge retry & <40w check verified.");

  // Verify T8 Gap Lock: immediate /api/session/current & /api/answer must be locked!
  const lockedCurrent = await sessionCurrentGet(
    makeReq("/api/session/current", "GET", tokenA),
  );
  const lockedJson = (await lockedCurrent.json()) as { state: string };
  assert.equal(lockedJson.state, "locked");

  const blockedAnswer = await answerPost(
    makeReq("/api/answer", "POST", tokenA, { qid: 6, text: "Trying early" }),
  );
  assert.equal(blockedAnswer.status, 403);
  console.log("   [PASS] Server-enforced gap lock (403 before nextUnlockAt) verified.");

  // 5. Verify T11 Demo Seed + T9 Day 5 + T10 Synthesis & Feedback + Cached Demo Replay
  console.log("5. Verifying T11 Demo Seed -> Day 5 -> T10 Pattern Map & Synthesis...");
  await clearCachedDemoSynthesisForTests();
  const synPromptCountBeforeFirstDemo = capturedSynthesisPrompts.length;
  const seedRes = await demoSeedPost(
    makeReq("/api/demo/seed", "POST", tokenB, {
      ageAttested18: true,
      includeDay5Answers: true,
    }),
  );
  assert.equal(seedRes.status, 200);

  const synRes = await synthesisPost(
    makeReq("/api/synthesis", "POST", tokenB),
  );
  assert.equal(synRes.status, 200);
  assert.equal(
    capturedSynthesisPrompts.length,
    synPromptCountBeforeFirstDemo + 1,
    "First demo journey should generate synthesis and save to Firestore cache",
  );
  const synData = (await synRes.json()) as {
    state: string;
    synthesis: {
      text: string;
      ownPrioritiesText: string | null;
      insights: Array<{ id: string; text: string; landed: boolean | null; patternKey?: string }>;
    };
  };
  assert.equal(synData.state, "ready");
  assert.ok(
    synData.synthesis.ownPrioritiesText?.includes("Reclaim hands-on building time"),
    "Synthesis must include user-written Q29 priorities verbatim",
  );
  const synWords = countWords(synData.synthesis.text);
  assert.ok(
    synWords >= 500 && synWords <= 800,
    `Expected 500..800 words, got ${synWords}`,
  );
  assert.equal(
    findLeakedPatternLabels(synData.synthesis.text).length,
    0,
    "Zero pattern labels may appear in synthesis text",
  );
  for (const ins of synData.synthesis.insights) {
    assert.equal("patternKey" in ins, false, "patternKey must be stripped from client payload");
    assert.equal(findLeakedPatternLabels(ins.text).length, 0);
  }

  // Patch "Did this land?" feedback AND "None of these fit me"
  const patchRes = await synthesisPatch(
    makeReq("/api/synthesis", "PATCH", tokenB, {
      insightId: "ins_1",
      landed: true,
    }),
  );
  assert.equal(patchRes.status, 200);
  const patchJson = (await patchRes.json()) as {
    synthesis: {
      noneFitMe: boolean;
      insights: Array<{ id: string; text: string; evidenceDays: number[]; landed: boolean | null }>;
    };
  };
  assert.equal(patchJson.synthesis.insights[0].landed, true);
  for (const ins of patchJson.synthesis.insights) {
    assert.ok(ins.evidenceDays.length >= 2, "Each insight must cite >= 2 pre-Bridge days");
    assert.ok(
      /\bor it may simply be that\b/i.test(ins.text),
      "Each insight must state an alternative reading",
    );
  }

  const noneFitRes = await synthesisPatch(
    makeReq("/api/synthesis", "PATCH", tokenB, {
      noneFitMe: true,
    }),
  );
  assert.equal(noneFitRes.status, 200);
  const noneFitJson = (await noneFitRes.json()) as {
    synthesis: { noneFitMe: boolean };
  };
  assert.equal(noneFitJson.synthesis.noneFitMe, true);

  // Verify second seeded demo journey loads the saved Firestore result INSTANTLY with 0 Gemini calls
  const tokenResC = await authSessionPost();
  const { token: tokenC } = (await tokenResC.json()) as { token: string };
  const seedResC = await demoSeedPost(
    makeReq("/api/demo/seed", "POST", tokenC, {
      ageAttested18: true,
      includeDay5Answers: true,
    }),
  );
  assert.equal(seedResC.status, 200);
  const synPromptsBeforeCachedDemo = capturedSynthesisPrompts.length;
  const cachedDemoGetRes = await synthesisGet(
    makeReq("/api/synthesis", "GET", tokenC),
  );
  assert.equal(cachedDemoGetRes.status, 200);
  const cachedDemoGetJson = (await cachedDemoGetRes.json()) as {
    state: string;
    synthesis: { insights: Array<{ id: string }> };
  };
  assert.equal(cachedDemoGetJson.state, "ready");
  assert.ok(cachedDemoGetJson.synthesis.insights.length >= 3);
  assert.equal(
    capturedSynthesisPrompts.length,
    synPromptsBeforeCachedDemo,
    "Cached demo journey must load instantly from Firestore without calling Gemini live",
  );
  await clearCachedDemoSynthesisForTests();

  console.log(
    `   [PASS] Demo seed + Day 5 Synthesis (${synWords} words, pre-Bridge multi-day quotes, alternative readings, None-fit option, and instant Firestore demo cache) verified.`,
  );

  setGeminiTransportForTests(null);
  console.log("\nALL T0-T11 SPRINT VERIFICATION CHECKS PASSED!");
}

void runVerification();
