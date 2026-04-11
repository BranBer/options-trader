# PDF Content Inventory — Story 44.0

## 1. `DeepDiveAnalysis` Schema Fields

Source: `src/types/analysis.ts` → `deepDiveAnalysisSchema`

### Top-Level Fields

| Field                      | Type                      | Description                                     |
| -------------------------- | ------------------------- | ----------------------------------------------- |
| `ticker`                   | `string`                  | Ticker symbol                                   |
| `whale_trade_summary`      | `string`                  | One-line summary of the originating whale trade |
| `market_narrative`         | `string`                  | Multi-sentence market context paragraph         |
| `technical_patterns`       | `TechnicalPattern[]`      | Legacy flat list (all timeframes mixed)         |
| `timeframe_patterns`       | `TimeframePatternMap?`    | Per-timeframe pattern map (1D/1W/1M/3M/6M/1Y)   |
| `support_resistance`       | `SupportResistance[]`     | S/R levels with strength                        |
| `indicators`               | `IndicatorAnalysis[]`     | LLM-generated indicator readings                |
| `options_context`          | (see nested table below)  | Full options chain analysis                     |
| `entry_exit`               | `EntryExitStrategy`       | Actionable trading plan                         |
| `global_events_connection` | `string`                  | Macro/global event linkage paragraph            |
| `risk_assessment`          | (see nested table below)  | Risk level + key risks                          |
| `educational_notes`        | `{ term, explanation }[]` | Glossary-style teaching content                 |
| `disclaimer`               | `string`                  | Legal/educational disclaimer                    |

### `TechnicalPattern` Fields

| Field                   | Type                                                               | Purpose                |
| ----------------------- | ------------------------------------------------------------------ | ---------------------- |
| `name`                  | `string`                                                           | Pattern name           |
| `type`                  | `"bullish" \| "bearish" \| "neutral"`                              | Signal direction       |
| `description`           | `string`                                                           | What the pattern means |
| `confidence`            | `number (0-1)`                                                     | Detection confidence   |
| `timeframe`             | `AnalysisTimeframe?`                                               | Which timeframe        |
| `price_target`          | `number?`                                                          | Derived target price   |
| `drawing_type`          | `"trendline" \| "channel" \| "spike_region" \| "marker" \| "none"` | Chart overlay type     |
| `start_time`            | `string?`                                                          | Overlay start x        |
| `end_time`              | `string?`                                                          | Overlay end x          |
| `start_price`           | `number?`                                                          | Overlay start y        |
| `end_price`             | `number?`                                                          | Overlay end y          |
| `secondary_start_price` | `number?`                                                          | Channel secondary y    |
| `secondary_end_price`   | `number?`                                                          | Channel secondary y    |

### `SupportResistance` Fields

| Field      | Type                               |
| ---------- | ---------------------------------- |
| `level`    | `number`                           |
| `type`     | `"support" \| "resistance"`        |
| `strength` | `"weak" \| "moderate" \| "strong"` |
| `note`     | `string`                           |

### `IndicatorAnalysis` Fields

| Field         | Type                                  |
| ------------- | ------------------------------------- |
| `name`        | `string`                              |
| `value`       | `string`                              |
| `signal`      | `"bullish" \| "bearish" \| "neutral"` |
| `explanation` | `string`                              |

### `options_context` Nested Fields

| Field                   | Type                                                               | Description                     |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------- |
| `iv_percentile`         | `string`                                                           | Current IV percentile           |
| `iv_interpretation`     | `string`                                                           | What IV means for strategy      |
| `put_call_ratio`        | `string`                                                           | Ratio value                     |
| `unusual_activity_note` | `string`                                                           | Notable unusual option activity |
| `greeks_summary`        | `string`                                                           | Overall greeks commentary       |
| `greeks_breakdown`      | `{ greek, value, plain_english, implication }[]?`                  | Per-greek details               |
| `max_pain`              | `number?`                                                          | Max pain strike                 |
| `oi_walls`              | `{ call_walls, put_walls }?`                                       | OI wall strikes + volumes       |
| `gex_summary`           | `{ net_gex, dealer_positioning, gex_flip_level, interpretation }?` | GEX data                        |
| `iv_rv_spread`          | `number?`                                                          | IV minus realized vol           |
| `iv_rv_interpretation`  | `string?`                                                          | What the spread implies         |

