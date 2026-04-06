# Epic 38: Technical Indicator Pattern Detection & Educational Signal Analysis

> **Status:** 📋 PLANNED  
> **Priority:** P1 — High (closes the gap between raw chart overlays and actionable, explainable signal intelligence)  
> **Created:** 2026-04-06  
> **Depends on:** Existing indicator computation (`technical-indicators.ts`), deep-dive pipeline (`llm-analyzer.ts`), chart components (`PriceChart`, `TechnicalChart`), indicator explainers (`IndicatorExplainers.tsx`)

## Problem Statement

The dashboard already computes and renders six core technical indicators — EMA 9, EMA 21, Bollinger Bands, Volume MA, RSI, and MACD — as chart overlays. However:

1. **No pattern detection**: The system draws the lines but never identifies meaningful patterns within them (golden/death crosses, BB squeezes, RSI divergences, MACD crossovers, volume breakouts, etc.).
2. **LLM blindspot**: The deep-dive pipeline sends raw OHLCV candle data to Qwen but does **not** include the pre-computed indicator values. The model must infer indicator signals from raw numbers — error-prone and inconsistent.
3. **No combination analysis**: Users see six independent overlays but the system never identifies multi-indicator confluences (e.g., EMA crossover + BB breakout + rising volume = high-probability setup).
4. **No educational tie-in**: The `IndicatorExplainers` component explains indicators in the abstract but never connects them to the user's actual chart — the detected patterns and what they mean _right now_ for this ticker.
5. **Recommendations are indicator-blind**: The trade recommendation pipeline has no visibility into computed indicator state, so its confidence scores and strategy selection cannot factor in technical signal quality.

## Goal

Build a deterministic indicator pattern detection engine, feed its output into the LLM analysis pipeline, and surface detected patterns educationally across every page that renders technical charts.

### Target Indicators

| Indicator           | Key Patterns to Detect                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **EMA 9 / EMA 21**  | Golden cross, death cross, price above/below EMA, EMA fanning, EMA compression, trend strength via EMA slope                                  |
| **Bollinger Bands** | BB squeeze (low bandwidth), BB breakout, walk-the-band (sustained touch), W-bottom / M-top near bands, mean reversion (return to middle band) |
| **RSI**             | Overbought (>70) / oversold (<30), bullish/bearish divergence vs price, RSI failure swing, centerline cross (50)                              |
| **MACD**            | Signal-line crossover, centerline crossover, bullish/bearish divergence vs price, histogram acceleration/deceleration                         |
| **Volume MA**       | Volume breakout (above MA), volume dry-up (below MA), volume confirmation of price move, climactic volume spike                               |

### Combination Patterns

| Combination                        | Description                                      | Signal Strength  |
| ---------------------------------- | ------------------------------------------------ | ---------------- |
| EMA cross + volume breakout        | Trend change confirmed by participation          | High             |
| BB squeeze + MACD crossover        | Volatility expansion with momentum shift         | High             |
| RSI divergence + BB band touch     | Exhaustion signal at volatility extreme          | High             |
| EMA cross + RSI centerline cross   | Dual trend confirmation                          | Moderate–High    |
| Volume dry-up + BB squeeze         | Consolidation — breakout imminent, direction TBD | Moderate (watch) |
| MACD divergence + declining volume | Momentum fading without conviction               | Moderate         |

---

## Sprint 38A — Backend: Deterministic Pattern Detection Engine

### Story 38.1 — Individual Indicator Pattern Detector

#### Goal

Create a pure-function pattern detection engine that takes pre-computed indicator arrays and candle data, and returns structured pattern objects for each indicator.

#### Deliverables

- `src/lib/utils/indicator-patterns.ts`
  - `detectEMAPatterns(closes, ema9, ema21)` → `IndicatorPattern[]`
  - `detectBollingerPatterns(closes, bb, volumes?)` → `IndicatorPattern[]`
  - `detectRSIPatterns(closes, rsiValues)` → `IndicatorPattern[]`
  - `detectMACDPatterns(closes, macdResult)` → `IndicatorPattern[]`
  - `detectVolumePatterns(candles, volMA)` → `IndicatorPattern[]`
  - `detectAllIndicatorPatterns(candles)` → `IndicatorPatternReport`

#### Types (in `src/types/indicator-patterns.ts`)

```typescript
export interface IndicatorPattern {
  /** Which indicator detected this */
  indicator: "ema" | "bollinger" | "rsi" | "macd" | "volume";
  /** Human-readable pattern name */
  name: string;
  /** e.g., "golden_cross", "bb_squeeze", "rsi_divergence_bullish" */
  patternId: string;
  /** Signal direction */
  signal: "bullish" | "bearish" | "neutral";
  /** 0–1 confidence based on clarity of the pattern */
  confidence: number;
  /** When in the data the pattern was detected (index or date) */
  detectedAt: number; // candle index
  detectedDate?: string; // ISO date string
  /** Plain-English explanation suitable for display */
  description: string;
  /** Whether this pattern is currently active (last N candles) vs historical */
  isRecent: boolean;
  /** Optional: specific numeric values that define the pattern */
  metadata?: Record<string, number | string | null>;
}

export interface CombinationPattern {
  name: string;
  patternId: string;
  signal: "bullish" | "bearish" | "neutral";
  confidence: number;
  description: string;
  /** IDs of the individual patterns that form this combination */
  constituentPatternIds: string[];
  /** Why these patterns together are significant */
  educationalNote: string;
}

export interface IndicatorPatternReport {
  ticker?: string;
  timeframe?: string;
  /** All individual patterns found, most recent first */
  patterns: IndicatorPattern[];
  /** Multi-indicator combination patterns */
  combinations: CombinationPattern[];
  /** Aggregate signal: net bullish/bearish/neutral based on all signals */
  aggregateSignal: {
    direction: "bullish" | "bearish" | "neutral";
    strength: number; // 0–1
    summary: string; // e.g., "4 bullish / 1 bearish / 1 neutral — moderate bullish bias"
  };
  /** ISO timestamp when detection was run */
  computedAt: string;
}
```

