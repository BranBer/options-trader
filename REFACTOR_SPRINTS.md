# Refactor Sprint Plan

Derived from the Process Architecture Review (2026-04-17). Six sprints, each targeting one finding. Sprints are ordered by dependency — later sprints consume artifacts produced by earlier ones.

---

## Sprint 1 — Canonical Per-Ticker Analysis Context

**Finding:** Per-ticker analysis context (market data, options chain, candles, volume profile, algo S/R, trigger report, indicator patterns) is fetched and computed independently in three places: recommendation path, fallback recommendation path, and deep-dive path inside `analysis-pipeline.ts`, plus a fourth time inside `llm-analyzer.ts::generateDeepDive`.

**Goal:** One builder, one call per ticker per cycle, one shared artifact object.

### Story 1.1 — Define `TickerAnalysisContext` type

**Implementation:**

Create `src/types/ticker-context.ts` with a single interface that captures every raw fetch and derived analytic the pipeline needs for a given ticker in a given cycle:

```typescript
import type { MarketSnapshot, OptionsChainSummary, CandleData } from "./market";
import type { VolumeProfile } from "@/lib/utils/volume-profile";
import type { AlgoSRLevel } from "@/lib/utils/algo-sr";
import type { TriggerReport } from "@/lib/utils/trigger-engine";
import type { IndicatorPatternReport } from "@/lib/utils/indicator-patterns";
import type { SignalScorecard } from "@/lib/utils/signal-scorecard";
import type { ShortInterestData } from "@/lib/services/market-fetcher";
import type { IVSkew, OISummary } from "@/lib/utils/options-analytics";

export interface TickerAnalysisContext {
  ticker: string;
  computedAt: string; // ISO timestamp

  // Raw fetches
  marketSnapshot: MarketSnapshot | null;
  optionsChain: OptionsChainSummary | null;
  candlesByTimeframe: Partial<Record<CandleTimeframe, CandleData[]>>;

  // Derived analytics
  indicatorsByTimeframe: Partial<
    Record<CandleTimeframe, IndicatorPatternReport>
  >;
  ivRvSpread: number | null;
  atmIV: number | null;
  realizedVol: number | null;
  volumeProfile: VolumeProfile | null;
  algoSR: AlgoSRLevel[];
  ivSkew: IVSkew | null;
  oiSummary: OISummary | null;
  triggerReport: TriggerReport;
  shortInterest: ShortInterestData | null;
}

export type CandleTimeframe = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y";

export const TIMEFRAME_TO_PERIOD: Record<CandleTimeframe, string> = {
  "1D": "1d",
  "1W": "1wk",
  "1M": "1mo",
  "3M": "3mo",
  "6M": "6mo",
  "1Y": "1y",
};
```

Re-export from `src/types/index.ts` (or barrel file if one exists).

**Testing:**

- Add a type-level compile test in `src/__tests__/types/ticker-context.test.ts` that constructs a valid `TickerAnalysisContext` literal and asserts key fields are present via `satisfies`. This validates the type compiles and is structurally sound.

```typescript
import { describe, it, expect } from "vitest";
import type { TickerAnalysisContext } from "@/types/ticker-context";

describe("TickerAnalysisContext type", () => {
  it("accepts a fully populated context", () => {
    const ctx: TickerAnalysisContext = {
      ticker: "AAPL",
      computedAt: new Date().toISOString(),
      marketSnapshot: null,
      optionsChain: null,
      candlesByTimeframe: {},
      indicatorsByTimeframe: {},
      ivRvSpread: null,
      atmIV: null,
      realizedVol: null,
      volumeProfile: null,
      algoSR: [],
      ivSkew: null,
      oiSummary: null,
      triggerReport: {
        /* minimal valid TriggerReport */
      } as any,
      shortInterest: null,
    };
    expect(ctx.ticker).toBe("AAPL");
  });
});
```

---

### Story 1.2 — Implement `buildTickerAnalysisContext()` builder

**Implementation:**

Create `src/lib/services/ticker-context-builder.ts`:

