# TypeSafe "Jev" (System One) API: integration facts for a Node / Next.js 16 server

**Question:** What is the exact contract, SDK, fitness-for-purpose and gotchas for calling Jev from this app's server code?
**Researched:** 2026-09-27 against live docs (docs.typesafe.ai, fetched as `.md`). Tags: **VERIFIED** = seen in the cited page; **INFERRED** = my reasoning; **UNCERTAIN** = thin or secondary source.
Our key lives in `JEV_KEY`, **not** the SDK default `TYPESAFE_API_KEY`, so pass it explicitly (see §2).

## 1. HTTP contract

Sources: https://docs.typesafe.ai/api.md, https://docs.typesafe.ai/models.md, https://docs.typesafe.ai/introduction/quickstart.md

| Item | Value | Tag |
|---|---|---|
| Endpoint | `POST https://api.typesafe.ai/v1/systemone` (the only inference endpoint) | VERIFIED |
| Auth | `Authorization: Bearer <API_KEY>` + `Content-Type: application/json` | VERIFIED |
| Model list | "`GET /v1/models` returns the names your account can send in the `model` field, with a description and release date for each." (models.md) | VERIFIED |
| Models | `jev-1.13.0`; aliases `jev-latest` (stable, SDK default) and `jev-preview` (currently the same as latest) | VERIFIED |
| Context | "64k tokens per request; 32k tokens for `state` plus the longest question" | VERIFIED |
| Input | "Text only. String, JSON object, or array of text values. No image, audio, or video input." English is primary. Other languages "are accepted but currently have lower accuracy" (concepts/state.md) | VERIFIED |
| Rate limits | "250,000 tokens per second / 1,200 requests per minute". The docs also say rate limits "are adjusting dynamically" | VERIFIED |
| Pricing | "$42 / $0.042" per Btok / per Mtok of **input**; "Output tokens are free." | VERIFIED |
| Max questions/request | **Not published.** Only the context budget above constrains it | VERIFIED (absence) |
| Choice options | "You can have a maximum of 255 options per Choice." | VERIFIED |
| Score levels | "A Score should have at least two levels; the API accepts up to 10." | VERIFIED |

**Request** (verbatim example from api.md):
```json
{ "state": "Help! My payouts have been failing for 3 days.",
  "model": "jev-latest",
  "questions": { "is_urgent": { "type": "noul", "instructions": "Does this convey urgency?" } } }
```
- `state` (required): string | object | array. It is the content being judged.
- `model` (required on raw HTTP; the SDK fills it in).
- `questions` (required): a map keyed by **your** ids. Each entry has `type` (`"noul"|"choice"|"score"`) and `instructions` (string | object | array), plus `criteria`:
  - noul: optional `{ "true": ..., "false": ... }`
  - choice: required map `optionName -> description` (description may be `null`)
  - score: required **ordered array** of level descriptions. Level number = array index, starting at 0.

**Response** (verbatim example from api.md):
```json
{ "model": "jev-1.13.0",
  "answers": { "is_urgent": { "type": "noul", "noul": 0.95 } },
  "usage": { "input_tokens": 296, "output_tokens": 20 } }
```
- noul answer: `{type, noul}`, where noul is P(yes) in 0–1. **There is no `confidence` field.**
- choice answer: `{type, choice, probabilities: {option: p}, confidence}`. "The sum of all values is 1" (primitives/choice.md).
- score answer: `{type, score, legend: {"0": desc,...}, probabilities: {"0": p,...}, confidence}`. `score` is the **expected value** Σ level×p, so it can be fractional (e.g. 1.43) (primitives/score.md).
- `model` returns the resolved version, so log it.

