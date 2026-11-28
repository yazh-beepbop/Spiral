# DIFFS.md: audit trail of approved changes

One row per approved change. Only add a row after `CHECKLIST.md` passes and the change is committed.

| # | Date / time | Task | What changed (files) | Commit | Tag | Checklist passed | Built by (model) |
|---|---|---|---|---|---|---|---|
| 1 | 2026-11-27 | Docs | Sprint planning, architecture, flow, models, bugs, decisions | `1219ea8` | | Yes | Antigravity (Gemini 4 Carbon) |
| 2 | 2026-11-27 | T0 | `.gitignore`, `.dockerignore`, `Dockerfile`, `package.json`, `tsconfig.json`, `next.config.ts`, `public/*`, `src/lib/config.ts`, `src/app/layout.tsx` | `e6cc1e1` | `t0-working` | Yes | Antigravity (Gemini 4 Carbon) |
| 3 | 2026-11-27 | T1 | `src/lib/log.ts`, `src/lib/gemini/client.ts`, `src/app/api/gemini/test/route.ts` | `e40a717` | `t1-working` | Yes | Antigravity (Gemini 4 Carbon) |
| 4 | 2026-11-27 | T2 | `firestore.rules`, `src/lib/db/*`, `src/lib/firebase/*`, `src/app/api/auth/session/route.ts`, `src/app/api/journey/start/route.ts` | `f2f1f35` | `t2-working` | Yes | Antigravity (Gemini 4 Carbon) |
| 5 | 2026-11-27 | T5–T6 | `src/lib/safety/*`, `src/app/paused/*`, `src/app/api/journey/resume/route.ts`, `src/lib/journey/idk.ts` | `d1d0e8e` | `t5-t6-working` | Yes | Antigravity (Gemini 4 Carbon) |
| 6 | 2026-11-27 | T3–T4, T7–T9 | `src/lib/journey/*`, `src/lib/bridge/*`, `src/app/session/*`, `src/app/bridge/*`, `src/app/api/{session,answer,bridge}` | `90d4694` | `t9-working` | Yes | Antigravity (Gemini 4 Carbon) |
| 7 | 2026-11-27 | T10–T11 | `src/lib/patterns/*`, `src/lib/synthesis/*`, `src/lib/demo/seed.ts`, `src/app/{page,start,synthesis}/*`, `evals/*` | `a8ca658` | `t10-working` | Yes | Antigravity (Gemini 4 Carbon) |
| 8 | 2026-11-27 | Clarity guide spec | `Design.md`, `CONSTRAINTS.md` | `03cf64e` | | Yes | Antigravity (Gemini 4 Carbon) |
| 9 | 2026-11-28 | P1: safety check | `src/lib/config.ts`, `src/lib/db/{schema,repository}.ts`, `src/lib/gemini/client.ts`, `src/lib/safety/{keywords,prompt,classify}.ts`, `src/app/api/answer/route.ts`, `evals/{safety-set.json,test-p1-safety.ts}` | `4264052` | | Yes | Antigravity (Gemini 4 Carbon) |
| 10 | 2026-11-28 | P2: IDK handling | `src/lib/journey/{idk-prompt,idk}.ts`, `src/app/api/answer/route.ts`, `evals/{idk-set.json,test-p2-idk.ts,verify-sprint.ts}` | `3712ef0` | | Yes | Antigravity (Gemini 4 Carbon) |
| 11 | 2026-11-28 | P3: Bridge prompt | `src/lib/bridge/{prompt,generate,fallbacks}.ts`, `src/lib/db/{schema,repository}.ts`, `src/lib/patterns/taxonomy.ts`, `src/app/api/bridge/route.ts`, `evals/{bridge-golden-set.json,test-p3-bridge.ts,verify-sprint.ts}` | `9c7cb61` | | Yes | Antigravity (Gemini 4 Carbon) |
| 12 | 2026-11-28 | P4: pattern map & synthesis | `src/lib/patterns/{prompt,detect}.ts`, `src/lib/synthesis/{prompt,generate}.ts`, `src/lib/db/{schema,repository}.ts`, `src/app/api/synthesis/route.ts`, `evals/journeys/{burnout,identity,already-knows}.json`, `evals/{test-p4-synthesis.ts,verify-sprint.ts}` | `5a71189` | | Yes | Antigravity (Gemini 4 Carbon) |

## How to fill it fast

```bash
git log -1 --format="%h %s"          # hash and message of the last commit
git diff --stat HEAD~1               # files changed in the last commit
```

## Rejected changes (worth remembering)

| Date | Task | What the AI tried | Why it was rejected |
|---|---|---|---|
| | | | |
