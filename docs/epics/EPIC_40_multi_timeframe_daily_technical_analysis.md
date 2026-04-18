# Epic 40: Multi-Timeframe Daily Technical Analysis & Pattern Visualization

> **Status:** � IN PROGRESS — Sprint 40A-C implemented (Approaches A + B)  
> **Priority:** P1 — High (deep dive analysis lacks intraday granularity and per-timeframe browsing; users cannot assess short-term pattern setups)  
> **Created:** 2026-04-09  
> **Depends on:** Indicator pattern detection (Epic 38), deep dive pipeline (`llm-analyzer.ts`), market-fetcher (`market-fetcher.ts`), TechnicalChart component

## Problem Statement

The deep dive analysis currently computes indicator patterns across 5 timeframes (1W, 1M, 3M, 6M, 1Y) but:

1. **No intraday (1D) timeframe** — the system takes hourly candles for 1W and daily candles for everything else. There's no 5-minute or 15-minute candle data for same-day pattern detection. Users cannot see what happened today.

2. **No per-timeframe UI navigation** — all timeframe patterns are collapsed into a single deep dive output. Users have to read the full analysis to find patterns for a specific horizon. There is no time selector to switch between 1D, 1W, 1M, 3M, 6M, 1Y views.

3. **Pattern drawings are static** — the `TechnicalChart` component renders patterns with `drawing_type` (trendline, channel, spike_region, marker) but is locked to whatever candle data was fetched for the chart. It cannot switch between timeframe views with their respective patterns.

4. **Deep dives refresh on a 4-hour dedup cycle** — for the 1D timeframe, this means the intraday analysis could be stale by half the trading day. The 1D view should refresh more frequently.

5. **No isolation of short-term noise from macro recommendations** — if 1D patterns are added, they must NOT influence trade recommendations, which should remain grounded in the macro trend (1M+ timeframes).

### Current Data Flow

```
fetchHistoricalData(ticker, "1wk")  → hourly candles  → detectIndicatorPatterns → timeframe_patterns["1W"]
fetchHistoricalData(ticker, "1mo")  → daily candles    → detectIndicatorPatterns → timeframe_patterns["1M"]
fetchHistoricalData(ticker, "3mo")  → daily candles    → detectIndicatorPatterns → timeframe_patterns["3M"]
fetchHistoricalData(ticker, "6mo")  → daily candles    → detectIndicatorPatterns → timeframe_patterns["6M"]
fetchHistoricalData(ticker, "1y")   → daily candles    → detectIndicatorPatterns → timeframe_patterns["1Y"]
↓
All 5 go into the deep dive LLM prompt → LLM returns unified analysis
```

### Missing

```
fetchHistoricalData(ticker, "1d")   → 5-min candles    → detectIndicatorPatterns → timeframe_patterns["1D"]  ← DOES NOT EXIST
```

## Goal

Add a complete 1D intraday technical analysis layer with a 6-timeframe selector in the deep dive UI, so users can browse pattern drawings and analysis per timeframe. The 1D analysis must be excluded from trade recommendations to avoid skewing the macro-trend algorithm.

### Success Criteria

1. Users see a **timeframe selector** (1D | 1W | 1M | 3M | 6M | 1Y) on every deep dive
2. Each timeframe shows its own **chart with pattern drawings** (trendlines, channels, markers) overlaid on the correct candle data
3. The **1D timeframe** uses 5-minute candles and refreshes every pipeline cycle during market hours
4. The **1D analysis is excluded** from the recommendation prompt — only 1M+ patterns feed into trade recommendations
5. LLM deep dive narrative includes 1D context for **educational purposes** but explicitly labels it as "short-term noise" when contradicting the macro trend

---

## OpenRouter Cost Impact Analysis

### Current Model & Pricing

|                        | Value                             |
| ---------------------- | --------------------------------- |
| **Model**              | `moonshotai/kimi-k2.5`            |
| **Input price**        | $0.405/M tokens                   |
| **Output price**       | $2.40/M tokens                    |
| **Pipeline frequency** | Every 10 minutes (144 cycles/day) |
| **Deep dive dedup**    | 4-hour cooldown per ticker        |

### Current Daily LLM Cost Estimate

