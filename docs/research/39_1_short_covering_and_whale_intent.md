# Story 39.1 Research: Short Covering Detection & Whale Intent Disambiguation

> **Sprint:** 39A  
> **Status:** Complete  
> **Date:** 2026-04-10

---

## 1. Short Interest Data Availability (yahoo-finance2)

### API Endpoint

```typescript
const summary = await yf.quoteSummary(ticker, {
  modules: ["defaultKeyStatistics"],
});
const stats = summary.defaultKeyStatistics;
```

### Confirmed Fields (Tested: AAPL, GME, TSLA)

| Field                   | Type   | Reliability  | Example (AAPL)          | Notes                          |
| ----------------------- | ------ | ------------ | ----------------------- | ------------------------------ |
| `sharesShort`           | number | **Reliable** | 129,553,812             | Absolute share count           |
| `shortRatio`            | number | **Reliable** | 3.17                    | Days to cover                  |
| `shortPercentOfFloat`   | number | **Reliable** | 0.0085 (0.85%)          | Decimal, multiply by 100 for % |
| `dateShortInterest`     | string | **Reliable** | "2026-03-13"            | ISO date of last report        |
| `sharesShortPriorMonth` | ❌     | **Buggy**    | Returns epoch-like date | Unusable — skip entirely       |

### Data Freshness

- FINRA reports short interest biweekly (settlement date + 2 business days)
- `dateShortInterest` is typically 2-4 weeks old
- Sufficient for identifying high-SI regimes; NOT suitable for intraday short tracking

### Interpretation Thresholds (from literature)

| Short % of Float | Level    | Interpretation                                        |
| ---------------- | -------- | ----------------------------------------------------- |
| < 5%             | Low      | Normal; minimal short pressure                        |
| 5-10%            | Moderate | Noticeable bearish interest                           |
| 10-20%           | High     | Significant bearish sentiment; short squeeze possible |
| > 20%            | Extreme  | Very high squeeze risk; heavy institutional shorting  |

| Days to Cover (Short Ratio) | Interpretation                                  |
| --------------------------- | ----------------------------------------------- |
| < 2                         | Low squeeze risk; shorts can cover quickly      |
| 2-5                         | Moderate; multi-day covering event possible     |
| 5-10                        | High; covering would significantly impact price |
| > 10                        | Extreme; GME-like squeeze potential             |

### Cost Estimate

