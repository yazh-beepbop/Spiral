# BUGS.md: hallucinations, regressions and fixes

Log every bug, hallucinated API and regression. The point is to stop the AI repeating the same mistake. Agents: read the "Known traps" section before writing Gemini or Firebase code.

## Known traps (check these first)

| Trap | What happens | Do this instead |
|---|---|---|
| Outdated Gemini SDK code | Agent writes code for the deprecated `@google/generative-ai` package or old method names | Use `@google/genai` and follow the Gemini skill. Use REST via `fetch` if the SDK lacks an Interactions API method |
| Invented model IDs | Agent guesses a model string that does not exist | IDs come only from `src/lib/config.ts`, confirmed with the Gemini skill |
| 503 "model overloaded" | New models get overwhelmed on launch weeks | Retry with backoff, then fall back to the fallback model in config |
| 429 errors after it worked | The project spend cap was hit | Raise the cap a little at aistudio.google.com/spend. Not too high |
| Client-side Gemini call | Key ends up in the browser bundle | All calls through server route handlers |
| Client-trusted time | Gap unlock checked in the browser | Server compares `nextUnlockAt` with server time |
| Firestore rules left open | Test-mode rules allow anyone to read everything | Lock to `persons/{uid}` before any real data |
| Unvalidated JSON from the model | Pattern map has missing or extra fields and crashes the page | Parse with zod, retry once on failure |
| Bridge too long or gives advice | Model ignores the rule | Check word count and advice phrases in code, regenerate once |
| Pattern labels leak into synthesis | User reads "you show people-pleasing" | Synthesis prompt forbids labels, and a post-check strips them |

## Bug ledger

| # | Date | Area | What happened | Cause | Fix | Commit | Status |
|---|---|---|---|---|---|---|---|
| 1 | 2026-11-27 | hallucinated API | Live `ai.interactions.create` returned HTTP 400 `"The legacy Interactions API schema is no longer supported. Please upgrade your @google/genai JS/TS SDK to version >= 2.0.0"` | `package.json` pinned `@google/genai` to `^1.0.0` (`1.52.0`) instead of `>= 2.0.0` | Upgraded `@google/genai` to `^3.6.1` and aligned `src/lib/gemini/client.ts` with v3 `steps` / `output_text` / `TextResponseFormat` | 1219ea8 | Resolved |
| 2 | 2026-11-27 | model output | Live Gemini 4 calls with `max_output_tokens: 64` returned empty `output_text` | Thinking tokens count against `max_output_tokens`, exhausting tiny caps before `model_output` is emitted | Removed tight `maxOutputTokens` caps on thinking calls and enforced word/schema limits via prompts + post-validators | 1219ea8 | Resolved |
| 3 | 2026-11-28 | UI | `/synthesis` stayed stuck on `"Writing your closing reflection"` for 3+ minutes during demo | `gemini-4-argon` with `thinkingLevel: "high"` took ~57s (pattern map) + ~158–172s (synthesis) with no timeout, while React `StrictMode` fired duplicate `POST /api/synthesis` requests | Lowered synthesis/pattern `thinkingLevel` to `"medium"`, added 45s timeout + 1 retry + `gemini-4-hydrogen` fallback, deduplicated in-flight requests, cached succeeded demo synthesis in Firestore, and added a calm `"Try again"` button | `f40a55a` | Resolved |
| 4 | 2026-11-28 | edge case | Zod `.default([])` on `SafetyClassificationSchema.signals` caused `z.ZodType<T>` generic input/output mismatch under `tsc --strict` | `z.ZodDefault` has optional input (`string[] \| undefined`) and required output (`string[]`), breaking invariant `ZodType<T>` inference | Made `signals` `.optional()` on the raw Zod schema and normalized `signals ?? []` in `classifyAnswerSafety` | `4264052` | Resolved |
| 5 | 2026-11-28 | edge case | Plain IDK rule missed leading adverbs (`"Honestly I do not know."`) and dispatched to the fast model | Regex placed `(?:honestly\|really)` only after `I`, missing sentence-initial `"Honestly ..."` | Updated `PLAIN_IDK_PATTERNS` to match optional leading or medial qualifiers with 0 model calls | `3712ef0` | Resolved |
| 6 | 2026-11-28 | edge case | Quoting a user's own word `"burnout"` inside synthesis `"..."` quotes risked false-failing the clinical-label check | Naive full-string label scan flagged user-authored words inside verbatim quotes | Added `maskVerbatimUserQuotes` + `stripLabelsOutsideUserQuotes` in `src/lib/synthesis/generate.ts` so user quotes stay intact while model-authored labels fail validation | `5a71189` | Resolved |

Area options: hallucinated API, model output, safety, gap, auth/rules, UI, deploy, regression, edge case.
