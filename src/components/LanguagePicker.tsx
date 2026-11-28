/**
 * Onboarding and Settings Language Picker components (`src/components/LanguagePicker.tsx`).
 *
 * Feature overview & use cases:
 * - `OnboardingLanguagePicker`: inline selector displayed on `/start` so visitors choose
 *   English, Hinglish, Hindi, or Tamil right during onboarding.
 * - `SettingsLanguageButton`: compact header control + modal dialog available across screens
 *   (`/` , `/start`, `/session`, `/bridge`, `/synthesis`, `/paused`) so visitors can switch
 *   languages in Settings at any time.
 */

"use client";

import { useState } from "react";
import { useI18n } from "@/components/LanguageProvider";
import { getLanguageMeta, SUPPORTED_LANGUAGES } from "@/lib/i18n";
import styles from "./LanguagePicker.module.css";

/**
 * Renders the inline 4-language picker card on `/start` during onboarding.
 */
export function OnboardingLanguagePicker() {
  const { language, setLanguage, t } = useI18n();

  return (
    <section
      className={styles.onboardingCard}
      aria-label={t.start.languagePickerLabel}
    >
      <div className={styles.onboardingHeader}>
        <span className={styles.labelMono}>{t.start.languagePickerLabel}</span>
      </div>
      <p className={styles.hint}>{t.start.languagePickerHint}</p>
      <div className={styles.optionGrid} role="radiogroup">
        {SUPPORTED_LANGUAGES.map((opt) => {
          const active = opt.code === language;
          return (
            <button
              key={opt.code}
              type="button"
              role="radio"
              aria-checked={active}
              className={
                active
                  ? `${styles.optionBtn} ${styles.optionBtnActive}`
                  : styles.optionBtn
              }
              onClick={() => void setLanguage(opt.code)}
            >
              <span className={styles.optionPrimary}>{opt.label}</span>
              {opt.nativeLabel !== opt.label ? (
                <span className={styles.optionNative}>{opt.nativeLabel}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Renders a header Settings pill that opens the Language Settings modal on any screen.
 */
export function SettingsLanguageButton() {
  const { language, savingLanguage, setLanguage, t } = useI18n();
  const [open, setOpen] = useState(false);
  const currentMeta = getLanguageMeta(language);

  return (
    <>
      <button
        type="button"
        className={styles.triggerBtn}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span>{t.settings.buttonLabel}</span>
        <span className={styles.triggerCode}>· {currentMeta.label}</span>
      </button>

      {open ? (
        <div
          className={styles.backdrop}
          role="dialog"
          aria-modal="true"
          aria-label={t.settings.dialogTitle}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setOpen(false);
            }
          }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{t.settings.dialogTitle}</h2>
              {savingLanguage ? (
                <span className={styles.savingBadge}>
                  {t.settings.savingStatus}
                </span>
              ) : null}
            </div>
            <p className={styles.hint}>{t.settings.languageHint}</p>

            <div className={styles.optionGrid} role="radiogroup">
              {SUPPORTED_LANGUAGES.map((opt) => {
                const active = opt.code === language;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={
                      active
                        ? `${styles.optionBtn} ${styles.optionBtnActive}`
                        : styles.optionBtn
                    }
                    onClick={() => void setLanguage(opt.code)}
                  >
                    <span className={styles.optionPrimary}>{opt.label}</span>
                    {opt.nativeLabel !== opt.label ? (
                      <span className={styles.optionNative}>
                        {opt.nativeLabel}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.doneBtn}
                onClick={() => setOpen(false)}
              >
                {t.settings.closeButton}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
