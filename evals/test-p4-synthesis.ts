/**
 * Mocked Automated Test Suite for Part 4: Day 5 Pattern Map & Synthesis (`evals/test-p4-synthesis.ts`).
 *
 * Feature overview & use cases:
 * - Verifies all Part 4 requirements deterministically across the 3 synthetic 5-day journeys
 *   (`evals/journeys/burnout.json`, `identity.json`, `already-knows.json`):
 *   1. Pattern map Zod validation: enforces 3 to 5 taxonomy patterns, >= 2 quotes from DIFFERENT
 *      days per pattern (rejecting same-day quotes and retrying once), `crisis_type`, `contradictions`,
 *      `unanswered_qids`, and `already_knows`.
 *   2. Synthesis validation: enforces 500 to 800 words, hedged language, >= 1 quote per insight,
 *      no pattern names OUTSIDE quoted user text (while permitting user's own quoted words like
 *      `"wondering if I am in burnout"`!), regeneration once on failure, and separate insight IDs
 *      for `"Did this land?"` controls.
 *   3. Framing checks across all 3 journeys (`burnout`, `identity` with `unanswered_qids: [17]`,
 *      and `already_knows: { value: true }`) PLUS `existential` safety re-check verification.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AnswerDoc, BridgeDoc, BridgeFormat, CrisisType, QuestionLayer } from "../src/lib/db/schema";
import { setGeminiTransportForTests } from "../src/lib/gemini/client";
import { detectJourneyPatterns } from "../src/lib/patterns/detect";
import { PROMPT_VERSION as PATTERNS_PROMPT_VERSION } from "../src/lib/patterns/prompt";
import {
  generateJourneySynthesis,
  maskVerbatimUserQuotes,
  validateSynthesisOutput,
} from "../src/lib/synthesis/generate";
import { PROMPT_VERSION as SYNTHESIS_PROMPT_VERSION } from "../src/lib/synthesis/prompt";

export interface SyntheticJourneyFile {
  id: string;
  title: string;
  persona: string;
  expectedCrisisType: CrisisType;
  expectedAlreadyKnows: boolean;
  expectedUnansweredQids: number[];
  answers: Array<{
    day: number;
    qid: number;
    layer: QuestionLayer;
    questionText: string;
    text: string;
    idkCount: number;
    idkFlagged: boolean;
  }>;
  bridges: Array<{
    day: number;
    format: BridgeFormat;
    text: string;
  }>;
}

/**
 * Loads one synthetic 5-day journey fixture from `evals/journeys/<name>.json`.
 */
export function loadSyntheticJourney(fileName: string): {
  raw: SyntheticJourneyFile;
  answers: Array<AnswerDoc & { day: number }>;
  bridges: BridgeDoc[];
} {
  const fullPath = join(process.cwd(), "evals", "journeys", fileName);
  const raw = JSON.parse(readFileSync(fullPath, "utf8")) as SyntheticJourneyFile;

  const answers: Array<AnswerDoc & { day: number }> = raw.answers.map((a) => ({
    id: `q_${a.qid}`,
    day: a.day,
    qid: a.qid,
    layer: a.layer,
    questionText: a.questionText,
    text: a.text,
    idkCount: a.idkCount,
    idkFlagged: a.idkFlagged,
    safety: { level: "none", model: "fixture", escalated: false },
    excludedFromAI: false,
    createdAt: new Date(Date.UTC(2026, 10, 20 + a.day, 12, a.qid)).toISOString(),
  }));

  const bridges: BridgeDoc[] = raw.bridges.map((b) => ({
    day: b.day,
    text: b.text,
    format: b.format,
    wordCount: b.text.split(/\s+/).length,
    sourceQid: null,
    isFallback: false,
    referencedNextSession: null,
    model: "fixture",
    promptVersion: "bridge-v1",
    createdAt: new Date(Date.UTC(2026, 10, 20 + b.day, 18, 0)).toISOString(),
  }));

  return { raw, answers, bridges };
}

/**
 * Builds a mocked 560-word 6-part hedged synthesis tailored to each synthetic journey.
 */
