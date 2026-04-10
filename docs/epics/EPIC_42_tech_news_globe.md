# Epic 42: Tech News Globe

> **Status:** � PHASE 0 COMPLETE — Research done, implementation ready  
> **Priority:** P2 — Medium (extends proven globe architecture to a high-value vertical)  
> **Created:** 2026-04-10  
> **Phase 0 Completed:** 2026-04-10  
> **Depends on:** Epic 37 (Event-Driven Ticker Analysis), existing globe page, news pipeline

## Problem Statement

The current globe page ingests general market-moving news from three sources (Finnhub, GDELT, Marketaux) and classifies them through a financial-analyst lens. Technology sector events — product launches, AI breakthroughs, semiconductor supply shifts, cybersecurity incidents, regulatory actions on big tech — are captured only incidentally when they score high enough on a general "market impact" scale. This means:

1. **Tech events are under-represented.** A breakthrough AI model announcement or a major open-source release may score low on "market impact" (impact 3–4) but be highly relevant to tech-focused portfolios.
2. **Tech-specific tickers are missed.** The general classifier favors mega-cap names (AAPL, MSFT, NVDA) and misses mid-cap SaaS, cybersecurity, or semiconductor plays that a tech-focused classifier would surface.
3. **No dedicated tech lens.** The classifier prompt is tuned for geopolitical/macro risk. Technology event types are lumped under a single "technology" category with no sub-classification (AI, semiconductors, cloud, cybersecurity, etc.).

## Goal

Create a **separate `/tech-globe` route** that reuses the globe visualization and event-ticker analysis infrastructure but is powered by tech-focused news sources and a tech-specific classification pipeline. When complete, a user should be able to:

1. View a 3D globe populated with technology sector news events
2. See tech-specific classifications (AI/ML, semiconductors, cloud/SaaS, cybersecurity, fintech, hardware, open-source, regulatory)
3. Click events to see affected tech tickers with the same full analysis pipeline (market data, options chain, technicals, deep dive, recommendation)
4. Filter by tech sub-category, impact score, and sentiment

## Architecture Principles

- **Reuse, don't duplicate.** The globe visualization, event-ticker analyzer, analysis panel components, and API routes should be extracted into shared modules where possible.
- **Separate data stream.** Tech news events should live in the same `newsEvents` table but be distinguishable via a `category` column (e.g., `"tech"` vs `"general"`).
- **Separate pipeline stage.** Tech news fetching and classification runs as its own pipeline stage, potentially on a different schedule or with different source weights.
- **Tech-tuned classifier.** A dedicated Gemini prompt optimized for technology sector classification, with sub-categories and tech-specific ticker suggestions.

---

## Phase 0 — Research

### Story 42.0 — Evaluate Tech News APIs & Sources

#### Goal

Survey available tech news APIs, assess their suitability (coverage, rate limits, cost, data quality, geolocation support), and recommend the optimal source mix for the tech globe.

#### Deliverables

- A research document (`docs/research/tech-news-sources.md`) evaluating at minimum:

  | Source                                    | Type               | Auth    | Rate Limit                         | Cost       | Geo? | Notes                                                  |
  | ----------------------------------------- | ------------------ | ------- | ---------------------------------- | ---------- | ---- | ------------------------------------------------------ |
  | **Hacker News (Algolia API)**             | Public API         | None    | Generous (10k/hr)                  | Free       | No   | Top/new stories; tech-focused but no tickers/sectors   |
  | **NewsAPI.org**                           | REST API           | API key | 100 req/day (free), 250k/mo (paid) | $0–$449/mo | No   | `technology` category; headline + description + source |
  | **Finnhub (filtered)**                    | Already integrated | API key | Existing budget                    | Existing   | No   | Filter existing feed by tech keywords/sectors          |
  | **Marketaux (filtered)**                  | Already integrated | API key | Existing budget                    | No         | No   | Filter by `industries` containing tech terms           |
  | **GDELT (tech query)**                    | Already integrated | None    | Existing                           | Free       | Yes  | Change query to tech keywords                          |
  | **Reddit (r/technology, r/programming)**  | OAuth API          | OAuth2  | 100 req/min                        | Free       | No   | Community buzz; noisy                                  |
  | **TechCrunch / The Verge / Ars Technica** | RSS feeds          | None    | N/A                                | Free       | No   | High quality; no structured data                       |
  | **Product Hunt**                          | GraphQL API        | OAuth2  | 450 req/day                        | Free       | No   | Product launches; limited market relevance             |
  | **Google News RSS (tech section)**        | RSS                | None    | N/A                                | Free       | No   | Aggregated; dedup challenge                            |

