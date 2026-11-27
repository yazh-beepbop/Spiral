/**
 * Acute Safety Pause Screen (`src/app/paused/page.tsx`).
 *
 * Feature overview & use cases:
 * - Implements `Design.md` Screen 7 (`Paused`):
 *   1. Calm full-screen pause when an answer triggers an `acute` safety classification
 *   2. Displays India-first support resources (`Tele-MANAS 14416`, `Emergency 112`) and
 *      international emergency instructions from `src/lib/safety/resources.ts`
 *   3. Reassures the person: "Your journey is saved. You can come back when you're ready."
 *   4. Allows resuming the saved journey when ready (`POST /api/journey/resume`)
 */

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { APP_META } from "@/lib/config";
import { authorizedFetch } from "@/lib/firebase/client";
import { logError, logInfo } from "@/lib/log";
import {
  INDIA_HELPLINE_RESOURCES,
  SAFETY_PAUSE_COPY,
} from "@/lib/safety/resources";
import styles from "./page.module.css";

/**
 * Renders the calm full-screen support resources view after an acute safety pause.
 */
export default function PausedPage() {
  const router = useRouter();
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
          Spiral
        </Link>
        <span className={styles.statusTag}>{SAFETY_PAUSE_COPY.eyebrow}</span>
      </header>

      <main className={styles.main}>
        <h1 className={styles.heading}>{SAFETY_PAUSE_COPY.heading}</h1>
        <p className={styles.body}>{SAFETY_PAUSE_COPY.body}</p>

        <section className={styles.helplineList} aria-label="Support resources">
          {INDIA_HELPLINE_RESOURCES.map((resource) => (
            <div key={resource.id} className={styles.helplineCard}>
              <div className={styles.helplineHeader}>
                <h2 className={styles.helplineName}>{resource.name}</h2>
                <a
                  href={`tel:${resource.number}`}
                  className={styles.phoneLink}
                >
                  Call {resource.number}
                  {resource.alternateNumber
                    ? ` / ${resource.alternateNumber}`
                    : ""}
                </a>
              </div>
              <p className={styles.availability}>{resource.availability}</p>
              <p className={styles.helplineDesc}>{resource.description}</p>
            </div>
          ))}
        </section>

        <div className={styles.internationalBox}>
          {SAFETY_PAUSE_COPY.internationalNote}
        </div>

        <p className={styles.savedNotice}>{SAFETY_PAUSE_COPY.savedNotice}</p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.resumeButton}
            disabled={resuming}
            onClick={() => void handleResumeWhenReady()}
          >
            {resuming
              ? "Returning to your Spiral..."
              : "Return to my saved journey when ready"}
          </button>
        </div>
      </main>

      <footer className={styles.footer}>
        <p className={styles.disclaimer}>{APP_META.disclaimer}</p>
      </footer>
    </div>
  );
}