**Errors** (api.md): `401` bad or missing key, `422` validation failure, `429` "Retry the request with exponential backoff", `529` overloaded. **The docs publish no error-body JSON shape.** The JS SDK exposes `status`, parsed `body`, `headers` and `requestId` (from the `x-typesafe-request-id` header) on `APIError` (https://docs.typesafe.ai/sdk/javascript/api/classes/APIError.md). VERIFIED.

## 2. JavaScript / TypeScript SDK

Sources: https://docs.typesafe.ai/sdk/javascript.md, https://github.com/typesafe-ai/typesafe-sdk-js, https://www.npmjs.com/package/@typesafe-ai/sdk, and the API pages under https://docs.typesafe.ai/sdk/javascript/api/

- Package `@typesafe-ai/sdk`, installed with `npm install @typesafe-ai/sdk`. Needs "Node.js 20 or newer". Ships ESM, CJS and .d.ts. Latest is **0.6.0** (npm, 2026-09). VERIFIED
- `new TypeSafeClient(config?)`: "Explicit options take precedence over environment variables, then SDK defaults." It throws if the key is missing. Config keys (TypeSafeClientConfig.md): `apiKey` (falls back to `TYPESAFE_API_KEY`), `baseURL` (default `https://api.typesafe.ai`), `defaultModel` (default `jev-latest`), `timeout` ("per attempt ... Default: 10000"), `retry`, `logLevel` (default `warn`; **`debug` logs headers and bodies**), `fetch`, `defaultHeaders`, and `dangerouslyAllowBrowser` (default false). VERIFIED
- Retry defaults (RetryPolicy.md): `maxRetries: 2`, statuses "408, 429, and 500–599", backoff 500 ms doubling to 5000 ms with 0.25 jitter, and `Retry-After` honoured up to 60 s. VERIFIED
- `client.systemOne(request, options?)`. `request` = `{ state, questions, model? }`. `options` = `{ headers, retry, signal, timeout }`. The result is `{ answers, model, usage }`, and "Answer types are inferred from your questions." VERIFIED
- Helpers: `choice(instructions, criteria)`, `score(instructions, criteria)` (criteria is `readonly [EntryType, EntryType, ...EntryType[]]`) and `noul(instructions?, {true?, false?}?)`. VERIFIED

**Example (INFERRED from the documented signatures; not executed, since we have no key access):**
```ts
import "server-only";
import { TypeSafeClient, choice, noul, score, APIError } from "@typesafe-ai/sdk";

const jev = new TypeSafeClient({ apiKey: process.env.JEV_KEY, defaultModel: "jev-1.13.0" });

// One call, one shared state, three primitives evaluated in parallel.
const res = await jev.systemOne({
  state: {
    headlines: ["NVDA guides above consensus", "Export-rule review delayed"],
    options_flow: { put_call: "low vs 1y (10th pct)", unusual_calls: "heavy 2-week OTM call buying" },
    technicals: { trend: "above 50d and 200d SMA", rsi: "overbought (>70)" }, // bucketed in code
  },
  questions: {
    setup: choice("Which outcome is most consistent with `headlines`, `options_flow` and `technicals` together?", {
      continuation_up: "Evidence favours further upside over the next week.",
      mean_reversion_down: "Evidence favours a pullback over the next week.",
      range_bound: "Evidence is balanced or points to no directional move.",
      insufficient: "The state does not contain enough evidence to judge.",
    }),
    has_catalyst: noul("Do `headlines` describe a specific scheduled catalyst?"),
    news_tone: score("How bullish are `headlines` for the stock?", [
      "Clearly bearish", "Mildly bearish", "Neutral or mixed", "Mildly bullish", "Clearly bullish",
    ]),
  },
}, { timeout: 15_000 });

res.answers.setup.choice;          // "continuation_up" | ...
res.answers.setup.probabilities;   // { continuation_up: 0.6, ... } sums to 1
res.answers.setup.confidence;      // 0..1 concentration of the distribution
res.answers.has_catalyst.noul;     // P(yes); no confidence field
res.answers.news_tone.score / 4;   // expected level normalised to 0..1 (levels 0..4)
// Wrap in try/catch: `e instanceof APIError` -> e.status, e.body, e.requestId
```
Single-primitive use is the same call with one key in `questions`. Raw `fetch` works too: POST the §1 JSON with `Authorization: \`Bearer ${process.env.JEV_KEY}\``. VERIFIED shape, INFERRED code.

## 3. What Jev is and is not good for

- **Is:** "System One models are a class of AI models built to make fast, structured decisions that software can use directly." They return "typed decisions and probabilities rather than generated text" (https://docs.typesafe.ai/concepts/system-one.md). VERIFIED
- **Is not:** "System One models do not write replies, produce code, or generate explanations of their reasoning" (system-one.md). "Jev ... does not generate text, write code, or hold a conversation" (https://docs.typesafe.ai/introduction/coding-agents.md). **No rationale text comes back**, so any "why" shown in the UI must come from our own LLM. VERIFIED
- **Calibration claim:** "trained for calibrated decisions: their probabilities are optimized against outcomes ... Calibration is measured across groups of predictions; it does not guarantee that an individual answer is correct." (system-one.md). The primer's definition: "Outcomes assigned a probability of `0.2` should occur about 20% of the time" (https://docs.typesafe.ai/introduction/machine-learning-primer.md). **No calibration metrics (ECE, reliability curves) are published.** VERIFIED
- **Known weaknesses of Jev 1.13** (https://docs.typesafe.ai/model-jaggedness/jev-1.13.md). VERIFIED
  - "Jev is not a calculator" and "does not count reliably".
  - It is poor at the closeness of numeric values.
  - It "Reads dates as text, not as ordered quantities".
  - "Accuracy falls as the state grows with content unrelated to the decision".
  - It does not treat data as hostile (open to injected instructions).
  - It gives no guarantee that complementary questions sum to 1.
  - It is "Not trained to generate text".
- **Your framing, confirmed with a correction** (INFERRED from the above):
  - **Confirmed:** Jev returns a calibrated-by-training distribution over options *you* supply, as a reading of the evidence in `state`. It is **not** a numeric or time-series forecaster, and it cannot compute on raw prices, IV, ratios or dates.
  - **Correction:** the docs never claim Jev predicts *future market outcomes*. Its calibration is about judgments over the given state. The only forecasting mention is "Enrich forecasting models with semantic signals from ... market reports" (https://docs.typesafe.ai/concepts/use-case-map.md), which casts Jev as a **feature generator** for a forecaster, not the forecaster itself.
  - So "which outcome is most likely" works as a structured *evidence-reading* signal. Treat its probabilities as uncalibrated for market outcomes until you have validated them against labeled outcomes (§4c).
  - Pre-bucket all numerics and dates in code ("put/call 90th pct") before they reach `state`.
  - The docs also say "Do not rely on knowledge stored in model weights" (https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md). Put the facts in `state`.
- **Confidence** (https://docs.typesafe.ai/confidence.md). VERIFIED
  - Formula: `(N × peak_probability − 1) / (N − 1)`. It is returned for Choice and Score only.
  - Thresholds in the docs are examples, not rules: a 0.5 floor, and 0.9 for a financial transfer (confidence.md); a 0.6 floor and 0.85 for high-stakes actions (https://docs.typesafe.ai/patterns/confidence-routing.md); ≥0.8 auto-accept (citation cookbook); ≥0.9 (SEC cookbook).
  - The docs' advice: "Start with conservative thresholds, test with your own data".
  - For Noul: 0.5 by default; raise it when false positives cost more (https://docs.typesafe.ai/primitives/noul.md).
- **Question design:** "Break broad judgments into narrow, typed questions". Atomic questions are "probably the most important concept in this guide". Keep "each Score question to one dimension". Add an `other`/`none` option to a Choice (how-to-build, score.md, choice.md). VERIFIED

## 4. Most useful patterns and cookbooks

**(a) Scoring a trade idea on independent dimensions: Composite Scoring** (https://docs.typesafe.ai/patterns/composite-scoring.md). VERIFIED
- "Break a complex judgment into atomic scores, combine with weights you control in code."
- Normalize each score as `score / maxLevel`, then take a weighted sum. The benefit: "visibility into how exactly the final score is being calculated."
- Pair it with **Speculative Fan-Out** (https://docs.typesafe.ai/patterns/fan-out.md): send every dimension in one call, because "adding more questions usually has little effect on response time" and cost is input tokens only.
- Relevant repo guardrail: "A ranking key a model AUTHORS is not a measurement." Keep the weights and the sum in code, recomputed from stored per-dimension answers. This pattern does that naturally (INFERRED).

**(b) Verifying an LLM-generated claim: Double-Checking Citations** (https://docs.typesafe.ai/cookbooks/citation_check.md). VERIFIED
- First, a deterministic string check that the quote exists ("Collapse whitespace and fold curly quotes").
- Then one Choice, "How does the section relate to the claim?", with options `supports` / `contradicts` / `says_nothing`.
- Confidence ≥ 0.8 auto-accepts; below that goes to review.
- Result on 8 citations: 4 verified (0.93–0.99), 1 fabricated, 1 contradicted, 2 flagged (0.27–0.56).
- Related: Re-ranking uses one Noul per candidate and sorts by it (https://docs.typesafe.ai/cookbooks/rerank_typesafe.md). Useful for ranking news items by relevance to a ticker.

**(c) Judgments to ML features with labeled outcomes: Autoresearch Feature Discovery** (https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery.md). VERIFIED
- Score answers become 2 columns (expected level + spread). Noul answers become 1 column (the probability).
- A CatBoost regressor is trained on those columns. An LLM proposes and revises questions each round. Changes are kept only if label-stratified k-fold dev error improves. The held-out set is "scored once at the end".
- Wine RMSE: 3.09 (mean) → 2.15 (a single direct question) → 1.77 (38 questions).
- This is the principled route to "is Jev predictive of our outcomes?". Store the raw answers alongside the realized outcome, and hold out by **time** for market data (INFERRED: a random split leaks).
- The SEC 10-K cookbook (https://docs.typesafe.ai/cookbooks/classification_using_confidence.md) is the finance-flavoured calibration evidence: at confidence ≥0.9, 27/30 were correct; below it, 12/30. VERIFIED

## 5. Gotchas

1. **Env var name.** The SDK reads `TYPESAFE_API_KEY`. Pass `apiKey: process.env.JEV_KEY`, or the constructor throws. VERIFIED (config docs)
2. **Server only.** The browser is blocked unless `dangerouslyAllowBrowser: true` is set, so never set it. Use `import "server-only"` in Next.js (INFERRED). Don't run `logLevel: "debug"` in shared logs, since it logs headers and bodies.
3. **SDK is pre-1.0 (0.6.0) and changing fast.** 0.6.0 (2026-09-15) is a BREAKING release: "accept Score.criteria as an ordered sequence instead of a dictionary keyed by integers". Examples written with `{0: ..., 1: ...}` are stale (https://docs.typesafe.ai/sdk/javascript/changelog.md). The Python SDK also switched msgspec→pydantic in 0.7.0. Pin the exact version.
4. **"v1 migration notes": none exist.** No migration guide or deprecations were found in llms.txt or either changelog. `/v1/` is simply the current API path. UNCERTAIN only because a doc could be unlisted.
5. **Pin the model** (`jev-1.13.0`) for reproducible features. `jev-latest` will move. Log the returned `model` with every stored answer.
6. **Score is 0-based and fractional.** Normalize by `levels − 1`. Noul has no `confidence`. Separate Nouls are not a partition: complementary questions can both be high (https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook.md). Use one Choice when you need mutually exclusive outcomes.
7. **Timeouts are per attempt with no total budget.** With the defaults, the worst case is about 3×10 s plus backoff. Pass an `AbortSignal` from the route handler.
8. **Undocumented error body.** Branch on `status` and keep `requestId` for support. Rate limits are "adjusting dynamically".
9. **News is untrusted input.** Jev "does not treat data as hostile". Keep instructions explicit and use constrained criteria. Filter irrelevant state, since accuracy drops as unrelated content grows.
10. **Supply chain.** The official repo is `github.com/typesafe-ai/typesafe-sdk-js`. Search results also surface same-named forks under other accounts, so install only from npm `@typesafe-ai/sdk`. VERIFIED (search results)
11. **Secondary, UNCERTAIN.** Third-party posts (https://flaviocopes.com/jev/, https://www.datacamp.com/blog/system-one-models-jev) say Jev is in waitlisted early access and is also served on Vercel AI Gateway as `typesafe-ai/jev`. That is not confirmed in the official docs.
