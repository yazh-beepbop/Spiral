/**
 * Fast Deterministic Safety Keyword & Regex Pre-Filter (`src/lib/safety/keywords.ts`).
 *
 * Feature overview & use cases:
 * - Runs synchronously BEFORE any Gemini call on every user answer (`COST RULES` & Part 1).
 * - Scans for explicit self-harm, suicide, harming others, and immediate physical danger
 *   signals across English, Hindi (Devanagari), Hinglish, Tamil (Tamil script), and Tanglish.
 * - A keyword hit routes straight to `"acute"` with ZERO model calls, pausing the session
 *   and displaying crisis support resources immediately.
 * - Carefully excludes everyday workplace metaphors and idioms (e.g., "disappear from these
 *   performances", "dead tired", "killing my curiosity", "bury me in Jira tickets") so
 *   metaphorical reflections pass through to the fast-model classifier without false pauses.
 */

import { logInfo } from "@/lib/log";

export interface SafetyKeywordRule {
  id: string;
  language: "en" | "hi" | "hinglish" | "ta" | "tanglish";
  category: "self_harm" | "suicide" | "harm_others" | "immediate_danger";
  pattern: RegExp;
}

export interface SafetyKeywordMatch {
  matched: boolean;
  signals: string[];
}

const SAFETY_KEYWORD_RULES: readonly SafetyKeywordRule[] = [
  // English: suicide & self-harm
  {
    id: "en_end_my_life",
    language: "en",
    category: "suicide",
    pattern:
      /\b(?:end|ending|take|taking)\s+my\s+(?:own\s+)?life\b/i,
  },
  {
    id: "en_kill_myself",
    language: "en",
    category: "suicide",
    pattern: /\bkill(?:ing)?\s+myself\b/i,
  },
  {
    id: "en_suicide",
    language: "en",
    category: "suicide",
    pattern: /\bsuicid(?:e|al)\b/i,
  },
  {
    id: "en_want_to_die",
    language: "en",
    category: "suicide",
    pattern: /\b(?:i\s+)?(?:want|wanna|ready|going)\s+to\s+die\b/i,
  },
  {
    id: "en_better_off_dead",
    language: "en",
    category: "suicide",
    pattern: /\bbetter\s+off\s+dead\b/i,
  },
  {
    id: "en_dont_want_to_live",
    language: "en",
    category: "suicide",
    pattern:
      /\bdon'?t\s+want\s+to\s+(?:be\s+alive|live\s+anymore|wake\s+up(?:\s+tomorrow)?)\b/i,
  },
  {
    id: "en_self_harm",
    language: "en",
    category: "self_harm",
    pattern:
      /\b(?:hurt(?:ing)?|harm(?:ing)?|cut(?:ting)?|hang(?:ing)?)\s+myself\b|\bslit(?:ting)?\s+my\s+wrists?\b|\boverdos(?:e|ing)\s+on\s+(?:pills|tablets|meds)\b/i,
  },
  {
    id: "en_jump_off",
    language: "en",
    category: "suicide",
    pattern:
      /\bjump(?:ing)?\s+off\s+(?:a\s+|the\s+|my\s+)?(?:roof|terrace|bridge|balcony|building|ledge)\b/i,
  },

  // English: harming someone else or immediate danger right now
  {
    id: "en_harm_someone_else",
    language: "en",
    category: "harm_others",
    pattern:
      /\b(?:going\s+to|want\s+to|plan(?:ning)?\s+to)\s+(?:kill|stab|shoot|murder|physically\s+hurt)\s+(?:him|her|them|someone|my\s+(?:boss|manager|partner|husband|wife|parents?|family))\b/i,
  },
  {
    id: "en_immediate_danger",
    language: "en",
    category: "immediate_danger",
    pattern:
      /\b(?:i\s+am|i'?m)\s+(?:in\s+(?:physical\s+)?danger|not\s+safe)\s+right\s+now\b|\b(?:partner|husband|wife|father|someone)\s+(?:locked\s+the\s+door\s+and\s+)?is\s+(?:hitting|beating|choking|attacking)\s+me\b/i,
  },

  // Hindi (Devanagari)
  {
    id: "hi_suicide_devanagari",
    language: "hi",
    category: "suicide",
    pattern:
      /आत्महत्या|खुदकुशी|अपनी\s+जान\s+(?:दे|ले)|जान\s+दे\s+(?:दूंगा|दूंगी|देना)|मर\s+जाना\s+(?:चाहता|चाहती)|खुद\s+को\s+खत्म|नस\s+काट/u,
  },

  // Hinglish
  {
    id: "hinglish_khudkushi_aatmahatya",
    language: "hinglish",
    category: "suicide",
    pattern: /\b(?:khudkushi|aatmahatya|atmahatya)\b/i,
  },
  {
    id: "hinglish_jaan_dena",
    language: "hinglish",
    category: "suicide",
    pattern:
      /\b(?:apni\s+jaan\s+(?:de|le)|jaan\s+de\s+(?:dunga|dungi|du|dena\s+chaht[aei]))\b/i,
  },
  {
    id: "hinglish_mar_jaana",
    language: "hinglish",
    category: "suicide",
    pattern:
      /\b(?:mar\s+jaa?na\s+chaht[aei]|khud\s+ko\s+khatam\s+kar|nas\s+kaat\s+l(?:unga|ungi|u)|z[ae]h[ae]r\s+kha\s+l(?:unga|ungi|u)|ph+ansi\s+laga|chhat\s+se\s+kood)\b/i,
  },

  // Tamil (Tamil script)
  {
    id: "ta_suicide_script",
    language: "ta",
    category: "suicide",
    pattern:
      /தற்கொலை|சாகணும்\s*போல|சாக\s*வேண்டும்|செத்துடலாம்|செத்துப்?\s*போகணும்|உயிரை\s*மாய்த்து/u,
  },

  // Tanglish
  {
    id: "tanglish_tharkolai",
    language: "tanglish",
    category: "suicide",
    pattern: /\btharkolai\b/i,
  },
  {
    id: "tanglish_saaganum_sethudalam",
    language: "tanglish",
    category: "suicide",
    pattern:
      /\b(?:sa+ganum\s+pola|naan\s+sa+ganum|sethu(?:dalam|ralam|da\s+poren)|sethu\s+poganum|uyir(?:ai|a)\s+(?:maithu|vitralam|pokka))\b/i,
  },
];

/**
 * Runs deterministic multilingual self-harm and acute-danger regex checks on `text`.
 * Returns `{ matched: true, signals }` when any acute pattern hits so the caller can
 * immediately pause without spending a model call.
 */
export function matchSafetyKeywords(text: string): SafetyKeywordMatch {
  logInfo("safetyKeywords.matchSafetyKeywords", {
    textLength: text.length,
  });

  const normalized = text.trim();
  if (!normalized) {
    return { matched: false, signals: [] };
  }

  const matchedSignals: string[] = [];
  for (const rule of SAFETY_KEYWORD_RULES) {
    if (rule.pattern.test(normalized)) {
      matchedSignals.push(`keyword:${rule.id}`);
    }
  }

  return {
    matched: matchedSignals.length > 0,
    signals: matchedSignals,
  };
}
