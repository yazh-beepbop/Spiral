/**
 * Permanent Career Fog Question Bank (`src/lib/journey/questions.ts`).
 *
 * Feature overview & use cases:
 * - Encodes the exact 5-day Career Fog question bank, Opener template, adaptive L3 markers,
 *   and question-specific "I don't know" redirects from `Design.md` Sections 3, 4, and 5.
 * - QIDs (`1..28`) are permanent across a person's lifetime (`CONSTRAINTS.md`:
 *   "QIDs are permanent. Never renumber or reuse a question ID.").
 * - Used by `/api/session/current`, `/api/answer`, IDK redirect escalation, adaptive L3
 *   generation, and the demo journey seeder.
 */

import type { QuestionLayer } from "@/lib/db/schema";
import { logInfo } from "@/lib/log";

export type QuestionFormat =
  | "choice"
  | "short"
  | "long"
  | "ranking"
  | "priorities";

export interface QuestionDefinition {
  qid: number;
  day: 1 | 2 | 3 | 4 | 5 | "opener";
  layer: QuestionLayer;
  format: QuestionFormat;
  text: string;
  isAdaptive: boolean;
  adaptiveTemplate?: string;
  choices?: readonly string[];
  rankingItems?: readonly string[];
  idkRedirect?: string;
}

export interface DayMetadata {
  day: 1 | 2 | 3 | 4 | 5;
  title: string;
  headerLabel: string;
  qids: readonly number[];
}

export const DAY_METADATA: readonly DayMetadata[] = [
  {
    day: 1,
    title: "Surface Mapping",
    headerLabel: "DAY 1 · SURFACE MAPPING",
    qids: [1, 2, 3, 4, 5],
  },
  {
    day: 2,
    title: "Energy Archaeology",
    headerLabel: "DAY 2 · ENERGY ARCHAEOLOGY",
    qids: [6, 7, 8, 9, 10, 11],
  },
  {
    day: 3,
    title: "Identity Excavation",
    headerLabel: "DAY 3 · IDENTITY EXCAVATION",
    qids: [6, 12, 13, 14, 15, 16, 17, 18],
  },
  {
    day: 4,
    title: "Values and Contradictions",
    headerLabel: "DAY 4 · VALUES AND CONTRADICTIONS",
    qids: [6, 19, 20, 21, 22, 23],
  },
  {
    day: 5,
    title: "Direction and Asymmetry",
    headerLabel: "DAY 5 · DIRECTION AND ASYMMETRY",
    qids: [6, 24, 25, 26, 27, 28, 29],
  },
] as const;

