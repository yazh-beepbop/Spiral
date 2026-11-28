/**
 * Zod schemas and TypeScript types for Spiral's person-rooted Firestore database (`src/lib/db/schema.ts`).
 *
 * Feature overview & use cases:
 * - Defines the canonical person-rooted document structure specified in `ARCHITECTURE.md`:
 *   - `persons/{personId}`
 *   - `persons/{personId}/journeys/{journeyId}`
 *   - `persons/{personId}/journeys/{journeyId}/sessions/{day}`
 *   - `persons/{personId}/journeys/{journeyId}/sessions/{day}/answers/{answerId}`
 *   - `persons/{personId}/journeys/{journeyId}/bridges/{day}`
 *   - `persons/{personId}/journeys/{journeyId}/patternFlags/{flagId}`
 *   - `persons/{personId}/journeys/{journeyId}/synthesis/main`
 *   - `persons/{personId}/safetyEvents/{eventId}`
 * - Validates every document written to or read from persistence, and strips internal
 *   fields (`patternKey`, `model`) before returning synthesis payloads to client screens.
 */

import { z } from "zod";

export const EntryPointSchema = z.enum(["career_fog"]);
export type EntryPoint = z.infer<typeof EntryPointSchema>;

export const SupportedLanguageSchema = z.enum(["en", "hinglish", "hi", "ta"]);
export type SupportedLanguageCode = z.infer<typeof SupportedLanguageSchema>;

export const IdkModeSchema = z.enum(["standard", "gentle"]);
export type IdkMode = z.infer<typeof IdkModeSchema>;

export const JourneyStatusSchema = z.enum([
  "active",
  "paused",
  "completed",
  "abandoned",
]);
export type JourneyStatus = z.infer<typeof JourneyStatusSchema>;

export const CrisisTypeSchema = z.enum([
  "burnout",
  "identity",
  "existential",
  "transition",
]);
export type CrisisType = z.infer<typeof CrisisTypeSchema>;

export const SafetyLevelSchema = z.enum(["none", "concern", "acute"]);
export type SafetyLevel = z.infer<typeof SafetyLevelSchema>;

export const QuestionLayerSchema = z.enum(["L1", "L2", "L3", "Opener"]);
export type QuestionLayer = z.infer<typeof QuestionLayerSchema>;

export const BridgeFormatSchema = z.enum([
  "pattern_observation",
  "belief_challenge",
  "reframe_question",
]);
export type BridgeFormat = z.infer<typeof BridgeFormatSchema>;

export const PatternCategorySchema = z.enum([
  "coping_mechanism",
  "limiting_belief",
  "root_cause",
  "signal_flag",
  "meta",
]);
export type PatternCategory = z.infer<typeof PatternCategorySchema>;

export const PersonDocSchema = z.object({
  createdAt: z.string(),
  ageAttested18: z.literal(true),
  country: z.string().default("IN"),
  language: SupportedLanguageSchema.default("en"),
  anniversaryOptIn: z.boolean().default(false),
});
export type PersonDoc = z.infer<typeof PersonDocSchema>;

export const JourneyDocSchema = z.object({
  id: z.string().min(1),
  entryPoint: EntryPointSchema,
  language: SupportedLanguageSchema.default("en"),
  idkMode: IdkModeSchema,
  status: JourneyStatusSchema,
  currentDay: z.number().int().min(1).max(5),
  nextUnlockAt: z.string().nullable(),
  crisisType: CrisisTypeSchema.nullable(),
  isDemoSeed: z.boolean().default(false),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
});
export type JourneyDoc = z.infer<typeof JourneyDocSchema>;

export const SessionDocSchema = z.object({
  day: z.number().int().min(1).max(5),
  openedAt: z.string(),
  completedAt: z.string().nullable(),
  overnightReflection: z.string().nullable(),
  adaptiveQuestions: z.record(z.string(), z.string()).default({}),
  idkCounts: z.record(z.string(), z.number().int().min(0)).default({}),
});
export type SessionDoc = z.infer<typeof SessionDocSchema>;

export const AnswerSafetySchema = z.object({
  level: SafetyLevelSchema,
  model: z.string(),
  escalated: z.boolean(),
});
export type AnswerSafety = z.infer<typeof AnswerSafetySchema>;

