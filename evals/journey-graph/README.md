# Spiral · 45,000 Safe Guided Journeys Knowledge Graph (`evals/journey-graph/`)

Deterministic generator, two-stage psychological/cultural coherence pruner, and safety/IP verification suite for Spiral's **45,000-journey Issues Tree & Knowledge Graph**.

## Scope & Guardrails

- **V1 Trunks Only (`1B`):** `career_fog` (`15,000` journeys), `identity_crisis` (`15,000` journeys), and `life_transition` (`15,000` journeys). Amber and Red expansion spokes are excluded until post-sprint safety work.
- **Hybrid Notion + Repo Architecture (`2A`):**
  - **522 linked MECE nodes** synced to the top-level Notion hub **"Spiral · Journey Graph"** (`15` Trunk & Day-1 Entry State nodes, `12` India-First + Global/Diaspora Personas, `30` Internal Pattern & Signal Keys, `10` Engagement/IDK/Undue-Influence Arcs, `5` Multi-Turn Safety Protocols, and `450` Safety-Verified Cluster Cards).
  - **45,000 enumerated coherent journeys** (`JRN-00001`..`JRN-45000`) generated locally in `evals/journey-graph/out/journeys-45000.csv`.
- **Granularity (`7B`):** `P1_Core` (`120` clusters) and `P3_High_Risk_Edge` (`150` clusters) carry validated concrete exemplars; `P2_Common_Variant` (`180` clusters) carry state-machine rules and forbidden-move invariants only.
- **Strict IP Red-Line Enforcement (`10`):** Notion payloads reference `QID` numbers (`1..28`) and internal taxonomy keys only—never full question wording from `src/lib/journey/questions.ts` or benchmark rows from `evals/bridge-golden-set.json`.

## Commands

```bash
# 1. Regenerate 522 Notion graph nodes + 45,000-row CSV + summary audit
npx tsx evals/journey-graph/generate-45k.ts

# 2. Run Zod validation, production Bridge/L3/Label checks, and Q10 IP leak scan
npx tsx evals/journey-graph/verify-graph.ts
```
