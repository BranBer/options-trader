# Story 42.1 — Architecture Assessment: Reusability & Extraction Plan

> **Date:** 2026-04-10  
> **Status:** COMPLETE

## Executive Summary

**Key finding:** The current GlobePage.tsx is a 1,057-line monolith with the globe visualization, event detail sidebar, events list, and all state management tightly coupled. A full component extraction (Story 42.7) is the right approach — it enables code reuse and keeps both pages maintainable, but carries moderate regression risk.

**DB recommendation:** Add a `category` column to the existing `newsEvents` table (Option A). A separate table is unnecessary overhead.

**Estimated scope after extraction:** 4 new files, 7 modified files.

---

## Component Reuse Matrix

| Component                                                       | Current Location                              | Reusable As-Is?                             | Action                                              | Effort |
| --------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------- | --------------------------------------------------- | ------ |
| Globe.gl visualization (init, points, clustering, interactions) | `GlobePage.tsx` (inline, ~300 lines)          | **No** — wired to local state               | **Extract** → `globe/shared/GlobeVisualization.tsx` | Medium |
| `EventDetail` sidebar                                           | `GlobePage.tsx` (inline, ~150 lines)          | **Partially** — event type badges hardcoded | **Extract** → `globe/shared/EventDetail.tsx`        | Low    |
| `EventsList` feed                                               | `GlobePage.tsx` (inline, ~100 lines)          | **Partially** — no category awareness       | **Extract** → `globe/shared/EventsList.tsx`         | Low    |
| `EventTickerAnalysisPanel`                                      | `globe/EventTickerAnalysis.tsx` (standalone)  | **Yes**                                     | **No change**                                       | None   |
| `TickerAnalysisCard`                                            | `globe/EventTickerAnalysis.tsx` (standalone)  | **Yes**                                     | **No change**                                       | None   |
| `TechnicalChart`                                                | `shared/TechnicalChart.tsx`                   | **Yes**                                     | **No change**                                       | None   |
| `ConfidenceBreakdownPanel`                                      | `shared/ConfidenceBreakdownPanel.tsx`         | **Yes**                                     | **No change**                                       | None   |
| `impactColor()`                                                 | `GlobePage.tsx` (inline helper)               | **No** — inline function                    | **Extract** to shared utils or accept as prop       | Low    |
| `packCircles()`                                                 | `GlobePage.tsx` (inline helper)               | **No** — inline function                    | **Extract** to shared utils                         | Low    |
| `getEventCoordinates()`                                         | `GlobePage.tsx` (inline helper)               | **No** — inline function                    | **Extract** to shared utils                         | Low    |
| `parseStringArray()`                                            | `GlobePage.tsx` (inline helper)               | **No** — inline function                    | **Extract** to shared utils                         | Low    |
| `COUNTRY_COORDS` map                                            | `news-fetcher.ts` (partial) + `GlobePage.tsx` | Split across files                          | **Consolidate** into shared module                  | Low    |

### Hook Reuse

| Hook                        | Current Location      | Action                                     |
| --------------------------- | --------------------- | ------------------------------------------ |
| `useNews(minImpact, limit)` | `hooks/useApiData.ts` | **Extend** — add `category?: string` param |

### Service Reuse

| Service                        | Current Location                    | Reusable?                                             | Action                                                     |
| ------------------------------ | ----------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| `analyzeEventTickers()`        | `services/event-ticker-analyzer.ts` | **Yes** — source-agnostic                             | **No change**                                              |
| `fetchAllNews()`               | `services/news-fetcher.ts`          | **No** — general sources                              | **Create** `fetchAllTechNews()` in new file                |
| `classifyAndStoreNews()`       | `cron/pipelines/news-pipeline.ts`   | **Partially** — classifier + storage reusable pattern | **Extend** or create parallel `classifyAndStoreTechNews()` |
| `classifyNews()` (Gemini call) | `services/gemini-analyzer.ts`       | **Partially** — needs different prompt                | Accept prompt/schema as params                             |

