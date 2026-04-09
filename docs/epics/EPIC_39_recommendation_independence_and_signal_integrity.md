# Epic 39: Recommendation Independence & Signal Integrity

> **Status:** � SPRINT 39A COMPLETE — Research delivered  
> **Priority:** P0 — Critical (current recommendations are losing money by blindly following whale direction when all technical and macro signals disagree)  
> **Created:** 2026-04-09  
> **Depends on:** Indicator pattern detection (Epic 38), analysis pipeline (`analysis-pipeline.ts`), trade analyzer prompt (`trade-analyzer.ts`), deep-dive pipeline (`llm-analyzer.ts`), market-fetcher (`market-fetcher.ts`)

## Problem Statement

Trade recommendations consistently mirror the whale's directional bet even when **all available technical signals disagree**. Example: a whale buys short-dated calls (possibly to cover a short position), every detected pattern is bearish, the deep-dive analysis concludes bearish — yet the recommendation outputs a bullish call spread with 60-90 day expiry and high confidence. This disconnect has been losing money consistently.

### Root Causes Identified (Pipeline Audit)

1. **Recommendation is generated BEFORE the deep dive** — the deep dive's bearish risk assessment, pattern analysis, and support/resistance levels never feed into the recommendation prompt. Only a post-hoc confidence adjustment (±0.3 max) is applied, which cannot change direction, strategy, or strikes.

2. **No short interest data** — the system has no visibility into short covering, short squeeze risk, or whether a whale's call buying might be hedging a larger short position rather than expressing a bullish thesis.

3. **IV rank always passes as undefined** — despite being computed and stored in the DB, it's hardcoded as `undefined` in the recommendation call, so the LLM always sees "N/A" and cannot make IV-informed strategy decisions (credit vs debit).

4. **Options chain summary is a single line** — the recommendation gets `"3 expirations, nearest: 2026-04-17 (42 calls, 38 puts)"` while the deep dive gets full ATM strikes, bid/ask, Greeks, P/C ratio, and per-strike IV. The LLM cannot evaluate specific strikes or chain structure.

5. **GEX data excluded from recommendation** — dealer gamma positioning (long/short gamma, flip level, concentration zones) is computed and sent to the deep dive but omitted from the recommendation prompt entirely.

6. **Only 3M timeframe patterns** — the recommendation receives indicator patterns from 3-month candles only. No macro-scale patterns (6M, 1Y) or micro-scale patterns (1W, 1M) are provided, so the LLM cannot distinguish between short-term noise and long-term trend.

7. **No system instruction to form independent judgment** — the system prompt never explicitly tells the LLM to contradict the whale when signals disagree. Rule 14 says "match the whale's timeframe" but nothing says "form your own directional opinion based on all evidence."

8. **Put/call ratio absent** — computed for deep dive inline but not passed to recommendations.

9. **Recommendation expiry ignores available data timeframe** — pattern detection and TA start at weekly granularity, but recommendations sometimes suggest expiries shorter than the signal timeframe.

## Goal

Transform the recommendation engine from "mirror the whale with adjustments" to "form an independent, evidence-based thesis that considers the whale as ONE signal among many." Every recommendation should:

1. Weigh the whale trade as a single data point alongside macro trends, micro trends, options microstructure, short interest, and multi-timeframe technical patterns
2. Be able to recommend the **opposite direction** from the whale when signals overwhelmingly disagree
3. Factor short covering / hedging scenarios when a whale's call buying conflicts with bearish sentiment
4. Use macro-scale patterns (1M, 3M, 6M+) for trend direction and micro-scale patterns (<1W) for entry timing
5. Select expiry dates grounded in the timeframe of the signals available, not arbitrary 60-90 day defaults
6. Use detailed options microstructure (P/C ratio, IV rank, GEX, ATM chain) to select appropriate strategies (credit vs debit, directional vs neutral)

---

## Sprint 39A — Research & Foundation

### Story 39.1 — Research: Short Covering Detection & Whale Intent Disambiguation

#### Goal

Research and document how to detect whether a whale's options activity represents:

