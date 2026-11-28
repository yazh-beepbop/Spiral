/**
 * Consent & Entry Screen (`src/app/start/page.tsx`).
 *
 * Feature overview & use cases:
 * - Implements `Design.md` Screen 2 (`Start`) with full i18n (`en`, `hinglish`, `hi`, `ta`):
 *   1. Onboarding language picker (`OnboardingLanguagePicker`) + header Settings control
 *   2. Explains what to expect (5 days, 15 to 20 minutes, 10-hour gap)
 *   3. Displays the Career Fog entry point and support link to `/paused`
 *   4. Enforces mandatory 18+ age attestation before journey creation
 *   5. Persists chosen `language` to `POST /api/journey/start` (and `POST /api/demo/seed`)
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  OnboardingLanguagePicker,
  SettingsLanguageButton,
} from "@/components/LanguagePicker";
import { useI18n } from "@/components/LanguageProvider";
import { authorizedFetch } from "@/lib/firebase/client";
import { logError, logInfo } from "@/lib/log";
import styles from "./page.module.css";

interface StartResponse {
  journeyId?: string;
  status?: string;
  language?: string;
  error?: string;
}

/**
 * Renders the `/start` onboarding language picker, 18+ consent, and Career Fog entry screen.
 */
export default function StartPage() {
  const router = useRouter();
  const { language, syncLanguageFromServer, t } = useI18n();
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
        // Demo endpoint disabled in prod
      }
    };
    void checkDemoStatus();
  }, []);

  /**
   * Signs in anonymously and starts (or resumes) the visitor's Career Fog journey in `language`.
   */
  const handleStartJourney = async (): Promise<void> => {
    if (!attested18 || submitting) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    logInfo("StartPage.handleStartJourney", { language });

    try {
      const response = await authorizedFetch("/api/journey/start", {
        method: "POST",
        createSessionIfMissing: true,
        body: JSON.stringify({
          ageAttested18: true,
          entryPoint: "career_fog",
          language,
        }),
      });

      const payload = (await response.json()) as StartResponse;
      if (!response.ok) {
        setErrorMessage(payload.error ?? t.start.errStartFailed);
        setSubmitting(false);
        return;
      }

      if (payload.language) {
        syncLanguageFromServer(payload.language);
      }

      if (payload.status === "paused") {
        router.push("/paused");
        return;
      }
      router.push("/session");
    } catch (error: unknown) {
      logError("StartPage.handleStartJourney.failed", error);
      setErrorMessage(t.start.errConnectFailed);
      setSubmitting(false);
    }
  };

  /**
   * Seeds the Days 1–4 demo journey when `DEMO_MODE=true` using the visitor's chosen `language`.
   */
  const handleLoadDemoDay5 = async (): Promise<void> => {
    if (!attested18 || submitting) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    logInfo("StartPage.handleLoadDemoDay5", { language });

    try {
      const response = await authorizedFetch("/api/demo/seed", {
        method: "POST",
        createSessionIfMissing: true,
        body: JSON.stringify({ ageAttested18: true, language }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMessage(payload.error ?? t.start.errDemoFailed);
        setSubmitting(false);
        return;
      }
      router.push("/session");
    } catch (error: unknown) {
      logError("StartPage.handleLoadDemoDay5.failed", error);
      setErrorMessage(t.start.errDemoFailed);
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          {t.meta.brandName}
        </Link>
        <div className={styles.headerRight}>
          <span className={styles.stepLabel}>{t.start.stepLabel}</span>
          <SettingsLanguageButton />
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>{t.start.title}</h1>

        <p className={styles.supportBanner}>
          {t.start.supportPrefix}{" "}
          <Link href="/paused" className={styles.supportLink}>
            {t.start.supportLinkText}
          </Link>
        </p>

        <OnboardingLanguagePicker />

        <ul className={styles.expectations}>
          <li className={styles.expectationItem}>
            <span className={styles.bullet}>01</span>
            <span>{t.start.expectation1}</span>
          </li>
          <li className={styles.expectationItem}>
            <span className={styles.bullet}>02</span>
            <span>{t.start.expectation2}</span>
          </li>
          <li className={styles.expectationItem}>
            <span className={styles.bullet}>03</span>
            <span>{t.start.expectation3}</span>
          </li>
        </ul>

        <section className={styles.entryCard} aria-label={t.start.entryName}>
          <div className={styles.entryHeader}>
            <h2 className={styles.entryName}>{t.start.entryName}</h2>
            <span className={styles.entryTag}>{t.start.entryTag}</span>
          </div>
          <p className={styles.entryQuote}>{t.start.entryQuote}</p>
        </section>

        <label className={styles.consentRow}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={attested18}
            onChange={(e) => setAttested18(e.target.checked)}
          />
          <span className={styles.consentText}>{t.start.consentText}</span>
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
            {submitting ? t.start.openingDay1 : t.start.beginDay1}
          </button>

          {demoAvailable ? (
            <button
              type="button"
              className={styles.demoButton}
              disabled={!attested18 || submitting}
              onClick={() => void handleLoadDemoDay5()}
            >
              {t.start.loadDemoDay5}
            </button>
          ) : null}
        </div>
      </main>

      <footer className={styles.footer}>
        <p className={styles.disclaimer}>{t.meta.disclaimer}</p>
      </footer>
    </div>
  );
}
