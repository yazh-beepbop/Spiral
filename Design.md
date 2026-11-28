# Design.md: Spiral features and specs

The organisers recommend one `Design.md` at the root that documents every feature. Agents: keep the **Status** section at the bottom current. Do not change question wording, Bridge rules or safety rules without asking.

## 1. Product in one paragraph

Spiral is a guided self-inquiry clarity guide for people after the first wave of a life turning point — **when you're ready to make sense of it**. It is a calm, logical, unbiased anchor, not a chatbot or companion. It asks structured questions, reflects back what you wrote, and never gives opinions, takes sides, or offers advice. Each journey has a fixed shape and a clear end: five daily sessions of 15 to 20 minutes, each closing with a single personal Bridge Question and a server-enforced 10-hour gap. Because the person is the core record, Spiral remembers you if you return years later.

### Role, tone, and when to use Spiral
- **Role:** Calm, logical, unbiased anchor — a clarity guide, not a chatbot or companion. Asks questions and reflects back what the user said; never gives opinions, takes sides, or offers advice.
- **Tone:** Plain-spoken, neutral, warm, not poetic. Short sentences. Zero flattery.
- **Fixed shape:** No open-ended chatting. Every session has a fixed sequence of questions and a clear end.
- **When to use Spiral:** Positioned for after the first wave of a life event — *"when you're ready to make sense of it."* If someone arrives in acute distress, the existing safety layer applies (gentle check-in / Gentle Mode for `concern`, full pause + helplines for `acute`).
- **Onboarding support line (`/start`):** *"Spiral helps you think clearly. If you're overwhelmed right now, here's support first."* (links directly to `/paused`).

## 2. Screens

| Screen | Purpose | Key elements |
|---|---|---|
| Landing | Explain Spiral in one screen | One line promise ("when you're ready to make sense of it"), "Start your Spiral", disclaimer |
| Start | Consent and entry | Onboarding support line linking `/paused`, 18+ attestation checkbox, short what-to-expect (fixed 5 days, 15 to 20 minutes, a gap between days), Career Fog: "I have options but nothing feels right." |
| Session | Answer questions | One question per screen, day label in mono ("DAY 2 · ENERGY ARCHAEOLOGY"), text area, progress dots, footer disclaimer |
| Bridge | End of day | The Bridge in large type, "Sit with this. Your next session opens in" + countdown |
| Locked | Returning too early | Today's Bridge and the countdown |
| Synthesis | Day 5 result | Synthesis reflection, user's top 3 priorities + next steps labelled **"In your words"**, each insight with "Did this land?" + "None of these fit me" |
| Paused | Acute safety event / support resources | Calm full screen, support resources, "Your journey is saved. You can come back when you're ready." |

**Disclaimer** (sign-up, every session footer, synthesis page): "Spiral is a guided reflection tool. It is not therapy, medical advice or a crisis service."

## 3. Journey structure

- 5 sessions, at least 10 hours apart (server-enforced), 15 to 20 minutes each.
- Days 2 to 5 open with the Opener question showing yesterday's Bridge.
- Questions come in layers:
  - **L1 Fixed:** every entry point
  - **L2 Entry point:** Career Fog only today
  - **L3 Adaptive:** written by the deep model from earlier answers, using the template given
  - **Opener:** Days 2 to 5
- QIDs are permanent. Answers are keyed by QID.

## 4. Question bank (Career Fog)

### Day 1: Surface Mapping
| QID | Layer | Format | Question |
|---|---|---|---|
| 1 | L2 | Choice | How do you feel about your work right now? (Energized / Fine / Drained / Numb) |
| 2 | L1 | Short | When was the last time you lost track of time? What were you doing? |
| 3 | L1 | Short | What do people come to you for? Do you enjoy being that person? |
| 4 | L1 | Long | Describe a real Tuesday. Not ideal. Real. |
| 5 | L1 | Short | What would you change if it were easy? |

### Opener (Days 2 to 5)
| QID | Layer | Format | Question |
|---|---|---|---|
| 6 | Opener | Long | Welcome back. Yesterday I left you with this: [Bridge]. Before we start, did anything surface overnight? Even something small. |

