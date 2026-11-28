/**
 * Central i18n lookup and question localization helpers (`src/lib/i18n/index.ts`).
 *
 * Feature overview & use cases:
 * - Maps language codes (`en`, `hinglish`, `hi`, `ta`) to their exhaustive `TranslationDictionary`
 *   without touching the protected English question bank in `src/lib/journey/questions.ts`.
 * - Provides server- and client-safe helpers for normalizing language codes, resolving HTML
 *   `lang` attributes, describing target output languages inside Gemini prompts, and localizing
 *   Career Fog questions, choices, ranking items, Openers, and IDK redirects.
 */

import { EN_DICTIONARY } from "@/lib/i18n/en";
import { HI_DICTIONARY } from "@/lib/i18n/hi";
import { HINGLISH_DICTIONARY } from "@/lib/i18n/hinglish";
import { TA_DICTIONARY } from "@/lib/i18n/ta";
import {
  type DayTranslation,
  type LanguageOptionMeta,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
  type TranslationDictionary,
} from "@/lib/i18n/types";
import {
  getDayMetadata,
  getQuestionByQid,
  type QuestionDefinition,
} from "@/lib/journey/questions";
import { logInfo } from "@/lib/log";

const DICTIONARIES: Record<SupportedLanguage, TranslationDictionary> = {
  en: EN_DICTIONARY,
  hinglish: HINGLISH_DICTIONARY,
  hi: HI_DICTIONARY,
  ta: TA_DICTIONARY,
};

/**
 * Normalizes an arbitrary string or header into a valid `SupportedLanguage`, defaulting to `"en"`.
 */
export function normalizeLanguage(raw: string | null | undefined): SupportedLanguage {
  const cleaned = raw?.trim().toLowerCase();
  if (cleaned === "hinglish" || cleaned === "hi-latn") {
    return "hinglish";
  }
  if (cleaned === "hi" || cleaned === "hi-in") {
    return "hi";
  }
  if (cleaned === "ta" || cleaned === "ta-in") {
    return "ta";
  }
  return "en";
}

/**
 * Returns the full `TranslationDictionary` for `language`.
 */
export function getTranslations(
  language: SupportedLanguage = "en",
): TranslationDictionary {
  return DICTIONARIES[language] ?? EN_DICTIONARY;
}

/**
 * Returns metadata (`label`, `nativeLabel`, `htmlLang`, `geminiName`) for `language`.
 */
export function getLanguageMeta(
  language: SupportedLanguage = "en",
): LanguageOptionMeta {
  return (
    SUPPORTED_LANGUAGES.find((item) => item.code === language) ??
    SUPPORTED_LANGUAGES[0]
  );
}

/**
 * Returns a strict prompt instruction block telling Gemini which language and script to write in.
 */
export function buildGeminiLanguageDirective(
  language: SupportedLanguage = "en",
): string {
  logInfo("i18n.buildGeminiLanguageDirective", { language });
  if (language === "en") {
    return "LANGUAGE RULE: Write in clear, plain-spoken English.";
  }
  if (language === "hinglish") {
    return "LANGUAGE RULE: Write in natural, conversational Hinglish (Roman script mixing everyday Hindi and English as spoken in urban India). Keep sentences short, plain-spoken, neutral, warm, and completely free of advice or clinical jargon.";
  }
  if (language === "hi") {
    return "LANGUAGE RULE: Write in natural, plain-spoken conversational Hindi in Devanagari script (हिन्दी). Avoid stiff textbook Sanskritized words, clinical labels, or advice.";
  }
  return "LANGUAGE RULE: Write in natural, plain-spoken everyday Tamil in Tamil script (தமிழ்). Keep sentences clear, warm, neutral, and completely free of clinical labels or advice.";
}

/**
 * Returns localized day title and header label (`1..5`) for `language`.
 */
export function getLocalizedDayMetadata(
  day: number,
  language: SupportedLanguage = "en",
): DayTranslation & { qids: readonly number[] } {
  const base = getDayMetadata(day);
  const dict = getTranslations(language);
  const localized = dict.days[base.day];
  return {
    title: localized?.title ?? base.title,
    headerLabel: localized?.headerLabel ?? base.headerLabel,
    qids: base.qids,
  };
}

/**
 * Returns a localized copy of `QuestionDefinition` for `qid` in `language` without mutating
 * the canonical `CAREER_FOG_QUESTIONS` map.
 */
export function getLocalizedQuestion(
  qid: number,
  language: SupportedLanguage = "en",
): QuestionDefinition | null {
  const base = getQuestionByQid(qid);
  if (!base) {
    return null;
  }
  if (language === "en") {
    return base;
  }
  const dict = getTranslations(language);
  const localized = dict.questions[qid];
  if (!localized) {
    return base;
  }
  return {
    ...base,
    text: localized.text,
    choices: localized.choices ?? base.choices,
    rankingItems: localized.rankingItems ?? base.rankingItems,
    idkRedirect: localized.idkRedirect ?? base.idkRedirect,
  };
}

/**
 * Formats the Day 2–5 Opener question (`QID 6`) in `language`, embedding yesterday's Bridge.
 */
export function formatLocalizedOpenerQuestion(
  previousBridgeText: string | null,
  language: SupportedLanguage = "en",
): string {
  logInfo("i18n.formatLocalizedOpenerQuestion", {
    hasPreviousBridge: Boolean(previousBridgeText),
    language,
  });
  const dict = getTranslations(language);
  const cleanBridge = previousBridgeText?.trim();
  if (!cleanBridge) {
    return dict.opener.withoutBridge;
  }
  return dict.opener.withBridgeTemplate.replace("[Bridge]", `"${cleanBridge}"`);
}

export { SUPPORTED_LANGUAGES, type SupportedLanguage, type TranslationDictionary };
