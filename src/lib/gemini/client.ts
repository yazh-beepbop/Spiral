/**
 * Server-only Gemini Interactions API client wrapper (`src/lib/gemini/client.ts`).
 *
 * Feature overview & use cases:
 * - Centralizes EVERY model call across Spiral (safety classification, IDK detection,
 *   adaptive L3 questions, Bridge generation, Day 5 pattern mapping, and Day 5 synthesis).
 * - Uses `@google/genai` (>= 3.x) Interactions API (`ai.interactions.create`) with
 *   stateless persistence (`store: false`) so Cloud Firestore remains the single source
 *   of truth (`DECISIONS.md` S3).
 * - Implements model routing (`fast` vs `deep` from `src/lib/config.ts`), exponential
 *   backoff retries on HTTP 503/overload errors, and automatic failover to the configured
 *   fallback model (`modelFastFallback` / `modelDeepFallback`).
 * - Provides `generateStructuredInteraction` to enforce `zod` schema validation on every
 *   structured JSON output, retrying once if JSON parsing or schema validation fails.
 * - Logs every request and response through `logGenAICall` with inline data stripped and
 *   secrets scrubbed.
 */

import {
  GoogleGenAI,
  type GoogleGenAIInteraction,
  type Interactions,
} from "@google/genai";
import type { z } from "zod";
import { getServerConfig } from "@/lib/config";
import { logError, logGenAICall, logInfo, logWarn } from "@/lib/log";

export type ModelTier = "fast" | "deep";
export type ThinkingDepth = "minimal" | "low" | "medium" | "high";

export interface GeminiInteractionRequest {
  caller: string;
  tier: ModelTier;
  prompt: string;
  systemInstruction?: string;
  thinkingLevel?: ThinkingDepth;
  temperature?: number;
  maxOutputTokens?: number;
  previousInteractionId?: string;
  responseMimeType?: string;
  responseJsonSchema?: Record<string, unknown>;
}

export interface GeminiInteractionResult {
  interactionId: string;
  text: string;
  modelUsed: string;
  fallbackUsed: boolean;
  attempts: number;
  durationMs: number;
}

export interface RawInteractionTransportParams {
  apiKey: string;
  model: string;
  prompt: string;
  systemInstruction?: string;
  thinkingLevel?: ThinkingDepth;
  temperature?: number;
  maxOutputTokens?: number;
  previousInteractionId?: string;
  responseMimeType?: string;
  responseJsonSchema?: Record<string, unknown>;
}

export interface RawInteractionTransportResponse {
  id: string;
  text: string;
}

export type InteractionTransport = (
  params: RawInteractionTransportParams,
) => Promise<RawInteractionTransportResponse>;

let cachedSdkClient: { apiKey: string; instance: GoogleGenAI } | null = null;
let customTransportForTests: InteractionTransport | null = null;

/**
 * Overrides the underlying network transport during automated unit/integration tests
 * so retry, fallback, logging, and Zod validation paths can be verified deterministically
 * without firing loops against live quota (`CONSTRAINTS.md`). Pass `null` to restore live SDK.
 */
export function setGeminiTransportForTests(
  transport: InteractionTransport | null,
): void {
  logInfo("gemini.setGeminiTransportForTests", {
    customEnabled: Boolean(transport),
  });
  customTransportForTests = transport;
}

/**
 * Returns a memoized `GoogleGenAI` server client initialized with the current API key.
 */
function getSdkClient(apiKey: string): GoogleGenAI {
  if (cachedSdkClient && cachedSdkClient.apiKey === apiKey) {
    return cachedSdkClient.instance;
  }
  const instance = new GoogleGenAI({ apiKey });
  cachedSdkClient = { apiKey, instance };
  return instance;
}

/**
 * Extracts concatenated plain text from a v3 `GoogleGenAIInteraction` (`output_text` or
 * `model_output` steps), ignoring internal `thought` steps.
 */
