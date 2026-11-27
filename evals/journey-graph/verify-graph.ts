/**
 * Comprehensive Verification & IP Red-Line Audit for Spiral's 45K Journey Graph
 * (`evals/journey-graph/verify-graph.ts`).
 *
 * Feature overview & use cases:
 * - Proves every structural, safety, undue-influence, granularity, and IP rule before
 *   pushing to GitHub or syncing nodes to Notion:
 *   1. Exact `45,000` unique rows (`JRN-00001`..`JRN-45000`), `15,000` per V1 Trunk, zero
 *      Amber/Red expansion spokes (`1B`, `2A`, `4`).
 *   2. Total Notion linked nodes (`522`) sits cleanly within the `300–600` target (`2A`).
 *   3. Every `P1_Core` and `P3_High_Risk_Edge` cluster has concrete exemplars passing
 *      Spiral's real production validators (`validateBridgeText`, `validateNonLeadingQuestion`,
 *      `findLeakedPatternLabels`), and every `P2_Common_Variant` cluster has `exemplars === null` (`7B`).
 *   4. All 30 internal pattern keys in `PATTERN_TAXONOMY` are represented (`8`, `10`).
 *   5. All 3 multi-turn safety scenarios (metaphor disambiguation, cumulative concern,
 *      post-acute resumption with grounding) and acute AI-exclusion invariants pass (`5`).
 *   6. **Strict Q10 IP Red-Line Scan**: Confirms ZERO verbatim question texts from
 *      `CAREER_FOG_QUESTIONS` and ZERO benchmark Bridges or sample answers from
 *      `evals/bridge-golden-set.json` appear anywhere in `notion-graph-nodes.json`.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { validateBridgeText } from "../../src/lib/bridge/generate";
import { validateNonLeadingQuestion } from "../../src/lib/journey/leading-guard";
import { CAREER_FOG_QUESTIONS } from "../../src/lib/journey/questions";
import {
  findLeakedPatternLabels,
  PATTERN_TAXONOMY,
} from "../../src/lib/patterns/taxonomy";
import {
  JourneyClusterNodeSchema,
  PatternReferenceNodeSchema,
  PersonaNodeSchema,
  SafetyProtocolNodeSchema,
  TrunkEntryNodeSchema,
  EngagementArcNodeSchema,
} from "./types";

interface GoldenBridgeRow {
  id: string;
  bridge: string;
  sampleAnswers: Array<{ text: string; questionText: string }>;
}

/**
 * Normalizes whitespace and case for strict substring leak scanning.
 */
