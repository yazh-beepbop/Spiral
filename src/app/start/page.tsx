/**
 * Consent & Entry Screen (`src/app/start/page.tsx`).
 *
 * Feature overview & use cases:
 * - Implements `Design.md` Screen 2 (`Start`):
 *   1. Explains what to expect (5 days, 15 to 20 minutes, a 10-hour gap between days)
 *   2. Displays today's active entry point: Career Fog ("I have options but nothing feels right.")
 *   3. Enforces the mandatory 18+ age attestation checkbox before sign-in or journey creation
 *   4. Signs the visitor in anonymously via Firebase Auth and calls `POST /api/journey/start`
 *   5. Optionally offers one-click Day 5 Demo Journey seeding when the server runs in `DEMO_MODE`
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { APP_META } from "@/lib/config";
import { authorizedFetch } from "@/lib/firebase/client";
import { logError, logInfo } from "@/lib/log";
import styles from "./page.module.css";

interface StartResponse {
  journeyId?: string;
  status?: string;
  error?: string;
}

/**
 * Renders the `/start` consent and Career Fog entry screen.
 */
export default function StartPage() {
  const router = useRouter();
  const [attested18, setAttested18] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [demoAvailable, setDemoAvailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    logInfo("StartPage.mount");
    const checkDemoStatus = async (): Promise<void> => {
      try {
        const res = await fetch("/api/demo/seed", { method: "GET" });
        if (res.ok) {
          const data = (await res.json()) as { demoMode?: boolean };
          setDemoAvailable(Boolean(data.demoMode));
        }
      } catch {
        // Demo endpoint optional until T11 or disabled in prod
      }
    };
    void checkDemoStatus();
  }, []);

  /**
   * Signs in anonymously and starts (or resumes) the visitor's Career Fog journey.
   */
  const handleStartJourney = async (): Promise<void> => {
    if (!attested18 || submitting) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    logInfo("StartPage.handleStartJourney");

    try {
      const response = await authorizedFetch("/api/journey/start", {
        method: "POST",
        createSessionIfMissing: true,
        body: JSON.stringify({
          ageAttested18: true,
          entryPoint: "career_fog",
        }),
      });

      const payload = (await response.json()) as StartResponse;
      if (!response.ok) {
        setErrorMessage(payload.error ?? "Could not start your Spiral.");
        setSubmitting(false);
        return;
      }

      if (payload.status === "paused") {
        router.push("/paused");
        return;
      }
      router.push("/session");
    } catch (error: unknown) {
      logError("StartPage.handleStartJourney.failed", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to connect. Check your configuration and try again.",
      );
      setSubmitting(false);
    }
  };

  /**
   * Seeds the Days 1–4 demo journey when `DEMO_MODE=true` so judges can run Day 5 live.
   */
  const handleLoadDemoDay5 = async (): Promise<void> => {
    if (!attested18 || submitting) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    logInfo("StartPage.handleLoadDemoDay5");

    try {
      const response = await authorizedFetch("/api/demo/seed", {
        method: "POST",
        createSessionIfMissing: true,
        body: JSON.stringify({ ageAttested18: true }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMessage(payload.error ?? "Could not load demo journey.");
        setSubmitting(false);
        return;
      }
      router.push("/session");
    } catch (error: unknown) {
      logError("StartPage.handleLoadDemoDay5.failed", error);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to seed demo journey.",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Spiral
        </Link>
        <span className={styles.stepLabel}>Before we begin</span>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>
          For after the first wave — when you&apos;re ready to make sense of it.
        </h1>

        <p className={styles.supportBanner}>
          Spiral helps you think clearly. If you&apos;re overwhelmed right now,{" "}
          <Link href="/paused" className={styles.supportLink}>
            here&apos;s support first.
          </Link>
        </p>

        <ul className={styles.expectations}>
          <li className={styles.expectationItem}>
            <span className={styles.bullet}>01</span>
            <span>
              Five fixed daily sessions of 15 to 20 minutes — one question at a
              time, no open-ended chatting, and a clear end.
            </span>
          </li>
          <li className={styles.expectationItem}>
            <span className={styles.bullet}>02</span>
            <span>
              Spiral asks neutral questions and reflects back your own words. It
              never gives opinions, takes sides, or offers advice.
            </span>
          </li>
          <li className={styles.expectationItem}>
            <span className={styles.bullet}>03</span>
            <span>
              Each session ends with one Bridge Question and a server-enforced
              10-hour gap so you have space to think offline.
            </span>
          </li>
        </ul>

        <section className={styles.entryCard} aria-label="Selected entry point">
          <div className={styles.entryHeader}>
            <h2 className={styles.entryName}>Career Fog</h2>
            <span className={styles.entryTag}>5-Day Trunk</span>
          </div>
          <p className={styles.entryQuote}>
            &ldquo;I have options but nothing feels right.&rdquo;
          </p>
        </section>

        <label className={styles.consentRow}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={attested18}
            onChange={(e) => setAttested18(e.target.checked)}
          />
          <span className={styles.consentText}>
            I am 18 years of age or older, and I understand that Spiral is a
            guided reflection tool — not therapy, medical advice, or a crisis
            service.
          </span>
        </label>

        {errorMessage ? (
          <div className={styles.errorBox} role="alert">
            {errorMessage}
          </div>
        ) : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!attested18 || submitting}
            onClick={() => void handleStartJourney()}
          >
            {submitting ? "Opening Day 1..." : "Begin Day 1"}
          </button>

          {demoAvailable ? (
            <button
              type="button"
              className={styles.demoButton}
              disabled={!attested18 || submitting}
              onClick={() => void handleLoadDemoDay5()}
            >
              Load Day 5 Demo Journey
            </button>
          ) : null}
        </div>
      </main>

      <footer className={styles.footer}>
        <p className={styles.disclaimer}>{APP_META.disclaimer}</p>
      </footer>
    </div>
  );
}
