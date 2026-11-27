/**
 * Structured logging, secret redaction, and inline-data sanitization (`src/lib/log.ts`).
 *
 * Feature overview & use cases:
 * - Provides `logInfo`, `logWarn`, `logError`, and `logGenAICall` across server and client code.
 * - Logs function calls with their parameters at `info` level and logs every Gemini API call
 *   with `model`, `prompt`, `config`, and `output` while stripping inline binary/base64 data.
 * - Guarantees secret safety: never prints environment secret values (`GEMINI_API_KEY`,
 *   `FIREBASE_SERVICE_ACCOUNT`, `SESSION_SIGNING_SECRET`) or raw API key tokens even if they
 *   appear inside error messages, stack traces, headers, or nested objects.
 */

import { type LogLevel, parseLogLevel } from "@/lib/config";

export interface GenAICallLog {
  caller: string;
  model: string;
  prompt: unknown;
  config?: Record<string, unknown>;
  output?: unknown;
  durationMs?: number;
  fallbackUsed?: boolean;
  attempt?: number;
}

const LOG_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SECRET_KEYS = new Set([
  "apikey",
  "geminiapikey",
  "firebaseserviceaccount",
  "session_signing_secret",
  "sessionsigningsecret",
  "private_key",
  "privatekey",
  "authorization",
  "xgoogapikey",
  "x_goog_api_key",
  "idtoken",
  "accesstoken",
  "secret",
  "password",
  "env",
  "processenv",
]);

const INLINE_DATA_KEYS = new Set([
  "inlinedata",
  "inline_data",
  "filedata",
  "file_data",
  "b64_json",
  "audiobytes",
  "imagebytes",
]);

const API_KEY_TOKEN_PATTERNS: readonly RegExp[] = [
  /\bAQ\.[A-Za-z0-9_-]{16,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /([?&]key=)[A-Za-z0-9._-]{12,}/gi,
];

/**
 * Resolves the active log level safely in both server and browser environments.
 */
function getActiveLogLevel(): LogLevel {
  if (typeof window !== "undefined") {
    return "info";
  }
  return parseLogLevel(process.env.LOG_LEVEL);
}

/**
 * Determines whether a message at `level` should be emitted under the current `LOG_LEVEL`.
 */
export function shouldLog(level: LogLevel): boolean {
  const active = getActiveLogLevel();
  return LOG_PRIORITY[level] >= LOG_PRIORITY[active];
}

/**
 * Scrubs any configured server environment secret substrings and API key token patterns
 * from a string before it can ever be written to stdout/stderr.
 */
export function redactSecretsFromString(input: string): string {
  let out = input;

  if (typeof window === "undefined" && typeof process !== "undefined") {
    const secretEnvNames = [
      "GEMINI_API_KEY",
      "FIREBASE_SERVICE_ACCOUNT",
      "SESSION_SIGNING_SECRET",
    ] as const;

    for (const envName of secretEnvNames) {
      const secretVal = process.env[envName]?.trim();
      if (secretVal && secretVal.length >= 8 && out.includes(secretVal)) {
        out = out.split(secretVal).join("[REDACTED]");
      }
    }
  }

  out = out.replace(API_KEY_TOKEN_PATTERNS[0], "[REDACTED]");
  out = out.replace(API_KEY_TOKEN_PATTERNS[1], "[REDACTED]");
  out = out.replace(API_KEY_TOKEN_PATTERNS[2], "$1[REDACTED]");
  return out;
}

/**
 * Checks whether a string looks like a data URI or raw base64 inline media payload.
 */
function isLikelyInlineBlob(value: string): boolean {
  if (value.startsWith("data:") && value.includes(";base64,")) {
    return true;
  }
  if (value.length > 2048 && !/\s/.test(value)) {
    return true;
  }
  return false;
}

/**
 * Recursively clones a log payload while stripping inline binary/base64 media data
 * and redacting any credential fields or secret substrings.
 */
export function stripInlineData(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return "[MAX_DEPTH]";
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    if (isLikelyInlineBlob(value)) {
      return "[STRIPPED_INLINE_DATA]";
    }
    return redactSecretsFromString(value);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    value instanceof Uint8Array ||
    (typeof Buffer !== "undefined" && Buffer.isBuffer(value))
  ) {
    return `[STRIPPED_BINARY_${value.byteLength}_BYTES]`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripInlineData(item, depth + 1));
  }
  if (typeof value === "object") {
    if (typeof process !== "undefined" && value === process.env) {
      return "[REDACTED_PROCESS_ENV]";
    }
    const sanitized: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (SECRET_KEYS.has(normalizedKey)) {
        sanitized[key] = "[REDACTED]";
      } else if (INLINE_DATA_KEYS.has(normalizedKey)) {
        sanitized[key] = "[STRIPPED_INLINE_DATA]";
      } else {
        sanitized[key] = stripInlineData(nested, depth + 1);
      }
    }
    return sanitized;
  }
  return redactSecretsFromString(String(value));
}

/**
 * Formats an Error or unknown thrown value into a secret-scrubbed serializable object.
 */
function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSecretsFromString(error.message),
      stack: error.stack ? redactSecretsFromString(error.stack) : undefined,
    };
  }
  return { error: redactSecretsFromString(String(error)) };
}

/**
 * Logs a function call and its sanitized parameters at `info` level.
 */
export function logInfo(
  functionName: string,
  params?: Record<string, unknown>,
): void {
  if (!shouldLog("info")) {
    return;
  }
  const payload = {
    ts: new Date().toISOString(),
    level: "info",
    fn: functionName,
    ...(params ? { params: stripInlineData(params) } : {}),
  };
  console.info(JSON.stringify(payload));
}

/**
 * Logs a warning condition with optional sanitized context parameters.
 */
export function logWarn(
  functionName: string,
  message: string,
  params?: Record<string, unknown>,
): void {
  if (!shouldLog("warn")) {
    return;
  }
  const payload = {
    ts: new Date().toISOString(),
    level: "warn",
    fn: functionName,
    message: redactSecretsFromString(message),
    ...(params ? { params: stripInlineData(params) } : {}),
  };
  console.warn(JSON.stringify(payload));
}

/**
 * Logs a caught error with secret-scrubbed stack details and sanitized context parameters.
 */
export function logError(
  functionName: string,
  error: unknown,
  params?: Record<string, unknown>,
): void {
  if (!shouldLog("error")) {
    return;
  }
  const payload = {
    ts: new Date().toISOString(),
    level: "error",
    fn: functionName,
    err: formatError(error),
    ...(params ? { params: stripInlineData(params) } : {}),
  };
  console.error(JSON.stringify(payload));
}

/**
 * Logs a Gemini API call with model, prompt, config, output, latency, and fallback status.
 * Strips inline binary/base64 data and scrubs any accidental secret substrings.
 */
export function logGenAICall(entry: GenAICallLog): void {
  if (!shouldLog("info")) {
    return;
  }
  const payload = {
    ts: new Date().toISOString(),
    level: "info",
    type: "genai_call",
    caller: entry.caller,
    model: entry.model,
    attempt: entry.attempt ?? 1,
    fallbackUsed: entry.fallbackUsed ?? false,
    durationMs: entry.durationMs,
    config: stripInlineData(entry.config ?? {}),
    prompt: stripInlineData(entry.prompt),
    output: stripInlineData(entry.output),
  };
  console.info(JSON.stringify(payload));
}
