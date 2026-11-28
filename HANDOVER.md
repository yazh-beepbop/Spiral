# HANDOVER.md: pick up exactly where the last session stopped

Agents: read this first in every new chat. Update it at the end of every session. Keep it short and current. Old entries move to the log at the bottom.

## Right now

- **Date:** 28 Nov 2026 (Gemini 4 Sprint, Bengaluru)
- **Branch:** `voice-and-language` (feature commit `f94bc63`, branched cleanly off `main` `f40a55a`; `main` and the demo build untouched)
- **Current task:** Voice Input (stateless Gemini STT) + Language Option (`en`, `hinglish`, `hi`, `ta`) complete, tested end-to-end, committed, and pushed
- **Demo mode:** `GAP_MINUTES=2`, `DEMO_MODE=true`

## Voice Input & Language Option Summary (`voice-and-language`)

1. **Voice Input (speech-to-text only — Spiral never speaks back):**
   - Added `VoiceMicButton` (`src/components/VoiceMicButton.tsx`) next to every text answer box on `/session` (`short`, `long`, and Day 5 `QID 29` priority/step inputs) with tap-to-record / tap-to-stop controls.
   - Requests microphone permission **only on first tap**, showing a plain-spoken explanation line beforehand.
   - Transcribes audio on the server via `POST /api/voice/transcribe` -> `src/lib/gemini/transcribe.ts` (`gemini-4-hydrogen`, `store: false`) supporting English, Hinglish, Tamil, Hindi, and Indian accents.
   - Places the transcript into the answer box so the user can read and edit it before sending; submits through `/api/answer` so the existing safety classifier runs identically to typed text.
   - Deletes/zeroes audio buffers immediately in `finally` on both client and server (`audioBuffer.fill(0)`) and strips inline audio data in `src/lib/log.ts` — audio is never stored.
2. **Language Option (`English`, `Hinglish`, `Hindi`, `Tamil`):**
   - Added onboarding (`OnboardingLanguagePicker` on `/start`) and header settings (`SettingsLanguageButton` modal across all screens) backed by `LanguageProvider` and `GET/PATCH /api/settings`.
   - Moved all UI copy across `/`, `/start`, `/session`, `/bridge`, `/synthesis`, and `/paused` into typed i18n dictionaries (`src/lib/i18n/{en,hinglish,hi,ta}.ts`) with zero hardcoded UI strings and without modifying protected `questions.ts` or `resources.ts`.
   - Wired `language` into Adaptive L3 questions, IDK redirects, Bridge generation (`< 40` words, no advice), and Day 5 synthesis; every saved `AnswerDoc` persists original `text` + `language` code (`en | hinglish | hi | ta`).
   - Extended `src/lib/safety/classify.ts`, `src/lib/safety/prompt.ts`, `/paused` helplines, and `evals/safety-set.json` with red-team self-harm hint cases (plus workplace-metaphor controls) across English, Hinglish, Hindi (`हिन्दी`), and Tamil (`தமிழ்`).
3. **End-to-End Verification:**
   - `npm run typecheck`, `npm run lint`, `npm run build`, `npm run evals` (14 safety cases + Bridge golden set + multilingual leading-question guards), `evals/verify-sprint.ts`, and live Gemini multimodal STT + Hindi Bridge + Tamil safety-pause tests all passed.

## State of each part

| Part | Status | Notes |
|---|---|---|
| Scaffold, config, logging | Complete | Standalone Next.js App Router, `src/lib/config.ts`, `src/lib/log.ts` (inline audio stripped), PWA manifest/SW |
| Gemini client | Complete | `@google/genai` Interactions API (`ai.interactions.create`), 45s synthesis timeout + Hydrogen fallback, `user_input` audio support |
| Auth + person + journey | Complete | `firestore.rules`, Firebase Auth + Cloud Run HMAC session, `/start` 18+ gate, `language` persisted |
| Question bank + i18n | Complete | `src/lib/journey/questions.ts` untouched; localized via `src/lib/i18n/{en,hinglish,hi,ta}.ts` |
| Session + Voice STT | Complete | `/session`, `VoiceMicButton`, `/api/voice/transcribe` (ephemeral audio deleted immediately) |
| Safety layer | Complete | Multilingual `classify.ts` + `/paused` helplines (`14416`, `112`) + red-team evals in all 4 languages |
| IDK rule | Complete | `src/lib/journey/idk.ts` Standard Mode 3-step escalation localized across all 4 languages |
| Bridge + Gap | Complete | `<40w` multilingual Bridges (`src/lib/bridge/generate.ts`) + server-enforced `nextUnlockAt` |
| Synthesis | Complete | `src/lib/patterns/detect.ts` + `src/lib/synthesis/generate.ts` + cached demo safety net |
| Deploy + demo seed | Built & ready | Cloud Run `Dockerfile` + `CLOUD-RUN-DEPLOY.md` + `src/lib/demo/seed.ts` |

## Watch out for

- The temporary Google account is deleted tomorrow. Keep all branches pushed to the private repo.
- Never commit `.env*` or service account keys.
- On `v1` Interactions API, multimodal inputs must be wrapped in `[{ type: "user_input", content: [...] }]` (`BUGS.md` #4).

## Session log

| When | Agent / model | What got done | Left off at |
|---|---|---|---|
| 2026-11-27 | Antigravity (Gemini 4 Carbon) | Built T0–T11 end-to-end on `main`, fixed `/synthesis` timeout + Hydrogen fallback + Firestore demo cache (`f40a55a`) | Demo build verified and pushed on `main` |
| 2026-11-28 | Antigravity (Gemini 4 Carbon) | On branch `voice-and-language`: built stateless Gemini Voice Input STT (`VoiceMicButton`, `/api/voice/transcribe`), 4-language i18n (`en`, `hinglish`, `hi`, `ta`) with onboarding & settings pickers, multilingual Bridges/questions/helplines, answer `language` persistence, and multilingual self-harm red-team evals; verified live end-to-end | Committed and pushed to `origin/voice-and-language`; ready for review/PR |
