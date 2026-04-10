# Story 43.2 — Cascade Wave Modeling Research

## 1. Attenuation Model

### Core Question

When TSMC beats earnings, NVDA moves. But does MSFT move because NVDA moved? How much signal decays per hop?

### Proposed Model: Edge-Weighted Exponential Decay

```
cascade_strength(hop) = base_impact × edge_weight × decay^(hop - 1)
```

Where:

- `base_impact` = normalized EPS surprise magnitude (0-1 scale)
- `edge_weight` = dependency strength of the specific edge (0-1)
- `decay` = attenuation factor per hop (recommended: **0.5**)
- `hop` = number of edges from nexus to target (1 = direct, 2 = second-order)

**Maximum hops: 2.** Beyond 2 hops, the signal is too attenuated and noisy to be actionable. Most real cascade effects are 1-hop.

### Worked Example 1: TSMC Beats → Impact on NVDA and MSFT

**Scenario:** TSMC reports Q1 earnings, beats EPS by 15%.

```
base_impact = normalize(15% beat) = 0.8  (large beat, see §4 below)

Hop 1 — TSMC → NVDA:
  edge_weight = 0.9  (NVDA depends on TSMC for nearly all leading-edge fab)
  cascade_strength = 0.8 × 0.9 × 0.5^0 = 0.72

Hop 2 — TSMC → NVDA → MSFT:
  edge_weight(NVDA→MSFT) = 0.6  (MSFT is a major NVDA GPU buyer for Azure AI)
  cascade_strength = 0.8 × 0.9 × 0.6 × 0.5^1 = 0.216
```

**Interpretation:**

- NVDA gets a **strong** cascade signal (0.72) — directly benefits from TSMC's strong results
- MSFT gets a **weak** cascade signal (0.22) — second-order, only relevant if NVDA also narratively links to Azure AI

### Worked Example 2: AAPL Misses → Impact on TSMC and CRUS

**Scenario:** AAPL reports, misses EPS by 8%.

```
base_impact = normalize(-8% miss) = 0.5  (moderate miss)
Direction: bearish (miss cascades negative)

Hop 1 — AAPL → TSMC (reverse direction: customer miss impacts supplier):
  edge_weight = 0.3  (AAPL is one of TSMC's largest customers, but TSMC has diversified revenue)
  cascade_strength = 0.5 × 0.3 × 0.5^0 = 0.15  (weak — TSMC has many customers)

Hop 1 — AAPL → CRUS (direct supplier impact):
  edge_weight = 0.85  (Cirrus Logic derives ~80% of revenue from AAPL)
  cascade_strength = 0.5 × 0.85 × 0.5^0 = 0.425  (moderate-strong)
```

**Interpretation:**

- TSMC barely impacted (0.15) — diversified customer base dilutes any single customer's miss
- CRUS strongly impacted (0.43) — concentrated revenue dependency amplifies the cascade

### Why Edge-Weighted > Flat Decay

A flat decay model (e.g. `0.8 × 0.5^hop`) treats all edges equally. This fails for:

- CRUS→AAPL (80% revenue dependency) vs. QCOM→AAPL (5% revenue from AAPL modem)
- Both are hop 1, but cascade impact should be dramatically different

Edge weights encode the asymmetry of real supply chains. The seed list already captures this qualitatively; Phase 1 can assign numeric weights.

## 2. Timing Model

### Three Phases of Cascade Propagation

```
Phase 1: IMMEDIATE    (0-4 hours post-earnings)
Phase 2: DELAYED      (4 hours - 3 days)
Phase 3: EXHAUSTED    (>3 days)
```

| Phase         | Window | Mechanism                                                                        | Signal Strength          |
| ------------- | ------ | -------------------------------------------------------------------------------- | ------------------------ |
| **Immediate** | 0-4h   | After-hours/pre-market moves in direct dependents based on headline numbers      | 100% of cascade_strength |
| **Delayed**   | 4h-72h | Analyst upgrades/downgrades propagate; narrative contagion ("AI trade is alive") | 60% of cascade_strength  |
| **Exhausted** | >72h   | Market has priced in the cascade; new information dominates                      | 0% (signal expired)      |