export function extractTextFromInteraction(
  interaction: Pick<GoogleGenAIInteraction, "output_text" | "steps">,
): string {
  logInfo("gemini.extractTextFromInteraction", {
    hasOutputText: typeof interaction.output_text === "string",
    stepCount: interaction.steps?.length ?? 0,
  });

  if (
    typeof interaction.output_text === "string" &&
    interaction.output_text.trim().length > 0
  ) {
    return interaction.output_text.trim();
  }

  if (!interaction.steps || interaction.steps.length === 0) {
    return "";
  }

  const chunks: string[] = [];
  for (const step of interaction.steps) {
    if (step && step.type === "model_output" && Array.isArray(step.content)) {
      for (const block of step.content) {
        if (block && block.type === "text" && typeof block.text === "string") {
          chunks.push(block.text);
        }
      }
    }
  }
  return chunks.join("").trim();
}

/**
 * Executes a single non-streaming call against `@google/genai`'s v3 `ai.interactions.create`.
 */
async function defaultInteractionTransport(
  params: RawInteractionTransportParams,
): Promise<RawInteractionTransportResponse> {
  const ai = getSdkClient(params.apiKey);
  const generationConfig: Interactions.GenerationConfig = {
    thinking_summaries: "none",
  };
  if (params.thinkingLevel) {
    generationConfig.thinking_level = params.thinkingLevel;
  }
  if (typeof params.temperature === "number") {
    generationConfig.temperature = params.temperature;
  }
  if (typeof params.maxOutputTokens === "number") {
    generationConfig.max_output_tokens = params.maxOutputTokens;
  }

  const responseFormat: Interactions.TextResponseFormat | undefined =
    params.responseMimeType
      ? {
          type: "text",
          mime_type: params.responseMimeType,
          ...(params.responseJsonSchema
            ? { schema: params.responseJsonSchema }
            : {}),
        }
      : undefined;

  const createParams: Interactions.InteractionCreateParams.CreateModelInteractionParamsNonStreaming =
    {
      model: params.model,
      input: params.prompt,
      store: false,
      stream: false,
      generation_config: generationConfig,
      ...(params.systemInstruction
        ? { system_instruction: params.systemInstruction }
        : {}),
      ...(params.previousInteractionId
        ? { previous_interaction_id: params.previousInteractionId }
        : {}),
      ...(responseFormat ? { response_format: responseFormat } : {}),
    };

  const interaction = await ai.interactions.create(createParams);
  const text = extractTextFromInteraction(interaction);
  return {
    id: interaction.id,
    text,
  };
}

/**
 * Sleeps asynchronously for `ms` milliseconds during retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Extracts an HTTP status code from an SDK error object or message when available.
 */
export function getErrorStatus(error: unknown): number | null {
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.status === "number") {
      return record.status;
    }
    if (typeof record.statusCode === "number") {
      return record.statusCode;
    }
  }
  if (error instanceof Error) {
    const match = /\b(404|408|429|500|502|503|504)\b/.exec(error.message);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

/**
 * Determines whether a failed model request should be retried on the primary model
 * (HTTP 503 overloaded, 502/504 gateway transients, or network timeouts).
 */
export function isRetryableOverloadError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 503 || status === 502 || status === 504 || status === 408) {
    return true;
  }
  if (error instanceof Error) {
    const lower = error.message.toLowerCase();
    return (
      lower.includes("overloaded") ||
      lower.includes("unavailable") ||
      lower.includes("timed out") ||
      lower.includes("econnreset")
    );
  }
  return false;
}

/**
 * Determines whether failure on the primary model warrants switching to the configured
 * fallback model (overload/5xx, 404 preview model unavailable, or 429 per-model quota).
 */
function shouldAttemptFallbackModel(error: unknown): boolean {
  if (isRetryableOverloadError(error)) {
    return true;
  }
  const status = getErrorStatus(error);
  return status === 404 || status === 429 || status === 500;
}

