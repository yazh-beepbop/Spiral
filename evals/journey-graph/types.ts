/**
 * Type Definitions and Zod Schemas for Spiral's 45,000-Journey Knowledge Graph
 * (`evals/journey-graph/types.ts`).
 *
 * Feature overview & use cases:
 * - Defines strict Zod schemas and TypeScript types for the 6 combinatorial axes that govern
 *   45,000 coherent, safety-verified user journeys across Spiral's 3 V1 Trunks (`career_fog`,
 *   `identity_crisis`, `life_transition`).
 * - Enforces structural separation between:
 *   1. Normalized relational graph nodes (~522 MECE records synced to Notion under
 *      "Spiral · Journey Graph"), and
 *   2. The full 45,000-row enumerated journey dataset (`journeys-45000.csv`) stored locally
 *      in `evals/journey-graph/out/` for deterministic safety & undue-influence evaluation.
 * - Enforces Q7B granularity (`P1` and `P3` clusters carry concrete validated exemplars;
 *   `P2` clusters carry state-machine rules only) and Q10 IP boundaries (QID numbers and
 *   internal pattern keys only; zero verbatim question bank or golden-set benchmark text).
 */

import { z } from "zod";

export const V1TrunkKeySchema = z.enum([
  "career_fog",
  "identity_crisis",
  "life_transition",
]);
export type V1TrunkKey = z.infer<typeof V1TrunkKeySchema>;

export const Day1EntryStateKeySchema = z.enum([
  "energized_misaligned",
  "fine_autopilot",
  "drained_overextended",
  "numb_disconnected",
]);
export type Day1EntryStateKey = z.infer<typeof Day1EntryStateKeySchema>;

export const CrisisTypeKeySchema = z.enum([
  "burnout",
  "identity",
  "existential",
  "transition",
]);
export type CrisisTypeKey = z.infer<typeof CrisisTypeKeySchema>;

export const ProbabilityTierSchema = z.enum([
  "P1_Core",
  "P2_Common_Variant",
  "P3_High_Risk_Edge",
]);
export type ProbabilityTier = z.infer<typeof ProbabilityTierSchema>;

export const SafetyTierBoardColumnSchema = z.enum([
  "Green · Clear Flow",
  "Green-Check · Metaphor Disambiguated",
  "Amber-Watch · Cumulative Concern",
  "Red-Gate · Acute Pause & Exclude",
  "Red-Resume · Post-Acute Grounding",
]);
export type SafetyTierBoardColumn = z.infer<typeof SafetyTierBoardColumnSchema>;

export const TrunkEntryNodeSchema = z.object({
  nodeId: z.string(),
  nodeKind: z.enum(["trunk", "entry_state"]),
  title: z.string(),
  trunkKey: V1TrunkKeySchema,
  entryStateKey: Day1EntryStateKeySchema.optional(),
  parentNodeId: z.string().nullable(),
  idkMode: z.enum(["standard", "gentle"]),
  v1ScopeStatus: z.literal("V1 Active Trunk"),
  anchorQids: z.array(z.number().int().positive()),
  day1SignalSummary: z.string(),
  safetyBaseline: z.string(),
});
export type TrunkEntryNode = z.infer<typeof TrunkEntryNodeSchema>;

export const PersonaNodeSchema = z.object({
  personaId: z.string(),
  title: z.string(),
  regionGroup: z.enum(["India-First", "Global-Diaspora"]),
  ageBand: z.string(),
  lifeContext: z.string(),
  culturalCalibrationRule: z.string(),
  helplineRouting: z.string(),
});
export type PersonaNode = z.infer<typeof PersonaNodeSchema>;

export const PatternReferenceNodeSchema = z.object({
  patternNodeId: z.string(),
  patternKey: z.string(),
  category: z.enum([
    "coping_mechanism",
    "limiting_belief",
    "root_cause",
    "signal_flag",
    "meta",
  ]),
  internalSummary: z.string(),
  indiaCalibration: z.string(),
  globalCalibration: z.string(),
  triggerQids: z.array(z.number().int().positive()),
  userFacingPlainPhrase: z.string(),
});
export type PatternReferenceNode = z.infer<typeof PatternReferenceNodeSchema>;

