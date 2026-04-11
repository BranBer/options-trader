# Epic 44 — Deep Dive PDF Report Export

## Motivation

Every deep dive analysis produces a rich, data-dense breakdown of a whale
trade: market narrative, technical patterns across 6 timeframes, support/
resistance levels, indicator readings, options context (IV, greeks, OI walls,
GEX), entry/exit strategy, risk assessment, earnings cascade context, and
educational notes.

Today that analysis **only lives in the browser**. Users who want to:

- Archive an analysis for later review
- Share findings with trading partners
- Print a consolidated report for offline study
- Compare analyses side-by-side from different dates

…have no way to do so. This epic adds a one-click **PDF export** that
captures the full deep dive — including chart screenshots for all 6
timeframes with technical patterns and indicators overlaid — into a
polished, branded report.

### Core Questions

| #   | Question                                                                              | Story |
| --- | ------------------------------------------------------------------------------------- | ----- |
| 1   | What data and UI sections must the report contain? What's the full content inventory? | 44.0  |
| 2   | Which PDF library best fits our stack? Ghost-element HTML→PDF vs react-pdf vs others? | 44.1  |
| 3   | How do we capture charts across all 6 timeframes as images for the PDF?               | 44.2  |
| 4   | How should the report be laid out, paginated, and styled?                             | 44.3  |

---

## Phase 0 — Research

### Story 44.0 — Deep Dive Content Inventory

**No code changes — research output only.**

#### Goal

Catalog every piece of data and every UI section in the deep dive analysis
that must appear in the exported PDF report.

#### Research Questions

1. **What are the exact data fields in `DeepDiveAnalysis`?**
   - Enumerate every schema field from `deepDiveAnalysisSchema` in
     `src/types/analysis.ts`
   - Include nested objects: `options_context`, `entry_exit`,
     `risk_assessment`, `educational_notes`
   - Include timeframe-specific data: `timeframe_patterns` map,
     `support_resistance`, `indicators`

2. **What UI sections does `WhaleDeepDive.tsx` render?**
   - Header (ticker, whale trade summary, freshness badge)
   - Active cascade banner (conditional)
   - Market narrative
   - TechnicalChart (6-timeframe chart with patterns, S/R, indicators)
   - Technical patterns list (per-timeframe)
   - Technical indicators grid
   - OptionsStatsPanel (IV, greeks, OI walls, GEX)
   - Entry/exit strategy
   - Global events connection
   - Risk assessment
   - Educational notes
   - Disclaimer

3. **What supplementary data is available per-timeframe?**
   - Candle data (fetched per period via `/api/market?ticker=X&period=P`)
   - `timeframe_patterns` map: `1D|1W|1M|3M|6M|1Y → TechnicalPattern[]`
   - Client-side indicator detection: `detectAllIndicatorPatterns()`
   - Active indicators: EMA 9, EMA 21, Bollinger, Volume MA, RSI, MACD

4. **What associated data lives outside `DeepDiveAnalysis`?**
   - `TradeRecommendation` fields (confidence breakdown, composite score)
   - `WhaleAlert` originating the analysis (premium, trade type, amounts)
   - `ActiveCascadeEntry` data (upstream nexus, EPS surprise)
   - Short interest data (if populated)

#### Deliverables

- `docs/research/pdf-content-inventory.md`
  - Complete field-by-field inventory of all data to include
  - Section-by-section mapping from UI → PDF report
  - Per-timeframe data collection requirements
  - Associated data sources beyond the core analysis

#### Acceptance Criteria

- [x] Every field in `DeepDiveAnalysis` accounted for
- [x] All 12+ WhaleDeepDive UI sections mapped
- [x] Timeframe-specific data requirements documented
- [x] Supplementary data (cascade, whale alert, confidence) cataloged

**Output:** `docs/research/pdf-content-inventory.md`

---

### Story 44.1 — PDF Library Evaluation

**No code changes — research output only.**

#### Goal

Evaluate PDF generation approaches for a client-side, React/Next.js
application that needs to produce multi-page reports with embedded chart
images, styled text, and tables.

#### Approaches to Evaluate

