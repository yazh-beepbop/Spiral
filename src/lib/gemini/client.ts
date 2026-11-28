/**
 * Server-only Gemini Interactions API client wrapper (`src/lib/gemini/client.ts`).
 *
 * Feature overview & use cases:
 * - Centralizes EVERY model call across Spiral (safety classification, IDK detection and
 *   smaller-question redirects, adaptive L3 questions, Bridge generation, Day 5 pattern
 *   mapping, and Day 5 synthesis).
 * - Uses `@google/genai` (>= 3.x) Interactions API (`ai.interactions.create`) with
 *   stateless persistence (`store: false`) so Cloud Firestore remains the single source
 *   of truth (`DECISIONS.md` S3).
 * - Enforces per-user daily call caps (`dailyUserCallCap` from `src/lib/config.ts`) and
 *   logs model used, token counts, and estimated USD cost per call to the `usage` collection
 *   with ZERO personal answer text (`COST RULES` & `CONSTRAINTS.md`).
 * - Implements model routing (`fast` vs `deep` from `src/lib/config.ts`), exponential
 *   backoff retries on HTTP 503/overload errors, and automatic failover to the configured
 *   fallback model when enabled.
 * - Provides `generateStructuredInteraction` to enforce `zod` schema validation on every
 *   structured JSON output, retrying once if JSON parsing or schema validation fails.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import {
  GoogleGenAI,
  type GoogleGenAIInteraction,
  type Interactions,
} from "@google/genai";
import type { z } from "zod";
import { getServerConfig, type ServerConfig } from "@/lib/config";
import {
  getDailyUserCallCount,
  recordModelUsage,
} from "@/lib/db/repository";
import { logError, logGenAICall, logInfo, logWarn } from "@/lib/log";

export type ModelTier = "fast" | "deep";
export type ThinkingDepth = "minimal" | "low" | "medium" | "high";

export interface TokenUsageStats {
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
}

export interface UsageExecutionContext {
  personId?: string | null;
}

export class DailyCallCapExceededError extends Error {
  readonly status = 429;

  constructor(dailyCap: number) {
    super(
      `Daily AI usage limit reached (${dailyCap} calls today). Your progress is saved; please return tomorrow.`,
    );
    this.name = "DailyCallCapExceededError";
  }
}

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
  timeoutMs?: number;
  maxRetries?: number;
  primaryModelOverride?: string;
  fallbackModel?: string | null;
  fallbackThinkingLevel?: ThinkingDepth;
  personId?: string | null;
  promptVersion?: string;
}

export interface GeminiInteractionResult {
  interactionId: string;
  text: string;
  modelUsed: string;
  fallbackUsed: boolean;
  attempts: number;
  durationMs: number;
  usage: TokenUsageStats;
  estimatedCostUsd: number;
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
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RawInteractionTransportResponse {
  id: string;
  text: string;
  usage?: Partial<TokenUsageStats>;
}

export type InteractionTransport = (
  params: RawInteractionTransportParams,
) => Promise<RawInteractionTransportResponse>;

const usageContextStorage = new AsyncLocalStorage<UsageExecutionContext>();
let cachedSdkClient: { apiKey: string; instance: GoogleGenAI } | null = null;
let customTransportForTests: InteractionTransport | null = null;

/**
 * Binds `personId` in async context so every downstream Gemini call within `work`
 * automatically enforces the per-user daily call cap and records usage metrics.
 */
export function runWithUsageContext<T>(
  context: UsageExecutionContext,
  work: () => Promise<T>,
): Promise<T> {
  return usageContextStorage.run(context, work);
}

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
 * Normalizes SDK `interaction.usage` token counts, falling back to a conservative
 * character-based estimate (`chars / 4`) when mocked transports omit token metadata.
 */
export function resolveTokenUsage(
  prompt: string,
  systemInstruction: string | undefined,
  outputText: string,
  rawUsage?: Partial<TokenUsageStats>,
): TokenUsageStats {
  const estInput = Math.max(
    1,
    Math.ceil(((systemInstruction?.length ?? 0) + prompt.length) / 4),
  );
  const estOutput = Math.max(1, Math.ceil(outputText.length / 4));

  const inputTokens =
    typeof rawUsage?.inputTokens === "number" && rawUsage.inputTokens >= 0
      ? rawUsage.inputTokens
      : estInput;
  const outputTokens =
    typeof rawUsage?.outputTokens === "number" && rawUsage.outputTokens >= 0
      ? rawUsage.outputTokens
      : estOutput;
  const thoughtTokens =
    typeof rawUsage?.thoughtTokens === "number" && rawUsage.thoughtTokens >= 0
      ? rawUsage.thoughtTokens
      : 0;
  const totalTokens =
    typeof rawUsage?.totalTokens === "number" && rawUsage.totalTokens >= 0
      ? rawUsage.totalTokens
      : inputTokens + outputTokens + thoughtTokens;

  return {
    inputTokens,
    outputTokens,
    thoughtTokens,
    totalTokens,
  };
}

/**
 * Computes estimated USD cost for a single model call from `src/lib/config.ts` rates.
 */
