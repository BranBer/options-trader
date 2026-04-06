# Epic 37: Event-Driven Ticker Analysis (Globe → Options Pipeline)

> **Status:** 📋 PLANNED  
> **Priority:** P1 — High (addresses a core signal gap: macro events identify tickers the whale stream misses)  
> **Created:** 2026-04-06  
> **Depends on:** Existing globe page, news classification pipeline, analysis pipeline, market data services

## Problem Statement

The whale alert stream is dominated by bullish tech mega-cap flow. When a geopolitical or macro event (tariffs, sanctions, supply-chain disruption, central bank action) identifies affected tickers in the globe Event Details, those tickers rarely appear in the whale stream because they are outside the current flow hotspot. The result is a blind spot: the system detects the event and names the tickers, but never runs options analysis, technical analysis, or trade recommendations on them.

## Goal

Close the loop between the globe's event-detected tickers and the full analysis pipeline. When a news event names affected tickers, the system should:

1. Query options activity (chain, volume, OI, IV) for those tickers
2. Run the same technical analysis (multi-timeframe patterns, support/resistance) and deep-dive pipeline
3. Generate trade recommendations grounded in the event thesis
4. Surface any existing whale alerts for those tickers (or note their absence as a signal)
5. Present the results in a dedicated analysis section accessible from the globe page

## Architecture Principles

- **On-demand, not cron**: Event-ticker analysis is triggered by user interaction or by the pipeline noticing high-impact events, not by the 10-minute cron alone.
- **Reuse existing services**: `fetchOptionsChain`, `fetchMarketData`, `fetchHistoricalData`, `generateDeepDive`, `generateRecommendation` already exist. This epic wires them to a new trigger source (event tickers) rather than duplicating logic.
- **Additive UI**: The globe page gets a new analysis panel; existing pages are not restructured.
- **Cache-aware**: On-demand analysis results are persisted in the `analyses` table with a new `source` tag so they can be recalled without re-running the LLM.

---

## Sprint 37A — Backend: Event-Ticker Analysis Service & API

### Story 37.1 — Event-Ticker Analysis Service

#### Goal

Create a service that takes a list of tickers + an event context and runs the full analysis pipeline on them: market data, options chain, historical candles, deep dive, and trade recommendation.

#### Deliverables

- `src/lib/services/event-ticker-analyzer.ts`
  - `analyzeEventTickers(params)` — accepts `{ tickers: string[], eventContext: { headline, summary, sentiment, impactScore, eventType, sectors } }`
  - For each ticker:
    1. Fetch market data (price, volume, day change)
    2. Fetch options chain (nearest expiry calls/puts, max pain, OI walls, GEX)
    3. Fetch historical candles across 5 timeframes (1W, 1M, 3M, 6M, 1Y)
    4. Compute IV/RV spread
    5. Call `generateDeepDive` with the event context injected as macro narrative
    6. Call `generateRecommendation` with a synthetic correlation built from the event
  - Returns structured `EventTickerAnalysis[]` with market snapshot, options summary, deep dive, recommendation, and whale match info
- Concurrency-limited (2 tickers at a time) to respect API budgets
- Results tagged with `source: "event_ticker"` when persisted to `analyses`

#### Acceptance Criteria

- [ ] Service runs end-to-end for a list of 1–5 tickers
- [ ] Each ticker gets market data, options chain, deep dive, and recommendation
- [ ] Results are persisted with `source: "event_ticker"` + `eventId` reference
- [ ] API budget is respected (concurrent limits match existing pipeline)

#### Implementation Plan

1. **Schema migration — add `source` column to `analyses` table:**
   - Add `source: text("source")` to the `analyses` table in `src/lib/db/schema.ts`.
   - Run a Drizzle migration (`drizzle-kit generate` + `drizzle-kit push`) to apply the column.
   - This is required before any `source: "event_ticker"` tagging can work.
   - Add an index on `(source, createdAt)` for efficient cache lookups later (Story 37.3).

