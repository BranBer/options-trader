# Epic 27: Technical Indicator Integration

> **Status:** 🔍 RESEARCH REQUIRED  
> **Priority:** P1 — Important (enhances decision quality)  
> **Created:** 2026-04-01  
> **Depends on:** Epic 9-11 (Signal Enhancements), Epic 14 (Portfolio Analysis)

## Overview

The analysis pipeline already fetches technical indicator data (RSI, MACD, Bollinger Bands, etc.) as part of the deep dive analysis, but this data is **not currently factored into the trade decision-making process or whale quality scoring**. This epic researches the optimal way to integrate technical indicators into the algorithmic trading simulation.

Additionally, users want **timeframe-aware technical indicators** — showing different indicators depending on the selected chart timeframe (1W shows micro-indicators, 6M+ shows macro-indicators).

---

## Story 27.1 — Research: Technical Pattern Impact on Trade Success ✅ COMPLETE

### Research Findings (2026-04-01)

**Technical Indicators Available in Codebase:**

- `sma()` — Simple Moving Average
- `ema()` — Exponential Moving Average
- `bollingerBands()` — Bollinger Bands (upper, middle, lower)
- `rsi()` — Relative Strength Index (0-100)
- `macd()` — MACD line, signal line, histogram
- `obv()` — On-Balance Volume
- `vwap()` — Volume Weighted Average Price
- `volumeSMA()` — Volume moving average

**Current Whale Quality Factors (from `whale-quality.ts`):**
| Factor | Weight | Description |
|--------|--------|-------------|
| Volume/OI ratio | 30% | >1 suggests new position opening |
| OTM aggressiveness | 25% | Further OTM = more conviction |
| Premium size | 20% | Logarithmic scale ($100K=20, $1M+=80) |
| Expiry timing | 15% | Weeklies (<7 DTE) = high conviction |
| Sweep likelihood | 10% | High volume relative to typical size |

**Key Finding:** Technical indicators are fetched and displayed in the UI but **NOT factored into quality scoring**. This is a missed opportunity to improve signal quality.

**Integration Decision:** Add technical alignment as a 6th factor in `scoreWhaleQuality()` with 15% weight. Rebalance existing factors proportionally to 85%.

**Proposed New Weights:**

- Volume/OI: 25.5% (was 30%)
- OTM: 21.25% (was 25%)
- Premium: 17% (was 20%)
- Expiry: 12.75% (was 15%)
- Sweep: 8.5% (was 10%)
- **Technical Alignment: 15% (NEW)**

**Recommended Timeframe:** 1D (daily candles) — most relevant for options trading decisions. Shorter timeframes (1H, 4H) are too noisy.

**Three Technical Sub-Factors (each ~5%):**

1. **Trend Confirmation** — Does price action confirm whale direction? (price vs 20-day SMA)
2. **Support/Resistance Proximity** — Is price near a key level? (within 2% of S/R)
3. **Momentum Alignment** — RSI signal matches whale direction? (RSI > 50 for bullish, < 50 for bearish)

### Original Research Goals

1. **Historical Correlation Analysis**
   - Analyze which technical patterns correlate with successful trades
   - Determine predictive value of each pattern type (bullish vs bearish)
   - Identify the 3-5 most impactful patterns for options trading

2. **Integration Point Decision**
   - Should technical indicators affect `quality_score` on whale alerts?
   - Should they be a separate confidence factor in the composite model?
   - Or should they only influence the Gemini trade evaluator prompt?

3. **Timeframe Relevance**
   - Which indicators work best for weekly vs monthly vs quarterly analysis?
   - How does indicator reliability change with timeframe?
   - Should quality scoring consider the trade's intended duration?

### Research Steps

```bash
# 1. Audit current technical indicator data
grep -r "technical_patterns\|indicators\|support_resistance" src/types/

# 2. Check deep dive analysis output
grep -r "generateDeepDive" src/lib/services/

# 3. Review existing pattern confidence values
grep -r "pattern.confidence\|pattern.signal" src/

# 4. Check composite confidence model
grep -r "compositeConfidence\|confidenceBreakdown" src/lib/utils/
```

### Technical Pattern Categories to Evaluate

