# Epic 45 — Chart Overlay Declutter & Visual Clarity

## Motivation

Technical indicator overlays on the price chart become illegible when
multiple patterns fire simultaneously. Labels stack on top of each other,
marker arrows pile up at the same candle, and all patterns use the same
green/red/amber color scheme regardless of which indicator system
produced them. In the screenshot that triggered this epic, **9 indicator
labels** (EMA Alignment, Golden Cross, RSI Centerline, EMA Compression,
Bollinger Squeeze, Bollinger Breakout, MACD Centerline, MACD Histogram
Acceleration, V-Shape Recovery) overlapped in a ~100px vertical band,
making none of them readable.

This problem is **amplified in PDF exports** (Epic 44) where the static
chart image has no hover interactivity — whatever is rendered on the
canvas is the final output.

### Design Principles

1. **The chart is for price action** — overlays should _assist_
   reading, not compete with candlesticks
2. **Progressive disclosure** — show summary on chart, details on
   interaction (or legend for PDF)
3. **Indicator identity** — color tells you _which system_ detected
   the pattern; shape tells you _direction_
4. **Confidence hierarchy** — higher confidence = more prominent
5. **PDF-first** — if it looks good in static PDF, it looks good
   everywhere

### Core Questions

| #   | Question                                                                   | Story |
| --- | -------------------------------------------------------------------------- | ----- |
| 1   | What are all the root causes of clutter and how do pro platforms solve it? | 45.0  |
| 2   | What indicator-family color palette avoids confusion with signal colors?   | 45.1  |
| 3   | How should markers be clustered and what expand-on-hover UX works best?    | 45.1  |

### Audit Document

See `docs/research/chart-overlay-clutter-audit.md` for the full UX audit,
root cause analysis, professional platform benchmarks, and proposed
solution architecture.

---

## Phase 0 — Research (Done)

### Story 45.0 — Chart Overlay Clutter UX Audit

**Status: Done**

#### Goal

Perform a comprehensive audit of the current chart overlay system to
identify all sources of visual clutter.

#### Findings (summarized)

1. **Label text stacking** — No collision detection; 9 labels in 100px
2. **Marker arrow pileup** — lightweight-charts stacks markers with no
   avoidance
3. **No indicator-family colors** — Everything is green/red/amber
4. **Fixed label position** — TrendlinePrimitive labels at midpoint
   offset -8px, no awareness of neighbors
5. **No confidence filtering** — All recent patterns shown regardless
   of confidence
6. **No grouping** — Individual labels where a count badge would suffice

#### Deliverable

- [x] `docs/research/chart-overlay-clutter-audit.md`

---

## Phase 1 — Indicator Family Colors & Confidence Filtering

### Story 45.1 — Indicator-Family Color Palette & Confidence Threshold

#### Goal

Replace the signal-based color scheme (green/red/amber for all patterns)
with an **indicator-family color scheme** where each indicator system has
a unique color. Signal direction is communicated via marker shape (↑/↓/●)
instead of color. Add a confidence threshold that hides low-confidence
patterns by default.

#### Color Palette

| Family      | Color        | Hex       | CSS class          |
| ----------- | ------------ | --------- | ------------------ |
| EMA         | Cyan         | `#06b6d4` | `text-cyan-500`    |
| Bollinger   | Blue         | `#3b82f6` | `text-blue-500`    |
| RSI         | Purple       | `#a855f7` | `text-purple-500`  |
| MACD        | Emerald      | `#10b981` | `text-emerald-500` |
| Volume      | Slate        | `#94a3b8` | `text-slate-400`   |
| AI (Gemini) | Signal-based | green/red | existing           |

Direction encoding:

- **Bullish** → `arrowUp` shape, filled marker
- **Bearish** → `arrowDown` shape, filled marker
- **Neutral** → `circle` shape, hollow marker

#### Task List

1. **Add `indicator` field to `TechnicalPattern` type** (optional,
   backward compatible) — values: `"ema"`, `"bollinger"`, `"rsi"`,
   `"macd"`, `"volume"`, `"ai"`, or `undefined` (falls back to
   signal-based color).

2. **Create `INDICATOR_FAMILY_COLORS` constant** in
   `PatternMarkerHelper.ts` — maps indicator family → hex color.

3. **Update `createPatternOverlays()`** — Use family color when
   `pattern.indicator` is set; fall back to signal color for AI patterns.