/**
 * Calls the Gemini Interactions API on the server with automatic 503 backoff retries,
 * configured fallback model routing, and full structured logging.
 */
export async function generateInteraction(
  request: GeminiInteractionRequest,
): Promise<GeminiInteractionResult> {
  if (typeof window !== "undefined") {
    throw new Error("Gemini calls must run exclusively on the server.");
  }

  const config = getServerConfig();
  const transport = customTransportForTests ?? defaultInteractionTransport;

  if (!customTransportForTests && !config.geminiApiKey) {
    throw new Error(
      "Missing server API key. Set GEMINI_API_KEY in .env.local before calling Gemini routes.",
    );
  }

  const primaryModel =
    request.tier === "fast" ? config.modelFast : config.modelDeep;
  const fallbackModel =
    request.tier === "fast"
      ? config.modelFastFallback
      : config.modelDeepFallback;

  logInfo("gemini.generateInteraction.start", {
    caller: request.caller,
    tier: request.tier,
    primaryModel,
    thinkingLevel: request.thinkingLevel ?? "default",
    promptChars: request.prompt.length,
  });

  const startedAt = Date.now();
  let totalAttempts = 0;
  let lastError: unknown = null;

  const maxPrimaryAttempts = Math.max(1, config.geminiMaxRetries + 1);

  for (let attempt = 1; attempt <= maxPrimaryAttempts; attempt++) {
    totalAttempts += 1;
    const callStart = Date.now();
    try {
      const response = await transport({
        apiKey: config.geminiApiKey,
        model: primaryModel,
        prompt: request.prompt,
        systemInstruction: request.systemInstruction,
        thinkingLevel: request.thinkingLevel,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        previousInteractionId: request.previousInteractionId,
        responseMimeType: request.responseMimeType,
        responseJsonSchema: request.responseJsonSchema,
      });

      const durationMs = Date.now() - callStart;
      logGenAICall({
        caller: request.caller,
        model: primaryModel,
        attempt: totalAttempts,
        fallbackUsed: false,
        durationMs,
        config: {
          tier: request.tier,
          thinkingLevel: request.thinkingLevel,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          responseMimeType: request.responseMimeType,
          hasSystemInstruction: Boolean(request.systemInstruction),
        },
        prompt: {
          systemInstruction: request.systemInstruction,
          input: request.prompt,
        },
        output: response.text,
      });

      return {
        interactionId: response.id,
        text: response.text,
        modelUsed: primaryModel,
        fallbackUsed: false,
        attempts: totalAttempts,
        durationMs: Date.now() - startedAt,
      };
    } catch (error: unknown) {
      lastError = error;
      const retryable = isRetryableOverloadError(error);
      logWarn(
        "gemini.generateInteraction.primaryFailed",
        "Primary model attempt failed",
        {
          caller: request.caller,
          model: primaryModel,
          attempt,
          maxPrimaryAttempts,
          status: getErrorStatus(error),
          retryable,
        },
      );

      if (retryable && attempt < maxPrimaryAttempts) {
        const backoffMs =
          config.geminiInitialBackoffMs * Math.pow(2, attempt - 1);
        await sleep(backoffMs);
        continue;
      }
      break;
    }
  }

  if (
    fallbackModel &&
    fallbackModel !== primaryModel &&
    shouldAttemptFallbackModel(lastError)
  ) {
    totalAttempts += 1;
    const fallbackStart = Date.now();
    logWarn(
      "gemini.generateInteraction.switchingToFallback",
      "Falling back to secondary model after primary failure",
      {
        caller: request.caller,
        primaryModel,
        fallbackModel,
      },
    );

    try {
      const response = await transport({
        apiKey: config.geminiApiKey,
        model: fallbackModel,
        prompt: request.prompt,
        systemInstruction: request.systemInstruction,
        thinkingLevel: request.thinkingLevel,
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        previousInteractionId: request.previousInteractionId,
        responseMimeType: request.responseMimeType,
        responseJsonSchema: request.responseJsonSchema,
      });

      const durationMs = Date.now() - fallbackStart;
      logGenAICall({
        caller: request.caller,
        model: fallbackModel,
        attempt: totalAttempts,
        fallbackUsed: true,
        durationMs,
        config: {
          tier: request.tier,
          thinkingLevel: request.thinkingLevel,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          responseMimeType: request.responseMimeType,
          hasSystemInstruction: Boolean(request.systemInstruction),
        },
        prompt: {
          systemInstruction: request.systemInstruction,
          input: request.prompt,
        },
        output: response.text,
      });

      return {
        interactionId: response.id,
        text: response.text,
        modelUsed: fallbackModel,
        fallbackUsed: true,
        attempts: totalAttempts,
        durationMs: Date.now() - startedAt,
      };
    } catch (fallbackError: unknown) {
      logError("gemini.generateInteraction.fallbackFailed", fallbackError, {
        caller: request.caller,
        fallbackModel,
      });
      throw fallbackError;
    }
  }

  logError("gemini.generateInteraction.exhausted", lastError, {
    caller: request.caller,
    primaryModel,
  });
  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini interaction failed");
}