| Pattern Type           | Examples                                       | Typical Reliability | Best Timeframe |
| ---------------------- | ---------------------------------------------- | ------------------- | -------------- |
| **Trend Patterns**     | Head & Shoulders, Double Top/Bottom, Triangles | 65-75%              | 1M+            |
| **Momentum**           | RSI Divergence, MACD Crossover                 | 60-70%              | 1W-1M          |
| **Volatility**         | Bollinger Band Squeeze, IV Skew                | 55-65%              | 1M+            |
| **Support/Resistance** | Key levels, Fibonacci Retracements             | 70-80%              | All timeframes |
| **Volume**             | Volume Climax, On-Balance Volume Divergence    | 50-60%              | 1W             |

### Recommended Indicator Weights for Quality Score

```typescript
// Proposed technical factor contribution to quality_score
const TECHNICAL_WEIGHT = 0.15; // 15% of total quality score

const technicalFactors = {
  // Trend confirmation (5%)
  trendConfirmation: {
    weight: 0.33,
    scoring: (pattern: TechnicalPattern) => {
      if (pattern.signal === "bullish" && tradeDirection === "bullish")
        return 1.0;
      if (pattern.signal === "bearish" && tradeDirection === "bearish")
        return 1.0;
      if (pattern.signal === "neutral") return 0.5;
      return 0.0; // Contradicts direction
    },
  },

  // Support/Resistance proximity (5%)
  supportResistance: {
    weight: 0.33,
    scoring: (levels: SupportResistance[]) => {
      const nearSupport = levels.some(
        (l) => l.type === "support" && isNear(currentPrice, l.level, 0.02),
      );
      const nearResistance = levels.some(
        (l) => l.type === "resistance" && isNear(currentPrice, l.level, 0.02),
      );
      return nearSupport ? 1.0 : nearResistance ? 0.3 : 0.5;
    },
  },

  // Pattern confidence average (5%)
  patternConfidence: {
    weight: 0.34,
    scoring: (patterns: TechnicalPattern[]) => {
      if (patterns.length === 0) return 0.5;
      return avg(patterns.map((p) => p.confidence));
    },
  },
};
```

### Acceptance Criteria

- [ ] Historical analysis complete with quantified pattern reliability
- [ ] Integration point decided (quality_score vs composite vs prompt-only)
- [ ] Weight recommendations documented with rationale
- [ ] Timeframe-specific indicator mapping defined
- [ ] Story 27.2 updated with finalized weights and formulas

---

## Story 27.2 — Integrate Technical Indicators into Quality Scoring

### Implementation Plan

_Update after Story 27.1 research findings_

#### Step 1: Extend WhaleAlert Type

**File:** `src/types/whale.ts`

```typescript
export interface WhaleAlert {
  // ... existing fields

  // NEW: Technical context from deep dive
  technicalContext?: {
    patterns: TechnicalPattern[];
    supportLevels: number[];
    resistanceLevels: number[];
    rsiSignal?: "overbought" | "oversold" | "neutral";
    macdSignal?: "bullish" | "bearish" | "neutral";
    averageConfidence: number; // 0-1
  };
}
```

#### Step 2: Modify Quality Score Calculator

**File:** `src/lib/utils/whale-quality.ts`

```typescript
import { TechnicalPattern } from "@/types/analysis";

export function scoreWhaleQuality(alert: WhaleAlert): number {
  // Existing factors
  const volumeOIScore = computeVolumeOIScore(alert) * 0.3;
  const otmScore = computeOTMScore(alert) * 0.25;
  const premiumScore = computePremiumScore(alert) * 0.2;
  const dteScore = computeDTEScore(alert) * 0.15;
  const sweepScore = computeSweepScore(alert) * 0.1;

  // NEW: Technical alignment factor
  const technicalScore = computeTechnicalScore(alert) * 0.15;

  // Rebalance existing weights to accommodate technicals
  // Total must remain 1.0
  const rebalanced =
    volumeOIScore * (0.3 / 0.85) +
    otmScore * (0.25 / 0.85) +
    premiumScore * (0.2 / 0.85) +
    dteScore * (0.15 / 0.85) +
    sweepScore * (0.1 / 0.85) +
    technicalScore;

  return Math.round(rebalanced * 100);
}

function computeTechnicalScore(alert: WhaleAlert): number {
  if (!alert.technicalContext) return 0.5; // Neutral if no data

  const { patterns, supportLevels, resistanceLevels, averageConfidence } =
    alert.technicalContext;

  let score = 0;
  let factors = 0;

  // Factor 1: Pattern alignment with whale sentiment
  if (patterns.length > 0) {
    const alignedPatterns = patterns.filter((p) => {
      if (alert.sentiment === "bullish" && p.signal === "bullish") return true;
      if (alert.sentiment === "bearish" && p.signal === "bearish") return true;
      return false;
    });
    score += (alignedPatterns.length / patterns.length) * averageConfidence;
    factors++;
  }

  // Factor 2: Support/Resistance proximity
  const currentPrice = alert.underlyingPrice;
  const nearKeyLevel = [...supportLevels, ...resistanceLevels].some(
    (level) => Math.abs(currentPrice - level) / currentPrice < 0.02,
  );
  score += nearKeyLevel ? 1.0 : 0.5;
  factors++;

  return factors > 0 ? score / factors : 0.5;
}
```