### Day 2: Energy Archaeology
| QID | Layer | Format | Question |
|---|---|---|---|
| 7 | L1 | Long | Think about the last three times you had genuine fun. What were you doing? |
| 8 | L2 | Choice | Two projects: A is structured, B is open-ended. Which one lights you up? |
| 9 | L2 | Short | What counts as fun at work? Be specific. |
| 10 | L1 | Short | What activities outside work make you feel most alive? |
| 11 | L3 | Short | [Adaptive] A follow-up generated from Day 1 answers |

### Day 3: Identity Excavation
| QID | Layer | Format | Question |
|---|---|---|---|
| 12 | L1 | Long | Which world (school, work, social) felt most like you? Which was the biggest performance? |
| 13 | L1 | Long | If you could be honest with everyone for one day, with zero consequences, what would you say, and to whom? |
| 14 | L1 | Short | When you get dressed, are you dressing as who you are, or who you're creating? |
| 15 | L1 | Short | Who would you still talk to if you lived in total isolation? Why them? |
| 16 | L3 | Long | [Adaptive] You said [activity] gives you energy and [role] feels like a performance. What if you stopped performing? |
| 17 | L1 | Short | If nobody could judge you, what would you stop doing tomorrow? |
| 18 | L1 | Short | When was the last time you felt like yourself? |

### Day 4: Values and Contradictions
| QID | Layer | Format | Question |
|---|---|---|---|
| 19 | L1 | Ranking | Rank these: autonomy, mastery, impact, recognition, belonging. |
| 20 | L1 | Short | Look at how you spent last week. Does it match your ranking? |
| 21 | L1 | Short | Imagine being privately, quietly proud five years from now. First image. Don't think. |
| 22 | L2 | Short | Does prestige feel good, or just useful? |
| 23 | L3 | Long | [Adaptive] Your pride image was [X], but your trajectory points toward [Y]. What drives the gap? |

### Day 5: Direction and Asymmetry
| QID | Layer | Format | Question |
|---|---|---|---|
| 24 | L2 | Short | What would you do for free that people would eventually pay for? |
| 25 | L1 | Short | What's the one move with low downside and huge upside that you've been avoiding? |
| 26 | L1 | Long | Describe your ideal Monday morning. First three hours. Specific. |
| 27 | L1 | Short | What would you bet on? Not the safe bet. The real one. |
| 28 | L1 | Short | What's the one thing you know you need to do but haven't done yet? |
| 29 | L1 | Priorities | In your own words, name your top 3 priorities right now, and one small next step for each. |

## 5. The "I don't know" rule (Standard Mode, Career Fog)

Escalation on the same question:
1. **First IDK:** offer a smaller version of the question. Use the question's own redirect if it has one (below).
2. **Second IDK:** name the avoidance, kindly.
3. **Third IDK:** offer a clean exit ("It's fine not to know. We can move on."), accept it, flag it, move on. Accepted answers are never pushed for more. In synthesis: "There was a question you could not answer. That silence might be the most important data point of your entire Spiral."

Question-specific redirects:
| QID | Redirect |
|---|---|
| 7 | Think about last weekend. Was there any moment, even five minutes, where you weren't thinking about work or obligations? What were you doing? |
| 17 | Okay, smaller: what's something you do alone that you'd never post about? Start there. |
| 18 | Let's flip it. When was the last time you definitely did NOT feel like yourself? What was happening? |
| 27 | That's the second time you've said that. What's the answer you're afraid is too small, too weird, or too unrealistic to say out loud? |
| 28 | You do know. You've known for a while. The thing that flashed in your mind before you typed 'no idea'. That one. Say it. |

Gentle Mode (Amber and Red spokes, not today) softens this. "I don't know" there can be honest disorientation.

## 6. Bridge Question

- One line, **under 40 words**, written by the deep model from today's answers only.
- **No advice.** No "you should", "try", "make sure". It is a question or an observation that ends in a question.
- Screenshot-safe: does not expose private details of the answers.
- Three formats:
  - **Pattern observation:** notices something in how they answered
  - **Belief challenge:** names a belief and asks where it started
  - **Reframe question:** turns the problem a quarter turn
- Rubric (eval harness): under 40 words, no advice, specific to this person, lingering, not cruel, culturally calibrated. After the next session: referenced unprompted?