4. **Update `indicatorPatternsToOverlays()` in `TechnicalChart.tsx`** —
   Set `indicator` field based on the source detector.

5. **Add `minConfidence` prop to `PriceChart`** — Filter patterns below
   threshold before creating overlays. Default: `0.6`.

6. **Add confidence toggle to `TechnicalChart`** — "Show all signals"
   checkbox that sets threshold to 0.

7. **Update `ChartLegend.tsx`** — Show color-coded indicator family
   legend instead of individual pattern dots.

#### Testing Plan

- Unit test: `INDICATOR_FAMILY_COLORS` maps all families
- Unit test: `createPatternOverlays` uses family color
- Unit test: confidence filtering removes low-confidence patterns
- Snapshot: `ChartLegend` with family colors

#### Acceptance Criteria

- [ ] Each indicator family has its own color
- [ ] Direction communicated by shape, not color
- [ ] Patterns below 0.6 confidence hidden by default
- [ ] Toggle reveals all patterns
- [ ] Legend shows indicator families, not individual patterns
- [ ] 4+ tests passing

---

## Phase 2 — Marker Clustering & Label Collision

### Story 45.2 — Marker Cluster Aggregation

#### Goal

When multiple series markers would overlap (same candle or adjacent
candles), aggregate them into a single **cluster badge** showing a count.
Hover/click expands to show individual patterns.

#### Task List

1. **Create `primitives/marker-cluster.ts`**
   - `clusterMarkers(markers[], pixelThreshold)` — Groups markers
     within N pixels horizontally. Default threshold: 40px.
   - Returns: `ClusteredMarker[]` where each cluster has a `count`,
     `dominantSignal`, `dominantFamily`, and `items[]`.

2. **Update `PatternMarkerHelper.ts`**
   - After building the markers array, run `clusterMarkers()`.
   - For single-item clusters, render normal marker.
   - For multi-item clusters, render a single marker with text
     `"×N"` (e.g., "×5 ▲") and the dominant family color.

3. **Create `PatternHoverPanel.tsx`**
   - React component: floating panel positioned near the cluster
   - Shows list of patterns in the cluster with name, confidence,
     family color, and signal direction
   - Appears on hover/click, dismisses on mouse leave or Escape
   - Dark theme, matches app design system

4. **Wire hover panel in `PriceChart.tsx`**
   - On crosshair hover over a cluster marker, show the panel
   - Position panel above the marker, clamped to chart bounds

#### Testing Plan

- Unit test: `clusterMarkers` groups correctly at various thresholds
- Unit test: single marker not clustered
- Unit test: adjacent markers clustered, distant markers separate
- Render test: PatternHoverPanel shows pattern list

#### Acceptance Criteria

- [ ] Overlapping markers consolidated into count badges
- [ ] Hover reveals individual patterns in floating panel
- [ ] Single markers render normally (no regression)
- [ ] Cluster uses dominant indicator family color
- [ ] 4+ tests passing

---

### Story 45.3 — Trendline Label Collision Avoidance

#### Goal

Prevent trendline and region labels from overlapping by implementing a
label collision resolution algorithm.

#### Task List

1. **Create `primitives/label-collision.ts`**
   - `resolveCollisions(labels[])` — Takes array of
     `{x, y, width, height, id}` rects, returns adjusted positions.
   - Simple greedy algorithm: sort by y, then nudge overlapping labels
     vertically by the overlap amount + 4px padding.
   - Run after all primitives compute their label positions.

2. **Add label background pill to `TrendlinePrimitive`**
   - Dark semi-transparent background rectangle behind label text
   - Matches `HighlightRegionPrimitive` pill style
   - Improves legibility against mixed candle backgrounds

3. **Add leader lines**
   - When a label is nudged >12px from its natural position, draw a
     thin 1px line from the label to the trendline midpoint
   - Uses the trendline's color at 40% opacity

4. **Coordinate collision resolution across primitives**
   - In `PriceChart.tsx`, after all overlays are attached, collect
     label positions and run collision resolution
   - Pass adjusted positions back to primitives via a new
     `setLabelOffset(dy)` method

#### Testing Plan

- Unit test: `resolveCollisions` with non-overlapping labels (no change)
- Unit test: `resolveCollisions` with 3 overlapping labels (separated)
- Unit test: leader line threshold (>12px offset triggers line)