- Recommendation: which 2–3 sources to use, with rationale
- Assessment of geolocation feasibility for tech news (most tech news is US-centric; how to handle globe placement)
- Estimated API budget impact on existing pipeline

#### Acceptance Criteria

- [x] At least 6 sources evaluated with rate limits, cost, and data quality assessment
- [x] Clear recommendation of 2–3 sources with rationale
- [x] Geolocation strategy documented (company HQ mapping, default coordinates, etc.)
- [x] No code changes — research output only

**Output:** `docs/research/tech-news-sources.md`  
**Finding:** Use HN Algolia (free, high-signal) + NewsAPI.org tech category ($99/mo) + GDELT with tech query (free, has geo). Budget-conscious alternative: HN + GDELT only.

---

### Story 42.1 — Architecture Assessment: Reusability & Extraction Plan

#### Goal

Analyze the current globe page and supporting infrastructure to determine what can be shared with the tech globe, what needs extraction into shared modules, and what needs to be built new.

#### Deliverables

- A research document (`docs/research/tech-globe-architecture.md`) covering:

  **Component Reuse Matrix:**

  | Component                      | Current Location            | Reusable As-Is?      | Extraction Needed?                      | Notes                                         |
  | ------------------------------ | --------------------------- | -------------------- | --------------------------------------- | --------------------------------------------- |
  | Globe visualization (globe.gl) | `GlobePage.tsx` (inline)    | No — tightly coupled | Yes — extract `<GlobeVisualization>`    | Clustering, packing, color, interactions      |
  | EventDetail sidebar            | `GlobePage.tsx` (inline)    | Partially            | Yes — extract `<EventDetail>` component | Event type badges need tech sub-categories    |
  | EventsList feed                | `GlobePage.tsx` (inline)    | Partially            | Yes — extract `<EventsList>` component  | Filter logic differs by category              |
  | EventTickerAnalysisPanel       | `EventTickerAnalysis.tsx`   | Yes                  | No                                      | Already a standalone component                |
  | TechnicalChart                 | `shared/TechnicalChart.tsx` | Yes                  | No                                      | Already shared                                |
  | useNews hook                   | `useApiData.ts`             | Extend               | Add category param                      | `useNews(minImpact, limit, category?)`        |
  | `/api/news` route              | `api/news/route.ts`         | Extend               | Add category filter                     | `?category=tech`                              |
  | Event-ticker analyzer          | `event-ticker-analyzer.ts`  | Yes                  | No                                      | Source-agnostic; works with any event context |
  | News classifier prompt         | `news-classifier.ts`        | No                   | New prompt                              | Tech-specific taxonomy needed                 |
  | News fetcher                   | `news-fetcher.ts`           | Partially            | Extend or new                           | New sources + existing source filtering       |
  | News pipeline                  | `news-pipeline.ts`          | Extend               | Add category tagging                    | `classifyAndStoreTechNews()`                  |

  **DB Schema Changes:**
  - Option A: Add `category TEXT DEFAULT 'general'` to `newsEvents` table
  - Option B: Separate `techNewsEvents` table
  - Recommendation with tradeoffs

  **New vs Modified Files Estimate:**
  - Count of new files, modified files, extracted components
  - Effort estimate per story

