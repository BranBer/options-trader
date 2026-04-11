# Epic 46 — Deep Dive Data Gaps: Liquidity, Volume Profile, Options Depth, Catalysts & Signal Quality

## Motivation

The deep dive analysis report (web + PDF) provides a solid directional thesis but falls short on the **actionable data** that determines whether a trade actually works in the 1–2 week window most whale trades target. Specifically:

1. Support/resistance levels are LLM-inferred, not anchored to where volume actually traded
2. No volume profile — can't distinguish a price level that will hold from one that will slice through
3. Options data has OI walls and GEX but lacks strike-level open interest context and gamma concentration depth
4. Catalyst awareness is limited to earnings proximity and FOMC — no broader economic calendar
5. Technical indicators (EMA, RSI, MACD) are presented as primary signals rather than lagging confirmations

### What We Already Have

| Data                                      | Source                           | Status                                 |
| ----------------------------------------- | -------------------------------- | -------------------------------------- |
| OI walls (top 3 call/put concentrations)  | `analyzeOptionsChain()`          | ✅ Computed                            |
| Max pain                                  | `analyzeOptionsChain()`          | ✅ Computed                            |
| GEX net + flip level + dealer positioning | `computeGEX()`                   | ✅ Computed                            |
| GEX top 3 concentrations by strike        | `computeGEX()`                   | ✅ Computed                            |
| IV-RV spread                              | `buildRichOptionsChainSummary()` | ✅ Computed                            |
| Short interest (% float, days to cover)   | DB + prompt injection            | ✅ Available                           |
| Earnings proximity + IV crush risk        | `getEarningsProximity()`         | ✅ Available                           |
| FOMC decision week                        | `getFOMCProximity()`             | ✅ Available (hardcoded 2026 calendar) |
| Cascade context (upstream earnings)       | `cascadeContext`                 | ✅ Available                           |
| VWAP                                      | `vwap()` in technical-indicators | ✅ Computed, not surfaced in report    |
| Support/resistance                        | LLM-generated                    | ⚠️ No algorithmic anchor               |
| Volume profile                            | —                                | ❌ Not implemented                     |
| Economic calendar beyond FOMC             | —                                | ❌ Not implemented                     |
| OI trend (rolling)                        | —                                | ❌ Static snapshot only                |
| IV skew / term structure                  | —                                | ❌ Not implemented                     |

### Core Questions

| #   | Question                                                                     | Story |
| --- | ---------------------------------------------------------------------------- | ----- |
| 1   | Can we build actionable volume profile data from existing candle history?    | 46.1  |
| 2   | What algorithmic S/R methods add value over pure LLM inference?              | 46.2  |
| 3   | How can we surface OI, GEX, and gamma depth more effectively?                | 46.3  |
| 4   | What catalyst data sources are available and worth integrating?              | 46.4  |
| 5   | How should indicators be repositioned from primary signals to confirmations? | 46.5  |

---

## Phase 1 — Research

### Story 46.1 — Research: Volume Profile from Candle Data

**Status: Not Started**

#### Goal

Determine whether meaningful volume-at-price profile data can be derived from existing OHLCV candle history, and design the computation.

#### Research Questions

1. **Volume bucketing algorithm** — Given OHLCV candles, how should volume be distributed across price levels? Common approaches:
   - Uniform distribution across candle range (open–close or high–low)
   - Proportional to typical price weighting
   - Bar-splitting with configurable bucket size (e.g., $0.50 increments)

2. **Key outputs** — What metrics should we compute?
   - **VPOC** (Volume Point of Control): Price level with highest traded volume
   - **Value Area High / Low**: The 70% range encompassing the most volume
   - **High Volume Nodes (HVN)**: Price clusters with significant volume — these act as magnets
   - **Low Volume Nodes (LVN)**: Price gaps where volume is thin — price moves quickly through these