| Approach                         | Library                | Strategy                                                |
| -------------------------------- | ---------------------- | ------------------------------------------------------- |
| **A. Ghost element → image PDF** | `html2pdf.js`          | Render hidden DOM → html2canvas → jsPDF                 |
| **B. React PDF primitives**      | `@react-pdf/renderer`  | Build PDF-specific React components → native PDF output |
| **C. Low-level PDF builder**     | `jsPDF` (direct)       | Programmatic API: `doc.text()`, `doc.addImage()`, etc.  |
| **D. Headless browser**          | Puppeteer / Playwright | Server-side HTML → PDF via Chrome                       |

#### Evaluation Criteria

| Criterion              | Weight | Notes                                       |
| ---------------------- | ------ | ------------------------------------------- |
| Text selectable in PDF | High   | Users need to copy ticker names, prices     |
| Chart image embedding  | High   | Must embed `takeScreenshot()` canvas output |
| Client-side only       | High   | No server dependency for PDF generation     |
| Styling fidelity       | Med    | Match app's dark theme and layout           |
| Page break control     | Med    | Clean section breaks, no split charts       |
| Bundle size impact     | Med    | Keep client bundle reasonable               |
| Active maintenance     | Med    | Library health and release cadence          |
| File size output       | Low    | Smaller PDFs preferred but not critical     |

#### Research Questions

1. Can `html2pdf.js` handle a multi-page report with 6 chart images
   without hitting HTML5 canvas size limits?
2. Does `@react-pdf/renderer` Image component accept `data:image/png`
   base64 strings from `canvas.toDataURL()`?
3. What's the bundle size impact of each approach?
4. How does each handle dark backgrounds / custom fonts?
5. Is there a hybrid approach (e.g. chart images + react-pdf text)?

#### Deliverables

- `docs/research/pdf-library-evaluation.md`
  - Pros/cons matrix for all 4 approaches
  - Proof-of-concept findings for top 2 candidates
  - Recommended approach with rationale
  - Bundle size and dependency audit

#### Acceptance Criteria

- [x] All 4 approaches evaluated against criteria matrix
- [x] Canvas size limits tested for Approach A
- [x] Image embedding confirmed for Approach B
- [x] Clear recommendation with rationale

**Output:** `docs/research/pdf-library-evaluation.md`

---

### Story 44.2 — Chart Screenshot Capture Strategy

**No code changes — research output only.**

#### Goal

Design the approach for rendering lightweight-charts instances for all 6
timeframes and capturing them as images suitable for PDF embedding.

#### Technical Context

- `PriceChart.tsx` uses `createChart()` from lightweight-charts v5.1.0
- Chart instance `IChartApi` has `takeScreenshot(addTopLayer?, includeCrosshair?): HTMLCanvasElement`
- `chartRef` is currently **not exposed** to parent components
- Each timeframe requires different candle data (fetched from Yahoo Finance)
- Patterns are drawn via `PatternMarkerHelper.createPatternOverlays()`
- Indicators (EMA, Bollinger, RSI, MACD) are computed client-side and added as LineSeries
- Support/resistance levels drawn as horizontal lines
- Options context lines (max pain, OI walls, GEX flip) drawn conditionally

#### Research Questions

1. **Off-screen rendering**: Can we create lightweight-charts instances in
   hidden DOM elements, render data + patterns + indicators, then call
   `takeScreenshot()` — all without the chart being visible to the user?
2. **Sequential vs. parallel**: Should we render all 6 charts simultaneously
   (memory concern) or sequentially (time concern)?
3. **Chart sizing**: What dimensions produce good PDF output? Standard
   PriceChart is 400px height — should the PDF version be wider/taller?
4. **Indicator coverage**: Do we need ALL 6 indicators enabled on each
   timeframe's chart, or should we match the user's current toggle state?
5. **Ref exposure**: What's the minimal change to PriceChart.tsx to expose
   the chart instance — `forwardRef` + `useImperativeHandle` vs. callback?

#### Deliverables

- `docs/research/chart-capture-strategy.md`
  - Off-screen rendering proof-of-concept results
  - Recommended chart dimensions for PDF
  - Sequential vs. parallel rendering decision
  - Indicator strategy (all-on vs. user-configured)
  - PriceChart ref exposure design