| Call Type      | Calls/Day | Avg Input Tokens | Avg Output Tokens | Daily Cost                  |
| -------------- | --------- | ---------------- | ----------------- | --------------------------- |
| classifyNews   | ~20       | 4,000            | 4,000             | $0.22                       |
| crossReference | ~6        | 8,000            | 11,000            | $0.18                       |
| recommendation | ~15       | 5,000            | 3,000             | $0.14                       |
| deepDive       | ~30       | 6,500            | 6,500             | $0.54                       |
| simTradeEval   | ~15       | 3,000            | 2,000             | $0.09                       |
| **TOTAL**      |           |                  |                   | **~$1.17/day (~$35/month)** |

### Proposed Cost Impact — Three Approaches

#### Approach A: Compute-Only (Recommended — Cheapest)

Add 1D intraday candle fetching + local `detectIndicatorPatterns()` computation. No additional LLM calls. The existing deep dive prompt grows by ~500-1K tokens to include 1D patterns.

| Change                                                   | Cost Impact                   |
| -------------------------------------------------------- | ----------------------------- |
| Yahoo Finance intraday API call (1 per ticker per cycle) | Free (yf.chart)               |
| Local indicator computation on 5-min candles             | Free (CPU only)               |
| Deep dive prompt grows ~800 tokens                       | +$0.0003 per deep dive        |
| **Daily increase**                                       | **~$0.01/day (+$0.30/month)** |

**Total with Approach A: ~$1.18/day (~$35.30/month)**

#### Approach B: Hybrid — Lightweight Daily Snapshot (Balanced)

Same as Approach A, plus a separate lightweight LLM call per ticker per day that generates a 1D-specific narrative and entry/exit zones based on intraday patterns.

| Change                                                 | Cost Impact                       |
| ------------------------------------------------------ | --------------------------------- |
| Everything from Approach A                             | +$0.01/day                        |
| Daily 1D snapshot LLM call: ~2K in, ~2K out per ticker | $0.006/call                       |
| ~15-20 tickers × 1 call/day                            | +$0.09-0.12/day                   |
| **Daily increase**                                     | **~$0.10-0.13/day (+$3-4/month)** |

**Total with Approach B: ~$1.27-1.30/day (~$38-39/month)**

#### Approach C: Full Refresh — Per-Timeframe LLM Analysis (Most Expensive)

Separate LLM call for each of the 6 timeframes per ticker, refreshing every 30 minutes during market hours for the 1D view.

| Change                                              | Cost Impact                    |
| --------------------------------------------------- | ------------------------------ |
| 1D refresh every 30 min × 15 tickers × 13 refreshes | 195 calls × $0.006 = $1.17/day |
| Other timeframes daily refresh × 15 tickers × 5 TFs | 75 calls × $0.006 = $0.45/day  |
| **Daily increase**                                  | **~$1.62/day (+$49/month)**    |

**Total with Approach C: ~$2.79/day (~$84/month) — 2.4× current cost**

### Recommendation

**Start with Approach A** (compute-only). The existing indicator pattern detection is already robust with 5 core indicators and 6 combination patterns. The per-timeframe UI just needs to display the locally-computed patterns with chart overlays. Reassess after seeing user engagement — if the 1D view gets heavy use and users want narrative interpretation, graduate to Approach B.

---

## Sprint 40A — Research & Design

### Story 40.1 — Research: Intraday Data Availability & Candle Granularity

#### Goal

Determine the optimal intraday candle interval for the 1D technical analysis, validate data availability from Yahoo Finance, and identify any rate-limit or data-quality risks.

#### Research Questions

1. **Yahoo Finance intraday intervals**: What intervals does `yf.chart()` support for intraday data? (1m, 2m, 5m, 15m, 30m, 60m) What are the lookback limits for each? (e.g., 1m candles only available for 7 days, 5m for 60 days)

2. **Optimal interval for pattern detection**: 5-minute candles produce ~78 data points per trading day (6.5 hours). Is this sufficient for `detectIndicatorPatterns()` to compute meaningful EMAs, RSI, MACD, and Bollinger Bands? What's the minimum candle count needed per indicator?

3. **Pre-market and after-hours data**: Does Yahoo Finance include pre/post market candles? Should the 1D analysis include extended hours (4:00-9:30 AM, 4:00-8:00 PM) or only regular trading hours? Impact on pattern quality.

4. **API rate limits**: Current pipeline fetches 5 timeframes per deep-dive ticker. Adding a 6th intraday fetch per cycle (every 10 min) for ~15-20 tickers — does this exceed Yahoo Finance's undocumented rate limits? What's the observed throttle threshold?

5. **Candle data freshness**: How delayed is Yahoo Finance intraday data? Real-time, 15-min delayed, or end-of-day? Does this vary by market (NYSE vs NASDAQ)?

