/**
 * Daily Session Screen (`src/app/session/page.tsx`).
 *
 * Feature overview & use cases:
 * - Implements `Design.md` Screen 3 (`Session`) with full i18n (`en`, `hinglish`, `hi`, `ta`)
 *   and stateless speech-to-text Voice Input (`VoiceMicButton`):
 *   1. Loads authoritative server state from `GET /api/session/current` and refreshes
 *      immediately if the visitor switches languages in `SettingsLanguageButton`
 *   2. Presents strictly ONE question per screen with zero hardcoded strings
 *   3. Places a tap-to-record / tap-to-stop `VoiceMicButton` next to every text answer box
 *      (`short`, `long`, and Day 5 `QID 29` priority/step boxes) so transcribed speech is
 *      inserted into the box for reading and editing before sending
 *   4. Submits original answer text + `language` code through `POST /api/answer` (running
 *      the exact same safety classifier on transcripts as typed text).
 */

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { SettingsLanguageButton } from "@/components/LanguagePicker";
import {
  LANGUAGE_CHANGED_EVENT,
  useI18n,
} from "@/components/LanguageProvider";
import { VoiceMicButton } from "@/components/VoiceMicButton";
import { authorizedFetch } from "@/lib/firebase/client";
import { logError, logInfo } from "@/lib/log";
import styles from "./page.module.css";

interface ActiveQuestionPayload {
  qid: number;
  layer: string;
  format: "choice" | "short" | "long" | "ranking" | "priorities";
  text: string;
  choices: string[] | null;
  rankingItems: string[] | null;
  priorIdkCount: number;
}

interface SessionCurrentResponse {
  state:
    | "no_journey"
    | "paused"
    | "completed"
    | "locked"
    | "ready_for_bridge"
    | "ready_for_synthesis"
    | "question";
  language?: string;
  day?: number;
  headerLabel?: string;
  questionIndex?: number;
  totalQuestions?: number;
  question?: ActiveQuestionPayload;
  error?: string;
}

interface AnswerResponse {
  action?: "paused" | "idk_redirect" | "next_question" | "day_complete";
  state?: string;
  redirectTo?: string;
  language?: string;
  idkCount?: number;
  redirectPrompt?: string;
  canExitNextPass?: boolean;
  idkExitMessage?: string | null;
  gentleCheckIn?: string | null;
  day?: number;
  headerLabel?: string;
  questionIndex?: number;
  totalQuestions?: number;
  question?: ActiveQuestionPayload;
  error?: string;
}

/**
 * Appends a speech-to-text transcript cleanly onto an existing text field value.
 */
function appendTranscript(current: string, incoming: string): string {
  const base = current.trim();
  const next = incoming.trim();
  if (!base) {
    return next;
  }
  return `${base} ${next}`;
}

/**
 * Renders the single-question-per-screen Spiral daily inquiry view with voice STT and i18n.
 */
