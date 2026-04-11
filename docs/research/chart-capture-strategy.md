# Chart Screenshot Capture Strategy — Story 44.2

## Technical Context

### Current Architecture

- `PriceChart.tsx` creates a lightweight-charts `IChartApi` instance via `createChart()`
- `chartRef` is a local `useRef<IChartApi | null>` — **not exposed** to parent components
- `TechnicalChart.tsx` wraps `PriceChart` and adds timeframe switching, indicator toggles, and pattern filtering
- Chart renders into a `<div ref={containerRef}>` DOM element
- Candle data fetched via `useHistoricalData(ticker, period)` hook

### `takeScreenshot()` API

From `lightweight-charts` v5.1.0 typings:

```typescript
takeScreenshot(addTopLayer?: boolean, includeCrosshair?: boolean): HTMLCanvasElement;
```

- Returns an `HTMLCanvasElement` — not a blob or data URL
- `addTopLayer: true` includes pattern overlays (trendlines, markers, highlight regions)
- `includeCrosshair: false` (default) omits the crosshair cursor
- Canvas can be converted: `canvas.toDataURL('image/png')` → base64 data URL string

---

## Research Results

### Q1: Off-Screen Rendering

**Can we render lightweight-charts in hidden DOM and capture screenshots?**

**Yes.** lightweight-charts renders into a standard `<div>` container via `createChart(containerElement)`. The container does not need to be visible — it needs to be **in the DOM** with non-zero dimensions. A container placed off-screen (`position: fixed; left: -9999px; top: -9999px`) or hidden behind another element will work as long as it has explicit `width` and `height`.

**Approach**: Create a temporary container div, attach it to `document.body`, set fixed dimensions, render the chart with full data, wait for rendering, screenshot, clean up.

**Validation**: lightweight-charts uses `HTMLCanvasElement` internally via `<canvas>` elements inside the container div. Canvas rendering works regardless of visibility — it's the same path used for off-screen canvas rendering in web workers (though we don't need workers here).

### Q2: Sequential vs. Parallel Rendering

**Recommendation: Sequential (one chart at a time).**

| Approach   | Memory      | Time        | Complexity |
| ---------- | ----------- | ----------- | ---------- |
| Sequential | ~30MB peak  | ~6-8s total | Simple     |
| Parallel   | ~180MB peak | ~3-4s total | Complex    |

Each lightweight-charts instance creates:

- 2-3 `<canvas>` elements (main, overlay, crosshair)
- WebGL or 2D rendering context
- Internal data structures for candle/line series

At 1200×600px, each chart's canvases use ~30MB of pixel buffer. Running 6 simultaneously would spike to ~180MB.

**Sequential approach**:

1. Create container → create chart → add data + overlays → wait → screenshot → destroy chart → remove container
2. Repeat for next timeframe
3. Total time: ~1s per chart setup + render, plus ~0.2s for screenshot

The sequential approach is simpler, uses constant memory, and 6-8 seconds is acceptable for a user-initiated export action with progress feedback.

### Q3: Chart Dimensions for PDF

**Recommendation: 1200 × 600 pixels (2:1 aspect ratio)**

| Dimension | PDF Page Width   | DPI at Print | Image Quality |
| --------- | ---------------- | ------------ | ------------- |
| 800×400   | 6.5" (w/margins) | ~123 DPI     | Adequate      |
| 1200×600  | 6.5"             | ~185 DPI     | Good          |
| 1600×800  | 6.5"             | ~246 DPI     | Excellent     |
| 2400×1200 | 6.5"             | ~369 DPI     | Overkill      |