export const PatternTriadDefinitionSchema = z.object({
  triadId: z.string(),
  title: z.string(),
  copingKey: z.string(),
  limitingBeliefKey: z.string(),
  rootCauseKey: z.string(),
  primarySignalKey: z.string(),
  secondaryMetaOrSignalKey: z.string().nullable(),
  relevantQids: z.array(z.number().int().positive()),
  psychologicalMechanism: z.string(),
});
export type PatternTriadDefinition = z.infer<
  typeof PatternTriadDefinitionSchema
>;

export const EngagementArcNodeSchema = z.object({
  arcId: z.string(),
  title: z.string(),
  arcCategory: z.enum([
    "Reflective_Flow",
    "IDK_Escalation",
    "Undue_Influence_Guard",
    "Synthesis_Agency_Guard",
  ]),
  idkStepReached: z.number().int().min(0).max(3),
  undueInfluenceVector: z.string(),
  systemGuardrailAction: z.string(),
  preBridgeEvidenceRule: z.string(),
  touchpointQids: z.array(z.number().int().positive()),
});
export type EngagementArcNode = z.infer<typeof EngagementArcNodeSchema>;

export const SafetyProtocolNodeSchema = z.object({
  safetyId: z.string(),
  title: z.string(),
  safetyTier: SafetyTierBoardColumnSchema,
  classifierPath: z.string(),
  aiExclusionRule: z.boolean(),
  sessionAction: z.enum([
    "continue_standard",
    "continue_disambiguated",
    "continue_gentle_watch",
    "pause_and_show_resources",
    "resume_grounding_mode",
  ]),
  groundingModeRequired: z.boolean(),
  multiDayRule: z.string(),
  bridgeAndSynthesisRule: z.string(),
});
export type SafetyProtocolNode = z.infer<typeof SafetyProtocolNodeSchema>;

export const ClusterExemplarBundleSchema = z.object({
  syntheticUserSignal: z.string(),
  compliantBridgeExample: z.string(),
  bridgeFormat: z.enum([
    "pattern_observation",
    "belief_challenge",
    "reframe_question",
  ]),
  neutralAdaptiveL3Prompt: z.string(),
  hedgedSynthesisSnippet: z.string(),
});
export type ClusterExemplarBundle = z.infer<typeof ClusterExemplarBundleSchema>;

export const JourneyClusterNodeSchema = z.object({
  clusterId: z.string(),
  archetypeId: z.string(),
  title: z.string(),
  trunkKey: V1TrunkKeySchema,
  entryStateNodeId: z.string(),
  entryStateKey: Day1EntryStateKeySchema,
  triadId: z.string(),
  patternKeys: z.array(z.string()),
  crisisType: CrisisTypeKeySchema,
  safetyId: z.string(),
  safetyTier: SafetyTierBoardColumnSchema,
  probabilityTier: ProbabilityTierSchema,
  validPersonaIds: z.array(z.string()),
  validArcIds: z.array(z.string()),
  governedJourneyCount: z.number().int().positive(),
  journeyIdStart: z.string(),
  journeyIdEnd: z.string(),
  relevantQids: z.array(z.number().int().positive()),
  stateMachineRules: z.string(),
  forbiddenMoves: z.string(),
  exemplars: ClusterExemplarBundleSchema.nullable(),
});
export type JourneyClusterNode = z.infer<typeof JourneyClusterNodeSchema>;

export const EnumeratedJourneyRowSchema = z.object({
  journeyId: z.string(),
  clusterId: z.string(),
  archetypeId: z.string(),
  trunkKey: V1TrunkKeySchema,
  entryStateKey: Day1EntryStateKeySchema,
  personaId: z.string(),
  regionGroup: z.enum(["India-First", "Global-Diaspora"]),
  triadId: z.string(),
  copingKey: z.string(),
  limitingBeliefKey: z.string(),
  rootCauseKey: z.string(),
  signalKey: z.string(),
  crisisType: CrisisTypeKeySchema,
  arcId: z.string(),
  idkMode: z.enum(["standard", "gentle"]),
  safetyId: z.string(),
  safetyTier: SafetyTierBoardColumnSchema,
  probabilityTier: ProbabilityTierSchema,
  relevantQids: z.string(),
  aiExclusionGate: z.boolean(),
  groundingMode: z.boolean(),
  preBridgeQuoteMin: z.number().int().min(2),
});
export type EnumeratedJourneyRow = z.infer<typeof EnumeratedJourneyRowSchema>;