- A genuine directional bet (conviction trade)
- Short covering (buying calls to hedge/close a short equity position)
- Portfolio hedging (buying puts as insurance on an existing long)
- Synthetic positioning (call/put combos creating synthetic longs/shorts)

#### Research Questions

1. **Short interest integration**: What fields does `yahoo-finance2` `quoteSummary.defaultKeyStatistics` return? How reliable and fresh is the data? (Known: `sharesShort`, `shortRatio`, `shortPercentOfFloat`, `sharesShortPriorMonth`, `dateShortInterest`)
2. **Short covering signals**: When short interest is high (>15% of float) and a whale buys calls, what's the probability it's covering vs directional? Literature review.
3. **Call/put context clues**: What distinguishes a conviction call buy from a short-covering call buy? (Premium relative to OI, strike distance from current price, expiry length, time of day, presence of paired put selling)
4. **Whale quality score**: Does the existing quality score from the whale alert feed capture any of these nuances? What fields does it use?
5. **Options strategy recognition**: Can we detect when whale flow represents a multi-leg strategy (spread, straddle, strangle) rather than a naked directional bet? Review the whale alert data structure for paired trades.

#### Deliverables

- Research document in `docs/research/` covering findings for each question
- Recommendation for which signals to implement (cost/benefit for each data source)
- Schema for a `WhaleIntentClassification` type: `"directional_bullish" | "directional_bearish" | "short_covering" | "hedge" | "synthetic" | "unknown"`

#### Acceptance Criteria

- [x] Research doc covers all 5 questions with evidence → `docs/research/39_1_short_covering_and_whale_intent.md`
- [x] Yahoo Finance short interest field availability confirmed with live API test (AAPL, GME, TSLA)
- [x] Whale intent classification schema defined (`WhaleIntentClassification` 6-category type)
- [x] Cost estimate for additional API calls per pipeline run (1 `quoteSummary` call per ticker)

#### Key Findings (Sprint 39A)

- **4 reliable short interest fields**: `sharesShort`, `shortRatio`, `shortPercentOfFloat`, `dateShortInterest`
- **`sharesShortPriorMonth` is BUGGY** — returns epoch-like date; must be excluded from Story 39.3
- **`intentHint` already exists in DB** but is NOT exposed to LLM — quick win for wiring
- **Multi-leg strategy detection is infeasible** with current API data — deferred; LLM prompt note instead
- **Short interest data is 2-4 weeks stale** — sufficient for regime detection, not intraday tracking

---

### Story 39.2 — Research: Options Strategy Selection Based on Signal Regime

#### Goal

Document the decision matrix for options strategy selection based on combinations of market signals, so the recommendation engine can make structurally sound strategy choices rather than defaulting to call/put spreads.

#### Research Questions

1. **IV regime strategies**:
   - High IV (IV rank > 60): Which strategies harvest premium? (Credit spreads, iron condors, short strangles, jade lizards)
   - Low IV (IV rank < 30): Which strategies benefit from expansion? (Debit spreads, long straddles, calendars)
   - Normal IV (30-60): Directional vs neutral?

2. **Signal alignment matrix**: Given:
   - Whale direction (bullish/bearish/unknown)
   - Technical trend (bullish/bearish/neutral per timeframe)
   - Short interest level (low/medium/high)
   - GEX positioning (long gamma / short gamma)
   - P/C ratio (bullish/bearish)

   Map the combinations to optimal strategy types with rationale.

3. **Timeframe-expiry mapping**:
   - 1W patterns → weekly to 2-week expiries
   - 1M patterns → 2-4 week expiries
   - 3M patterns → 30-60 day expiries
   - 6M+ patterns → 60-120 day expiries (LEAPS for 1Y)

   Validate against options trading literature.

4. **Conflicting signal handling**:
   - When patterns say bearish but whale says bullish → what should dominate?
   - Confidence scaling: how much should each signal source reduce/increase overall confidence?
   - When to recommend "no trade" (stand aside)

#### Deliverables

- Strategy selection decision tree document in `docs/research/`
- Signal weight table (whale: X%, patterns: Y%, options flow: Z%, macro: W%)
- "No trade" criteria definition

#### Acceptance Criteria