#### Implementation Plan

1. **EMA pattern detection** (`detectEMAPatterns`):
   - **Golden cross**: EMA 9 crosses above EMA 21 (compare consecutive candles where `ema9[i-1] <= ema21[i-1]` and `ema9[i] > ema21[i]`). Confidence = `min(1, Math.abs(ema9[i] - ema21[i]) / closes[i] * 100)` scaled.
   - **Death cross**: Inverse of golden cross.
   - **Price above/below EMA**: Sustained price position relative to both EMAs for ≥3 candles.
   - **EMA fanning**: Gap between EMA 9 and EMA 21 is widening (slope of difference is positive/increasing over last 5 candles). Indicates strengthening trend.
   - **EMA compression**: Gap narrowing — potential trend change ahead.
   - **Trend strength**: Compute EMA 9 slope over last 5 candles. Steep slope = strong trend.
   - Mark patterns as `isRecent` if detected within the last 5 candles.

2. **Bollinger Band pattern detection** (`detectBollingerPatterns`):
   - **BB squeeze**: Bandwidth (`(upper - lower) / middle`) drops below 20th percentile of its own 20-period history. Squeeze ending = bandwidth expanding after squeeze.
   - **BB breakout**: Close breaks above upper band or below lower band.
   - **Walk the band**: 3+ consecutive closes touching or exceeding the same band (strong trend).
   - **Mean reversion**: Price touches outer band then reverses toward middle band within 3 candles.
   - **W-bottom / M-top**: Price touches lower band, bounces, retouches near lower band at higher RSI (if RSI data is available — keep detector independent, note the pattern without RSI confirmation).

3. **RSI pattern detection** (`detectRSIPatterns`):
   - **Overbought / Oversold**: RSI > 70 or RSI < 30. Confidence increases with RSI extremity.
   - **Bullish divergence**: Price makes lower low but RSI makes higher low (compare last two local minima within a window of 10–20 candles).
   - **Bearish divergence**: Price makes higher high but RSI makes lower high.
   - **Failure swing**: RSI drops below 30, bounces above 30, pulls back but stays above 30, then breaks its prior high — bullish. Mirror for bearish.
   - **Centerline cross**: RSI crossing 50 — shift from bearish to bullish momentum (or vice versa).
   - Divergence detection uses a local-minima/maxima finder with a configurable lookback (default 5 candles for pivot identification).

4. **MACD pattern detection** (`detectMACDPatterns`):
   - **Signal-line crossover**: MACD line crosses signal line. Direction determines bullish/bearish.
   - **Centerline crossover**: MACD line crosses zero.
   - **Bullish/bearish divergence**: Same local-min/max approach as RSI, but compare price extremes against MACD extremes.
   - **Histogram acceleration**: Histogram bars growing in the same direction for 3+ candles — momentum building.
   - **Histogram deceleration**: Bars shrinking — momentum fading, potential reversal ahead.

5. **Volume pattern detection** (`detectVolumePatterns`):
   - **Volume breakout**: Current volume > 1.5× volume MA. Scale confidence by magnitude.
   - **Volume dry-up**: Volume < 0.5× volume MA for 3+ candles. Indicates consolidation.
   - **Climactic volume spike**: Single candle volume > 3× volume MA. Often marks exhaustion.
   - **Volume confirmation**: Price move (up or down) accompanied by above-average volume.
   - **Volume divergence**: Price making new highs/lows but volume declining — weakening conviction.

6. **Orchestrator** (`detectAllIndicatorPatterns`):
   - Compute all indicators from candle data: `ema(closes, 9)`, `ema(closes, 21)`, `bollingerBands(closes)`, `rsi(closes)`, `macd(closes)`, `volumeSMA(candles)`.
   - Call each per-indicator detector.
   - Flatten results, sort by `detectedAt` descending (most recent first).
   - Compute aggregate signal: count bullish/bearish/neutral among recent patterns, weight by confidence.
   - Return the full `IndicatorPatternReport`.

#### Edge Cases

- **Insufficient data**: If candle array is too short for an indicator's lookback period (e.g., < 26 candles for MACD), the detector returns an empty array for that indicator — no crash.
- **All null indicator values**: If the indicator array is entirely null (data too short), skip detection. Guard with `if (validValues.length < minRequired) return []`.
- **Divergence false positives**: Require at least 5 candles between the two pivot points to avoid noise. Also require the pivot-to-pivot price difference to be > 0.5% to filter trivial divergences.
- **Multiple patterns at same index**: Valid — a single candle can trigger both a MACD crossover and a volume breakout. Store all.
- **Timezone-sensitive dates**: Use the candle's `time` field directly for `detectedDate`. No timezone conversion needed — dates come from the data source.
- **NaN/Infinity in indicator values**: Guard all division operations. If a denominator is 0, skip that check.

#### Testing Plan