#### Acceptance Criteria

- [x] Reuse matrix for all components, services, API routes, and DB tables
- [x] DB schema recommendation with tradeoffs
- [x] Component extraction plan (what moves to shared, what stays)
- [x] Clear list of what's new vs modified
- [x] No code changes — research output only

**Output:** `docs/research/tech-globe-architecture.md`  
**Finding:** Add `category` column to `newsEvents` (not a separate table). Extract 4 shared components from 1,057-line GlobePage monolith. ~8 new files, 7 modified files total.

---

### Story 42.2 — Tech News Classifier Prompt Design

#### Goal

Design and validate a Gemini classifier prompt optimized for technology sector news, with tech-specific sub-categories, ticker suggestions, and impact scoring calibrated for tech events.

#### Deliverables

- A new prompt file: `src/lib/prompts/tech-news-classifier.ts`
  - System instruction: "You are a senior technology industry analyst and market strategist..."
  - Tech sub-categories: `ai_ml`, `semiconductors`, `cloud_saas`, `cybersecurity`, `fintech`, `hardware`, `open_source`, `social_media`, `regulatory_tech`, `biotech_health_tech`, `other_tech`
  - Impact scoring calibrated for tech relevance (e.g., a major AI model release = 8-9, a minor app update = 2-3)
  - Ticker suggestions biased toward tech mid-caps, not just FAANG
  - Output schema matching existing `ClassifiedArticle` structure (with `event_type` expanded to tech sub-categories)
- Validation: Run prompt against 10–20 sample tech headlines and document classification quality
- Document: `docs/research/tech-classifier-validation.md` with sample inputs/outputs and quality assessment

#### Acceptance Criteria

- [x] Prompt file created with tech-specific system instruction and schema
- [x] Tech sub-categories defined (at least 8)
- [x] Validated against 10+ sample headlines with documented results
- [x] Impact scoring produces reasonable spread (not all 8+ or all 3-)
- [x] Output schema compatible with existing `ClassifiedArticle` type (backward compatible)

**Output:** `src/lib/prompts/tech-news-classifier.ts` + `docs/research/tech-classifier-validation.md`  
**Finding:** 12 tech sub-categories defined (ai_ml, semiconductors, cloud_saas, cybersecurity, fintech, hardware, open_source, social_media, regulatory_tech, biotech_health_tech, ev_cleantech, other_tech). Validated against 15 sample headlines with expected score spread from 1-9.

---

## Phase 1 — Data Layer

### Story 42.3 — DB Schema: Add Category Column to newsEvents

#### Goal

Add a `category` column to the `newsEvents` table to distinguish general news from tech news, enabling filtered queries without a separate table.

#### Deliverables

- Add `category TEXT NOT NULL DEFAULT 'general'` to `newsEvents` in `schema.ts`
- Add `CREATE TABLE` DDL update in `client.ts` bootstrap (or `ALTER TABLE ADD COLUMN IF NOT EXISTS`)
- Add composite index: `idx_news_events_category_impact_created` on `(category, impactScore, createdAt)`
- Existing rows default to `'general'`; tech pipeline inserts `'tech'`

#### Acceptance Criteria

- [x] Column exists on `newsEvents` table with default `'general'`
- [x] Existing data unaffected (default backfill)
- [x] Index added for filtered queries
- [x] No breaking changes to existing news pipeline or API

**Output:** `src/lib/db/schema.ts`, `src/lib/db/client.ts`, `src/lib/db/migrations/0009_sad_golden_guardian.sql`  
**Implemented:** `news_events.category` column, bootstrap backfill/ALTER handling, and composite category-impact-created index.

---

### Story 42.4 — Tech News Fetcher Service

#### Goal

Create a tech news fetcher that retrieves articles from the recommended sources (determined by Story 42.0).

#### Deliverables