2. **Create `src/lib/services/event-ticker-analyzer.ts`:**
   - Export `analyzeEventTickers(params: EventTickerAnalysisParams): Promise<EventTickerAnalysis[]>`.
   - `EventTickerAnalysisParams`: `{ tickers: string[], eventId: number, eventContext: { headline, summary, sentiment, impactScore, eventType, sectors: string[] } }`.
   - For each ticker (chunked at `CONCURRENCY = 2` via `Promise.allSettled` batching, mirroring `analysis-pipeline.ts` pattern):
     a. **Market data**: `fetchMarketData([ticker])` → `MarketSnapshot`.
     b. **Options chain**: `fetchOptionsChain(ticker)` → `OptionsChainSummary | null`.
     c. **Historical candles (5 timeframes)**: `fetchHistoricalData(ticker, period)` for `["1wk", "1mo", "3mo", "6mo", "1y"]`.
     d. **IV/RV spread**: Compute ATM IV from the options chain (±5% of price), then `computeRealizedVol(candles3M)`. Spread = ATM IV − realized vol.
     e. **Earnings proximity**: `fetchEarningsDate(ticker)` → `getEarningsProximity(earningsDate, null)`.
     f. **Macro context**: Reuse `fetchVIX()` + FOMC schedule logic from `analysis-pipeline.ts`. Consider extracting the macro-context builder into a shared helper.
     g. **Synthetic correlation object**: Build a `Correlation`-shaped object where `whale_trade` fields are zeroed/defaulted and `news_event` is populated from the event context. Set `correlation_confidence` to `eventContext.impactScore / 10`. The `generateRecommendation` function requires a `Correlation` arg — this synthetic object bridges the gap.
     h. **Deep dive**: Call `generateDeepDive({ ticker, whaleTrade: syntheticWhaleTrade, historicalData, historicalDataByTimeframe, optionsChain, currentPrice, correlatedEvent: { headline, impact_score, event_type }, newsContext: [{ headline, sentiment }], macroContext, optionsAnalytics })`. The `correlatedEvent` and `newsContext` fields already exist on `DeepDiveInput`.
     i. **Recommendation**: Call `generateRecommendation(syntheticCorrelation, marketDataForRec)` with the same market context shape as the existing pipeline.
     j. **Persist**: Insert two rows into `analyses` — one `type: "deep_dive"` and one `type: "trade_recommendation"` — both with `source: "event_ticker"` and `inputRefs: JSON.stringify({ eventId, ticker })`.
     k. **Market snapshot**: Insert into `marketSnapshots` (same pattern as analysis-pipeline).
   - Return `EventTickerAnalysis[]` with market snapshot, options summary, deep dive, recommendation, and whale match info (from Story 37.2).

3. **Budget guard**: Before starting, check `isOverBudget("yahoo")` and `getRemainingBudget("yahoo")`. If remaining budget < `tickers.length * 5` (approx calls per ticker), abort early with a descriptive error. Call `recordApiCall("yahoo")` after each yahoo-finance2 call.

4. **Define result types** in `src/types/analysis.ts` or a new `src/types/event-analysis.ts`:
   - `EventTickerAnalysis`: `{ ticker, marketSnapshot, optionsSummary, deepDive, recommendation, whaleMatch, source: "event_ticker" }`.

#### Edge Cases

- **Tickers with no options data**: `fetchOptionsChain` returns `null` for ETFs, indices, or low-cap tickers. The deep dive and recommendation must still generate — pass `optionsChain: null`, `optionsAnalytics: undefined`. The LLM prompts already handle "No options chain data available".
- **Market hours**: Yahoo Finance returns stale quotes outside market hours. The analysis should still run (users may want pre-market analysis), but the market snapshot should include a `marketOpen: boolean` flag so the UI can warn.
- **Ticker validation**: Event tickers come from LLM classification and may contain invalid symbols (e.g., "AI", company names instead of tickers). `fetchMarketData` will fail silently per-ticker — wrap each ticker's full pipeline in try/catch and collect partial results.
- **Duplicate tickers in input**: Deduplicate the ticker list before processing.
- **Synthetic correlation shape mismatch**: `generateRecommendation` expects `Correlation.whale_trade` fields. Use a well-formed synthetic: `{ ticker, strike: 0, expiry: "", callPut: "C", premium: 0, volume: 0, openInterest: 0, sentiment: eventContext.sentiment === "bearish" ? "bearish" : "bullish" }`. The recommendation prompt should note this is event-driven, not whale-driven.
- **API budget exhaustion mid-batch**: If the yahoo budget runs out between tickers, return partial results with a `budgetExhausted: true` flag rather than failing the entire request.

#### Testing Plan

- [ ] Unit test with mocked market data and LLM calls
- [ ] Integration test confirming persisted analysis rows have correct source tag
- [ ] Test with ticker that has no options chain (null path)
- [ ] Test budget guard aborts when over-budget
- [ ] Test partial results when one ticker fails

---

### Story 37.2 — Whale Alert Lookup for Event Tickers

#### Goal

For each event ticker, check whether any whale alerts exist in the recent window. Surface matches and flag absence as a contrarian/early signal.

#### Deliverables