```typescript
export async function buildTickerAnalysisContext(
  ticker: string,
  timeframes: CandleTimeframe[],
  options?: {
    optionsChain?: OptionsChainSummary | null; // pass pre-fetched if available
    marketSnapshot?: MarketSnapshot | null;
    shortInterest?: ShortInterestData | null;
  },
): Promise<TickerAnalysisContext>;
```

Internals:

1. **Parallel raw fetches** — `Promise.allSettled` for market data (if not passed), options chain (if not passed), and all requested candle timeframes. Never sequential.
2. **Derived analytics** — After fetches resolve, compute in deterministic order:
   - `detectAllIndicatorPatterns` per timeframe with candles
   - `computeRealizedVol` from 3M candles (or longest available)
   - IV-RV spread from market snapshot + realized vol
   - `computeVolumeProfile` from 3M candles
   - `computeAlgoSR` from candles + volume profile + options chain data
   - `computeIVSkew` and `computeOISummary` from options chain
   - `buildTriggerReport` from candles + algo S/R + volume profile + indicator patterns
3. **Short interest** — Use pre-passed value or call `getOrFetchShortInterest` (already cached 24h).
4. Return a frozen `TickerAnalysisContext` object.

Guard: If market snapshot and all candle fetches fail, return a context with all derived fields null/empty. Callers decide whether to proceed.

**Testing:**

Create `src/__tests__/services/ticker-context-builder.test.ts`:

| Test case                              | Description                                                                                                                                                |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| builds full context from mock data     | Mock `fetchMarketData`, `fetchOptionsChain`, `fetchHistoricalData`, `getOrFetchShortInterest` to return fixtures. Assert all derived fields are populated. |
| passes pre-fetched options chain       | Pass `optionsChain` in options. Assert `fetchOptionsChain` is NOT called.                                                                                  |
| handles total fetch failure gracefully | All fetch mocks reject. Assert context returns with null/empty derived fields, no throw.                                                                   |
| computes IV-RV spread correctly        | Provide known IV (market snapshot) and known candle series. Assert `ivRvSpread` matches expected value.                                                    |
| calls deterministic analytics once     | Spy on `computeVolumeProfile`, `computeAlgoSR`, `buildTriggerReport`. Assert each called exactly once.                                                     |
| fetches timeframes in parallel         | Spy on `fetchHistoricalData`. Assert all calls are dispatched before any resolves (verify `Promise.allSettled` usage).                                     |

---

### Story 1.3 — Integrate context builder into recommendation path

**Implementation:**

In `analysis-pipeline.ts`, replace the inline fetch-and-compute block in the high-confidence recommendation loop (currently ~L700-850) with:

```typescript
const ctx = await buildTickerAnalysisContext(ticker, ["1W", "1M", "3M"], {
  shortInterest: shortInterestMap.get(ticker),
});
```

Then replace all downstream references to inline variables (`marketData`, `optionsChain`, `candles1W`, `volumeProfile`, `algoSRLevels`, `triggerReport`, etc.) with reads from `ctx.*`.

The `generateRecommendation` call's `marketData` parameter should be built by reading from `ctx` rather than from local variables.

Delete all now-unused local fetch/compute calls.

**Testing:**

Update `src/__tests__/services/ticker-context-builder.test.ts` to add an integration-style test:

| Test case                               | Description                                                                                                                                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| recommendation path uses shared context | Mock `buildTickerAnalysisContext` to return a fixture context. Run the recommendation generation with a mock LLM. Assert that `fetchMarketData`, `fetchOptionsChain`, `fetchHistoricalData` are NOT called directly by the pipeline — only by the builder. |

---

### Story 1.4 — Integrate context builder into deep-dive path

**Implementation:**

In `analysis-pipeline.ts`, the deep-dive loop (currently ~L1100-1400) fetches 6 timeframes plus options chain and market data per ticker. Replace with:

```typescript
const ctx = await buildTickerAnalysisContext(ticker, [
  "1D",
  "1W",
  "1M",
  "3M",
  "6M",
  "1Y",
]);
```

For tickers that already had a context built in the recommendation step with `["1W", "1M", "3M"]`, consider caching contexts in a `Map<string, TickerAnalysisContext>` within the pipeline run and augmenting with the additional timeframes (`1D`, `6M`, `1Y`). Add a helper:

```typescript
async function getOrBuildContext(
  cache: Map<string, TickerAnalysisContext>,
  ticker: string,
  timeframes: CandleTimeframe[],
): Promise<TickerAnalysisContext>;
```

This helper checks the cache, identifies missing timeframes, fetches only those, merges into the cached context, and returns.

Pass `ctx` to `generateDeepDive` instead of raw candles/chain. This prepares for Sprint 3 where `generateDeepDive` stops computing its own analytics.

**Testing:**

| Test case                                                    | Description                                                                                                                               |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| deep-dive reuses cached recommendation context               | Populate cache with a 3-timeframe context. Request 6-timeframe context for same ticker. Assert only the 3 missing timeframes are fetched. |
| deep-dive builds fresh context for non-recommendation ticker | Assert full 6-timeframe build when ticker has no cached context.                                                                          |

---

### Story 1.5 — Remove duplicate fetch/compute code from pipeline

**Implementation:**

After Stories 1.3 and 1.4, audit `analysis-pipeline.ts` for any remaining direct calls to:

- `fetchMarketData` (for individual recommendation/deep-dive tickers — bulk macro fetches remain)
- `fetchOptionsChain`
- `fetchHistoricalData` (for individual tickers)
- `computeVolumeProfile`
- `computeAlgoSR`
- `buildTriggerReport`
- `detectAllIndicatorPatterns`

Remove unused imports. Run `tsc --noEmit` to verify no compile errors.

**Testing:**

| Test case                             | Description                                                                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| no direct analytics calls in pipeline | Grep test: assert that `analysis-pipeline.ts` does not import `computeVolumeProfile`, `computeAlgoSR`, or `buildTriggerReport` directly (these are now internal to the builder).                          |
| full pipeline integration             | Run `runAnalysisPipeline` with fully mocked external deps. Assert pipeline completes, recommendations and deep dives are stored, and `buildTickerAnalysisContext` is called the expected number of times. |

---

## Sprint 2 — Unify Standard and Fallback Recommendation Flows

**Finding:** The fallback whale-signal-only recommendation path duplicates most of the main recommendation path with slightly different synthetic-correlation setup.

**Goal:** One recommendation execution path with interchangeable input adapters.

### Story 2.1 — Extract `RecommendationInput` adapter interface

**Implementation:**

Create or extend types in `src/types/analysis.ts`:

```typescript
export interface RecommendationInput {
  ticker: string;
  direction: "bullish" | "bearish" | "neutral";
  thesis: string;
  confidenceScore: number;
  source: "correlation" | "whale_signal";

  // Whale context
  whalePremium: number;
  whaleOptionType: string;
  whaleExpiry: string;

  // Optional correlation context (null for whale-signal-only)
  correlatedEvent?: {
    headline: string;
    impactScore: number;
    sector: string;
  } | null;

  // Cascade context (optional)
  cascadeContext?: CascadeContext | null;
}
```

**Testing:**

- Type compile test: construct both a correlation-based and whale-signal-only `RecommendationInput` and assert both satisfy the interface.

---

### Story 2.2 — Create `buildRecommendationInput()` for each mode

**Implementation:**

In a new file `src/lib/services/recommendation-adapter.ts`:

```typescript
export function buildCorrelationInput(
  correlation: Correlation,
  whaleAlert: WhaleAlertRow,
): RecommendationInput;

export function buildWhaleSignalInput(
  whaleAlert: WhaleAlertRow,
): RecommendationInput;
```

Each function maps its source data to the common `RecommendationInput` shape. The whale-signal variant sets `source: "whale_signal"`, `correlatedEvent: null`, and derives `thesis` from the whale alert itself.

**Testing:**

Create `src/__tests__/services/recommendation-adapter.test.ts`:

| Test case                               | Description                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| correlation input has event context     | Build from fixture correlation + whale. Assert `correlatedEvent` is populated, `source` is `"correlation"`. |
| whale-signal input has no event context | Build from fixture whale alert. Assert `correlatedEvent` is null, `source` is `"whale_signal"`.             |
| both modes produce valid direction      | Test bullish/bearish/neutral whale alerts map correctly.                                                    |

