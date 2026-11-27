/**
 * Server-enforced session gap logic (`src/lib/journey/gap.ts`).
 *
 * Feature overview & use cases:
 * - Implements the forced gap between Spiral sessions (`MENTAL-MODEL.md` & `CONSTRAINTS.md`):
 *   1. Gap duration comes exclusively from `GAP_MINUTES` in `src/lib/config.ts`
 *      (`600` minutes = 10 hours in production; `2` minutes in sprint demo mode).
 *   2. Every unlock check compares `nextUnlockAt` against server `Date.now()` — never
 *      trusting the browser or device clock (`ROADMAP.md` T8).
 *   3. Provides pure formatting helpers for displaying `HH:MM:SS` remaining time.
 */

import { getServerConfig } from "@/lib/config";
import { logInfo } from "@/lib/log";

export interface GapLockEvaluation {
  locked: boolean;
  serverNowIso: string;
  lockedUntilIso: string | null;
  remainingMs: number;
}

/**
 * Computes the next session unlock timestamp (`serverNow + GAP_MINUTES`) on the server.
 */
export function computeNextUnlockAt(serverNow: Date = new Date()): string {
  const { gapMinutes } = getServerConfig();
  const unlockMs = serverNow.getTime() + gapMinutes * 60 * 1000;
  const unlockIso = new Date(unlockMs).toISOString();
  logInfo("gap.computeNextUnlockAt", {
    gapMinutes,
    unlockIso,
  });
  return unlockIso;
}

/**
 * Evaluates whether a journey is currently locked by comparing `nextUnlockAtIso`
 * strictly against `serverNow` on the server.
 */
export function evaluateGapLock(
  nextUnlockAtIso: string | null,
  serverNow: Date = new Date(),
): GapLockEvaluation {
  logInfo("gap.evaluateGapLock", {
    hasNextUnlockAt: Boolean(nextUnlockAtIso),
  });
  const serverNowIso = serverNow.toISOString();
  if (!nextUnlockAtIso) {
    return {
      locked: false,
      serverNowIso,
      lockedUntilIso: null,
      remainingMs: 0,
    };
  }

  const unlockTimeMs = Date.parse(nextUnlockAtIso);
  if (!Number.isFinite(unlockTimeMs)) {
    return {
      locked: false,
      serverNowIso,
      lockedUntilIso: null,
      remainingMs: 0,
    };
  }

  const remainingMs = Math.max(0, unlockTimeMs - serverNow.getTime());
  return {
    locked: remainingMs > 0,
    serverNowIso,
    lockedUntilIso: remainingMs > 0 ? new Date(unlockTimeMs).toISOString() : null,
    remainingMs,
  };
}

/**
 * Formats a millisecond countdown into `HH:MM:SS` for quiet timer displays.
 */
export function formatCountdownMs(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