#### Acceptance Criteria

- [x] Off-screen takeScreenshot() confirmed working or alternative found
- [x] Chart dimensions recommendation with rationale
- [x] Memory/timing implications documented
- [x] PriceChart modification scope defined

**Output:** `docs/research/chart-capture-strategy.md`

---

### Story 44.3 — Report Layout & Pagination Design

**No code changes — research output only.**

#### Goal

Design the page layout, section ordering, pagination rules, and visual
style for the PDF report — producing a mockup or detailed wireframe.

#### Design Constraints

- Must match app's dark theme (zinc-900 background, white/gray text)
- Must be readable when printed on white paper (consider light theme variant)
- Charts should be full-width within margins, never split across pages
- Tables (entry/exit, indicators, patterns) should avoid page splits
- Cover page with branding, ticker, date, key metrics summary
- Footer with page numbers and disclaimer

#### Section Ordering (Proposed)

| Page(s) | Section                                              |
| ------- | ---------------------------------------------------- |
| 1       | Cover page: ticker, date, whale summary, key metrics |
| 2       | Market narrative + cascade banner (if active)        |
| 3       | 1-Day chart + patterns + indicators                  |
| 4       | 1-Week chart + patterns + indicators                 |
| 5       | 1-Month chart + patterns + indicators                |
| 6       | 3-Month chart + patterns + indicators                |
| 7       | 6-Month chart + patterns + indicators                |
| 8       | 1-Year chart + patterns + indicators                 |
| 9       | Options context (IV, greeks, OI, GEX)                |
| 10      | Entry/exit strategy + risk assessment                |
| 11      | Global events + educational notes                    |
| 12      | Disclaimer footer                                    |

#### Research Questions

1. Should charts and their pattern lists share a page, or should each
   timeframe get its own dedicated page?
2. Do we support both dark and light PDF themes, or pick one?
3. Should the cover page include a confidence score summary / breakdown?
4. How do we handle timeframes with no detected patterns?
5. What font(s) work well in react-pdf / jsPDF for a professional look?

#### Deliverables

- `docs/research/pdf-report-layout.md`
  - Detailed wireframe (ASCII art or description) for each page
  - Typography decisions (font family, sizes, weights)
  - Color palette for PDF (dark vs. light vs. adaptive)
  - Pagination rules (break-before, avoid-split)
  - Cover page design

#### Acceptance Criteria

- [x] Every deep dive section assigned to a report page
- [x] Pagination rules defined for all section types
- [x] Color/typography decisions documented
- [x] Cover page layout specified

**Output:** `docs/research/pdf-report-layout.md`

---

## Phase 1 — Core Infrastructure

### Story 44.4 — Install PDF Library & Expose Chart Ref

#### Goal

Install the chosen PDF generation library and modify `PriceChart.tsx` to
expose its chart instance via ref — enabling external screenshot capture.

#### Task List

1. **Install `@react-pdf/renderer`** (or chosen library from 44.1)

   ```bash
   npm install @react-pdf/renderer
   ```

   - Verify no peer dependency conflicts with React 19 / Next.js 16
   - Run `npm ls @react-pdf/renderer` to confirm clean install

2. **Modify `PriceChart.tsx` to expose chart ref**
   - Wrap component with `forwardRef`
   - Add `useImperativeHandle` hook exposing:
     ```typescript
     export interface PriceChartHandle {
       takeScreenshot: () => string | null; // returns data URL
     }
     ```
   - Implementation: call `chartRef.current?.takeScreenshot(true)`,
     convert returned canvas to `canvas.toDataURL('image/png')`
   - Preserve all existing functionality — no behavior changes

3. **Update `TechnicalChart.tsx`** to forward the ref through to PriceChart

   ```typescript
   export interface TechnicalChartHandle {
     takeScreenshot: () => string | null;
   }
   ```

4. **Add type exports** to make handles importable

#### Testing Plan

