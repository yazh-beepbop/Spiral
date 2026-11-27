# MENTAL-MODEL.md: how Spiral works, in plain English

Read this when the code stops making sense. If the code and this file disagree, this file is the intent.

## The idea in one breath

Spiral asks good questions, one at a time, over five days. At the end of each day it leaves you with one question to sit with overnight (the Bridge). It makes you wait at least 10 hours before the next session, because the gap is where the thinking happens. Quietly, it notices patterns in how you answer. On Day 5 it reflects those patterns back to you in your own words. Then it ends. If you come back years later, it remembers you.

## The four mechanics

1. **Bridge Question.** One line, under 40 words, written from today's answers. No advice. It is meant to linger.
2. **Forced Gap.** The next session is locked for 10 hours, enforced by the server.
3. **Pattern Detection.** An invisible layer flags coping mechanisms, limiting beliefs, root causes and crisis type. The user never sees the labels, only the reflection.
4. **Longitudinal memory.** A person can have many journeys over a lifetime. Everything hangs off the person.

## The life of one answer

1. The person types an answer.
2. The safety check reads it first. Three outcomes: none, concern, acute.
   - Acute: the session pauses and the person sees support resources. That answer is never used for Bridges or synthesis.
   - Concern: the session continues gently, and the event is logged.
3. If the answer is "I don't know" or a close variant, Spiral redirects: first a smaller version of the question, then it names the avoidance kindly, and on the third try it accepts and flags it. A question someone could not answer is data.
4. The answer is saved under the person, the journey and the day, keyed by the question's permanent ID.
5. The next question appears.

## The life of one day

1. Days 2 to 5 open by showing yesterday's Bridge and asking: did anything surface overnight?
2. The day's questions come one at a time.
3. When the last answer is in, the deep model writes the Bridge from today's answers.
4. The Bridge is shown as the very last thing. The server sets `nextUnlockAt` to now plus 10 hours.
5. Until then, the app shows the Bridge and a quiet countdown.

## Day 5

After the last answer, the deep model reads the whole journey and returns a structured pattern map, with the person's own words as evidence for each pattern. Then it writes the synthesis: 500 to 800 words, 3 to 5 patterns, the contradictions, and 2 to 3 possible directions. Hedged, never diagnostic. Each insight has a "did this land?" control, because a confident wrong insight hurts more than a generic one.

## Two models, two jobs

- **Fast model (Gemini 4 Hydrogen):** the live flow. Safety classification, "I don't know" detection, quick follow-ups. Speed and cost per turn matter here.
- **Deep model (Gemini 4 Argon):** the moments that need depth. The Bridge, adaptive questions, the pattern map, the synthesis.

## Why things are where they are

- **Firestore is the memory.** The Gemini side holds nothing we need tomorrow. The hackathon project is deleted the next day anyway.
- **The server owns time.** If the browser could unlock sessions, the gap would mean nothing.
- **Safety runs before everything.** The first hundred users will include someone in worse shape than the target persona.
- **The person is the root.** A 2030 journey must be able to read a 2026 answer without a migration.

## What the user sees vs what is invisible

| Sees | Never sees |
|---|---|
| One question at a time | Pattern names and categories |
| The Bridge | Safety scores |
| A countdown to the next session | Model names, prompts |
| The Day 5 synthesis in plain language | The crisis-type label |
