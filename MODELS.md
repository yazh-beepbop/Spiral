# MODELS.md: which model does what

Two parts: the models Spiral calls at runtime, and the AI agents that built each part of the code.

## Part 1: runtime models & prompt versions

Model IDs and thresholds live only in `src/lib/config.ts` (read from env). All calls use the `@google/genai` Interactions API through `src/lib/gemini/client.ts`, which enforces `DAILY_USER_CALL_CAP` and logs model, token counts, and estimated USD cost to `usage` (with zero answer text).

| Job | Prompt file & `PROMPT_VERSION` | Model (`config.ts`) | Escalation / Retry cap | Output |
|---|---|---|---|---|
| Safety keyword pre-filter | `src/lib/safety/keywords.ts` (rules) | Plain code (`0` calls on hit) | Immediate `"acute"` on EN / HI / Hinglish / TA / Tanglish hit | `{ matched, signals }` |
| Safety classification | `src/lib/safety/prompt.ts` (`safety-v1`) | Fast: `gemini-4-hydrogen` (`thinkingLevel: "low"`) | If `confidence < 0.7` (`SAFETY_CONFIDENCE_THRESHOLD`), re-runs on Deep: `gemini-4-argon`; if still `< 0.7` or error, returns at least `"concern"` | JSON: `level` (`none` \| `concern` \| `acute`), `confidence`, `reason`, `signals` |
| IDK detection | `src/lib/journey/idk-prompt.ts` (`idk-v1`) | Rules first -> Fast: `gemini-4-hydrogen` only if unsure | 1 Zod retry, then accepts answer | JSON: `isIdk`, `type` (`plain` \| `disguised` \| `real_short_answer`) |
| IDK Step-1 smaller question | `src/lib/journey/idk-prompt.ts` (`idk-v1`) | Fixed `Design.md` redirect for QIDs `7, 17, 18, 27, 28`; Fast: `gemini-4-hydrogen` for other QIDs | Step 2 & Step 3 are fixed strings (0 model calls) | JSON: `redirect` (1 open sentence) |
| Adaptive questions (L3) | `src/lib/journey/adaptive-prompt.ts` (`adaptive-l3-v1.1`) | Deep: `gemini-4-argon` (`thinkingLevel: "medium"`) | 1 neutrality retry, then neutral fallback | Text, one open question |
| Bridge Question | `src/lib/bridge/prompt.ts` (`bridge-v1`) | Deep only: `gemini-4-argon` (`thinkingLevel: "medium"`) | Max 1 generation + 1 retry per day, else `src/lib/bridge/fallbacks.ts` | JSON: `text`, `format`, `word_count`, `source_qid` + saved 6-point rubric |
| Pattern map (Day 5) | `src/lib/patterns/prompt.ts` (`patterns-v1`) | Deep only: `gemini-4-argon` (`thinkingLevel: "medium"`) | Max 1 generation + 1 retry (`>= 2` quotes across different days) | JSON: `patterns`, `crisis_type`, `contradictions`, `unanswered_qids`, `already_knows` |
| Synthesis (Day 5) | `src/lib/synthesis/prompt.ts` (`synthesis-v1`) | Deep only: `gemini-4-argon` (`thinkingLevel: "medium"`) | Max 1 generation + 1 retry, cached in Firestore (`synthesis/main`); re-runs `safety-v1` when `crisis_type === "existential"` | JSON: `text` (500–800w) + `insights` array (`id`, `text`, `landed`) |

**Fallbacks:** general fast calls fall back to `gemini-3.8-flash`; general deep calls fall back to `gemini-3.1-pro-preview`. Bridge, Pattern Map, and Synthesis strictly cap deep calls (`1 + 1 retry`) per cost rules.

## Part 2: build log (which agent built what)

| Subsystem | Built with (tool + model) | Date | Notes |
|---|---|---|---|
| Scaffold, config, logging | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T0: Next.js standalone App Router, `src/lib/config.ts`, `src/lib/log.ts`, PWA manifest + SW |
| Gemini client | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T1: `@google/genai` Interactions API (`ai.interactions.create`), 503 retry + fallback |
| Auth + Firestore rules | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T2: `firestore.rules`, Firebase Auth + Cloud Run HMAC session, person-rooted schema |
| Question bank | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T3: Career Fog QIDs 1–29, Opener, L3 templates, custom IDK redirects |
| Session screen | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T4/T9: `/session`, `/api/session/current`, `/api/answer`, adaptive L3 (`adaptive.ts`) |
| UI and styling | Antigravity (Gemini 4 Carbon) | 2026-11-27 | All 7 screens (`Landing`, `Start`, `Session`, `Bridge`, `Locked`, `Synthesis`, `Paused`) + Cloud Run `Dockerfile` |
| P1: Safety check & usage cap | Antigravity (Gemini 4 Carbon) | 2026-11-28 | `keywords.ts` (EN/HI/Hinglish/TA/Tanglish), `safety-v1`, `<0.7` escalation + `"concern"` fail-safe, `usage` telemetry + `DAILY_USER_CALL_CAP`, 26-case `evals/safety-set.json` |
| P2: IDK detection & escalation | Antigravity (Gemini 4 Carbon) | 2026-11-28 | Rules-first `idk-v1` (`plain` / `disguised` / `real_short_answer`), fixed Step-2 rotation + Gentle Mode switch + `"Okay. We'll leave that one open."`, 15-case `evals/idk-set.json` |
| P3: Bridge prompt & fallbacks | Antigravity (Gemini 4 Carbon) | 2026-11-28 | `bridge-v1` (6 benchmarks + 3 negative examples), Section 8 label/advice/word checks, 6-point rubric, `referencedNextSession`, `fallbacks.ts` |
| P4: Pattern map & synthesis | Antigravity (Gemini 4 Carbon) | 2026-11-28 | `patterns-v1` + `synthesis-v1` (6-part structure, quoted-user-text label masking, existential safety re-check) + 3 synthetic journeys in `evals/journeys/` |