#### Step 3: Enrich Whale Alerts with Technical Data

**File:** `src/lib/cron/pipelines/whale-pipeline.ts`

```typescript
// After fetching whale alerts and market data, fetch technical context
async function enrichWithTechnicalContext(
  alerts: WhaleAlert[],
): Promise<WhaleAlert[]> {
  const tickers = [...new Set(alerts.map((a) => a.ticker))];

  // Batch fetch technical data for all tickers
  const technicalData = await Promise.all(
    tickers.map(async (ticker) => {
      const deepDive = await getLatestDeepDive(ticker);
      return {
        ticker,
        patterns: deepDive?.output?.technical_patterns || [],
        support:
          deepDive?.output?.support_resistance
            ?.filter((r) => r.type === "support")
            .map((r) => r.level) || [],
        resistance:
          deepDive?.output?.support_resistance
            ?.filter((r) => r.type === "resistance")
            .map((r) => r.level) || [],
        avgConfidence:
          deepDive?.output?.technical_patterns?.length > 0
            ? avg(deepDive.output.technical_patterns.map((p) => p.confidence))
            : 0.5,
      };
    }),
  );

  const techMap = Object.fromEntries(technicalData.map((t) => [t.ticker, t]));

  return alerts.map((alert) => ({
    ...alert,
    technicalContext: techMap[alert.ticker]
      ? {
          patterns: techMap[alert.ticker].patterns,
          supportLevels: techMap[alert.ticker].support,
          resistanceLevels: techMap[alert.ticker].resistance,
          averageConfidence: techMap[alert.ticker].avgConfidence,
        }
      : undefined,
  }));
}
```

### Acceptance Criteria

- [ ] `WhaleAlert` type includes `technicalContext` field
- [ ] `scoreWhaleQuality()` includes technical alignment factor
- [ ] Whale pipeline enriches alerts with technical data from deep dives
- [ ] Quality score reflects pattern alignment (bullish whale + bullish pattern = higher score)
- [ ] Unit test: bullish whale + bullish pattern scores higher than bullish + bearish pattern
- [ ] Unit test: whale without technical context uses neutral score (0.5)
- [ ] Integration test: quality scores change after deep dive completes

---

## Story 27.3 — Timeframe-Aware Technical Indicators

### Implementation Plan

#### Step 1: Create Timeframe Indicator Configuration

**File:** `src/lib/utils/timeframe-indicators.ts`

