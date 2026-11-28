/**
 * Non-Leading Question & Undue-Influence Guard (`src/lib/journey/leading-guard.ts`).
 *
 * Feature overview & use cases:
 * - Enforces Spiral's "NO LEADING QUESTIONS / UNDUE INFLUENCE" rules from `CONSTRAINTS.md`
 *   and `Design.md` Section 7b across both Adaptive L3 questions and Bridge Questions:
 *   1. Rejects coercive/rhetorical leading tags ("isn't it true", "don't you think",
 *      "wouldn't you say", "aren't you really", "deep down", etc.)
 *   2. Rejects projected/unexpressed motive attributions ("because you're afraid",
 *      "hiding behind", "secretly resent", "refusing to admit", etc.)
 *   3. Rejects leaked clinical or internal pattern taxonomy labels
 *   4. On Adaptive L3 questions (`requireOpenQuestion: true`), rejects closed yes/no
 *      interrogatives so every adaptive question stays genuinely open and exploratory.
 */

import { logInfo } from "@/lib/log";
import { findLeakedPatternLabels } from "@/lib/patterns/taxonomy";

const LEADING_COERCIVE_PATTERNS: ReadonlyArray<{
  regex: RegExp;
  reason: string;
}> = [
  {
    regex: /\bisn'?t\s+it\s+true\b/i,
    reason: 'Contains leading phrase "isn\'t it true".',
  },
  {
    regex: /\bdon'?t\s+you\s+think\b/i,
    reason: 'Contains leading phrase "don\'t you think".',
  },
  {
    regex: /\bwouldn'?t\s+you\s+say\b/i,
    reason: 'Contains leading phrase "wouldn\'t you say".',
  },
  {
    regex: /\baren'?t\s+you\s+(?:really|just|actually|secretly)\b/i,
    reason: 'Contains leading assumption ("aren\'t you really/just...").',
  },
  {
    regex: /\bisn'?t\s+(?:that|this|part\s+of\s+you)\s+(?:really|just|actually)\b/i,
    reason: 'Contains leading hypothesis tag ("isn\'t that really...").',
  },
  {
    regex: /\bdon'?t\s+you\s+(?:feel|realize|see|know\s+that)\b/i,
    reason: 'Contains leading prompt ("don\'t you feel/realize...").',
  },
  {
    regex: /\bdeep\s+down[,]?\s+(?:don'?t\s+you|you\s+know|aren'?t\s+you|isn'?t)\b/i,
    reason: 'Contains undue-influence phrase ("deep down...").',
  },
  {
    regex: /\bbecause\s+you(?:'re|\s+are)\s+(?:afraid|scared|terrified|ashamed|hiding|avoiding)\b/i,
    reason: "Embeds an unexpressed fear/shame motive assumption.",
  },
  {
    regex: /\b(?:to\s+hide|hiding\s+how)\s+[a-z]+\s+you\s+(?:actually|really|secretly)\s+feel\b/i,
    reason: "Projects an unexpressed hidden emotion onto the person.",
  },
  {
    regex: /\badmit\s+that\s+you\b/i,
    reason: 'Uses confrontational hypothesis testing ("admit that you").',
  },
  {
    regex: /\b(?:kya\s+yeh\s+sach\s+nahi|aapko\s+nahi\s+lagta|dil\s+ke\s+andar\s+sach\s+toh)\b/i,
    reason: "Contains Hinglish leading/coercive tag.",
  },
  {
    regex: /(?:क्या\s*यह\s*सच\s*नहीं|आपको\s*नहीं\s*लगता|मन\s*ही\s*मन\s*आप\s*जानते)/,
    reason: "Contains Hindi leading/coercive tag.",
  },
  {
    regex: /(?:உண்மை\s*இல்லையா|உங்களுக்குத்?\s*தோன்றவில்லையா|மனதிற்குள்\s*உண்மையில்)/,
    reason: "Contains Tamil leading/coercive tag.",
  },
];

const CLOSED_YES_NO_START =
  /^(?:are|is|was|were|do|does|did|have|has|had|can|could|will|would|should|isn'?t|aren'?t|don'?t|doesn'?t|didn'?t|haven'?t|wouldn'?t|couldn'?t)\s+(?:you|it|that|this|there|your)\b/i;

const OPEN_INTERROGATIVE_WORD =
  /(?:\b(?:what|how|where|when|which|who|whose|why|kya|kaise|kaisa|kaisi|kahan|kab|kaun|kaunsa|kaunsi|kis|kisko|kyun|kyon)\b|क्या|कैसे|कैसा|कैसी|कहाँ|कहां|कब|कौन|किस|क्यों|என்ன|எப்படி|எங்கே|எப்போது|எது|எந்த|யார்|ஏன்)/i;

export interface NonLeadingCheckResult {
  valid: boolean;
  reasons: string[];
}

/**
 * Validates that a generated question contains no leading tags, projected motives,
 * leaked pattern names, or (when `requireOpenQuestion` is true) closed yes/no framing.
 */
export function validateNonLeadingQuestion(
  questionText: string,
  options: { requireOpenQuestion?: boolean } = {},
): NonLeadingCheckResult {
  logInfo("leadingGuard.validateNonLeadingQuestion", {
    textLength: questionText.length,
    requireOpenQuestion: Boolean(options.requireOpenQuestion),
  });

  const normalized = questionText.replace(/\s+/g, " ").trim();
  const reasons: string[] = [];

  for (const rule of LEADING_COERCIVE_PATTERNS) {
    if (rule.regex.test(normalized)) {
      reasons.push(rule.reason);
    }
  }

  const leakedLabels = findLeakedPatternLabels(normalized);
  if (leakedLabels.length > 0) {
    reasons.push(
      `Contains forbidden pattern label(s): ${leakedLabels.join(", ")}.`,
    );
  }

  if (options.requireOpenQuestion) {
    // Check the final sentence (the actual question asked) as well as the full string
    const sentences = normalized
      .split(/(?<=[.!])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const questionClause = sentences[sentences.length - 1] ?? normalized;

    if (
      CLOSED_YES_NO_START.test(questionClause) &&
      !/\bor\b/i.test(questionClause)
    ) {
      reasons.push(
        "Adaptive question is phrased as a closed yes/no question instead of an open neutral inquiry.",
      );
    }

    if (!OPEN_INTERROGATIVE_WORD.test(questionClause)) {
      reasons.push(
        "Adaptive question must use an open exploratory question word (what, how, where, when, which, who).",
      );
    }
  }

  return {
    valid: reasons.length === 0,
    reasons,
  };
}