- [ ] Unit test for each detector with known synthetic data (e.g., construct a candle series with a clear golden cross and verify detection)
- [ ] Test that insufficient data returns empty results, not errors
- [ ] Test divergence detection with crafted price-vs-RSI divergence
- [ ] Test aggregate signal computation (3 bullish + 1 bearish → "moderate bullish bias")
- [ ] Snapshot test for a realistic candle set to catch regressions
- [ ] Test that `isRecent` correctly flags patterns in the last 5 vs earlier candles
- [ ] Test NaN/Infinity edge cases in division-heavy detectors (BB bandwidth, EMA slope)

---

### Story 38.2 — Combination Pattern Detector

#### Goal

Identify multi-indicator confluences that are more significant than any single pattern alone.

#### Deliverables

- `detectCombinationPatterns(patterns: IndicatorPattern[])` → `CombinationPattern[]` in `indicator-patterns.ts`

#### Implementation Plan

1. **Define combination rules** as a declarative configuration:

   ```typescript
   interface CombinationRule {
     id: string;
     name: string;
     signal: "bullish" | "bearish";
     requiredPatterns: string[]; // patternId values that must all be present and recent
     minConfidence: number; // min confidence across constituents
     educationalNote: string;
     boostFactor: number; // multiply aggregate confidence by this
   }
   ```

2. **Built-in rules**:
   - `ema_cross_volume_breakout`: Golden cross + volume breakout → high-confidence bullish
   - `ema_death_cross_volume_breakout`: Death cross + volume breakout → high-confidence bearish
   - `bb_squeeze_macd_crossover_bull`: BB squeeze ending + MACD bullish crossover → explosive bullish move
   - `bb_squeeze_macd_crossover_bear`: BB squeeze ending + MACD bearish crossover → explosive bearish move
   - `rsi_divergence_bb_touch_bull`: Bullish RSI divergence + price touching lower BB → reversal likely
   - `rsi_divergence_bb_touch_bear`: Bearish RSI divergence + price touching upper BB → reversal likely
   - `ema_cross_rsi_centerline_bull`: Golden cross + RSI crossing above 50 → dual trend confirmation
   - `ema_cross_rsi_centerline_bear`: Death cross + RSI crossing below 50 → dual trend confirmation
   - `volume_dryup_bb_squeeze`: Volume dry-up + BB squeeze → consolidation breakout pending
   - `macd_divergence_volume_decline`: MACD divergence + declining volume → momentum exhaustion

3. **Matching logic**:
   - Filter `patterns` to only `isRecent === true`.
   - For each rule, check if all `requiredPatterns` exist among recent patterns.
   - If matched, compute combination confidence as `mean(constituent confidences) * boostFactor`, capped at 1.0.
   - Generate `educationalNote` from the rule definition.

4. **Proximity check**: Constituent patterns must have `detectedAt` values within 5 candles of each other. A golden cross 20 candles ago + a volume breakout today is not a valid combination.

#### Edge Cases

- **Overlapping combinations**: The same individual pattern can participate in multiple combinations. This is valid — report all.
- **Conflicting signals**: If both bullish and bearish combinations are detected simultaneously (rare), report both and let the aggregate signal handle the net.
- **No recent patterns**: If all patterns are historical, no combinations are produced. Return empty array.
- **Rules with missing indicator**: If MACD data is unavailable (short history), MACD-dependent rules simply won't match. No special handling needed.

#### Testing Plan

- [ ] Test each combination rule with synthetic pattern arrays
- [ ] Test proximity constraint (patterns too far apart are not combined)
- [ ] Test that conflicting combinations both appear
- [ ] Test empty input / no recent patterns → empty output
- [ ] Test confidence capping at 1.0

---

### Story 38.3 — Feed Computed Indicators into Deep-Dive Pipeline

#### Goal

Enrich the Qwen deep-dive prompt with pre-computed indicator values and detected patterns so the LLM can produce more accurate, evidence-based analysis.

#### Deliverables

- Modify `generateDeepDive()` in `llm-analyzer.ts` to:
  1. Pre-compute indicators from candle data per timeframe
  2. Run `detectAllIndicatorPatterns()` per timeframe
  3. Inject the indicator snapshot and detected patterns into the deep-dive prompt
- Modify `buildDeepDivePrompt()` in `deep-dive-analyzer.ts` to accept and render the new indicator data section
- Add `computed_indicator_patterns` to the `DeepDiveInput` type

#### Implementation Plan

1. **Extend `DeepDiveInput`**:

   ```typescript
   interface DeepDiveInput {
     // ... existing fields ...
     computedIndicators?: Partial<
       Record<AnalysisTimeframe, IndicatorPatternReport>
     >;
   }
   ```

2. **In `generateDeepDive()`** (before prompt construction):
   - For each timeframe in `historicalDataByTimeframe`, call `detectAllIndicatorPatterns(candles)`.
   - Attach the results to the input as `computedIndicators`.
   - For the default (longest available) timeframe, also compute indicators from `historicalData`.

3. **Extend `buildDeepDivePrompt()`**:
   - Add a new prompt section: `"Pre-Computed Technical Indicator Analysis"`.
   - For each timeframe with data, render:
     ```
     ## Timeframe: 1M
     ### Individual Signals:
     - [BULLISH] Golden Cross (EMA): EMA 9 crossed above EMA 21 at candle index 42 (2026-03-28). Confidence: 0.78.
     - [BEARISH] RSI Overbought: RSI at 74.2, suggesting overextension. Confidence: 0.65.
     ### Combination Signals:
     - [BULLISH] EMA Cross + Volume Breakout: Golden cross confirmed by 2.1× average volume — high-conviction trend change. Confidence: 0.85.
     ### Aggregate: 3 bullish / 1 bearish / 0 neutral — moderate bullish bias (strength: 0.62)
     ```
   - Append instruction: _"Use the pre-computed indicator data above to validate and refine your technical analysis. Reference specific pattern names and values. Identify any disagreement between computed signals and your own price-action reading — note it transparently."_