- **1 additional `yf.quoteSummary()` call per ticker per pipeline run**
- Current pipeline processes ~5-15 tickers per cycle
- Yahoo rate limit: ~2000/hr (well within budget)
- Cache per ticker per pipeline run (don't refetch for same ticker in same cycle)

---

## 2. Short Covering Signal Detection

### When Is Whale Call Buying Likely Short Covering?

A whale buying calls does NOT always indicate bullish conviction. The signal is ambiguous when:

| Signal Combination                                            | Likely Interpretation                                         | Confidence |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ---------- |
| High SI (>10%) + whale buys OTM calls + price declining       | **Short covering** — hedging short equity exposure            | High       |
| High SI (>10%) + whale buys ATM calls + high premium (>$500K) | **Could be either** — large institutional hedge or conviction | Medium     |
| Low SI (<5%) + whale buys OTM calls + price rising            | **Directional bullish** — genuine conviction bet              | High       |
| High SI + whale buys calls + price surging                    | **Short squeeze acceleration** — adding fuel to squeeze       | High       |
| Any SI + whale buys calls + simultaneously sells puts visible | **Synthetic long** — complex position, not pure conviction    | High       |

### Context Clues That Distinguish Conviction from Covering

1. **OTM distance**: Short covering calls tend to be closer to ATM (within 5%) because the goal is to limit further loss, not to speculate on massive upside. Deep OTM calls (>10%) are more likely speculative.

2. **Premium relative to OI**: Short covering typically creates vol/OI > 2 because the buyer needs to act urgently. However, this overlaps with speculative whales.

3. **Expiry length**: Short covering calls tend to be shorter-dated (< 30 DTE) because the goal is near-term protection. Long-dated call buying (> 60 DTE) is more likely conviction or institutional roll.

4. **Price trend at time of trade**: If the stock is in a downtrend and short interest is high, call buying is more likely covering. If the stock is uptrending, it's more likely conviction or squeeze chasing.

5. **Paired put selling**: If the whale also sells puts (visible in flow), this is a synthetic long / risk reversal — NOT a covering trade.

### Recommendation

We cannot definitively classify every whale call as "covering vs conviction" with available data, but we CAN:

- Flag high-SI + call-buying combinations as "possible short covering"
- Let the LLM reason about it given short interest data + price trend + whale trade characteristics
- Bias recommendations toward technical signals over whale direction when short covering risk is elevated

---

## 3. Existing `intentHint` — Quick Win Discovery

### Current State

The `intentHint` field is already computed in `sentiment-inference.ts` and stored in the DB:

```typescript
// Current classification logic:
speculative:   OTM > 10% AND vol > 3× OI
institutional: premium ≥ $1M AND near ATM (< 3%)
hedge:         ITM (OTM < -3%) OR |delta| > 0.7
unknown:       default
```

### Critical Finding: `intentHint` is NEVER exposed to the LLM

- Stored in `whaleAlerts.intentHint` column in the DB
- NOT included in the cross-reference prompt
- NOT included in the recommendation prompt
- NOT included in the deep dive prompt

### Quick Win

Exposing `intentHint` to the LLM requires only:

1. Adding `intentHint` to the whale trade object in the cross-reference prompt
2. Adding it to the recommendation prompt context
3. Adding a system instruction rule explaining intent categories

This is a **trivial change** that can be folded into Story 39.9 or as a standalone micro-story.

### Proposed Enhancement: Expand Intent Classification

Current 4-category classification should expand to 6 categories for the recommendation engine:

```typescript
type WhaleIntentClassification =
  | "directional_bullish" // OTM calls OR OTM puts sold, low SI, trend-aligned
  | "directional_bearish" // OTM puts OR OTM calls sold, low SI, trend-aligned
  | "short_covering" // Calls bought when SI > 10% AND stock declining/flat
  | "hedge" // ITM puts or high-delta options, or whale has institutional intent
  | "synthetic" // Visible paired trades (risk reversal, collar)
  | "unknown"; // Insufficient data to classify
```

**Mapping from existing `intentHint` → new classification:**

| Existing `intentHint` | Call/Put | Short Interest | New Classification                       |
| --------------------- | -------- | -------------- | ---------------------------------------- |
| `speculative`         | Call     | Low (<10%)     | `directional_bullish`                    |
| `speculative`         | Put      | Low (<10%)     | `directional_bearish`                    |
| `speculative`         | Call     | High (>10%)    | `short_covering`                         |
| `speculative`         | Put      | High (>10%)    | `directional_bearish`                    |
| `institutional`       | Call     | Any            | `directional_bullish` (likely)           |
| `institutional`       | Put      | Any            | `hedge` (likely institutional insurance) |
| `hedge`               | Call     | Any            | `hedge`                                  |
| `hedge`               | Put      | Any            | `hedge`                                  |
| `unknown`             | Any      | Any            | `unknown`                                |

This mapping requires short interest data → depends on Story 39.3.

---

## 4. Multi-Leg Strategy Detection

### Current Limitations

- **Unusual Whales API**: Reports individual trades, NOT paired legs. A risk reversal (sell put + buy call) appears as two separate alerts.
- **Polygon API**: Same limitation — individual trade records.
- **No trade grouping**: The system has no mechanism to group trades by timestamp + ticker to detect multi-leg strategies.

### Feasibility Assessment

Detecting multi-leg strategies would require:

1. Grouping whale alerts by ticker + timestamp (within ~30s window)
2. Pattern matching: buy call + sell put at same expiry = risk reversal; buy call + sell higher call = bull call spread; etc.
3. Complexity: **Medium** — but deferred to post-Epic 39 since it adds implementation complexity with uncertain payoff

### Recommendation

- **Skip multi-leg detection for Epic 39** — the LLM can be instructed to consider the possibility in its thesis
- Add a system prompt note: "Only one leg of a multi-leg strategy may be visible. Consider that the whale may have paired positions not shown."
- Revisit in a future epic if recommendation quality plateaus

---

## 5. Whale Quality Score Assessment

### Current Formula (6 factors, 100% total)

| Factor              | Weight | How Computed                             |
| ------------------- | ------ | ---------------------------------------- |
| Volume/OI ratio     | 25.5%  | Higher vol relative to OI → more unusual |
| OTM aggressiveness  | 21.25% | Further OTM → more speculative           |
| Premium size        | 17.0%  | Larger premium → more conviction         |
| Expiry timing       | 12.75% | DTE bucket scoring                       |
| Sweep indicator     | 8.5%   | Market sweeps indicate urgency           |
| Technical alignment | 15.0%  | Aligns with current technical trend      |

### Assessment

The quality score captures conviction strength but NOT intent. It answers "how unusual is this trade?" not "why is the whale trading?"

**No changes needed to quality score for Epic 39.** The new `WhaleIntentClassification` is complementary, not a replacement.

---

## Summary of Scope Adjustments

| Finding                                 | Impact on Epic                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `sharesShortPriorMonth` is buggy        | Story 39.3: Remove from deliverables. Cannot compute month-over-month trend.                                    |
| `intentHint` already exists in DB       | Story 39.9: Simpler than expected — just wire existing field to prompts. Consider adding as micro-story in 39B. |
| Multi-leg detection infeasible          | Story 39.1 scope: Drop multi-leg detection. Add LLM prompt note instead.                                        |
| Short interest data is 2-4 weeks stale  | Story 39.3/39.9: Note staleness in prompt so LLM doesn't over-weight it.                                        |
| Expanded intent classification needs SI | Story 39.3 → 39.9 dependency confirmed. Intent reclassification happens after SI fetch.                         |