6. **Weekend/holiday handling**: When markets are closed, should the 1D view show the last trading day's intraday data, or collapse to the 1W view?

#### Deliverables

- Research document: `docs/research/40_1_intraday_data_availability.md`
- Recommendation for candle interval (5m vs 15m)
- Rate limit safety margin calculation
- Weekend/holiday fallback strategy

#### Acceptance Criteria

- [ ] Yahoo Finance intraday interval capabilities documented with lookback limits
- [ ] Minimum candle count for each indicator validated (EMA-9 needs ≥9, EMA-21 needs ≥21, RSI needs ≥14, MACD needs ≥26, Bollinger needs ≥20)
- [ ] Rate limit risk assessment: current API calls/cycle + new intraday calls ≤ safe threshold
- [ ] Extended hours recommendation with rationale
- [ ] Delay/freshness for intraday data confirmed (real-time vs 15-min)

---

### Story 40.2 — Research: Per-Timeframe Pattern Storage & Schema Design

#### Goal

Design the data model for storing per-timeframe indicator patterns and chart overlays independently from the deep dive analysis, so they can be queried/displayed without loading the full deep dive.

#### Research Questions

1. **Current storage model**: Deep dives store `timeframe_patterns` as a nested JSON object inside the `output` column of the `analyses` table. Is this sufficient for per-timeframe queries, or do we need a separate table?

2. **Schema options**:
   - **Option A**: Keep patterns in the deep dive `output` JSON, add a new `technical_snapshots` table for the 1D intraday-only snapshots
   - **Option B**: New `technical_patterns` table keyed by `(ticker, timeframe, created_at)` — all 6 timeframes stored independently
   - **Option C**: Keep everything in the existing `analyses` table with a new `type: "technical_snapshot"` and filter by metadata

3. **Candle storage**: Should the raw candle data be stored in the DB (for chart rendering without re-fetching), or fetched on-demand from Yahoo Finance for each chart view? Tradeoffs: DB size vs API calls vs latency.

4. **Retention policy**: How long to keep per-timeframe snapshots? The 1D snapshot is useless after the next trading day. The 1W snapshot is useless after the next week. Propose a TTL per timeframe.

5. **Chart overlay data format**: The `TechnicalPattern` type already has `drawing_type`, `start_time/end_time`, `start_price/end_price`. Is this sufficient for all pattern visualizations, or do we need additional fields for intraday (e.g., intra-candle markers)?

#### Deliverables

- Schema design document: `docs/research/40_2_timeframe_pattern_storage.md`
- Recommended schema option with rationale
- Retention policy per timeframe
- Migration plan (if new table needed)

#### Acceptance Criteria

- [ ] At least 3 schema options evaluated with pros/cons
- [ ] Storage size estimate per ticker per day (patterns + optional candle data)
- [ ] Retention policy defined (1D: 1 day, 1W: 7 days, 1M: 30 days, etc.)
- [ ] Decision on candle data caching strategy (DB vs on-demand)

---

### Story 40.3 — Research: 1D Signal Isolation from Recommendation Engine

#### Goal

Document the exact code paths where patterns flow into the recommendation prompt and design the isolation mechanism to ensure 1D patterns never influence trade recommendations while still appearing in deep dives and the UI.

#### Research Questions

1. **Current pattern flow to recommendations**: In `analysis-pipeline.ts`, which timeframe patterns are included in the `generateRecommendation()` call? (Currently only 3M — but Sprint 39B added multi-timeframe. Verify the current state.)

2. **Isolation strategies**:
   - **Strategy A**: Filter at the pipeline level — `analysis-pipeline.ts` simply doesn't pass 1D patterns to the recommendation function
   - **Strategy B**: Filter at the prompt level — the system prompt instructs the LLM to ignore 1D patterns for directional decisions
   - **Strategy C**: Separate storage — 1D patterns stored in a different field/table, never queried by the recommendation stage

3. **Deep dive inclusion**: The deep dive SHOULD see 1D patterns for educational analysis. How should the deep dive prompt frame 1D data? ("These are intraday patterns for context; the macro direction is determined by the longer timeframes.")

4. **Recommendation validation**: How to verify that 1D patterns don't leak into recommendations? Propose a test strategy (e.g., unit test that asserts the recommendation prompt does not contain "1D" or "intraday" pattern data).

5. **Edge case — 1D confirms macro**: When 1D patterns align with the 1M+ trend, should they boost confidence? Or should 1D be completely firewalled from recommendations regardless?

#### Deliverables

- Research document: `docs/research/40_3_1d_signal_isolation.md`
- Recommended isolation strategy with implementation sketch
- Test plan for verification