---

### Story 2.3 — Unify the recommendation execution path

**Implementation:**

In `analysis-pipeline.ts`, replace the two separate recommendation blocks (main ~L700-850, fallback ~L850-1100) with a single function:

```typescript
async function processRecommendations(
  inputs: RecommendationInput[],
  contextCache: Map<string, TickerAnalysisContext>,
): Promise<void>;
```

This function:

1. Iterates `inputs` with bounded concurrency (`RECOMMEND_CONCURRENCY = 2`)
2. Calls `getOrBuildContext(contextCache, input.ticker, ["1W", "1M", "3M"])` per ticker
3. Builds the scorecard from `ctx` + `input`
4. Calls `generateRecommendation(input, ctx, scorecard)`
5. Stores the result to DB

The caller builds the `inputs` array:

- For high-confidence correlations → `buildCorrelationInput` per correlation
- If too few recommendations → backfill from whale alerts using `buildWhaleSignalInput`

**Testing:**

| Test case                                    | Description                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| processes mixed correlation + whale inputs   | Provide 2 correlation inputs and 1 whale-signal input. Assert all 3 produce recommendations.                             |
| respects concurrency limit                   | Provide 6 inputs with `RECOMMEND_CONCURRENCY = 2`. Assert no more than 2 are in-flight at once (spy on context builder). |
| skips ticker if context build fails entirely | Mock context builder to return all-null context for one ticker. Assert that ticker is skipped without crashing the loop. |

---

### Story 2.4 — Delete the duplicate fallback block

**Implementation:**

After Story 2.3, the old fallback block (~L850-1100 in current code) is dead code. Remove it entirely. Remove any helper functions that were only used by the fallback path.

Run `tsc --noEmit` and all existing tests.

**Testing:**

| Test case                                                                 | Description                                                                                                                              |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| pipeline produces whale-signal recommendations when no correlations exist | Mock cross-reference to return zero correlations. Assert pipeline still produces whale-signal-only recommendations via the unified path. |
| no duplicate recommendation for same ticker                               | Provide a ticker in both correlation and whale-signal inputs. Assert only one recommendation is generated (dedup by ticker).             |

---

## Sprint 3 — Split Domain Analytics Out of the LLM Layer

**Finding:** `llm-analyzer.ts` computes deterministic analytics (volume profile, algo S/R, IV skew, OI summary, trigger report) inside `generateDeepDive()`. These belong in the context builder or a shared analytics layer.

**Goal:** `llm-analyzer.ts` receives pre-computed analytics and only handles LLM invocation, retries, and response parsing.

### Story 3.1 — Make `generateDeepDive` accept `TickerAnalysisContext`

**Implementation:**

Change the `generateDeepDive` signature from accepting raw candle arrays and options chain to accepting a `TickerAnalysisContext`:

```typescript
// Before
export async function generateDeepDive(input: DeepDiveInput): Promise<{
  deepDive: DeepDiveAnalysis;
  triggerReport: TriggerReport;
}>;

// After
export async function generateDeepDive(
  ctx: TickerAnalysisContext,
  input: DeepDivePromptInput,
): Promise<DeepDiveAnalysis>;
```

Where `DeepDivePromptInput` contains only LLM-relevant metadata not in `ctx`:

- `whaleContext` (trade summary, sentiment, whale metadata)
- `priorDeepDiveSummary` (if re-running)
- `correlationThesis` (from cross-reference)

The function no longer computes volume profile, algo S/R, IV skew, OI summary, or trigger report. It reads them from `ctx`.

The return type drops `triggerReport` because it's already in `ctx.triggerReport`.

**Testing:**

Update or create `src/__tests__/services/llm-analyzer.test.ts`:

| Test case                                          | Description                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| generateDeepDive uses ctx.triggerReport            | Pass a context with a known trigger report. Mock LLM to return valid deep dive JSON. Assert the prompt contains the trigger report data from ctx. |
| generateDeepDive does not call analytics functions | Spy on `computeVolumeProfile`, `computeAlgoSR`, `computeIVSkew`, `computeOISummary`, `buildTriggerReport`. Assert none are called.                |
| generateDeepDive with null analytics               | Pass context with null volume profile and empty algo S/R. Assert function still succeeds (LLM receives "no data available" for those sections).   |