### `EntryExitStrategy` Fields

| Field                     | Type                            |
| ------------------------- | ------------------------------- |
| `recommended_option_type` | `string`                        |
| `entry_price_range`       | `{ low: number, high: number }` |
| `strike_selection`        | `string`                        |
| `expiry_guidance`         | `string`                        |
| `profit_target`           | `string`                        |
| `stop_loss`               | `string`                        |
| `position_sizing`         | `string`                        |
| `rationale`               | `string`                        |

### `risk_assessment` Fields

| Field                        | Type                                           |
| ---------------------------- | ---------------------------------------------- |
| `overall_risk`               | `"low" \| "moderate" \| "high" \| "very_high"` |
| `key_risks`                  | `string[]`                                     |
| `max_recommended_allocation` | `string`                                       |

---

## 2. WhaleDeepDive.tsx Section Mapping

Source: `src/components/analysis/WhaleDeepDive.tsx`

| #   | UI Section           | Data Source                                     | PDF Section?         | Notes                                                    |
| --- | -------------------- | ----------------------------------------------- | -------------------- | -------------------------------------------------------- |
| 1   | Header               | `ticker`, `whale_trade_summary`, `createdAt`    | Cover page           | Includes FreshnessBadge (age of analysis)                |
| 2   | Cascade Banner       | `useActiveCascades()` + `findUpstreamNexus`     | Cover/narrative page | Conditional — only when upstream nexus reported earnings |
| 3   | Market Narrative     | `deepDive.market_narrative`                     | Narrative page       | Full paragraph                                           |
| 4   | TechnicalChart       | Candles + S/R + patterns + indicators + options | Chart pages (×6)     | One chart screenshot per timeframe                       |
| 5   | Technical Patterns   | `getTechnicalPatternsForTimeframe()`            | Chart pages          | Per-timeframe pattern list with badges                   |
| 6   | Technical Indicators | `deepDive.indicators`                           | Chart pages          | Grid of indicator name/value/signal                      |
| 7   | OptionsStatsPanel    | `deepDive.options_context`                      | Options page         | IV, greeks, OI walls, GEX, max pain                      |
| 8   | Entry/Exit Strategy  | `deepDive.entry_exit`                           | Strategy page        | Grid: option type, strike, entry, expiry, targets        |
| 9   | Global Events        | `deepDive.global_events_connection`             | Narrative page       | Paragraph                                                |
| 10  | Risk Assessment      | `deepDive.risk_assessment`                      | Strategy page        | Badge + allocation + bulleted risks                      |
| 11  | Educational Notes    | `deepDive.educational_notes`                    | Footer page          | Collapsible in UI → flat list in PDF                     |
| 12  | Disclaimer           | `deepDive.disclaimer`                           | Footer page          | Italic footer text                                       |

---

## 3. Per-Timeframe Data Collection Requirements

For each of the 6 timeframes (1D, 1W, 1M, 3M, 6M, 1Y), the report needs:

### 3a. Candle Data

- **Source**: `/api/market?ticker={T}&period={P}` where period ∈ `{1d, 1wk, 1mo, 3mo, 6mo, 1y}`
- **Type**: `CandleData[] = { time, open, high, low, close, volume }[]`
- **Used for**: Rendering chart + computing client-side indicators

### 3b. Technical Patterns

- **Primary**: `deepDive.timeframe_patterns[timeframe]` — LLM-detected patterns with chart overlay coordinates
- **Fallback**: `deepDive.technical_patterns` filtered by `pattern.timeframe === timeframe`
- **Client-side**: `detectAllIndicatorPatterns(candles)` → pattern markers from EMA/BB/RSI/MACD crossovers
- **Merge logic**: `getTechnicalPatternsForTimeframe()` + `indicatorPatternsToOverlays()` (both in TechnicalChart.tsx)

### 3c. Indicators on Chart

For each timeframe the chart renders these computed overlays (from `PriceChart.tsx`):

| Indicator | Computation        | Series Type   | Color     |
| --------- | ------------------ | ------------- | --------- |
| EMA 9     | `ema(candles, 9)`  | LineSeries    | Cyan      |
| EMA 21    | `ema(candles, 21)` | LineSeries    | Orange    |
| Bollinger | `bollingerBands()` | 3×LineSeries  | Purple    |
| Volume MA | `volumeSMA()`      | LineSeries    | Yellow    |
| RSI       | `calcRsi()`        | Separate pane | Blue      |
| MACD      | `calcMacd()`       | Separate pane | Red/Green |

