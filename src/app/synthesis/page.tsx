/**
 * Day 5 Synthesis Screen (`src/app/synthesis/page.tsx`).
 *
 * Feature overview & use cases:
 * - Implements `Design.md` Screen 6 (`Synthesis`):
 *   1. Loads (or triggers generation of) the 500–800 word Day 5 reflection in plain,
 *      hedged language with zero clinical or taxonomy labels
 *   2. Renders each of the 3–5 pattern insights with an interactive `"Did this land?"`
 *      (`Yes` / `Not quite`) control that saves feedback via `PATCH /api/synthesis`
 *   3. Closes quietly ("Spiral is designed to end") with the mandatory disclaimer.
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { APP_META } from "@/lib/config";
import type { ClientSafeSynthesis } from "@/lib/db/schema";
import { authorizedFetch } from "@/lib/firebase/client";
import { logError, logInfo } from "@/lib/log";
import styles from "./page.module.css";

interface SynthesisApiResponse {
  state?: "ready" | "pending" | "no_journey" | "paused";
  synthesis?: ClientSafeSynthesis;
  error?: string;
}

/**
 * Renders the Day 5 closing synthesis and per-insight resonance controls.
 */
export default function SynthesisPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [synthesis, setSynthesis] = useState<ClientSafeSynthesis | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  /**
   * Loads a saved Day 5 synthesis or triggers generation, surfacing a calm retry option on failure.
   */
  const loadOrGenerate = useCallback(async (): Promise<void> => {
    if (inFlightRef.current) {
      return;
    }
    inFlightRef.current = true;
    setLoading(true);
    setErrorMessage(null);

    try {
      const getRes = await authorizedFetch("/api/synthesis", {
        method: "GET",
      });
      if (getRes.status === 401) {
        router.replace("/start");
        return;
      }
      if (getRes.status === 403) {
        router.replace("/paused");
        return;
      }
      if (getRes.status === 404) {
        router.replace("/start");
        return;
      }

      const initial = (await getRes.json()) as SynthesisApiResponse;
      if (initial.state === "ready" && initial.synthesis) {
        setSynthesis(initial.synthesis);
        return;
      }

      // Trigger Day 5 pattern map + synthesis generation
      const postRes = await authorizedFetch("/api/synthesis", {
        method: "POST",
        signal: AbortSignal.timeout(195_000),
      });
      const generated = (await postRes.json()) as SynthesisApiResponse;
      if (!postRes.ok || !generated.synthesis) {
        if (postRes.status === 400) {
          router.replace("/session");
          return;
        }
        setErrorMessage(
          "Your closing reflection took longer than expected. Your five days of words are safe.",
        );
        return;
      }

      setSynthesis(generated.synthesis);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        router.replace("/start");
        return;
      }
      logError("SynthesisPage.loadOrGenerate.failed", error);
      setErrorMessage(
        "Your closing reflection took longer than expected. Your five days of words are safe.",
      );
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    logInfo("SynthesisPage.mount");
    void loadOrGenerate();
  }, [loadOrGenerate]);

  /**
   * Saves `"Did this land?"` (`true` / `false`) feedback for a single insight card.
   */
  const handleFeedback = async (
    insightId: string,
    landed: boolean,
  ): Promise<void> => {
    if (!synthesis || savingId) {
      return;
    }
    setSavingId(insightId);
    logInfo("SynthesisPage.handleFeedback", { insightId, landed });

    // Optimistic UI update
    setSynthesis({
      ...synthesis,
      insights: synthesis.insights.map((ins) =>
        ins.id === insightId ? { ...ins, landed } : ins,
      ),
    });

    try {
      const res = await authorizedFetch("/api/synthesis", {
        method: "PATCH",
        body: JSON.stringify({ insightId, landed }),
      });
      if (res.ok) {
        const updated = (await res.json()) as {
          synthesis?: ClientSafeSynthesis;
        };
        if (updated.synthesis) {
          setSynthesis(updated.synthesis);
        }
      }
    } catch (error: unknown) {
      logError("SynthesisPage.handleFeedback.failed", error);
    } finally {
      setSavingId(null);
    }
  };

  /**
   * Toggles the `"None of these fit me"` option on the pattern map (`PATCH /api/synthesis`).
   */
  const handleToggleNoneFit = async (): Promise<void> => {
    if (!synthesis || savingId) {
      return;
    }
    const nextVal = !synthesis.noneFitMe;
    setSavingId("none_fit_me");
    logInfo("SynthesisPage.handleToggleNoneFit", { noneFitMe: nextVal });

    setSynthesis({
      ...synthesis,
      noneFitMe: nextVal,
    });

    try {
      const res = await authorizedFetch("/api/synthesis", {
        method: "PATCH",
        body: JSON.stringify({ noneFitMe: nextVal }),
      });
      if (res.ok) {
        const updated = (await res.json()) as {
          synthesis?: ClientSafeSynthesis;
        };
        if (updated.synthesis) {
          setSynthesis(updated.synthesis);
        }
      }
    } catch (error: unknown) {
      logError("SynthesisPage.handleToggleNoneFit.failed", error);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <span className={styles.brand}>Spiral</span>
          <span className={styles.dayTag}>Day 5 · Reflection</span>
        </header>
        <div className={styles.loadingWrap}>
          Reading across all five days of your words...
          <br />
          Writing your closing reflection.
        </div>
        <footer className={styles.footer}>
          <p className={styles.disclaimer}>{APP_META.disclaimer}</p>
        </footer>
      </div>
    );
  }

  const paragraphs = synthesis
    ? synthesis.text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Spiral
        </Link>
        <span className={styles.dayTag}>
          {synthesis ? "Day 5 · Complete" : "Day 5 · Reflection"}
        </span>
      </header>

      <main className={styles.main}>
        <h1 className={styles.heading}>What surfaced across your five days</h1>

        {errorMessage && !synthesis ? (
          <section className={styles.retryCard} role="alert">
            <p className={styles.retryMessage}>{errorMessage}</p>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => void loadOrGenerate()}
            >
              Try again
            </button>
          </section>
        ) : null}

        {synthesis ? (
          <>
            <article className={styles.prose}>
              {paragraphs.map((para, idx) => (
                <p key={idx} className={styles.paragraph}>
                  {para}
                </p>
              ))}
            </article>

            <section
              className={styles.insightsSection}
              aria-label="Threads we noticed"
            >
              <h2 className={styles.sectionLabel}>
                Threads in your own words · Did these land?
              </h2>

              {synthesis.insights.map((insight) => (
                <div key={insight.id} className={styles.insightCard}>
                  {insight.evidenceDays.length >= 2 ? (
                    <p className={styles.evidenceDaysBadge}>
                      Across Days {insight.evidenceDays.join(" & ")} · In your
                      own words
                    </p>
                  ) : null}
                  <p className={styles.insightText}>{insight.text}</p>
                  <div className={styles.feedbackRow}>
                    <span className={styles.feedbackPrompt}>
                      Did this land?
                    </span>
                    <div className={styles.feedbackButtons}>
                      <button
                        type="button"
                        className={
                          insight.landed === true
                            ? `${styles.feedbackBtn} ${styles.feedbackBtnActiveYes}`
                            : styles.feedbackBtn
                        }
                        disabled={savingId === insight.id}
                        onClick={() => void handleFeedback(insight.id, true)}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className={
                          insight.landed === false
                            ? `${styles.feedbackBtn} ${styles.feedbackBtnActiveNo}`
                            : styles.feedbackBtn
                        }
                        disabled={savingId === insight.id}
                        onClick={() => void handleFeedback(insight.id, false)}
                      >
                        Not quite
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <div className={styles.noneFitWrap}>
                <button
                  type="button"
                  aria-pressed={synthesis.noneFitMe}
                  className={
                    synthesis.noneFitMe
                      ? `${styles.noneFitBtn} ${styles.noneFitBtnActive}`
                      : styles.noneFitBtn
                  }
                  disabled={savingId === "none_fit_me"}
                  onClick={() => void handleToggleNoneFit()}
                >
                  None of these fit me
                </button>
                {synthesis.noneFitMe ? (
                  <p className={styles.noneFitNote}>
                    Noted — thank you for being direct. Trust your own read over
                    ours; any reflection that doesn&apos;t ring true is meant to
                    be set aside.
                  </p>
                ) : null}
              </div>
            </section>

            {synthesis.ownPrioritiesText ? (
              <section
                className={styles.ownWordsCard}
                aria-label="In your words"
              >
                <h2 className={styles.closingTitle}>In your words</h2>
                <ul className={styles.ownWordsList}>
                  {synthesis.ownPrioritiesText
                    .split(/\r?\n/)
                    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
                    .filter(Boolean)
                    .map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                </ul>
                <p className={styles.ownWordsQuestion}>
                  Is this yours, or was it handed to you?
                </p>
              </section>
            ) : null}

            <section className={styles.closingCard}>
              <p className={styles.closingTitle}>This Spiral ends here</p>
              <p className={styles.closingCopy}>
                There are no streaks to keep and nothing more to unlock today.
                Step back into your week with what felt true — and if life
                reaches another turning point years from now, Spiral will
                remember where you left off.
              </p>
            </section>
          </>
        ) : null}
      </main>

      <footer className={styles.footer}>
        <p className={styles.disclaimer}>{APP_META.disclaimer}</p>
      </footer>
    </div>
  );
}
