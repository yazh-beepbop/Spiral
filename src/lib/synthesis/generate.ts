/**
 * Day 5 Synthesis Generator and Post-Check Validator (`src/lib/synthesis/generate.ts`).
 *
 * Feature overview & use cases:
 * - Generates the 500–800 word Day 5 synthesis and 3–5 per-insight cards from the validated
 *   pattern map and non-excluded journey answers (`FLOW.md` Section 4).
 * - Enforces all `Design.md` Sections 7 & 7b and `CONSTRAINTS.md` rules:
 *   1. Word count bounds (`500..800` words from `src/lib/config.ts`)
 *   2. Zero leaked pattern/clinical labels (`findLeakedPatternLabels` + `stripLeakedPatternLabels`)
 *   3. Every insight quotes at least 2 of the person's own answers (`"..."`) across at least
 *      2 distinct pre-Bridge days (`evidenceDays` with `>= 2` unique days)
 *   4. Every insight states one explicit alternative reading (`"Or it may simply be that..."`).
 */

import { z } from "zod";
import { countWords } from "@/lib/bridge/generate";
import { getServerConfig } from "@/lib/config";
import type {
  AnswerDoc,
  BridgeDoc,
  CrisisType,
  PatternFlagDoc,
  SynthesisInsight,
} from "@/lib/db/schema";
import { generateStructuredInteraction } from "@/lib/gemini/client";
import { getTranslations, type SupportedLanguage } from "@/lib/i18n";
import { logInfo, logWarn } from "@/lib/log";
import {
  findLeakedPatternLabels,
  stripLeakedPatternLabels,
} from "@/lib/patterns/taxonomy";
import {
  buildSynthesisPrompt,
  PROMPT_VERSION,
  SYNTHESIS_SYSTEM_INSTRUCTION,
} from "@/lib/synthesis/prompt";

const SynthesisModelInsightSchema = z.object({
  patternKey: z.string().min(1),
  evidenceDays: z.array(z.number().int().min(1).max(5)).min(2),
  text: z.string().min(30),
});

const SynthesisModelSchema = z.object({
  text: z.string().min(200),
  insights: z.array(SynthesisModelInsightSchema).min(3).max(5),
});

export interface CandidateInsightForValidation {
  text: string;
  evidenceDays: number[];
}

export interface SynthesisValidationResult {
  valid: boolean;
  wordCount: number;
  leakedLabels: string[];
  reasons: string[];
}

/**
 * Counts verbatim quoted spans (`"..."`) inside an insight string.
 */
export function countQuotedSpans(text: string): number {
  logInfo("synthesis.countQuotedSpans", { textLength: text.length });
  const doubleQuoted = text.match(/"[^"\n]{3,}"/g) ?? [];
  const curlyQuoted = text.match(/“[^”\n]{3,}”/g) ?? [];
  return doubleQuoted.length + curlyQuoted.length;
}

/**
 * Validates synthesis word count (`500..800`), zero leaked pattern labels, `>= 2` pre-Bridge
 * distinct-day quotes per insight, and `"Or it may simply be that..."` alternative readings.
 */
export function validateSynthesisOutput(
  text: string,
  insights: CandidateInsightForValidation[],
  minWords = 500,
  maxWords = 800,
  language: SupportedLanguage = "en",
): SynthesisValidationResult {
  const dict = getTranslations(language);
  const altPrefix = dict.synthesis.alternativeReadingPrefix;
  const effectiveMinWords = language === "ta" ? Math.min(minWords, 300) : minWords;
  logInfo("synthesis.validateSynthesisOutput", {
    textLength: text.length,
    insightCount: insights.length,
    minWords: effectiveMinWords,
    maxWords,
    language,
  });

  const reasons: string[] = [];
  const wordCount = countWords(text);

  if (wordCount < effectiveMinWords || wordCount > maxWords) {
    reasons.push(
      `Synthesis word count is ${wordCount}; must be between ${effectiveMinWords} and ${maxWords} words.`,
    );
  }

  const combinedText = [text, ...insights.map((i) => i.text)].join("\n");
  const leakedLabels = findLeakedPatternLabels(combinedText);
  if (leakedLabels.length > 0) {
    reasons.push(
      `Leaked forbidden clinical/taxonomy labels: ${leakedLabels.join(", ")}.`,
    );
  }

  const prescriptivePatterns: readonly RegExp[] = [
    /\byou\s+should\b/i,
    /\bi\s+(?:recommend|suggest|advise)\b/i,
    /\byour\s+top\s+priority\s+should\b/i,
    /\btry\s+to\b/i,
    /\bmake\s+sure\s+you\b/i,
  ];
  for (const re of prescriptivePatterns) {
    if (re.test(combinedText)) {
      reasons.push(
        `Synthesis contains prescriptive/advisory phrasing (${re.source}); Spiral never suggests actions or advice.`,
      );
      break;
    }
  }

  insights.forEach((insight, idx) => {
    const uniqueDays = new Set(insight.evidenceDays);
    if (uniqueDays.size < 2) {
      reasons.push(
        `Insight ${idx + 1} must cite answers from at least 2 different pre-Bridge days.`,
      );
    }
    const quoteCount = countQuotedSpans(insight.text);
    if (quoteCount < 2) {
      reasons.push(
        `Insight ${idx + 1} has ${quoteCount} quote(s); must quote at least 2 of the person's own answers in "..." quotation marks.`,
      );
    }
    const hasAltReading =
      /\bor\s+it\s+may\s+simply\s+be\s+that\b/i.test(insight.text) ||
      insight.text.toLowerCase().includes(altPrefix.toLowerCase());
    if (!hasAltReading) {
      reasons.push(
        `Insight ${idx + 1} is missing an explicit alternative reading ("${altPrefix}...").`,
      );
    }
  });

  return {
    valid: reasons.length === 0,
    wordCount,
    leakedLabels,
    reasons,
  };
}