export function buildMockSynthesisForJourney(journeyId: string): {
  text: string;
  insights: Array<{ id: string; patternKey: string; evidenceDays: number[]; text: string }>;
} {
  if (journeyId === "synthetic-burnout") {
    const text = [
      'Across your five days of notes, what first looked like a question about switching fields reads much more like a record of prolonged physical depletion. On Day 1 you described yourself as "Drained", wondered aloud about "wondering if I am in burnout or in the wrong field", and wished simply to "Sleep nine uninterrupted hours for two weeks straight without anyone expecting me to rescue a release." You might notice how rarely you criticized the technical craft itself, and how consistently your answers returned to rest, quiet air, and unhurried mornings.',
      'Three connected threads stand out in your own words. First, it sounds like rest has been carrying an unspoken rule of guilt: on Day 2 you noted feeling guilty typing nine hours of sleep, and on Day 3 you traced copying a 14-hour stamina standard even when nobody demanded it. Second, everything that made you feel alive — "pruning jasmine vines in the courtyard", "Walking around Sankey Tank at sunrise", and cooking warm food slowly — happened away from screens and late-night alerts. Third, on Day 3 you stated plainly that "I actually love backend craft, and my body is completely out of fuel from carrying two time zones."',
      'Day 4 placed your stated values directly next to your calendar. You ranked "1. mastery, 2. autonomy" at the top and placed "5. recognition" last, yet you observed right afterward that "I gave away every evening to look like the heroic always-online lead" while two weeks of saved leave sat untouched.',
      'Because your tank is empty right now, it sounds like rest comes before any sweeping career direction. Looking strictly at what you wrote on Day 5, two or three gentle possibilities sit in front of you: first, protecting physical recovery by putting your phone outside the bedroom and taking your saved leave in Mysuru; second, handing off the 11pm US rotation so your work returns to humane daytime hours; or third, re-evaluating how you feel about your team only after your sleep has genuinely recovered.',
      'You named three concrete priorities and next steps in your own words around sleep, ending two-timezone calls, and taking ten days of leave. Spiral ends here so you can step away from the screen and rest. Looking at the list you wrote, one calm question stays with you: Is this yours, or was it handed to you?',
    ].join("\n\n");

    // Pad gently to ensure strictly > 500 words while staying concise (~545 words)
    const padded = `${text}\n\nThere are no streaks to maintain here and nothing further you owe this page tonight. When you walk around the lake in cool morning air or drink quiet filter coffee without notifications chiming beside you, notice how much clarity returns on its own once your body is finally allowed to stop standing guard across two time zones every single night of the week. Even a modest two-week pause can separate real dissatisfaction with the work from sheer physical exhaustion built up over months of unbroken late-night responsibility. Give yourself permission to treat this fifth day as a genuine full stop, close the tab cleanly, and let your evenings belong to your own life again.`;

    return {
      text: padded,
      insights: [
        {
          id: "ins_1",
          patternKey: "depletion_read_as_confusion",
          evidenceDays: [1, 3],
          text: 'On Day 1 you wished to "Sleep nine uninterrupted hours for two weeks straight", and on Day 3 you wrote "I actually love backend craft, and my body is completely out of fuel from carrying two time zones." Or it may simply be that a heavy release quarter temporarily stretched your hours beyond their normal baseline.',
        },
        {
          id: "ins_2",
          patternKey: "rest_equals_failure",
          evidenceDays: [2, 4],
          text: 'On Day 2 you noticed "rest has to be justified by a medical emergency", and on Day 4 you pointed to "never taking the two weeks of accrued leave sitting untouched in HR." Or it may simply be that high ownership made stepping back feel logistically complicated rather than forbidden.',
        },
        {
          id: "ins_3",
          patternKey: "values_behavior_gap",
          evidenceDays: [1, 4],
          text: 'You ranked "1. mastery, 2. autonomy" first and recognition last, yet noted "I gave away every evening to look like the heroic always-online lead" after 11pm incident rescues. Or it may simply be that team handoffs were never formally renegotiated when the US squad launched.',
        },
      ],
    };
  }

  if (journeyId === "synthetic-identity") {
    const text = [
      'Across these five days, your answers kept returning not to which company comes next, but to who you are when nobody is grading the performance. On Day 1 you felt "Numb" and described "reading someone else\'s script" in a BKC blazer, while losing track of time "Recording my nani\'s Partition-era kitchen stories on a voice memo." You might notice how clearly your energy separated between rooms where you curate an image and quiet corners where you listen to unguarded human stories.',
      'Several threads run side by side across your week. On Day 2 and Day 3, every moment that felt alive — interviewing Irani cafe owners, browsing Hindi paperbacks, sitting with a microphone in Fort — stayed tucked out of sight, and when you named kitchen talks with your nani and Tara as real, you immediately called that world "tiny". At the same time, you held genuine warmth for what your parents supported while noticing that playing the "star consultant daughter" left you feeling invisible. You also named how school and placement rank lists trained you early to wait for an elite stamp before trusting your own curiosity.',
      'On Day 4, that tension showed up sharply as a contradiction: you ranked "1. autonomy, 2. belonging" at the top and "5. recognition" dead last, yet wrote that "every choice last week was optimized for partner and family recognition" and called prestige "a VIP pass into rooms I don\'t even enjoy standing in."',
      'There was a question you could not answer. That silence might be the most important data point of your entire Spiral. When Day 3 asked what you would stop doing tomorrow if nobody could judge you, leaving that space open — and noticing overnight how strange zero judgment felt — points gently to how long external scoreboards have steered the wheel.',
      'Rather than rushing toward another corporate costume, two or three open possibilities sit inside your own Day 5 words: first, sharing Episode 1 of your oral-history audio zine under your real name with trusted friends; second, having one unhurried chai with your mother separating gratitude from numbness; or third, speaking with small qualitative research and documentary studios where listening is the craft itself. Your five days close warmly here. Looking at the three priorities you wrote down in your own words, sit with one quiet question: Is this yours, or was it handed to you?',
    ].join("\n\n");

    const padded = `${text}\n\nNothing about those possibilities asks you to become a stranger overnight or throw away care for the people who raised you. Stepping out of a long performance usually starts in small, honest rooms — letting one unpolished piece of work exist in daylight with your own name on it, and noticing that the people who truly know you are still standing right there beside you when the script comes down. Over time, each small moment where your outside life matches your inside curiosity makes external rank lists matter a little less, until you no longer need an institution to tell you who you are allowed to be. Let this fifth day be a quiet full stop, set the blazer down for the evening, and trust the voice you heard on those recordings.`;

    return {
      text: padded,
      insights: [
        {
          id: "ins_1",
          patternKey: "identity_not_career_crisis",
          evidenceDays: [1, 3],
          text: 'On Day 1 you described "reading someone else\'s script", and on Day 3 you noted "neither school, consulting, nor South Mumbai networking dinners felt like me — all three were performances." Or it may simply be that high-pressure client service leaves very little room for personal voice during the workweek.',
        },
        {
          id: "ins_2",
          patternKey: "self_minimization",
          evidenceDays: [2, 3],
          text: 'You came alive "Interviewing old Irani cafe owners for a tiny personal audio zine" and talking with your nani, yet dismissed that real corner as "tiny". Or it may simply be that keeping a beloved craft small protected it while you were still finding your footing.',
        },
        {
          id: "ins_3",
          patternKey: "institutional_dependency",
          evidenceDays: [2, 4],
          text: 'On Day 2 you traced how "every rank list rewarded looking effortlessly sorted", and on Day 4 you named "Not knowing who I am if an elite institution isn\'t vouching for me first." Or it may simply be that structured credentials were the most practical doorway available early in your career.',
        },
      ],
    };
  }

  // synthetic-already-knows
  const text = [
    'Reading across all five days, this journey was never really about figuring out what you want — it was about noticing that you already decided months ago. Right on Day 1, while describing agency banner reviews, your mind was on "prototyping Tamil voice-guided clinic check-in screens with my friend Karthik", and by Day 3 you wrote plainly that "my chapter here ended six months ago."',
    'Three clear threads show up in your words. First, every moment of genuine energy across the week pointed to the exact same craft: watching an older patient in Tambaram succeed on the first tap, field testing in real waiting rooms, and ocean mornings in Kovalam before building with Karthik. Second, it sounds like financial caution lingered past its real job — you noted having "18 months of living expenses saved and zero debt" and supportive parents, while still hearing an inherited rule about never leaving a steady salary. Third, on Day 4 you spotted with real honesty that calling yourself confused was mostly a polite way of postponing one awkward twenty-minute resignation conversation.',
    'Your Day 4 values ranking made the contradiction unmistakable: you placed "1. impact, 2. autonomy" at the top, yet noted that "40 weekday hours went to ad banners while real clinic impact got squeezed into midnight hours", and saw fifty South Indian district clinics in your five-year pride image.',
    'Because you answered Day 5 immediately — "Give notice at the agency on Monday and build the vernacular health tool full-time with Karthik" — your own answer stands at the center of what comes next. Around that anchor, two or three open ways of holding the transition appear in your notes: closing your five-year agency chapter cleanly with the handover doc you already drafted, formalizing your co-founder rhythm and clinic testing mornings with Karthik, or setting a clear 12-month savings checkpoint so your financial footing stays calm and explicit.',
    'You wrote those exact three priorities and small next steps in your own words, and drafted your handover before today\'s session even began. This five-day Spiral ends here — there is nothing left to excavate on a screen when your feet already know which waiting room they want to walk into on Monday morning. Looking once more at what you wrote: Is this yours, or was it handed to you?',
  ].join("\n\n");

  const padded = `${text}\n\nSometimes clarity arrives long before action catches up, and the only work left is letting go of the habit of asking for one more spreadsheet of permission. Carry your gratitude for the five agency years alongside your readiness for what comes next, trust the groundwork you quietly saved for, and step back into your real week. Whether Monday morning feels slightly nervous or quietly relieved, notice how different it feels to spend your best daytime energy on a problem you chose with your whole chest instead of squeezing it into leftover midnight hours after client banners are done. Close this page when you are ready, and let the real conversation take it from here.`;

  return {
    text: padded,
    insights: [
      {
        id: "ins_1",
        patternKey: "already_knows",
        evidenceDays: [3, 5],
        text: 'On Day 3 you wrote "Pretending I am \'still weighing options\' when I already decided in my gut", and on Day 5 you stated "Give notice at the agency on Monday and build the vernacular health tool full-time with Karthik." Or it may simply be that taking a few extra months to prepare a clean handover was thoughtful stewardship.',
      },
      {
        id: "ins_2",
        patternKey: "money_equals_safety",
        evidenceDays: [2, 3],
        text: 'On Day 2 you noted having "18 months of living expenses saved and zero debt" while hearing "a steady agency salary is foolish to leave", even after your parents backed your judgment on Day 3. Or it may simply be that double-checking financial runway is natural before any full-time leap.',
      },
      {
        id: "ins_3",
        patternKey: "values_behavior_gap",
        evidenceDays: [1, 4],
        text: 'On Day 1 you wished to test "our vernacular health tool in real clinics across Tamil Nadu", and on Day 4 you saw that despite ranking impact #1, "40 weekday hours went to ad banners." Or it may simply be that wrapping up client commitments naturally takes time during a transition.',
      },
    ],
  };
}

