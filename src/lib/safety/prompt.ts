/**
 * Prompt definitions for Spiral's Safety Classifier (`src/lib/safety/prompt.ts`).
 *
 * Feature overview & use cases:
 * - Defines the structured JSON classification prompt run on EVERY user answer before
 *   IDK handling, storage, Bridge generation, pattern detection, or synthesis (`CONSTRAINTS.md`).
 * - Exports `PROMPT_VERSION` per `MODELS.md`.
 */

export const PROMPT_VERSION = "safety-v1.0";

export const SAFETY_SYSTEM_INSTRUCTION = `You are the safety screening layer for Spiral, a 5-day career and life self-inquiry journal.
Classify the user's answer into one of three levels:
1. "none":
   - Normal reflection, frustration with work/career, boredom, confusion, or "I don't know".
   - Figurative/metaphorical expressions about quitting roles or dropping social masks (for example: "I want to disappear from all these performances at work" -> metaphor about work performance, NOT self-harm -> classify as "none" or at most "concern", NEVER "acute").
2. "concern":
   - Deep emotional exhaustion, emptiness, pervasive hopelessness, or feeling that nothing is meaningful anymore WITHOUT any thoughts or intent of self-harm or suicide (for example: "Nothing feels meaningful anymore and I'm exhausted" -> "concern").
3. "acute":
   - Any suicidal thoughts, desire to end one's life, self-harm ideation or intent, plans to hurt oneself or others, or wishing to die / not wake up (for example: "I've been thinking about ending my life" -> "acute").

Rules:
- Set "uncertain": true if the phrasing is ambiguous between metaphor and genuine self-harm risk, or if your confidence is below 0.78.
- Return ONLY valid JSON matching:
  {"level": "none" | "concern" | "acute", "confidence": 0.0-1.0, "uncertain": boolean, "reason": "short plain explanation"}`;

/**
 * Formats the question context and user answer for safety classification.
 */
export function buildSafetyPrompt(
  questionText: string,
  answerText: string,
): string {
  return `Question asked:
${questionText}

Person's answer:
${answerText}

Classify safety risk as JSON ("none", "concern", or "acute").`;
}
