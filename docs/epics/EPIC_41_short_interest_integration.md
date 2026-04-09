# Epic 41 — Short Interest Integration

## Background

The application currently warns users to "Check if short interest in this name is elevated" on hedge-intent whale alerts, but never actually fetches or displays the data. A fully implemented `fetchShortInterest()` function exists in `market-fetcher.ts` (Story 39.3) but is dead code — never called by any pipeline.

Professional options traders use short interest as a **secondary confirmation/contradiction signal** (not a primary driver). Key industry conventions:

| SI % of Float | Interpretation | Significance                                        |
| ------------- | -------------- | --------------------------------------------------- |
| < 5%          | Low            | Negligible short pressure                           |
| 5–10%         | Moderate       | Noteworthy but not alarming                         |
| 10–20%        | High           | Significant bearish conviction among shorts         |
| > 20%         | Extreme        | Potential squeeze candidate; very high bearish bets |

| Days to Cover | Interpretation                                     |
| ------------- | -------------------------------------------------- |
| < 3           | Easy to cover — low squeeze risk                   |
| 3–5           | Moderate squeeze risk                              |
| 5–8           | High squeeze risk — covering takes nearly a week   |
| > 8           | Very difficult to cover — strong squeeze potential |

### How SI interacts with whale signals

| Whale Signal + SI Level     | Professional Interpretation                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Bullish whale + High SI** | Contrarian squeeze play — shorts are crowded, bullish flow adds fuel. **Increases conviction.**                     |
| **Bearish whale + High SI** | Confirmation — smart money agrees with short thesis. **Increases conviction.**                                      |
| **Hedge intent + High SI**  | Validates the hedge — institution is protecting against a crowded short. **Reduces recommendation aggressiveness.** |
| **Any signal + Low SI**     | SI is neutral — no squeeze potential, no confirmation. **No meaningful impact.**                                    |

### Weighting guidance

Industry quant models typically weight SI at **5–10%** of a composite signal. Our existing architecture memo (Sprint 39A research) targets **8%** for SI. This is consistent with SI being a confirming indicator, not a primary one.

## Scope

1. Activate the existing `fetchShortInterest()` in the whale pipeline with 24-hour caching
2. Add SI as a factor in quality score calculation (~8% weight)
3. Supply SI data to LLM recommendation and deep dive prompts
4. Add SI as a factor in composite confidence scoring
5. Display SI data in WhaleAlertDetail with a visual squeeze-pressure gauge
6. Show SI context in AnalysisPage recommendation cards
7. Replace all static "check short interest" warnings with live data

## Stories

- **41.1** — Fetch & cache short interest in whale pipeline
- **41.2** — Add short interest factor to quality score
- **41.3** — Feed short interest into LLM prompts (recommendation + deep dive)
- **41.4** — Add short interest factor to composite confidence
- **41.5** — Expose short interest via API & frontend hooks
- **41.6** — Short interest gauge panel in WhaleAlertDetail
- **41.7** — Short interest context in AnalysisPage recommendations

## Files Affected (summary)

| File                                               | Stories    |
| -------------------------------------------------- | ---------- |
| `src/lib/db/schema.ts`                             | 41.1       |
| `src/lib/cron/pipelines/whale-pipeline.ts`         | 41.1       |
| `src/lib/utils/whale-quality.ts`                   | 41.2       |
| `src/lib/prompts/trade-analyzer.ts`                | 41.3       |
| `src/lib/prompts/deep-dive-analyzer.ts`            | 41.3       |
| `src/lib/cron/pipelines/analysis-pipeline.ts`      | 41.3, 41.4 |
| `src/lib/services/llm-analyzer.ts`                 | 41.3       |
| `src/lib/utils/composite-confidence.ts`            | 41.4       |
| `src/app/api/whales/route.ts`                      | 41.5       |
| `src/hooks/useApiData.ts`                          | 41.5       |
| `src/types/whale.ts`                               | 41.5       |
| `src/components/whale-alerts/WhaleAlertDetail.tsx` | 41.6       |
| `src/components/analysis/AnalysisPage.tsx`         | 41.7       |