---

### Story 3.2 — Create prompt-adapter layer for deep dives

**Implementation:**

Create `src/lib/prompts/deep-dive-context.ts`:

```typescript
export function buildDeepDivePromptContext(
  ctx: TickerAnalysisContext,
  input: DeepDivePromptInput,
): { systemPrompt: string; userPrompt: string };
```

This function:

1. Reads pre-computed analytics from `ctx` (volume profile, algo S/R, IV skew, OI summary, trigger report, indicator patterns)
2. Formats them into prompt-friendly strings (the formatting logic currently inline in `generateDeepDive`)
3. Reads the deep-dive prompt template from `deep-dive-analyzer.ts`
4. Returns the fully assembled system + user prompts

Move all the deterministic-to-text formatting out of `llm-analyzer.ts` into this adapter.

**Testing:**

Create `src/__tests__/prompts/deep-dive-context.test.ts`:

| Test case                         | Description                                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| includes volume profile in prompt | Pass context with a volume profile. Assert the output prompt contains VPOC, VAH, VAL values.                                                         |
| includes trigger report summary   | Pass context with a non-trivial trigger report. Assert prompt contains trigger classification, score, and direction.                                 |
| handles null analytics gracefully | Pass context with null volume profile and null IV skew. Assert prompt still generates without errors and contains appropriate "unavailable" markers. |
| includes all requested timeframes | Pass context with 6 timeframes of candles. Assert prompt references all 6 timeframe sections.                                                        |

---

### Story 3.3 — Create prompt-adapter layer for recommendations

**Implementation:**

Create `src/lib/prompts/recommendation-context.ts`:

```typescript
export function buildRecommendationPromptContext(
  ctx: TickerAnalysisContext,
  input: RecommendationInput,
  scorecard: SignalScorecard,
): { systemPrompt: string; userPrompt: string };
```

Move the prompt-building logic from the inline recommendation block in `analysis-pipeline.ts` and the trade-analyzer prompt template into this adapter. The adapter reads all analytics from `ctx` and market-context formatting from the scorecard.

**Testing:**

Create `src/__tests__/prompts/recommendation-context.test.ts`:

| Test case                               | Description                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| includes scorecard in prompt            | Pass a scorecard with known scores. Assert prompt contains the scorecard section.            |
| correlation mode includes event context | Pass a correlation-sourced input. Assert prompt contains the correlated headline and impact. |
| whale-signal mode omits event context   | Pass a whale-signal-sourced input. Assert prompt does NOT contain a correlation section.     |

---

### Story 3.4 — Remove analytics imports from `llm-analyzer.ts`

**Implementation:**

After Stories 3.1-3.3, `llm-analyzer.ts` should no longer import or call:

- `computeVolumeProfile`
- `computeAlgoSR`
- `computeIVSkew`
- `computeOISummary`
- `buildTriggerReport`
- `detectAllIndicatorPatterns`

Remove these imports. The file should only import from:

- `openai` (client)
- `@/lib/prompts/*` (prompt adapters)
- `@/types/*` (type definitions)
- Zod schemas for response validation

Run `tsc --noEmit`.

**Testing:**

| Test case                                    | Description                                                                                                                                                                         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| llm-analyzer has no analytics imports        | Grep test: assert `llm-analyzer.ts` does not import from `utils/volume-profile`, `utils/algo-sr`, `utils/options-analytics`, `utils/trigger-engine`, or `utils/indicator-patterns`. |
| all LLM functions still produce valid output | Run each exported LLM function with mocked OpenRouter responses. Assert valid parsed output.                                                                                        |

---

### Story 3.5 — Update `report-data-aggregator.ts` to accept `TickerAnalysisContext`

**Implementation:**

`report-data-aggregator.ts` is the third consumer of the same analytics. Update `computeEnrichedData` to accept an optional `TickerAnalysisContext`:

```typescript
export function computeEnrichedData(
  input: EnrichmentInput,
  ctx?: TickerAnalysisContext,
): EnrichedData;
```