4. **Update system instruction** in `DEEP_DIVE_SYSTEM_INSTRUCTION`:
   - Add: _"When pre-computed indicator analysis is provided, use it as the primary source for indicator signals. Cross-reference against your own reading of the candle data. If you disagree with a detection, explain why." _

5. **Prompt size management**: The indicator data can be lengthy. Cap individual pattern lists to the 8 most recent per timeframe. Cap combination patterns to 5.

#### Edge Cases

- **No candle data for a timeframe**: Skip that timeframe's indicator computation. The prompt section simply omits it.
- **Prompt token budget**: If the additional indicator section pushes the prompt past model limits, prioritize recent timeframes (1W, 1M) and drop older ones (6M, 1Y) first.
- **Model ignoring computed data**: The system instruction update makes computed data authoritative. In post-processing, we can compare the model's `indicators[]` output against the computed patterns and log divergences for monitoring.
- **Backward compatibility**: `computedIndicators` is optional. If omitted (e.g., from old cached inputs), the deep-dive prompt works identically to today.

#### Testing Plan

- [ ] Unit test that `generateDeepDive` populates `computedIndicators` from candle data
- [ ] Test prompt output includes the indicator section when data is available
- [ ] Test prompt output omits the section when no candle data is present
- [ ] Test cap at 8 patterns per timeframe in prompt
- [ ] Integration test: full deep-dive call with mocked LLM verifies the indicator patterns are serialized correctly
- [ ] Regression test: existing deep-dive tests still pass with the new optional field

---

### Story 38.4 — Feed Indicator Signals into Trade Recommendation Pipeline

#### Goal

Make the trade recommendation pipeline indicator-aware so confidence, strategy selection, and thesis can incorporate computed technical signals.

#### Deliverables

- Extend `generateRecommendation()` to accept `indicatorReport: IndicatorPatternReport | undefined`
- Extend `buildTradeAnalyzerPrompt()` to render indicator signals
- Add `indicator_analysis` field to the trade recommendation output schema

#### Implementation Plan

1. **Extend `MarketDataForRecommendation`**:

   ```typescript
   interface MarketDataForRecommendation {
     // ... existing fields ...
     indicatorReport?: IndicatorPatternReport;
   }
   ```

2. **Extend `buildTradeAnalyzerPrompt()`**:
   - After the options chain section, add:
     ```
     Technical Indicator Signals (pre-computed):
     Aggregate: moderate bullish bias (strength: 0.62)
     Key patterns: Golden Cross (EMA, bullish, 0.78), BB Squeeze ending (neutral, 0.71), RSI Overbought (bearish, 0.65)
     Combinations: EMA Cross + Volume Breakout (bullish, 0.85)
     ```
   - Add instruction: _"Factor the computed indicator signals into your confidence score and strategy selection. A strong bullish aggregate signal with high-confidence combinations should increase directional confidence. Conflicting signals (e.g., bullish EMA cross + bearish RSI overbought) should reduce confidence and favor defined-risk strategies."_

3. **Extend recommendation output schema** (`TRADE_ANALYZER_RESPONSE_SCHEMA`):
   - Add optional `indicator_analysis` field:
     ```json
     "indicator_analysis": {
       "type": "object",
       "properties": {
         "signals_supporting_thesis": { "type": "array", "items": { "type": "string" } },
         "signals_opposing_thesis": { "type": "array", "items": { "type": "string" } },
         "impact_on_confidence": { "type": "string" },
         "impact_on_strategy": { "type": "string" }
       }
     }
     ```
   - Update the zod schema in `src/types/analysis.ts` to match.

4. **Wire into callers**:
   - In `analysis-pipeline.ts` and `event-ticker-analyzer.ts`, compute `detectAllIndicatorPatterns()` from the 1M candle data and pass it through to `generateRecommendation()`.

#### Edge Cases

- **No indicator data**: If `indicatorReport` is undefined, the prompt section is omitted and the response schema's `indicator_analysis` field is optional. Backward compatible.
- **Conflicting signal and recommendation direction**: The model may still recommend bullish even when aggregate signal is bearish (if fundamentals override). The `signals_opposing_thesis` field makes this transparent.
- **Token budget**: The indicator summary for the recommendation prompt is much shorter than the deep-dive prompt — just the aggregate + top 5 patterns + combinations. Low risk of overflow.

#### Testing Plan

- [ ] Unit test that indicator report is serialized correctly in the recommendation prompt
- [ ] Test with and without indicator data (backward compatibility)
- [ ] Integration test: mocked LLM recommendation response includes `indicator_analysis` field
- [ ] Test that existing recommendation tests pass without indicator data
- [ ] Test that the zod schema correctly validates the new optional field

---

## Sprint 38B — Frontend: Pattern Display & Education

### Story 38.5 — Indicator Pattern Summary Component

#### Goal

Create a reusable component that renders detected indicator patterns with educational context, usable across globe, analysis, and any future chart context.

#### Deliverables

- `src/components/charts/IndicatorPatternSummary.tsx`
  - Accepts `IndicatorPatternReport`
  - Renders aggregate signal, individual patterns, and combination patterns
  - Educational tooltips for each pattern
  - Responsive layout following UX design principles