---

## Story 41.1 — Fetch & Cache Short Interest in Whale Pipeline

### Goal

Activate the existing `fetchShortInterest()` function during the whale pipeline, store results in a new `shortInterest` DB table with 24-hour caching to minimize API calls.

### Rationale

Short interest data from Yahoo Finance (`yf.quoteSummary` → `defaultKeyStatistics`) only changes biweekly (FINRA reporting schedule). Fetching once per day per ticker is more than sufficient and conserves API budget.

### Implementation Plan

1. **Add `shortInterest` table to `src/lib/db/schema.ts`**

   ```
   shortInterest:
     id         INTEGER PK autoIncrement
     ticker     TEXT NOT NULL
     sharesShort       REAL (nullable)
     shortRatio        REAL (nullable)  — days to cover
     shortPercentOfFloat REAL (nullable) — 0-1
     squeezePressure   TEXT NOT NULL     — "extreme"|"high"|"moderate"|"low"
     dateShortInterest TEXT (nullable)   — FINRA report date
     fetchedAt         TEXT NOT NULL     — ISO timestamp
   UNIQUE(ticker) — one row per ticker, upsert on refresh
   INDEX on (ticker)
   ```

2. **Create helper `getOrFetchShortInterest()` in `src/lib/services/market-fetcher.ts`**
   - Accepts `ticker: string`, `db` instance
   - Queries `shortInterest` table for the ticker
   - If `fetchedAt` is < 24 hours old, return cached row
   - Otherwise call `fetchShortInterest(ticker)`, upsert into DB, return new data
   - On fetch failure, return stale cached data if available, null otherwise

3. **Integrate into whale pipeline (`src/lib/cron/pipelines/whale-pipeline.ts`)**
   - After the existing market quote fetch loop (which already iterates unique tickers), call `getOrFetchShortInterest(ticker)` for each
   - Collect results into a `Map<string, ShortInterestData>`
   - This runs in the existing parallel batch alongside market data — no new pipeline stage needed
   - Log summary: `[whale-pipeline] Short interest refreshed for N tickers (M cache hits)`

4. **Add Drizzle migration**
   - `npx drizzle-kit generate` for the new table
   - The `seed.ts` should not need changes (SI is fetched live)

### Testing Plan

1. **New test: `src/__tests__/services/short-interest-cache.test.ts`**
   - Mock `yf.quoteSummary` to return known SI data
   - Test `getOrFetchShortInterest()` fetches fresh data when no cache exists
   - Test `getOrFetchShortInterest()` returns cached data when `fetchedAt` < 24h
   - Test `getOrFetchShortInterest()` re-fetches when `fetchedAt` > 24h
   - Test `getOrFetchShortInterest()` returns stale cache when API fails
   - Test `getOrFetchShortInterest()` returns null when no cache and API fails

2. **Modify: `src/__tests__/cron/whale-pipeline.test.ts`** (if exists) or create
   - Assert `getOrFetchShortInterest` is called once per unique ticker
   - Assert pipeline doesn't fail if SI fetch returns null for all tickers

---

## Story 41.2 — Add Short Interest Factor to Quality Score

### Goal

Add a 7th factor "Short Interest Signal" to `scoreWhaleQuality()` weighted at ~8%, and rebalance existing factor weights.

### Industry-Informed Scoring Logic

| Scenario                      | SI Score (0–100)   | Rationale                                                |
| ----------------------------- | ------------------ | -------------------------------------------------------- |
| **SI > 20% + bullish whale**  | 95                 | Crowded short → squeeze fuel for bullish flow            |
| **SI > 20% + bearish whale**  | 85                 | Confirms strong bearish thesis                           |
| **SI 10–20% + bullish whale** | 75                 | Moderate squeeze potential                               |
| **SI 10–20% + bearish whale** | 70                 | Moderate confirmation                                    |
| **SI 5–10%**                  | 50                 | Noteworthy but not decisive                              |
| **SI < 5%**                   | 30                 | No meaningful SI signal                                  |
| **Hedge intent + SI > 10%**   | 40                 | Validates hedge (reduces conviction, not quality per se) |
| **No SI data available**      | null (skip factor) | Weight redistributed to other factors                    |

