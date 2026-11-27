# DECISIONS.md: why things are the way they are

Log the WHY, not just the what. Agents: append a row whenever you pick a library, pattern or approach.

Status key: **Decided** (Yazh agreed), **Proposed** (suggested for the sprint, confirm or change), **Open** (not settled), **Experiment** (to be tested).

## Sprint decisions (Gemini 4 Sprint)

| # | Decision | Choice | Why | Status |
|---|---|---|---|---|
| S1 | Sprint stack | Firebase (Auth, Firestore, App Hosting) + Gemini API, replacing the spec's Supabase, Vercel and Resend for today | Google sprint. Matches the tech stack answer submitted with the application | Decided |
| S2 | Model routing | Gemini 4 Hydrogen for live flow, safety and IDK checks. Gemini 4 Argon for Bridge, adaptive questions, pattern map, synthesis | Speed and cost per turn for the flow, depth where it matters | Decided |
| S3 | Source of truth | Firestore only. Interactions API state is convenience inside one session | Person-rooted memory is the moat, and the hackathon project is deleted tomorrow | Decided |
| S4 | Gap enforcement | Server checks `nextUnlockAt` on every request. `GAP_MINUTES` in config: 600 in production, 2 in demo mode. Push notifications (Cloud Tasks + FCM) are stretch | Enforces the gap with no extra infrastructure, and judges can see the full loop in one demo | Decided |
| S5 | Auth | Anonymous Firebase Auth + 18+ attestation. Email link sign-in after the sprint | Saves an hour today. The person record does not change when we add email later | Decided |
| S6 | Entry point | Career Fog only | Build Roadmap Phase 4 scope. Lowest safety weight | Decided |
| S7 | Gemini calls | Server-side route handlers only | Hackathon rule on leaked keys, and basic security | Decided |
| S8 | Demo data | A seeded demo journey with Days 1 to 4 filled, so Day 5 synthesis can be shown live | Nobody can wait 40 hours in a demo | Decided |
| S9 | Repo visibility | Private repo in Yazh's personal GitHub | Protects the question bank and golden set, and the temp account vanishes tomorrow | Decided |

## Product decisions (from the Spiral spec, v1.3)

| Area | Decision | Choice | Why | Status |
|---|---|---|---|---|
| Strategy | Primary audience | People in their 20s and early 30s in existential fog and career confusion | Broadest market, lowest safety burden | Decided |
| Strategy | Positioning | Designed to end. Five days, then it ends, and it remembers you when you come back | Nobody owns the finite, structured journey. People trust things that end | Decided |
| Strategy | Build sequencing | By dependency, not calendar. Content validation before code | Never build downstream of an unvalidated assumption | Decided |
| Strategy | The Void | Existential crisis is its own Red-tier spoke | Needs grounding, not excavation, and the strictest safety | Decided |
| Architecture | Lifetime product | Person as root, journeys as chapters | Cannot be retrofitted cheaply | Decided |
| Architecture | Format | PWA, with email as the reliable return channel | Any device, no app store | Decided |
| Experience | Journey structure | 5 sessions over at least 5 days, 10-hour server-side gap, 15 to 20 minutes each | The gap is where the work happens | Decided |
| Experience | Bridge question | One AI line per day, under 40 words, no advice, screenshot-safe | Signature mechanic and organic growth channel | Decided |
| Experience | "I don't know" rule | Not accepted in Standard Mode (Green tier). Gentle Mode on Amber and Red. Set per entry point | Avoidance deserves persistence, disorientation deserves patience | Decided |
| Experience | Tone mirroring | Polish tier, after core loop, safety and synthesis are proven | Most fun, least essential | Decided |
| Experience | Retention | The Spiral Anniversary: one email a year, one old answer, one question. Opt-in | Keeps the relationship warm at near-zero cost | Decided |
| Intelligence | AI model strategy | Tiered: small model for flow, IDK and classification. Strong model for Bridges, adaptive questions, synthesis | Roughly $0.20 to $0.40 per journey. Quality guarded by the eval harness | Decided |
| Intelligence | Pattern detection | Invisible, never clinical, dual-coded for culture, per-insight misfire feedback | Insight without diagnosis | Decided |
| Safety | Age gate | 18+ only | Safety and data protection | Decided |
| Business | Launch | First 100 users free. No payments code until Phase 6 | Validation before monetization | Decided |
| Business | Price | Rs.499 India, $19 international, $29 test later. One-time per journey | $6 undersold willingness to pay | Decided |
| Business | Paywall position | Default after Day 5, A/B against after Day 1 | Day 5 is the leakiest point in the funnel | Experiment |
| Business | Business model | Per-journey purchases, repeat journeys, future Archive tier. No courses | Fits a solo operator | Decided |
| Brand | Creator visibility | Brand-first. Creator on the About page only | Spiral stands alone | Decided |
| Brand | Spoke naming register | Lean: descriptive on the entry screen, evocative in brand voice | Decide before Phase 7 | Open |
| Brand | "Spiraling" for grief spokes | Test the language before Red-tier launches | It colloquially means losing control | Open |
| Ownership | IP and accounts | Personal accounts only until the company exists, then formal assignment to it | Clean ownership from day one | Decided |

## Log new decisions here

| Date | Decision | Choice | Why | Made by |
|---|---|---|---|---|
| 2026-11-27 | T0 styling approach | CSS Modules + CSS custom properties (`globals.css` + `*.module.css`) instead of `tailwindcss` | Zero extra PostCSS packages outside `DEPENDENCIES.md`, clean separation per screen, exact match to Spiral deck tokens | Antigravity (Gemini 4 Carbon) |
| 2026-11-27 | Config boundary | `getServerConfig()` throws when `typeof window !== "undefined"`; `getPublicFirebaseConfig()` exposes only `NEXT_PUBLIC_FIREBASE_*` | Prevents accidental import of `GEMINI_API_KEY` or model IDs into client components (`CONSTRAINTS.md`) | Antigravity (Gemini 4 Carbon) |
| 2026-11-27 | Font loading | Runtime `<link>` stylesheet for Sora and JetBrains Mono with system fallbacks | Avoids build-time Google Fonts network fetches so `next build` works offline and in restricted environments | Antigravity (Gemini 4 Carbon) |
| 2026-11-27 | Hosting target (replaces App Hosting in S1) | Google Cloud Run (`output: "standalone"` Next.js container) instead of Firebase App Hosting | User requested Cloud Run deployment; runs Next.js server routes natively in GCP with Application Default Credentials for Firestore | User + Antigravity (Gemini 4 Carbon) |
| 2026-11-27 | No leading questions / undue influence safeguards | `leading-guard.ts` rejects closed/leading questions & projected motives; pattern map + synthesis enforce >= 2 pre-Bridge quotes across >= 2 distinct days + `"Or it may simply be that..."` alternative reading + `"None of these fit me"` UI toggle + 3rd-pass IDK exit | Prevents hypothesis-testing feedback loops where Bridges plant patterns that synthesis later claims to "discover" | User + Antigravity (Gemini 4 Carbon) |
| 2026-11-27 | Clarity guide role & Day 5 user-written priorities (`QID 29`) | Plain-spoken unbiased anchor tone, `/start` support link to `/paused`, and new permanent `QID 29` capturing top 3 priorities + next steps shown verbatim under `"In your words"` (`"Is this yours, or was it handed to you?"`) with zero AI-suggested actions | Ensures agency stays 100% with the user rather than acting as an advice-giving chatbot | User + Antigravity (Gemini 4 Carbon) |
