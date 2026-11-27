/**
 * Demo Journey Seeder for Sprint Presentations (`src/lib/demo/seed.ts`).
 *
 * Feature overview & use cases:
 * - Implements `ROADMAP.md` T11 & `DECISIONS.md` S8:
 *   "A seeded demo journey with Days 1 to 4 filled, so Day 5 synthesis can be shown live."
 * - Populates `persons/{personId}` and a realistic Career Fog journey where Days 1 through 4
 *   (including Openers, Adaptive L3 questions, and all four Bridges) are completed and unlocked,
 *   landing the judge or presenter directly at the start of Day 5 (`currentDay: 5`, `nextUnlockAt: null`)
 *   — or optionally pre-filling Day 5 answers too (`includeDay5Answers: true`) for instant synthesis demos.
 */

import {
  createCareerFogJourney,
  saveAnswer,
  saveBridge,
  updateJourney,
  updateSession,
  upsertPerson,
} from "@/lib/db/repository";
import type { BridgeFormat } from "@/lib/db/schema";
import { CAREER_FOG_QUESTIONS } from "@/lib/journey/questions";
import { logInfo } from "@/lib/log";

interface SeededAnswerEntry {
  day: 1 | 2 | 3 | 4 | 5;
  qid: number;
  questionOverride?: string;
  text: string;
}

const DEMO_ANSWERS: readonly SeededAnswerEntry[] = [
  // Day 1: Surface Mapping
  {
    day: 1,
    qid: 1,
    text: "Drained",
  },
  {
    day: 1,
    qid: 2,
    text: "Two months ago on a rainy Sunday afternoon, repairing an old wooden study lamp and wiring a dimmer switch by hand. Four hours vanished without me checking my phone once.",
  },
  {
    day: 1,
    qid: 3,
    text: "People bring me messy, politically stuck projects right before a deadline because they know I won't let anything fail. I used to feel proud of being the dependable fixer, though lately I mostly feel trapped by it.",
  },
  {
    day: 1,
    qid: 4,
    text: "Alarm at 7:15, read overnight messages before my feet hit the floor. Back-to-back review calls from 9:30 to 6:30 where I translate between five teams. Dinner from a delivery box at my desk, promising myself I'll read, then scrolling until 12:30 too tired to sleep.",
  },
  {
    day: 1,
    qid: 5,
    text: "I would hand back half the management meetings and spend mornings actually building one concrete product from zero with two people I trust.",
  },

  // Day 2: Energy Archaeology
  {
    day: 2,
    qid: 6,
    questionOverride:
      'Welcome back. Yesterday I left you with this: "You described being everyone\'s reliable safety net without mentioning one hour that belongs to you. Who catches things when you step back?" Before we start, did anything surface overnight? Even something small.',
    text: "Walking to get chai this morning I realized nobody actually demanded that I answer messages at 7:15am — I started doing it years ago so nobody could ever call me unprepared.",
  },
  {
    day: 2,
    qid: 7,
    text: "1. Prototyping a tiny hardware timer with my younger cousin during Diwali break. 2. Cooking dinner from scratch for four old friends with zero agenda. 3. Long early-morning cycling rides across empty Bengaluru roads before traffic starts.",
  },
  {
    day: 2,
    qid: 8,
    text: "B is open-ended",
  },
  {
    day: 2,
    qid: 9,
    text: "Sitting with a blank whiteboard and a real user problem before anyone turns it into a 40-slide status tracker.",
  },
  {
    day: 2,
    qid: 10,
    text: "Working with physical materials — wood, solder, ink on paper — anything where my hands move and there isn't a notification badge anywhere near me.",
  },
  {
    day: 2,
    qid: 11,
    questionOverride:
      "Everything that makes you feel alive happens with your hands and an open canvas, while your real Tuesday is ten hours of status slides — when did you trade making things for managing them?",
    text: "When the last promotion came through. My parents were so proud of the title, and I told myself I would still build on weekends, except by Saturday my brain is ash.",
  },

  // Day 3: Identity Excavation
  {
    day: 3,
    qid: 6,
    questionOverride:
      'Welcome back. Yesterday I left you with this: "The things that make you feel most alive are the things you\'ve stopped making time for. What replaced them, and why did you let it?" Before we start, did anything surface overnight? Even something small.',
    text: "I noticed how grateful I am for what my parents sacrificed for my education, and how quickly I use that gratitude to talk myself out of wanting a different kind of week.",
  },
  {
    day: 3,
    qid: 12,
    text: "Late-evening studio lab hours in college felt most like me — messy desk, quiet focus, nobody posturing. Quarterly leadership townhalls at work feel like the biggest performance.",
  },
  {
    day: 3,
    qid: 13,
    text: "I would tell my director and my parents that climbing one rung higher on this ladder looks impressive from the living room, and feels hollow from the inside.",
  },
  {
    day: 3,
    qid: 14,
    text: "On weekdays I dress as the composed, senior person everyone expects in the glass meeting room. Only on Sunday mornings in an old cotton kurta do I feel like myself.",
  },
  {
    day: 3,
    qid: 15,
    text: "My sister Meera and my college lab partner Kabir. Neither of them cares what my job title is, and both can tell within ten seconds when I'm bluffing.",
  },
  {
    day: 3,
    qid: 16,
    questionOverride:
      "You said building things with your hands gives you energy and leadership townhalls feel like a performance. What if you stopped performing?",
    text: "Part of me fears people would think I couldn't handle the big leagues — and a quieter part feels an enormous wave of relief just reading that sentence.",
  },
  {
    day: 3,
    qid: 17,
    text: "Saying yes to steering committees and mentoring tracks I don't believe in just to look like 'executive material'.",
  },
  {
    day: 3,
    qid: 18,
    text: "That rainy Sunday two months ago with the broken study lamp and sawdust on the balcony floor.",
  },

  // Day 4: Values and Contradictions
  {
    day: 4,
    qid: 6,
    questionOverride:
      'Welcome back. Yesterday I left you with this: "You listed the rooms where you perform, then spoke softly about the balcony floor where you felt real. Why does the real room get the leftover hours?" Before we start, did anything surface overnight? Even something small.',
    text: "I slept eight straight hours without waking up at 4am for the first time in weeks. Naming the performance out loud took some strange pressure off my chest.",
  },
  {
    day: 4,
    qid: 19,
    text: "1. autonomy, 2. mastery, 3. impact, 4. belonging, 5. recognition",
  },
  {
    day: 4,
    qid: 20,
    text: "Not at all. I ranked recognition dead last and autonomy first, yet I spent 80% of last week chasing executive recognition and giving away almost all my autonomy.",
  },
  {
    day: 4,
    qid: 21,
    text: "A sunlit workshop studio with three prototypes on a long timber table, shipping thoughtful tools people genuinely love, walking home before dusk without dread.",
  },
  {
    day: 4,
    qid: 22,
    text: "Just useful. It works like a polite shield at family functions and recruiter calls, while leaving me strangely hungry afterward.",
  },
  {
    day: 4,
    qid: 23,
    questionOverride:
      "Your pride image was a sunlit studio shipping craft before dusk, but your trajectory points toward another rung of back-to-back executive reviews. What drives the gap?",
    text: "Waiting for someone official to hand me permission, and confusing a prestigious title with keeping my family safe when our baseline is already secure.",
  },
];