- **Unit test**: `PriceChart ref exposure`
  - Render PriceChart with ref in jsdom
  - Verify `ref.current.takeScreenshot` is a function
  - Note: `takeScreenshot()` returns null in jsdom (no real canvas) —
    test that it handles gracefully

- **Unit test**: `TechnicalChart ref forwarding`
  - Render TechnicalChart with ref
  - Verify ref is passed through to PriceChart

- **Integration test**: Verify existing chart rendering is unaffected
  - Existing PriceChart tests still pass
  - No TypeScript errors in components that use PriceChart/TechnicalChart

#### Acceptance Criteria

- [x] PDF library installed, `import { Document } from '@react-pdf/renderer'` compiles
- [x] `PriceChartHandle.takeScreenshot()` returns data URL string
- [x] `TechnicalChartHandle` forwards to PriceChart
- [x] All existing tests pass
- [x] No TypeScript errors

---

### Story 44.5 — Report Data Aggregation Service

#### Goal

Create a service that collects ALL data needed for the PDF report — deep
dive analysis, candle data for all 6 timeframes, patterns per timeframe,
cascade context, and whale alert metadata — into a single structured object.

#### Task List

1. **Define `ReportData` type** in `src/types/report.ts`

   ```typescript
   export interface TimeframeReportData {
     timeframe: "1D" | "1W" | "1M" | "3M" | "6M" | "1Y";
     period: "1d" | "1wk" | "1mo" | "3mo" | "6mo" | "1y";
     candles: CandleData[];
     patterns: TechnicalPattern[];
     indicatorPatterns: TechnicalPattern[];
   }

   export interface ReportData {
     ticker: string;
     generatedAt: string;
     deepDive: DeepDiveAnalysis;
     recommendation: TradeRecommendation;
     timeframes: TimeframeReportData[];
     cascadeContext: ActiveCascadeEntry[] | null;
     whaleAlert: WhaleAlert | null;
     chartScreenshots: Record<string, string>; // timeframe → data URL
   }
   ```

2. **Create `src/lib/services/report-data-aggregator.ts`**
   - `aggregateReportData(ticker: string, deepDive: DeepDiveAnalysis, recommendation: TradeRecommendation): Promise<ReportData>`
   - Fetch candle data for all 6 timeframes via existing market API
   - Extract patterns per timeframe from `deepDive.timeframe_patterns`
   - Run `detectAllIndicatorPatterns()` per timeframe for client-side patterns
   - Fetch active cascades if available
   - Fetch whale alert metadata
   - Return consolidated `ReportData`

3. **Create `src/hooks/useReportData.ts`**
   - `useReportData(ticker, deepDive, recommendation, enabled)` hook
   - Uses React Query with manual trigger (`enabled` flag)
   - Returns `{ data: ReportData, isLoading, error }`

#### Testing Plan

- **Unit test**: `report-data-aggregator.test.ts`
  - Test with mock deep dive data containing `timeframe_patterns`
  - Verify all 6 timeframes are populated
  - Verify patterns are correctly filtered per timeframe
  - Test with missing `timeframe_patterns` (graceful fallback to empty arrays)
  - Test with null cascade context
  - Test error handling when candle fetch fails for one timeframe

#### Acceptance Criteria

- [x] `ReportData` type covers all PDF content
- [x] Aggregator fetches candles for all 6 timeframes
- [x] Patterns correctly split by timeframe
- [x] Hook provides loading/error states
- [x] 11 unit tests passing (6+ required)

---

### Story 44.6 — Chart Screenshot Capture Utility

#### Goal

Build a utility that programmatically renders a PriceChart for each
timeframe in a hidden DOM container and captures screenshots as data URLs.

#### Task List

1. **Create `src/lib/services/chart-screenshot.ts`**
   - Export `captureChartScreenshots(reportData: ReportData): Promise<Record<string, string>>`
   - For each timeframe in `reportData.timeframes`:
     a. Create a temporary hidden container div (`position: fixed; left: -9999px`)
     b. Set container width to 1200px, height to 600px (optimized for PDF)
     c. Render a PriceChart instance with:
     - Candle data for that timeframe
     - All technical patterns for that timeframe
     - Support/resistance levels
     - All indicators enabled (EMA 9/21, Bollinger, Volume MA)
     - Options context lines (max pain, OI walls)
       d. Wait for chart to finish rendering (requestAnimationFrame + small delay)
       e. Call `takeScreenshot(true)` → canvas → `canvas.toDataURL('image/png')`
       f. Unmount chart and remove container
   - Return map of timeframe → data URL string

