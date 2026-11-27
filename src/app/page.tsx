/**
 * Spiral Landing Screen (`src/app/page.tsx`).
 *
 * Feature overview & use cases:
 * - Explains Spiral in one calm screen per `Design.md` Screen 1:
 *   1. One-line promise for people at a turning point
 *   2. Primary action: "Start your Spiral" leading to `/start`
 *   3. Mandatory non-clinical disclaimer in the footer
 * - Built to feel spacious and unhurried ("designed to end, not to hook").
 */

import Link from "next/link";
import { APP_META } from "@/lib/config";
import { logInfo } from "@/lib/log";
import styles from "./page.module.css";

/**
 * Renders the single-screen Landing page introducing Spiral and linking to `/start`.
 */
export default function LandingPage() {
  logInfo("LandingPage.render");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>Spiral</span>
        <span className={styles.cadence}>5 days · 10h gap</span>
      </header>

      <main className={styles.main}>
        <p className={styles.eyebrow}>Clarity guide · Fixed 5-day structure</p>
        <h1 className={styles.promise}>{APP_META.promise}</h1>
        <p className={styles.subcopy}>
          Five daily sessions of 15 to 20 minutes, one question at a time, with
          a ten-hour gap between days. Spiral asks clear questions and reflects
          your own words back without opinions or advice — then it ends.
        </p>
        <div className={styles.actions}>
          <Link
            href="/start"
            prefetch={false}
            className={styles.startButton}
          >
            Start your Spiral
          </Link>
        </div>
      </main>

      <footer className={styles.footer}>
        <p className={styles.disclaimer}>{APP_META.disclaimer}</p>
      </footer>
    </div>
  );
}
