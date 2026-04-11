# Chart Overlay Clutter — UX Audit & Research

## Date: 2026-04-10

## Problem Statement

Technical indicator pattern overlays on the PriceChart are illegible when
multiple patterns are detected simultaneously. Labels overlap each other,
obscure candlestick data, and make it impossible to distinguish which
indicator triggered at which position. This problem is amplified in
PDF exports where the static image has no hover interactivity.

## Screenshot Analysis

The screenshot reveals these specific clutter issues:

1. **Label text stacking** — "V-Shape", "EMA Bullish Alignment",
   "EMA 9/21 Golden Cross", "RSI Centerline Cross", "EMA Compression",
   "Bollinger Band Squeeze", "Bollinger Band Breakout",
   "MACD Centerline Cross Up", "MACD Histogram Acceleration" all
   rendered within a ~100px vertical band with no collision avoidance.

2. **Marker arrow pileup** — Multiple `belowBar`/`aboveBar` arrows at
   the same or adjacent candle times stack vertically, creating a tower
   of green/orange markers that obscures price data.

3. **No visual differentiation by indicator family** — EMA patterns,
   Bollinger patterns, RSI patterns, MACD patterns, and Volume patterns
   all use the same green/red/amber color scheme (bullish/bearish/neutral),
   making it impossible to tell which _indicator system_ produced a signal.

4. **Trendline labels at midpoint** — `TrendlinePrimitive` places labels
   at the midpoint of the line with `textAlign: "center"` at a fixed
   `-8px` offset. When two trendlines cross or run parallel, labels
   collide directly.

5. **No label hierarchy or prioritization** — All patterns are rendered
   at the same font size (11px) and opacity (0.9) regardless of
   confidence, recency, or importance.

6. **No grouping or aggregation** — 9 individual labels are shown when
   a summary like "5 bullish signals" with expand-on-hover would convey
   the information more effectively.

---

## Root Cause Analysis

### PatternMarkerHelper.ts

- **Markers**: `createSeriesMarkers()` from lightweight-charts places
  marker labels inline above/below bars. The library does **not**
  perform collision detection — it simply stacks text above the arrow.
  With 5+ markers at the same time, labels blend into a wall of text.

- **Fallback placement**: When `start_time` can't be resolved, markers
  default to the 75th-percentile candle. Multiple unresolved patterns
  all land at the same bar.

### TrendlinePrimitive.ts

- **Label position**: Fixed at `(x1+x2)/2, (y1+y2)/2 - 8`. No
  awareness of other primitives' label positions.

- **Font**: `"11px sans-serif"` with no background pill or contrast
  enhancement, making labels hard to read against mixed backgrounds.

### HighlightRegionPrimitive.ts

- Labels use a dark background pill at (x1+x2)/2 near the top. Less
  problematic than the other two but can still overlap with trendline
  labels.

### Indicator Pattern Detection (indicator-patterns.ts)

- Generates **all** detected patterns including low-confidence and
  non-recent ones. The `isRecent` filter in `indicatorPatternsToOverlays`
  helps but doesn't prevent 8+ recent patterns from firing simultaneously
  (common in trending markets).

---

## Professional Charting Platform Benchmarks

### TradingView Approach

- **Numbered icons** on chart, full labels in a sidebar panel
- Hover over icon reveals tooltip with full details
- Colors coded by indicator type (not just signal direction)
- Adjustable density setting ("More/Fewer labels")

### Bloomberg Terminal

- Minimal on-chart annotations — signals shown in a separate panel
- Chart overlays use thin lines with no inline text
- Signal summary badge count in corner

### Think or Swim (TOS)

- Marker arrows without text labels on chart
- Full pattern names in a separate "Signals" tab
- Click-to-reveal interaction model

### Common Best Practices