2. **Create `ChartScreenshotRenderer` React component**
   - Hidden component that accepts `ReportData` and an `onComplete` callback
   - Renders PriceChart instances one at a time (sequential to manage memory)
   - Uses ref to call `takeScreenshot()` after each render
   - Calls `onComplete(screenshots)` when all 6 are captured
   - Component self-destructs after completion

3. **Handle edge cases**
   - Timeframe with no candle data → skip chart, use placeholder text
   - Chart render timeout (5s max per timeframe)
   - Memory cleanup: ensure chart instances are fully disposed

#### Testing Plan

- **Unit test**: `chart-screenshot.test.ts`
  - Test that the utility creates containers at correct dimensions
  - Test cleanup (containers removed after capture)
  - Test timeout handling
  - Test with empty candle data for a timeframe
  - Note: actual screenshot content can't be tested in jsdom — test the
    orchestration logic and error handling

- **Integration test** (manual):
  - Render ChartScreenshotRenderer with real data
  - Verify 6 data URLs are produced
  - Verify images are valid PNGs

#### Acceptance Criteria

- [x] Screenshots captured for all 6 timeframes
- [x] Charts render at 1200×600px (or configured dimensions)
- [x] Patterns, indicators, and S/R levels visible in screenshots
- [x] Memory properly cleaned up (no leaked DOM nodes)
- [x] Handles missing candle data gracefully
- [x] 5 unit tests passing (4+ required)

---

## Phase 2 — PDF Document Component

### Story 44.7 — PDF Report Document Component (Cover + Narrative)

#### Goal

Build the first part of the `@react-pdf/renderer` Document component —
cover page and market narrative sections.

#### Task List

1. **Create `src/components/report/ReportDocument.tsx`**
   - Root component: `<Document>` with metadata (title, author, subject)
   - Export as `ReportDocument` accepting `ReportData` props

2. **Build cover page (`ReportCoverPage.tsx`)**
   - Full page with:
     - App branding / title ("Options Dashboard — Deep Dive Report")
     - Ticker name (large, bold)
     - Analysis date and freshness
     - Whale trade summary (one-liner)
     - Key metrics summary box:
       - Composite confidence score
       - Recommended action (bullish/bearish)
       - Risk level
       - Recommended option type + strike
     - Cascade banner (if active) — nexus ticker, direction, EPS surprise
   - Dark-themed styling (zinc-900 background, white text) — or light
     theme based on 44.3 research decision

3. **Build narrative page (`ReportNarrativePage.tsx`)**
   - Market narrative section (full text)
   - Global events connection section
   - Cascade context details (if present)

4. **Create shared PDF style utilities**
   - `src/components/report/styles.ts` — shared `StyleSheet.create()` with:
     - Color palette constants
     - Typography scale (heading, subheading, body, caption)
     - Spacing scale
     - Badge styles (bullish/bearish/neutral, risk levels)
     - Page template (margins, header, footer with page numbers)

#### Testing Plan

- **Unit test**: `ReportDocument.test.ts`
  - Render ReportDocument with mock ReportData
  - Verify it produces a valid Document (no render errors)
  - Test with minimal data (empty cascade, empty patterns)
  - Test with full data (all fields populated)

- **Snapshot test**: Render cover page, verify structure matches expected layout

#### Acceptance Criteria

- [x] Cover page renders with ticker, date, key metrics
- [x] Narrative page renders market narrative and global events
- [x] Cascade banner conditionally renders
- [x] Shared styles defined and reusable
- [x] Page numbers in footer
- [x] 7 unit tests passing (3+ required)

---

### Story 44.8 — PDF Chart Pages (6 Timeframes)

#### Goal

Build the per-timeframe chart pages — each containing the chart screenshot,
technical pattern list, and indicator readings for that timeframe.