- `src/lib/services/tech-news-fetcher.ts`
  - `fetchAllTechNews(): Promise<RawNewsArticle[]>`
  - Individual source fetchers based on research findings (e.g., `fetchHackerNewsTopStories()`, `fetchFilteredFinnhubTech()`, etc.)
  - Each source maps to `RawNewsArticle` schema (same type as general fetcher)
  - Geolocation enrichment: map company names → HQ coordinates (lookup table or API)
  - `Promise.allSettled` pattern matching `news-fetcher.ts`

#### Acceptance Criteria

- [x] Fetches from 2–3 sources in parallel
- [x] Returns `RawNewsArticle[]` compatible with existing pipeline types
- [x] Geolocation enrichment applied where possible
- [x] Error handling per source (one failure doesn't block others)
- [x] Respects API rate limits

**Output:** `src/lib/services/tech-news-fetcher.ts`  
**Implemented:** Hacker News front page ingest, NewsAPI technology headlines, GDELT tech-query ingest, deduplication, and company-HQ geo hints.

---

### Story 42.5 — Tech News Pipeline Stage

#### Goal

Create a pipeline stage that fetches tech news, classifies with the tech-specific prompt, and stores with `category: 'tech'`.

#### Deliverables

- `classifyAndStoreTechNews()` in `news-pipeline.ts` (or separate `tech-news-pipeline.ts`)
  - Calls `fetchAllTechNews()` for raw articles
  - Deduplicates against existing `newsEvents` (same URL check)
  - Classifies with tech-specific Gemini prompt
  - Inserts with `category: 'tech'`
  - Auto-triggers event-ticker analysis for high-impact tech events (≥7, lower threshold since tech events are more targeted)
- Register in scheduler: either alongside existing news pipeline or as a separate stage

#### Acceptance Criteria

- [x] Pipeline stage fetches, classifies, and stores tech news
- [x] All inserted rows have `category: 'tech'`
- [x] Deduplication works across general and tech categories (same URL)
- [x] Auto-trigger threshold appropriate for tech events
- [x] Scheduler integration documented

**Output:** `src/lib/cron/pipelines/news-pipeline.ts`, `src/lib/cron/scheduler.ts`, `src/lib/services/llm-analyzer.ts`, `src/lib/services/event-ticker-analyzer.ts`  
**Implemented:** Reusable classifier config, `runTechNewsPipeline()`, scheduler fetch/classify integration, and a lower tech auto-trigger threshold of `>= 7`.

---

## Phase 2 — API & Frontend (scope adjusted after Phase 0 findings)

### Story 42.6 — API: Extend News Endpoint with Category Filter

#### Goal

Extend the `/api/news` endpoint to support a `category` query parameter, and create any tech-specific API routes needed.

#### Deliverables

- Modify `GET /api/news` to accept `?category=tech` (or `?category=general`; default = all)
- Filter query: `WHERE category = :category` (if specified)
- Extend `useNews` hook: `useNews(minImpact, limit, category?)`
- If needed: tech-specific analyzed-events and high-impact endpoints (may reuse existing with category filter)

#### Acceptance Criteria

- [ ] `/api/news?category=tech` returns only tech news
- [ ] `/api/news` without category returns all (backward compatible)
- [ ] `useNews` hook accepts optional category parameter
- [ ] Existing globe page unaffected

---

### Story 42.7 — Extract Shared Globe Components

#### Goal

Extract the globe visualization, event detail sidebar, and events list into shared components that can be used by both the general and tech globe pages.

#### Deliverables

Based on Story 42.1 findings, extract into `src/components/globe/shared/`:

- `GlobeVisualization.tsx` — globe.gl instance, clustering, packing, point rendering, interactions
- `EventDetail.tsx` — Event detail sidebar (headline, impact, sentiment, tickers, analyze button)
- `EventsList.tsx` — Event feed list with badges and filtering

Each component should accept configuration props for:

- Color scheme (optional theme override)
- Event type badge mapping (general vs tech sub-categories)
- Impact score thresholds
- Category-specific filtering

#### Acceptance Criteria

- [ ] Shared components render identically to current globe page
- [ ] Current `GlobePage.tsx` refactored to use shared components (no visual regression)
- [ ] Components accept category-specific configuration via props
- [ ] No functionality lost in extraction

---

### Story 42.8 — Tech Globe Page

#### Goal

Create the `/tech-globe` route and `TechGlobePage` component, composing shared globe components with tech-specific configuration.

#### Deliverables

- `src/app/tech-globe/page.tsx` — Route entry point
- `src/components/globe/TechGlobePage.tsx` — Main page component
  - Uses shared `GlobeVisualization`, `EventDetail`, `EventsList`
  - Calls `useNews(minImpact, limit, 'tech')` for data
  - Tech sub-category color scheme (e.g., AI=cyan, semiconductors=indigo, cybersecurity=red, cloud=blue)
  - Tech sub-category badges in event detail
  - Same analysis flow: click event → analyze tickers → EventTickerAnalysisPanel
  - Same reload/re-analyze functionality

#### Acceptance Criteria

- [ ] `/tech-globe` route loads and renders globe with tech news only
- [ ] Tech sub-categories displayed as color-coded badges
- [ ] Event-ticker analysis works identically to general globe
- [ ] Reload buttons (all + per-ticker) functional
- [ ] Page loads without errors when no tech news exists (empty state)

---

### Story 42.9 — Navigation & Polish

#### Goal

Add the tech globe to navigation, add a category switcher or cross-links between the two globe pages, and implement any UX polish.

#### Deliverables

- Add "Tech Globe" link to `Navbar.tsx`
- Cross-link between `/globe` and `/tech-globe` (e.g., "Switch to Tech News" / "Switch to Market News" pill toggle)
- Loading skeleton matching general globe
- Empty state messaging ("No tech news events in the last 24 hours")
- Error boundary wrapping

#### Acceptance Criteria

- [ ] Tech globe accessible from navbar
- [ ] Cross-navigation between globe pages
- [ ] Loading and empty states handled gracefully
- [ ] Consistent with existing UX patterns

---

## Dependency Graph

```
42.0 (Research: APIs)  ──┐
42.1 (Research: Arch)  ──┼──→ 42.3 (DB Schema) ──→ 42.4 (Fetcher) ──→ 42.5 (Pipeline)
42.2 (Research: Prompt) ─┘                                                    │
                                                                              ▼
                          42.6 (API Extension) ◄──────────────────────────────┘
                                │
                                ▼
                          42.7 (Extract Components) ──→ 42.8 (Tech Globe Page) ──→ 42.9 (Nav & Polish)
```

## Scope Notes

- **Stories 42.3–42.9 are tentative.** Their exact scope, file structure, and implementation details will be refined after Phase 0 research stories (42.0, 42.1, 42.2) are completed.
- **The research stories may reveal that:**
  - Existing sources (Finnhub/Marketaux) can be filtered for tech, eliminating the need for new API integrations
  - Component extraction (42.7) is unnecessary if the pages are different enough to warrant separate implementations
  - A lighter approach (same globe page with a category toggle) is preferable to a separate route
- **Estimated total effort:** 3–5 implementation stories after research, depending on reuse level

## Risk Assessment

| Risk                                                     | Likelihood | Impact | Mitigation                                                                   |
| -------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------- |
| Tech news sources lack geolocation data                  | High       | Medium | Company HQ lookup table; default to US coordinates for unlocatable companies |
| Existing sources don't have enough tech-specific content | Medium     | High   | Research spike (42.0) evaluates volume before committing to sources          |
| Component extraction (42.7) causes regressions           | Medium     | Medium | Extract behind feature flag; visual regression testing                       |
| Tech classifier hallucinates tickers                     | Medium     | Low    | Same per-ticker error handling as existing pipeline; graceful degradation    |
| API budget pressure from additional pipeline stage       | Low        | Medium | Tech pipeline runs at lower frequency (every 30 min vs 10 min)               |
