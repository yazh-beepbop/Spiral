# MODELS.md: which model does what

Two parts: the models Spiral calls at runtime, and the AI agents that built each part of the code.

## Part 1: runtime models

Model IDs live only in `src/lib/config.ts` (read from env). Confirm current IDs with the Gemini skill before T1. All calls use the Interactions API through `src/lib/gemini/client.ts`.

| Job | Model | Why | Output |
|---|---|---|---|
| Safety classification on every answer | Fast: `gemini-4-hydrogen` | Runs on every turn, so speed and cost matter | JSON: `level` (none, concern, acute), `confidence`, `reason` |
| Safety escalation when uncertain | Deep: `gemini-4-argon` | A second opinion on the hard cases | Same JSON |
| "I don't know" detection | Fast | Simple classification | JSON: `isIdk`, `variant` |
| Next-question flow, small follow-ups | Fast | Live and conversational | Text |
| Adaptive questions (L3) | Deep | Must reference earlier answers precisely | Text, one question |
| Bridge Question | Deep | The signature moment. Quality matters most here | JSON: `text`, `format` |
| Pattern map (Day 5) | Deep | Reads the whole journey, returns structure | JSON validated by zod |
| Synthesis (Day 5) | Deep | 500 to 800 words in the person's own words | Text + insights array |

**Fallbacks:** fast falls back to `gemini-3.8-flash`, deep falls back to `gemini-3.1-pro-preview`. If Argon is slow or overloaded during the demo, Hydrogen is a reasonable stand-in for Bridges too. Set it in config, do not edit code.

**Thinking level:** low for safety and IDK checks, medium for Bridges and adaptive questions, high for the pattern map and synthesis. Tune if latency hurts the demo.

**Prompt versions:** every prompt file exports a `PROMPT_VERSION`. Bridges and syntheses save it, so the eval harness can compare versions.

## Part 2: build log (which agent built what)

Fill this in as you go. It tells you which tool to go back to when a part breaks.

| Subsystem | Built with (tool + model) | Date | Notes |
|---|---|---|---|
| Scaffold, config, logging | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T0: Next.js standalone App Router, `src/lib/config.ts`, `src/lib/log.ts`, PWA manifest + SW |
| Gemini client | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T1: `@google/genai` Interactions API (`ai.interactions.create`), 503 retry + fallback |
| Auth + Firestore rules | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T2: `firestore.rules`, Firebase Auth + Cloud Run HMAC session, person-rooted schema |
| Question bank | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T3: Career Fog QIDs 1–28, Opener, L3 templates, custom IDK redirects |
| Session screen | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T4/T9: `/session`, `/api/session/current`, `/api/answer`, adaptive L3 (`adaptive.ts`) |
| Safety layer | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T5: `classify.ts` (fast -> deep escalation), `/paused`, `excludedFromAI=true` |
| IDK rule | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T6: `idk.ts` Standard Mode 3-step escalation |
| Bridge | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T7: `bridge/generate.ts` (`<40w`, no advice, retry), `/bridge`, golden set evals |
| Gap | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T8: Server-time `gap.ts` + monotonic countdown on `/bridge` |
| Synthesis | Antigravity (Gemini 4 Carbon) | 2026-11-27 | T10: `patterns/detect.ts` + `synthesis/generate.ts` + `/synthesis` feedback |
| UI and styling | Antigravity (Gemini 4 Carbon) | 2026-11-27 | All 7 screens (`Landing`, `Start`, `Session`, `Bridge`, `Locked`, `Synthesis`, `Paused`) + Cloud Run `Dockerfile` |
| Design mockups (Stitch) | | | |