**Golden set (spec benchmarks)**
| Day | Format | Bridge |
|---|---|---|
| 1 | Pattern observation | You described your entire life without using the word 'enjoy' once. Was that deliberate, or did you just notice? |
| 2 | Pattern observation | The things that make you feel most alive are the things you've stopped making time for. What replaced them, and why did you let it? |
| 3 | Pattern observation | You listed five worlds where you performed. Then whispered the one where you were real. Why does the real one get the smallest voice? |
| 4 | Reframe question | You want to disappear from the performances. But you still want to be seen. Just not like this. What would 'being seen right' actually look like? |
| 5 | Reframe question | What if the answer was never a career? What if it was a life, and the work just had to fit inside it? |
| any | Belief challenge | I notice you described rest as something you earn, not something you deserve. Where did that belief start? |

## 7. Day 5 synthesis

- 500 to 800 words, plain-spoken, neutral, warm, not poetic, zero flattery.
- 3 to 5 patterns, each backed by at least 2 quotes from the person's own answers across at least 2 different days, written **before** that pattern was first hinted at in a Bridge.
- Each insight states one explicit alternative reading ("Or it may simply be that...").
- The contradictions between what they value and how they live.
- **Own priorities and actions (`QID 29`):** Synthesis displays the user's self-written top 3 priorities and one small next step for each verbatim, labelled **"In your words"**. Spiral may reflect these back and ask *"Is this yours, or was it handed to you?"*, and must **never** suggest priorities, directions, or actions itself.
- Hedged framing only: "it sounds like", "you might notice", "one possibility". Never diagnostic, never taking sides or giving advice.
- **No pattern labels** in the text. Describe, do not name.
- If the crisis type is burnout, lead with rest, not career moves. If identity, talk about self, not jobs. If existential, ground gently and check safety.
- Each insight gets a "did this land?" control, and the pattern map section includes a **"None of these fit me"** option.

## 7b. No leading questions / undue influence

- **Open and neutral adaptive questions:** Adaptive questions (L3) must be open and neutral. No yes/no questions, no embedded assumptions, no pattern names, and no coercive tags ("isn't it true", "don't you think", "wouldn't you say").
- **Own words only:** Never introduce a feeling, belief, or motive the person has not already expressed in their own words.
- **Explore, never hypothesis-test:** Pattern detection informs *what* territory to explore, never the wording of a question. Questions invite open reflection; they never steer toward a pre-decided conclusion.
- **Pre-Bridge multi-day evidence:** Every Day 5 insight must cite at least 2 verbatim quotes from at least 2 distinct days written prior to any Bridge hinting at that pattern, paired with one alternative reading ("Or it may simply be that...").
- **Clean IDK exit:** On the third pass of "I don't know", Spiral says: "It's fine not to know. We can move on." Accepted answers are never pushed for more.
- **Eval enforcement:** Leading-question cases live in the golden set (`evals/bridge-golden-set.json`), and any generated question matching leading patterns fails validation.

## 8. Pattern taxonomy (internal only, never shown)

The deep model detects these on Day 5 and returns them as structured data with evidence. Cultural notes are drafts awaiting India calibration.

### Coping mechanisms
- **people_pleasing:** answers organized around other people's needs or approval. Trouble naming own preferences. Surfaces as: "Almost every answer had someone else's needs in it. Where are yours?" India: putting family first can be a chosen value. Ask: would you choose this freely, or is it fear of disapproval?
- **toxic_positivity:** pivoting to gratitude mid-answer ("but I'm grateful"). Surfaces as: "You're allowed to be grateful and still want something different." India: wanting more can feel ungrateful toward family sacrifice. Never mock the gratitude.
- **performative_self_awareness:** naming the problem fluently, often in therapy language, to avoid feeling it. Surfaces as: "What happens when you stop explaining it?"
- **humor_as_deflection:** jokes in 3+ answers, right when a question gets close. Surfaces as: "What would you say if it weren't funny?" India: humor can be social grace. Flag only when it replaces an answer.
- **avoidance_idk:** repeated "I don't know". Handled by the IDK flow. India: sometimes nobody ever asked what they wanted. Gentle redirects first.
- **minimizing:** "it's not that bad", "others have it worse". Surfaces as: "Not that bad compared to what?" India: validate the comparison, then make room for their experience.
- **over_intellectualizing:** analysis where a feeling was asked for. Surfaces as: "How did it feel, though?" India: may be missing emotional vocabulary before it is avoidance.