#### Implementation Plan

1. **Component structure** (follows Card pattern from UX_Design_Principles §4):

   ```
   ┌─────────────────────────────────────────────┐
   │ Technical Signal Summary                     │
   │ ┌─────────────────────────────────────────┐  │
   │ │ [Badge: Moderate Bullish Bias]          │  │
   │ │ 4 bullish / 1 bearish / 1 neutral      │  │
   │ │ ████████████░░░░ strength: 0.62         │  │
   │ └─────────────────────────────────────────┘  │
   │                                               │
   │ Combination Signals (high-value confluences)  │
   │ ┌──────────────────┐ ┌──────────────────┐    │
   │ │ EMA Cross +      │ │ BB Squeeze +     │    │
   │ │ Volume Breakout  │ │ MACD Crossover   │    │
   │ │ [Bullish] 0.85   │ │ [Bullish] 0.78   │    │
   │ │ ? ────────────── │ │ ? ────────────── │    │
   │ └──────────────────┘ └──────────────────┘    │
   │                                               │
   │ Individual Signals              [Show All ▾]  │
   │ ┌──────────────────┐ ┌──────────────────┐    │
   │ │ Golden Cross      │ │ RSI Overbought   │    │
   │ │ [EMA] Bullish    │ │ [RSI] Bearish    │    │
   │ └──────────────────┘ └──────────────────┘    │
   └─────────────────────────────────────────────┘
   ```

2. **Aggregate signal bar**:
   - Use `<Progress>` component to show signal strength.
   - Color: green for bullish, red for bearish, gray for neutral.
   - Text: summary string from the report.

3. **Combination pattern cards**:
   - Rendered first (they are highest-value information per UX §8 — progressive disclosure).
   - Each card shows: name, signal badge, confidence, constituent indicators.
   - `?` icon reveals the `educationalNote` in a tooltip (UX §10 — contextual help).
   - Cards use `flex flex-wrap gap-3` layout.

4. **Individual pattern cards**:
   - Shown below combinations.
   - Progressive disclosure: show top 4 recent patterns by default, "Show All" toggle reveals the rest (UX §8).
   - Each card: indicator icon/color dot (matching `INDICATOR_OPTIONS` colors from `TechnicalChart.tsx`), pattern name, signal badge, confidence, description.
   - Muted styling for non-recent (`isRecent === false`) patterns.

5. **Responsive design** (UX §12):
   - Mobile (< md): single column stack for all cards.
   - Tablet (md): 2-column grid for pattern cards.
   - Desktop (lg+): 3-column grid for individual patterns, 2-column for combinations.
   - Touch targets: all interactive elements ≥ 44px.

6. **Accessibility** (UX §13):
   - Signal badges use color + text (not color alone).
   - Tooltips triggered by click on mobile, hover on desktop.
   - Semantic headings: h4 for "Technical Signal Summary", h5 for "Combination Signals" / "Individual Signals".
   - Focus management for "Show All" toggle.

7. **Color semantics** (UX §4):
   - Bullish: `default` badge variant (green tones, matching existing recommendation badges).
   - Bearish: `destructive` badge variant (red tones).
   - Neutral: `secondary` badge variant.
   - Indicator color dots match `TechnicalChart.tsx` `INDICATOR_OPTIONS` colors.

#### Edge Cases

- **Empty report (no patterns)**: Show a brief "No clear technical patterns detected" message with a neutral badge. Do not render an empty card with no content.
- **Many patterns (10+)**: Progressive disclosure — show 4 initially, expand on demand. Prevents information overload (UX §8).
- **Long description text**: Clamp to 2 lines with line-clamp, expand on click.
- **Combinations but no individual patterns**: Possible if constituents are historical but combination is recent. Show combinations section only.
- **Server-side rendering**: The component is purely presentational (no fetching). Safe for SSR.

#### Testing Plan

- [ ] Component renders correctly with a full pattern report
- [ ] Component renders empty state for zero patterns
- [ ] "Show All" toggle reveals hidden patterns
- [ ] Responsive layout renders correctly at mobile/tablet/desktop breakpoints
- [ ] Tooltip renders educational note content
- [ ] Accessibility: badges use text labels, focus management on toggle

---

### Story 38.6 — Integrate Pattern Detection into TechnicalChart

#### Goal

Automatically detect patterns when candle data loads in `TechnicalChart` and display the results below the chart, surfacing the pattern summary alongside the chart.

#### Deliverables

- Modify `TechnicalChart.tsx` to:
  - Run `detectAllIndicatorPatterns()` on the active timeframe's candle data
  - Pass the result to a new `<IndicatorPatternSummary>` rendered below the chart
  - Optionally highlight pattern locations on the chart (markers for crossovers, shaded regions for squeezes)
- The detection runs client-side (pure computation, no API call)

#### Implementation Plan

1. **Add pattern detection** in `TechnicalChart`:
   - Inside the existing `useMemo` or `useEffect` where candles are processed, call `detectAllIndicatorPatterns(candles)`.
   - Memoize the result: `useMemo(() => candles.length > 0 ? detectAllIndicatorPatterns(candles) : null, [candles])`.
   - Store result in local state.

2. **Render `<IndicatorPatternSummary>`** below the `<PriceChart>` component, inside the existing `TechnicalChart` card.