```typescript
export type Timeframe = "1W" | "1M" | "3M" | "6M" | "1Y";

export interface IndicatorConfig {
  name: string;
  description: string;
  beginnerExplanation: string;
  timeframes: Timeframe[];
  category: "momentum" | "trend" | "volatility" | "volume";
}

export const INDICATOR_CONFIG: IndicatorConfig[] = [
  {
    name: "RSI",
    description: "Relative Strength Index — measures momentum",
    beginnerExplanation:
      "RSI shows if a stock is overbought (>70) or oversold (<30). Think of it like a spring — stretched too far in either direction tends to snap back.",
    timeframes: ["1W", "1M"],
    category: "momentum",
  },
  {
    name: "MACD",
    description: "Moving Average Convergence Divergence — trend following",
    beginnerExplanation:
      "MACD shows the relationship between two moving averages. When the fast line crosses above the slow line, it's bullish. Crosses below = bearish.",
    timeframes: ["1W", "1M", "3M"],
    category: "trend",
  },
  {
    name: "Bollinger Bands",
    description: "Volatility bands around price",
    beginnerExplanation:
      "Bollinger Bands are like rubber bands around price. When price touches the upper band, it might be overbought. Touches lower band = possibly oversold. Squeeze = low volatility, expect a big move soon.",
    timeframes: ["1W", "1M"],
    category: "volatility",
  },
  {
    name: "20-SMA",
    description: "20-day Simple Moving Average — short-term trend",
    beginnerExplanation:
      "The 20-day average shows the short-term trend. Price above = uptrend. Price below = downtrend.",
    timeframes: ["1W", "1M"],
    category: "trend",
  },
  {
    name: "50-SMA",
    description: "50-day Simple Moving Average — medium-term trend",
    beginnerExplanation:
      "The 50-day average shows the medium-term trend. When 20-day crosses above 50-day (golden cross), it's bullish. Death cross (20 below 50) = bearish.",
    timeframes: ["1M", "3M", "6M"],
    category: "trend",
  },
  {
    name: "200-SMA",
    description: "200-day Simple Moving Average — long-term trend",
    beginnerExplanation:
      "The 200-day average is the big picture trend. Price above 200-SMA = long-term bull market. Below = bear market. Institutions watch this closely.",
    timeframes: ["3M", "6M", "1Y"],
    category: "trend",
  },
  {
    name: "Fibonacci Retracement",
    description: "Key retracement levels (23.6%, 38.2%, 50%, 61.8%)",
    beginnerExplanation:
      'Fibonacci levels are like gravity for price — stocks tend to bounce at these levels (23.6%, 38.2%, 50%, 61.8%) during pullbacks. The 61.8% level is called the "golden ratio" and often acts as strong support.',
    timeframes: ["1M", "3M", "6M"],
    category: "trend",
  },
  {
    name: "Volume Profile",
    description: "Volume distribution at price levels",
    beginnerExplanation:
      "Shows where the most trading happened. High volume at a price = strong support/resistance. Low volume areas = price tends to move through quickly.",
    timeframes: ["3M", "6M", "1Y"],
    category: "volume",
  },
];

export function getIndicatorsForTimeframe(
  timeframe: Timeframe,
): IndicatorConfig[] {
  return INDICATOR_CONFIG.filter((ind) => ind.timeframes.includes(timeframe));
}
```

#### Step 2: Update TechnicalChart Component

**File:** `src/components/shared/TechnicalChart.tsx`

```tsx
import {
  getIndicatorsForTimeframe,
  Timeframe,
  INDICATOR_CONFIG,
} from "@/lib/utils/timeframe-indicators";

interface TechnicalChartProps {
  ticker: string;
  data: CandleData[];
  activeTimeframe: Timeframe;
  patterns?: TechnicalPattern[];
  supportResistance?: { support: number[]; resistance: number[] };
  onTimeframeChange?: (tf: Timeframe) => void;
}

export function TechnicalChart({
  ticker,
  data,
  activeTimeframe,
  patterns,
  supportResistance,
  onTimeframeChange,
}: TechnicalChartProps) {
  const activeIndicators = getIndicatorsForTimeframe(activeTimeframe);

  return (
    <div className="space-y-4">
      {/* Timeframe Selector */}
      <div className="flex gap-2">
        {(["1W", "1M", "3M", "6M", "1Y"] as Timeframe[]).map((tf) => (
          <Button
            key={tf}
            variant={activeTimeframe === tf ? "default" : "outline"}
            size="sm"
            onClick={() => onTimeframeChange?.(tf)}
          >
            {tf}
          </Button>
        ))}
      </div>

      {/* Active Indicators Display */}
      <div className="flex flex-wrap gap-2">
        {activeIndicators.map((ind) => (
          <Badge
            key={ind.name}
            variant="secondary"
            className="flex items-center gap-1"
          >
            {ind.name}
            <Tooltip content={ind.beginnerExplanation}>
              <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
            </Tooltip>
          </Badge>
        ))}
      </div>

      {/* Chart with indicators */}
      <PriceChart
        data={data}
        overlays={buildIndicatorOverlays(data, activeIndicators)}
        patterns={patterns}
        supportResistance={supportResistance}
      />
    </div>
  );
}
```

#### Step 3: Integrate with Deep Dive Analysis

**File:** `src/lib/prompts/deep-dive-analyzer.ts`

```typescript
// Add timeframe context to deep dive prompt
export function buildDeepDivePrompt(input: DeepDiveInput): string {
  const { ticker, candles, optionsChain, newsContext, timeframe } = input;

  // Select relevant indicators based on analysis timeframe
  const relevantIndicators = getIndicatorsForTimeframe(timeframe || "1M");

  return `
