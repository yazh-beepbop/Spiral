# FLOW.md: how data moves through Spiral

## 1. Journey flow (what the person experiences)

```mermaid
flowchart TD
  A[Landing] --> B[Start: 18+ attestation]
  B --> C[Anonymous Firebase sign-in]
  C --> D[Create person + Career Fog journey]
  D --> E[Session: Day N questions, one at a time]
  E -->|acute risk| P[Paused: resources screen]
  E -->|last answer of the day| F[Generate Bridge]
  F --> G[Bridge screen + countdown]
  G -->|server time past nextUnlockAt| H{Day 5 done?}
  H -->|no| I[Opener: yesterday's Bridge + overnight check-in]
  I --> E
  H -->|yes| J[Pattern map + synthesis]
  J --> K[Synthesis page with did-this-land controls]
```

## 2. The life of one answer (POST /api/answer)

```mermaid
flowchart TD
  A[Answer text + qid + ID token] --> B[Verify token, load journey]
  B --> C{Journey active and unlocked?}
  C -->|no| X[403 with lockedUntil]
  C -->|yes| D[Safety classify: fast model]
  D -->|uncertain| D2[Escalate to deep model]
  D2 --> E
  D --> E{Level}
  E -->|acute| F[Save answer excludedFromAI=true, log safetyEvent, journey.status=paused]
  F --> P[Return redirect: /paused]
  E -->|none or concern| G[IDK check: fast model]
  G -->|IDK, count 1| R1[Return smaller version of the question]
  G -->|IDK, count 2| R2[Return gentle naming of the avoidance]
  G -->|IDK, count 3| R3[Accept, idkFlagged=true]
  G -->|real answer| S[Save answer]
  R3 --> S
  S --> N{Last question today?}
  N -->|no| Q[Return next question]
  N -->|yes| B2[Call /api/bridge]
```

## 3. End of day (POST /api/bridge)

```mermaid
sequenceDiagram
  participant App
  participant API as Route handler
  participant DB as Firestore
  participant G as Gemini deep model
  App->>API: end of Day N
  API->>DB: load today's answers where excludedFromAI = false
  API->>G: Bridge prompt + answers
  G-->>API: Bridge text + format
  API->>API: check under 40 words, no advice. Retry once if it fails
  API->>DB: save bridge, set nextUnlockAt = now + GAP_MINUTES
  API-->>App: Bridge + nextUnlockAt
```

## 4. Day 5 (POST /api/synthesis)

1. Load all five days of answers (`excludedFromAI = false`) plus the five Bridges.
2. Deep model returns a structured pattern map (JSON): `patternKey`, `category`, `evidence` quotes, `confidence`, and a `crisisType`.
3. Validate with zod. Save to `patternFlags`.
4. Deep model writes the synthesis from the pattern map and the person's own words.
5. Save to `synthesis/main`. Show it with a "did this land?" control per insight. Feedback writes back to `insights[].landed`.

## 5. Auth and state

- The client holds only the Firebase ID token. No API keys, no model names.
- The server is the only writer for `nextUnlockAt`, `safety`, bridges, flags and synthesis.
- Client state is a view of Firestore. On reload, `/api/session/current` tells the app exactly where the person is: mid-session, locked until a time, paused, or complete.
- The Interactions API may hold turn state inside a single session for convenience. Nothing that must survive lives there.