### API Route Reuse

| Route                                             | Current Location                      | Action                                                   |
| ------------------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| `GET /api/news`                                   | `api/news/route.ts`                   | **Extend** — add `?category=tech` filter to WHERE clause |
| `GET /api/analysis/event-tickers`                 | `api/analysis/event-tickers/route.ts` | **No change** — works with any eventId                   |
| `POST /api/analysis/event-tickers`                | `api/analysis/event-tickers/route.ts` | **No change** — source-agnostic                          |
| `GET /api/analysis/event-tickers/analyzed-events` | Analyzed events route                 | **No change** — returns all analyzed events              |
| `POST /api/analysis/event-tickers/high-impact`    | High-impact route                     | **Extend** — add category filter for backfill            |

---

## DB Schema Recommendation

### Option A: Add `category` column (✅ RECOMMENDED)

```sql
ALTER TABLE news_events ADD COLUMN category TEXT NOT NULL DEFAULT 'general';
CREATE INDEX idx_news_events_category_impact ON news_events(category, impact_score, created_at);
```

**Pros:**

- Single table for all news events — simpler queries, simpler dedup
- Existing queries unaffected (default = `'general'`)
- Filtering is just a WHERE clause addition
- Cross-category dedup by URL works automatically
- One `newsEvents` Drizzle schema, one type

**Cons:**

- Table grows faster (tech + general rows mixed)
- Must remember to filter by category in all new queries

### Option B: Separate `techNewsEvents` table (❌ NOT RECOMMENDED)

**Pros:**

- Clean separation, no mixed data
- Independent indexes optimized per table

**Cons:**

- Duplicate DDL, duplicate types, duplicate schema
- Cross-category dedup requires querying both tables
- `event-ticker-analyzer.ts` needs to know which table to look up event context
- More migration work, more code to maintain

**Decision: Option A.** The `category` column is simpler, avoids schema duplication, and matches the established pattern where the classifier output is stored in a unified table with contextual tagging (like `analyses` uses `source` and `type` columns).

---

## Extraction Plan

### Phase 1: Extract shared utilities (prerequisite for both pages)

**New file: `src/components/globe/shared/globe-utils.ts`**

- `packCircles(radii: number[]): { x: number; y: number }[]`
- `impactColor(score: number): string`
- `getEventCoordinates(event: NewsEvent): { lat: number; lng: number }`
- `parseStringArray(input: string | null | undefined): string[]`
- `getAnalyzableTickers(event: NewsEvent): string[]`
- `clusterKey(event: NewsEvent, coords: { lat: number; lng: number }): string`

### Phase 2: Extract shared components

**New file: `src/components/globe/shared/GlobeVisualization.tsx`**

Props:

```typescript
interface GlobeVisualizationProps {
  events: NewsEvent[];
  selectedEvent: NewsEvent | null;
  onSelectEvent: (event: NewsEvent) => void;
  analyzedEventIds: Set<number>;
  colorScheme?: (event: NewsEvent) => string; // optional override
  globeReady: boolean;
  onGlobeReady: () => void;
}
```

Extracts: globe.gl initialization, useRef for globe instance, useEffect for points update, clustering logic, point rendering, click handlers, camera control.

**New file: `src/components/globe/shared/EventDetail.tsx`**

Props:

```typescript
interface EventDetailProps {
  event: NewsEvent;
  analysisState?: AnalysisState;
  onAnalyze: () => void;
  onReanalyze?: () => void;
  lastAnalyzedAt?: string | null;
  eventTypeBadgeMap?: Record<string, { label: string; color: string }>;
  maxTickers?: number;
}
```

Extracts: headline display, impact/sentiment badges, sector pills, ticker list, analyze button, reload button.

**New file: `src/components/globe/shared/EventsList.tsx`**

Props:

