/**
 * Deterministic 45,000-Journey Dataset & Notion Graph Generator (`evals/journey-graph/generate-45k.ts`).
 *
 * Feature overview & use cases:
 * - Materializes the 522 normalized Notion Knowledge Graph nodes (`notion-graph-nodes.json`),
 *   the exact 45,000-row coherence-pruned journey catalog (`journeys-45000.csv`), and
 *   audit rollups (`graph-summary.json`) under `evals/journey-graph/out/`.
 * - Runs offline with zero Gemini API calls (`CONSTRAINTS.md`: never fire bulk model loops).
 */

import { createHash } from "crypto";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  buildEngagementArcNodes,
  buildPatternReferenceNodes,
  buildPatternTriads,
  buildPersonaNodes,
  buildSafetyProtocolNodes,
  buildTrunkAndEntryNodes,
} from "./axes-data";
import { buildClustersAndPruningAudit } from "./pruning-and-exemplars";

/**
 * Escapes a CSV field cleanly according to RFC 4180.
 */
function csvCell(value: string | number | boolean): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates all local artifacts under `evals/journey-graph/out/` and prints summary metrics.
 */
export function runGeneration(): void {
  const outDir = join(process.cwd(), "evals", "journey-graph", "out");
  mkdirSync(outDir, { recursive: true });

  const trunkNodes = buildTrunkAndEntryNodes();
  const personas = buildPersonaNodes();
  const patternRefs = buildPatternReferenceNodes();
  const triads = buildPatternTriads();
  const arcs = buildEngagementArcNodes();
  const safetyProtocols = buildSafetyProtocolNodes();

  const { archetypes, clusters, audit } = buildClustersAndPruningAudit({
    trunkNodes,
    personas,
    triads,
    arcs,
    safetyProtocols,
  });

  const personaMap = new Map(personas.map((p) => [p.personaId, p]));
  const triadMap = new Map(triads.map((t) => [t.triadId, t]));

  const csvHeader = [
    "journey_id",
    "cluster_id",
    "archetype_id",
    "trunk_key",
    "entry_state_key",
    "persona_id",
    "region_group",
    "triad_id",
    "coping_key",
    "limiting_belief_key",
    "root_cause_key",
    "signal_key",
    "crisis_type",
    "arc_id",
    "idk_mode",
    "safety_id",
    "safety_tier",
    "probability_tier",
    "relevant_qids",
    "ai_exclusion_gate",
    "grounding_mode",
    "pre_bridge_quote_min",
  ].join(",");

  const csvLines: string[] = [csvHeader];
  let journeySeq = 1;

  const byTrunk: Record<string, number> = {};
  const bySafetyTier: Record<string, number> = {};
  const byProbabilityTier: Record<string, number> = {};
  const byRegionGroup: Record<string, number> = {};
  const byCrisisType: Record<string, number> = {};

  for (const clu of clusters) {
    const triad = triadMap.get(clu.triadId)!;
    const idkMode = clu.trunkKey === "career_fog" ? "standard" : "gentle";
    const aiExclusionGate =
      clu.safetyId === "SAF-04" || clu.safetyId === "SAF-05";
    const groundingMode =
      clu.safetyId === "SAF-03" ||
      clu.safetyId === "SAF-04" ||
      clu.safetyId === "SAF-05" ||
      clu.crisisType === "existential";
    const qidStr = clu.relevantQids.join("|");

    for (const personaId of clu.validPersonaIds) {
      const persona = personaMap.get(personaId)!;
      for (const arcId of clu.validArcIds) {
        const journeyId = `JRN-${String(journeySeq).padStart(5, "0")}`;
        journeySeq += 1;

        byTrunk[clu.trunkKey] = (byTrunk[clu.trunkKey] ?? 0) + 1;
        bySafetyTier[clu.safetyTier] = (bySafetyTier[clu.safetyTier] ?? 0) + 1;
        byProbabilityTier[clu.probabilityTier] =
          (byProbabilityTier[clu.probabilityTier] ?? 0) + 1;
        byRegionGroup[persona.regionGroup] =
          (byRegionGroup[persona.regionGroup] ?? 0) + 1;
        byCrisisType[clu.crisisType] = (byCrisisType[clu.crisisType] ?? 0) + 1;

        csvLines.push(
          [
            journeyId,
            clu.clusterId,
            clu.archetypeId,
            clu.trunkKey,
            clu.entryStateKey,
            personaId,
            persona.regionGroup,
            clu.triadId,
            triad.copingKey,
            triad.limitingBeliefKey,
            triad.rootCauseKey,
            triad.primarySignalKey,
            clu.crisisType,
            arcId,
            idkMode,
            clu.safetyId,
            clu.safetyTier,
            clu.probabilityTier,
            qidStr,
            aiExclusionGate,
            groundingMode,
            2,
          ]
            .map(csvCell)
            .join(","),
        );
      }
    }
  }

  const csvContent = `${csvLines.join("\n")}\n`;
  const csvPath = join(outDir, "journeys-45000.csv");
  writeFileSync(csvPath, csvContent, "utf8");

  const csvSha256 = createHash("sha256").update(csvContent, "utf8").digest("hex");

  const notionGraphPayload = {
    hubTitle: "Spiral · Journey Graph",
    scope: "V1 Trunks Only (Career Fog, Identity Crisis, Life Transition)",
    totalNotionLinkedNodes:
      trunkNodes.length +
      personas.length +
      patternRefs.length +
      arcs.length +
      safetyProtocols.length +
      clusters.length,
    databases: {
      trunkAndEntryNodes: trunkNodes,
      personas,
      patternReferences: patternRefs,
      engagementArcs: arcs,
      safetyProtocols,
      journeyClusters: clusters,
    },
    internalTriads: triads,
    structuralArchetypes: archetypes,
  };

  const nodesPath = join(outDir, "notion-graph-nodes.json");
  writeFileSync(nodesPath, JSON.stringify(notionGraphPayload, null, 2), "utf8");

  const clusterCountsByProb = clusters.reduce<Record<string, number>>(
    (acc, c) => {
      acc[c.probabilityTier] = (acc[c.probabilityTier] ?? 0) + 1;
      return acc;
    },
    {},
  );

  const summary = {
    generatedAtIso: new Date().toISOString(),
    totalJourneys: journeySeq - 1,
    csvSha256,
    notionNodeCounts: {
      trunkAndEntryNodes: trunkNodes.length,
      personas: personas.length,
      patternReferences: patternRefs.length,
      engagementArcs: arcs.length,
      safetyProtocols: safetyProtocols.length,
      journeyClusters: clusters.length,
      totalLinkedNodes: notionGraphPayload.totalNotionLinkedNodes,
    },
    clusterCountsByProbabilityTier: clusterCountsByProb,
    journeysByTrunk: byTrunk,
    journeysBySafetyTier: bySafetyTier,
    journeysByProbabilityTier: byProbabilityTier,
    journeysByRegionGroup: byRegionGroup,
    journeysByCrisisType: byCrisisType,
    pruningAudit: audit,
  };

  const summaryPath = join(outDir, "graph-summary.json");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  console.log("=== Spiral 45K Journey Graph Generation Complete ===");
  console.log(`Total Enumerated Journeys : ${summary.totalJourneys}`);
  console.log(
    `Total Linked Notion Nodes : ${summary.notionNodeCounts.totalLinkedNodes}`,
  );
  console.log(`Journeys by V1 Trunk      :`, byTrunk);
  console.log(`Clusters by Prob Tier     :`, clusterCountsByProb);
  console.log(`CSV SHA-256               : ${csvSha256}`);
}

runGeneration();