- [x] Decision tree covers IV regime × direction × conflicting signals → `docs/research/39_2_strategy_selection_decision_matrix.md`
- [x] Signal weighting rationale is documented (whale 7%, technicals 35%, options microstructure 25%, deep dive 15%, macro 10%, SI 8%)
- [x] At least 8 strategy types mapped to signal conditions (8 strategies: bull/bear call/put spreads, iron condor, long straddle, long strangle, no trade)
- [x] "No trade" / "stand aside" conditions defined (5 primary + 4 secondary criteria)

#### Key Findings (Sprint 39A)

- **IV rank is the #1 strategy selector**: High IV → credit spreads; Low IV → debit spreads
- **Whale direction gets only 7% weight** in the signal table — it's a catalyst for analysis, not the conclusion
- **GEX modifies strategy type, not direction**: Long gamma → rangebound/credit; Short gamma → breakout/debit
- **Stand-aside is mandatory** when: extreme signal conflict, confidence < 0.15, >50% data missing, or earnings < 3 days
- **8 strategies sufficient**: Calendar/diagonal/butterfly spreads deferred (require IV term structure not yet computed)

---

## Sprint 39B — Data Enrichment

### Story 39.3 — Fetch Short Interest Data

#### Goal

Add short interest data to the market data pipeline so the recommendation engine and deep dive can assess short covering risk.

#### Deliverables

