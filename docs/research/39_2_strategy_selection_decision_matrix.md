# Story 39.2 Research: Options Strategy Selection Based on Signal Regime

> **Sprint:** 39A  
> **Status:** Complete  
> **Date:** 2026-04-10

---

## 1. IV Regime → Strategy Selection Matrix

The single most important factor in strategy selection is whether options are expensive (high IV) or cheap (low IV). An IV-unaware recommendation engine will consistently mis-select strategies.

### IV Rank Thresholds

| IV Rank | Regime          | Options Are...                       | Premium Strategy                     |
| ------- | --------------- | ------------------------------------ | ------------------------------------ |
| 0-30    | **Low IV**      | Cheap — underpriced vs historical    | **Buy premium** (debit strategies)   |
| 30-50   | **Normal-Low**  | Fair — slight buyer edge             | Debit or neutral                     |
| 50-70   | **Normal-High** | Fair — slight seller edge            | Credit or neutral                    |
| 70-100  | **High IV**     | Expensive — overpriced vs historical | **Sell premium** (credit strategies) |

### Strategy Map by IV Regime

| IV Regime               | Bullish                             | Bearish                             | Neutral/Rangebound           | High Uncertainty                      |
| ----------------------- | ----------------------------------- | ----------------------------------- | ---------------------------- | ------------------------------------- |
| **High IV (>70)**       | Bull put spread (credit)            | Bear call spread (credit)           | Iron condor, Iron butterfly  | Short strangle (defined-risk variant) |
| **Normal-High (50-70)** | Bull put spread or bull call spread | Bear put spread or bear call spread | Iron condor (wide wings)     | Calendar spread                       |
| **Normal-Low (30-50)**  | Bull call spread (debit)            | Bear put spread (debit)             | Butterfly spread             | Long straddle (if catalyst expected)  |
| **Low IV (<30)**        | Long calls, Bull call spread        | Long puts, Bear put spread          | Long straddle, Long strangle | Long straddle/strangle                |

### Key Principle

- **High IV → sell premium**: Time decay (theta) works in your favor. Credit spreads, iron condors, short verticals.
- **Low IV → buy premium**: Options are cheap; IV expansion benefits long positions. Debit spreads, long calls/puts, straddles.
- **Never buy naked options in high IV**: The IV crush alone will destroy the position even if direction is correct.
- **Never sell premium in low IV**: Minimal premium collected; risk/reward unfavorable.

### IV-RV Spread Refinement

The pipeline already computes `ivRvSpread` (implied vol - realized vol). This provides a second check:

| IV-RV Spread | Interpretation                                   | Reinforces            |
| ------------ | ------------------------------------------------ | --------------------- |
| > +10%       | Options significantly overpriced vs actual moves | Sell premium (credit) |
| +5% to +10%  | Mildly overpriced                                | Slight credit bias    |
| -5% to +5%   | Fairly priced                                    | Use IV rank alone     |
| < -5%        | Options underpriced vs actual moves              | Buy premium (debit)   |

---

## 2. Signal Alignment Matrix

### Input Signals (Available in Pipeline)

| Signal Source           | Current Status            | Values                                              |
| ----------------------- | ------------------------- | --------------------------------------------------- |
| Whale direction         | ✅ Available              | Bullish (calls) / Bearish (puts)                    |
| Whale intent            | 🟡 Stored but hidden      | speculative / institutional / hedge / unknown       |
| Technical patterns (1W) | ❌ Only 3M today          | Bullish % / Bearish % / Neutral %                   |
| Technical patterns (1M) | ❌ Only 3M today          | Bullish % / Bearish % / Neutral %                   |
| Technical patterns (3M) | ✅ Available              | Bullish % / Bearish % / Neutral %                   |
| Short interest          | ❌ Not fetched yet        | Low / Moderate / High / Extreme                     |
| IV rank                 | ❌ Always undefined       | 0-100 percentile                                    |
| GEX positioning         | ✅ Available (not in rec) | Long gamma / Short gamma / Neutral                  |
| P/C ratio               | ✅ Computed in deep dive  | Bullish (<0.7) / Neutral (0.7-1.3) / Bearish (>1.3) |
| Deep dive sentiment     | ✅ Available (not in rec) | Bullish / Bearish / Neutral + risk level            |
| VIX regime              | ✅ Available              | Low (<15) / Normal (15-25) / Elevated (>25)         |