#### Task List

1. **Create `ReportChartPage.tsx`**
   - Accepts: `timeframe`, `chartScreenshot` (data URL), `patterns`, `indicators`
   - Layout:
     - Page header: timeframe label ("1-Day Analysis", "1-Week Analysis", etc.)
     - Chart image: full-width `<Image src={chartScreenshot} />`
     - Pattern summary table:
       - Columns: Pattern Name | Type (badge) | Confidence | Price Target
       - Rows: all patterns for this timeframe
       - "No patterns detected" message if empty
     - Indicator readings grid:
       - 2-column layout: Name + Value | Signal (badge) + Explanation
       - All indicators from `deepDive.indicators` rendered

2. **Render 6 chart pages in `ReportDocument.tsx`**
   - Loop over `reportData.timeframes`
   - For each: render `ReportChartPage` with matching screenshot
   - Handle missing screenshots gracefully (show "Chart unavailable" placeholder)

3. **Style pattern/indicator badges**
   - Bullish: green background
   - Bearish: red background
   - Neutral: gray background
   - Confidence as progress bar or percentage text

#### Testing Plan

- **Unit test**: `ReportChartPage.test.ts`
  - Test with patterns present → verify table rows
  - Test with no patterns → verify "No patterns detected" message
  - Test with missing chart screenshot → verify placeholder
  - Test indicator badge coloring logic

#### Acceptance Criteria

- [x] 6 chart pages render (one per timeframe)
- [x] Chart images embedded at full width
- [x] Pattern table renders with correct data
- [x] Indicator grid renders with signal badges
- [x] Missing data handled gracefully
- [x] 7 unit tests cover chart page scenarios (4+ required)

---

### Story 44.9 — PDF Options, Strategy & Risk Pages

#### Goal

Build the remaining PDF pages: options context, entry/exit strategy, risk
assessment, educational notes, and disclaimer.

#### Task List

1. **Create `ReportOptionsPage.tsx`**
   - Options context section:
     - IV percentile + interpretation
     - Put/call ratio
     - Greeks breakdown table
     - Max pain strike
     - OI walls (call wall / put wall strikes + volumes)
     - GEX summary (flip strike, gamma exposure)
     - IV-RV spread + interpretation
   - Unusual activity note

2. **Create `ReportStrategyPage.tsx`**
   - Entry/exit strategy section:
     - Recommended option type, strike, expiry
     - Entry price range
     - Profit target + stop loss
     - Position sizing guidance
     - Rationale text
   - Risk assessment section:
     - Risk level badge
     - Max recommended allocation
     - Key risks bullet list
   - Confidence breakdown:
     - 10-factor breakdown with weights and scores
     - Composite confidence score (prominent)

3. **Create `ReportFooterPage.tsx`**
   - Educational notes (term + explanation pairs)
   - Full disclaimer text
   - Generation metadata (date, version, data sources)

4. **Assemble complete document in `ReportDocument.tsx`**
   - Page order: Cover → Narrative → 6×Chart → Options → Strategy → Footer
   - Consistent headers/footers on every page

#### Testing Plan

- **Unit test**: `ReportOptionsPage.test.ts`
  - Test with full options context data
  - Test with null/missing optional fields (max_pain, oi_walls, gex_summary)

- **Unit test**: `ReportStrategyPage.test.ts`
  - Test entry/exit rendering
  - Test risk badge color mapping
  - Test confidence breakdown with all 10 factors

- **Unit test**: `ReportFooterPage.test.ts`
  - Test educational notes rendering
  - Test with empty educational_notes array

#### Acceptance Criteria

- [x] Options context page renders all available data
- [x] Strategy page renders entry/exit + risk + confidence
- [x] Footer page renders educational notes + disclaimer
- [x] Complete 12+ page document assembles without errors
- [x] Null/missing optional fields handled gracefully
- [x] 7 unit tests passing (6+ required)

---

## Phase 3 — Export Integration

### Story 44.10 — PDF Generation & Download Service

#### Goal

Build the service that orchestrates the full PDF generation pipeline:
aggregate data → capture charts → render PDF → trigger download.