3. **Chart pattern markers** (optional, scope-controllable):
   - For crossover patterns (EMA cross, MACD crossover): render a small triangle marker on the chart at the `detectedDate`.
   - For range patterns (BB squeeze): render a subtle background-shaded region.
   - Use the existing `technicalPatterns` overlay infrastructure from `PriceChart` to render these as additional pattern entries (convert `IndicatorPattern` → `TechnicalPattern` shape).
   - Gate behind a "Show indicator patterns" toggle to avoid chart clutter.

4. **Timeframe reactivity**: When the user changes the timeframe selector, the candle data changes, so the memoized detection re-runs automatically.

5. **Performance**: `detectAllIndicatorPatterns` is pure math on arrays. For 250 candles (1Y daily), all six detectors should complete in < 5ms. No debounce needed.

#### Edge Cases

- **Candle data still loading**: Show skeleton state for the pattern summary while candles are being fetched.
- **Very few candles (< 10)**: Some detectors won't find anything. The summary will show "No clear patterns" — acceptable.
- **Chart overlay overlap**: Pattern markers could overlap with existing support/resistance and technical pattern overlays. Use lower z-index and semi-transparent colors for indicator markers.
- **Toggle state persistence**: If the user toggles indicator pattern markers off, persist the preference in `localStorage` to avoid reset on re-render.

#### Testing Plan

- [ ] TechnicalChart renders IndicatorPatternSummary when candle data is available
- [ ] Pattern detection re-runs when timeframe changes
- [ ] Chart pattern markers render at correct positions
- [ ] Toggle hides/shows chart markers
- [ ] Skeleton state shown while candles are loading
- [ ] Performance: detection completes in < 10ms for 250 candles

---

### Story 38.7 — Globe Event Analysis Integration

#### Goal

Surface indicator pattern detection in the globe's `EventTickerAnalysis` panel so event-driven analyses show the same educational pattern intelligence as the main analysis page.

#### Deliverables

- The `EventTickerAnalysis` component shows `<IndicatorPatternSummary>` below the technical chart for each analyzed ticker.
- Pattern data comes from either:
  - (a) The deep-dive output's `indicators[]` field (already LLM-generated), enhanced with the new `indicator_analysis` from the recommendation, **or**
  - (b) Client-side detection from the chart candle data (same as Story 38.6)

#### Implementation Plan

1. **Source decision**: Use client-side detection (option b) because:
   - It's deterministic and consistent with the main analysis page.
   - It doesn't require changes to the persisted analysis format.
   - The candle data is already fetched for the `TechnicalChart` in the globe panel.

2. **Integration point**: The `TechnicalChart` in `EventTickerAnalysis.tsx` already renders. After Story 38.6, it will automatically include the pattern summary. No separate integration code needed in `EventTickerAnalysis.tsx` itself — this story validates that the integration works end-to-end.

3. **Deep-dive cross-reference**: Optionally, show a "Model agrees" / "Model differs" indicator next to computed patterns by comparing `computedPattern.signal` against the corresponding entry in `deepDive.indicators[]`. This builds trust (UX §11 — data trustworthiness).

4. **Layout**: The pattern summary sits between the chart and the existing Risk Level / Technical Indicators / Support-Resistance cards. It provides the bridge between "what the chart shows" and "what the model recommends."

#### Edge Cases

- **Stale candle data**: The globe panel fetches candle data on demand. If the data is hours old, patterns may be slightly stale. Show the `computedAt` timestamp (UX §1 — data freshness).
- **No candle data available**: If the chart fetch failed, skip pattern detection and show nothing — don't add an error where there wasn't one before.
- **Model vs computed disagreement**: If the LLM says "bearish" for RSI but computation says "neutral", showing both transparently is better than hiding the conflict. Use a subtle "Model notes: bearish" annotation.

#### Testing Plan

- [ ] Globe event analysis panel renders pattern summary below chart
- [ ] Pattern detection functions correctly for event tickers
- [ ] "Model agrees/differs" indicator shows correct state
- [ ] Timestamp displays correctly
- [ ] No rendering errors when candle data is unavailable

---

### Story 38.8 — Analysis Page Integration

#### Goal

Integrate pattern detection into the main Analysis page's technical chart views and enhance the existing TA Guide tab with live pattern context.

#### Deliverables

- Analysis page technical charts include `<IndicatorPatternSummary>` (automatic from Story 38.6 if using `TechnicalChart`)
- The "TA Guide" tab (`IndicatorGuidePanel`) gains a "Live Signals" section that shows the selected analysis's detected patterns alongside the static educational content
- The recommendation detail view references `indicator_analysis` from the new recommendation schema (Story 38.4)

#### Implementation Plan

1. **Chart integration**: Verify that the analysis page's deep-dive views already use `TechnicalChart`. If so, Story 38.6 covers this automatically. If not, wire `TechnicalChart` into the deep-dive detail view.

2. **TA Guide "Live Signals" section**:
   - Check if the currently viewed analysis has candle data available on the client.
   - If yes, compute `detectAllIndicatorPatterns(candles)` and render as a "Live Signals for [TICKER]" section at the top of the TA Guide tab.
   - Each live signal links to the corresponding static explainer in the guide (e.g., clicking "Golden Cross" scrolls to the EMA section). This connects abstract education to concrete, live examples (UX §10 — help and documentation).

3. **Recommendation indicator analysis**:
   - In the recommendation card/detail view, render `indicator_analysis.signals_supporting_thesis` and `signals_opposing_thesis` as inline lists.
   - Show `impact_on_confidence` and `impact_on_strategy` as brief explanatory text.
   - Use green/red color coding for supporting/opposing signals (UX §4 — color semantics) with text labels (UX §13 — accessibility).