### Directional Consensus Rules

Each signal source casts a "vote" with a weight:

```
Signal Weight Table (must sum to 100%):

Multi-timeframe technical consensus:  35%  (macro 20% + micro 15%)
  - 3M+ patterns (macro trend):       20%
  - 1W-1M patterns (micro/timing):    15%

Options microstructure:               25%
  - P/C ratio:                          8%
  - IV skew / IV-RV spread:            7%
  - GEX positioning:                    5%
  - OI walls / max pain:               5%

Deep dive risk assessment:            15%
  - Overall sentiment:                 10%
  - Risk level impact:                  5%

Macro context:                        10%
  - VIX regime:                         4%
  - FOMC proximity:                     3%
  - Earnings proximity:                 3%

Short interest & whale:               15%
  - Short interest level:               8%
  - Whale direction:                    7%
```

### Why Whale Direction Gets Only 7%

The whale trade is a **single data point** from an unknown actor with unknown motivations. It could be:

- Short covering (not a directional bet at all)
- One leg of a multi-leg strategy
- Portfolio rebalancing
- A losing trade (whales lose money too)

The system's value-add is using the whale as a **catalyst for analysis**, not as the **conclusion**. The whale tells us which ticker to analyze, not which direction to trade.

### Conflict Resolution Rules

| Scenario                | Technical (35%) | Options (25%) | Deep Dive (15%) | Macro (10%)      | SI+Whale (15%)       | Action                                                 |
| ----------------------- | --------------- | ------------- | --------------- | ---------------- | -------------------- | ------------------------------------------------------ |
| All aligned bullish     | Bullish         | Bullish       | Bullish         | Favorable        | Low SI + Bull whale  | **Strong bullish** — confidence 0.65-0.85              |
| All aligned bearish     | Bearish         | Bearish       | Bearish         | Unfavorable      | High SI + Bear whale | **Strong bearish** — confidence 0.65-0.85              |
| Tech vs whale conflict  | Bearish         | Bearish       | Bearish         | Neutral          | Low SI + Bull whale  | **Follow technicals (bearish)** — note whale disagrees |
| Short covering scenario | Bearish         | Mixed         | Bearish         | Neutral          | High SI + Bull whale | **Bearish or neutral** — flag short covering risk      |
| Deeply conflicted       | Mixed           | Mixed         | Neutral         | Neutral          | Any                  | **Stand aside** — confidence < 0.20                    |
| Macro override          | Mixed           | Mixed         | Mixed           | Very unfavorable | Any                  | **Reduce confidence** by 0.15, prefer defined-risk     |

---

## 3. Timeframe → Expiry Mapping

### Validated Mapping

| Dominant Signal Timeframe | Pattern Examples                                   | Suggested Expiry Range       | Rationale                            |
| ------------------------- | -------------------------------------------------- | ---------------------------- | ------------------------------------ |
| **1W** (micro)            | MACD crossover, RSI flip, BB squeeze break         | 5-14 calendar days           | Short-term momentum; theta-sensitive |
| **1M** (short-term)       | EMA cross (20/50), volume breakout, RSI divergence | 14-30 calendar days          | Swing trade timeframe                |
| **3M** (medium-term)      | EMA alignment (50/200), golden/death cross         | 30-60 calendar days          | Positional trade timeframe           |
| **6M** (macro)            | Major trend reversal, long-term divergence         | 60-90 calendar days          | Trend trade; needs time to develop   |
| **1Y** (ultra-macro)      | Secular trend turn, multi-year support/resistance  | 90-180 calendar days (LEAPS) | Long-term thesis                     |

### Dominant Timeframe Selection

When multiple timeframes have signals, the **dominant** timeframe is:

1. The timeframe with the **strongest confluences** (most patterns agreeing)
2. If tied, prefer the **longer timeframe** (macro > micro for direction, micro for timing)
3. If all timeframes agree → use the middle timeframe (1M or 3M) for expiry

### Interaction with Whale DTE

- If whale DTE and dominant signal timeframe agree: use signal timeframe
- If they disagree: **use signal timeframe** (signals > whale for expiry selection)
- Always note the disconnect in the thesis

---

## 4. Strategy Decision Tree