### Implementation Plan

1. **Update `scoreWhaleQuality()` in `src/lib/utils/whale-quality.ts`**
   - Add optional `shortInterestData?: ShortInterestData | null` parameter
   - Add Factor 7: Short Interest Signal calculation (logic from table above)
   - Look up `alert.intentHint` for hedge detection

2. **Rebalance weights** — redistribute to accommodate the new 8% factor:

   ```
   BEFORE (6 factors):
     Vol/OI: 25.5%, OTM: 21.25%, Premium: 17%, Expiry: 12.75%, Sweep: 8.5%, Technical: 15%

   AFTER (7 factors):
     Vol/OI: 23.5%, OTM: 19.5%, Premium: 15.5%, Expiry: 12%, Sweep: 8%, Technical: 13.5%, SI: 8%
   ```

   Each existing factor loses ~8% of its weight proportionally.

3. **Update whale pipeline call site** (`whale-pipeline.ts` line ~122)
   - Pass the ticker's `ShortInterestData` from the map collected in Story 41.1

### Testing Plan

1. **Modify: `src/__tests__/utils/whale-quality.test.ts`** (create if missing)
   - Test: High SI + bullish whale → SI factor score ~95
   - Test: High SI + bearish whale → SI factor score ~85
   - Test: Low SI → SI factor score ~30
   - Test: Hedge intent + high SI → SI factor score ~40
   - Test: No SI data → score unchanged (weight redistributed)
   - Test: Overall composite shifts by expected amount when SI factor added
   - Test: All factor weights sum to 1.0

2. **Regression**: Verify existing quality score tests still pass with minor expected shifts due to rebalancing

---

## Story 41.3 — Feed Short Interest into LLM Prompts

### Goal

Supply short interest data to both the trade recommendation and deep dive LLM prompts so the AI can factor squeeze potential, thesis confirmation, and risk into its analysis.

### Implementation Plan

1. **Update `buildTradeAnalyzerPrompt()` in `src/lib/prompts/trade-analyzer.ts`**
   - Add new optional parameter: `shortInterest?: { shortPercentOfFloat: number | null; shortRatio: number | null; squeezePressure: string } | null`
   - Append to prompt section after whale intent hint:
     ```
     - Short Interest: {pct}% of float ({squeezePressure} squeeze pressure)
     - Days to Cover: {shortRatio}
     - SI Context: {interpretation based on whale direction + SI level}
     ```
   - Add interpretive text so the LLM understands the implications:
     - Bullish direction + high SI → "Crowded short — squeeze potential adds fuel to bullish thesis"
     - Bearish direction + high SI → "Shorts agree — confirmation of bearish conviction"
     - High SI generally → "High short interest increases volatility potential — consider wider risk bands"

2. **Update `buildDeepDivePrompt()` in `src/lib/prompts/deep-dive-analyzer.ts`**
   - Add `shortInterest` to `DeepDivePromptInput` interface
   - Append `## Short Interest Context` section to prompt with same data + interpretive guidance
   - Add to system instruction: "If short interest data is provided, assess squeeze potential and factor it into your risk assessment and strategy selection."

3. **Update `generateRecommendation()` call in `src/lib/services/llm-analyzer.ts`**
   - Add `shortInterest` to `MarketDataForRecommendation` interface (line ~590)
   - Pass through to `buildTradeAnalyzerPrompt()`

4. **Update analysis pipeline (`analysis-pipeline.ts`)**
   - In the recommendation generation loop (line ~423): look up SI data from DB for the ticker
   - In the deep dive generation section: same lookup
   - Query: `SELECT * FROM short_interest WHERE ticker = ? AND fetchedAt > ?` (24h TTL)

### Testing Plan