### 3d. Options Context Lines (on chart)

- Max pain horizontal line
- OI wall strikes (call walls + put walls)
- GEX flip level

---

## 4. Supplementary Data Outside `DeepDiveAnalysis`

### `TradeRecommendation` (from analysis pipeline)

| Field                | Type                                  | Report Use                   |
| -------------------- | ------------------------------------- | ---------------------------- |
| `ticker`             | `string`                              | Verification                 |
| `thesis`             | `string`                              | Cover page key insight       |
| `direction`          | `"bullish" \| "bearish" \| "neutral"` | Cover badge                  |
| `confidence`         | `number (0-1)`                        | Cover page headline metric   |
| `primary_strategy`   | Strategy object                       | Strategy page (legs, P&L)    |
| `market_context`     | IV/volume/catalyst assessment         | Strategy page context        |
| `risk_factors`       | `string[]`                            | Risk page additional factors |
| `indicator_analysis` | Pro/con signal lists                  | Strategy page signal summary |
| `whale_alignment`    | Matches/similarity                    | Strategy page                |

### `ConfidenceBreakdown` (from pipeline composite confidence)

| Field       | Type                 | Report Use                             |
| ----------- | -------------------- | -------------------------------------- |
| `composite` | `number`             | Cover page headline confidence         |
| `factors`   | `ConfidenceFactor[]` | Dedicated breakdown section w/ weights |

Each `ConfidenceFactor`: `{ name, value, weight, contribution, description }`

10 factors total: AI Correlation (16%), Whale Quality (13%), Technical Alignment (13%),
Cascade Strength (8%), IV Regime, VIX Regime, Earnings Risk, Insider Alignment,
Sector Momentum, Short Interest.

### `WhaleAlert` (originating trade)

| Field                    | Type         | Report Use                    |
| ------------------------ | ------------ | ----------------------------- |
| `ticker`                 | `string`     | Cover page                    |
| `strike`                 | `number`     | Cover page trade details      |
| `expiry`                 | `string`     | Cover page trade details      |
| `callPut`                | `"C" \| "P"` | Cover page direction          |
| `premium`                | `number`     | Cover page trade size         |
| `volume`                 | `number`     | Cover page trade activity     |
| `openInterest`           | `number`     | Context                       |
| `underlyingPrice`        | `number?`    | Cover page current price      |
| `sentiment`              | `string`     | Cover badge                   |
| `qualityScore`           | `number?`    | Cover page quality indicator  |
| `delta/gamma/theta/vega` | `number?`    | Options page greeks           |
| `impliedVolatility`      | `number?`    | Options page IV context       |
| `shortPercentOfFloat`    | `number?`    | Risk section — short interest |
| `squeezePressure`        | `string?`    | Risk section — squeeze risk   |

### `ActiveCascadeEntry` (upstream nexus earnings)

| Field              | Type     | Report Use                     |
| ------------------ | -------- | ------------------------------ |
| `nexusTicker`      | `string` | Cascade banner                 |
| `nexusName`        | `string` | Cascade banner                 |
| `sector`           | `string` | Cascade banner                 |
| `reportedAt`       | `string` | Cascade banner                 |
| `hoursSinceReport` | `number` | Cascade banner "Xh ago"        |
| `epsSurprisePct`   | `number` | Cascade banner ±X.X%           |
| `direction`        | `string` | Cascade banner Beat/Miss badge |
| `dependentCount`   | `number` | Cascade banner                 |

---

## 5. Timeframe Constants

Source: `src/lib/utils/chart-timeframes.ts`

| Chart Period | Analysis Timeframe | Display Label |
| ------------ | ------------------ | ------------- |
| `1d`         | `1D`               | "1 Day"       |
| `1wk`        | `1W`               | "1 Week"      |
| `1mo`        | `1M`               | "1 Month"     |
| `3mo`        | `3M`               | "3 Months"    |
| `6mo`        | `6M`               | "6 Months"    |
| `1y`         | `1Y`               | "1 Year"      |

Bidirectional mapping: `CHART_HISTORY_TO_ANALYSIS_TIMEFRAME`