### Limiting beliefs
- **prestige_equals_worth:** choices justified by brand names, titles, rankings. Surfaces as: "Does this feel good, or does it just look good?" India: prestige can carry family honor. Let both count.
- **alone_equals_unwanted:** solitude framed as rejection. Surfaces as: "Is it being alone that scares you, or what it would say about you?" India: being alone carries real social cost. Name both.
- **productivity_equals_value:** self described only through output and roles. Surfaces as: "If you produced nothing for a month, who would you be?" India: usefulness can be how love was shown.
- **money_equals_safety:** every option filtered through financial security, even when secure. Surfaces as: "How much would be enough to feel safe?" India: money may carry family obligations. Ask if the number is theirs or inherited.
- **vulnerability_equals_weakness:** struggle framed as private failure. Surfaces as: "What would it cost you if someone saw this part?" India: privacy can protect family standing. Name the audience they protect.
- **help_equals_incompetence:** doing everything alone. Surfaces as: "When did you last let someone help without paying them back?"
- **rest_equals_failure:** rest described as earned, guilty or wasted. Surfaces as: "You described rest as something you earn, not something you deserve. Where did that start?" India: often inherited from parents who sacrificed. Honor the origin.

### Root causes
- **comparison_spirals:** constant measuring against peers, cousins, feeds. India: comparison is built into the system (ranks, relatives). Name where the yardstick came from.
- **relationship_patterns_in_career:** same dynamics with partners, parents, managers. India: family hierarchy can map onto workplace hierarchy.
- **institutional_dependency:** needs an external validator (school, employer, title). India: exam and placement ladders reward this early. Treat it as training to unlearn.
- **class_transition_stress:** first-gen markers, money conditioning, between worlds.
- **childhood_conditioning:** answers trace back to early rules about worth or love. India: never cast parents as villains.
- **depletion_read_as_confusion:** chronic stress read as "I don't know what I want". Surfaces as: "Are you confused, or just running on empty?"

### Signal flags (by day)
- Day 1, every answer about work: **identity_merged_with_output**
- Day 2, IDK to the fun question: **joy_disconnection**
- Day 2, fun is physical, work is screens: **embodiment_deprivation**
- Day 3, no world felt like them: **identity_not_career_crisis**
- Day 3, names the real world then dismisses it: **self_minimization**
- Day 4, ranking contradicts last week: **values_behavior_gap**
- Day 4, prestige "useful, not nourishing": **prestige_awareness** (positive, build on their words)
- Day 5, final answer about rest or healing: **burnout_not_confusion**
- Day 5, answers "the one thing" immediately: **already_knows**

### Crisis type (one per journey, shapes synthesis framing)
- **burnout:** depleted, not confused
- **identity:** "who am I underneath the performance?"
- **existential:** questioning whether any option matters. Ground, do not excavate. Extra safety care
- **transition:** everything is changing, no ground

### Meta
- **performing_for_spiral:** polished answers written for an audience. Surfaces as: "Some of your answers read like they were written for an audience. Even here."

## 9. Safety

- Three levels on every answer: none, concern, acute.
- Uncertain: escalate to the deep model, then cautious path.
- Acute: pause, full-screen resources, answer excluded from all AI steps, journey resumable.
- Resources (India first, verify on the day): Tele-MANAS national mental health helpline 14416, emergency 112. Show "If you are outside India, contact your local emergency number."
- Career Fog is Green tier. Amber and Red spokes need extra safety work and are not built today.

## 10. Future entry points (not today)

V1 trunks: Career Fog (built today), Identity Crisis, Life Transition.
Expansion spokes: The Pivot, The Ending, The Diagnosis, The Void, The Threshold, The Arrival, The Becoming, The Empty Room, The Unmasking, The Quiet Doubt, The Wanting. Each has a safety tier and an IDK mode, and launches one at a time.

## 11. Status (agents keep this current)