export interface GeneratedSynthesisOutput {
  text: string;
  insights: SynthesisInsight[];
  model: string;
  promptVersion: string;
  wordCount: number;
}

/**
 * Generates and validates the Day 5 synthesis, retrying once if word count, label-free,
 * multi-day quote, or `"Or it may simply be that..."` rules fail.
 */
export async function generateJourneySynthesis(params: {
  crisisType: CrisisType;
  flags: PatternFlagDoc[];
  answers: Array<AnswerDoc & { day: number }>;
  bridges: BridgeDoc[];
  language?: SupportedLanguage;
}): Promise<GeneratedSynthesisOutput> {
  const config = getServerConfig();
  const language = params.language ?? "en";
  const dict = getTranslations(language);
  const safeAnswers = params.answers.filter((a) => !a.excludedFromAI);

  logInfo("synthesis.generateJourneySynthesis.start", {
    crisisType: params.crisisType,
    flagCount: params.flags.length,
    safeAnswerCount: safeAnswers.length,
    language,
    promptVersion: PROMPT_VERSION,
  });

  const basePrompt = buildSynthesisPrompt({
    crisisType: params.crisisType,
    flags: params.flags,
    answers: safeAnswers,
    bridges: params.bridges,
    language,
  });

  const first = await generateStructuredInteraction(
    {
      caller: "synthesis.day5.attempt_1",
      tier: "deep",
      thinkingLevel: "medium",
      temperature: 0.5,
      timeoutMs: config.synthesisTimeoutMs,
      maxRetries: config.synthesisMaxRetries,
      fallbackModel: config.synthesisFallbackModel,
      fallbackThinkingLevel: "low",
      systemInstruction: SYNTHESIS_SYSTEM_INSTRUCTION,
      prompt: basePrompt,
    },
    SynthesisModelSchema,
  );

  const firstCheck = validateSynthesisOutput(
    first.data.text,
    first.data.insights,
    config.synthesisMinWords,
    config.synthesisMaxWords,
    language,
  );

  let chosenData = first.data;
  let chosenModel = first.raw.modelUsed;

  if (!firstCheck.valid) {
    logWarn(
      "synthesis.generateJourneySynthesis.retrying",
      "Synthesis draft violated rules; regenerating once",
      {
        wordCount: firstCheck.wordCount,
        reasons: firstCheck.reasons,
      },
    );

    const retryPrompt = `${basePrompt}

CRITICAL REVISION NEEDED:
Your previous draft failed these checks: ${firstCheck.reasons.join(" ")}
Fix ALL of them:
1. Keep "text" strictly between ${config.synthesisMinWords} and ${config.synthesisMaxWords} words.
2. Include >= 2 verbatim "..." quotes from >= 2 distinct pre-Bridge days inside EVERY insight's "text".
3. End EVERY insight's "text" with a sentence starting with "Or it may simply be that...".
4. Remove every clinical or taxonomy label.`;

    const second = await generateStructuredInteraction(
      {
        caller: "synthesis.day5.attempt_2",
        tier: "deep",
        thinkingLevel: "medium",
        temperature: 0.4,
        timeoutMs: config.synthesisTimeoutMs,
        maxRetries: config.synthesisMaxRetries,
        fallbackModel: config.synthesisFallbackModel,
        fallbackThinkingLevel: "low",
        systemInstruction: SYNTHESIS_SYSTEM_INSTRUCTION,
        prompt: retryPrompt,
      },
      SynthesisModelSchema,
    );

    chosenData = second.data;
    chosenModel = second.raw.modelUsed;
  }

  const sanitizedText = stripLeakedPatternLabels(chosenData.text).trim();
  const altPrefixLower = dict.synthesis.alternativeReadingPrefix.toLowerCase();
  const insights: SynthesisInsight[] = chosenData.insights.map((item, idx) => {
    let cleanInsight = stripLeakedPatternLabels(item.text).trim();
    const hasAlt =
      /\bor\s+it\s+may\s+simply\s+be\s+that\b/i.test(cleanInsight) ||
      cleanInsight.toLowerCase().includes(altPrefixLower);
    if (!hasAlt) {
      cleanInsight = `${cleanInsight} ${dict.synthesis.fallbackAlternativeReading}`;
    }
    const uniqueDays = Array.from(new Set(item.evidenceDays)).sort(
      (a, b) => a - b,
    );
    return {
      id: `ins_${idx + 1}`,
      patternKey: item.patternKey,
      evidenceDays: uniqueDays,
      text: cleanInsight,
      landed: null,
    };
  });

  return {
    text: sanitizedText,
    insights,
    model: chosenModel,
    promptVersion: PROMPT_VERSION,
    wordCount: countWords(sanitizedText),
  };
}