```typescript
interface EventsListProps {
  events: NewsEvent[];
  selectedEvent: NewsEvent | null;
  onSelect: (event: NewsEvent) => void;
  analyzedEventIds: Set<number>;
  recentAnalyses?: AnalyzedEventsResponse["recentAnalyses"];
}
```

### Phase 3: Refactor existing GlobePage to use shared components

- `GlobePage.tsx` imports and composes shared components
- All logic stays in GlobePage — shared components are presentational
- State management (analyses, loading states, API calls) remains in the page component
- **Risk mitigation:** Run existing tests, visual check before/after

### Phase 4: Build TechGlobePage using shared components

- `TechGlobePage.tsx` composes the same shared components with tech-specific config
- Different data source: `useNews(5, 200, 'tech')`
- Different color scheme for tech sub-categories
- Same analysis flow (reuses all analysis services and API routes)

---

## New vs Modified Files Summary

### New Files (4)

| File                                                 | Purpose                        |
| ---------------------------------------------------- | ------------------------------ |
| `src/components/globe/shared/globe-utils.ts`         | Extracted helper functions     |
| `src/components/globe/shared/GlobeVisualization.tsx` | Globe rendering component      |
| `src/components/globe/shared/EventDetail.tsx`        | Event detail sidebar component |
| `src/components/globe/shared/EventsList.tsx`         | Events list feed component     |

### Modified Files (7)

| File                                      | Change                                           |
| ----------------------------------------- | ------------------------------------------------ |
| `src/lib/db/schema.ts`                    | Add `category` column to `newsEvents`            |
| `src/lib/db/client.ts`                    | Update `CREATE TABLE` DDL with `category` column |
| `src/app/api/news/route.ts`               | Add `?category=` query filter                    |
| `src/hooks/useApiData.ts`                 | Add `category` param to `useNews()`              |
| `src/lib/cron/pipelines/news-pipeline.ts` | Accept category in `classifyAndStoreNews()`      |
| `src/components/globe/GlobePage.tsx`      | Refactor to use shared components                |
| `src/components/shared/Navbar.tsx`        | Add Tech Globe link                              |

### New Files — Tech-Specific (3)

| File                                      | Purpose                           |
| ----------------------------------------- | --------------------------------- |
| `src/lib/services/tech-news-fetcher.ts`   | HN + NewsAPI + GDELT tech fetcher |
| `src/lib/prompts/tech-news-classifier.ts` | Tech-tuned Gemini prompt          |
| `src/components/globe/TechGlobePage.tsx`  | Tech globe page component         |
| `src/app/tech-globe/page.tsx`             | Route entry point                 |

**Total: ~8 new files, 7 modified files**

---

## Revised Story Scope (Post-Research)

Based on this assessment, the implementation stories from the epic should be adjusted:

1. **Story 42.3 (DB Schema)** — Unchanged. Add `category` column + index.
2. **Story 42.4 (Tech Fetcher)** — Scope confirmed: 3 source functions (HN, NewsAPI, GDELT-tech) + aggregator.
3. **Story 42.5 (Tech Pipeline)** — Can reuse `classifyAndStoreNews` with category param instead of a fully separate function. Simpler than expected.
4. **Story 42.6 (API Extension)** — Minimal: add `category` to query in 1 SQL WHERE clause + hook param.
5. **Story 42.7 (Extract Components)** — This is the **highest-risk story**. The 1,057-line GlobePage extraction needs careful testing. Recommend doing this before building TechGlobePage.
6. **Story 42.8 (Tech Globe Page)** — After extraction, this becomes a slim composition of shared components (~200 lines).
7. **Story 42.9 (Nav & Polish)** — Unchanged.

### Suggested Order Change

The epic dependency graph should be:

```
42.3 (DB) → 42.4 (Fetcher) → 42.5 (Pipeline) → 42.6 (API)
                                                      ↓
                                          42.7 (Extract) → 42.8 (Tech Page) → 42.9 (Nav)
```

Story 42.7 can start in parallel with 42.3–42.6 since it doesn't depend on the tech data layer. This is the critical path item.