### Time Decay Function

```
time_factor(hours_since_report) =
  hours <= 4:    1.0
  hours <= 72:   max(0.2, 1.0 - (hours - 4) / 113)   // linear from 1.0 to 0.2 over 68h
  hours > 72:    0.0
```

This produces:

- T+0h: 1.0 (full strength)
- T+4h: 1.0 (still full strength through immediate phase)
- T+24h: 0.82
- T+48h: 0.61
- T+72h: 0.20 (fading)
- T+73h: 0.0 (expired)

### Integration with Pipeline Timing

The analysis pipeline runs on a cron schedule. When a nexus company report is detected:

1. **Immediate:** Flag all direct dependents for priority re-analysis in the next pipeline run
2. **Delayed:** Include cascade context in all dependent analyses for 72h
3. **Exhausted:** Remove cascade context; return to normal analysis

**Detection mechanism:** Use `fetchEarningsDate()` (already in `market-fetcher.ts`) for nexus companies. When `daysToEarnings` transitions from positive to negative (i.e. earnings just happened), trigger cascade mode.

## 3. Directionality Rules

### Basic Directionality

| Nexus Result | Dependent Type      | Cascade Direction      | Example                                                                             |
| ------------ | ------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| Beat         | Customer/Downstream | **Bullish**            | TSMC beat → NVDA bullish (strong supply validation)                                 |
| Beat         | Supplier/Upstream   | **Bullish (weak)**     | AAPL beat → TSM bullish (demand validation, but diluted)                            |
| Beat         | Competitor          | **Bearish or Neutral** | GOOGL ads beat → META may benefit (sector tailwind) OR may hurt (market share loss) |
| Miss         | Customer/Downstream | **Bearish**            | TSMC miss → NVDA bearish (supply risk)                                              |
| Miss         | Supplier/Upstream   | **Bearish (weak)**     | NVDA miss → TSM weak bearish (demand softening)                                     |
| Miss         | Competitor          | **Bullish or Neutral** | INTC miss → AMD bullish (market share gain)                                         |

### Asymmetry: Beats vs. Misses

Cascade effects are **NOT symmetric:**

- **Misses cascade faster and harder** than beats. Markets are loss-averse; a TSMC warning about capex cuts moves ASML more than a TSMC capex raise.
- **Beats cascade with narrative delay.** A TSMC beat validates the "AI buildout" narrative, which takes 1-3 days to propagate to the full AI trade (NVDA, AMD, MSFT, GOOGL).

Proposed asymmetry factor:

```
direction_multiplier =
  beat:  1.0 × cascade_strength
  miss:  1.3 × cascade_strength   // misses cascade 30% stronger
```

### Competitive Cascades (Special Case)

Competitors require LLM judgment because the direction depends on WHY the nexus beat/missed:

- INTC misses because of execution failure → AMD bullish (market share gain)
- INTC misses because of demand weakness → AMD also bearish (sector problem)

**Recommendation:** For Phase 1, exclude competitive cascades. Only model customer/supplier edges where directionality is unambiguous. Add competitive cascades in Phase 2 with LLM-assessed direction.

## 4. EPS Surprise Magnitude Mapping

### Normalization Function

```
base_impact = normalize_surprise(surprise_pct)

normalize_surprise(pct):
  |pct| < 1%:    0.1   (noise, minimal cascade)
  |pct| < 5%:    0.3   (small beat/miss)
  |pct| < 10%:   0.5   (moderate, typical cascade trigger)
  |pct| < 20%:   0.8   (large, strong cascade)
  |pct| >= 20%:  1.0   (massive, activates full cascade tree)
```

This is a **threshold step function**, not linear, because:

- Small surprises (<1%) are within analyst estimate variance and don't cascade
- There's a de-minimis threshold: below 5%, cascade signals are minimal
- Above 20%, the signal is so strong that further magnitude doesn't matter (already max cascade)

### Guidance vs. EPS

Forward guidance matters more than the EPS number itself for cascades:

- TSMC beats EPS by 5% but **raises capex guidance by 20%** → cascade strength should use the guidance signal (0.8-1.0)
- AAPL beats EPS by 10% but **guides iPhone units down 15%** → cascade strength should reflect the negative guidance

