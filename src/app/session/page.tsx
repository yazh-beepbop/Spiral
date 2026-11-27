/**
 * Daily Session Screen (`src/app/session/page.tsx`).
 *
 * Feature overview & use cases:
 * - Implements `Design.md` Screen 3 (`Session`):
 *   1. Loads authoritative server state from `GET /api/session/current`
 *   2. Redirects automatically if locked (`/bridge`), paused (`/paused`), complete (`/synthesis`),
 *      or not yet started (`/start`)
 *   3. Presents strictly ONE question per screen with mono day header, progress dots,
 *      appropriate input (`choice`, `ranking`, `short`, `long`), and soft fade-in motion
 *   4. Displays Standard Mode `"I don't know"` redirects inline without losing focus
 *   5. Calls `POST /api/bridge` as soon as the day's final answer saves and routes to `/bridge`
 */

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { APP_META } from "@/lib/config";
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
 * Renders the single-question-per-screen Spiral daily inquiry view.
 */
export default function SessionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [writingBridge, setWritingBridge] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [headerLabel, setHeaderLabel] = useState("DAY 1 · SURFACE MAPPING");
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
   * Resets answer input controls whenever a new question becomes active.
   */
  const applyNewQuestion = useCallback((nextQ: ActiveQuestionPayload) => {
    setQuestion(nextQ);
    setAnswerText("");
    setSelectedChoice("");
    setRankingOrder(nextQ.rankingItems ? [...nextQ.rankingItems] : []);
    setPrioritiesRows([
      { priority: "", step: "" },
      { priority: "", step: "" },
      { priority: "", step: "" },
    ]);
    setRedirectPrompt(null);
    setCanExitThisPass(nextQ.priorIdkCount >= 2);
    setErrorMessage(null);
  }, []);

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
        setErrorMessage(
          errData.error ?? "Unable to write today's Bridge Question.",
        );
        setWritingBridge(false);
        return;
      }
      router.push("/bridge");
    } catch (error: unknown) {
      logError("SessionPage.finalizeDayBridge.failed", error);
      setErrorMessage("Could not generate today's Bridge. Please try again.");
      setWritingBridge(false);
    }
  }, [router]);

  useEffect(() => {
    logInfo("SessionPage.mount");
    const loadSession = async (): Promise<void> => {
      try {
        const res = await authorizedFetch("/api/session/current", {
          method: "GET",
        });
        if (res.status === 401) {
          router.replace("/start");
          return;
        }
        const data = (await res.json()) as SessionCurrentResponse;
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
              setHeaderLabel(data.headerLabel ?? `DAY ${data.day ?? 1}`);
              setQuestionIndex(data.questionIndex ?? 0);
              setTotalQuestions(data.totalQuestions ?? 5);
              applyNewQuestion(data.question);
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
        setErrorMessage("Unable to load your session. Refresh to try again.");
        setLoading(false);
      }
    };
    void loadSession();
  }, [applyNewQuestion, finalizeDayBridge, router]);

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
            `${idx + 1}. Priority: ${r.priority.trim()} — Next step: ${r.step.trim()}`,
        )
        .join("\n");
    }
    return answerText.trim();
  };

  /**
   * Submits the current answer (or an explicit third-pass IDK exit) to `POST /api/answer`.
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
    });

    try {
      const res = await authorizedFetch("/api/answer", {
        method: "POST",
        body: JSON.stringify({
          qid: question.qid,
          text: submission,
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
        setErrorMessage(data.error ?? "Unable to save your answer.");
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
        setSubmitting(false);
        return;
      }

      if (data.action === "day_complete") {
        setSubmitting(false);
        await finalizeDayBridge();
        return;
      }

      if (data.action === "next_question" && data.question) {
        setGentleCheckIn(
          data.idkExitMessage ?? data.gentleCheckIn ?? null,
        );
        setHeaderLabel(data.headerLabel ?? headerLabel);
        setQuestionIndex(data.questionIndex ?? questionIndex + 1);
        setTotalQuestions(data.totalQuestions ?? totalQuestions);
        applyNewQuestion(data.question);
        setSubmitting(false);
      }
    } catch (error: unknown) {
      logError("SessionPage.handleSubmit.failed", error);
      setErrorMessage("Connection interrupted. Your progress is safe — try again.");
      setSubmitting(false);
    }
  };

  if (loading || writingBridge) {
    return (
      <div className={styles.page}>
        <header className={styles.topBar}>
          <span className={styles.dayLabel}>SPIRAL</span>
        </header>
        <div className={styles.loadingWrap}>
          {writingBridge
            ? "Sitting with today's answers to write your Bridge..."
            : "Opening today's session..."}
        </div>
        <footer className={styles.footer}>
          <p className={styles.disclaimer}>{APP_META.disclaimer}</p>
        </footer>
      </div>
    );
  }

  const canSubmit = Boolean(resolveCurrentSubmission()) && !submitting;

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <span className={styles.dayLabel}>{headerLabel}</span>
        <div className={styles.dots} aria-label="Session progress">
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
              <p className={styles.rankingHint}>
                ORDER FROM MOST IMPORTANT (1) TO LEAST (5)
              </p>
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
                      aria-label={`Move ${item} up`}
                      onClick={() => moveRankingItem(idx, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={styles.rankArrow}
                      disabled={idx === rankingOrder.length - 1}
                      aria-label={`Move ${item} down`}
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
                    Priority 0{idx + 1} · In your words
                  </span>
                  <input
                    type="text"
                    className={styles.priorityInput}
                    placeholder={`Priority ${idx + 1}`}
                    value={row.priority}
                    onChange={(e) => {
                      const next = [...prioritiesRows];
                      next[idx] = { ...next[idx], priority: e.target.value };
                      setPrioritiesRows(next);
                    }}
                  />
                  <input
                    type="text"
                    className={styles.priorityInput}
                    placeholder="One small next step"
                    value={row.step}
                    onChange={(e) => {
                      const next = [...prioritiesRows];
                      next[idx] = { ...next[idx], step: e.target.value };
                      setPrioritiesRows(next);
                    }}
                  />
                </div>
              ))}
            </div>
          ) : null}

          {question.format === "short" || question.format === "long" ? (
            <textarea
              className={
                question.format === "long"
                  ? `${styles.textarea} ${styles.textareaLong}`
                  : `${styles.textarea} ${styles.textareaShort}`
              }
              placeholder="Write honestly, in your own words..."
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              autoFocus
            />
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
              {submitting ? "Listening..." : "Continue"}
            </button>

            {canExitThisPass ? (
              <button
                type="button"
                className={styles.exitIdkButton}
                disabled={submitting}
                onClick={() => void handleSubmit("I don't know")}
              >
                It&apos;s fine not to know. We can move on.
              </button>
            ) : null}
          </div>
        </main>
      ) : null}

      <footer className={styles.footer}>
        <p className={styles.disclaimer}>{APP_META.disclaimer}</p>
      </footer>
    </div>
  );
}