#### Task List

1. **Create `src/lib/services/pdf-export.ts`**

   ```typescript
   export async function generateDeepDiveReport(
     reportData: ReportData,
     chartScreenshots: Record<string, string>,
   ): Promise<Blob> {
     // Merge screenshots into reportData
     // Render ReportDocument via @react-pdf/renderer pdf() API
     // Return PDF blob
   }
   ```

   - Use `pdf(<ReportDocument data={...} />).toBlob()` for generation
   - Handle render errors with try/catch and meaningful error messages

2. **Create `src/lib/services/download-helper.ts`**

   ```typescript
   export function downloadBlob(blob: Blob, filename: string): void {
     // Create object URL, trigger anchor click, revoke URL
   }
   ```

   - Filename format: `DeepDive_{TICKER}_{YYYY-MM-DD}.pdf`
   - Clean up object URL after download starts

3. **Create `src/hooks/useExportPdf.ts`**
   ```typescript
   export function useExportPdf(ticker: string) {
     // Returns { exportPdf, isExporting, progress, error }
     // Progress: 'idle' | 'aggregating' | 'capturing-charts' | 'generating-pdf' | 'complete'
   }
   ```

   - Orchestrates the full pipeline with progress tracking
   - Manages loading state for UI feedback
   - Handles errors at each stage with specific messages

#### Testing Plan

- **Unit test**: `pdf-export.test.ts`
  - Test `generateDeepDiveReport` produces a Blob
  - Test with minimal ReportData
  - Test error handling with invalid data

- **Unit test**: `download-helper.test.ts`
  - Test filename generation
  - Test URL creation and revocation
  - Test blob handling

- **Unit test**: `useExportPdf.test.ts`
  - Test progress state transitions
  - Test error state on failure
  - Test that export completes successfully with mock data

#### Acceptance Criteria

- [ ] `generateDeepDiveReport` returns valid PDF Blob
- [ ] Download triggers with correct filename
- [ ] Progress states update correctly during pipeline
- [ ] Errors at any stage are caught and surfaced
- [ ] 5+ unit tests passing

---

### Story 44.11 — Export Button in WhaleDeepDive UI

#### Goal

Add an "Export PDF" button to the WhaleDeepDive component that triggers
the full PDF generation pipeline with loading state and progress feedback.

#### Task List

1. **Add export button to WhaleDeepDive header**
   - Position: in the header area, next to the ticker title
   - Icon: `Download` from lucide-react
   - Label: "Export PDF"
   - Disabled state when no deep dive data loaded
   - Loading state with progress indicator during generation

2. **Wire up `useExportPdf` hook**
   - On click: start export pipeline
   - Show progress stages:
     - "Preparing data…" (aggregating)
     - "Rendering charts…" (capturing screenshots)
     - "Generating PDF…" (building document)
     - "Complete!" (brief flash, then reset)
   - Show error toast/banner on failure

3. **Add `ChartScreenshotRenderer` mount point**
   - Render the hidden screenshot component when export is in progress
   - Pass `onComplete` callback to receive screenshots
   - Unmount after screenshots captured

4. **Handle edge cases**
   - Disable button while analysis is still loading
   - Prevent double-click / concurrent exports
   - Handle stale data (analysis refreshed during export)
   - Mobile: ensure button is accessible on small screens

#### Testing Plan

- **Unit test**: `WhaleDeepDive export button`
  - Test button renders when deep dive data is available
  - Test button is disabled when data is loading
  - Test click triggers export hook
  - Test loading state shows progress text

- **Integration test** (manual):
  - Open a deep dive analysis
  - Click "Export PDF"
  - Verify progress UI updates
  - Verify PDF downloads with correct filename
  - Open PDF and verify all sections present

#### Acceptance Criteria

- [ ] "Export PDF" button visible in deep dive header
- [ ] Button disabled during loading / when no data
- [ ] Progress indicator shows current stage
- [ ] PDF downloads on completion
- [ ] No concurrent export issues
- [ ] 3+ unit tests passing

---

### Story 44.12 — End-to-End Testing & Polish

#### Goal