1. **Modify: `src/__tests__/services/llm-analyzer.test.ts`**
   - Test: `generateRecommendation()` passes SI data through to prompt when available
   - Test: `generateRecommendation()` works normally when SI is null/undefined

2. **New test: `src/__tests__/prompts/trade-analyzer-si.test.ts`**
   - Test: `buildTradeAnalyzerPrompt()` includes "Short Interest" section when SI data provided
   - Test: Prompt includes squeeze interpretation for bullish + high SI
   - Test: Prompt includes confirmation interpretation for bearish + high SI
   - Test: Prompt omits SI section when data is null/undefined
   - Test: `buildDeepDivePrompt()` includes "Short Interest Context" section

3. **Snapshot consideration**: Existing prompt snapshot tests (if any) will need updating

---

## Story 41.4 — Add Short Interest to Composite Confidence

### Goal

Add "Short Interest Signal" as a 9th factor in `computeCompositeConfidence()` with ~8% weight, directional alignment logic.

### Scoring Logic

| Scenario                      | Normalized Score (0–1) | Rationale                                          |
| ----------------------------- | ---------------------- | -------------------------------------------------- |
| Bullish direction + SI > 20%  | 0.85                   | Squeeze fuel — strongly favorable                  |
| Bullish direction + SI 10–20% | 0.70                   | Moderate squeeze potential                         |
| Bearish direction + SI > 20%  | 0.80                   | Strong confirmation                                |
| Bearish direction + SI 10–20% | 0.70                   | Moderate confirmation                              |
| Any direction + SI 5–10%      | 0.55                   | Slight positive signal                             |
| Any direction + SI < 5%       | 0.45                   | Neutral / no signal                                |
| Hedge intent + SI > 10%       | 0.30                   | Validates defensive hedge — reduces aggressiveness |
| No SI data                    | null (redistributed)   | Weight goes to other factors                       |

### Implementation Plan

1. **Update `FACTOR_WEIGHTS` in `src/lib/utils/composite-confidence.ts`**

   ```
   BEFORE (8 factors, sum = 1.0):
     geminiCorrelationConf: 0.20, whaleQualityScore: 0.15, technicalAlignment: 0.15,
     ivRegime: 0.10, vixRegime: 0.10, earningsRisk: 0.10, insiderAlignment: 0.10, sectorMomentum: 0.10

   AFTER (9 factors, sum = 1.0):
     geminiCorrelationConf: 0.18, whaleQualityScore: 0.14, technicalAlignment: 0.14,
     ivRegime: 0.09, vixRegime: 0.09, earningsRisk: 0.09, insiderAlignment: 0.09, sectorMomentum: 0.09, shortInterest: 0.09
   ```

2. **Add `shortInterestPctOfFloat` and `whaleIntentHint` to `CompositeInputs` interface**

3. **Add Factor 9 computation** — apply scoring table above, push to `rawFactors`

4. **Update analysis pipeline** (`analysis-pipeline.ts` line ~1096)
   - Pass `shortInterestPctOfFloat` and `whaleIntentHint` to `computeCompositeConfidence()`

### Testing Plan

1. **Modify: `src/__tests__/utils/composite-confidence.test.ts`** (create if missing)
   - Test: Bullish + high SI → factor score 0.85, contributes ~7.6% to composite
   - Test: Hedge + high SI → factor score 0.30, reduces composite
   - Test: No SI data → weight redistributed, composite still valid
   - Test: All factor weights sum to exactly 1.0
   - Test: Factor description includes SI percentage and interpretation text

2. **Modify: `src/__tests__/cron/pipeline-isolation.test.ts`**
   - Ensure pipeline still runs if SI data is null for all tickers
   - Ensure composite confidence still computes when SI factor is null

---

## Story 41.5 — Expose Short Interest via API & Frontend Hooks

### Goal

Make short interest data accessible to the frontend by including it in the whale alerts API response and adding type definitions + hooks.

### Implementation Plan

