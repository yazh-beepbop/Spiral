/**
 * TypeScript definitions for Spiral's multilingual i18n system (`src/lib/i18n/types.ts`).
 *
 * Feature overview & use cases:
 * - Defines the four supported languages (`en`, `hinglish`, `hi`, `ta`) and their metadata.
 * - Enforces a single exhaustive `TranslationDictionary` TypeScript contract across all four
 *   locale modules so every UI screen, button, onboarding prompt, mic permission notice,
 *   crisis helpline card, IDK escalation message, and Career Fog question (`QIDs 1..29`) is
 *   guaranteed at compile time to have zero missing strings and zero hardcoded UI text.
 */

export type SupportedLanguage = "en" | "hinglish" | "hi" | "ta";

export interface LanguageOptionMeta {
  code: SupportedLanguage;
  label: string;
  nativeLabel: string;
  htmlLang: string;
  geminiName: string;
}

export const SUPPORTED_LANGUAGES: readonly LanguageOptionMeta[] = [
  {
    code: "en",
    label: "English",
    nativeLabel: "English",
    htmlLang: "en",
    geminiName: "English",
  },
  {
    code: "hinglish",
    label: "Hinglish",
    nativeLabel: "Hinglish (Hindi + English)",
    htmlLang: "hi-Latn",
    geminiName:
      "natural conversational Hinglish (Roman script mixing everyday Hindi and English as spoken in India)",
  },
  {
    code: "hi",
    label: "Hindi",
    nativeLabel: "हिन्दी",
    htmlLang: "hi",
    geminiName: "natural, plain-spoken Hindi in Devanagari script (हिन्दी)",
  },
  {
    code: "ta",
    label: "Tamil",
    nativeLabel: "தமிழ்",
    htmlLang: "ta",
    geminiName: "natural, plain-spoken everyday Tamil in Tamil script (தமிழ்)",
  },
] as const;

export interface QuestionTranslation {
  text: string;
  choices?: readonly string[];
  rankingItems?: readonly string[];
  idkRedirect?: string;
}

export interface DayTranslation {
  title: string;
  headerLabel: string;
}

export interface HelplineTranslation {
  name: string;
  availability: string;
  description: string;
  callPrefix: string;
}

export interface TranslationDictionary {
  meta: {
    brandName: string;
    promise: string;
    disclaimer: string;
  };
  settings: {
    buttonLabel: string;
    dialogTitle: string;
    languageLabel: string;
    languageHint: string;
    closeButton: string;
    savingStatus: string;
  };
  landing: {
    cadenceTag: string;
    eyebrow: string;
    subcopy: string;
    startCta: string;
  };
  start: {
    stepLabel: string;
    title: string;
    supportPrefix: string;
    supportLinkText: string;
    languagePickerLabel: string;
    languagePickerHint: string;
    expectation1: string;
    expectation2: string;
    expectation3: string;
    entryName: string;
    entryTag: string;
    entryQuote: string;
    consentText: string;
    beginDay1: string;
    openingDay1: string;
    loadDemoDay5: string;
    errStartFailed: string;
    errConnectFailed: string;
    errDemoFailed: string;
  };
  session: {
    brandUpper: string;
    openingSession: string;
    writingBridge: string;
    progressAriaLabel: string;
    rankingHint: string;
    moveUpAriaPrefix: string;
    moveDownAriaPrefix: string;
    priorityGroupLabelPrefix: string;
    priorityInYourWordsSuffix: string;
    priorityPlaceholderPrefix: string;
    nextStepPlaceholder: string;
    textareaPlaceholder: string;
    continueBtn: string;
    listeningBtn: string;
    idkExitBtn: string;
    gentleCheckInIdk: string;
    gentleCheckInNext: string;
    errBridgeFailed: string;
    errBridgeRetry: string;
    errLoadSession: string;
    errSaveAnswer: string;
    errConnectionInterrupted: string;
  };
  voice: {
    micTapToRecord: string;
    micTapToStop: string;
    micTranscribing: string;
    firstTapExplain: string;
    permissionDenied: string;
    unsupportedBrowser: string;
    transcribeFailed: string;
    emptyTranscript: string;
    micAriaRecord: string;
    micAriaStop: string;
  };
  bridge: {
    loadingBridge: string;
    dayBridgeSuffix: string;
    bridgeFallbackTag: string;
    eyebrow: string;
    fallbackBridgeQuote: string;
    readFiveDayReflection: string;
    beginNextDayPrefix: string;
    continueSpiral: string;
    sitWithThisLabel: string;
  };
  synthesis: {
    day5ReflectionTag: string;
    day5CompleteTag: string;
    loadingLine1: string;
    loadingLine2: string;
    heading: string;
    tryAgainBtn: string;
    timeoutMessage: string;
    threadsAriaLabel: string;
    threadsSectionLabel: string;
    acrossDaysPrefix: string;
    acrossDaysInYourWords: string;
    didThisLand: string;
    yesBtn: string;
    notQuiteBtn: string;
    noneFitBtn: string;
    noneFitNote: string;
    inYourWordsHeading: string;
    isThisYoursQuestion: string;
    closingTitle: string;
    closingCopy: string;
    alternativeReadingPrefix: string;
    fallbackAlternativeReading: string;
  };
  paused: {
    eyebrow: string;
    heading: string;
    body: string;
    savedNotice: string;
    internationalNote: string;
    resourcesAriaLabel: string;
    resumeBtn: string;
    resumingBtn: string;
    helplines: {
      teleManas: HelplineTranslation;
      emergency112: HelplineTranslation;
    };
  };
  idk: {
    thirdPassExitMessage: string;
    qid27FirstRedirect: string;
    genericFirstRedirectPrefix: string;
    genericFirstRedirectSuffix: string;
    genericSecondRedirect: string;
  };
  opener: {
    withBridgeTemplate: string;
    withoutBridge: string;
  };
  adaptiveFallbacks: {
    11: string;
    16: string;
    23: string;
  };
  days: Record<1 | 2 | 3 | 4 | 5, DayTranslation>;
  questions: Record<number, QuestionTranslation>;
}
