# DEPENDENCIES.md: the only packages allowed

Agents: install nothing outside this list without asking Yazh first. Before installing, confirm the exact name exists on npm from the expected publisher. Never trust a package name you have not seen in official docs.

## Approved runtime packages

| Package | Why | Notes |
|---|---|---|
| `next` | App framework, server route handlers | App Router |
| `react`, `react-dom` | UI | Comes with Next.js |
| `firebase` | Client SDK: Auth only on the client | |
| `firebase-admin` | Server SDK: Firestore writes, token verification | Server only |
| `@google/genai` | Official Google Gen AI SDK for the Gemini API | Not the deprecated `@google/generative-ai`. If the SDK lacks an Interactions API method, call REST with `fetch` |
| `zod` | Validate structured model output and Firestore documents | |

## Approved dev packages

| Package | Why |
|---|---|
| `typescript`, `@types/node`, `@types/react` | Types |
| `eslint`, `eslint-config-next` | Linting |
| `prettier` | Formatting |
| `tsx` | Run `evals/run-evals.ts` |

## Approved if needed

| Package | Why |
|---|---|
| `tailwindcss` | Styling, only if chosen in T0. Otherwise CSS modules with the tokens in `AGENTS.md` |

## Not allowed

- `@google/generative-ai` (deprecated)
- Any UI kit, animation library or state manager (CSS transitions are enough)
- Any analytics SDK today
- Payment SDKs (out of scope)
- Anything that duplicates what is already listed

## Request a new package

| Date | Package | Why it is needed | Alternative considered | Approved? |
|---|---|---|---|---|
| | | | | |