export default function SessionPage() {
  const router = useRouter();
  const { language, syncLanguageFromServer, t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [writingBridge, setWritingBridge] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [usedVoiceForCurrent, setUsedVoiceForCurrent] = useState(false);

  const [headerLabel, setHeaderLabel] = useState("");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [question, setQuestion] = useState<ActiveQuestionPayload | null>(null);

  const [answerText, setAnswerText] = useState("");
  const [selectedChoice, setSelectedChoice] = useState("");
  const [rankingOrder, setRankingOrder] = useState<string[]>([]);
  const [prioritiesRows, setPrioritiesRows] = useState<
    Array<{ priority: string; step: string }>
  >([
    { priority: "", step: "" },
    { priority: "", step: "" },
    { priority: "", step: "" },
  ]);

  const [redirectPrompt, setRedirectPrompt] = useState<string | null>(null);
  const [canExitThisPass, setCanExitThisPass] = useState(false);
  const [gentleCheckIn, setGentleCheckIn] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /**
   * Resets answer input controls whenever a new question becomes active (preserving draft text
   * if the same QID was merely refreshed after a language switch).
   */
  const applyNewQuestion = useCallback(
    (nextQ: ActiveQuestionPayload, preserveDraftIfSameQid = false) => {
      setQuestion((prev) => {
        const sameQid = preserveDraftIfSameQid && prev?.qid === nextQ.qid;
        if (!sameQid) {
          setAnswerText("");
          setSelectedChoice("");
          setPrioritiesRows([
            { priority: "", step: "" },
            { priority: "", step: "" },
            { priority: "", step: "" },
          ]);
          setUsedVoiceForCurrent(false);
          setRedirectPrompt(null);
        }
        setRankingOrder(nextQ.rankingItems ? [...nextQ.rankingItems] : []);
        setCanExitThisPass(nextQ.priorIdkCount >= 2);
        setErrorMessage(null);
        return nextQ;
      });
    },
    [],
  );

  /**
   * Requests end-of-day Bridge generation and navigates to `/bridge`.
   */
  const finalizeDayBridge = useCallback(async (): Promise<void> => {
    setWritingBridge(true);
    try {
      const res = await authorizedFetch("/api/bridge", { method: "POST" });
      if (res.status === 403) {
        router.push("/paused");
        return;
      }
      if (!res.ok) {
        const errData = (await res.json()) as { error?: string };
        setErrorMessage(errData.error ?? t.session.errBridgeFailed);
        setWritingBridge(false);
        return;
      }
      router.push("/bridge");
    } catch (error: unknown) {
      logError("SessionPage.finalizeDayBridge.failed", error);
      setErrorMessage(t.session.errBridgeRetry);
      setWritingBridge(false);
    }
  }, [router, t.session.errBridgeFailed, t.session.errBridgeRetry]);

  /**
   * Loads (or refreshes on language change) the active question from `/api/session/current`.
   */
  const loadSession = useCallback(
    async (preserveDraft = false): Promise<void> => {
      try {
        const res = await authorizedFetch("/api/session/current", {
          method: "GET",
        });
        if (res.status === 401) {
          router.replace("/start");
          return;
        }
        const data = (await res.json()) as SessionCurrentResponse;
        if (data.language && !preserveDraft) {
          syncLanguageFromServer(data.language);
        }

        switch (data.state) {
          case "no_journey":
            router.replace("/start");
            return;
          case "paused":
            router.replace("/paused");
            return;
          case "completed":
            router.replace("/synthesis");
            return;
          case "locked":
          case "ready_for_synthesis":
            router.replace("/bridge");
            return;
          case "ready_for_bridge":
            await finalizeDayBridge();
            return;
          case "question":
            if (data.question) {
              setHeaderLabel(data.headerLabel ?? "");
              setQuestionIndex(data.questionIndex ?? 0);
              setTotalQuestions(data.totalQuestions ?? 5);
              applyNewQuestion(data.question, preserveDraft);
            }
            setLoading(false);
            return;
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.message === "AUTH_REQUIRED") {
          router.replace("/start");
          return;
        }
        logError("SessionPage.loadSession.failed", error);
        setErrorMessage(t.session.errLoadSession);
        setLoading(false);
      }
    },
    [
      applyNewQuestion,
      finalizeDayBridge,
      router,
      syncLanguageFromServer,
      t.session.errLoadSession,
    ],
  );

  useEffect(() => {
    logInfo("SessionPage.mount");
    void loadSession(false);
  }, [loadSession]);

  useEffect(() => {
    const onLanguageChanged = (): void => {
      void loadSession(true);
    };
    window.addEventListener(LANGUAGE_CHANGED_EVENT, onLanguageChanged);
    return () => {
      window.removeEventListener(LANGUAGE_CHANGED_EVENT, onLanguageChanged);
    };
  }, [loadSession]);

  /**
   * Moves an item up or down in the QID 19 5-value ranking list.
   */
  const moveRankingItem = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= rankingOrder.length) {
      return;
    }
    const next = [...rankingOrder];
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    setRankingOrder(next);
  };

  /**
   * Computes the serialized answer text for the active question format.
   */
  const resolveCurrentSubmission = (): string => {
    if (!question) {
      return "";
    }
    if (question.format === "choice") {
      return selectedChoice.trim();
    }
    if (question.format === "ranking") {
      return rankingOrder.map((item, idx) => `${idx + 1}. ${item}`).join(", ");
    }
    if (question.format === "priorities") {
      const complete = prioritiesRows.every(
        (r) => r.priority.trim().length > 0 && r.step.trim().length > 0,
      );
      if (!complete) {
        return "";
      }
      return prioritiesRows
        .map(
          (r, idx) =>
            `${idx + 1}. ${r.priority.trim()} — ${r.step.trim()}`,
        )
        .join("\n");
    }
    return answerText.trim();
  };

  /**
   * Submits the current answer (typed or voice-transcribed) + `language` to `POST /api/answer`.
   */
  const handleSubmit = async (overrideText?: string): Promise<void> => {
    if (!question || submitting || writingBridge) {
      return;
    }
    const submission = (overrideText ?? resolveCurrentSubmission()).trim();
    if (!submission) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    logInfo("SessionPage.handleSubmit", {
      qid: question.qid,
      charLength: submission.length,
      language,
      inputMode: usedVoiceForCurrent ? "voice" : "text",
    });

    try {
      const res = await authorizedFetch("/api/answer", {
        method: "POST",
        body: JSON.stringify({
          qid: question.qid,
          text: submission,
          language,
          inputMode: usedVoiceForCurrent ? "voice" : "text",
        }),
      });

      const data = (await res.json()) as AnswerResponse;

      if (res.status === 403) {
        if (data.action === "paused" || data.redirectTo === "/paused") {
          router.push("/paused");
          return;
        }
        if (data.state === "locked") {
          router.push("/bridge");
          return;
        }
      }

      if (!res.ok) {
        setErrorMessage(data.error ?? t.session.errSaveAnswer);
        setSubmitting(false);
        return;
      }

      if (data.action === "paused") {
        router.push(data.redirectTo ?? "/paused");
        return;
      }

      if (data.action === "idk_redirect") {
        setRedirectPrompt(data.redirectPrompt ?? null);
        setCanExitThisPass(Boolean(data.canExitNextPass));
        setGentleCheckIn(data.gentleCheckIn ?? null);
        setAnswerText("");
        setUsedVoiceForCurrent(false);
        setSubmitting(false);
        return;
      }

      if (data.action === "day_complete") {
        setSubmitting(false);
        await finalizeDayBridge();
        return;
      }

      if (data.action === "next_question" && data.question) {
        setGentleCheckIn(data.idkExitMessage ?? data.gentleCheckIn ?? null);
        setHeaderLabel(data.headerLabel ?? headerLabel);
        setQuestionIndex(data.questionIndex ?? questionIndex + 1);
        setTotalQuestions(data.totalQuestions ?? totalQuestions);
        applyNewQuestion(data.question, false);
        setSubmitting(false);
      }
    } catch (error: unknown) {
      logError("SessionPage.handleSubmit.failed", error);
      setErrorMessage(t.session.errConnectionInterrupted);
      setSubmitting(false);
    }
  };

  if (loading || writingBridge) {
    return (
      <div className={styles.page}>
        <header className={styles.topBar}>
          <span className={styles.dayLabel}>{t.session.brandUpper}</span>
          <SettingsLanguageButton />
        </header>
        <div className={styles.loadingWrap}>
          {writingBridge ? t.session.writingBridge : t.session.openingSession}
        </div>
        <footer className={styles.footer}>
          <p className={styles.disclaimer}>{t.meta.disclaimer}</p>
        </footer>
      </div>
    );
  }

  const canSubmit = Boolean(resolveCurrentSubmission()) && !submitting;

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <span className={styles.dayLabel}>{headerLabel}</span>
        <div className={styles.topBarRight}>
          <div
            className={styles.dots}
            aria-label={t.session.progressAriaLabel}
          >
            {Array.from({ length: totalQuestions }).map((_, idx) => {
              const dotClass =
                idx < questionIndex
                  ? `${styles.dot} ${styles.dotDone}`
                  : idx === questionIndex
                    ? `${styles.dot} ${styles.dotCurrent}`
                    : styles.dot;
              return <span key={idx} className={dotClass} />;
            })}
          </div>
          <SettingsLanguageButton />
        </div>
      </header>

      {question ? (
        <main key={question.qid} className={styles.main}>
          {gentleCheckIn ? (
            <div className={styles.gentleBanner}>{gentleCheckIn}</div>
          ) : null}

          <h1 className={styles.questionText}>{question.text}</h1>

          {redirectPrompt ? (
            <div className={styles.redirectBox}>{redirectPrompt}</div>
          ) : null}

          {question.format === "choice" && question.choices ? (
            <div className={styles.choiceGrid} role="radiogroup">
              {question.choices.map((choice) => {
                const selected = selectedChoice === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={
                      selected
                        ? `${styles.choiceButton} ${styles.choiceButtonSelected}`
                        : styles.choiceButton
                    }
                    onClick={() => setSelectedChoice(choice)}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
          ) : null}

          {question.format === "ranking" ? (
            <div className={styles.rankingList}>
              <p className={styles.rankingHint}>{t.session.rankingHint}</p>
              {rankingOrder.map((item, idx) => (
                <div key={item} className={styles.rankingItem}>
                  <div className={styles.rankingLeft}>
                    <span className={styles.rankNumber}>0{idx + 1}</span>
                    <span className={styles.rankLabel}>{item}</span>
                  </div>
                  <div className={styles.rankControls}>
                    <button
                      type="button"
                      className={styles.rankArrow}
                      disabled={idx === 0}
                      aria-label={`${t.session.moveUpAriaPrefix} ${item}`}
                      onClick={() => moveRankingItem(idx, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={styles.rankArrow}
                      disabled={idx === rankingOrder.length - 1}
                      aria-label={`${t.session.moveDownAriaPrefix} ${item}`}
                      onClick={() => moveRankingItem(idx, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {question.format === "priorities" ? (
            <div className={styles.prioritiesList}>
              {prioritiesRows.map((row, idx) => (
                <div key={idx} className={styles.priorityGroup}>
                  <span className={styles.priorityIndex}>
                    {t.session.priorityGroupLabelPrefix} 0{idx + 1} ·{" "}
                    {t.session.priorityInYourWordsSuffix}
                  </span>
                  <div className={styles.inputWithMicRow}>
                    <input
                      type="text"
                      className={styles.priorityInput}
                      placeholder={`${t.session.priorityPlaceholderPrefix} ${idx + 1}`}
                      value={row.priority}
                      onChange={(e) => {
                        const next = [...prioritiesRows];
                        next[idx] = { ...next[idx], priority: e.target.value };
                        setPrioritiesRows(next);
                      }}
                    />
                    <VoiceMicButton
                      compact
                      disabled={submitting}
                      onTranscript={(spoken) => {
                        setUsedVoiceForCurrent(true);
                        setPrioritiesRows((prev) => {
                          const next = [...prev];
                          next[idx] = {
                            ...next[idx],
                            priority: appendTranscript(
                              next[idx].priority,
                              spoken,
                            ),
                          };
                          return next;
                        });
                      }}
                    />
                  </div>
                  <div className={styles.inputWithMicRow}>
                    <input
                      type="text"
                      className={styles.priorityInput}
                      placeholder={t.session.nextStepPlaceholder}
                      value={row.step}
                      onChange={(e) => {
                        const next = [...prioritiesRows];
                        next[idx] = { ...next[idx], step: e.target.value };
                        setPrioritiesRows(next);
                      }}
                    />
                    <VoiceMicButton
                      compact
                      disabled={submitting}
                      onTranscript={(spoken) => {
                        setUsedVoiceForCurrent(true);
                        setPrioritiesRows((prev) => {
                          const next = [...prev];
                          next[idx] = {
                            ...next[idx],
                            step: appendTranscript(next[idx].step, spoken),
                          };
                          return next;
                        });
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {question.format === "short" || question.format === "long" ? (
            <div className={styles.answerBoxGroup}>
              <textarea
                className={
                  question.format === "long"
                    ? `${styles.textarea} ${styles.textareaLong}`
                    : `${styles.textarea} ${styles.textareaShort}`
                }
                placeholder={t.session.textareaPlaceholder}
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                autoFocus
              />
              <VoiceMicButton
                disabled={submitting}
                onTranscript={(spoken) => {
                  setUsedVoiceForCurrent(true);
                  setAnswerText((prev) => appendTranscript(prev, spoken));
                }}
              />
            </div>
          ) : null}

          {errorMessage ? (
            <div className={styles.errorBox} role="alert">
              {errorMessage}
            </div>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.submitButton}
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
            >
              {submitting ? t.session.listeningBtn : t.session.continueBtn}
            </button>

            {canExitThisPass ? (
              <button
                type="button"
                className={styles.exitIdkButton}
                disabled={submitting}
                onClick={() => void handleSubmit("I don't know")}
              >
                {t.session.idkExitBtn}
              </button>
            ) : null}
          </div>
        </main>
      ) : null}

      <footer className={styles.footer}>
        <p className={styles.disclaimer}>{t.meta.disclaimer}</p>
      </footer>
    </div>
  );
}