#### Acceptance Criteria

- [ ] Overlapping trendline labels nudged apart
- [ ] Background pills improve readability
- [ ] Leader lines connect displaced labels to their lines
- [ ] No visual regression for non-overlapping patterns
- [ ] 3+ tests passing

---

## Phase 3 — PDF-Specific Legend System

### Story 45.4 — Numbered Legend for PDF Chart Pages

#### Goal

In PDF mode (chart screenshots for report), replace inline text labels
with numbered reference markers and render a structured legend table
below the chart image.

#### Task List

1. **Add `pdfMode` prop to `PriceChart`**
   - When true: markers show circled numbers instead of text labels
   - Trendline labels show circled numbers instead of pattern names
   - Region labels show circled numbers instead of names

2. **Update `PatternMarkerHelper.ts` for PDF mode**
   - Accept `pdfMode` boolean parameter
   - In PDF mode: marker text = `"①"`, `"②"`, etc. (or just `"1"`, `"2"`)
   - Return a `legendEntries[]` alongside the overlays:
     `{ number, name, type, confidence, indicator, description }`

3. **Update `chart-screenshot.ts`**
   - Pass `pdfMode: true` when rendering off-screen charts
   - Capture the `legendEntries[]` alongside the screenshot data URL

4. **Update `ReportChartPage.tsx`**
   - Render a numbered legend table below the chart image
   - Columns: #, Pattern Name, Signal, Confidence, Description
   - Use indicator-family color for the row accent

5. **Update `TimeframeReportData` type**
   - Add optional `legendEntries` field

#### Testing Plan

- Unit test: PDF mode produces numbered markers
- Unit test: legendEntries generated correctly
- Render test: ReportChartPage with legend table

#### Acceptance Criteria

- [ ] PDF charts use numbered markers instead of text
- [ ] Legend table below chart maps numbers to pattern names
- [ ] Legend includes confidence % and signal direction
- [ ] Chart image stays clean and uncluttered in PDFs
- [ ] 3+ tests passing

---

## Phase 4 — Polish & Integration

### Story 45.5 — Visual Polish & Regression Testing

#### Goal

End-to-end visual verification, performance validation, and regression
testing across all chart rendering modes.

#### Task List

1. **Interactive mode verification**
   - Verify indicator-family colors render correctly
   - Verify cluster badges aggregate properly
   - Verify hover panel shows correct patterns
   - Verify confidence filter toggle works
   - Verify trendline labels don't overlap

2. **PDF mode verification**
   - Generate PDF with multiple patterns per timeframe
   - Verify numbered markers are legible
   - Verify legend table is accurate and formatted
   - Verify chart image is clean at 1200×600px

3. **Regression testing**
   - Run full test suite (250+ tests must pass)
   - Verify no regressions in existing chart rendering
   - Verify no regressions in PDF generation

4. **Performance check**
   - Measure render time with 20+ simultaneous patterns
   - Collision resolution should add <5ms per frame

#### Acceptance Criteria

- [ ] Interactive chart is readable with 10+ simultaneous patterns
- [ ] PDF chart is readable with 10+ simultaneous patterns
- [ ] All existing tests pass
- [ ] No visible rendering regressions
- [ ] Chart render performance unchanged

---

## Summary

| Story | Title                                          | Phase          | Status      |
| ----- | ---------------------------------------------- | -------------- | ----------- |
| 45.0  | Chart Overlay Clutter UX Audit                 | 0 — Research   | Done        |
| 45.1  | Indicator-Family Colors & Confidence Threshold | 1 — Colors     | Not Started |
| 45.2  | Marker Cluster Aggregation                     | 2 — Clustering | Not Started |
| 45.3  | Trendline Label Collision Avoidance            | 2 — Collision  | Not Started |
| 45.4  | Numbered Legend for PDF Chart Pages            | 3 — PDF Legend | Not Started |
| 45.5  | Visual Polish & Regression Testing             | 4 — Polish     | Not Started |

## Dependency Graph

```
45.0 (audit — Done)
 ├── 45.1 (family colors + confidence filter)
 │    ├── 45.2 (marker clustering — uses family colors)
 │    └── 45.3 (label collision — uses label pills)
 │         └── 45.4 (PDF numbered legend — uses all above)
 └────────────── 45.5 (polish — depends on all)
```
