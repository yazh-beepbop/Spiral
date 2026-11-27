# CONSTRAINTS.md: hard rules the AI must never break

If a task seems to need breaking one of these, stop and ask. These override any prompt.

## 1. Secrets and the hackathon account

- Never hardcode `GEMINI_API_KEY` or any key. Read it from env on the server only.
- Never commit `.env`, `.env.local` or service account JSON. They must be in `.gitignore` before the first commit.
- Never call Gemini from client-side code. No API key in anything shipped to the browser.
- Never create loops, load tests or scripts that fire many Gemini requests. The organisers can disqualify for abnormal usage. Eval runs are capped at the golden set size.
- Do not generate images or video (Veo, Nano-Banana). Spiral does not need them and they are expensive.
- The temporary Google account and its project are **deleted the day after the sprint**. Nothing important may live only there. Code lives in a **private** GitHub repo in Yazh's personal account.
- Keep the repo **private**. These files contain the question bank, Bridge golden set and pattern taxonomy, which are Spiral's IP.

## 2. Product rules the code must never violate

- **Safety first.** Every answer is screened by the safety classifier before anything else happens to it. No answer reaches Bridge generation, pattern detection or synthesis unscreened.
- **Acute risk means pause.** If the classifier returns `acute`: stop the session, show the full-screen resources page, exclude that content from Bridges and synthesis, keep the journey resumable. Never generate a Bridge from an acute answer.
- When the classifier is uncertain, escalate to the deep model. When still uncertain, take the cautious path.
- **The gap is server-side.** The next session unlocks only when server time passes `nextUnlockAt`. Never trust the client clock. Gap length comes only from `GAP_MINUTES` in config (600 in production).
- **Bridge rules.** One line, under 40 words, no advice, no instructions, no "you should". Safe to screenshot without exposing answers.
- **No clinical language shown to users.** Pattern names (People-pleasing, Burnout and so on) are internal. Synthesis uses plain, hedged language ("it sounds like", "you might notice").
- **The "I don't know" rule.** Career Fog runs Standard Mode: redirect, then name the avoidance, then on the third pass offer a clean exit ("It's fine not to know. We can move on."), accept and flag. Accepted answers are never pushed for more. Mode is set per entry point, never per user.
- **No leading questions / undue influence.**
  - Adaptive questions must be open and neutral. No yes/no questions, no embedded assumptions, no pattern names, no "isn't it true", "don't you think" or "wouldn't you say".
  - Never introduce a feeling, belief or motive the person has not expressed in their own words.
  - Pattern detection informs WHAT to explore, never the wording. Questions explore; they do not test a hypothesis.
  - Every synthesis insight must quote at least 2 of the person's own answers, from at least 2 different days, written BEFORE that pattern was first hinted at in a Bridge.
  - Each insight states one alternative reading ("Or it may simply be that...").
  - The pattern map / synthesis view must include a "None of these fit me" option.
  - Leading-question cases live in the golden set, and any generated question matching them must fail validation.
- **Clarity guide role (never chatbot or advisor).**
  - Spiral is a calm, logical, unbiased anchor — a clarity guide, not a chatbot or companion.
  - It asks questions and reflects back what the user said. It never gives opinions, takes sides, or offers advice.
  - Tone: plain-spoken, neutral, warm, not poetic. Short sentences. No flattery.
  - No open-ended chatting. Each session has a fixed shape and a clear end.
- **Day 5: own priorities and actions only.**
  - Day 5 asks the user (`QID 29`) to name, in their own words, their top 3 priorities and one small next step for each.
  - Spiral may reflect these back and ask `"Is this yours, or was it handed to you?"`, and must **never** suggest priorities or actions itself.
  - The synthesis displays these user-written priorities and steps verbatim, labelled **"In your words"**.
- **When to use Spiral & onboarding safety link.**
  - Position Spiral for after the first wave of a life event: `"when you're ready to make sense of it."`
  - Onboarding (`/start`) must include: `"Spiral helps you think clearly. If you're overwhelmed right now, here's support first."` linking directly to `/paused` (the support resources screen).
  - If someone arrives in distress, the existing safety layer applies unchanged (gentle check-in / Gentle Mode for `concern`, immediate pause and helplines for `acute`).
- **18+ only.** No journey starts without the age attestation.
- **Person is the root.** Every journey, session, answer, Bridge and flag hangs under a person. Deleting a person deletes everything under them.
- **QIDs are permanent.** Never renumber or reuse a question ID. New questions get new IDs.
- Never store answer text in analytics or logs outside Firestore. Logs may record IDs and lengths, not personal answers. (genai call logs in dev are the exception and must never go to a public place.)

## 3. Out of scope today (do not build)

- Payments, paywall, Razorpay, Stripe
- Visual Map, Ranked Insights
- Identity Crisis and Life Transition entry points, all Amber and Red spokes
- Tone mirroring
- The Anniversary email
- Voice (Live API) unless every Must task in ROADMAP is done

## 4. Files the AI must not change without asking

- `AGENTS.md`, `CONSTRAINTS.md`, `MENTAL-MODEL.md`
- Question wording in `Design.md` and `src/lib/journey/questions.ts`
- `evals/bridge-golden-set.json` (add rows only, never edit benchmarks)
- `firestore.rules`
- `src/lib/safety/resources.ts` (helpline content)
- `.env*`, `.gitignore`

## 5. Dependencies

Install only what `DEPENDENCIES.md` approves. Never install a package you have not confirmed exists on npm under that exact name and publisher.