3. **Timeframe granularity** — What makes sense per chart period?
   - 1D (5-min candles): Session profile — where did today's volume concentrate?
   - 1W (1-hour candles): Weekly profile — developing value area
   - 1M+ (daily candles): Composite profile — where has the most volume traded over weeks/months?

4. **Bucket size selection** — Should we auto-compute based on ATR, use a fixed percentage of price, or let it vary by timeframe?

5. **Integration** — Where does this data surface?
   - LLM prompt context (text summary of VPOC, value area, key nodes)
   - Chart visualization (horizontal volume bars on price axis)
   - PDF report (value area range + key levels table)

6. **Performance** — Can this be computed client-side for charting, or should it be pre-computed server-side for the LLM prompt?

#### Deliverables

- [ ] Algorithm specification for volume-at-price bucketing
- [ ] Decision on bucket sizing strategy
- [ ] Mockup of LLM prompt injection format
- [ ] Decision on chart visualization approach (if any)

---

### Story 46.2 — Research: Algorithmic Support/Resistance Anchoring

**Status: Not Started**

#### Goal

Evaluate algorithmic S/R methods that can anchor or validate the LLM's visually-inferred levels, giving users confidence that a support level is backed by actual defended price action — not just chart pattern recognition.

#### Current State

- S/R levels are 100% LLM-generated from candle data
- The prompt instructs: "based on actual price action (recent highs/lows, volume clusters)"
- No algorithmic validation — the LLM may hallucinate levels or miss subtle ones
- OI walls (from options chain) already provide options-derived support/resistance but are separate from the S/R section

#### Research Questions

1. **Swing high/low detection** — Can we algorithmically identify significant pivot highs and lows?
   - Williams fractals (N-bar high/low)
   - ATR-filtered pivots (ignore noise below ATR threshold)
   - Recency weighting (recent pivots matter more than old ones)

2. **Volume-validated levels** — If Story 46.1 produces volume profile data, can we cross-reference: "This support at $232 also happens to be a high volume node" → stronger conviction?

3. **Confluence scoring** — Can multiple signals reinforce a level?
   - Price pivot + volume node + OI wall + VWAP = very strong
   - Price pivot alone = moderate
   - Format: strength score (1–5) with contributing factors listed

4. **Level state tracking** — Should we track whether a level has been:
   - Tested (approached and bounced)
   - Broken (traded through)
   - Reclaimed (broken then recovered)
     This changes whether it's support, resistance, or invalidated.

5. **Integration with LLM** — Best approach:
   - **Option A**: Compute levels algorithmically, pass to LLM as "anchored levels," let LLM add context/interpretation
   - **Option B**: Compute levels independently, show alongside LLM levels, let user compare
   - **Option C**: Use algorithmic levels as validation — flag when LLM level doesn't align with any data-derived level

6. **OI wall unification** — Should options-derived S/R (OI walls, max pain, GEX flip) be merged into the same support/resistance display rather than being separate sections?

#### Deliverables

- [ ] Recommendation on pivot detection algorithm
- [ ] Confluence scoring design
- [ ] Decision on LLM integration approach (A/B/C)
- [ ] Decision on whether to unify OI-derived levels into S/R

---

### Story 46.3 — Research: Options Depth & Dealer Positioning Improvements

**Status: Not Started**

#### Goal

Evaluate what additional options intelligence can be surfaced from data we already fetch, and what new data sources would be needed for dealer positioning context.

#### Current State

We already compute and pass to the LLM:

- Max pain + OI walls (top 3 call/put OI concentrations)
- Full GEX with flip level, net exposure, dealer positioning label, top 3 gamma concentrations
- IV-RV spread with interpretation
- Nearest expiry chain: strike, bid/ask, volume, OI, IV, delta, gamma, theta

#### Research Questions

1. **OI by strike visualization** — We have the raw OI data per strike. Should we:
   - Show a histogram/bar chart (call OI vs put OI by strike) in the report?
   - Compute "call wall at $X, put wall at $Y" with distance-from-current context?
   - We already compute OI walls — is the issue that they're not visually prominent enough in the report?

