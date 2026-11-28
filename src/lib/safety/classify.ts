/**
 * Server-side Safety Classifier with deep-model escalation (`src/lib/safety/classify.ts`).
 *
 * Feature overview & use cases:
 * - Screens EVERY user answer before anything else happens to it (`CONSTRAINTS.md`).
 * - Three outcomes:
 *   - `none`: session continues normally
 *   - `concern`: session continues gently, event logged to `safetyEvents`
 *   - `acute`: session pauses immediately, `/paused` support resources shown, and the
 *     answer is marked `excludedFromAI: true` so it never reaches Bridges or synthesis
 * - Escalation rule (`CONSTRAINTS.md` & `FLOW.md`):
 *   - Runs on `fast` model (`thinkingLevel: "low"`) first.
 *   - If `uncertain === true` or `confidence < 0.75`, escalates to `deep` model (`thinkingLevel: "medium"`).
 *   - If still uncertain (or if an unexpected error occurs), lands on the cautious side.
 */

import { z } from "zod";
import type { AnswerSafety, SafetyLevel } from "@/lib/db/schema";
import { generateStructuredInteraction } from "@/lib/gemini/client";
import { logError, logInfo, logWarn } from "@/lib/log";
import {
  buildSafetyPrompt,
  PROMPT_VERSION,
  SAFETY_SYSTEM_INSTRUCTION,
} from "@/lib/safety/prompt";

export const SafetyClassificationSchema = z.object({
  level: z.enum(["none", "concern", "acute"]),
  confidence: z.number().min(0).max(1),
  uncertain: z.boolean(),
  reason: z.string(),
});

export interface SafetyClassificationResult extends AnswerSafety {
  confidence: number;
  reason: string;
  promptVersion: string;
}

const EXPLICIT_ACUTE_PATTERNS: readonly RegExp[] = [
  // English explicit & self-harm hint patterns
  /\b(?:end|ending|take|taking)\s+my\s+(?:own\s+)?life\b/i,
  /\bkill(?:ing)?\s+myself\b/i,
  /\bsuicid(?:e|al)\b/i,
  /\bwant\s+to\s+die\b/i,
  /\bbetter\s+off\s+dead\b/i,
  /\bhurt(?:ing)?\s+myself\b/i,
  /\bharm(?:ing)?\s+myself\b/i,
  /\bdon'?t\s+want\s+to\s+(?:be\s+alive|live\s+anymore|wake\s+up)\b/i,
  /\bgo\s+to\s+sleep\s+and\s+never\s+wake\s+up\b/i,
  /\bend\s+it\s+all\s+tonight\b/i,

  // Hinglish explicit & indirect self-harm hint patterns
  /\bapni\s+(?:jaan|zindagi|life)\s+(?:le\s*lena|lena|de\s*dena|khatam\s*kar)\b/i,
  /\b(?:mujhe|ab)\s+(?:aur\s+)?jeena\s+nahi\b/i,
  /\bjeena\s+nahi\s+chaht[aei]\b/i,
  /\bmar\s+jaan?a\s+chaht[aei]\b/i,
  /\bkhud\s+ko\s+(?:khatam|nuksaan|hurt|maar)\b/i,
  /\bkhudkushi\b/i,
  /\bso\s+jaa?u[nm]?\s+aur\s+kabhi\s+na\s+uthu[nm]?\b/i,
  /\bkal\s+subah\s+uthna\s+hi\s+nahi\b/i,
  /\bsab\s+hamesha\s+ke\s+liye\s+khatam\s+kar\s+d(?:oo|u)n?\b/i,

  // Hindi (Devanagari) explicit & indirect self-harm hint patterns
  /(?:अपनी\s*(?:जान|ज़िंदगी|जिंदगी|जीवन)\s*(?:लेना|देना|खत्म|समाप्त))/,
  /(?:आत्महत्या|खुदकुशी)/,
  /(?:खुद\s*को\s*(?:खत्म|नुकसान|चोट|मार))/,
  /(?:अब\s*और\s*नहीं\s*जीना|जीना\s*नहीं\s*चाहत[ाीे]|मर\s*जाना\s*चाहत[ाीे])/,
  /(?:सो\s*जा[ऊउ][ँं]?\s*और\s*कभी\s*न[ा]?\s*उठ[ूँूं])/,
  /(?:कल\s*सुबह\s*उठना\s*ही\s*नहीं|सब\s*हमेशा\s*के\s*लिए\s*खत्म\s*कर\s*द[ूँूं])/,

  // Tamil (தமிழ்) explicit & indirect self-harm hint patterns
  /(?:தற்கொலை|என்\s*உயிரை\s*(?:மாய்த்து|முடித்து|விட)|உயிரை\s*விட\s*வேண்டும்)/,
  /(?:வாழப்?\s*பிடிக்கவில்லை|வாழ\s*விருப்பமில்லை|இனி\s*உயிரோடு\s*இருக்க\s*வேண்டாம்)/,
  /(?:செத்துப்?\s*போகலாம்|செத்துவிட\s*வேண்டும்|இறந்துவிட\s*வேண்டும்)/,
  /(?:என்னை\s*நானே\s*காயப்படுத்த|தூங்கினால்\s*மீண்டும்\s*விழிக்கவே?\s*கூடாது|எல்லாவற்றையும்\s*நிரந்தரமாக\s*முடித்துக்கொள்ள)/,
];