#### Acceptance Criteria

- [ ] Current recommendation pattern flow documented (which timeframes, which code paths)
- [ ] Isolation strategy selected with rationale
- [ ] Deep dive prompt framing for 1D patterns drafted
- [ ] Test cases defined to prevent 1D leakage into recommendations
- [ ] Edge case policy documented (1D-confirms-macro: boost or firewall?)

---

### Story 40.4 — Research: Timeframe Selector UI & Chart Architecture

#### Goal

Design the UI timeframe selector and chart switching mechanism for the deep dive view, accounting for different candle granularities, pattern overlays, and responsive layout.

#### Research Questions

1. **Current TechnicalChart component**: What does `TechnicalChart.tsx` currently accept as props? How does it render pattern overlays? Can it accept different candle arrays and switch between them?

2. **Chart library capabilities**: The project uses lightweight-charts (or similar). Does the chart library support:
   - Switching candle data sets without full re-render?
   - Multiple timeframe overlays simultaneously?
   - Intraday time axis formatting (HH:MM vs YYYY-MM-DD)?

3. **Timeframe selector design**: Tab bar, dropdown, or segmented control? How do similar platforms (TradingView, thinkorswim) present multi-timeframe selectors? Where should it sit relative to the chart and pattern summary?

4. **Loading states**: When switching timeframes, should the chart show a loading skeleton while fetching/computing new data? Or should all timeframes be pre-fetched?

5. **Mobile responsiveness**: The current deep dive panel is already dense. How does the timeframe selector fit on mobile viewports?

6. **Pattern summary per timeframe**: Below the chart, should there be a condensed "Signals for this timeframe" panel showing the detected patterns, their confidence, and drawing type?

#### Deliverables

- UI mockup description / wireframe notes: `docs/research/40_4_timeframe_selector_ui.md`
- Chart component modification plan
- Data flow: API → chart component → pattern overlay

#### Acceptance Criteria

- [ ] TechnicalChart component capabilities documented (what it can/can't do today)
- [ ] Timeframe selector UX pattern selected with rationale
- [ ] Candle data switching strategy defined (pre-fetch all vs lazy load)
- [ ] Mobile layout plan
- [ ] Pattern summary panel wireframe described

---

## Sprint 40B — Infrastructure (Planned)

### Story 40.5 — Add 1D Intraday Data Fetching

- Add `"1d"` period to `fetchHistoricalData()` with 5-minute interval
- Handle pre/post market exclusion per research findings
- API budget tracking for intraday calls
- Cache intraday candles per ticker per pipeline cycle

### Story 40.6 — Run Indicator Patterns on 1D Data

- Call `detectIndicatorPatterns()` on 5-minute candle array
- Validate minimum candle count per indicator
- Store result in `timeframe_patterns["1D"]`
- Handle partial trading day (pipeline runs mid-day)

### Story 40.7 — Exclude 1D Patterns from Recommendation Prompt

- Implement isolation strategy from Story 40.3 findings
- Unit test asserting 1D patterns never appear in recommendation prompt input
- Deep dive prompt updated to frame 1D as "intraday context"

---

## Sprint 40C — UI (Planned)

### Story 40.8 — Timeframe Selector Component

- Segmented control / tab bar with 1D | 1W | 1M | 3M | 6M | 1Y
- State management for selected timeframe
- Loading state per timeframe

### Story 40.9 — Chart Switching with Pattern Overlays

- TechnicalChart accepts timeframe-specific candle data + patterns
- Correct time axis formatting per timeframe (HH:MM for 1D, dates for others)
- Pattern drawings render per selected timeframe

### Story 40.10 — Per-Timeframe Pattern Summary Panel

- Condensed signal summary below chart for the selected timeframe
- Indicator badges (EMA, RSI, MACD, BB, Volume) with bullish/bearish coloring
- Combination patterns highlighted when detected

---

## Sprint 40D — Polish & Optimization (Planned)

### Story 40.11 — 1D Refresh Cadence During Market Hours

- During market hours: 1D patterns refresh every pipeline cycle (10 min)
- After hours: 1D shows last trading day's data (no refresh)
- Weekend: 1D falls back to Friday's intraday data with "Market Closed" badge

### Story 40.12 — Retention & Cleanup

- Implement TTL-based cleanup for per-timeframe snapshots
- 1D snapshots: keep 1 trading day
- 1W snapshots: keep 7 days
- 1M+ snapshots: keep 30 days (or until next deep dive overwrites)