- Helper in event-ticker-analyzer that queries `whale_alerts` for each ticker (last 48h)
- Returns `{ ticker, whaleAlerts: WhaleAlertRow[], hasWhaleActivity: boolean }`
- When no whale activity exists, the analysis output includes a note: "No whale flow detected — event-only signal"

#### Acceptance Criteria

- [ ] Whale lookup returns recent alerts per ticker
- [ ] Absence is flagged in the analysis output
- [ ] Whale quality scores are included when present

#### Implementation Plan

1. **Add whale lookup helper** inside `event-ticker-analyzer.ts` (or as a small exported function):

   ```
   lookupWhaleActivity(ticker: string, windowHours: number = 48): Promise<WhaleActivityMatch>
   ```

   - Query `whale_alerts` table: `where(and(eq(whaleAlerts.ticker, ticker.toUpperCase()), gte(whaleAlerts.detectedAt, cutoffISO)))`, ordered by `desc(whaleAlerts.detectedAt)`, limit 20.
   - Reuse the exact query pattern from `src/app/api/whales/route.ts` (lines 10–20): `gte(detectedAt, since) + eq(ticker)`.
   - Return `{ ticker, whaleAlerts: WhaleAlertRow[], hasWhaleActivity: boolean, bestQualityScore: number | null }`.

