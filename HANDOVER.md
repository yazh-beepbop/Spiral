# HANDOVER.md: pick up exactly where the last session stopped

Agents: read this first in every new chat. Update it at the end of every session. Keep it short and current. Old entries move to the log at the bottom.

## Right now

- **Date:** 28 Nov 2026 (Gemini 4 Sprint, Bengaluru)
- **Current task:** P1–P4 Core Prompts complete, verified (mocked), and pushed on branch `core-prompts` (`main` untouched)
- **Core prompt commits (`core-prompts`):**
  - `4264052` — `P1: safety check prompt, classifier and test set`
  - `3712ef0` — `P2: IDK detection and Standard Mode escalation`
  - `9c7cb61` — `P3: Bridge prompt, checks and fallbacks`
  - `5a71189` — `P4: Day 5 pattern map and synthesis`
- **Branch:** `core-prompts` (branched from `main` at `f40a55a`)
- **Live eval command (not run in build):** `npm run evals -- --live` (prints planned API calls first and aborts if over 300)

## State of each part

| Part | Status | Notes |
|---|---|---|
| Cost & usage guardrails | Complete | Rules-first pre-checks, short prompts, `usage` telemetry (no answer text), `DAILY_USER_CALL_CAP = 80` in `src/lib/config.ts` |
| P1: Safety check | Complete | `keywords.ts` (EN/HI/Hinglish/TA/Tanglish -> 0-call `acute`), `safety-v1` fast check, `< 0.7` deep escalation, `"concern"` fail-safe, 26-case `evals/safety-set.json` + confusion matrix |
| P2: IDK handling | Complete | Rules-first `idk-v1` (`plain` / `disguised` / `real_short_answer`), QID `7,17,18,27,28` custom redirects + fast concrete step-1, 4 rotated fixed step-2 lines (`gentle` switch), `"Okay. We'll leave that one open."` step-3, 15-case `evals/idk-set.json` |
| P3: Bridge Question | Complete | `bridge-v1` (6 benchmarks + 3 bad examples), `<40w` / advice / Section 8 checks, `1+1` deep call cap, `fallbacks.ts` Days 1–5, 6-point rubric, `referencedNextSession: null` |
| P4: Pattern map & synthesis | Complete | `patterns-v1` (`>= 2` multi-day quotes, cultural calibration) + `synthesis-v1` (6-part 500–800w structure, quoted-user-text label masking, existential safety re-check, cached in Firestore), 3 synthetic 5-day journeys in `evals/journeys/` |
| Evals runner | Ready for live run | `npm run evals` runs mocked P1–P4 + L3 checks; `npm run evals -- --live` prints call budget (~37 typical / 112 worst-case, hard stop > 300) |

## Open questions for Yazh

- Checkout `core-prompts`, ensure `GEMINI_API_KEY` is set in `.env.local`, and run `npm run evals -- --live` to inspect live confusion matrix, Bridge rubric scores, and synthetic journey syntheses before merging into `main`.

## Watch out for

- The temporary Google account is deleted tomorrow. Keep `core-prompts` and `main` pushed to the private GitHub repo.
- If calls start failing with 429, check both `DAILY_USER_CALL_CAP` in `src/lib/config.ts` and the spend cap at aistudio.google.com/spend.
- Never edit `firestore.rules`, `src/lib/safety/resources.ts`, question wording, or the 6 spec benchmark rows in `evals/bridge-golden-set.json`.

## Next three steps

1. Run `npm run evals -- --live` on `core-prompts` and review the live safety confusion table and Bridge rubric scores
2. Merge `core-prompts` into `main` once live eval targets pass (`0` acute missed)
3. Deploy via `CLOUD-RUN-DEPLOY.md` (`gcloud run deploy`)

## Session log

| When | Agent / model | What got done | Left off at |
|---|---|---|---|
| 2026-11-27 | Antigravity (Gemini 4 Carbon) | Built T0 scaffold (`package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.local`, `src/lib/config.ts`, `src/lib/log.ts`, `public/manifest.json`, `public/sw.js`, Landing screen); verified build, lint, typecheck, and server probe | Complete Git init + private GitHub push for T0, enable Gemini API plugin, then start T1 |
| 2026-11-27 | Antigravity (Gemini 4 Carbon) | Built T1–T11 end-to-end: `@google/genai` Interactions API client, Firestore rules & person-rooted repo, 18+ `/start`, Career Fog QIDs 1–28, `/session`, safety classifier + `/paused`, 3-step IDK rule, `<40w` Bridge + golden evals, server gap + monotonic countdown, adaptive L3, Day 5 pattern map + 500–800w hedged `/synthesis`, demo seeder, and Cloud Run `Dockerfile` | Add `GEMINI_API_KEY`, push to private GitHub repo, and run `gcloud run deploy` |
| 2026-11-28 | Antigravity (Gemini 4 Carbon) | Built P1–P4 Core Prompts on `core-prompts` branch (`4264052`, `3712ef0`, `9c7cb61`, `5a71189`): multilingual safety keyword pre-filter + `safety-v1` + 26-case set, rules-first `idk-v1` + fixed escalation + 15-case set, `bridge-v1` + rubric + fallbacks, `patterns-v1` + `synthesis-v1` + 3 synthetic journeys, usage telemetry + daily cap, and unified `evals/run-evals.ts` | Ready for Yazh to run `npm run evals -- --live` |