1. **Update whale type (`src/types/whale.ts`)**
   - Add to `WhaleAlert` interface:
     ```ts
     shortPercentOfFloat: number | null;
     shortRatio: number | null;
     squeezePressure: string | null;
     ```

2. **Update `/api/whales` route (`src/app/api/whales/route.ts`)**
   - JOIN or subquery `shortInterest` table by ticker when building whale alert response
   - Attach `shortPercentOfFloat`, `shortRatio`, `squeezePressure` to each alert

3. **Update `WhaleAlert` interface in `src/hooks/useApiData.ts`**
   - Add the 3 new fields to match the type definition

4. **Expose in analysis API** (`/api/analysis/route.ts`)
   - For recommendation outputs, include SI data alongside the existing analysis JSON
   - Either embed in the analysis output or as a sibling field

### Testing Plan

1. **Modify: `src/__tests__/api/whales.test.ts`** (if exists, create if not)
   - Test: Whale alert response includes `shortPercentOfFloat`, `shortRatio`, `squeezePressure`
   - Test: Fields are null when no SI data cached for that ticker
   - Test: Fields populated correctly from `shortInterest` table

2. **Type verification**: Run `npx next build` to confirm no TypeScript errors from the new fields

---

## Story 41.6 — Short Interest Gauge Panel in WhaleAlertDetail

### Goal

Replace the static "Check if short interest is elevated" warning with a live short interest data panel featuring a visual squeeze-pressure gauge.

### Design

```
┌─ Short Interest ──────────────────────────────────┐
│  11.2% of Float    ██████████░░░░░░░░░░  HIGH     │
│                                                    │
│  Days to Cover: 4.8    Shares Short: 12.4M        │
│                                                    │
│  ⚠ Squeeze Pressure: HIGH                          │
│  Crowded short — if the stock moves up, shorts     │
│  may be forced to cover, amplifying upward moves.  │
│  This adds fuel to the bullish whale signal.       │
└───────────────────────────────────────────────────-┘
```

- Gauge: Horizontal progress bar with color bands (green < 5%, yellow 5–10%, orange 10–20%, red > 20%)
- Contextual text changes based on whale sentiment + SI level + intent hint
- Squeeze pressure badge with color coding
- Fallback: If no SI data, show "Short interest data unavailable" in muted text

### Implementation Plan

1. **Create `ShortInterestPanel` component** (inline in `WhaleAlertDetail.tsx` or separate file `src/components/whale-alerts/ShortInterestPanel.tsx`)
   - Props: `shortPercentOfFloat: number | null`, `shortRatio: number | null`, `squeezePressure: string | null`, `sentiment: string | null`, `intentHint: string | null`
   - Horizontal gauge bar (using shadcn `Progress` component or custom div)
   - Color thresholds: green (< 5%), yellow (5–10%), orange (10–20%), red (> 20%)
   - Squeeze pressure badge using existing `Badge` component
   - Contextual interpretation text (4 variants: bullish+high, bearish+high, hedge+high, low/neutral)

2. **Update `WhaleAlertDetail.tsx`**
   - Below the Intent Signal Panel section (line ~283), add `ShortInterestPanel`
   - Pass SI data from the `WhaleAlert` object (new fields from Story 41.5)
   - Remove or update the static "Check if short interest in this name is elevated" text in the hedge intent takeaway — replace with "See short interest data below" or remove entirely

3. **Update `IntentSignalPanel` hedge takeaway text**
   - The hedge intent configuration currently has `takeaway: "Don't blindly follow this signal. The whale may be managing risk, not predicting a rally. Check if short interest in this name is elevated."`
   - Update to reference the new panel: "Don't blindly follow this signal. The whale may be managing risk, not predicting a rally. See the short interest data below for context."

### Testing Plan

