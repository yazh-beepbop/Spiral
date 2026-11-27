# HANDOVER.md: pick up exactly where the last session stopped

Agents: read this first in every new chat. Update it at the end of every session. Keep it short and current. Old entries move to the log at the bottom.

## Right now

- **Date:** 27 Nov 2026 (Gemini 4 Sprint, Bengaluru)
- **Current task:** T0–T10 complete & committed; T11 ready for `gcloud run deploy`
- **Last working commit:** `03cf64e` (`docs: clarify Spiral's role as a clarity guide`, building on `a8ca658`)
- **Branch:** main
- **Live URL:** ready to deploy via `CLOUD-RUN-DEPLOY.md`
- **Demo mode:** `GAP_MINUTES=2`, `DEMO_MODE=true`

## State of each part

| Part | Status | Notes |
|---|---|---|
| Scaffold, config, logging | Complete | Standalone Next.js App Router, `src/lib/config.ts`, `src/lib/log.ts`, PWA manifest/SW |
| Gemini client | Complete | `@google/genai` Interactions API (`ai.interactions.create`), 503 backoff retry + fallback |
| Auth + person + journey | Complete | `firestore.rules`, Firebase Auth + Cloud Run HMAC session, `/start` 18+ gate |
| Question bank | Complete | `src/lib/journey/questions.ts` (QIDs 1–28, Opener, L3, custom IDK redirects) |
| Session screen | Complete | `/session`, `/api/session/current`, `/api/answer` |
| Safety layer | Complete | `src/lib/safety/classify.ts`, `/paused` with India helplines (14416, 112), `excludedFromAI` |
| IDK rule | Complete | `src/lib/journey/idk.ts` Standard Mode 3-step escalation |
| Bridge | Complete | `src/lib/bridge/generate.ts`, `/api/bridge`, `/bridge`, golden set evals |
| Gap | Complete | `src/lib/journey/gap.ts`, server-enforced `nextUnlockAt` + monotonic countdown |
| Days 2 to 5 | Complete | Opener (Q6) + cached deep-model Adaptive L3 questions (Q11, Q16, Q23) |
| Synthesis | Complete | `src/lib/patterns/detect.ts` + `src/lib/synthesis/generate.ts` + `/synthesis` feedback |
| Deploy + demo seed | Built & ready | Cloud Run `Dockerfile` + `CLOUD-RUN-DEPLOY.md` + `src/lib/demo/seed.ts` |

## Open questions for Yazh

- Add `GEMINI_API_KEY` (and `GOOGLE_CLOUD_PROJECT`) to `.env.local` for live Gemini 4 runs, then push to your private GitHub repo and run `gcloud run deploy` per `CLOUD-RUN-DEPLOY.md`.

## Watch out for

- The temporary Google account is deleted tomorrow. Push everything to the private repo before leaving.
- If calls start failing with 429, check the spend cap at aistudio.google.com/spend.
- If calls fail with 503, the model is overloaded. The client should fall back. Log it in `BUGS.md`.

## Next three steps

1. T0 scaffold and private repo
2. T1 Gemini client
3. T2 auth, person, journey

## Session log

| When | Agent / model | What got done | Left off at |
|---|---|---|---|
| 2026-11-27 | Antigravity (Gemini 4 Carbon) | Built T0 scaffold (`package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.local`, `src/lib/config.ts`, `src/lib/log.ts`, `public/manifest.json`, `public/sw.js`, Landing screen); verified build, lint, typecheck, and server probe | Complete Git init + private GitHub push for T0, enable Gemini API plugin, then start T1 |
| 2026-11-27 | Antigravity (Gemini 4 Carbon) | Built T1–T11 end-to-end: `@google/genai` Interactions API client, Firestore rules & person-rooted repo, 18+ `/start`, Career Fog QIDs 1–28, `/session`, safety classifier + `/paused`, 3-step IDK rule, `<40w` Bridge + golden evals, server gap + countdown, adaptive L3, Day 5 pattern map + 500–800w hedged `/synthesis`, demo seeder, and Cloud Run `Dockerfile` | Add `GEMINI_API_KEY`, push to private GitHub repo, and run `gcloud run deploy` |