When `ctx` is provided, read volume profile, algo S/R, IV skew, and OI summary from it instead of recomputing. When `ctx` is not provided (e.g., client-side PDF export without a pipeline context), fall back to computing inline (preserving current behavior).

**Testing:**

Create `src/__tests__/services/report-data-aggregator.test.ts`:

| Test case                            | Description                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| uses pre-computed analytics from ctx | Pass a context with known volume profile and algo S/R. Assert output matches ctx values, not recomputed ones. |
| falls back to computing when no ctx  | Omit ctx parameter. Assert `computeVolumeProfile` and `computeAlgoSR` are called.                             |

---

## Sprint 4 — Separate Nexus Earnings Monitor

**Finding:** The nexus earnings monitor runs serially at pipeline start, blocking all downstream analysis work. It loops through `NEXUS_COMPANIES` with sequential fetches.

**Goal:** Decouple nexus earnings from the hot pipeline cycle. Cache results and refresh on a slower cadence.

### Story 4.1 — Create `NexusEarningsCache` service

**Implementation:**

Create `src/lib/services/nexus-earnings-cache.ts`:

```typescript
interface CachedNexusEarnings {
  data: Map<string, NexusEarnings>;
  refreshedAt: string;
}

let cache: CachedNexusEarnings | null = null;

export async function refreshNexusEarnings(): Promise<
  Map<string, NexusEarnings>
>;

export function getCachedNexusEarnings(): Map<string, NexusEarnings>;

export function getNexusEarningsAge(): number; // ms since last refresh
```

`refreshNexusEarnings`:

1. Fetch earnings dates for all `NEXUS_COMPANIES` with bounded concurrency (e.g., 3 at a time via `Promise.allSettled` batches or a semaphore).
2. For companies within the 72-hour reporting window, fetch EPS surprise data concurrently.
3. Store results in the module-level cache.
4. Return the map.

`getCachedNexusEarnings`:

- Returns cached data if available.
- Returns empty map if no cache (never blocks).

**Testing:**

Create `src/__tests__/services/nexus-earnings-cache.test.ts`:

| Test case                                                     | Description                                                                                                                                                 |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| refreshes and caches earnings data                            | Mock `fetchEarningsDate` and `fetchEpsSurprise`. Call `refreshNexusEarnings`. Assert cache is populated and `getCachedNexusEarnings` returns the same data. |
| fetches with bounded concurrency                              | Provide 10 nexus companies. Assert no more than 3 `fetchEarningsDate` calls are in-flight simultaneously.                                                   |
| handles partial fetch failures                                | Mock 2 of 5 companies to reject. Assert the other 3 are cached.                                                                                             |
| getCachedNexusEarnings returns empty map before first refresh | Assert empty map, no throw.                                                                                                                                 |
| detects 72-hour window correctly                              | Mock an earnings date 48 hours ago. Assert EPS surprise is fetched. Mock one 96 hours ago. Assert EPS surprise is NOT fetched.                              |

---

### Story 4.2 — Schedule nexus earnings refresh independently

**Implementation:**

In `scheduler.ts`, add a separate refresh cadence for nexus earnings:

```typescript
// Refresh nexus earnings every 2 hours (earnings dates change slowly)
cron.schedule("15 */2 * * *", async () => {
  await refreshNexusEarnings();
});
```

Also call `refreshNexusEarnings()` at startup (alongside the existing cold-start pipeline run).

**Testing:**

| Test case                                       | Description                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| scheduler calls refreshNexusEarnings at startup | Mock `refreshNexusEarnings`. Call `startScheduler`. Assert it was called. |

---

### Story 4.3 — Replace inline nexus loop in analysis pipeline

**Implementation:**

In `analysis-pipeline.ts`, replace the serial nexus earnings loop (~L320-420) with:

```typescript
const recentNexusEarnings = getCachedNexusEarnings();
```

Remove the inline `fetchEarningsDate`/`fetchEpsSurprise` loop. Remove unused imports.

**Testing:**

| Test case                             | Description                                                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| analysis pipeline reads from cache    | Mock `getCachedNexusEarnings` to return fixture data. Assert pipeline does NOT call `fetchEarningsDate` directly. |
| pipeline handles empty earnings cache | Mock empty cache. Assert pipeline runs without cascade context (same as no nexus earnings reported).              |