2. **Gamma concentration depth** — We compute a single GEX flip level. Could we:
   - Show per-strike gamma as a chart overlay showing where dealer hedging pressure creates "walls"?
   - Identify gamma "clusters" (ranges of strikes where gamma is concentrated) vs single flip point?
   - Compute the "negative gamma zone" range where price acceleration is expected?

3. **OI change tracking** — Current data is a single snapshot. Could we:
   - Store daily OI snapshots and show the delta (new positions being opened/closed)?
   - This would reveal: "100K new calls opened at $250 strike in the last 3 days" = strong directional bet
   - Data source: Same Yahoo Finance API, just need historical snapshots stored in DB

4. **IV skew analysis** — We have IV per option. Could we derive:
   - Put-call skew (comparing OTM put IV vs OTM call IV) — directional fear/greed signal
   - Term structure (near-month vs far-month IV) — event pricing signal
   - Skew changes over time (if we store snapshots)

5. **Summary for LLM** — Currently the LLM gets raw option chain rows. Would a pre-computed summary be better?
   - "Dealers are long gamma above $240 (dampened moves expected) and short gamma below $235 (trending/acceleration risk)"
   - "Put skew at 3.2 vol points — elevated fear pricing on downside"
   - "OI build at $250C suggests strong target/resistance"

6. **Feasibility** — What requires new data sources vs just better analysis of existing data?
   - Existing data: OI histogram, gamma clusters, skew computation, better LLM summary
   - New data needed: OI change tracking (daily snapshots), intraday order flow
   - Not feasible with current sources: True dealer positioning (requires CBOE data or broker feeds)

#### Deliverables

- [ ] Inventory: what can be derived from existing chain data today
- [ ] Design for OI histogram / gamma depth visualization
- [ ] Decision on OI snapshot storage for change tracking
- [ ] Decision on IV skew computation
- [ ] Updated LLM prompt format for richer options context

---

### Story 46.4 — Research: Catalyst & Event Calendar Integration

**Status: Not Started**

#### Goal

Determine what catalyst/event data sources are available, and design a practical catalyst awareness layer for the 1–2 week trade horizon.

#### Current State

- Earnings proximity via Yahoo Finance (date + EPS history)
- IV crush risk computed from days-to-earnings
- FOMC dates hardcoded for 2026
- No economic data releases (CPI, PPI, jobs, retail sales)
- No Fed speaker schedule
- No sector-specific catalyst tracking

#### Research Questions

1. **Economic calendar data sources** — What free/cheap APIs provide:
   - US economic release schedule (CPI, nonfarm payrolls, retail sales, PMI, GDP)?
   - Central bank meeting dates beyond FOMC (ECB, BOE, BOJ for global context)?
   - Options: Trading Economics API, FRED calendar, Finnhub economic calendar, Alpha Vantage