4. **Responsive layout** (UX §12):
   - Live signals section uses the same responsive grid as `IndicatorPatternSummary` (Story 38.5).
   - On mobile, the "Live Signals" section collapses to show only the aggregate signal with expand toggle.

#### Edge Cases

- **No analysis selected**: TA Guide shows static content only — no "Live Signals" section.
- **Analysis without candle data**: Some older analyses may not have candle data accessible. Skip live signals for those.
- **Recommendation without `indicator_analysis`**: Older recommendations won't have this field. Show nothing — no empty card.
- **Tab switching**: When switching between TA Guide and other tabs, preserve the live signals state. Don't re-detect on every tab switch (memoize).

#### Testing Plan

- [ ] Analysis page chart renders pattern summary
- [ ] TA Guide "Live Signals" section appears when analysis is selected
- [ ] Live signal links scroll to corresponding guide section
- [ ] Recommendation view renders indicator_analysis fields
- [ ] Older recommendations without indicator_analysis render without errors
- [ ] Mobile layout collapses correctly

---

## Sprint 38C — Educational Enhancement & Polish

### Story 38.9 — Educational Pattern Cards with Contextual Learning

#### Goal

Enhance the `IndicatorPatternSummary` with rich educational content that teaches users what each detected pattern means, how it relates to the current price action, and how signal combinations contribute to the recommendation.

#### Deliverables

- Expandable educational detail for each pattern card
- "How this affects the recommendation" section linking patterns → recommendation direction/confidence
- "Learn more" links connecting to the existing `IndicatorExplainers` content
- Combination pattern cards include a "Why this matters" prose section

#### Implementation Plan

1. **Pattern card expansion**:
   - Each individual pattern card gains a collapsible detail section (UX §8 — progressive disclosure).
   - Collapsed: pattern name, signal badge, confidence, one-line description.
   - Expanded: full description, how it was detected, what it means for price action, common follow-through scenarios, and link to `IndicatorExplainers` guide.

2. **"How this affects the recommendation" section**:
   - Rendered at the bottom of `IndicatorPatternSummary` when a recommendation is available.
   - Shows:
     - **Supporting signals**: "The golden cross and volume breakout support this bullish recommendation."
     - **Opposing signals**: "RSI overbought suggests the move may be overextended — entry timing matters."
     - **Net impact**: "Technical signals increased confidence by +8% to 67%."
   - Data sourced from the recommendation's `indicator_analysis` field (Story 38.4).

3. **"Learn more" links**:
   - Map each `IndicatorPattern.indicator` to the corresponding key in `INDICATOR_EXPLAINERS`.
   - Render as a subtle link: "Learn more about EMA crossovers →".
   - On the analysis page, this scrolls to the TA Guide tab's relevant section.
   - On the globe page, this opens a small modal/sheet with the explainer content (since the TA Guide is not available on that page).

4. **Combination "Why this matters"**:
   - Each `CombinationPattern` already has an `educationalNote` field (Story 38.2).
   - Render it as a dedicated prose paragraph within the combination card.
   - Add a "Signal strength" visual: a small bar showing how this combination compares to maximum signal strength.

5. **Emotional design** (UX §15):
   - High-confidence bullish combinations: subtle green gradient border on the card.
   - High-confidence bearish combinations: subtle red gradient border.
   - Neutral/watching: standard border with a yellow attention icon.

6. **Data trustworthiness** (UX §11):
   - Each pattern card shows: "Detected from [timeframe] chart data as of [computedAt]".
   - Add a small info icon explaining: "These signals are computed deterministically from price and volume data. The AI model's analysis may differ — see 'Model agrees/differs' indicators."

#### Edge Cases

- **Missing recommendation data**: If the pattern summary is shown in a context without a recommendation (e.g., standalone chart), skip the "How this affects the recommendation" section.
- **Explainer not found**: If an indicator pattern's type doesn't have a matching `INDICATOR_EXPLAINERS` entry, hide the "Learn more" link.
- **Many expanded cards simultaneously**: Each card expands independently. On mobile, auto-collapse previous card when a new one expands to prevent excessively long scroll.

#### Testing Plan

- [ ] Expanded card shows full educational content
- [ ] "Learn more" link scrolls to correct guide section on analysis page
- [ ] "Learn more" opens sheet/modal on globe page
- [ ] "How this affects" section renders with recommendation data
- [ ] "How this affects" section is absent without recommendation data
- [ ] Gradient borders apply for high-confidence combinations
- [ ] Mobile auto-collapse behavior works

---

### Story 38.10 — Feasibility Assessment: Other Chart Locations

#### Goal

Audit all locations in the app where technical charts or indicator data are rendered and determine feasibility of adding pattern detection to each.

#### Deliverables

- Feasibility report (in this section) covering each chart location
- Implementation for any low-effort integrations identified

#### Feasibility Assessment

| Location                    | Component                                         | Uses `TechnicalChart`?         | Candle Data Available?  | Feasibility                    | Effort                        |
| --------------------------- | ------------------------------------------------- | ------------------------------ | ----------------------- | ------------------------------ | ----------------------------- |
| **Globe Event Analysis**    | `EventTickerAnalysis.tsx`                         | Yes                            | Yes (fetched for chart) | ✅ Automatic from Story 38.6   | Zero — covered                |
| **Analysis Page Deep Dive** | `AnalysisPage.tsx` → `WhaleDeepDive.tsx`          | Uses `TechnicalChart`          | Yes                     | ✅ Automatic from Story 38.6   | Zero — covered                |
| **Analysis Page TA Guide**  | `IndicatorGuidePanel`                             | No chart — educational only    | Via selected analysis   | ✅ Live signals via Story 38.8 | Low — already planned         |
| **Dashboard Home**          | `DashboardHome.tsx`                               | Check if mini-charts exist     | Possibly summary only   | ⚠️ Conditional                 | Medium — only if charts exist |
| **Portfolio Page**          | `PortfolioPage.tsx`                               | Check if position charts exist | Need to verify          | ⚠️ Conditional                 | Medium — only if charts exist |
| **Standalone Price Views**  | Any `<PriceChart>` usage outside `TechnicalChart` | No                             | Yes (candles prop)      | ⚠️ Would need wrapper          | Medium                        |