---

## Sprint 5 — Fix News Pipeline N+1 Pattern

**Finding:** `classifyAndStoreNews()` inserts each event individually then re-queries to get the row ID for event-trigger analysis.

**Goal:** Batch inserts, eliminate per-row re-queries, clean event handoff.

### Story 5.1 — Batch insert classified news events

**Implementation:**

In `news-pipeline.ts`, replace the row-by-row insert loop with a batch approach:

```typescript
// Build all rows
const rows = classifiedEvents.map((event) => ({
  headline: event.headline,
  url: event.url,
  // ... all other fields
}));

// Batch insert (Drizzle supports .values(rows) for arrays)
if (rows.length > 0) {
  await db.insert(newsEvents).values(rows).onConflictDoNothing(); // dedup by URL
}
```

After the batch insert, retrieve all inserted rows in a single query:

```typescript
const insertedRows = await db
  .select()
  .from(newsEvents)
  .where(
    inArray(newsEvents.url, rows.map((r) => r.url).filter(Boolean) as string[]),
  )
  .orderBy(desc(newsEvents.id));
```

This replaces N inserts + N selects with 1 insert + 1 select.

**Testing:**

Create `src/__tests__/cron/news-pipeline.test.ts`:

| Test case                               | Description                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| batch inserts all events in one call    | Mock DB. Classify 5 articles. Assert `db.insert` is called once with 5 rows, not 5 times with 1 row.                                        |
| retrieves inserted rows in single query | Assert `db.select` is called once after insert, not per-row.                                                                                |
| handles empty classification result     | Zero classified events. Assert no insert or select calls.                                                                                   |
| deduplicates by URL                     | Provide 3 articles where 1 URL already exists. Assert `onConflictDoNothing` prevents duplicate, returned rows count matches actual inserts. |

---

### Story 5.2 — Decouple event-trigger from insert loop

**Implementation:**

Move the `autoTriggerEventAnalysis` call outside the insert logic:

```typescript
// 1. Batch insert
const storedCount = await batchInsertClassifiedNews(classifiedEvents);

// 2. Retrieve inserted rows
const insertedRows = await getRecentlyInsertedNews(classifiedEvents);

// 3. Trigger analysis (separate concern)
if (insertedRows.length > 0) {
  await autoTriggerEventAnalysis(insertedRows, {
    minImpact: options?.autoTriggerMinImpact ?? 8,
  });
}
```

This makes the flow: classify → store → trigger, with each step operating on batch results.

**Testing:**

| Test case                                           | Description                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| autoTriggerEventAnalysis receives all inserted rows | Insert 5 events. Assert `autoTriggerEventAnalysis` is called once with all 5, not 5 times with 1. |
| trigger analysis skipped when no inserts            | All events are duplicates. Assert `autoTriggerEventAnalysis` is NOT called.                       |

---

## Sprint 6 — Pipeline Documentation Alignment

**Finding:** Documentation still describes a six-stage pipeline with active sim execution. The runtime is a three-stage pipeline.

**Goal:** Documentation accurately reflects the current runtime architecture.

### Story 6.1 — Update Obsidian Pipeline Architecture doc

**Implementation:**

Patch `Projects/Options Dashboard/Pipeline Architecture.md` in the Obsidian vault:

1. Change the pipeline stage model from 6 stages to 3 active stages (fetch, classify, analysis).
2. Mark the sim execution stage as **historical/planned** with a clear callout.
3. Update the file tree to match current workspace files.
4. Update any flow diagrams.

**Testing:**

- Manual review: read back the patched doc and verify stage count matches `scheduler.ts` runtime stages.
- Grep the doc for "Stage 4", "Stage 5", "Stage 6" — any remaining references should be in a clearly marked historical section.

---

### Story 6.2 — Update Obsidian Architecture & Tech Stack doc

**Implementation:**

Patch `Projects/Options Dashboard/Architecture & Tech Stack.md`:

1. Update the pipeline overview to reflect 3 active stages.
2. Update the services inventory to match current exports.
3. Verify model references use `moonshotai/kimi-k2.5` as the default.

