/**
 * Central application configuration module for Spiral (`src/lib/config.ts`).
 *
 * Feature overview & use cases:
 * - Serves as the SINGLE source of truth for all configurable values across Spiral,
 *   including Gemini runtime and fallback model IDs, session gap duration (`GAP_MINUTES`),
 *   safety escalation threshold (`SAFETY_CONFIDENCE_THRESHOLD`), per-user daily call cap
 *   (`DAILY_USER_CALL_CAP`), token cost rates, retry/backoff timings, and word-count bounds.
 * - Enforces a strict boundary between public browser-safe Firebase Auth settings
 *   (`getPublicFirebaseConfig`) and server-only secrets/model identifiers (`getServerConfig`),
 *   guaranteeing that API keys and model names never leak into client bundles.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface PublicFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export interface ServerConfig {
  geminiApiKey: string;
  firebaseServiceAccount: string;
  googleCloudProject: string;
  modelFast: string;
  modelDeep: string;
  modelFastFallback: string;
  modelDeepFallback: string;
  gapMinutes: number;
  demoMode: boolean;
  logLevel: LogLevel;
  geminiMaxRetries: number;
  geminiInitialBackoffMs: number;
  synthesisTimeoutMs: number;
  synthesisMaxRetries: number;
  synthesisFallbackModel: string;
  bridgeMaxWords: number;
  synthesisMinWords: number;
  synthesisMaxWords: number;
  totalJourneyDays: number;
  safetyConfidenceThreshold: number;
  dailyUserCallCap: number;
  fastInputCostPerMillionUsd: number;
  fastOutputCostPerMillionUsd: number;
  deepInputCostPerMillionUsd: number;
  deepOutputCostPerMillionUsd: number;
}

/**
 * Default safety classifier confidence threshold (`SAFETY_CONFIDENCE_THRESHOLD`).
 * Below this score, classification escalates to the deep model and never fails open.
 */
export const SAFETY_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Default maximum Gemini API calls permitted for a single user per UTC day.
 */
export const DEFAULT_DAILY_USER_CALL_CAP = 80;

/**
 * Shared non-secret product copy and constants used by screens and footers.
 */
export const APP_META = {
  name: "Spiral",
  promise:
    "A calm, structured clarity guide after the first wave of a turning point — when you're ready to make sense of it.",
  disclaimer:
    "Spiral is a guided reflection tool. It is not therapy, medical advice or a crisis service.",
} as const;

/**
 * Parses an environment string into a positive finite number, returning `fallback`
 * when the variable is unset, empty, or non-numeric.
 */
export function parsePositiveNumber(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

/**
 * Parses an environment string into a unit interval probability (`(0, 1]`),
 * returning `fallback` when unset or out of range.
 */
export function parseUnitThreshold(
  raw: string | undefined,
  fallback: number,
): number {
  if (!raw || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    return fallback;
  }
  return parsed;
}

/**
 * Normalizes a raw `LOG_LEVEL` environment string into a valid `LogLevel`,
 * defaulting to `"info"` so function and GenAI calls are logged as required.
 */
export function parseLogLevel(raw: string | undefined): LogLevel {
  const normalized = raw?.trim().toLowerCase();
  if (
    normalized === "debug" ||
    normalized === "info" ||
    normalized === "warn" ||
    normalized === "error"
  ) {
    return normalized;
  }
  return "info";
}

/**
 * Returns the public Firebase Web SDK configuration used exclusively for client-side
 * authentication. Protected downstream by Firestore security rules.
 */
export function getPublicFirebaseConfig(): PublicFirebaseConfig {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
}

/**
 * Returns all server-only secrets, Gemini model identifiers, thresholds, and operational settings.
 * Throws immediately if accidentally invoked in a browser context.
 */
export function getServerConfig(): ServerConfig {
  if (typeof window !== "undefined") {
    throw new Error(
      "getServerConfig() must only be called on the server. Never expose secrets or model IDs to the client.",
    );
  }

  const modelFast = process.env.MODEL_FAST?.trim() || "gemini-4-hydrogen";

  return {
    geminiApiKey: process.env.GEMINI_API_KEY ?? "",
    firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT ?? "",
    googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT ?? "",
    modelFast,
    modelDeep: process.env.MODEL_DEEP?.trim() || "gemini-4-argon",
    modelFastFallback:
      process.env.MODEL_FAST_FALLBACK?.trim() || "gemini-3.8-flash",
    modelDeepFallback:
      process.env.MODEL_DEEP_FALLBACK?.trim() || "gemini-3.1-pro-preview",
    gapMinutes: parsePositiveNumber(process.env.GAP_MINUTES, 600),
    demoMode: process.env.DEMO_MODE?.trim().toLowerCase() === "true",
    logLevel: parseLogLevel(process.env.LOG_LEVEL),
    geminiMaxRetries: 2,
    geminiInitialBackoffMs: 800,
    synthesisTimeoutMs: 45_000,
    synthesisMaxRetries: 1,
    synthesisFallbackModel: modelFast,
    bridgeMaxWords: 40,
    synthesisMinWords: 500,
    synthesisMaxWords: 800,
    totalJourneyDays: 5,
    safetyConfidenceThreshold: parseUnitThreshold(
      process.env.SAFETY_CONFIDENCE_THRESHOLD,
      SAFETY_CONFIDENCE_THRESHOLD,
    ),
    dailyUserCallCap: parsePositiveNumber(
      process.env.DAILY_USER_CALL_CAP,
      DEFAULT_DAILY_USER_CALL_CAP,
    ),
    fastInputCostPerMillionUsd: 0.15,
    fastOutputCostPerMillionUsd: 0.6,
    deepInputCostPerMillionUsd: 1.25,
    deepOutputCostPerMillionUsd: 10.0,
  };
}