2. **Earnings calendar expansion** — Current approach uses `yf.quoteSummary` for the single ticker's earnings date. Could we also:
   - Get sector-peer earnings dates (if NVDA reports next week, that moves the whole chip sector)
   - Integrate the existing cascade context more tightly (we have `cascadeContext` but it's underutilized)

3. **Relevance scoring** — Not every economic release matters for every trade. How to filter:
   - **High impact for all**: CPI, FOMC, NFP
   - **Sector-weighted**: Retail sales matters for consumer stocks, housing starts for homebuilders
   - **Proximity filter**: Only show events within the trade's expected holding period (1–2 weeks from entry)

4. **Integration format** — Where should catalyst data appear?
   - **LLM prompt**: "WARNING: CPI report on [date], 3 days before recommended expiry. Historical IV spike of 15% around CPI for this sector."
   - **Report section**: Dedicated "Upcoming Catalysts" table with date, event, expected impact
   - **Chart overlay**: Vertical markers on chart at event dates (simple)
   - **Risk score adjustment**: Auto-flag if a high-impact event falls within the trade window

5. **Maintenance burden** — FOMC dates are already hardcoded. What's the maintenance cost of:
   - Hardcoded annual economic calendar (low frequency, known dates like CPI schedule)
   - API-sourced live calendar (zero maintenance but adds a dependency)
   - Hybrid: Hardcode major recurring events, API for earnings

#### Deliverables

- [ ] Catalog of available economic calendar APIs (free tier)
- [ ] Recommendation on data source
- [ ] Design for catalyst relevance scoring
- [ ] Mockup of catalyst integration in report + prompt

---

### Story 46.5 — Research: Indicator Signal Hierarchy & Presentation

**Status: Not Started**

#### Goal

Evaluate how to reposition technical indicators (EMA, RSI, MACD, Bollinger Bands) from implied primary entry signals to **lagging confirmations**, and determine what should replace them as primary signals.

#### Current State

- Indicator patterns (EMA cross, RSI overbought/oversold, MACD crossover, BB breakout) are detected via `detectIndicatorPatterns()`
- They appear with equal visual weight alongside AI-detected patterns in the chart and PDF report
- The deep dive prompt characterizes 1D indicators as "educational context only / short-term noise"
- However, the report presentation doesn't make this hierarchy clear — all patterns look equal

#### Research Questions

1. **Signal taxonomy** — Can we categorize signals into tiers?
   - **Tier 1 — Primary (actionable)**: Price action at key levels, volume confirmation, options flow (OI walls, GEX), catalysts
   - **Tier 2 — Confirming (supporting)**: MACD direction, RSI range, EMA alignment
   - **Tier 3 — Context (background)**: Bollinger width, volume MA trend, VIX level
   - Should the LLM prompt explicitly use this hierarchy?

2. **Presentation changes** — How to visually differentiate signal tiers:
   - **Separate sections**: "Key Signals" vs "Confirming Indicators" vs "Background Context"
   - **Confidence weighting**: Apply a display penalty — indicator-only patterns show lower confidence?
   - **Chart layering**: Primary signals prominent, confirmations muted/optional
   - **PDF restructure**: Lead with price levels + options context, indicators in a secondary section

3. **LLM prompt restructuring** — Currently all indicator patterns are injected equally. Should we:
   - Move indicator data to a "Confirmation Signals" section of the prompt?
   - Explicitly instruct: "Do NOT base entry/exit levels on indicator crossovers alone. Use them only to confirm price-action-derived levels."
   - Weight the LLM's confidence output: Entry based on indicator alone = capped at lower confidence?

4. **What replaces indicators as primary?** — If indicators become confirmations, what are the primary signals?
   - This likely depends on Stories 46.1–46.4: volume profile levels, algorithmic S/R, options positioning, catalysts
   - Interim: Can the LLM be better instructed to prioritize price action + options context even without new data?

5. **Backward compatibility** — Changing indicator prominence affects:
   - Chart overlay numbering and legend
   - PDF pattern table ordering
   - Confidence scores displayed to users
   - Users who currently use indicators as their primary reference

#### Deliverables

- [ ] Signal tier taxonomy design
- [ ] Report presentation mockup (web + PDF) showing hierarchy
- [ ] LLM prompt restructuring proposal
- [ ] Decision on whether to implement before or after 46.1–46.4

---

## Phase 2 — Implementation

Implementation stories will be scoped after Phase 1 research is complete. Expected outcomes:

- **46.1 findings** → Volume profile computation + chart/report integration stories
- **46.2 findings** → Algorithmic S/R engine + confluence scoring stories
- **46.3 findings** → Options depth visualization + OI tracking stories
- **46.4 findings** → Catalyst calendar integration + risk scoring stories
- **46.5 findings** → Report restructuring + prompt hierarchy stories

Dependencies between stories:

- 46.5 (signal hierarchy) depends on findings from 46.1–46.4 (what becomes primary)
- 46.2 (S/R anchoring) benefits from 46.1 (volume profile) for confluence scoring
- 46.3 (options depth) and 46.4 (catalysts) are independent of each other
