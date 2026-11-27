# ROADMAP.md: one task per prompt

Rules: take the first unchecked task. Do only that task. It is done when its "Done when" passes and `CHECKLIST.md` passes. Then commit, log the hash in `DIFFS.md`, tick the box, move on.

The Must list is ordered so a working demo exists as early as possible. Do not start Stretch until every Must is ticked.

## Must (demo path)

- [x] **T0. Scaffold.** Next.js + TypeScript app, `src/lib/config.ts`, `src/lib/log.ts`, `.gitignore` (with `.env*`), `.env.local` from `ENV.template.md`, PWA manifest. Push to a private GitHub repo.
  Done when: app runs locally, first commit pushed, `git grep AIza` finds nothing.

- [x] **T1. Gemini client.** `src/lib/gemini/client.ts` using the Gemini skill's current guidance for the Interactions API. Logs model, prompt, config and output. Retries on 503 with backoff, then falls back to the fallback model in config.
  Done when: a test route returns a reply from the fast model and from the deep model, and both calls appear in the log.

- [x] **T2. Auth, person, journey.** Anonymous sign-in, 18+ attestation screen, `POST /api/journey/start` creates the person and a Career Fog journey. `firestore.rules` locks each user to their own `persons/{uid}`.
  Done when: a new visitor can attest, sign in and see a journey document in Firestore. A second user cannot read the first user's data.

- [x] **T3. Question bank as data.** `src/lib/journey/questions.ts` from the question bank in `Design.md`, Career Fog only, permanent QIDs, adaptive questions marked.
  Done when: a unit check lists 5 days with the right questions in order.

- [x] **T4. Session screen.** `/session` shows one question at a time. `POST /api/answer` saves answers under the person, journey and day.
  Done when: you can answer all Day 1 questions and see them in Firestore.

- [x] **T5. Safety layer.** `src/lib/safety/classify.ts` (fast model, three levels, escalate when uncertain). Acute pauses the journey and shows `/paused` with resources. Excluded answers never reach AI steps.
  Done when: the safety cases in `CHECKLIST.md` behave as listed.

- [x] **T6. "I don't know" rule.** Detection + Standard Mode escalation, using each question's IDK redirect when it has one.
  Done when: three IDKs in a row give smaller version, then named avoidance, then accept and flag.

- [x] **T7. Bridge.** `POST /api/bridge` with the deep model. Format, word count and no-advice check, one retry. `/bridge` screen.
  Done when: Day 1 ends with a Bridge under 40 words, and the golden set eval scores it.

- [x] **T8. Gap.** Server sets `nextUnlockAt`. `/api/session/current` returns "locked until" before it. Countdown on `/bridge`. Demo mode uses `GAP_MINUTES=2`.
  Done when: changing the device clock does not unlock the session, and the session unlocks after the gap.

- [x] **T9. Days 2 to 5.** Opener question with yesterday's Bridge and overnight check-in. Adaptive questions (L3) written by the deep model from earlier answers.
  Done when: a full 5-day run works in demo mode.

- [x] **T10. Day 5 synthesis.** Structured pattern map (zod-validated), then synthesis per `Design.md`. "Did this land?" per insight.
  Done when: synthesis is 500 to 800 words, quotes the person's own words, shows no pattern labels, and feedback saves.

- [ ] **T11. Deploy + demo seed.** Google Cloud Run deploy (replacing Firebase App Hosting per sprint decision). A seeded demo journey with Days 1 to 4 complete.
  Done when: the live URL runs Day 5 for the demo journey end to end. *(Demo seeder + Cloud Run `Dockerfile` built & verified locally; ready for `gcloud run deploy`.)*

## Stretch (only after every Must)

- [ ] **X1.** Push the Bridge and the unlock notice with Cloud Tasks + FCM
- [ ] **X2.** Email link sign-in replacing anonymous auth
- [ ] **X3.** Screenshot-ready Bridge card
- [ ] **X4.** Voice answers with the Gemini Live API
- [ ] **X5.** Per-insight feedback summary for the operator

## After the sprint (from the Spiral build order, not today)

Content validation pilot with real people, full safety eval set, free launch of 100 users, then monetization, breadth, heavier spokes.
