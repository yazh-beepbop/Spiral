/**
 * Spiral Landing Screen (`src/app/page.tsx`).
 *
 * Feature overview & use cases:
 * - Explains Spiral in one calm screen per `Design.md` Screen 1 using localized i18n copy
 *   (`en`, `hinglish`, `hi`, `ta`) with zero hardcoded strings.
 * - Includes `SettingsLanguageButton` in the header so visitors can switch language immediately.
 */

"use client";

import Link from "next/link";
import { SettingsLanguageButton } from "@/components/LanguagePicker";
import { useI18n } from "@/components/LanguageProvider";
import { logInfo } from "@/lib/log";
import styles from "./page.module.css";

/**
 * Renders the single-screen Landing page introducing Spiral and linking to `/start`.
 */
export default function LandingPage() {
  const { t } = useI18n();
  logInfo("LandingPage.render");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>{t.meta.brandName}</span>
        <div className={styles.headerRight}>
          <span className={styles.cadence}>{t.landing.cadenceTag}</span>
          <SettingsLanguageButton />
        </div>
      </header>

      <main className={styles.main}>
        <p className={styles.eyebrow}>{t.landing.eyebrow}</p>
        <h1 className={styles.promise}>{t.meta.promise}</h1>
        <p className={styles.subcopy}>{t.landing.subcopy}</p>
        <div className={styles.actions}>
          <Link href="/start" prefetch={false} className={styles.startButton}>
            {t.landing.startCta}
          </Link>
        </div>
      </main>

      <footer className={styles.footer}>
        <p className={styles.disclaimer}>{t.meta.disclaimer}</p>
      </footer>
    </div>
  );
}