export function estimateCallCostUsd(
  tier: ModelTier,
  usage: TokenUsageStats,
  config: ServerConfig,
): number {
  const inputRate =
    tier === "fast"
      ? config.fastInputCostPerMillionUsd
      : config.deepInputCostPerMillionUsd;
  const outputRate =
    tier === "fast"
      ? config.fastOutputCostPerMillionUsd
      : config.deepOutputCostPerMillionUsd;

  const rawUsd =
    (usage.inputTokens / 1_000_000) * inputRate +
    ((usage.outputTokens + usage.thoughtTokens) / 1_000_000) * outputRate;
  return Number(rawUsd.toFixed(8));
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

  const interaction = await ai.interactions.create(createParams, {
    ...(typeof params.timeoutMs === "number"
      ? { timeout_ms: params.timeoutMs }
      : {}),
    ...(params.signal ? { signal: params.signal } : {}),
  });
  const text = extractTextFromInteraction(interaction);
  return {
    id: interaction.id,
    text,
    usage: interaction.usage
      ? {
          inputTokens:
            interaction.usage.total_input_tokens ??
            interaction.usage.initial_input_tokens,
          outputTokens: interaction.usage.total_output_tokens,
          thoughtTokens: interaction.usage.total_thought_tokens,
          totalTokens: interaction.usage.total_tokens,
        }
      : undefined,
  };
}

/**
 * Wraps a single transport attempt in a hard deadline (`timeoutMs`), aborting the signal
 * and rejecting with HTTP-like status `408` if the call exceeds the allowed duration.
 */
