/**
 * Server-side Safety Classifier with Keyword Pre-Filter & Deep Escalation (`src/lib/safety/classify.ts`).
 *
 * Feature overview & use cases:
 * - Screens EVERY free-text user answer before IDK handling, storage, Bridge generation,
 *   pattern detection, or synthesis (`CONSTRAINTS.md`).
 * - Implements the exact Part 1 cost & safety pipeline:
 *   1. Deterministic keyword/regex pre-filter (`matchSafetyKeywords` across English, Hindi,
 *      Hinglish, Tamil, and Tanglish): any hit returns `"acute"` immediately with ZERO model calls.
 *   2. Fast Gemini model (`tier: "fast"`, `thinkingLevel: "low"`), Zod-validated with 1 retry.
 *   3. Escalation: if `confidence < config.safetyConfidenceThreshold` (`0.7`), re-runs on the
 *      deep Gemini model (`tier: "deep"`). If confidence is STILL below threshold, returns at
 *      least `"concern"` (keeping `"acute"` if deep returned `"acute"`).
 *   4. Fail-safe: if model calls or JSON/Zod parsing fail, logs the error and returns `"concern"`.
 *      Never fails open to `"none"`.
 */

import { z } from "zod";
import { getServerConfig } from "@/lib/config";
import type { AnswerSafety, SafetyLevel } from "@/lib/db/schema";
import { generateStructuredInteraction } from "@/lib/gemini/client";
import { logError, logInfo, logWarn } from "@/lib/log";
import { matchSafetyKeywords } from "@/lib/safety/keywords";
import {
  buildSafetyPrompt,
  PROMPT_VERSION,
  SAFETY_SYSTEM_INSTRUCTION,
  type SafetyContextAnswer,
} from "@/lib/safety/prompt";

export const SafetyClassificationSchema = z.object({
  level: z.enum(["none", "concern", "acute"]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  signals: z.array(z.string()).optional(),
});

export interface SafetyClassificationResult extends AnswerSafety {
  confidence: number;
  reason: string;
  signals: string[];
  keywordHit: boolean;
  promptVersion: string;
}

export interface ClassifyAnswerSafetyParams {
  questionText: string;
  answerText: string;
  previousAnswers?: SafetyContextAnswer[];
  entryPoint?: string;
  personId?: string;
}

/**
 * Checks deterministic acute self-harm and danger keywords across English, Hindi, Hinglish,
 * Tamil, and Tanglish (`src/lib/safety/keywords.ts`).
 */
export function hasExplicitAcuteSignal(text: string): boolean {
  return matchSafetyKeywords(text).matched;
}

/**
 * Enforces the cautious floor (`"concern"` minimum, `"acute"` preserved) when deep escalation
 * confidence remains below `SAFETY_CONFIDENCE_THRESHOLD`.
 */
function enforceMinimumConcern(level: SafetyLevel): SafetyLevel {
  if (level === "acute") {
    return "acute";
  }
  return "concern";
}

/**
 * Screens one user answer for safety risk (`"none" | "concern" | "acute"`), running the
 * deterministic keyword pre-filter first, then the fast model, escalating to the deep model
 * below `SAFETY_CONFIDENCE_THRESHOLD`, and failing safely to `"concern"` on any error.
 */
export async function classifyAnswerSafety(
  params: ClassifyAnswerSafetyParams,
): Promise<SafetyClassificationResult> {
  const {
    questionText,
    answerText,
    previousAnswers = [],
    entryPoint = "career_fog",
    personId,
  } = params;
  const config = getServerConfig();

  logInfo("safety.classifyAnswerSafety", {
    entryPoint,
    contextCount: previousAnswers.length,
    answerLength: answerText.length,
    promptVersion: PROMPT_VERSION,
  });

  // 1. Plain-code multilingual keyword/regex pre-filter -> straight to "acute" with 0 model calls
  const keywordCheck = matchSafetyKeywords(answerText);
  if (keywordCheck.matched) {
    logWarn(
      "safety.classifyAnswerSafety.keywordAcuteHit",
      "Deterministic safety keyword pre-filter matched acute signal",
      { signals: keywordCheck.signals },
    );
    return {
      level: "acute",
      model: "keyword-prefilter",
      escalated: false,
      confidence: 1,
      reason: "Matched acute self-harm or immediate-danger keyword pre-filter.",
      signals: keywordCheck.signals,
      keywordHit: true,
      promptVersion: PROMPT_VERSION,
    };
  }

  // 2. Fast-model safety check on every non-keyword answer
  const prompt = buildSafetyPrompt({
    answerText,
    questionText,
    previousAnswers,
    entryPoint,
  });

  try {
    const fast = await generateStructuredInteraction(
      {
        caller: "safety.classify.fast",
        tier: "fast",
        thinkingLevel: "low",
        temperature: 0,
        systemInstruction: SAFETY_SYSTEM_INSTRUCTION,
        prompt,
        personId,
        promptVersion: PROMPT_VERSION,
      },
      SafetyClassificationSchema,
    );

    const fastSignals = fast.data.signals ?? [];

    if (fast.data.confidence >= config.safetyConfidenceThreshold) {
      return {
        level: fast.data.level,
        model: fast.raw.modelUsed,
        escalated: false,
        confidence: fast.data.confidence,
        reason: fast.data.reason,
        signals: fastSignals,
        keywordHit: false,
        promptVersion: PROMPT_VERSION,
      };
    }

    // 3. Confidence below threshold -> escalate to deep model
    logWarn(
      "safety.classifyAnswerSafety.escalating",
      "Fast safety classifier confidence below threshold; escalating to deep model",
      {
        fastLevel: fast.data.level,
        fastConfidence: fast.data.confidence,
        threshold: config.safetyConfidenceThreshold,
      },
    );

    const deep = await generateStructuredInteraction(
      {
        caller: "safety.classify.deepEscalation",
        tier: "deep",
        thinkingLevel: "medium",
        temperature: 0,
        systemInstruction: SAFETY_SYSTEM_INSTRUCTION,
        prompt,
        personId,
        promptVersion: PROMPT_VERSION,
      },
      SafetyClassificationSchema,
    );

    const deepSignals = deep.data.signals ?? [];

    if (deep.data.confidence < config.safetyConfidenceThreshold) {
      const cautiousLevel = enforceMinimumConcern(deep.data.level);
      return {
        level: cautiousLevel,
        model: deep.raw.modelUsed,
        escalated: true,
        confidence: deep.data.confidence,
        reason: `Low confidence after deep escalation; raised to cautious minimum: ${deep.data.reason}`,
        signals: Array.from(
          new Set([...deepSignals, "low_confidence_cautious_floor"]),
        ),
        keywordHit: false,
        promptVersion: PROMPT_VERSION,
      };
    }

    return {
      level: deep.data.level,
      model: deep.raw.modelUsed,
      escalated: true,
      confidence: deep.data.confidence,
      reason: deep.data.reason,
      signals: deepSignals,
      keywordHit: false,
      promptVersion: PROMPT_VERSION,
    };
  } catch (error: unknown) {
    // 4. Never fail open: on any call/parse/cap error, log and return "concern"
    logError("safety.classifyAnswerSafety.failSafeConcern", error, {
      answerLength: answerText.length,
    });
    return {
      level: "concern",
      model: "fallback-cautious-guard",
      escalated: true,
      confidence: 0,
      reason: "Safety classifier failed or timed out; returned fail-safe concern.",
      signals: ["classifier_error_failsafe"],
      keywordHit: false,
      promptVersion: PROMPT_VERSION,
    };
  }
}
