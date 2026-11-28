/**
 * Adaptive Layer 3 (L3) question generator (`src/lib/journey/adaptive.ts`).
 *
 * Feature overview & use cases:
 * - Resolves and caches concrete question text for adaptive QIDs (`11`, `16`, `23`).
 * - Validates every generated L3 question through `validateNonLeadingQuestion(..., { requireOpenQuestion: true })`
 *   so any yes/no framing, leading tag, projected motive, or pattern label triggers a
 *   corrective retry and falls back to a verified neutral open question if needed.
 */

import { listJourneyAnswers, updateSession } from "@/lib/db/repository";
import type { SessionDoc } from "@/lib/db/schema";
import { generateInteraction } from "@/lib/gemini/client";
import { getTranslations, type SupportedLanguage } from "@/lib/i18n";
import {
  ADAPTIVE_SYSTEM_INSTRUCTION,
  buildAdaptiveQuestionPrompt,
  PROMPT_VERSION,
} from "@/lib/journey/adaptive-prompt";
import { validateNonLeadingQuestion } from "@/lib/journey/leading-guard";
import { logError, logInfo, logWarn } from "@/lib/log";

/**
 * Normalizes single-line model question output.
 */
function sanitizeQuestionLine(raw: string): string {
  return raw
    .replace(/\r?\n+/g, " ")
    .replace(/^["“”']+|["“”']+$/g, "")
    .trim();
}

/**
 * Returns or generates, validates (non-leading & open), and caches the adaptive L3 question text
 * for the requested `language`.
 */
export async function resolveAdaptiveQuestionText(params: {
  personId: string;
  journeyId: string;
  day: number;
  qid: number;
  session: SessionDoc;
  language?: SupportedLanguage;
}): Promise<string> {
  const {
    personId,
    journeyId,
    day,
    qid,
    session,
    language = "en",
  } = params;
  const cacheKey = language === "en" ? String(qid) : `${qid}_${language}`;
  const legacyKey = String(qid);

  if (session.adaptiveQuestions[cacheKey]) {
    return session.adaptiveQuestions[cacheKey];
  }
  if (language === "en" && session.adaptiveQuestions[legacyKey]) {
    return session.adaptiveQuestions[legacyKey];
  }

  logInfo("adaptive.resolveAdaptiveQuestionText", {
    journeyId,
    day,
    qid,
    language,
    promptVersion: PROMPT_VERSION,
  });

  const safeAnswers = await listJourneyAnswers(personId, journeyId, {
    excludeFlaggedSafety: true,
  });

  const fallbacks = getTranslations(language).adaptiveFallbacks;
  let generatedText =
    fallbacks[qid as 11 | 16 | 23] ?? fallbacks[11];

  if (safeAnswers.length > 0) {
    try {
      const basePrompt = buildAdaptiveQuestionPrompt(
        qid,
        safeAnswers,
        language,
      );
      const first = await generateInteraction({
        caller: `adaptive.qid_${qid}.attempt_1`,
        tier: "deep",
        thinkingLevel: "medium",
        temperature: 0.45,
        systemInstruction: ADAPTIVE_SYSTEM_INSTRUCTION,
        prompt: basePrompt,
      });

      const candidate1 = sanitizeQuestionLine(first.text);
      const check1 = validateNonLeadingQuestion(candidate1, {
        requireOpenQuestion: true,
      });

      if (candidate1.length >= 10 && check1.valid) {
        generatedText = candidate1;
      } else {
        logWarn(
          "adaptive.resolveAdaptiveQuestionText.retryingLeadingCheck",
          "Adaptive draft failed non-leading/open check; retrying once",
          {
            qid,
            language,
            reasons: check1.reasons,
          },
        );

        const retry = await generateInteraction({
          caller: `adaptive.qid_${qid}.attempt_2`,
          tier: "deep",
          thinkingLevel: "medium",
          temperature: 0.3,
          systemInstruction: ADAPTIVE_SYSTEM_INSTRUCTION,
          prompt: `${basePrompt}\n\nCRITICAL CORRECTION: Your previous question ("${candidate1}") failed neutrality rules: ${check1.reasons.join(" ")} Rewrite it in the requested language as a completely open, neutral question using ONLY feelings/words the person already expressed.`,
        });

        const candidate2 = sanitizeQuestionLine(retry.text);
        const check2 = validateNonLeadingQuestion(candidate2, {
          requireOpenQuestion: true,
        });
        if (candidate2.length >= 10 && check2.valid) {
          generatedText = candidate2;
        }
      }
    } catch (error: unknown) {
      logError("adaptive.resolveAdaptiveQuestionText.fallbackUsed", error, {
        journeyId,
        day,
        qid,
        language,
      });
    }
  }

  await updateSession(personId, journeyId, day, {
    adaptiveQuestions: {
      ...session.adaptiveQuestions,
      [cacheKey]: generatedText,
    },
  });

  return generatedText;
}