async function executeWithTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  timeoutMs?: number,
): Promise<T> {
  const controller = new AbortController();
  if (!timeoutMs || timeoutMs <= 0) {
    return work(controller.signal);
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const timeoutErr = Object.assign(
        new Error(`Gemini interaction timed out after ${timeoutMs}ms`),
        { status: 408 },
      );
      reject(timeoutErr);
    }, timeoutMs);
  });

  try {
    return await Promise.race([work(controller.signal), timeoutPromise]);
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
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
      error.name === "RequestTimeoutError" ||
      error.name === "AbortError" ||
      lower.includes("overloaded") ||
      lower.includes("unavailable") ||
      lower.includes("timed out") ||
      lower.includes("timeout") ||
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
 * Persists non-sensitive usage telemetry (`model`, `tokens`, `estimatedCostUsd`) to Firestore/local store.
 */
async function safeRecordUsage(params: {
  personId: string | null;
  caller: string;
  model: string;
  tier: ModelTier;
  promptVersion: string | null;
  usage: TokenUsageStats;
  estimatedCostUsd: number;
  fallbackUsed: boolean;
}): Promise<void> {
  try {
    await recordModelUsage({
      personId: params.personId,
      caller: params.caller,
      model: params.model,
      tier: params.tier,
      promptVersion: params.promptVersion,
      inputTokens: params.usage.inputTokens,
      outputTokens: params.usage.outputTokens,
      thoughtTokens: params.usage.thoughtTokens,
      totalTokens: params.usage.totalTokens,
      estimatedCostUsd: params.estimatedCostUsd,
      fallbackUsed: params.fallbackUsed,
    });
  } catch (usageErr: unknown) {
    logError("gemini.safeRecordUsage.failed", usageErr, {
      caller: params.caller,
      model: params.model,
    });
  }
}

/**
 * Calls the Gemini Interactions API on the server with per-user daily call cap enforcement,
 * automatic 503 backoff retries, fallback model routing, usage logging, and structured GenAI logs.
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

  const effectivePersonId =
    request.personId !== undefined
      ? request.personId
      : (usageContextStorage.getStore()?.personId ?? null);

  if (effectivePersonId) {
    const todayCount = await getDailyUserCallCount(effectivePersonId);
    if (todayCount >= config.dailyUserCallCap) {
      logWarn(
        "gemini.generateInteraction.dailyCapReached",
        "Per-user daily Gemini call cap reached",
        {
          caller: request.caller,
          todayCount,
          dailyUserCallCap: config.dailyUserCallCap,
        },
      );
      throw new DailyCallCapExceededError(config.dailyUserCallCap);
    }
  }

  const primaryModel =
    request.primaryModelOverride ??
    (request.tier === "fast" ? config.modelFast : config.modelDeep);
  const fallbackModel =
    request.fallbackModel === null
      ? ""
      : (request.fallbackModel ??
        (request.tier === "fast"
          ? config.modelFastFallback
          : config.modelDeepFallback));

  logInfo("gemini.generateInteraction.start", {
    caller: request.caller,
    tier: request.tier,
    primaryModel,
    fallbackModel: fallbackModel || null,
    thinkingLevel: request.thinkingLevel ?? "default",
    timeoutMs: request.timeoutMs ?? null,
    promptChars: request.prompt.length,
  });

  const startedAt = Date.now();
  let totalAttempts = 0;
  let lastError: unknown = null;

  const configuredRetries = request.maxRetries ?? config.geminiMaxRetries;
  const maxPrimaryAttempts = Math.max(1, configuredRetries + 1);

  for (let attempt = 1; attempt <= maxPrimaryAttempts; attempt++) {
    totalAttempts += 1;
    const callStart = Date.now();
    try {
      const response = await executeWithTimeout(
        (signal) =>
          transport({
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
            timeoutMs: request.timeoutMs,
            signal,
          }),
        request.timeoutMs,
      );

      const durationMs = Date.now() - callStart;
      const usage = resolveTokenUsage(
        request.prompt,
        request.systemInstruction,
        response.text,
        response.usage,
      );
      const estimatedCostUsd = estimateCallCostUsd(request.tier, usage, config);

      await safeRecordUsage({
        personId: effectivePersonId,
        caller: request.caller,
        model: primaryModel,
        tier: request.tier,
        promptVersion: request.promptVersion ?? null,
        usage,
        estimatedCostUsd,
        fallbackUsed: false,
      });

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
          timeoutMs: request.timeoutMs,
          responseMimeType: request.responseMimeType,
          hasSystemInstruction: Boolean(request.systemInstruction),
          tokens: usage.totalTokens,
          estimatedCostUsd,
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
        usage,
        estimatedCostUsd,
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
          reason: error instanceof Error ? error.message : String(error),
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

  const canSwitchToFallback = request.fallbackModel
    ? Boolean(lastError)
    : shouldAttemptFallbackModel(lastError);

  if (fallbackModel && fallbackModel !== primaryModel && canSwitchToFallback) {
    totalAttempts += 1;
    const fallbackStart = Date.now();
    const fallbackThinking =
      request.fallbackThinkingLevel ?? request.thinkingLevel;
    logWarn(
      "gemini.generateInteraction.switchingToFallback",
      "Falling back to secondary model after primary failure",
      {
        caller: request.caller,
        primaryModel,
        fallbackModel,
        fallbackThinkingLevel: fallbackThinking ?? "default",
      },
    );

    try {
      const response = await executeWithTimeout(
        (signal) =>
          transport({
            apiKey: config.geminiApiKey,
            model: fallbackModel,
            prompt: request.prompt,
            systemInstruction: request.systemInstruction,
            thinkingLevel: fallbackThinking,
            temperature: request.temperature,
            maxOutputTokens: request.maxOutputTokens,
            previousInteractionId: request.previousInteractionId,
            responseMimeType: request.responseMimeType,
            responseJsonSchema: request.responseJsonSchema,
            timeoutMs: request.timeoutMs,
            signal,
          }),
        request.timeoutMs,
      );

      const durationMs = Date.now() - fallbackStart;
      const usage = resolveTokenUsage(
        request.prompt,
        request.systemInstruction,
        response.text,
        response.usage,
      );
      const estimatedCostUsd = estimateCallCostUsd(request.tier, usage, config);

      await safeRecordUsage({
        personId: effectivePersonId,
        caller: request.caller,
        model: fallbackModel,
        tier: request.tier,
        promptVersion: request.promptVersion ?? null,
        usage,
        estimatedCostUsd,
        fallbackUsed: true,
      });

      logGenAICall({
        caller: request.caller,
        model: fallbackModel,
        attempt: totalAttempts,
        fallbackUsed: true,
        durationMs,
        config: {
          tier: request.tier,
          thinkingLevel: fallbackThinking,
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          timeoutMs: request.timeoutMs,
          responseMimeType: request.responseMimeType,
          hasSystemInstruction: Boolean(request.systemInstruction),
          tokens: usage.totalTokens,
          estimatedCostUsd,
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
        usage,
        estimatedCostUsd,
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
  if (secondCheck.ok) {
    return { data: secondCheck.data, raw: retryResult };
  }

  if (
    request.fallbackModel &&
    retryResult.modelUsed !== request.fallbackModel
  ) {
    logWarn(
      "gemini.generateStructuredInteraction.fallbackOnInvalidSchema",
      "Primary model failed schema validation twice; falling back to secondary model",
      {
        caller: request.caller,
        fallbackModel: request.fallbackModel,
        reason: secondCheck.reason,
      },
    );

    const fallbackStructured = await generateInteraction({
      ...request,
      caller: `${request.caller}:schemaFallback`,
      primaryModelOverride: request.fallbackModel,
      thinkingLevel: request.fallbackThinkingLevel ?? request.thinkingLevel,
      maxRetries: 0,
      responseMimeType: "application/json",
      prompt: `${request.prompt}\n\nIMPORTANT: Return ONLY valid JSON matching the required schema (${secondCheck.reason}).`,
    });

    const fallbackCheck = tryParseAndValidate(fallbackStructured.text);
    if (fallbackCheck.ok) {
      return {
        data: fallbackCheck.data,
        raw: { ...fallbackStructured, fallbackUsed: true },
      };
    }
  }

  const err = new Error(
    `Model output failed Zod validation after retry (${request.caller}): ${secondCheck.reason}`,
  );
  logError("gemini.generateStructuredInteraction.failed", err, {
    caller: request.caller,
  });
  throw err;
}