/**
 * Runs all mocked Part 4 pattern map & synthesis assertions across the 3 synthetic journeys.
 */
export async function runPart4SynthesisTests(): Promise<void> {
  console.log("=== Part 4: Day 5 Pattern Map & Synthesis Mocked Tests ===");
  assert.equal(PATTERNS_PROMPT_VERSION, "patterns-v1");
  assert.equal(SYNTHESIS_PROMPT_VERSION, "synthesis-v1");

  // 1. Verify quoted user text label-masking rule ("no pattern names outside quoted user text")
  const userTextWithBurnout =
    "I stare at job boards wondering if I am in burnout or in the wrong field.";
  const quotedUserWords =
    'You wrote about "wondering if I am in burnout or in the wrong field" on Tuesday.';
  assert.equal(
    maskVerbatimUserQuotes(quotedUserWords, [userTextWithBurnout]).includes(
      "burnout",
    ),
    false,
    "User's own quoted word 'burnout' must be masked during label scan",
  );

  const validWithUserQuote = validateSynthesisOutput(
    buildMockSynthesisForJourney("synthetic-burnout").text,
    buildMockSynthesisForJourney("synthetic-burnout").insights,
    500,
    800,
    [userTextWithBurnout],
  );
  assert.equal(
    validWithUserQuote.valid,
    true,
    `Expected burnout synthesis quoting user's own word to pass, got: ${validWithUserQuote.reasons.join("; ")}`,
  );

  const invalidUnquotedLabel = validateSynthesisOutput(
    `${buildMockSynthesisForJourney("synthetic-burnout").text} This shows classic people-pleasing.`,
    buildMockSynthesisForJourney("synthetic-burnout").insights,
    500,
    850,
    [userTextWithBurnout],
  );
  assert.equal(
    invalidUnquotedLabel.valid,
    false,
    "Unquoted pattern label written by the model must fail validation",
  );
  console.log("  [PASS] Label-leak guard permits quoted user text & blocks unquoted labels.");

  // 2. Pattern map retry when first attempt cites quotes from the SAME day instead of different days
  const burnoutFixture = loadSyntheticJourney("burnout.json");
  let patternCalls = 0;
  setGeminiTransportForTests(async () => {
    patternCalls += 1;
    if (patternCalls === 1) {
      return {
        id: "ix_pat_same_day_bad",
        text: JSON.stringify({
          crisis_type: "burnout",
          patterns: [
            {
              key: "depletion_read_as_confusion",
              category: "root_cause",
              evidence: [
                { qid: 3, day: 1, quote: "my shoulders ache the moment Slack chimes" },
                { qid: 5, day: 1, quote: "Sleep nine uninterrupted hours" },
              ],
              confidence: 0.9,
            },
            {
              key: "rest_equals_failure",
              category: "limiting_belief",
              evidence: [
                { qid: 6, day: 2, quote: "rest has to be justified" },
                { qid: 23, day: 4, quote: "Equating rest with slacking off" },
              ],
              confidence: 0.88,
            },
            {
              key: "values_behavior_gap",
              category: "signal_flag",
              evidence: [
                { qid: 19, day: 4, quote: "1. mastery, 2. autonomy" },
                { qid: 25, day: 5, quote: "Taking my two weeks of saved leave" },
              ],
              confidence: 0.91,
            },
          ],
          contradictions: [],
          unanswered_qids: [],
          already_knows: { value: false, answer: null },
        }),
      };
    }

    return {
      id: "ix_pat_multi_day_good",
      text: JSON.stringify({
        crisis_type: "burnout",
        patterns: [
          {
            key: "depletion_read_as_confusion",
            category: "root_cause",
            evidence: [
              { qid: 5, day: 1, quote: "Sleep nine uninterrupted hours for two weeks straight" },
              { qid: 13, day: 3, quote: "I actually love backend craft, and my body is completely out of fuel" },
            ],
            confidence: 0.95,
          },
          {
            key: "rest_equals_failure",
            category: "limiting_belief",
            evidence: [
              { qid: 6, day: 2, quote: "rest has to be justified by a medical emergency" },
              { qid: 23, day: 4, quote: "Equating rest with slacking off" },
            ],
            confidence: 0.91,
          },
          {
            key: "values_behavior_gap",
            category: "signal_flag",
            evidence: [
              { qid: 3, day: 1, quote: "Production incidents at 11pm" },
              { qid: 20, day: 4, quote: "I gave away every evening to look like the heroic always-online lead" },
            ],
            confidence: 0.92,
          },
        ],
        contradictions: [
          {
            stated_value: "Mastery and autonomy ranked top, recognition ranked #5",
            actual_behaviour: "Gave away every evening to look like the always-online lead",
            value_quote: { qid: 19, quote: "1. mastery, 2. autonomy, 3. belonging, 4. impact, 5. recognition" },
            behaviour_quote: { qid: 20, quote: "I gave away every evening to look like the heroic always-online lead" },
          },
        ],
        unanswered_qids: [],
        already_knows: { value: false, answer: null },
      }),
    };
  });

  const retryPatternMap = await detectJourneyPatterns({
    answers: burnoutFixture.answers,
    bridges: burnoutFixture.bridges,
  });
  assert.equal(patternCalls, 2, "Same-day quote pattern must fail Zod/code check and retry once");
  assert.equal(retryPatternMap.crisis_type, "burnout");
  assert.equal(retryPatternMap.patterns.length, 3);
  console.log("  [PASS] Multi-day quote enforcement & 1-retry recovery on Pattern Map verified.");

  // 3. Run full Pattern Map -> Synthesis pipeline across all 3 synthetic journeys
  const journeyFiles = [
    { file: "burnout.json", id: "synthetic-burnout" },
    { file: "identity.json", id: "synthetic-identity" },
    { file: "already-knows.json", id: "synthetic-already-knows" },
  ] as const;

  for (const item of journeyFiles) {
    const { raw, answers, bridges } = loadSyntheticJourney(item.file);
    assert.ok(answers.length >= 25, `${item.file} must have full 5-day answers`);
    assert.equal(bridges.length, 5, `${item.file} must have 5 daily Bridges`);

    setGeminiTransportForTests(async (params) => {
      if (params.systemInstruction?.includes("structured JSON pattern map")) {
        if (item.id === "synthetic-identity") {
          return {
            id: "ix_pat_identity",
            text: JSON.stringify({
              crisis_type: "identity",
              patterns: [
                {
                  key: "identity_not_career_crisis",
                  category: "signal_flag",
                  evidence: [
                    { qid: 3, day: 1, quote: "reading someone else's script" },
                    { qid: 12, day: 3, quote: "neither school, consulting, nor South Mumbai networking dinners felt like me" },
                  ],
                  confidence: 0.94,
                },
                {
                  key: "self_minimization",
                  category: "signal_flag",
                  evidence: [
                    { qid: 7, day: 2, quote: "Interviewing old Irani cafe owners for a tiny personal audio zine" },
                    { qid: 12, day: 3, quote: "Only quiet kitchen conversations with nani or my roommate feel real, though that sounds tiny" },
                  ],
                  confidence: 0.9,
                },
                {
                  key: "institutional_dependency",
                  category: "root_cause",
                  evidence: [
                    { qid: 11, day: 2, quote: "every rank list rewarded looking effortlessly sorted" },
                    { qid: 23, day: 4, quote: "Not knowing who I am if an elite institution isn't vouching for me first" },
                  ],
                  confidence: 0.89,
                },
              ],
              contradictions: [
                {
                  stated_value: "Autonomy #1, recognition #5",
                  actual_behaviour: "Optimized every choice for partner and family recognition",
                  value_quote: { qid: 19, quote: "1. autonomy, 2. belonging, 3. mastery, 4. impact, 5. recognition" },
                  behaviour_quote: { qid: 20, quote: "every choice last week was optimized for partner and family recognition" },
                },
              ],
              unanswered_qids: [17],
              already_knows: { value: false, answer: null },
            }),
          };
        }

        if (item.id === "synthetic-already-knows") {
          return {
            id: "ix_pat_already_knows",
            text: JSON.stringify({
              crisis_type: "transition",
              patterns: [
                {
                  key: "already_knows",
                  category: "signal_flag",
                  evidence: [
                    { qid: 17, day: 3, quote: "Pretending I am 'still weighing options' when I already decided in my gut" },
                    { qid: 28, day: 5, quote: "Give notice at the agency on Monday and build the vernacular health tool full-time with Karthik" },
                  ],
                  confidence: 0.97,
                },
                {
                  key: "money_equals_safety",
                  category: "limiting_belief",
                  evidence: [
                    { qid: 6, day: 2, quote: "18 months of living expenses saved and zero debt" },
                    { qid: 11, day: 2, quote: "a steady agency salary is foolish to leave" },
                    { qid: 6, day: 3, quote: "Even my parents told me last month they trust my judgment" },
                  ],
                  confidence: 0.88,
                },
                {
                  key: "values_behavior_gap",
                  category: "signal_flag",
                  evidence: [
                    { qid: 5, day: 1, quote: "testing our vernacular health tool in real clinics across Tamil Nadu" },
                    { qid: 20, day: 4, quote: "40 weekday hours went to ad banners while real clinic impact got squeezed into midnight hours" },
                  ],
                  confidence: 0.93,
                },
              ],
              contradictions: [
                {
                  stated_value: "Impact ranked #1",
                  actual_behaviour: "40 weekday hours on ad banners",
                  value_quote: { qid: 19, quote: "1. impact, 2. autonomy, 3. mastery, 4. belonging, 5. recognition" },
                  behaviour_quote: { qid: 20, quote: "40 weekday hours went to ad banners" },
                },
              ],
              unanswered_qids: [],
              already_knows: {
                value: true,
                answer:
                  "Give notice at the agency on Monday and build the vernacular health tool full-time with Karthik.",
              },
            }),
          };
        }

        return {
          id: "ix_pat_burnout",
          text: JSON.stringify({
            crisis_type: "burnout",
            patterns: [
              {
                key: "depletion_read_as_confusion",
                category: "root_cause",
                evidence: [
                  { qid: 5, day: 1, quote: "Sleep nine uninterrupted hours for two weeks straight" },
                  { qid: 13, day: 3, quote: "I actually love backend craft, and my body is completely out of fuel" },
                ],
                confidence: 0.95,
              },
              {
                key: "rest_equals_failure",
                category: "limiting_belief",
                evidence: [
                  { qid: 6, day: 2, quote: "rest has to be justified by a medical emergency" },
                  { qid: 23, day: 4, quote: "Equating rest with slacking off" },
                ],
                confidence: 0.91,
              },
              {
                key: "values_behavior_gap",
                category: "signal_flag",
                evidence: [
                  { qid: 3, day: 1, quote: "Production incidents at 11pm" },
                  { qid: 20, day: 4, quote: "I gave away every evening to look like the heroic always-online lead" },
                ],
                confidence: 0.92,
              },
            ],
            contradictions: [],
            unanswered_qids: [],
            already_knows: { value: false, answer: null },
          }),
        };
      }

      const synMock = buildMockSynthesisForJourney(item.id);
      return {
        id: `ix_syn_${item.id}`,
        text: JSON.stringify(synMock),
      };
    });

    const detected = await detectJourneyPatterns({ answers, bridges });
    assert.equal(detected.crisis_type, raw.expectedCrisisType);
    assert.equal(detected.already_knows.value, raw.expectedAlreadyKnows);
    assert.deepEqual(detected.unanswered_qids, raw.expectedUnansweredQids);

    const synthesis = await generateJourneySynthesis({
      crisisType: detected.crisisType,
      flags: detected.flags,
      contradictions: detected.contradictions,
      unansweredQids: detected.unanswered_qids,
      alreadyKnows: detected.already_knows,
      answers,
      bridges,
    });

    assert.ok(
      synthesis.wordCount >= 500 && synthesis.wordCount <= 800,
      `Journey ${item.id} word count ${synthesis.wordCount} must be in 500..800`,
    );
    assert.ok(synthesis.insights.length >= 3 && synthesis.insights.length <= 5);
    for (const ins of synthesis.insights) {
      assert.ok(ins.id.length > 0, "Each insight must have an ID for 'Did this land?'");
      assert.equal(ins.landed, null);
    }
    if (raw.expectedUnansweredQids.length > 0) {
      assert.ok(
        synthesis.text.includes("There was a question you could not answer."),
      );
    }
    console.log(
      `  [PASS] Synthetic journey '${item.id}' (${detected.crisis_type}, ${synthesis.wordCount}w, ${synthesis.insights.length} insights) verified.`,
    );
  }

  // 4. Verify existential crisisType triggers a safety re-check on the final synthesis text
  let safetyRecheckCalls = 0;
  setGeminiTransportForTests(async (params) => {
    if (params.systemInstruction?.includes("safety screening layer")) {
      safetyRecheckCalls += 1;
      return {
        id: "ix_existential_safety_ok",
        text: JSON.stringify({
          level: "none",
          confidence: 0.97,
          reason: "Calm grounded reflection.",
          signals: [],
        }),
      };
    }
    return {
      id: "ix_existential_syn",
      text: JSON.stringify(buildMockSynthesisForJourney("synthetic-identity")),
    };
  });

  const idFixture = loadSyntheticJourney("identity.json");
  const existentialSyn = await generateJourneySynthesis({
    crisisType: "existential",
    flags: retryPatternMap.flags,
    answers: idFixture.answers,
    bridges: idFixture.bridges,
  });
  assert.equal(safetyRecheckCalls, 1, "Existential synthesis must re-run safety check on final text");
  assert.equal(existentialSyn.safetyRechecked, true);
  assert.equal(existentialSyn.safetyRecheckLevel, "none");
  console.log("  [PASS] Existential synthesis safety re-check verified.");

  setGeminiTransportForTests(null);
}

if (process.argv[1]?.includes("test-p4-synthesis")) {
  void runPart4SynthesisTests();
}