const DEMO_DAY5_OPTIONAL_ANSWERS: readonly SeededAnswerEntry[] = [
  {
    day: 5,
    qid: 6,
    questionOverride:
      'Welcome back. Yesterday I left you with this: "You ranked recognition last, yet built your whole week around earning it. Whose scoreboard are you still playing on?" Before we start, did anything surface overnight? Even something small.',
    text: "It's my 22-year-old placement-season scoreboard. Nobody updated the rules even though my life is completely different now.",
  },
  {
    day: 5,
    qid: 24,
    text: "Designing calm, tactile everyday tools and helping small product teams strip away complexity so they actually ship.",
  },
  {
    day: 5,
    qid: 25,
    text: "Asking to step back into a hands-on principal builder role four days a week — or dedicating Saturdays to shipping one small independent tool with Kabir.",
  },
  {
    day: 5,
    qid: 26,
    text: "Wake at 6:45 without an alarm, filter coffee on the balcony in sunlight, walk twenty minutes to a quiet workspace, and spend 8:00 to 11:00 deep in sketches and code before opening a single message.",
  },
  {
    day: 5,
    qid: 27,
    text: "Betting that ten years of deep craft with a small, honest studio will beat another decade of climbing corporate status ladders.",
  },
  {
    day: 5,
    qid: 28,
    text: "Book the conversation with my VP next Tuesday to step off the management track and block every Saturday morning with Kabir to build our first prototype.",
  },
  {
    day: 5,
    qid: 29,
    text: "1. Priority: Reclaim hands-on building time — Next step: Ask my VP on Tuesday to move to a 4-day principal IC role.\n2. Priority: Protect quiet morning energy — Next step: Leave my phone outside the bedroom and block 7:00 to 8:30am offline.\n3. Priority: Test an independent studio craft — Next step: Meet Kabir this Saturday at 9am to wire Prototype #1.",
  },
];