1. **New test: `src/__tests__/components/short-interest-panel.test.tsx`**
   - Test: Renders gauge at correct fill percentage for SI = 11.2%
   - Test: Shows "HIGH" squeeze pressure badge with orange/red styling
   - Test: Shows "LOW" squeeze pressure badge with green styling
   - Test: Contextual text matches bullish + high SI scenario
   - Test: Contextual text matches bearish + high SI scenario
   - Test: Shows fallback text when all SI data is null
   - Test: Formats shares short with abbreviations (12.4M, 1.2B)
   - Test: Days to cover rounded to 1 decimal

2. **Visual regression**: Manual check that the panel integrates well in the whale detail slide-out

---

## Story 41.7 — Short Interest Context in AnalysisPage Recommendations

### Goal

Display short interest data alongside recommendations in the Analysis page, and replace the static "Verify short interest data for {ticker}" hedge warning with live data.

### Design

In `RecommendationCard` — new section between market context and risk factors:

```
Short Interest: 11.2% of float (HIGH) · Days to cover: 4.8
→ Crowded short adds squeeze potential to this bullish thesis
```

In `CrossReferenceCard` hedge alignment warning — replace static text:

```
BEFORE: "Reduce confidence in this signal. Verify short interest data for AAPL before acting."
AFTER:  "Reduce confidence in this signal. Short interest for AAPL is 11.2% of float (HIGH squeeze pressure) — the hedge is justified."
   or:  "Reduce confidence in this signal. Short interest for AAPL is 2.1% of float (LOW) — hedge may be driven by other factors."
```

### Implementation Plan

1. **Extend analysis API response**
   - The recommendation `output` JSON already stores the full LLM response
   - For SI data: since recommendations are stored as JSON analysis output, we have two options:
     a. Pass SI data alongside the analysis in the API response (sibling field)
     b. Store SI summary in the analysis `output` JSON at generation time
   - Option (b) is better — enriches the stored output, available offline
   - In analysis pipeline: when storing the recommendation, append `short_interest_context` to the output JSON

2. **Update `AnalysisPage.tsx` — `RecommendationCard` section**
   - Read `output.short_interest_context` from the analysis output
   - Display inline: SI percentage, squeeze pressure badge, contextual one-liner
   - Place after market context block, before risk factors

3. **Update `AnalysisPage.tsx` — hedge alignment warning**
   - The current hedge warning (line ~400-415) shows static text
   - Replace with dynamic text that incorporates SI data from the recommendation's stored context
   - Show actual SI data: "{pct}% of float ({squeezePressure} squeeze pressure)"

4. **Handle missing data gracefully**
   - If `short_interest_context` is missing (old analyses), don't render the section
   - If SI data was null at generation time, show "Short interest data unavailable for this ticker"

### Testing Plan

1. **Modify: `src/__tests__/components/analysis-page.test.tsx`** (create if missing)
   - Test: RecommendationCard renders SI context when present in analysis output
   - Test: RecommendationCard omits SI section when missing from output
   - Test: Hedge alignment warning shows real SI data when available
   - Test: Hedge alignment warning falls back to generic text when SI missing

2. **Integration consideration**: Run full pipeline once after all stories complete, verify that new recommendations include SI context in their stored JSON

---

## Dependency Order

```
41.1 (fetch & cache)
  ├── 41.2 (quality score)  — needs SI data from pipeline
  ├── 41.3 (LLM prompts)    — needs SI data from pipeline
  ├── 41.4 (composite conf)  — needs SI data from pipeline
  └── 41.5 (API exposure)   — needs SI data in DB
        ├── 41.6 (whale detail UI)  — needs API fields
        └── 41.7 (analysis page UI) — needs stored SI context (from 41.3)
```

41.1 is the prerequisite for all others. Stories 41.2, 41.3, 41.4, 41.5 can be parallelized. Stories 41.6 and 41.7 depend on 41.5 (frontend data access) and 41.3 (stored SI in analysis output) respectively.

## API Budget Impact

- `fetchShortInterest` uses `yf.quoteSummary` — 1 call per unique ticker
- With 24h caching: at most ~10–15 calls/day (typical whale tickers per pipeline run)
- Yahoo Finance budget: 1,800 calls/day → SI adds < 1% of daily budget
- No new API provider needed