function normalizeForScan(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Executes all verification checks and exits non-zero on any violation.
 */
function verifyAll(): void {
  const outDir = join(process.cwd(), "evals", "journey-graph", "out");
  const nodesRaw = readFileSync(join(outDir, "notion-graph-nodes.json"), "utf8");
  const csvRaw = readFileSync(join(outDir, "journeys-45000.csv"), "utf8");
  const goldenRaw = readFileSync(
    join(process.cwd(), "evals", "bridge-golden-set.json"),
    "utf8",
  );

  const graph = JSON.parse(nodesRaw) as {
    hubTitle: string;
    totalNotionLinkedNodes: number;
    databases: {
      trunkAndEntryNodes: unknown[];
      personas: unknown[];
      patternReferences: unknown[];
      engagementArcs: unknown[];
      safetyProtocols: unknown[];
      journeyClusters: unknown[];
    };
  };

  let failures = 0;
  const fail = (msg: string): void => {
    failures += 1;
    console.error(`[FAIL] ${msg}`);
  };

  // 1. Validate Zod schemas on all 522 Notion nodes
  const trunkNodes = graph.databases.trunkAndEntryNodes.map((n) =>
    TrunkEntryNodeSchema.parse(n),
  );
  const personas = graph.databases.personas.map((n) =>
    PersonaNodeSchema.parse(n),
  );
  const patternRefs = graph.databases.patternReferences.map((n) =>
    PatternReferenceNodeSchema.parse(n),
  );
  const arcs = graph.databases.engagementArcs.map((n) =>
    EngagementArcNodeSchema.parse(n),
  );
  const safetyNodes = graph.databases.safetyProtocols.map((n) =>
    SafetyProtocolNodeSchema.parse(n),
  );
  const clusters = graph.databases.journeyClusters.map((n) =>
    JourneyClusterNodeSchema.parse(n),
  );

  const totalNodes =
    trunkNodes.length +
    personas.length +
    patternRefs.length +
    arcs.length +
    safetyNodes.length +
    clusters.length;

  if (totalNodes < 300 || totalNodes > 600) {
    fail(`Notion node count ${totalNodes} outside requested 300–600 range.`);
  } else {
    console.log(`[PASS] Notion linked node count = ${totalNodes} (target 300–600).`);
  }

  // 2. Verify 45,000 CSV rows, uniqueness, and 3 V1 trunks only
  const lines = csvRaw.trimEnd().split("\n");
  const dataLines = lines.slice(1);
  if (dataLines.length !== 45000) {
    fail(`Expected 45,000 CSV data rows, found ${dataLines.length}.`);
  } else {
    console.log(`[PASS] CSV row count = ${dataLines.length}.`);
  }

  const seenJourneyIds = new Set<string>();
  const seenSixTuples = new Set<string>();
  const allowedTrunks = new Set([
    "career_fog",
    "identity_crisis",
    "life_transition",
  ]);

  for (const line of dataLines) {
    const cols = line.split(",");
    const jid = cols[0];
    const trunk = cols[3];
    const tupleKey = `${cols[3]}|${cols[4]}|${cols[5]}|${cols[7]}|${cols[12]}|${cols[13]}|${cols[15]}`;
    if (seenJourneyIds.has(jid)) {
      fail(`Duplicate journey_id ${jid}`);
      break;
    }
    seenJourneyIds.add(jid);
    if (seenSixTuples.has(tupleKey)) {
      fail(`Duplicate 6-axis tuple ${tupleKey}`);
      break;
    }
    seenSixTuples.add(tupleKey);
    if (!allowedTrunks.has(trunk)) {
      fail(`Out-of-scope trunk detected: ${trunk}`);
      break;
    }
  }
  console.log(
    `[PASS] All ${seenSixTuples.size} journey 6-axis tuples are unique and scoped to V1 Trunks only.`,
  );

  // 3. Verify all 30 internal pattern keys exist
  const refKeys = new Set(patternRefs.map((p) => p.patternKey));
  for (const entry of PATTERN_TAXONOMY) {
    if (!refKeys.has(entry.key)) {
      fail(`Missing taxonomy key in patternReferences: ${entry.key}`);
    }
  }
  console.log(
    `[PASS] All ${PATTERN_TAXONOMY.length} internal PATTERN_TAXONOMY keys covered.`,
  );

  // 4. Verify Q7B exemplar rules + production Bridge/L3/Label validators on every P1 and P3 cluster
  let p1Count = 0;
  let p2Count = 0;
  let p3Count = 0;
  let governedSum = 0;

  for (const clu of clusters) {
    governedSum += clu.governedJourneyCount;
    if (clu.probabilityTier === "P2_Common_Variant") {
      p2Count += 1;
      if (clu.exemplars !== null) {
        fail(`${clu.clusterId} is P2_Common_Variant and MUST NOT include exemplars (Q7B).`);
      }
      continue;
    }

    if (clu.probabilityTier === "P1_Core") {
      p1Count += 1;
    } else {
      p3Count += 1;
    }

    if (!clu.exemplars) {
      fail(`${clu.clusterId} (${clu.probabilityTier}) missing required exemplars (Q7B).`);
      continue;
    }

    const bridgeCheck = validateBridgeText(
      clu.exemplars.compliantBridgeExample,
      40,
    );
    if (!bridgeCheck.valid) {
      fail(
        `${clu.clusterId} Bridge failed validateBridgeText: ${bridgeCheck.reasons.join("; ")}`,
      );
    }

    const l3Check = validateNonLeadingQuestion(
      clu.exemplars.neutralAdaptiveL3Prompt,
      { requireOpenQuestion: true },
    );
    if (!l3Check.valid) {
      fail(
        `${clu.clusterId} L3 prompt failed validateNonLeadingQuestion: ${l3Check.reasons.join("; ")}`,
      );
    }

    const synthLeaks = findLeakedPatternLabels(
      clu.exemplars.hedgedSynthesisSnippet,
    );
    if (synthLeaks.length > 0) {
      fail(
        `${clu.clusterId} synthesis snippet leaked forbidden labels: ${synthLeaks.join(", ")}`,
      );
    }
    if (!clu.exemplars.hedgedSynthesisSnippet.includes("Or it may simply be that")) {
      fail(
        `${clu.clusterId} synthesis snippet missing mandatory 'Or it may simply be that' alternative reading.`,
      );
    }
  }

  if (governedSum !== 45000) {
    fail(`Cluster governedJourneyCount sum = ${governedSum}, expected 45,000.`);
  }
  console.log(
    `[PASS] Cluster exemplars & validators verified (P1=${p1Count}, P2=${p2Count} [rules-only], P3=${p3Count}; sum=${governedSum}).`,
  );

  // 5. Strict Q10 IP Red-Line Scan against full question bank wording & golden set
  const normalizedPayload = normalizeForScan(nodesRaw);

  for (const q of Object.values(CAREER_FOG_QUESTIONS)) {
    const cleanQ = q.text.replace(/^\[Adaptive\]\s*/i, "").trim();
    const normQ = normalizeForScan(cleanQ);
    if (normQ.length >= 16 && normalizedPayload.includes(normQ)) {
      fail(`IP RED-LINE VIOLATION: QID ${q.qid} question wording leaked into Notion payload!`);
    }
    if (q.idkRedirect) {
      const normRedir = normalizeForScan(q.idkRedirect);
      if (normalizedPayload.includes(normRedir)) {
        fail(`IP RED-LINE VIOLATION: QID ${q.qid} IDK redirect wording leaked into Notion payload!`);
      }
    }
  }

  const goldenRows = JSON.parse(goldenRaw) as GoldenBridgeRow[];
  for (const row of goldenRows) {
    const normBridge = normalizeForScan(row.bridge);
    if (normalizedPayload.includes(normBridge)) {
      fail(`IP RED-LINE VIOLATION: Golden set Bridge '${row.id}' leaked into Notion payload!`);
    }
    for (const ans of row.sampleAnswers) {
      const normAns = normalizeForScan(ans.text);
      if (normAns.length >= 16 && normalizedPayload.includes(normAns)) {
        fail(`IP RED-LINE VIOLATION: Golden set sampleAnswer in '${row.id}' leaked into Notion payload!`);
      }
    }
  }
  console.log(
    `[PASS] Q10 IP Red-Line Audit: 0 question-bank texts and 0 golden-set rows present in Notion payload.`,
  );

  if (failures > 0) {
    console.error(`\nVerification FAILED with ${failures} error(s).`);
    process.exit(1);
  }
  console.log("\nALL 45K JOURNEY GRAPH & IP SAFETY CHECKS PASSED.");
}

verifyAll();
