/**
 * Bridge & Locked Countdown Screen (`src/app/bridge/page.tsx`).
 *
 * Feature overview & use cases:
 * - Implements `Design.md` Screens 4 (`Bridge`) and 5 (`Locked`):
 *   1. Shows today's personal Bridge Question in large, quiet type
 *   2. Displays `"Sit with this. Your next session opens in"` + a live countdown driven
 *      strictly by server-computed `remainingMs` + monotonic `performance.now()` elapsed time,
 *      so changing the device's wall clock cannot unlock the session (`ROADMAP.md` T8)
 *   3. Re-verifies unlock status against `GET /api/session/current` before showing `"Open Day N"`
 *   4. On Day 5 completion, displays Day 5's Bridge and leads directly to `/synthesis`.
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { APP_META } from "@/lib/config";
import { authorizedFetch } from "@/lib/firebase/client";
import { logError, logInfo } from "@/lib/log";
import styles from "./page.module.css";

interface BridgeSnapshot {
  day: number;
  text: string;
  format: string;
}

interface SessionStatePayload {
  state:
    | "no_journey"
    | "paused"
    | "completed"
    | "locked"
    | "ready_for_bridge"
    | "ready_for_synthesis"
    | "question";
  day?: number;
  completedDay?: number;
  nextDay?: number;
  bridge?: BridgeSnapshot | null;
  remainingMs?: number;
}

/**
 * Formats milliseconds into `HH:MM:SS` for the quiet Bridge countdown.
 */
function formatClock(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (v: number): string => String(v).padStart(2, "0");
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

/**
 * Renders the end-of-day Bridge Question and server-synced gap countdown.
 */
export default function BridgePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [bridge, setBridge] = useState<BridgeSnapshot | null>(null);
  const [nextDay, setNextDay] = useState<number | null>(null);
  const [isDay5Final, setIsDay5Final] = useState(false);
  const [unlockedOnServer, setUnlockedOnServer] = useState(false);
  const [displayMs, setDisplayMs] = useState(0);

  const baseRemainingRef = useRef(0);
  const syncedPerfTimeRef = useRef(0);

  /**
   * Synchronizes Bridge and server-side lock state from `/api/session/current` (generating
   * the Bridge first via `/api/bridge` if today's answers just completed).
   */
  const syncBridgeState = useCallback(async (): Promise<void> => {
    try {
      const currentRes = await authorizedFetch("/api/session/current", {
        method: "GET",
      });
      if (currentRes.status === 401) {
        router.replace("/start");
        return;
      }
      const data = (await currentRes.json()) as SessionStatePayload;

      if (data.state === "no_journey") {
        router.replace("/start");
        return;
      }
      if (data.state === "paused") {
        router.replace("/paused");
        return;
      }

      if (data.state === "ready_for_bridge") {
        const bridgeRes = await authorizedFetch("/api/bridge", {
          method: "POST",
        });
        if (bridgeRes.ok) {
          const generated = (await bridgeRes.json()) as {
            day: number;
            bridge: BridgeSnapshot | null;
            remainingMs: number;
            isDay5Complete: boolean;
          };
          setBridge(generated.bridge);
          setIsDay5Final(generated.isDay5Complete);
          setNextDay(generated.isDay5Complete ? null : generated.day + 1);
          baseRemainingRef.current = generated.remainingMs;
          syncedPerfTimeRef.current = performance.now();
          setDisplayMs(generated.remainingMs);
          setUnlockedOnServer(generated.remainingMs <= 0 && !generated.isDay5Complete);
        }
        setLoading(false);
        return;
      }

      if (data.state === "locked") {
        setBridge(data.bridge ?? null);
        setNextDay(data.nextDay ?? null);
        setIsDay5Final(false);
        const rem = data.remainingMs ?? 0;
        baseRemainingRef.current = rem;
        syncedPerfTimeRef.current = performance.now();
        setDisplayMs(rem);
        setUnlockedOnServer(false);
        setLoading(false);
        return;
      }

      if (data.state === "ready_for_synthesis" || data.state === "completed") {
        setBridge(data.bridge ?? null);
        setIsDay5Final(true);
        setUnlockedOnServer(false);
        setLoading(false);
        return;
      }

      if (data.state === "question") {
        // Server has unlocked the next day's session!
        setUnlockedOnServer(true);
        setNextDay(data.day ?? null);
        setDisplayMs(0);
        if (!bridge) {
          router.replace("/session");
          return;
        }
        setLoading(false);
      }
    } catch (error: unknown) {
      logError("BridgePage.syncBridgeState.failed", error);
      setLoading(false);
    }
  }, [bridge, router]);

  useEffect(() => {
    logInfo("BridgePage.mount");
    void syncBridgeState();
  }, [syncBridgeState]);

  useEffect(() => {
    if (isDay5Final || unlockedOnServer || baseRemainingRef.current <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      const elapsed = performance.now() - syncedPerfTimeRef.current;
      const nextRemaining = Math.max(0, baseRemainingRef.current - elapsed);
      setDisplayMs(nextRemaining);

      if (nextRemaining <= 0) {
        window.clearInterval(timer);
        void syncBridgeState();
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [isDay5Final, syncBridgeState, unlockedOnServer]);

  if (loading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <span className={styles.brand}>Spiral</span>
        </header>
        <div className={styles.loadingWrap}>Loading your Bridge Question...</div>
        <footer className={styles.footer}>
          <p className={styles.disclaimer}>{APP_META.disclaimer}</p>
        </footer>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Spiral
        </Link>
        <span className={styles.dayTag}>
          {bridge ? `Day ${bridge.day} Bridge` : "Bridge"}
        </span>
      </header>

      <main className={styles.main}>
        <p className={styles.eyebrow}>Your Bridge Question</p>

        <blockquote className={styles.bridgeQuote}>
          {bridge?.text ??
            "Take a quiet evening away from the screen before your next session opens."}
        </blockquote>

        {isDay5Final ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => router.push("/synthesis")}
            >
              Read your five-day reflection
            </button>
          </div>
        ) : unlockedOnServer ? (
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => router.push("/session")}
            >
              {nextDay ? `Begin Day ${nextDay}` : "Continue your Spiral"}
            </button>
          </div>
        ) : (
          <section className={styles.lockSection} aria-live="polite">
            <p className={styles.sitLabel}>
              Sit with this. Your next session opens in
            </p>
            <p className={styles.timer}>{formatClock(displayMs)}</p>
          </section>
        )}
      </main>

      <footer className={styles.footer}>
        <p className={styles.disclaimer}>{APP_META.disclaimer}</p>
      </footer>
    </div>
  );
}