```
START
│
├─ Is IV rank available?
│   ├─ No → Default to defined-risk debit spreads (conservative)
│   └─ Yes → Continue
│
├─ IV Rank > 70 (High IV)?
│   ├─ Direction = Bullish → Bull Put Spread (credit)
│   ├─ Direction = Bearish → Bear Call Spread (credit)
│   ├─ Direction = Neutral → Iron Condor or Iron Butterfly
│   └─ Direction = Conflicted → Stand aside or Iron Condor (wide)
│
├─ IV Rank 50-70 (Normal-High)?
│   ├─ Direction = Bullish → Bull Put Spread OR Bull Call Spread
│   ├─ Direction = Bearish → Bear Call Spread OR Bear Put Spread
│   ├─ Direction = Neutral → Iron Condor (standard width)
│   └─ Direction = Conflicted → Calendar Spread or stand aside
│
├─ IV Rank 30-50 (Normal-Low)?
│   ├─ Direction = Bullish → Bull Call Spread (debit)
│   ├─ Direction = Bearish → Bear Put Spread (debit)
│   ├─ Direction = Neutral → Butterfly Spread
│   └─ Direction = Conflicted → Long Straddle (if catalyst expected)
│
└─ IV Rank < 30 (Low IV)?
    ├─ Direction = Bullish → Long Call or Bull Call Spread
    ├─ Direction = Bearish → Long Put or Bear Put Spread
    ├─ Direction = Neutral → Long Straddle or Long Strangle
    └─ Direction = Conflicted → Long Straddle (bet on vol expansion)
```

### GEX Modifier

GEX (Gamma Exposure) adjusts the strategy, not the direction:

| GEX Regime                      | Effect                                  | Strategy Adjustment                             |
| ------------------------------- | --------------------------------------- | ----------------------------------------------- |
| **Long gamma** (dealers long)   | Price tends to be pinned/mean-reverting | Favor credit spreads, iron condors (rangebound) |
| **Short gamma** (dealers short) | Price tends to have explosive moves     | Favor debit spreads, straddles (breakout)       |
| **Near flip level**             | Regime about to change                  | Widen stop-losses, reduce position size         |

### Short Interest Modifier

| SI Level + Whale Action    | Adjustment                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| High SI + whale buys calls | Add "short covering risk" note; reduce whale signal weight; if technicals bearish, stay bearish |
| High SI + price rising     | Add "squeeze potential" note; bullish acceleration possible                                     |
| High SI + price falling    | Shorts are winning; bearish confirmation                                                        |
| Extreme SI (>20%) + any    | Mandatory squeeze risk warning regardless of direction                                          |

---

## 5. "No Trade" / Stand Aside Criteria

The system should recommend **no trade** when:

### Primary Criteria (any one triggers stand-aside)

1. **Extreme signal conflict**: Bullish signals ≥ 4 AND bearish signals ≥ 4 (counting all sources)
2. **Very low confidence**: Computed confidence < 0.15 after all adjustments
3. **Insufficient data**: Missing >50% of signal sources (no chain, no patterns, no short interest)
4. **Earnings within 3 days**: Unless the recommendation is specifically an earnings play (straddle/strangle)
5. **Options chain too thin**: ATM bid-ask spread > 20% of mid-price (liquidity concern)

### Secondary Criteria (combination of 2+ triggers stand-aside)

1. **VIX > 35**: Extreme volatility regime — most strategies lose
2. **IV rank extreme (>90)**: Premium is very expensive; very hard to profit buying
3. **Short interest > 30% + unclear direction**: Too much short squeeze risk for directional bet
4. **FOMC same day**: Binary event with unlimited downside for directional bets

### Stand-Aside Output Format

When recommending no trade, the LLM should output:

```json
{
  "direction": "neutral",
  "confidence": 0.1,
  "thesis": "Stand aside — [reason]. Conflicting signals: [list]. No favorable risk/reward at current conditions.",
  "primary_strategy": {
    "name": "No Trade — Stand Aside",
    "legs": [],
    "max_profit": "N/A",
    "max_loss": "$0 (no position)",
    "breakeven": "N/A",
    "risk_reward_ratio": "N/A"
  }
}
```

---

## 6. Complete Strategy Catalog (8 Required Strategies)

The recommendation engine must be able to select from at least these 8 strategies:

| #   | Strategy                      | Direction        | IV Regime   | Max Risk              | Max Reward            | When to Use                               |
| --- | ----------------------------- | ---------------- | ----------- | --------------------- | --------------------- | ----------------------------------------- |
| 1   | **Bull Call Spread** (debit)  | Bullish          | Low-Normal  | Premium paid          | Strike diff - premium | Moderate bullish, cheap options           |
| 2   | **Bear Put Spread** (debit)   | Bearish          | Low-Normal  | Premium paid          | Strike diff - premium | Moderate bearish, cheap options           |
| 3   | **Bull Put Spread** (credit)  | Bullish          | Normal-High | Strike diff - premium | Premium received      | Moderate bullish, expensive options       |
| 4   | **Bear Call Spread** (credit) | Bearish          | Normal-High | Strike diff - premium | Premium received      | Moderate bearish, expensive options       |
| 5   | **Iron Condor**               | Neutral/Range    | High        | Wing width - premium  | Premium received      | Rangebound + long gamma                   |
| 6   | **Long Straddle**             | Volatile/Unknown | Low         | Premium paid          | Unlimited             | Catalyst expected + cheap options         |
| 7   | **Long Strangle**             | Volatile/Unknown | Low         | Premium paid          | Unlimited             | Big move expected + cheaper than straddle |
| 8   | **No Trade**                  | N/A              | Any         | $0                    | $0                    | Conflicted signals, no edge               |

### Strategies NOT Recommended by the System

- **Naked calls/puts**: Unlimited risk — not suitable for automated recommendations
- **Short straddles/strangles**: Undefined risk — requires active management
- **Calendar/diagonal spreads**: Require IV term structure analysis we don't currently compute
- **Butterfly spreads**: Too narrow profit zone for an automated system

---

## 7. Scope Adjustments for Sprints 39B-39E

### Sprint 39B Adjustments

| Story     | Original Scope                    | Revised Scope                                                                                  | Reason                                                                   |
| --------- | --------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 39.3      | Return `sharesShortPriorMonth`    | **Remove `sharesShortPriorMonth`**                                                             | Buggy in yahoo-finance2 — returns epoch date                             |
| 39.4      | Compute IV rank from chain        | **Also wire `marketData.ivRank` from DB**                                                      | `marketData.ivRank` may already be populated by `yf.quote()`             |
| 39.5      | Extract rich chain summary helper | **Unchanged** — code exists at lines 992-1025 of llm-analyzer.ts                               | Straightforward extraction                                               |
| 39.6      | Add GEX to rec prompt             | **Unchanged** — `chain.gex` already passed in `optionsAnalytics` but ignored by prompt builder | Just wire to prompt                                                      |
| NEW 39.6b | Wire `intentHint` to prompts      | **New micro-story**                                                                            | Quick win discovered — already stored in DB                              |
| 39.7      | Multi-timeframe patterns          | **Use existing `DEEP_DIVE_TIMEFRAME_CONFIG` pattern**                                          | Code at lines 970-989 of llm-analyzer.ts already does this for deep dive |

### Sprint 39C Adjustments

| Story | Original Scope     | Revised Scope                                      | Reason                                                     |
| ----- | ------------------ | -------------------------------------------------- | ---------------------------------------------------------- |
| 39.8  | Reorder pipeline   | **Unchanged but add fallback**                     | If deep dive fails, generate rec without deep dive summary |
| 39.9  | Wire SI to prompts | **Also wire expanded `WhaleIntentClassification`** | New classification depends on SI                           |

### Sprint 39D Adjustments

| Story | Original Scope              | Revised Scope                                  | Reason                                   |
| ----- | --------------------------- | ---------------------------------------------- | ---------------------------------------- |
| 39.10 | System instruction overhaul | **Use signal weight table from this research** | Whale at 7% weight, technicals at 35%    |
| 39.11 | Signal scorecard            | **Add `noTradeReasons` field**                 | Stand-aside criteria defined in this doc |

### Sprint 39E Adjustments

| Story | Original Scope    | Revised Scope                     | Reason                                     |
| ----- | ----------------- | --------------------------------- | ------------------------------------------ |
| 39.12 | Backtest          | **Add IV rank correctness check** | Verify IV rank is no longer N/A in outputs |
| 39.13 | Integration tests | **Add stand-aside scenario test** | New "no trade" path needs testing          |