| Feature | Status | Files | Notes |
|---|---|---|---|
| Scaffold | Built locally (awaiting Git push) | `package.json`, `tsconfig.json`, `next.config.ts`, `src/lib/config.ts`, `src/lib/log.ts`, `public/manifest.json`, `public/sw.js`, `src/app/layout.tsx`, `src/app/page.tsx` | Standalone Next.js App Router + PWA manifest/SW + Landing screen |
| Gemini client | Complete | `src/lib/gemini/client.ts`, `src/app/api/gemini/test/route.ts` | `@google/genai` Interactions API, 503 backoff retry, fallback model, Zod retry |
| Auth + person + journey | Complete | `firestore.rules`, `src/lib/db/schema.ts`, `src/lib/db/repository.ts`, `src/lib/firebase/admin.ts`, `src/lib/firebase/client.ts`, `src/app/api/auth/session/route.ts`, `src/app/api/journey/start/route.ts`, `src/app/start/page.tsx` | 18+ gate, person-rooted Firestore + Cloud Run HMAC anonymous session |
| Question bank | Complete | `src/lib/journey/questions.ts` | Career Fog QIDs 1–28, Opener, L3 markers, IDK redirects |
| Session screen | Complete | `src/app/session/page.tsx`, `src/app/api/session/current/route.ts`, `src/app/api/answer/route.ts` | One question per screen, choice/ranking/text inputs, progress dots |
| Safety layer | Complete | `src/lib/safety/classify.ts`, `src/lib/safety/prompt.ts`, `src/lib/safety/resources.ts`, `src/app/paused/page.tsx`, `src/app/api/journey/resume/route.ts` | Fast -> deep escalation, acute pause + `excludedFromAI=true`, India helplines |
| IDK rule | Complete | `src/lib/journey/idk.ts` | Standard Mode 1->smaller, 2->name avoidance, 3->accept & flag |
| Bridge | Complete | `src/lib/bridge/prompt.ts`, `src/lib/bridge/generate.ts`, `src/app/api/bridge/route.ts`, `src/app/bridge/page.tsx`, `evals/bridge-golden-set.json`, `evals/run-evals.ts` | `<40` words, single line, no advice, 1 retry, golden evals |
| Gap | Complete | `src/lib/journey/gap.ts`, `src/app/bridge/page.tsx` | Server-enforced `nextUnlockAt` + monotonic countdown (`GAP_MINUTES=2` in demo) |
| Days 2 to 5 | Complete | `src/lib/journey/adaptive-prompt.ts`, `src/lib/journey/adaptive.ts` | Yesterday's Bridge Opener (Q6) + cached deep-model L3 follow-ups (Q11, Q16, Q23) |
| Synthesis | Complete | `src/lib/patterns/taxonomy.ts`, `src/lib/patterns/prompt.ts`, `src/lib/patterns/detect.ts`, `src/lib/synthesis/prompt.ts`, `src/lib/synthesis/generate.ts`, `src/app/api/synthesis/route.ts`, `src/app/synthesis/page.tsx` | Zod pattern map + 500–800w hedged reflection + label stripper + "Did this land?" |
| Deploy + demo seed | Ready to deploy (`gcloud run deploy`) | `Dockerfile`, `.dockerignore`, `CLOUD-RUN-DEPLOY.md`, `src/lib/demo/seed.ts`, `src/app/api/demo/seed/route.ts` | Standalone Cloud Run container + Days 1–4 seeded demo journey |
| Voice input (STT only) | Complete (`voice-and-language`) | `src/components/VoiceMicButton.tsx`, `src/lib/gemini/transcribe.ts`, `src/app/api/voice/transcribe/route.ts` | Tap-to-record / tap-to-stop next to every answer box; Gemini STT for English, Hinglish, Tamil, Hindi & Indian accents; editable transcript; immediate audio deletion (`store: false`, zeroed buffer); screened by existing safety classifier |
| Language option (`en`, `hinglish`, `hi`, `ta`) | Complete (`voice-and-language`) | `src/lib/i18n/*`, `src/components/LanguageProvider.tsx`, `src/components/LanguagePicker.tsx`, `src/app/api/settings/route.ts` | Onboarding & header Settings picker; zero hardcoded UI strings; Gemini asks questions & writes Bridges in selected language; multilingual safety & helpline screens + red-team evals; stores original answer text + language code |