**Testing:**

- Grep for stale model IDs, deleted file names, and "sim-pipeline" references. Assert zero matches.

---

### Story 6.3 — Update repo-level architecture memory

**Implementation:**

Update `/memories/repo/pipeline-architecture.md` to reflect the refactored architecture after Sprints 1-5 are complete:

- Document the `TickerAnalysisContext` contract
- Document the unified recommendation path
- Document the separated nexus earnings cache
- Document the 3-layer LLM architecture (context builder → prompt adapter → LLM client)

**Testing:**

- Read back and verify accuracy against implemented code.

---

## Sprint 7 — Extract LLM Transport Layer

**Finding:** `llm-analyzer.ts` still owned OpenRouter client setup, model fallback logic, retry/backoff, JSON extraction/repair, and token accounting in addition to domain wrappers.

**Goal:** Keep domain-specific wrapper functions in `llm-analyzer.ts`, but move provider transport concerns into a dedicated reusable client module.

### Story 7.1 — Create `llm-client.ts`

**Implementation:**

Create `src/lib/services/llm-client.ts` to own:

- OpenRouter client singleton lifecycle
- model selection helpers and stable news-model fallback
- generic `callLlmWithRetry()` transport wrapper
- JSON extraction and repair helpers
- token usage accounting and reset hooks for tests

`llm-analyzer.ts` should consume this module rather than owning those concerns inline.

**Testing:**

- Run focused LLM wrapper tests to ensure retry, parsing, preview fallback, and token tracking behavior are unchanged.

### Story 7.2 — Keep wrapper surface stable

**Implementation:**

Preserve the current public wrapper API from `llm-analyzer.ts`:

- `classifyNews()`
- `crossReferenceAnalysis()`
- `generateRecommendation()`
- `generateDeepDive()`
- `analyzeNexusDrift()`
- `getTokenUsageStats()`
- `_resetClient()` for tests

This keeps call sites stable while clarifying the internal boundary between domain prompt wrappers and provider transport.

**Testing:**

- Run service tests for `llm-analyzer.ts`
- Run API tests covering `/api/pipeline-status` token usage output

---

## Sprint Dependency Order

```
Sprint 1 (Context Builder)
    ↓
Sprint 2 (Unified Recommendations)  ← depends on Sprint 1 for context cache
    ↓
Sprint 3 (LLM Layer Split)          ← depends on Sprint 1 for TickerAnalysisContext type
    ↓
Sprint 4 (Nexus Earnings)           ← independent, can run parallel with Sprint 2-3
    ↓
Sprint 5 (News N+1 Fix)             ← independent, can run anytime
    ↓
Sprint 6 (Documentation)            ← runs last, after all code changes are final
```

Sprints 4 and 5 are independent of each other and of Sprints 2-3. They can be executed in parallel or in any order. Sprint 6 must be last.

## Testing Strategy Summary

| Layer                  | Test Type                         | Location                                                |
| ---------------------- | --------------------------------- | ------------------------------------------------------- |
| Types                  | Compile/structural                | `src/__tests__/types/`                                  |
| Context builder        | Unit + integration                | `src/__tests__/services/ticker-context-builder.test.ts` |
| Recommendation adapter | Unit                              | `src/__tests__/services/recommendation-adapter.test.ts` |
| Prompt adapters        | Unit                              | `src/__tests__/prompts/`                                |
| LLM analyzer           | Unit (mocked LLM)                 | `src/__tests__/services/llm-analyzer.test.ts`           |
| Report aggregator      | Unit                              | `src/__tests__/services/report-data-aggregator.test.ts` |
| Nexus cache            | Unit                              | `src/__tests__/services/nexus-earnings-cache.test.ts`   |
| News pipeline          | Unit                              | `src/__tests__/cron/news-pipeline.test.ts`              |
| Pipeline integration   | Integration (all mocked external) | `src/__tests__/cron/analysis-pipeline.test.ts`          |

All tests use Vitest. External APIs (OpenRouter, Yahoo Finance, Finnhub) are always mocked. Database tests use the real SQLite driver against an in-memory or temp-file database.