/**
 * Strips optional markdown ```json fences around JSON text returned by a model.
 */
export function cleanJsonFence(raw: string): string {
  logInfo("gemini.cleanJsonFence", { rawLength: raw.length });
  const trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return trimmed;
}

export interface StructuredInteractionResult<T> {
  data: T;
  raw: GeminiInteractionResult;
}

/**
 * Executes a Gemini interaction expecting structured JSON validated against `schema`.
 * Retries once with corrective feedback if JSON parsing or Zod schema validation fails (`BUGS.md`).
 */
export async function generateStructuredInteraction<T>(
  request: Omit<GeminiInteractionRequest, "responseMimeType">,
  schema: z.ZodType<T>,
): Promise<StructuredInteractionResult<T>> {
  logInfo("gemini.generateStructuredInteraction", {
    caller: request.caller,
    tier: request.tier,
  });

  const firstAttempt = await generateInteraction({
    ...request,
    responseMimeType: "application/json",
  });

  const tryParseAndValidate = (
    rawText: string,
  ): { ok: true; data: T } | { ok: false; reason: string } => {
    try {
      const parsedJson: unknown = JSON.parse(cleanJsonFence(rawText));
      const validated = schema.safeParse(parsedJson);
      if (!validated.success) {
        return {
          ok: false,
          reason: validated.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        };
      }
      return { ok: true, data: validated.data };
    } catch (parseErr: unknown) {
      return {
        ok: false,
        reason:
          parseErr instanceof Error ? parseErr.message : "Invalid JSON syntax",
      };
    }
  };

  const firstCheck = tryParseAndValidate(firstAttempt.text);
  if (firstCheck.ok) {
    return { data: firstCheck.data, raw: firstAttempt };
  }

  logWarn(
    "gemini.generateStructuredInteraction.retryOnInvalidSchema",
    "Structured output failed Zod validation; retrying once",
    {
      caller: request.caller,
      reason: firstCheck.reason,
    },
  );

  const retryResult = await generateInteraction({
    ...request,
    caller: `${request.caller}:schemaRetry`,
    responseMimeType: "application/json",
    prompt: `${request.prompt}\n\nIMPORTANT: Your previous output failed schema validation (${firstCheck.reason}). Return ONLY valid JSON matching the required schema with no markdown fences or extra commentary.`,
  });

  const secondCheck = tryParseAndValidate(retryResult.text);
  if (!secondCheck.ok) {
    const err = new Error(
      `Model output failed Zod validation after retry (${request.caller}): ${secondCheck.reason}`,
    );
    logError("gemini.generateStructuredInteraction.failed", err, {
      caller: request.caller,
    });
    throw err;
  }

  return { data: secondCheck.data, raw: retryResult };
}
