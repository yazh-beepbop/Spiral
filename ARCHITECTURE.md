# ARCHITECTURE.md: stack, structure, schema

## Stack (sprint build)

| Layer | Choice | Notes |
|---|---|---|
| App | Next.js (App Router) + TypeScript | PWA: manifest + service worker. One question per screen. |
| Hosting | Firebase App Hosting | Runs the Next.js app, including server route handlers. |
| Auth | Firebase Auth | Sprint: anonymous auth + 18+ attestation. Later: email link (magic link). |
| Database | Cloud Firestore | Person-rooted schema below. The only source of truth. |
| Server logic | Next.js route handlers (`src/app/api/*`) using Firebase Admin SDK | Verifies the Firebase ID token on every request. All Gemini calls happen here. |
| AI | Gemini API via the Interactions API | Fast model for flow and safety, deep model for Bridge, patterns, synthesis. See `MODELS.md`. |
| Validation | zod | Every structured model output is parsed before saving. |
| Prompt work | Google AI Studio | Design and test prompts there, then copy them into `src/lib/*/prompt.ts`. |
| Build | Antigravity | With the Gemini skill on. |
| Stretch | Cloud Functions + Cloud Tasks + FCM | Push the Bridge and unlock notice after 10 hours. |
| Stretch | Gemini Live API | Voice mode for speaking answers. |

## Folder structure

```
spiral/
├── AGENTS.md  Design.md  CONSTRAINTS.md  ... (all context .md files at root)
├── .env.local                 # never committed
├── firestore.rules
├── evals/
│   ├── bridge-golden-set.json # the 6 spec benchmarks + logged pilot Bridges
│   ├── safety-set.json        # adversarial safety cases
│   └── run-evals.ts           # runs on every prompt or model change
├── public/
│   ├── manifest.json
│   └── sw.js
└── src/
    ├── app/
    │   ├── page.tsx                 # landing
    │   ├── start/page.tsx           # 18+ attestation, entry point (Career Fog)
    │   ├── session/page.tsx         # today's session, one question at a time
    │   ├── bridge/page.tsx          # today's Bridge + countdown
    │   ├── synthesis/page.tsx       # Day 5 synthesis with "did this land?"
    │   ├── paused/page.tsx          # acute safety pause + resources
    │   └── api/
    │       ├── journey/start/route.ts
    │       ├── session/current/route.ts   # returns today's state or "locked until"
    │       ├── answer/route.ts            # safety -> IDK -> save -> next question
    │       ├── bridge/route.ts            # end of day: generate + set nextUnlockAt
    │       └── synthesis/route.ts         # Day 5: pattern map + synthesis
    └── lib/
        ├── config.ts            # model IDs, GAP_MINUTES, flags. The ONLY place for these
        ├── log.ts               # info logging, strips inline data
        ├── firebase/admin.ts    # Admin SDK init (server)
        ├── firebase/client.ts   # client SDK init (auth only)
        ├── gemini/client.ts     # every Gemini call: logging, retries, fallback
        ├── safety/classify.ts   # none | concern | acute
        ├── safety/resources.ts  # helplines, India first
        ├── journey/questions.ts # question bank with permanent QIDs
        ├── journey/idk.ts       # IDK detection + Standard Mode escalation
        ├── journey/gap.ts       # nextUnlockAt logic
        ├── bridge/prompt.ts     # Bridge prompt
        ├── bridge/generate.ts
        ├── patterns/taxonomy.ts # pattern keys and descriptions (from Design.md)
        ├── patterns/detect.ts   # Day 5 structured pattern map
        ├── synthesis/prompt.ts
        ├── synthesis/generate.ts
        └── db/schema.ts         # zod types for every Firestore document
```

## Firestore schema (person-rooted)

```
persons/{personId}
  createdAt, ageAttested18: true, country, anniversaryOptIn

persons/{personId}/journeys/{journeyId}
  entryPoint: "career_fog"
  idkMode: "standard" | "gentle"
  status: "active" | "paused" | "completed" | "abandoned"
  currentDay: 1..5
  nextUnlockAt: Timestamp | null
  crisisType: null | "burnout" | "identity" | "existential" | "transition"
  startedAt, completedAt

persons/{personId}/journeys/{journeyId}/sessions/{day}
  day, openedAt, completedAt, overnightReflection

persons/{personId}/journeys/{journeyId}/sessions/{day}/answers/{answerId}
  qid, layer, questionText (snapshot), text, idkCount, idkFlagged,
  safety: { level: "none"|"concern"|"acute", model, escalated: bool },
  excludedFromAI: bool, createdAt

persons/{personId}/journeys/{journeyId}/bridges/{day}
  text, format: "pattern_observation"|"belief_challenge"|"reframe_question",
  wordCount, model, promptVersion, createdAt

persons/{personId}/journeys/{journeyId}/patternFlags/{flagId}
  patternKey, category, evidence: [{ answerPath, quote }], confidence, model

persons/{personId}/journeys/{journeyId}/synthesis/main
  text, insights: [{ id, text, patternKey, landed: null|true|false }],
  model, promptVersion, createdAt

persons/{personId}/safetyEvents/{eventId}
  level, answerPath, action, createdAt
```

Rules: a signed-in user can read and write only `persons/{theirUid}/**`. Writes that change `nextUnlockAt`, `safety`, bridges, flags or synthesis happen only through the Admin SDK on the server.

## Request path

Browser (Firebase ID token) -> Next.js route handler -> verify token -> Firestore read -> Gemini (server only) -> zod validate -> Firestore write -> response.
