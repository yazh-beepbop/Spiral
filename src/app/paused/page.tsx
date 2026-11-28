/**
 * Acute Safety Pause Screen (`src/app/paused/page.tsx`).
 *
 * Feature overview & use cases:
 * - Implements `Design.md` Screen 7 (`Paused`) across all four languages (`en`, `hinglish`,
 *   `hi`, `ta`) without altering protected phone numbers in `src/lib/safety/resources.ts`:
 *   1. Calm full-screen pause when an answer (typed or voice-transcribed) triggers an `acute`
 *      safety classification, or when opened from the onboarding support link
 *   2. Displays India-first support resources (`Tele-MANAS 14416`, `Emergency 112`) and
 *      international emergency instructions in the person's selected language
 *   3. Includes `SettingsLanguageButton` so someone in distress can switch language immediately
 *   4. Allows resuming the saved journey when ready (`POST /api/journey/resume`).
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SettingsLanguageButton } from "@/components/LanguagePicker";
import { useI18n } from "@/components/LanguageProvider";
import { authorizedFetch } from "@/lib/firebase/client";
import { logError, logInfo } from "@/lib/log";
import { INDIA_HELPLINE_RESOURCES } from "@/lib/safety/resources";
import styles from "./page.module.css";

/**
 * Renders the calm full-screen support resources view in the visitor's chosen language.
 */
export default function PausedPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [resuming, setResuming] = useState(false);

  /**
   * Resumes the saved journey when the person chooses to return.
   */
  const handleResumeWhenReady = async (): Promise<void> => {
    if (resuming) {
      return;
    }
    setResuming(true);
    logInfo("PausedPage.handleResumeWhenReady");
    try {
      const res = await authorizedFetch("/api/journey/resume", {
        method: "POST",
      });
      if (res.ok) {
        router.push("/session");
        return;
      }
      router.push("/start");
    } catch (error: unknown) {
      logError("PausedPage.handleResumeWhenReady.failed", error);
      router.push("/start");
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          {t.meta.brandName}
        </Link>
        <div className={styles.headerRight}>
          <span className={styles.statusTag}>{t.paused.eyebrow}</span>
          <SettingsLanguageButton />
        </div>
      </header>

      <main className={styles.main}>
        <h1 className={styles.heading}>{t.paused.heading}</h1>
        <p className={styles.body}>{t.paused.body}</p>

        <section
          className={styles.helplineList}
          aria-label={t.paused.resourcesAriaLabel}
        >
          {INDIA_HELPLINE_RESOURCES.map((resource) => {
            const copy =
              resource.id === "tele-manas"
                ? t.paused.helplines.teleManas
                : t.paused.helplines.emergency112;
            return (
              <div key={resource.id} className={styles.helplineCard}>
                <div className={styles.helplineHeader}>
                  <h2 className={styles.helplineName}>{copy.name}</h2>
                  <a
                    href={`tel:${resource.number}`}
                    className={styles.phoneLink}
                  >
                    {copy.callPrefix} {resource.number}
                    {resource.alternateNumber
                      ? ` / ${resource.alternateNumber}`
                      : ""}
                  </a>
                </div>
                <p className={styles.availability}>{copy.availability}</p>
                <p className={styles.helplineDesc}>{copy.description}</p>
              </div>
            );
          })}
        </section>

        <div className={styles.internationalBox}>
          {t.paused.internationalNote}
        </div>

        <p className={styles.savedNotice}>{t.paused.savedNotice}</p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.resumeButton}
            disabled={resuming}
            onClick={() => void handleResumeWhenReady()}
          >
            {resuming ? t.paused.resumingBtn : t.paused.resumeBtn}
          </button>
        </div>
      </main>

      <footer className={styles.footer}>
        <p className={styles.disclaimer}>{t.meta.disclaimer}</p>
      </footer>
    </div>
  );
}