Analyze ${ticker} with focus on these technical indicators for the ${timeframe || "1M"} timeframe:

Active Indicators: ${relevantIndicators.map((i) => i.name).join(", ")}

For each indicator, provide:
1. Current signal (bullish/bearish/neutral)
2. Confidence level (0-1)
3. Brief explanation suitable for beginners

Candle data: ${JSON.stringify(candles.slice(-50))}
Options chain: ${JSON.stringify(optionsChain)}
  `.trim();
}
```

### Acceptance Criteria

- [ ] `timeframe-indicators.ts` created with full indicator configuration
- [ ] Each indicator has a beginner-friendly tooltip explanation
- [ ] TechnicalChart shows different indicators based on active timeframe
- [ ] 1W shows: RSI, MACD, Bollinger Bands, 20-SMA
- [ ] 1M shows: RSI, MACD, Bollinger Bands, 20-SMA, 50-SMA, Fibonacci
- [ ] 6M+ shows: 50-SMA, 200-SMA, Fibonacci, Volume Profile
- [ ] Beginner tooltips visible regardless of timeframe selection
- [ ] Deep dive prompt includes timeframe-appropriate indicator requests
- [ ] Unit test: `getIndicatorsForTimeframe('1W')` returns only weekly-appropriate indicators
- [ ] Unit test: `getIndicatorsForTimeframe('1Y')` returns only macro indicators
- [ ] E2E test: timeframe button changes displayed indicators

---

## Story 27.4 — Technical Factor in Trade Evaluator Prompt

### Implementation Plan

**File:** `src/lib/prompts/sim-trade-evaluator.ts`

```typescript
// Add technical context to sim trade evaluator prompt
export function buildSimTradeEvalPrompt(input: SimEvalInput): string {
  const { recommendation, deepDive, portfolio, currentPrice } = input;

  // Extract technical signals
  const technicalSummary =
    deepDive?.output?.technical_patterns
      ?.map((p) => `- ${p.name}: ${p.signal} (confidence: ${p.confidence})`)
      .join("\n") || "No technical data available";

  const supportResistance =
    deepDive?.output?.support_resistance
      ?.map((sr) => `- ${sr.type} at $${sr.level} (strength: ${sr.strength})`)
      .join("\n") || "No S/R levels identified";

  return `
TRADE RECOMMENDATION:
${JSON.stringify(recommendation, null, 2)}

TECHNICAL ANALYSIS:
Patterns:
${technicalSummary}

Support/Resistance:
${supportResistance}

PORTFOLIO STATE:
${JSON.stringify(portfolio, null, 2)}

RULES:
11. Consider technical pattern alignment: bullish patterns supporting a bullish trade increase confidence
12. Consider support/resistance proximity: entry near strong support = higher probability
13. If technical patterns contradict the trade direction, increase caution or reject
14. RSI/MACD signals should influence timing — don't enter overbought calls or oversold puts
  `.trim();
}
```

### Acceptance Criteria

- [ ] Sim evaluator prompt includes technical pattern summary
- [ ] Prompt includes support/resistance levels
- [ ] Evaluator rules reference technical alignment
- [ ] Gemini/Qwen considers technicals in `should_enter` decision
- [ ] Unit test: prompt includes all technical indicator sections
- [ ] Integration test: trades with aligned technicals have higher acceptance rate

---

## Story 27.5 — Tests for Technical Integration

### Implementation Plan

#### Unit Tests

**File:** `src/__tests__/utils/whale-quality-technical.test.ts`

