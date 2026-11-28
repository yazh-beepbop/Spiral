/**
 * Day 5 Synthesis Screen (`src/app/synthesis/page.tsx`).
 *
 * Feature overview & use cases:
 * - Implements `Design.md` Screen 6 (`Synthesis`) with full i18n (`en`, `hinglish`, `hi`, `ta`)
 *   and zero hardcoded UI strings.
 * - Includes `SettingsLanguageButton` in the header, calm "Try again" recovery on timeout/error,
 *   per-insight `"Did this land?"` resonance feedback, `"None of these fit me"`, and verbatim
 *   `"In your words"` Day 5 priorities.
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SettingsLanguageButton } from "@/components/LanguagePicker";
import { useI18n } from "@/components/LanguageProvider";
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
  const { t } = useI18n();
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
        setErrorMessage(t.synthesis.timeoutMessage);
        return;
      }

      setSynthesis(generated.synthesis);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        router.replace("/start");
        return;
      }
      logError("SynthesisPage.loadOrGenerate.failed", error);
      setErrorMessage(t.synthesis.timeoutMessage);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [router, t.synthesis.timeoutMessage]);

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
          <span className={styles.brand}>{t.meta.brandName}</span>
          <div className={styles.headerRight}>
            <span className={styles.dayTag}>
              {t.synthesis.day5ReflectionTag}
            </span>
            <SettingsLanguageButton />
          </div>
        </header>
        <div className={styles.loadingWrap}>
          {t.synthesis.loadingLine1}
          <br />
          {t.synthesis.loadingLine2}
        </div>
        <footer className={styles.footer}>
          <p className={styles.disclaimer}>{t.meta.disclaimer}</p>
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
          {t.meta.brandName}
        </Link>
        <div className={styles.headerRight}>
          <span className={styles.dayTag}>
            {synthesis
              ? t.synthesis.day5CompleteTag
              : t.synthesis.day5ReflectionTag}
          </span>
          <SettingsLanguageButton />
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.heading}>{t.synthesis.heading}</h1>

        {errorMessage && !synthesis ? (
          <section className={styles.retryCard} role="alert">
            <p className={styles.retryMessage}>{errorMessage}</p>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => void loadOrGenerate()}
            >
              {t.synthesis.tryAgainBtn}
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
              aria-label={t.synthesis.threadsAriaLabel}
            >
              <h2 className={styles.sectionLabel}>
                {t.synthesis.threadsSectionLabel}
              </h2>

              {synthesis.insights.map((insight) => (
                <div key={insight.id} className={styles.insightCard}>
                  {insight.evidenceDays.length >= 2 ? (
                    <p className={styles.evidenceDaysBadge}>
                      {t.synthesis.acrossDaysPrefix}{" "}
                      {insight.evidenceDays.join(" & ")} ·{" "}
                      {t.synthesis.acrossDaysInYourWords}
                    </p>
                  ) : null}
                  <p className={styles.insightText}>{insight.text}</p>
                  <div className={styles.feedbackRow}>
                    <span className={styles.feedbackPrompt}>
                      {t.synthesis.didThisLand}
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
                        {t.synthesis.yesBtn}
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
                        {t.synthesis.notQuiteBtn}
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
                  {t.synthesis.noneFitBtn}
                </button>
                {synthesis.noneFitMe ? (
                  <p className={styles.noneFitNote}>
                    {t.synthesis.noneFitNote}
                  </p>
                ) : null}
              </div>
            </section>

            {synthesis.ownPrioritiesText ? (
              <section
                className={styles.ownWordsCard}
                aria-label={t.synthesis.inYourWordsHeading}
              >
                <h2 className={styles.closingTitle}>
                  {t.synthesis.inYourWordsHeading}
                </h2>
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
                  {t.synthesis.isThisYoursQuestion}
                </p>
              </section>
            ) : null}

            <section className={styles.closingCard}>
              <p className={styles.closingTitle}>{t.synthesis.closingTitle}</p>
              <p className={styles.closingCopy}>{t.synthesis.closingCopy}</p>
            </section>
          </>
        ) : null}
      </main>

      <footer className={styles.footer}>
        <p className={styles.disclaimer}>{t.meta.disclaimer}</p>
      </footer>
    </div>
  );
}
