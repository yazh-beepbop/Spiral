/**
 * Deterministic Fallback Bridge Questions per Day (`src/lib/bridge/fallbacks.ts`).
 *
 * Feature overview & use cases:
 * - Provides the exact 5 daily fallback Bridge Questions defined in Part 3 (`COST RULES`).
 * - Used whenever the deep model fails JSON/Zod parsing or fails code validation checks
 *   after at most 1 generation + 1 retry (`<= 2` deep-model calls per day), ensuring every
 *   Spiral session ends calmly with a lingering, under-40-word, advice-free Bridge Question.
 */

import type { BridgeFormat } from "@/lib/db/schema";
import { logInfo } from "@/lib/log";

export interface FallbackBridgeSpec {
  day: 1 | 2 | 3 | 4 | 5;
  text: string;
  format: BridgeFormat;
}

export const FALLBACK_BRIDGES: Record<1 | 2 | 3 | 4 | 5, FallbackBridgeSpec> = {
  1: {
    day: 1,
    format: "pattern_observation",
    text: "Of everything you wrote today, which answer would you least want someone to read? Why that one?",
  },
  2: {
    day: 2,
    format: "belief_challenge",
    text: "When did you last do something just because it felt good, with no reason to justify it?",
  },
  3: {
    day: 3,
    format: "pattern_observation",
    text: "Which version of you showed up in today's answers, the real one or the one you perform?",
  },
  4: {
    day: 4,
    format: "reframe_question",
    text: "If the way you spent last week was a statement of your values, what would it say?",
  },
  5: {
    day: 5,
    format: "reframe_question",
    text: "What is the answer you already know but have been waiting for permission to act on?",
  },
};

/**
 * Returns the configured fallback Bridge specification for `day` (`1..5`).
 */
export function getFallbackBridge(day: number): FallbackBridgeSpec {
  logInfo("bridgeFallbacks.getFallbackBridge", { day });
  const clamped = Math.min(5, Math.max(1, Math.trunc(day))) as 1 | 2 | 3 | 4 | 5;
  return FALLBACK_BRIDGES[clamped];
}