export const AnswerDocSchema = z.object({
  id: z.string().min(1),
  qid: z.number().int().positive(),
  layer: QuestionLayerSchema,
  questionText: z.string().min(1),
  text: z.string(),
  language: SupportedLanguageSchema.default("en"),
  idkCount: z.number().int().min(0),
  idkFlagged: z.boolean(),
  safety: AnswerSafetySchema,
  excludedFromAI: z.boolean(),
  createdAt: z.string(),
});
export type AnswerDoc = z.infer<typeof AnswerDocSchema>;

export const BridgeDocSchema = z.object({
  day: z.number().int().min(1).max(5),
  text: z.string().min(1),
  language: SupportedLanguageSchema.default("en"),
  format: BridgeFormatSchema,
  wordCount: z.number().int().positive(),
  model: z.string(),
  promptVersion: z.string(),
  createdAt: z.string(),
});
export type BridgeDoc = z.infer<typeof BridgeDocSchema>;

export const PatternEvidenceSchema = z.object({
  answerPath: z.string().min(1),
  quote: z.string().min(1),
});
export type PatternEvidence = z.infer<typeof PatternEvidenceSchema>;

export const PatternFlagDocSchema = z.object({
  id: z.string().min(1),
  patternKey: z.string().min(1),
  category: PatternCategorySchema,
  firstBridgeHintDay: z.number().int().min(1).max(5).nullable().default(null),
  evidence: z.array(PatternEvidenceSchema).min(2),
  confidence: z.number().min(0).max(1),
  model: z.string(),
});
export type PatternFlagDoc = z.infer<typeof PatternFlagDocSchema>;

export const SynthesisInsightSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  patternKey: z.string().min(1),
  evidenceDays: z.array(z.number().int().min(1).max(5)).default([]),
  landed: z.boolean().nullable(),
});
export type SynthesisInsight = z.infer<typeof SynthesisInsightSchema>;

export const SynthesisDocSchema = z.object({
  text: z.string().min(1),
  language: SupportedLanguageSchema.default("en"),
  insights: z.array(SynthesisInsightSchema).min(1),
  ownPrioritiesText: z.string().nullable().default(null),
  noneFitMe: z.boolean().default(false),
  model: z.string(),
  promptVersion: z.string(),
  createdAt: z.string(),
});
export type SynthesisDoc = z.infer<typeof SynthesisDocSchema>;

export const DemoSynthesisCacheDocSchema = z.object({
  crisisType: CrisisTypeSchema,
  flags: z.array(PatternFlagDocSchema).min(1),
  synthesis: SynthesisDocSchema,
  updatedAt: z.string(),
});
export type DemoSynthesisCacheDoc = z.infer<typeof DemoSynthesisCacheDocSchema>;

export const SafetyEventDocSchema = z.object({
  id: z.string().min(1),
  level: SafetyLevelSchema,
  answerPath: z.string(),
  action: z.string(),
  createdAt: z.string(),
});
export type SafetyEventDoc = z.infer<typeof SafetyEventDocSchema>;

export interface ClientSafeInsight {
  id: string;
  text: string;
  evidenceDays: number[];
  landed: boolean | null;
}

export interface ClientSafeSynthesis {
  text: string;
  insights: ClientSafeInsight[];
  ownPrioritiesText: string | null;
  noneFitMe: boolean;
  createdAt: string;
}

/**
 * Strips internal `patternKey`, `model`, and `promptVersion` fields from a stored
 * `SynthesisDoc` so clinical/internal taxonomy keys and model names never reach the client UI.
 */
export function toClientSafeSynthesis(doc: SynthesisDoc): ClientSafeSynthesis {
  return {
    text: doc.text,
    ownPrioritiesText: doc.ownPrioritiesText ?? null,
    noneFitMe: doc.noneFitMe ?? false,
    createdAt: doc.createdAt,
    insights: doc.insights.map((insight) => ({
      id: insight.id,
      text: insight.text,
      evidenceDays: insight.evidenceDays ?? [],
      landed: insight.landed,
    })),
  };
}