**Phase 1:** Use EPS surprise only (simple, available from earnings calendar APIs)
**Phase 2:** Add LLM extraction of guidance signals from earnings call transcripts

## 5. Integration with Existing Signals

### Cascade as a New Composite Confidence Factor

Add `cascadeStrength` as a 10th factor in `composite-confidence.ts`:

```
Current weights (sum to 1.0):
  geminiCorrelationConf: 0.18
  whaleQualityScore:     0.14
  technicalAlignment:    0.14
  ivRegime:              0.09
  vixRegime:             0.09
  earningsRisk:          0.09
  insiderAlignment:      0.09
  sectorMomentum:        0.09
  shortInterest:         0.09

Proposed with cascade (redistribute proportionally):
  geminiCorrelationConf: 0.16  (-0.02)
  whaleQualityScore:     0.13  (-0.01)
  technicalAlignment:    0.13  (-0.01)
  cascadeStrength:       0.08  (NEW)
  ivRegime:              0.08  (-0.01)
  vixRegime:             0.08  (-0.01)
  earningsRisk:          0.09  (unchanged — separate concern)
  insiderAlignment:      0.08  (-0.01)
  sectorMomentum:        0.09  (unchanged)
  shortInterest:         0.08  (-0.01)
```

**cascadeStrength factor value (0-1):**

- 0.0 = no nexus company has reported recently, or ticker has no upstream dependencies
- 0.5 = nexus company reported with neutral/small surprise, moderate edge weight
- 0.8 = strong cascade signal (large surprise × high edge weight × within immediate window)
- 1.0 = maximum cascade (massive surprise, direct dependency, just reported)

### Interaction with earningsRisk

`earningsRisk` measures risk FROM the ticker's own upcoming earnings (IV crush risk).  
`cascadeStrength` measures signal FROM an upstream nexus company's recent earnings.

These are orthogonal:

- A ticker can have high `cascadeStrength` (TSMC just beat) AND high `earningsRisk` (own earnings in 3 days)
- The cascade boosts confidence in the thesis direction; the earnings risk warns about IV crush
- No special interaction needed — they're independent factors in the composite

### Prompt Context Injection

Rather than having the LLM discover cascade relationships on its own, inject pre-computed cascade context into the prompt:

```
## Earnings Cascade Context
Upstream nexus company TSMC (TSM) reported earnings 18 hours ago.
- EPS surprise: +15% (large beat)
- Guidance: Raised capex guidance +20% for 2026
- Cascade signal for {ticker}: STRONG BULLISH (edge_weight: 0.9, cascade_strength: 0.72)
- Cascade phase: IMMEDIATE (18h since report)
- Relationship: {ticker} is a direct customer of TSM for leading-edge chip fabrication
Factor this upstream catalyst into your analysis. A strong TSMC earnings
report validates semiconductor demand and supply chain health.
```

This gives the LLM structured context without requiring it to know the dependency graph from training data.

## 6. Recommendation: Simple vs. Complex

### Recommendation: **Start Simple, Add Complexity When Validated**

**Phase 1 — Simple model:**

- Flat edge weights from seed list (high/medium/low → 0.9/0.6/0.3)
- Step-function EPS magnitude (the 5-level normalization above)
- Linear time decay over 72h
- Customer/supplier edges only (no competitive cascades)
- Single new confidence factor
- Prompt injection with pre-computed cascade context

**Phase 2 — Add complexity if Phase 1 shows value:**

- Quantitative edge weights from SEC EDGAR revenue disclosures or Finnhub Premium
- LLM guidance extraction from earnings transcripts
- Competitive cascade edges with LLM-assessed directionality
- Back-tested cascade correlation validation
- Non-linear time decay calibrated to historical after-hours moves

**Justification:** The 80/20 split. Most cascade value comes from 1-hop direct dependencies of the top 5-6 nexus companies (TSMC, NVDA, AAPL, AMZN, MSFT, GOOGL). These relationships are well-known and stable — a simple model captures them. The marginal value of fancier attenuation math or 3-hop graphs is low until we validate that cascade signals actually improve trade recommendations in production.