Full integration testing of the PDF export pipeline, performance
optimization, and visual polish of the generated report.

#### Task List

1. **End-to-end smoke test**
   - Create a test fixture with known deep dive data
   - Run full pipeline: aggregate → screenshot → generate → verify
   - Verify PDF has expected page count (12+)
   - Verify all sections present (spot-check text content)

2. **Performance profiling**
   - Measure time for each stage:
     - Data aggregation: target < 2s
     - Chart screenshots (6×): target < 10s
     - PDF generation: target < 5s
     - Total: target < 20s
   - If slow: optimize chart rendering (reduce resolution, parallelize)

3. **Visual QA of generated PDF**
   - Verify cover page layout and branding
   - Verify chart images are crisp and legible
   - Verify pattern tables are properly formatted
   - Verify page breaks don't split sections
   - Verify badge colors render correctly
   - Verify footer and page numbers on every page

4. **Error recovery testing**
   - Test with network failure during candle fetch
   - Test with chart render failure
   - Test with very large analysis (many patterns)
   - Test with minimal analysis (no patterns, no cascade)

5. **Accessibility and UX polish**
   - Ensure export button has aria labels
   - Add keyboard shortcut hint (Ctrl+Shift+P?)
   - Add success notification after download
   - Ensure button styling matches app design system

#### Testing Plan

- **Integration test**: `pdf-export-e2e.test.ts`
  - Full pipeline test with mock HTTP responses
  - Verify Blob output is non-empty
  - Verify expected content markers in generated data

- **Performance test**: Log timings for each pipeline stage

#### Acceptance Criteria

- [ ] Full pipeline runs without errors
- [ ] Total generation time < 20 seconds
- [ ] Generated PDF has correct page count
- [ ] All content sections verified present
- [ ] Error cases handled gracefully with user feedback
- [ ] Export button accessible and styled correctly
- [ ] All existing tests (225+) still pass

---

## Summary

| Story | Title                                  | Phase    | Status      |
| ----- | -------------------------------------- | -------- | ----------- |
| 44.0  | Deep Dive Content Inventory            | Research | Done        |
| 44.1  | PDF Library Evaluation                 | Research | Done        |
| 44.2  | Chart Screenshot Capture Strategy      | Research | Done        |
| 44.3  | Report Layout & Pagination Design      | Research | Done        |
| 44.4  | Install PDF Library & Expose Chart Ref | Phase 1  | Done        |
| 44.5  | Report Data Aggregation Service        | Phase 1  | Done        |
| 44.6  | Chart Screenshot Capture Utility       | Phase 1  | Done        |
| 44.7  | PDF Cover + Narrative Pages            | Phase 2  | Done        |
| 44.8  | PDF Chart Pages (6 Timeframes)         | Phase 2  | Done        |
| 44.9  | PDF Options, Strategy & Risk Pages     | Phase 2  | Done        |
| 44.10 | PDF Generation & Download Service      | Phase 3  | Not Started |
| 44.11 | Export Button in WhaleDeepDive UI      | Phase 3  | Not Started |
| 44.12 | End-to-End Testing & Polish            | Phase 3  | Not Started |

### Dependencies

```
44.0 ──┐
44.1 ──┤
44.2 ──┼──→ 44.4 ──→ 44.6 ──┐
44.3 ──┘         │            │
                 └──→ 44.5 ──┤
                              ├──→ 44.7 ──┐
                              │           ├──→ 44.10 ──→ 44.11 ──→ 44.12
                              ├──→ 44.8 ──┤
                              │           │
                              └──→ 44.9 ──┘
```

### Key Technical Decisions (to be confirmed in Phase 0)

1. **PDF library**: Leaning toward `@react-pdf/renderer` for native PDF output
   with selectable text, but ghost-element html2pdf.js approach will be
   evaluated in Story 44.1
2. **Chart capture**: `takeScreenshot()` API on hidden lightweight-charts
   instances — to be validated in Story 44.2
3. **Theme**: Dark (matching app) vs. light (print-friendly) — to be decided
   in Story 44.3
4. **Indicator state**: All indicators enabled vs. user's current selection —
   to be decided in Story 44.2
