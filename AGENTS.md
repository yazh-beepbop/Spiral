# AGENTS.md: Spiral build rules for AI agents

Antigravity and Codex read this file automatically from the repo root. Antigravity also reads `GEMINI.md`. If you use Claude Code, copy this file to `CLAUDE.md`.

## What we are building

Spiral is a guided self-inquiry PWA for people at life's turning points. A journey is five daily sessions of 15 to 20 minutes. Each session ends with a personal **Bridge Question** and an enforced **10-hour gap**. An invisible layer maps coping patterns and limiting beliefs. The **person** (not the session) is the root record, so Spiral remembers people across years.

Today's goal (Gemini 4 Sprint): ship the core loop for one entry point, **Career Fog**, running on Gemini 4, with the safety layer live from the first answer.

## Read these before you write any code

1. `MENTAL-MODEL.md`: how the system works, in plain English
2. `CONSTRAINTS.md`: what you must never do or touch
3. `Design.md`: features, the question bank, Bridge and synthesis specs, the pattern list
4. `ARCHITECTURE.md` and `FLOW.md`: stack, schema, data flow
5. `ROADMAP.md`: pick the next unchecked task. One task per prompt
6. `HANDOVER.md`: where the last session stopped

## Workflow rules

- Work on **one ROADMAP task at a time**. Do not start the next until the current one passes `CHECKLIST.md`.
- Before using any Gemini model or API, **use the Gemini skill**. It knows the latest model IDs and the Interactions API. Do not write Gemini code from memory.
- Install only packages listed in `DEPENDENCIES.md`. Ask before adding anything.
- When you choose a library, pattern or approach, add a line to `DECISIONS.md` saying why.
- When something breaks or you catch a hallucinated API, log it in `BUGS.md`.
- After each working feature: commit, then add the hash to `DIFFS.md`.
- At the end of every session, update `HANDOVER.md` and the status section of `Design.md`.
- If you are unsure whether something breaks a product rule, stop and ask. Do not guess.

## Coding and documenting guidelines (from the hackathon organisers)

- Create a file per feature or related features. Split as much as possible into different files.
- Add docstrings to all functions to explain what they do.
- Start each file with a long comment explaining in detail what the feature is about and its use cases.
- Maintain `Design.md` at the root of the app. It documents all the features of the app.
- Log as info all function calls (with their parameters). Log all genai calls with all their parameters (model used, prompt, config) and their outputs. Strip inline data.
- Group all configurable items (like model names) in one central file: `src/lib/config.ts`.

## Tech conventions

- Next.js (App Router) + TypeScript, strict mode. Deployed on Firebase App Hosting.
- Firebase Auth, Firestore, Firebase Admin SDK on the server.
- **All Gemini calls run on the server** (route handlers under `src/app/api/`). Never call Gemini from the browser. Never send the API key to the client.
- Validate every model response that should be structured (JSON) with `zod` before saving it.
- Every Gemini call goes through `src/lib/gemini/client.ts`, which handles logging, retries and fallback models.
- Model IDs, gap length and feature flags live in `src/lib/config.ts` only.
- Use `async/await`. No silent `catch {}`. Every caught error is logged.

## Styling

Match the Spiral sprint deck.

| Token | Value |
|---|---|
| Background | `#12091F` (near-black violet) |
| Primary accent | `#C9A2FF` (lavender) |
| Secondary accent | `#B6F7C9` (mint) |
| Headings and body | Sora |
| Labels, timers, small caps | JetBrains Mono |

Calm, spacious, one question per screen. Large readable type. Soft fade-in motion only. No confetti, streaks or gamification. Spiral is designed to end, not to hook.

## Voice in the product

Warm, direct, human. Short sentences. No therapy jargon, no clinical labels, no advice in Bridges. Never sound like a chatbot ("Great question!"). Write like a wise friend who listens closely.