2. **Integrate into the per-ticker loop** in Story 37.1's `analyzeEventTickers`:
   - Call `lookupWhaleActivity(ticker)` in parallel with market data fetches (it's a DB query, not an API call).
   - If whale alerts exist, enrich the synthetic correlation's `whale_trade` fields with the highest-quality whale alert's actual values (strike, expiry, premium, sentiment) instead of zeroed defaults.
   - If no whale alerts: set `recommendation.whale_alignment` to `{ matches_whale: false, similarity_note: "No whale flow detected — event-only signal" }`.

3. **Include whale match in `EventTickerAnalysis` result**:
   - `whaleMatch: { hasWhaleActivity, alerts: WhaleAlertRow[], bestQualityScore }`.

#### Edge Cases

- **Ticker format mismatch**: Whale alerts store uppercase tickers. Ensure `.toUpperCase()` normalization before querying.
- **Very old whale alerts**: A 48h window might miss relevant alerts for slow-moving events. Consider a configurable window, defaulting to 48h but extendable to 7d for macro events.
- **Many whale alerts for a ticker**: Limit to 20 results but sort by quality score descending to surface the best signals first.
- **Ticker in multiple formats**: Some tickers differ between yahoo and UW (e.g., BRK.B vs BRK-B). The whale pipeline stores them as-is from the source. May need a normalization map for edge cases.

#### Testing Plan

- [ ] Unit test for whale lookup with and without matches
- [ ] Test ticker case normalization
- [ ] Test window boundary (alert just inside vs just outside 48h)

---

### Story 37.3 — Event-Ticker Analysis API Route

#### Goal

Expose the event-ticker analysis as an API route callable from the globe UI.

#### Deliverables

- `POST /api/analysis/event-tickers`
  - Body: `{ eventId: number, tickers: string[], eventContext: { headline, summary, sentiment, impactScore, eventType, sectors } }`
  - Returns: `{ analyses: EventTickerAnalysis[], cached: boolean }`
  - If analysis for this `eventId` + ticker set was run within the last 2 hours, return cached results
- `GET /api/analysis/event-tickers?eventId=123`
  - Returns previously generated analyses for a given event
- Rate limit: max 1 concurrent event-ticker analysis request

#### Acceptance Criteria

- [ ] POST triggers analysis and returns results
- [ ] Repeated POST within 2h returns cached results without re-running LLM
- [ ] GET retrieves previously generated results by eventId
- [ ] Concurrent request guard prevents duplicate runs

#### Implementation Plan

1. **Create `src/app/api/analysis/event-tickers/route.ts`**:
   - **POST handler**:
     a. Parse and validate request body with zod: `{ eventId: z.number(), tickers: z.array(z.string()).min(1).max(5), eventContext: { headline: z.string(), summary: z.string().optional(), sentiment: z.enum(["bullish","bearish","neutral"]), impactScore: z.number().min(1).max(10), eventType: z.string().optional(), sectors: z.array(z.string()).optional() } }`.
     b. **Cache check**: Query `analyses` where `source = "event_ticker"` and `inputRefs LIKE '%"eventId":${eventId}%'` and `createdAt >= 2 hours ago`. If results exist for all requested tickers, return `{ analyses, cached: true }`.
     c. **Concurrency guard**: Use a module-level `let activeAnalysis: Promise<...> | null = null` lock. If an analysis is already running, return `409 Conflict` with a retry-after hint.
     d. Call `analyzeEventTickers(params)` from Story 37.1.
     e. Return `{ analyses: EventTickerAnalysis[], cached: false }`.
   - **GET handler**:
     a. Parse `eventId` from search params.
     b. Query `analyses` where `source = "event_ticker"` and `inputRefs LIKE '%"eventId":${eventId}%'`, ordered by `createdAt DESC`.
     c. Parse and return the structured results.

2. **Ticker count limit**: Hard cap at 5 tickers per request (validated in zod schema). This prevents budget abuse and keeps response times reasonable.

3. **Response shape**: `{ analyses: EventTickerAnalysis[], cached: boolean, budgetExhausted?: boolean, errors?: { ticker: string, error: string }[] }`.

#### Edge Cases

- **Cache partial hit**: If a previous run analyzed 3/5 tickers and the user now requests 5, only analyze the 2 missing tickers. Merge cached + fresh results.
- **Race condition on concurrent guard**: Two requests arriving simultaneously could both pass the null check. Use a mutex pattern: `if (activeAnalysis) return 409; activeAnalysis = analyzeEventTickers(...); try { ... } finally { activeAnalysis = null; }`.
- **Invalid eventId**: The event may have been deleted. Validate that the event exists in `newsEvents` before proceeding, return `404` if not found.
- **Request body too large**: Reject if `tickers.length > 5` (zod validation).
- **Event with no tickers**: Could happen if the user manually calls the API. Return `400` with a descriptive error.
- **Analysis takes too long**: Consider a 60-second timeout for the overall request. If exceeded, return partial results with a `timeout: true` flag.
- **Stale cache**: The 2-hour cache window may be too long for fast-moving events. Consider a `force: boolean` parameter to bypass cache.

#### Testing Plan

- [ ] Route test for POST happy path
- [ ] Route test for cache hit behavior
- [ ] Route test for GET retrieval
- [ ] Test concurrent request guard returns 409
- [ ] Test invalid eventId returns 404
- [ ] Test ticker count limit validation

---

## Sprint 37B — Frontend: Globe Event Analysis Panel

### Story 37.4 — "Analyze Event Tickers" Action in Globe Event Details

#### Goal

Add a button to the Event Details sidebar that triggers analysis for the event's affected tickers.

#### Deliverables

- "Analyze Tickers" button in the `EventDetail` component, visible when the event has ≥1 affected ticker
- Button triggers `POST /api/analysis/event-tickers` with the event context
- Loading state with progress indicator while analysis runs
- Error handling with retry option
- Disable button and show "Cached" badge if results already exist for this event

#### Acceptance Criteria

- [ ] Button appears on events with affected tickers
- [ ] Clicking triggers analysis and shows loading state
- [ ] Cached results are indicated without re-triggering

#### Implementation Plan

1. **Extend the `EventDetail` component** in `src/components/globe/GlobePage.tsx`:
   - Add state: `analysisState: "idle" | "loading" | "done" | "error"` and `analysisResults: EventTickerAnalysis[] | null`.
   - Below the tickers badges section, add an "Analyze Tickers" button (using the existing `Button` from `src/components/ui/button.tsx`).
   - Button visibility: only render when `tickers.length > 0`.

2. **On click handler**:
   a. Set state to `loading`.
   b. First, try `GET /api/analysis/event-tickers?eventId=${event.id}` to check for cached results.
   c. If cached results exist, set state to `done` with the cached data.
   d. If no cache, `POST /api/analysis/event-tickers` with `{ eventId: event.id, tickers, eventContext: { headline: event.headline, summary: event.rawSummary, sentiment: event.sentiment, impactScore: event.impactScore, eventType: event.eventType, sectors: parseStringArray(event.sectors) } }`.
   e. On success, set state to `done`. On error, set state to `error`.

3. **Loading state**: Show a `Skeleton` or spinner with text "Analyzing {n} tickers..." while the POST is in flight. Since analysis can take 15–30s, use a progress-style indicator.

4. **Error state**: Show an error message with a "Retry" button that re-triggers the POST.

5. **Cached state**: If results already exist (detected via GET), show the button as disabled with a "Cached ✓" badge, and immediately display results.

6. **Lift results state up** to the `GlobePage` component level (or use a React context) so the results panel (Story 37.5) can access them. Consider a `Map<number, EventTickerAnalysis[]>` keyed by eventId.

#### Edge Cases

- **Event with 0 tickers**: Button should not render. Guard with `tickers.length > 0`.
- **User switches events while loading**: When `selectedEvent` changes, abort the in-flight fetch (use an `AbortController`). Reset analysis state for the new event.
- **Network failure**: Catch fetch errors and set error state. Do not leave the UI in a loading state indefinitely.
- **Very long analysis (30s+)**: The button should show a cancel option after 10s. Use `AbortController.abort()` to cancel the request.
- **Event ID is undefined**: Some events may not have an `id` (e.g., if the DB insert failed). Guard with `event.id != null`.
- **Hydration mismatch**: The loading/cached state is client-only. Ensure all dynamic UI is wrapped in client-safe rendering (the GlobePage is already `"use client"`).

#### Testing Plan

- [ ] Component test for button visibility and click behavior

---

### Story 37.5 — Event Ticker Analysis Results Panel

#### Goal

Display the analysis results in a dedicated expandable section below the globe, or as a slide-out panel, when event-ticker analysis completes.

#### Deliverables

- `src/components/globe/EventTickerAnalysis.tsx` — renders results for each analyzed ticker:
  - **Market Snapshot**: price, volume, day change, IV/RV spread
  - **Options Activity**: nearest expiry summary, max pain, OI walls, unusual volume flags
  - **Whale Alerts**: list of matching whale alerts (or "No whale activity" badge)
  - **Technical Analysis**: multi-timeframe pattern summary, support/resistance, key indicators
  - **Trade Recommendation**: direction, strategy, legs, confidence, thesis grounded in the event
  - **Risk Assessment**: risk level, risk factors, event-specific caveats
- Tabs or accordion per ticker when multiple tickers are analyzed
- Link to full deep-dive view on the Analysis page for each ticker

#### Acceptance Criteria

- [ ] Each analyzed ticker shows market data, options, whale activity, TA, and recommendation
- [ ] Missing whale activity is clearly surfaced
- [ ] Users can navigate to the full deep-dive view
- [ ] Panel handles 1–5 tickers without layout issues

#### Implementation Plan

1. **Create `src/components/globe/EventTickerAnalysis.tsx`**:
   - Props: `{ analyses: EventTickerAnalysis[], eventHeadline: string }`.
   - If `analyses.length === 1`, render a single card. If multiple, use a `Tabs` component (from `src/components/ui/tabs.tsx`) with one tab per ticker.

2. **Per-ticker card layout** (using existing `Card`, `Badge`, `Separator` UI primitives):
   - **Market Snapshot section**: Price, volume (formatted), day change % (colored green/red), IV/RV spread if available, market-open indicator.
   - **Options Activity section**: Nearest expiry date, call/put volume, P/C ratio, max pain, OI walls (call/put), ATM IV. If `optionsChain === null`, show "No options data available" badge.
   - **Whale Alerts section**: If `whaleMatch.hasWhaleActivity`, render a list of whale alerts with ticker, strike, expiry, premium, sentiment, quality score. If no activity, show `Badge variant="outline"` with "No whale flow — event-only signal".
   - **Technical Analysis section**: Render multi-timeframe pattern summary from the deep dive output's `technical_analysis` field. Show support/resistance levels, key indicators, pattern names.
   - **Trade Recommendation section**: Direction badge (bullish/bearish), strategy name, legs table (type, strike, expiry, action), confidence score, thesis text (grounded in the event), risk level badge and risk factors list.
   - **Link to full deep dive**: `<a href="/analysis?ticker=${ticker}">View Full Deep Dive →</a>`.

3. **Placement**: Render below the globe `Card` when analysis results exist for the selected event. Use a `motion` fade-in animation for a polished reveal.

4. **Responsive layout**: On mobile (< lg), the results panel stacks below the globe card. On desktop, it spans the full width below the globe grid.

#### Edge Cases

- **Partial failures**: Some tickers may fail analysis while others succeed. Render succeeded tickers normally and show an error badge for failed tickers with the error message.
- **Missing fields in deep dive**: The LLM may omit optional fields (e.g., `technical_analysis.patterns` could be empty). Guard each section with null/empty checks and show "Insufficient data" placeholders.
- **No options data**: Skip the options activity section entirely (don't show empty tables). Show a single "Options data unavailable" note.
- **Very long thesis text**: The recommendation thesis can be lengthy. Use a `line-clamp-4` with an expand toggle.
- **5 tickers with tabs**: Ensure the tab bar doesn't overflow on mobile. Use a horizontally scrollable tab bar or a dropdown selector for > 3 tickers on small screens.
- **Stale recommendation linking**: The `/analysis?ticker=` link uses `like` matching on `inputRefs`. Ensure the event-ticker analyses have consistent ticker format in `inputRefs` so the analysis page can find them.

#### Testing Plan

- [ ] Component test for single-ticker and multi-ticker rendering
- [ ] Snapshot test for empty whale activity state
- [ ] Test with missing options chain (null path)
- [ ] Test that partial failure renders correctly

---

### Story 37.6 — Event Analysis History & Re-access

#### Goal

Let users re-access previously run event analyses without re-triggering the pipeline.

#### Deliverables

- Visual indicator on globe event points that have been analyzed (e.g., ring or glow)
- Clicking an already-analyzed event loads cached results immediately
- Optional: small "Analyzed Events" list in the globe sidebar showing recent event analyses

#### Acceptance Criteria

- [ ] Analyzed events are visually distinguishable on the globe
- [ ] Cached results load instantly on re-click
- [ ] History list shows recent event analyses with timestamps

#### Implementation Plan

1. **Query analyzed event IDs on globe page load**:
   - Add a lightweight `GET /api/analysis/event-tickers/analyzed-events` endpoint (or extend the existing GET with a `?summary=true` param) that returns `{ analyzedEventIds: number[] }` — a list of eventIds that have `source = "event_ticker"` analyses.
   - Fetch this on globe page mount and store in state: `analyzedEventIds: Set<number>`.

2. **Visual indicator on globe points**:
   - In the `pointsData` mapping (where news events become globe points), add a `ring: boolean` or `analyzed: boolean` field.
   - In the globe.gl `pointColor` callback, give analyzed events a distinct ring color (e.g., gold/amber ring) or a glow effect using `pointAltitude` + custom `htmlElement`.
   - Simpler approach: use `pointRadius` — analyzed events get a slightly larger radius with a different color to distinguish them.

3. **Cached results load instantly on re-click**:
   - In the `EventDetail` component, when `selectedEvent` changes, check if `analyzedEventIds.has(event.id)`. If yes, immediately fire the `GET /api/analysis/event-tickers?eventId=${event.id}` call to load cached results.
   - Show the "Analyze Tickers" button as "View Analysis" instead.

4. **"Analyzed Events" sidebar list** (optional enhancement):
   - Below the events feed in the sidebar, add a collapsible "Recent Analyses" section showing the last 5 analyzed events with timestamps.
   - Each item links to the event detail + cached analysis.

#### Edge Cases

- **Many analyzed events**: If hundreds of events have been analyzed, the `analyzedEventIds` set could grow large. Limit the query to events analyzed in the last 7 days.
- **Stale analysis indicator**: Show how old the cached analysis is (e.g., "Analyzed 3h ago"). If older than 24h, offer a "Re-analyze" button that bypasses cache (using `force: true` from Story 37.3).
- **Globe re-renders**: Changing `pointColor` or `pointRadius` based on analyzed status triggers a globe re-render. Batch the state update and use `useMemo` to avoid unnecessary re-renders.
- **Event deleted after analysis**: The event may no longer exist in `newsEvents` but the analysis persists. Handle gracefully — show the analysis with a "Source event no longer available" note.
- **Page refresh**: The `analyzedEventIds` fetch is lightweight and should be fast. Consider caching in `sessionStorage` with a 5-minute TTL.

#### Testing Plan

- [ ] Visual regression test for analyzed-event indicator
- [ ] Cache retrieval test
- [ ] Test that stale analysis shows age indicator
- [ ] Test analyzed event IDs endpoint performance

---

## Sprint 37C — Pipeline Integration & Polish

### Story 37.7 — Auto-Trigger for High-Impact Events

#### Goal

Optionally trigger event-ticker analysis automatically for high-impact events (impact ≥ 8) during the cron pipeline, so results are pre-computed before the user opens the globe.

#### Deliverables

- Post-classification hook in `news-pipeline.ts` or `analysis-pipeline.ts` that identifies events with `impactScore >= 8` and `affected_tickers.length > 0`
- Queues event-ticker analysis for those events within the same pipeline run
- Respects existing API budget and concurrency limits
- Configurable via `EVENT_ANALYSIS_AUTO_TRIGGER=true|false` environment variable

#### Acceptance Criteria

- [ ] High-impact events automatically get event-ticker analysis during the pipeline
- [ ] Auto-trigger is opt-in via env var
- [ ] Does not delay the main pipeline beyond a configurable timeout
- [ ] Results appear as cached when the user opens the globe

#### Implementation Plan

1. **Hook point in `src/lib/cron/pipelines/news-pipeline.ts`**:
   - In `classifyAndStoreNews`, after each successful `db.insert(newsEvents)`, check if the inserted event meets the auto-trigger criteria: `impactScore >= 8 && tickers.length > 0`.
   - Collect qualifying events into a `highImpactEvents[]` array.
   - After the classification loop completes, call a new `triggerEventTickerAnalysis(highImpactEvents)` function.

2. **Auto-trigger function** in `event-ticker-analyzer.ts`:
   - `autoTriggerEventAnalysis(events: NewsEventRow[]): Promise<void>`
   - For each qualifying event, call `analyzeEventTickers(...)` with the event's context.
   - Process events sequentially (not in parallel) to avoid overwhelming API budgets.
   - Respect a configurable timeout per event (default: 45s). Use `Promise.race` with a timeout promise.

3. **Environment variable gate**:
   - `EVENT_ANALYSIS_AUTO_TRIGGER=true|false` (default: `false`).
   - Check `process.env.EVENT_ANALYSIS_AUTO_TRIGGER === "true"` before calling the auto-trigger.
   - This makes the feature opt-in and safe to deploy without immediate impact.

4. **Budget awareness**:
   - Before starting auto-trigger, check `getRemainingBudget("yahoo")`. If remaining < 30 (enough for ~6 tickers), skip auto-trigger and log a warning.
   - After auto-trigger, log budget usage: `[EventTicker] Auto-trigger used ${used} yahoo calls, ${getRemainingBudget("yahoo")} remaining`.

5. **Pipeline timeout guard**:
   - Add a configurable `EVENT_ANALYSIS_TIMEOUT_MS` (default: 120000, 2 minutes).
   - If the auto-trigger exceeds this timeout, abort remaining events and log which events were skipped.
   - The main pipeline should not be delayed by more than this timeout.

#### Edge Cases

- **Multiple high-impact events in one pipeline run**: If 5 events qualify, processing all sequentially could take 5–10 minutes. Cap at 3 events per pipeline run, prioritized by impact score descending.
- **Same event analyzed twice**: The cache check in `analyzeEventTickers` (from Story 37.3) should prevent duplicate work. Verify the cache lookup runs even from the pipeline path.
- **Pipeline killed mid-analysis**: If the cron pipeline times out or the process restarts, partial results will be persisted (each ticker's analysis is committed individually). The next run's cache check will detect existing results.
- **Budget exhaustion blocks main pipeline**: Auto-trigger should never consume more than 25% of the remaining daily yahoo budget. Add a hard cap check.
- **Event with many tickers (10+)**: The auto-trigger should respect the 5-ticker cap from Story 37.3. If the event has 10 tickers, analyze only the top 5 (prioritize by: sector match to event type, then alphabetical).
- **Env var hot-reload**: The env var is checked at call time, not at import time, so it can be changed without restarting the server.

#### Testing Plan

- [ ] Pipeline integration test with auto-trigger enabled
- [ ] Budget guard test
- [ ] Test timeout guard aborts after configured limit
- [ ] Test event cap (max 3 events per run)

---

### Story 37.8 — Event-Ticker Analysis in Learning Corpus

#### Goal

Include event-ticker analyses in the learning corpus so the RL/shadow-policy system can evaluate whether event-driven trades perform differently from whale-driven ones.

#### Deliverables

- Extend `buildLearningRecords` to include event-ticker analyses with `source: "event_ticker"` tag
- Add `signalSource` field to `LearningRecord` to distinguish whale-driven vs event-driven records
- Learning readiness and shadow policy evaluation should segment by signal source when enough data exists

#### Acceptance Criteria

- [ ] Event-ticker records appear in the learning corpus
- [ ] Signal source is queryable in readiness and baseline evaluations
- [ ] No regression in existing learning tests

#### Implementation Plan

1. **Add `signalSource` field to `LearningAlertState`** in `src/types/learning.ts`:
   - Add `signalSource: z.enum(["whale", "event_ticker", "correlation"]).nullable().optional()` to the `learningAlertStateSchema`.
   - Default existing records to `"whale"` (backward compatible via `.optional()`).

2. **Extend `buildLearningRecords`** in `src/lib/analytics/learning-records.ts`:
   - Currently, the function only processes whale alerts + their linked evaluations/trades/analyses.
   - Add a new code path: query `analyses` where `source = "event_ticker"` and `type = "trade_recommendation"`.
   - For each event-ticker recommendation, check if it was later validated by the sim pipeline (matched evaluation in `sim_evaluations` or tracked trade).
   - Build a `LearningRecord` with `state.alert.signalSource = "event_ticker"`, populating alert state from the event context rather than a whale alert.
   - The `state.alert` fields like `strike`, `expiry`, `callPut` will come from the recommendation's primary strategy legs (if present), or be null for event-driven signals that don't map to specific options.

3. **Segment in readiness and baseline evaluations**:
   - In `src/lib/analytics/learning-dataset.ts` (or wherever `computeBaseline` lives), add optional grouping by `signalSource`.
   - When computing readiness scores, report separate counts: `{ whale: N, event_ticker: M }`.
   - The shadow policy evaluation should track performance by signal source to detect if event-driven trades systematically differ.

4. **Backward compatibility**: All existing records lack `signalSource`. The field is optional/nullable, so existing queries and the shadow policy continue to work unchanged. The segmentation is additive.

#### Edge Cases

- **No event-ticker records yet**: Until Epic 37 is deployed and used, the learning corpus has 0 event-ticker records. Segmentation should handle empty groups gracefully (show "No event-ticker data" rather than divide-by-zero).
- **Event-ticker records without trade outcome**: Many event-ticker analyses won't result in actual trades (they're informational). These should still be included in the corpus as "observation-only" records for future training but excluded from P&L-based reward calculations.
- **Mixed signal records**: A whale alert and event could both point to the same ticker. The record should reflect the primary trigger source. If the analysis has `source: "event_ticker"`, tag it as event-driven even if whale alerts exist.
- **Learning readiness threshold**: Don't require event-ticker volume to meet readiness thresholds initially. The readiness check should use total record count, not per-source count, until event-ticker volume is substantial.
- **Schema migration timing**: The `signalSource` addition to the zod schema doesn't require a DB migration — it's a field in the application-layer `LearningRecord` type, not a DB column. But if learning records are persisted (check if they are), the persistence layer needs updating too.

#### Testing Plan

- [ ] Learning record builder test with event-ticker source
- [ ] Readiness scorecard test with mixed signal sources
- [ ] Test empty event-ticker group doesn't break segmentation
- [ ] Test backward compatibility with records missing signalSource

---

## Suggested Execution Order

1. **Story 37.1** — Core service (backend foundation, everything depends on this)
2. **Story 37.2** — Whale lookup (small, completes the service output)
3. **Story 37.3** — API route (unblocks frontend)
4. **Story 37.4** — Globe button (minimal UI, triggers the flow)
5. **Story 37.5** — Results panel (the main UI payoff)
6. **Story 37.6** — History & caching UX (polish)
7. **Story 37.7** — Auto-trigger for high-impact events (pipeline integration)
8. **Story 37.8** — Learning corpus integration (RL tie-in)

## Estimated Scope

- Sprint 37A (Stories 37.1–37.3): Backend service + API — focused, testable, no UI risk
- Sprint 37B (Stories 37.4–37.6): Frontend panel + UX — depends on 37A
- Sprint 37C (Stories 37.7–37.8): Pipeline automation + learning integration — optional polish

---

## Follow-Up Stories

### Story 37.9 — Real-World Request Hardening

#### Goal

Make manual event analysis robust against real news events whose ticker lists and event metadata do not exactly match the original happy-path request schema.

#### Root Cause

- High-impact live events frequently include 6–10 affected tickers.
- The globe UI was posting the entire ticker array, but the API hard-rejected anything above 5 tickers with `Invalid request body`.
- The route also assumed a fully shaped `eventContext` from the client, even though the server already has the canonical event row.

#### Deliverables

- Accept oversized ticker lists and normalize them server-side to the top 5 unique tickers.
- Allow the API to derive missing event context fields from `newsEvents`.
- Add regression coverage for oversized real-world event payloads.

### Story 37.10 — Recent High-Impact Catch-Up Analysis

#### Goal

Analyze recent high-impact events even if they were created before Epic 37 shipped or before auto-trigger was enabled, so they appear under the globe without requiring a fresh insert.

#### Root Cause

- The initial auto-trigger only ran inside the news insert path.
- Existing high-impact events already in the database were never revisited, so the globe had nothing to surface in `Recent Analyses` unless a brand-new event came through the pipeline.

#### Deliverables

- Add a best-effort backfill path for recent high-impact events.
- Trigger it from the globe experience so the sidebar/history can self-heal from existing data.
- Keep cache, budget, and timeout protections intact.

### Story 37.11 — Event-Driven Portfolio Promotion

#### Goal

Let strong `event_ticker` recommendations influence the sim portfolio instead of being blocked by the whale-only entry gate.

#### Root Cause

- The sim pipeline currently treats all recommendations as whale-driven and requires a recent whale quality score.
- Event-driven recommendations can therefore be generated successfully but still never reach portfolio evaluation or trade entry if there is no corresponding whale alert.

#### Deliverables

- Add source-aware gating in the sim pipeline.
- Use event impact and any matching whale flow as the event-driven signal quality proxy.
- Add focused tests proving an `event_ticker` recommendation can pass the entry gate and drive portfolio behavior.