1. **Separate data from chart** — Show signal details in a panel, not on the chart
2. **Use numbered/coded icons** — Small numbered circles instead of full text
3. **Collision detection** — When labels would overlap, aggregate into a count badge
4. **Confidence filtering** — Only show high-confidence patterns by default
5. **Indicator-family color coding** — EMA = cyan, Bollinger = blue, RSI = purple, MACD = blue-green, Volume = white
6. **Progressive disclosure** — Show more detail on hover/click, not all at once
7. **Z-order by confidence** — Higher-confidence patterns render on top

---

## Proposed Solution Architecture

### Layer 1: Marker Consolidation (PatternMarkerHelper)

- **Cluster detection**: Group markers within N-pixel proximity
- **Aggregate badge**: Replace stacked markers with a single "badge"
  showing count + dominant signal direction
- **Expand on hover**: Click/hover reveals individual patterns in a
  floating panel positioned to avoid chart overlap

### Layer 2: Label Collision Avoidance (TrendlinePrimitive)

- **Position negotiation**: After computing all label positions, run a
  collision pass that nudges overlapping labels vertically
- **Leader lines**: When a label is nudged far from its line, draw a
  thin connector line to maintain association
- **Font scaling**: Reduce font size for lower-confidence patterns

### Layer 3: Indicator-Family Color Coding

- Assign each indicator family a distinct color:
  | Family | Color | Hex |
  |-----------|----------------|-----------|
  | EMA | Cyan | `#06b6d4` |
  | Bollinger | Blue | `#3b82f6` |
  | RSI | Purple | `#a855f7` |
  | MACD | Emerald | `#10b981` |
  | Volume | Slate | `#94a3b8` |
  | AI/Gemini | Signal-based | green/red/amber |
- Bullish/bearish distinguished by icon shape (↑/↓), not color
- Color now tells you _which system_ detected the pattern

### Layer 4: Confidence-Based Filtering

- Default threshold: show only patterns with confidence ≥ 0.6
- Toggle in UI to show all (analyst mode)
- Lower-confidence patterns rendered at 40% opacity when shown

### Layer 5: PDF-Specific Optimizations

- Since PDF has no interactivity, use a different rendering strategy:
  - Numbered markers on chart → numbered legend table below chart
  - No hover/click available, so all labels must be in the legend
  - Chart stays clean, legend provides full details

---

## Impact on Existing Code

### Files to Modify

| File                          | Changes                                                       |
| ----------------------------- | ------------------------------------------------------------- |
| `PatternMarkerHelper.ts`      | Cluster detection, badge aggregation, indicator-family colors |
| `TrendlinePrimitive.ts`       | Label collision avoidance, background pills, leader lines     |
| `HighlightRegionPrimitive.ts` | Minor — already has pills, add collision awareness            |
| `PriceChart.tsx`              | Confidence filter prop, hover panel mount, PDF mode flag      |
| `TechnicalChart.tsx`          | Confidence threshold toggle UI, indicator legend updates      |
| `ChartLegend.tsx`             | Indicator-family color coding, numbered references            |
| `chart-screenshot.ts`         | PDF mode flag for numbered legend rendering                   |
| `ReportChartPage.tsx`         | Numbered legend table below chart image                       |

### Files to Create

| File                                   | Purpose                                                 |
| -------------------------------------- | ------------------------------------------------------- |
| `primitives/MarkerClusterPrimitive.ts` | Clustered badge that aggregates nearby markers          |
| `primitives/label-collision.ts`        | Collision detection & resolution algorithm              |
| `PatternHoverPanel.tsx`                | Floating panel showing pattern details on cluster hover |

---

## Risk Assessment

- **Regression risk**: Pattern overlay drawing is a mature, well-tested
  feature. Changes must be carefully tested against all pattern types.
- **Performance**: Collision detection adds O(n²) comparisons per render
  frame. With typically <20 patterns this is negligible.
- **PDF compatibility**: React-pdf renders from data, not canvas. The
  chart screenshot captures the canvas state, so overlays render correctly
  as long as they're drawn before the screenshot.