- New function `fetchShortInterest(ticker)` in `market-fetcher.ts` using `yf.quoteSummary(ticker, { modules: ['defaultKeyStatistics'] })`
- Returns: `{ sharesShort, shortRatio, shortPercentOfFloat, dateShortInterest, shortSqueezePressure: "low" | "moderate" | "high" | "extreme" }`
- `shortSqueezePressure` computed from: shortPercentOfFloat > 20% = extreme, > 10% = high, > 5% = moderate, else low
- NOTE: `sharesShortPriorMonth` excluded — buggy in yahoo-finance2 (returns epoch date instead of number)
- API budget tracking: count as 1 yahoo call per invocation
- Cached per ticker per pipeline run (don't refetch for same ticker)

#### Acceptance Criteria

- [ ] `fetchShortInterest` returns short data for valid tickers
- [ ] Returns null gracefully for tickers without short data (ETFs, indices)
- [ ] API budget tracked via `recordApiCall("yahoo")`
- [ ] Unit test with mocked yahoo-finance2 response

#### Implementation Notes

```typescript
const summary = await yf.quoteSummary(ticker, {
  modules: ["defaultKeyStatistics"],
});
const stats = summary.defaultKeyStatistics;
// stats.sharesShort, stats.shortRatio, stats.shortPercentOfFloat, etc.
```

---

### Story 39.4 — Wire IV Rank to Recommendation Prompt

#### Goal

Fix the `ivRank: undefined` bug so the recommendation LLM can make IV-informed strategy decisions.

#### Deliverables

- In `analysis-pipeline.ts`, compute IV rank from the options chain ATM IV and pass it to `generateRecommendation()`
- Use the ATM IV percentile method already in `market-fetcher.ts` or compute from the chain's ATM options
- Ensure IV rank is a 0-100 percentile value

#### Acceptance Criteria

- [ ] `ivRank` is no longer undefined in recommendation calls
- [ ] IV rank appears in the prompt as a real percentage
- [ ] Strategy recommendations correctly reflect IV rank (high IV → credit strategies, low IV → debit strategies)

---

### Story 39.5 — Enrich Options Chain Summary for Recommendations

#### Goal

Replace the minimal one-line options chain summary with the rich summary already built for deep dives.

#### Deliverables

- Extract the rich chain summary builder from `generateDeepDive()` in `llm-analyzer.ts` into a shared helper function `buildRichOptionsChainSummary(chain, currentPrice)`
- Use this helper in both the deep dive prompt builder AND the recommendation call in `analysis-pipeline.ts`
- Rich summary includes: expiration count, total call/put volume, P/C ratio, total call/put OI, ATM avg IV, ATM calls with strike/bid/ask/vol/OI/IV, ATM puts with same

#### Acceptance Criteria

- [ ] Recommendation prompt now shows full P/C ratio, ATM strikes, and IV data
- [ ] Deep dive and recommendation use the same chain summary helper
- [ ] No duplicate code for chain summary construction

---

### Story 39.6 — Add GEX Data to Recommendation Prompt

#### Goal

Pass GEX data (dealer positioning, net GEX, flip level) to the trade recommendation prompt.

#### Deliverables

- Add `gex` field to the `optionsAnalytics` parameter type in `buildTradeAnalyzerPrompt()`
- Inject GEX context into the prompt (using the same format as the deep-dive prompt)
- Add system instruction rule for GEX interpretation in recommendations

#### Acceptance Criteria

- [ ] GEX net value, dealer positioning, and flip level appear in recommendation prompt
- [ ] System instruction explains how to use GEX for strategy selection
- [ ] Recommendation correctly references GEX in thesis when relevant

---

### Story 39.7 — Multi-Timeframe Indicator Patterns in Recommendations

#### Goal

Pass indicator patterns from multiple timeframes (1W, 1M, 3M, 6M, 1Y) to the recommendation prompt, structured as macro trends vs micro trends.

#### Implementation Note (Sprint 39A Finding)

The deep dive already computes multi-timeframe patterns via `DEEP_DIVE_TIMEFRAME_CONFIG` (lines 788-796 and 970-989 of `llm-analyzer.ts`). This story should reuse that pattern, not duplicate the logic.

#### Deliverables

- Modify the recommendation call site in `analysis-pipeline.ts` to compute indicator patterns for all available timeframes (1W, 1M, 3M are the critical ones; 6M and 1Y are bonus)
- Structure the prompt injection as:

  ```
  Micro Trend (1W):
  - Aggregate: bearish (65% strength)
  - Key patterns: MACD Bearish Crossover [bearish] 73%, BB Squeeze [neutral] 68%

  Medium-Term Trend (1M):
  - Aggregate: bearish (42% strength)
  - Key patterns: RSI Overbought [bearish] 80%, EMA Death Cross [bearish] 71%

  Macro Trend (3M+):
  - Aggregate: bullish (28% strength)
  - Key patterns: EMA Bullish Alignment [bullish] 65%
  ```

- Add system instruction rules explaining macro vs micro trend weighting

#### Acceptance Criteria

- [ ] Recommendation prompt includes at least 1W, 1M, and 3M patterns
- [ ] Macro and micro trends are clearly labeled and separated
- [ ] System instruction explains that macro trend determines direction, micro trend determines timing
- [ ] When macro and micro disagree, the system acknowledges the conflict

---

## Sprint 39C — Pipeline Restructuring

### Story 39.8 — Reorder Pipeline: Deep Dive Before Recommendation

#### Goal

Restructure the analysis pipeline so the deep dive runs BEFORE the recommendation, and the deep dive's key conclusions feed into the recommendation prompt.

#### Deliverables

- Reorder `analysis-pipeline.ts`:
  1. Step 4: Generate deep dives (currently Step 5)
  2. Step 5: Generate recommendations with deep dive summary injected (currently Step 4)
  3. Remove the post-hoc confidence adjustment loop (no longer needed — deep dive informs the recommendation directly)
- Extract a `DeepDiveSummary` from the deep dive output containing:
  - `overallSentiment`: "bullish" | "bearish" | "neutral"
  - `riskLevel`: "low" | "moderate" | "high" | "very_high"
  - `keyPatterns`: top 3 pattern names with signals
  - `supportLevels`: number[]
  - `resistanceLevels`: number[]
  - `thetaAnalysis`: string summary
  - `ivAssessment`: string summary
- Inject the summary into `buildTradeAnalyzerPrompt()` as a new parameter

#### Acceptance Criteria

- [ ] Deep dive completes before recommendation is generated
- [ ] Deep dive summary appears in recommendation prompt
- [ ] Recommendation direction aligns with deep dive sentiment when signals are strong
- [ ] Confidence adjustment loop removed (confidence is set correctly on first pass)
- [ ] No increase in total pipeline time (both steps were sequential anyway)

#### Edge Cases

- **Deep dive fails**: If the LLM call fails for the deep dive, fall back to generating recommendation without deep dive summary (current behavior)
- **Deep dive for different ticker**: Ensure deep dive and recommendation are matched by ticker correctly

---

### Story 39.9 — Inject Short Interest Into Recommendation & Deep Dive

#### Goal

Wire the short interest data from Story 39.3 into both the recommendation and deep dive prompts.

#### Deliverables

- Fetch short interest in the per-ticker analysis loop (alongside market data, options chain, historical candles)
- Add to recommendation prompt:
  ```
  Short Interest (as of [dateShortInterest] — data may be 2-4 weeks old):
  - Short % of Float: 18.3% (HIGH)
  - Short Ratio (Days to Cover): 4.2 days
  - Shares Short: 12.5M
  - Short Squeeze Pressure: high
  ```
- Add to deep dive prompt with the same data
- Add system instruction rule:
  ```
  When short interest is high (>10% of float) and the whale is buying calls:
  - Consider that the call buying may be short covering, not a new bullish bet
  - High short interest + rising price = potential short squeeze (bullish acceleration)
  - High short interest + falling price = shorts are winning (bearish continuation)
  - Factor the "days to cover" ratio into your thesis timeline
  ```

#### Acceptance Criteria

- [ ] Short interest data appears in recommendation prompt when available
- [ ] Short interest data appears in deep dive prompt when available
- [ ] System instruction includes short covering interpretation rules
- [ ] Recommendation thesis references short interest when it's relevant (>5% of float)

---

## Sprint 39D — Prompt Engineering & Independence

### Story 39.10 — System Instruction Overhaul: Independent Judgment

#### Goal

Rewrite the trade analyzer system instruction to mandate independent judgment based on the full evidence set, rather than defaulting to the whale's direction.

#### Deliverables

Replace or amend key system instruction rules:

1. **New Rule — Evidence Hierarchy**:

   ```
   Form your directional opinion using this evidence hierarchy (most to least weight):
   1. Multi-timeframe technical trend consensus (macro + micro patterns agreeing)
   2. Options microstructure (P/C ratio, IV skew, GEX positioning, OI walls)
   3. Deep dive risk assessment and sentiment
   4. Macro context (VIX regime, FOMC, earnings proximity)
   5. Short interest and institutional positioning
   6. Whale trade direction (treat as ONE data point, not the conclusion)

   If items 1-3 conflict with the whale's direction, your recommendation SHOULD disagree with the whale. State this explicitly in your thesis.
   ```

2. **New Rule — Whale Skepticism**:

   ```
   Do NOT assume the whale is correct. Whale trades may represent:
   - Short covering (buying calls to close a short position — NOT bullish conviction)
   - Portfolio hedging (buying puts as insurance — does NOT mean bearish outlook)
   - Multi-leg strategies where only one leg is visible
   - Institutional rebalancing unrelated to directional views
   Evaluate the whale trade in context of short interest, overall flow, and your independent technical analysis.
   ```

3. **New Rule — Conflicting Signals**:

   ```
   When technical signals conflict with whale direction:
   - If 4+ bearish patterns and whale is bullish: recommend bearish or neutral strategy. Note the whale disagreement.
   - If deep dive assessment is "high risk" or "very high risk": reduce confidence by 0.2 and prefer defined-risk strategies.
   - If short interest is >10% and whale buys calls: explicitly discuss short covering probability.
   - If ALL signals conflict (patterns, indicators, deep dive, options flow all bearish but whale bullish): recommend the OPPOSITE direction from the whale with high confidence in the conflicting evidence.
   ```

4. **New Rule — "No Trade" Signal**:

   ```
   If signals are deeply conflicted with no clear edge, you MAY recommend "stand aside" / no trade by setting confidence < 0.15 and noting in the thesis that current conditions don't offer a favorable risk/reward.
   ```

5. **Updated Rule — Expiry Selection**:
   ```
   Base your recommended expiry on the DOMINANT signal timeframe:
   - If the strongest signals are from 1W patterns: recommend 1-2 week expiries
   - If from 1M patterns: recommend 2-4 week expiries
   - If from 3M patterns: recommend 4-8 week expiries
   - If from 6M+ patterns: recommend 60-120 day expiries
   The whale's expiry is a reference point, not a mandate. If the whale has a 1-day expiry but all signals are from monthly patterns, recommend a monthly expiry.
   ```

#### Acceptance Criteria

- [ ] System instruction includes evidence hierarchy with whale as lowest weight
- [ ] Whale skepticism rule warns about short covering, hedging, and multi-leg strategies
- [ ] Conflicting signal rules mandate disagreeing with whale when evidence warrants it
- [ ] "No trade" / stand-aside option exists for deeply conflicted signals
- [ ] Expiry selection rule references signal timeframe, not just whale timeframe

---

### Story 39.11 — Signal Conflict Detection & Structured Summary

#### Goal

Before calling the LLM, pre-compute a "signal scorecard" that summarizes all available signals in a structured format, making it harder for the LLM to ignore conflicting evidence.

#### Deliverables

- New function `computeSignalScorecard(params)` in `src/lib/utils/signal-scorecard.ts`
- Input: multi-timeframe indicator reports, options analytics, short interest, whale trade, deep dive summary, macro context
- Output:
  ```typescript
  interface SignalScorecard {
    bullishSignals: string[]; // e.g., "Whale: bullish call buy"
    bearishSignals: string[]; // e.g., "1W patterns: 3 bearish, 0 bullish"
    neutralSignals: string[]; // e.g., "BB Squeeze: direction unclear"
    overallLean: "bullish" | "bearish" | "neutral" | "conflicted";
    conflictLevel: "none" | "minor" | "major" | "extreme";
    signalCounts: { bullish: number; bearish: number; neutral: number };
    dominantTimeframe: "1W" | "1M" | "3M" | "6M" | "1Y";
    suggestedExpiryRange: { min: number; max: number }; // days
    shortCoveringRisk: "none" | "low" | "moderate" | "high";
  }
  ```
- Inject the scorecard as a prominent section at the TOP of the recommendation prompt (before whale trade signal)
- Format:

  ```
  === PRE-COMPUTED SIGNAL SCORECARD ===
  Overall Lean: BEARISH (7 bearish vs 2 bullish signals)
  Conflict Level: MAJOR — whale direction (bullish) contradicts technical consensus (bearish)
  Short Covering Risk: HIGH — 18% short float + whale buying calls

  Bearish Signals:
  - 1W patterns: MACD Bearish Crossover (73%), RSI Overbought (80%)
  - 1M patterns: EMA Death Cross (71%), Volume Breakout Down (68%)
  - 3M patterns: RSI Bearish Divergence (65%)
  - Put/Call ratio: 1.4 (elevated put demand)
  - Deep dive sentiment: bearish, risk level: high

  Bullish Signals:
  - Whale: bought $340 calls, $2.1M premium
  - 3M patterns: EMA Bullish Alignment (65%)

  Dominant Signal Timeframe: 1M → suggested expiry: 2-4 weeks

  YOUR RECOMMENDATION MUST REFLECT THIS SCORECARD. If you recommend bullish despite a bearish scorecard, you must provide compelling counter-evidence.
  ===
  ```

#### Acceptance Criteria

- [ ] Signal scorecard computed before LLM call
- [ ] Scorecard appears at top of recommendation prompt
- [ ] `overallLean` correctly aggregates all signal sources
- [ ] `conflictLevel` detects whale vs patterns disagreement
- [ ] `shortCoveringRisk` flags when whale calls + high short interest
- [ ] Unit tests for scorecard computation with various signal combos

---

## Sprint 39E — Validation & Backtesting

### Story 39.12 — A/B Comparison: Old vs New Recommendations

#### Goal

Run the new recommendation pipeline against historical data and compare directional accuracy vs the old pipeline.

#### Deliverables

- Script `scripts/backtest-recommendations.ts` that:
  1. Pulls the last 30 days of analyses from the DB
  2. For each recommendation, checks if the stock moved in the recommended direction within the recommended timeframe
  3. Computes hit rate for old recommendations
  4. Re-runs the recommendation prompt with the new system instructions + enriched data for a sample of 10-20 tickers
  5. Compares new vs old directional accuracy
- Output: summary table with old accuracy %, new accuracy %, per-ticker comparison

#### Acceptance Criteria

- [ ] Script runs against real historical data
- [ ] Comparison covers at least 10 historical recommendations
- [ ] Report shows directional accuracy improvement (or identifies regressions)
- [ ] Identifies cases where old pipeline recommended bullish but stock went down

---

### Story 39.13 — Pipeline Integration Testing

#### Goal

End-to-end test that the new pipeline produces different recommendations when signals conflict with whale direction.

#### Deliverables

- Integration test: mock a scenario where whale buys calls but all patterns are bearish + short interest >15%
  - Assert recommendation direction is bearish or neutral (NOT bullish)
  - Assert thesis mentions short covering possibility
  - Assert confidence is reduced vs a non-conflicted scenario
- Integration test: mock a scenario where all signals agree bullish
  - Assert recommendation direction is bullish
  - Assert confidence is higher than conflicted scenario
- Integration test: mock deeply conflicted scenario (equal bullish/bearish)
  - Assert confidence < 0.3 or recommendation is neutral/stand-aside

#### Acceptance Criteria

- [ ] Conflicting signal test produces non-whale-following recommendation
- [ ] Aligned signal test produces high-confidence recommendation
- [ ] Deeply conflicted test produces low confidence or stand-aside
- [ ] All tests pass in CI

---

## Implementation Order

| Order | Story                                      | Sprint | Dependencies     | Estimated Complexity | Sprint 39A Notes                                          |
| ----- | ------------------------------------------ | ------ | ---------------- | -------------------- | --------------------------------------------------------- |
| 1     | 39.1 — Research: Short Covering Detection  | 39A    | None             | Research             | ✅ COMPLETE                                               |
| 2     | 39.2 — Research: Strategy Selection Matrix | 39A    | None             | Research             | ✅ COMPLETE                                               |
| 3     | 39.3 — Fetch Short Interest Data           | 39B    | 39.1             | Small                | `sharesShortPriorMonth` removed (buggy)                   |
| 4     | 39.4 — Wire IV Rank                        | 39B    | None             | Trivial              | Also check `marketData.ivRank` from DB                    |
| 5     | 39.5 — Enrich Options Chain Summary        | 39B    | None             | Small                | Extraction from lines 992-1025 of llm-analyzer.ts         |
| 5b    | NEW: Wire `intentHint` to prompts          | 39B    | None             | Trivial              | Already stored in DB; just expose to LLM                  |
| 6     | 39.6 — Add GEX to Recommendation           | 39B    | None             | Small                | `chain.gex` already in `optionsAnalytics`; wire to prompt |
| 7     | 39.7 — Multi-Timeframe Indicators          | 39B    | None             | Medium               | Reuse `DEEP_DIVE_TIMEFRAME_CONFIG` pattern                |
| 8     | 39.8 — Reorder Pipeline (Deep Dive First)  | 39C    | None             | Medium               | Add fallback for deep dive failure                        |
| 9     | 39.9 — Wire Short Interest to Prompts      | 39C    | 39.3             | Small                | Also wire expanded WhaleIntentClassification              |
| 10    | 39.10 — System Instruction Overhaul        | 39D    | 39.1, 39.2       | Medium               | Use signal weight table (whale 7%)                        |
| 11    | 39.11 — Signal Scorecard                   | 39D    | 39.7, 39.8, 39.9 | Medium               | Add `noTradeReasons` field                                |
| 12    | 39.12 — Backtest Comparison                | 39E    | 39.10, 39.11     | Medium               | Add IV rank correctness check                             |
| 13    | 39.13 — Integration Tests                  | 39E    | All above        | Medium               | Add stand-aside scenario test                             |

**Critical path**: 39.1/39.2 (research, parallel) → 39.3-39.7 (data enrichment, parallel) → 39.8 (pipeline reorder) → 39.9-39.10 (wiring + prompt) → 39.11 (scorecard) → 39.12-39.13 (validation)

---

## Sprint 39A Research Deliverables

- [docs/research/39_1_short_covering_and_whale_intent.md](../../docs/research/39_1_short_covering_and_whale_intent.md)
- [docs/research/39_2_strategy_selection_decision_matrix.md](../../docs/research/39_2_strategy_selection_decision_matrix.md)