export const CAREER_FOG_QUESTIONS: Record<number, QuestionDefinition> = {
  1: {
    qid: 1,
    day: 1,
    layer: "L2",
    format: "choice",
    text: "How do you feel about your work right now?",
    choices: ["Energized", "Fine", "Drained", "Numb"],
    isAdaptive: false,
  },
  2: {
    qid: 2,
    day: 1,
    layer: "L1",
    format: "short",
    text: "When was the last time you lost track of time? What were you doing?",
    isAdaptive: false,
  },
  3: {
    qid: 3,
    day: 1,
    layer: "L1",
    format: "short",
    text: "What do people come to you for? Do you enjoy being that person?",
    isAdaptive: false,
  },
  4: {
    qid: 4,
    day: 1,
    layer: "L1",
    format: "long",
    text: "Describe a real Tuesday. Not ideal. Real.",
    isAdaptive: false,
  },
  5: {
    qid: 5,
    day: 1,
    layer: "L1",
    format: "short",
    text: "What would you change if it were easy?",
    isAdaptive: false,
  },
  6: {
    qid: 6,
    day: "opener",
    layer: "Opener",
    format: "long",
    text: "Welcome back. Yesterday I left you with this: [Bridge]. Before we start, did anything surface overnight? Even something small.",
    isAdaptive: false,
  },
  7: {
    qid: 7,
    day: 2,
    layer: "L1",
    format: "long",
    text: "Think about the last three times you had genuine fun. What were you doing?",
    isAdaptive: false,
    idkRedirect:
      "Think about last weekend. Was there any moment, even five minutes, where you weren't thinking about work or obligations? What were you doing?",
  },
  8: {
    qid: 8,
    day: 2,
    layer: "L2",
    format: "choice",
    text: "Two projects: A is structured, B is open-ended. Which one lights you up?",
    choices: ["A is structured", "B is open-ended"],
    isAdaptive: false,
  },
  9: {
    qid: 9,
    day: 2,
    layer: "L2",
    format: "short",
    text: "What counts as fun at work? Be specific.",
    isAdaptive: false,
  },
  10: {
    qid: 10,
    day: 2,
    layer: "L1",
    format: "short",
    text: "What activities outside work make you feel most alive?",
    isAdaptive: false,
  },
  11: {
    qid: 11,
    day: 2,
    layer: "L3",
    format: "short",
    text: "[Adaptive] A follow-up generated from Day 1 answers",
    isAdaptive: true,
    adaptiveTemplate: "A follow-up generated from Day 1 answers",
  },
  12: {
    qid: 12,
    day: 3,
    layer: "L1",
    format: "long",
    text: "Which world (school, work, social) felt most like you? Which was the biggest performance?",
    isAdaptive: false,
  },
  13: {
    qid: 13,
    day: 3,
    layer: "L1",
    format: "long",
    text: "If you could be honest with everyone for one day, with zero consequences, what would you say, and to whom?",
    isAdaptive: false,
  },
  14: {
    qid: 14,
    day: 3,
    layer: "L1",
    format: "short",
    text: "When you get dressed, are you dressing as who you are, or who you're creating?",
    isAdaptive: false,
  },
  15: {
    qid: 15,
    day: 3,
    layer: "L1",
    format: "short",
    text: "Who would you still talk to if you lived in total isolation? Why them?",
    isAdaptive: false,
  },
  16: {
    qid: 16,
    day: 3,
    layer: "L3",
    format: "long",
    text: "[Adaptive] You said [activity] gives you energy and [role] feels like a performance. What if you stopped performing?",
    isAdaptive: true,
    adaptiveTemplate:
      "You said [activity] gives you energy and [role] feels like a performance. What if you stopped performing?",
  },
  17: {
    qid: 17,
    day: 3,
    layer: "L1",
    format: "short",
    text: "If nobody could judge you, what would you stop doing tomorrow?",
    isAdaptive: false,
    idkRedirect:
      "Okay, smaller: what's something you do alone that you'd never post about? Start there.",
  },
  18: {
    qid: 18,
    day: 3,
    layer: "L1",
    format: "short",
    text: "When was the last time you felt like yourself?",
    isAdaptive: false,
    idkRedirect:
      "Let's flip it. When was the last time you definitely did NOT feel like yourself? What was happening?",
  },
  19: {
    qid: 19,
    day: 4,
    layer: "L1",
    format: "ranking",
    text: "Rank these: autonomy, mastery, impact, recognition, belonging.",
    rankingItems: ["autonomy", "mastery", "impact", "recognition", "belonging"],
    isAdaptive: false,
  },
  20: {
    qid: 20,
    day: 4,
    layer: "L1",
    format: "short",
    text: "Look at how you spent last week. Does it match your ranking?",
    isAdaptive: false,
  },
  21: {
    qid: 21,
    day: 4,
    layer: "L1",
    format: "short",
    text: "Imagine being privately, quietly proud five years from now. First image. Don't think.",
    isAdaptive: false,
  },
  22: {
    qid: 22,
    day: 4,
    layer: "L2",
    format: "short",
    text: "Does prestige feel good, or just useful?",
    isAdaptive: false,
  },
  23: {
    qid: 23,
    day: 4,
    layer: "L3",
    format: "long",
    text: "[Adaptive] Your pride image was [X], but your trajectory points toward [Y]. What drives the gap?",
    isAdaptive: true,
    adaptiveTemplate:
      "Your pride image was [X], but your trajectory points toward [Y]. What drives the gap?",
  },
  24: {
    qid: 24,
    day: 5,
    layer: "L2",
    format: "short",
    text: "What would you do for free that people would eventually pay for?",
    isAdaptive: false,
  },
  25: {
    qid: 25,
    day: 5,
    layer: "L1",
    format: "short",
    text: "What's the one move with low downside and huge upside that you've been avoiding?",
    isAdaptive: false,
  },
  26: {
    qid: 26,
    day: 5,
    layer: "L1",
    format: "long",
    text: "Describe your ideal Monday morning. First three hours. Specific.",
    isAdaptive: false,
  },
  27: {
    qid: 27,
    day: 5,
    layer: "L1",
    format: "short",
    text: "What would you bet on? Not the safe bet. The real one.",
    isAdaptive: false,
    idkRedirect:
      "That's the second time you've said that. What's the answer you're afraid is too small, too weird, or too unrealistic to say out loud?",
  },
  28: {
    qid: 28,
    day: 5,
    layer: "L1",
    format: "short",
    text: "What's the one thing you know you need to do but haven't done yet?",
    isAdaptive: false,
    idkRedirect:
      "You do know. You've known for a while. The thing that flashed in your mind before you typed 'no idea'. That one. Say it.",
  },
  29: {
    qid: 29,
    day: 5,
    layer: "L1",
    format: "priorities",
    text: "In your own words, name your top 3 priorities right now, and one small next step for each.",
    isAdaptive: false,
  },
};

/**
 * Returns metadata (`title`, `headerLabel`, ordered `qids`) for a journey day (`1..5`).
 */
export function getDayMetadata(day: number): DayMetadata {
  logInfo("questions.getDayMetadata", { day });
  const found = DAY_METADATA.find((d) => d.day === day);
  if (!found) {
    throw new Error(`Invalid Spiral day number: ${day}`);
  }
  return found;
}

/**
 * Returns the ordered array of `QuestionDefinition`s scheduled for a given `day` (`1..5`),
 * including the Opener (`QID 6`) on Days 2 through 5.
 */
export function getQuestionsForDay(day: number): QuestionDefinition[] {
  logInfo("questions.getQuestionsForDay", { day });
  const meta = getDayMetadata(day);
  return meta.qids.map((qid) => {
    const def = CAREER_FOG_QUESTIONS[qid];
    if (!def) {
      throw new Error(`Missing question definition for QID ${qid}`);
    }
    return def;
  });
}

/**
 * Looks up a single permanent `QuestionDefinition` by `qid`.
 */
export function getQuestionByQid(qid: number): QuestionDefinition | null {
  logInfo("questions.getQuestionByQid", { qid });
  return CAREER_FOG_QUESTIONS[qid] ?? null;
}

/**
 * Formats the Day 2–5 Opener question (`QID 6`) by embedding yesterday's Bridge Question.
 */
export function formatOpenerQuestion(previousBridgeText: string | null): string {
  logInfo("questions.formatOpenerQuestion", {
    hasPreviousBridge: Boolean(previousBridgeText),
  });
  const template = CAREER_FOG_QUESTIONS[6].text;
  const cleanBridge = previousBridgeText?.trim();
  if (!cleanBridge) {
    return "Welcome back. Before we start today's questions, did anything surface overnight? Even something small.";
  }
  return template.replace("[Bridge]", `"${cleanBridge}"`);
}
