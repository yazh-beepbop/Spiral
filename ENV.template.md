# ENV.template.md: every secret and setting, explained

Copy the block at the bottom into `.env.local` at the repo root. Never commit `.env.local`. On Firebase App Hosting, set the same values as secrets or environment variables in `apphosting.yaml`, with the API key stored as a secret.

## Secrets (never in code, never in the browser)

| Variable | What it is | Where to get it |
|---|---|---|
| `GEMINI_API_KEY` | Key for the Gemini API from the hackathon's temporary paid project (tier 3). Server only. It stops working when the account is deleted tomorrow | aistudio.google.com/api-keys. If none is there, use "Create API key" |
| `FIREBASE_SERVICE_ACCOUNT` | Admin credentials for local development only, as a JSON string. Not needed on App Hosting, which uses its own credentials | Firebase console, Project settings, Service accounts, Generate new private key |

## Public config (safe in the browser, still kept in env)

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web config key. Identifies the project, not a secret. Protected by Firestore rules |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web app ID |

All four come from Firebase console, Project settings, Your apps, Web app config.

## App settings

| Variable | What it does | Default |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | The temporary project ID | from aistudio.google.com/projects |
| `MODEL_FAST` | Model for the live flow, safety and IDK checks | `gemini-4-hydrogen` |
| `MODEL_DEEP` | Model for Bridge, adaptive questions, pattern map, synthesis | `gemini-4-argon` |
| `MODEL_FAST_FALLBACK` | Used when the fast model is overloaded | `gemini-3.8-flash` |
| `MODEL_DEEP_FALLBACK` | Used when the deep model is overloaded | `gemini-3.1-pro-preview` |
| `GAP_MINUTES` | Gap between sessions | `600` (use `2` for the demo) |
| `DEMO_MODE` | Shows the seeded demo journey | `false` |
| `LOG_LEVEL` | `info` logs every function call and genai call | `info` |

Confirm the model IDs with the Gemini skill before relying on them. `src/lib/config.ts` reads these and is the only place the code gets them.

## Copy into `.env.local`

```bash
# Secrets
GEMINI_API_KEY=
FIREBASE_SERVICE_ACCOUNT=

# Firebase web config (public)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# App settings
GOOGLE_CLOUD_PROJECT=
MODEL_FAST=gemini-4-hydrogen
MODEL_DEEP=gemini-4-argon
MODEL_FAST_FALLBACK=gemini-3.8-flash
MODEL_DEEP_FALLBACK=gemini-3.1-pro-preview
GAP_MINUTES=2
DEMO_MODE=true
LOG_LEVEL=info
```