1200×600 provides good visual quality when embedded in a letter-size PDF page (8.5×11" with 1" margins = 6.5" usable width). It balances quality vs. file size and rendering speed.

The `@react-pdf/renderer` `<Image>` component will scale the image to fit within its style dimensions, so the actual pixel dimensions determine the quality at the rendered size.

Data URL size per chart at 1200×600:

- PNG: ~200-400KB (depending on candle density)
- JPEG (quality 0.92): ~100-200KB
- **Use PNG** for crisp lines and text on the chart

### Q4: Indicator Coverage

**Recommendation: Enable all 4 main indicators (EMA 9, EMA 21, Bollinger Bands, Volume MA). Do NOT include RSI/MACD as separate panes.**

Rationale:

- The PDF chart is static — users can't toggle indicators. Show the most informative overlay set.
- EMA 9/21 and Bollinger Bands are the core trend indicators that appear on the main price chart
- Volume MA adds context without cluttering
- RSI and MACD render in **separate sub-panes** below the chart — this splits the fixed height and makes both the price chart and the indicator pane too small at 600px total
- The LLM-generated `indicators` list in the deep dive already provides RSI/MACD readings as text — no need to duplicate in the chart image

If we want RSI/MACD indicators visible, a future enhancement could render them as a second screenshot below the main chart.

### Q5: PriceChart Ref Exposure Design

**Recommendation: `forwardRef` + `useImperativeHandle`**

Minimal change to `PriceChart.tsx`:

```typescript
export interface PriceChartHandle {
  /** Returns a PNG data URL of the chart, or null if chart not ready */
  takeScreenshot: () => string | null;
  /** Returns the underlying chart API (for advanced use) */
  getChartApi: () => IChartApi | null;
}

const PriceChart = forwardRef<PriceChartHandle, PriceChartProps>(
  function PriceChart(props, ref) {
    const chartRef = useRef<IChartApi | null>(null);

    useImperativeHandle(ref, () => ({
      takeScreenshot: () => {
        const chart = chartRef.current;
        if (!chart) return null;
        const canvas = chart.takeScreenshot(true, false);
        return canvas.toDataURL("image/png");
      },
      getChartApi: () => chartRef.current,
    }));

    // ... rest of existing component unchanged
  },
);
```

**TechnicalChart.tsx forwarding**:

```typescript
export interface TechnicalChartHandle {
  takeScreenshot: () => string | null;
}

const TechnicalChart = forwardRef<TechnicalChartHandle, TechnicalChartProps>(
  function TechnicalChart(props, ref) {
    const priceChartRef = useRef<PriceChartHandle>(null);

    useImperativeHandle(ref, () => ({
      takeScreenshot: () => priceChartRef.current?.takeScreenshot() ?? null,
    }));

    // ... renders <PriceChart ref={priceChartRef} ... />
  },
);
```

This is a **non-breaking change** — existing code that renders `<PriceChart>` without a ref is unaffected. The `forwardRef` wrapper adds opt-in ref support.

---

## Screenshot Capture Flow

```
User clicks "Export PDF"
  │
  ├─ 1. Aggregate report data (fetch candles for all 6 timeframes)
  │
  ├─ 2. For each timeframe (sequential):
  │     a. Create hidden container div (1200×600, off-screen)
  │     b. Mount PriceChart with:
  │        - candles for this timeframe
  │        - patterns for this timeframe
  │        - support/resistance levels
  │        - indicators: { ema9: true, ema21: true, bollinger: true, volumeMA: true }
  │        - options context lines (max pain, OI walls)
  │     c. Wait for chart to render (requestAnimationFrame × 2 + 200ms safety)
  │     d. Call ref.takeScreenshot() → data URL
  │     e. Store in screenshots map: { "1D": "data:image/png;..." }
  │     f. Unmount chart, remove container
  │
  ├─ 3. Build ReportDocument with data + screenshots
  │
  └─ 4. Generate PDF blob via @react-pdf/renderer → trigger download
```

**Estimated total time**: 8-12 seconds (1-2s aggregation + 6-8s screenshots + 1-2s PDF generation)

---

## Edge Cases

| Case                             | Handling                                           |
| -------------------------------- | -------------------------------------------------- |
| No candle data for timeframe     | Skip chart, show "Data unavailable" text           |
| Chart creation fails             | Catch error, skip to next timeframe                |
| `takeScreenshot()` returns blank | Retry once after 500ms delay; if still blank, skip |
| Very large candle dataset        | lightweight-charts handles this natively           |
| Browser tab backgrounded         | Canvas rendering still works when not visible      |
| Low-memory device                | Sequential rendering limits peak memory            |