#### Implementation Plan

1. **Automatic coverage** (zero effort): Globe and analysis page get pattern detection for free once Stories 38.5–38.6 are complete, because they use `TechnicalChart`.

2. **Planned coverage** (Story 38.8): TA Guide live signals and recommendation indicator analysis.

3. **Conditional coverage**: For Dashboard and Portfolio pages:
   - If they use `TechnicalChart` or `PriceChart` with full candle data, adding pattern detection is straightforward (just import and compute).
   - If they only show summary data (no candles), pattern detection is not feasible without additional data fetching.
   - **Recommendation**: Defer to a follow-up story once the core pattern infrastructure is proven.

4. **Standalone `PriceChart` users**: Any component that renders `PriceChart` directly (not via `TechnicalChart`) would need to either:
   - Switch to using `TechnicalChart` (preferred), or
   - Independently call `detectAllIndicatorPatterns()` and render `IndicatorPatternSummary` alongside.
   - **Recommendation**: Audit after Sprint 38B and migrate any remaining `PriceChart` users to `TechnicalChart` as a lightweight follow-up.

#### Edge Cases

- **Performance on pages with many charts**: Dashboard might render 5+ mini-charts. Running pattern detection 5× could add noticeable latency. Use `requestIdleCallback` or `useDeferredValue` to avoid blocking the main thread.
- **Feature flag**: Consider a `SHOW_INDICATOR_PATTERNS=true/false` feature flag to gate the new UI in case of regressions. Default to `true` in development, `true` in production once validated.

#### Testing Plan

- [ ] Verify `TechnicalChart` usage inventory matches this assessment
- [ ] Confirm automatic coverage works on globe and analysis pages
- [ ] Performance benchmark: pattern detection on 5 charts simultaneously stays under 50ms total

---

## Suggested Execution Order

1. **Story 38.1** — Individual pattern detectors (foundation — everything depends on this)
2. **Story 38.2** — Combination patterns (extends 38.1)
3. **Story 38.3** — Deep-dive pipeline integration (makes LLM analysis indicator-aware)
4. **Story 38.4** — Recommendation pipeline integration (makes recommendations indicator-aware)
5. **Story 38.5** — Pattern summary UI component (reusable frontend building block)
6. **Story 38.6** — TechnicalChart integration (automatic coverage for all chart locations)
7. **Story 38.7** — Globe validation (verify event analysis flow works end-to-end)
8. **Story 38.8** — Analysis page integration (TA Guide live signals + recommendation detail)
9. **Story 38.9** — Educational polish (rich learning content)
10. **Story 38.10** — Remaining chart locations (audit + low-effort wins)

## Estimated Scope

- **Sprint 38A** (Stories 38.1–38.4): Backend engine + pipeline integration — focused, testable, no UI risk
- **Sprint 38B** (Stories 38.5–38.8): Frontend components + page integration — depends on 38A
- **Sprint 38C** (Stories 38.9–38.10): Educational polish + coverage expansion — optional refinement

---

## Risks & Mitigations

| Risk                                                | Mitigation                                                                                                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pattern detection produces too many false positives | Require minimum confidence threshold (0.3) for display. Tune per-detector thresholds in testing. Add `isRecent` filter to prioritize actionable patterns. |
| LLM ignores or contradicts computed signals         | System instruction makes computed data authoritative. Post-processing compares LLM output against computed signals and logs divergences.                  |
| Prompt size exceeds model context window            | Cap patterns per timeframe (8 individual, 5 combinations). Drop older timeframes first. Monitor total prompt token count.                                 |
| Chart becomes cluttered with pattern markers        | Gate markers behind a toggle (default off). Use semi-transparent styling. Only mark the 3 most recent/significant patterns.                               |
| Performance regression from client-side detection   | Pure math on 250 candles = sub-5ms. Benchmark in CI. Use `useMemo` to avoid re-computation.                                                               |
| Educational content overwhelms users                | Progressive disclosure (UX §8): collapsed by default, expand on demand. Mobile shows aggregate only until expanded.                                       |

---

## Success Criteria

1. ✅ All six indicators (EMA 9, EMA 21, BB, Vol MA, RSI, MACD) have pattern detectors with ≥ 3 pattern types each
2. ✅ Combination detector identifies ≥ 6 multi-indicator confluences
3. ✅ Deep-dive prompt includes computed indicator data, and the model references it in output
4. ✅ Trade recommendations include `indicator_analysis` reflecting computed signals
5. ✅ Pattern summary component renders on globe analysis panel and analysis page
6. ✅ Educational content explains each pattern in plain language
7. ✅ All pattern detectors have unit tests with synthetic data verifying correct detection
8. ✅ No performance regression: pattern detection < 10ms for 250 candles
9. ✅ Responsive layout works on mobile, tablet, and desktop breakpoints
10. ✅ Existing analysis and recommendation tests pass without regression