const AMBIGUOUS_SELF_RISK_PATTERNS: readonly RegExp[] = [
  /\bno\s+point\s+in\s+(?:going\s+on|being\s+here)\b/i,
  /\bwish\s+i\s+weren'?t\s+here\b/i,
  /\bcan'?t\s+keep\s+living\s+like\s+this\b/i,
  /\bjeene\s+ka\s+koi\s+matlab\s+nahi\b/i,
  /(?:जीने\s*का\s*कोई\s*मतलब\s*नहीं|यहाँ\s*रहने\s*का\s*कोई\s*फायदा\s*नहीं)/,
  /(?:வாழ்வதில்\s*அர்த்தமே\s*இல்லை|இங்கே\s*இருக்கவே\s*பிடிக்கவில்லை)/,
];

/**
 * Checks deterministic explicit acute self-harm phrases as a non-negotiable safety floor.
 */
export function hasExplicitAcuteSignal(text: string): boolean {
  return EXPLICIT_ACUTE_PATTERNS.some((re) => re.test(text));
}

/**
 * Checks whether ambiguous mortality/disappearance phrasing warrants cautious escalation.
 */
function hasAmbiguousRiskCue(text: string): boolean {
  return AMBIGUOUS_SELF_RISK_PATTERNS.some((re) => re.test(text));
}

/**
 * Resolves the cautious fallback safety level when a model remains uncertain or errors out.
 */
function resolveCautiousFallback(
  candidateLevel: SafetyLevel | null,
  answerText: string,
): SafetyLevel {
  if (hasExplicitAcuteSignal(answerText) || candidateLevel === "acute") {
    return "acute";
  }
  if (hasAmbiguousRiskCue(answerText)) {
    return "acute";
  }
  if (candidateLevel === "concern") {
    return "concern";
  }
  // Cautious path when genuinely uncertain on non-trivial text
  const trimmed = answerText.trim().toLowerCase();
  if (
    trimmed === "i don't know" ||
    trimmed === "idk" ||
    trimmed === "no idea" ||
    trimmed === "not sure" ||
    trimmed === "pata nahi" ||
    trimmed === "nahi pata" ||
    trimmed === "पता नहीं" ||
    trimmed === "नहीं पता" ||
    trimmed === "தெரியவில்லை" ||
    trimmed === "எனக்குத் தெரியவில்லை"
  ) {
    return "none";
  }
  return "concern";
}

/**
 * Screens a user's answer with the fast Gemini model, escalating to the deep model when
 * uncertain, and enforcing deterministic acute floors and cautious fallbacks.
 */
export async function classifyAnswerSafety(params: {
  questionText: string;
  answerText: string;
}): Promise<SafetyClassificationResult> {
  const { questionText, answerText } = params;
  logInfo("safety.classifyAnswerSafety", {
    answerLength: answerText.length,
    promptVersion: PROMPT_VERSION,
  });

  const explicitAcute = hasExplicitAcuteSignal(answerText);

  try {
    const prompt = buildSafetyPrompt(questionText, answerText);
    const fast = await generateStructuredInteraction(
      {
        caller: "safety.classify.fast",
        tier: "fast",
        thinkingLevel: "low",
        temperature: 0,
        systemInstruction: SAFETY_SYSTEM_INSTRUCTION,
        prompt,
      },
      SafetyClassificationSchema,
    );

    const needsEscalation =
      fast.data.uncertain ||
      fast.data.confidence < 0.75 ||
      (hasAmbiguousRiskCue(answerText) && fast.data.level === "none");

    if (!needsEscalation) {
      const finalLevel: SafetyLevel = explicitAcute ? "acute" : fast.data.level;
      return {
        level: finalLevel,
        model: fast.raw.modelUsed,
        escalated: false,
        confidence: fast.data.confidence,
        reason: explicitAcute
          ? "Explicit acute self-harm phrase detected."
          : fast.data.reason,
        promptVersion: PROMPT_VERSION,
      };
    }

    logWarn(
      "safety.classifyAnswerSafety.escalating",
      "Fast safety classifier uncertain; escalating to deep model",
      {
        fastLevel: fast.data.level,
        fastConfidence: fast.data.confidence,
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
      },
      SafetyClassificationSchema,
    );

    const stillUncertain = deep.data.uncertain || deep.data.confidence < 0.7;
    const resolvedLevel: SafetyLevel = explicitAcute
      ? "acute"
      : stillUncertain
        ? resolveCautiousFallback(deep.data.level, answerText)
        : deep.data.level;

    return {
      level: resolvedLevel,
      model: deep.raw.modelUsed,
      escalated: true,
      confidence: deep.data.confidence,
      reason: stillUncertain
        ? `Cautious resolution after uncertain deep check: ${deep.data.reason}`
        : deep.data.reason,
      promptVersion: PROMPT_VERSION,
    };
  } catch (error: unknown) {
    logError("safety.classifyAnswerSafety.modelError", error, {
      answerLength: answerText.length,
    });
    const cautiousLevel = resolveCautiousFallback(null, answerText);
    return {
      level: cautiousLevel,
      model: "fallback-cautious-guard",
      escalated: true,
      confidence: explicitAcute ? 1 : 0.5,
      reason: "Safety classifier unavailable; applied cautious fallback rule.",
      promptVersion: PROMPT_VERSION,
    };
  }
}