const DEMO_BRIDGES: ReadonlyArray<{
  day: 1 | 2 | 3 | 4 | 5;
  format: BridgeFormat;
  text: string;
}> = [
  {
    day: 1,
    format: "pattern_observation",
    text: "You described being everyone's reliable safety net without mentioning one hour that belongs to you. Who catches things when you step back?",
  },
  {
    day: 2,
    format: "pattern_observation",
    text: "The things that make you feel most alive are the things you've stopped making time for. What replaced them, and why did you let it?",
  },
  {
    day: 3,
    format: "pattern_observation",
    text: "You listed the rooms where you perform, then spoke softly about the balcony floor where you felt real. Why does the real room get the leftover hours?",
  },
  {
    day: 4,
    format: "belief_challenge",
    text: "You ranked recognition last, yet built your whole week around earning it. Whose scoreboard are you still playing on?",
  },
  {
    day: 5,
    format: "reframe_question",
    text: "What if the answer was never a bigger title? What if it was a quieter morning, and work that fits inside it?",
  },
];

/**
 * Seeds a Career Fog journey for `personId` with Days 1–4 completed (and optionally Day 5
 * answers completed if `includeDay5Answers` is true) so Day 5 runs live in demos.
 */
export async function seedCareerFogDemoJourney(
  personId: string,
  options: { includeDay5Answers?: boolean } = {},
): Promise<{ journeyId: string; currentDay: number }> {
  logInfo("demo.seedCareerFogDemoJourney", {
    personIdLen: personId.length,
    includeDay5Answers: Boolean(options.includeDay5Answers),
  });

  await upsertPerson(personId, { country: "IN" });
  const { journey } = await createCareerFogJourney(personId);

  const entriesToSeed = options.includeDay5Answers
    ? [...DEMO_ANSWERS, ...DEMO_DAY5_OPTIONAL_ANSWERS]
    : DEMO_ANSWERS;

  const baseTimeMs = Date.now() - 4 * 24 * 60 * 60 * 1000;
  let offsetIndex = 0;

  const adaptivePerDay: Record<number, Record<string, string>> = {
    1: {},
    2: {},
    3: {},
    4: {},
    5: {},
  };

  for (const item of entriesToSeed) {
    offsetIndex += 1;
    const def = CAREER_FOG_QUESTIONS[item.qid];
    const questionText = item.questionOverride ?? def.text;
    const createdIso = new Date(baseTimeMs + offsetIndex * 60_000).toISOString();

    if (def.isAdaptive) {
      adaptivePerDay[item.day][String(item.qid)] = questionText;
    }

    await saveAnswer(personId, journey.id, item.day, {
      qid: item.qid,
      layer: def.layer,
      questionText,
      text: item.text,
      idkCount: 0,
      idkFlagged: false,
      safety: {
        level: "none",
        model: "demo-seed",
        escalated: false,
      },
      excludedFromAI: false,
      createdAt: createdIso,
    });
  }

  const maxCompletedDay = options.includeDay5Answers ? 5 : 4;
  for (let d = 1; d <= maxCompletedDay; d++) {
    const openerEntry = entriesToSeed.find(
      (e) => e.day === d && e.qid === 6,
    );
    const completedIso = new Date(
      baseTimeMs + d * 12 * 60 * 60 * 1000,
    ).toISOString();

    await updateSession(personId, journey.id, d, {
      completedAt: completedIso,
      overnightReflection: openerEntry?.text ?? null,
      adaptiveQuestions: adaptivePerDay[d] ?? {},
    });

    const bridgeSpec = DEMO_BRIDGES.find((b) => b.day === d);
    if (bridgeSpec) {
      await saveBridge(personId, journey.id, {
        day: d,
        text: bridgeSpec.text,
        format: bridgeSpec.format,
        wordCount: bridgeSpec.text.split(/\s+/).length,
        model: "demo-seed",
        promptVersion: "bridge-v1.0",
        createdAt: completedIso,
      });
    }
  }

  await updateJourney(personId, journey.id, {
    currentDay: 5,
    nextUnlockAt: null,
    status: "active",
    isDemoSeed: true,
  });

  return {
    journeyId: journey.id,
    currentDay: 5,
  };
}