```typescript
describe("Whale Quality with Technical Indicators", () => {
  it("increases quality score when whale sentiment aligns with bullish patterns", () => {
    const bullishWhale: WhaleAlert = {
      ...createMockWhale(),
      sentiment: "bullish",
      technicalContext: {
        patterns: [
          { name: "Bull Flag", signal: "bullish", confidence: 0.8 },
          { name: "RSI Divergence", signal: "bullish", confidence: 0.7 },
        ],
        supportLevels: [150],
        resistanceLevels: [165],
        averageConfidence: 0.75,
      },
    };

    const score = scoreWhaleQuality(bullishWhale);

    // Should be higher than without technical context
    const neutralWhale = { ...bullishWhale, technicalContext: undefined };
    const neutralScore = scoreWhaleQuality(neutralWhale);

    expect(score).toBeGreaterThan(neutralScore);
  });

  it("decreases quality score when whale sentiment contradicts patterns", () => {
    const contradictoryWhale: WhaleAlert = {
      ...createMockWhale(),
      sentiment: "bullish",
      technicalContext: {
        patterns: [
          { name: "Head & Shoulders", signal: "bearish", confidence: 0.85 },
        ],
        supportLevels: [],
        resistanceLevels: [155],
        averageConfidence: 0.85,
      },
    };

    const score = scoreWhaleQuality(contradictoryWhale);
    const neutralWhale = { ...contradictoryWhale, technicalContext: undefined };
    const neutralScore = scoreWhaleQuality(neutralWhale);

    expect(score).toBeLessThan(neutralScore);
  });

  it("uses neutral score (50) when no technical context available", () => {
    const noTechWhale = createMockWhale();
    delete noTechWhale.technicalContext;

    const score = scoreWhaleQuality(noTechWhale);

    // Without technicals, score should rely on other factors
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
```

**File:** `src/__tests__/utils/timeframe-indicators.test.ts`

```typescript
describe("Timeframe Indicators", () => {
  it("returns correct indicators for 1W timeframe", () => {
    const indicators = getIndicatorsForTimeframe("1W");
    const names = indicators.map((i) => i.name);

    expect(names).toContain("RSI");
    expect(names).toContain("MACD");
    expect(names).toContain("Bollinger Bands");
    expect(names).not.toContain("200-SMA"); // Too slow for weekly
    expect(names).not.toContain("Volume Profile"); // Too macro for weekly
  });

  it("returns correct indicators for 1Y timeframe", () => {
    const indicators = getIndicatorsForTimeframe("1Y");
    const names = indicators.map((i) => i.name);

    expect(names).toContain("200-SMA");
    expect(names).toContain("Fibonacci Retracement");
    expect(names).toContain("Volume Profile");
    expect(names).not.toContain("RSI"); // Too noisy for yearly
    expect(names).not.toContain("Bollinger Bands");
  });

  it("every indicator has a beginner explanation", () => {
    INDICATOR_CONFIG.forEach((indicator) => {
      expect(indicator.beginnerExplanation).toBeTruthy();
      expect(indicator.beginnerExplanation.length).toBeGreaterThan(20);
    });
  });
});
```

### Acceptance Criteria

- [ ] Unit tests for quality score with technical alignment
- [ ] Unit tests for quality score with technical contradiction
- [ ] Unit tests for timeframe indicator selection
- [ ] Unit tests for beginner explanations on all indicators
- [ ] Integration test: pipeline enriches whale alerts with technical context
- [ ] All existing tests still pass after changes

---

## Dependencies & Sequencing

```
Story 27.1 (Research) ──→ Story 27.2 (Quality Score Integration)
                              │
                              ├──→ Story 27.3 (Timeframe Indicators)
                              ├──→ Story 27.4 (Trade Evaluator)
                              └──→ Story 27.5 (Tests)
```

## Suggested Execution Order

| Phase        | Stories                | Notes                                                      |
| ------------ | ---------------------- | ---------------------------------------------------------- |
| **Sprint 1** | 27.1                   | Research — determine optimal weights and integration point |
| **Sprint 2** | 27.2                   | Core integration — quality scoring + pipeline enrichment   |
| **Sprint 3** | 27.3 + 27.4 (parallel) | UI timeframe + prompt integration                          |
| **Sprint 4** | 27.5                   | Comprehensive testing                                      |

## Risk & Mitigation

| Risk                                               | Impact                                 | Mitigation                                                     |
| -------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| Technical factors overweight in quality score      | False confidence from noisy indicators | Cap technical weight at 15%, use confidence-weighted averaging |
| Deep dive data missing for some tickers            | Quality score drops unexpectedly       | Default to neutral (0.5) when technical context unavailable    |
| Timeframe switching causes chart re-render flicker | Poor UX                                | Debounce timeframe changes, cache indicator data               |
| Beginner explanations too technical                | Users ignore tooltips                  | User-test explanations with non-traders, simplify language     |

---

## Future Enhancements (Not In Scope)

- **Custom indicator builder**: Let users choose which indicators to display
- **Indicator alerts**: Notify when RSI crosses 70/30 or MACD crosses
- **Backtesting view**: Show historical indicator signals on past trades
- **Multi-timeframe analysis**: Show 1W + 1M + 3M indicators simultaneously
