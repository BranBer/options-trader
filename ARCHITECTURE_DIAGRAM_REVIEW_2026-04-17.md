# Architecture Diagram Review — 2026-04-17

## Scope

Review of the current architecture and pipeline diagrams across the project documentation, with emphasis on:

- structural gaps between diagrams and runtime behavior
- redundant or conflicting representations
- opportunities to simplify or improve the documentation set

Documents reviewed:

- Obsidian vault architecture notes
- pipeline notes
- trading algorithm notes
- product overview notes

Code paths cross-checked:

- `src/hooks/useExportPdf.ts`
- `src/components/report/ReportDocument.tsx`
- `src/components/globe/GlobePage.tsx`
- `src/hooks/useApiData.ts`

---

## Findings

### 1. PDF export is documented as if it were part of the scheduled pipeline

Severity: High

The diagrams currently place report enrichment and report rendering as a continuation of the main analysis pipeline. That is not how the system actually runs.

In the code, PDF generation is user-initiated and client-side orchestrated through `useExportPdf()`, which fetches candles, aggregates report data, captures screenshots, and generates the PDF on demand. It is not a cron stage and it is not part of `runPipeline()`.

Why this matters:

- it overstates the work done every 10 minutes
- it obscures the performance/cost boundary between autonomous analysis and user-triggered export
- it makes ownership less clear: scheduled backend pipeline vs interactive report composition

Code references:

- `src/hooks/useExportPdf.ts`
- `src/components/report/ReportDocument.tsx`

Recommendation:

- move report generation into a separate “On-Demand Export Flow” diagram family
- keep the scheduled pipeline diagram limited to cron-driven ingestion, analysis, and sim execution

### 2. The Globe event-ticker analysis path is underrepresented in the main system diagrams

Severity: High

The current diagrams mention Globe as a frontend surface, but they do not show the event-ticker analysis routes and state transitions that now make Globe materially different from simply “news on a map.”

The actual Globe page uses additional event-analysis workflows beyond standard `useNews()` and `useWhaleAlerts()`, including:

- cached event-ticker analysis fetches
- high-impact analysis backfill
- event-specific POST analysis generation

Why this matters:

- the Globe feature is no longer just a visualization layer
- it now has its own analysis lifecycle and caching behavior
- the current diagrams under-document one of the more differentiated parts of the product

Code references:

- `src/components/globe/GlobePage.tsx`
- `src/components/globe/EventTickerAnalysis.tsx`

Recommendation:

- add a Globe/Event-Ticker analysis sub-diagram showing:
  - news event selection
  - ticker extraction
  - event-ticker API calls
  - cached analysis reuse
  - deep-dive / trigger consumption in the panel

### 3. Layering is inconsistent: some flows go through API routes, others appear to bypass them

Severity: Medium

In the pipeline diagrams, most frontend consumers are shown as `DB -> API -> UI`, but trigger-related arrows also go directly from `ANALYSIS_TBL` to `GLOBE_PG` and `ANALYSIS_PG`. That is not the actual runtime path in the client.

The client consistently reads through hooks and fetch calls such as:

- `useAnalyses()`
- `useDeepDive()`
- `/api/analysis/event-tickers`

Why this matters:

- it muddies caching boundaries
- it makes the BFF layer look optional when it is central to the runtime model
- it makes the diagrams less trustworthy when tracing real data ownership

Code references:

- `src/hooks/useApiData.ts`
- `src/components/globe/GlobePage.tsx`

Recommendation:

- make all client-facing arrows pass through explicit API nodes
- reserve direct DB arrows for internal cron/service diagrams only

### 4. The surface map is stale relative to the product’s actual modes

Severity: Medium

The top-level “System Overview” still frames the app as four pages, while the product documentation now correctly describes a broader system:

- Dashboard
- Whale Alerts
- Globe / Macro Analyzer
- Analysis / Deep Dives
- Portfolio Simulation
- PDF export as a report mode

Why this matters:

- the diagram no longer matches the current product thesis
- Portfolio and report/export mode are treated as secondary even though they are now core workflows

Code/product references:

- `src/components/dashboard/DashboardHome.tsx`
- `src/components/globe/GlobePage.tsx`
- `src/components/report/ReportDocument.tsx`

Recommendation:

- replace the page-box overview with a “product modes and surfaces” diagram
- represent PDF export as a cross-cutting reporting mode, not just an implementation detail

### 5. Trigger and intraday structure are documented in multiple places with overlapping but slightly different abstractions

Severity: Medium

The current note set explains trigger flow and intraday session structure in several places:

- Architecture & Tech Stack
- Pipeline Architecture
- Trading Algorithm
- product overview

The duplication is useful for local context, but there is already mild drift in framing:

- one note treats intraday structure as a pipeline stage
- another treats it as reporting enrichment
- another treats it as a product capability

Why this matters:

- the same concept is being explained at different abstraction levels without a single canonical definition
- future updates are likely to drift again

Recommendation:

- define one canonical “shared analysis artifacts” section with:
  - `triggerReport`
  - intraday resistance/support structures
  - report enrichment data
- let other docs reference that instead of re-explaining the same layers in full

### 6. Duplicate top-level headings are repeated across core notes

Severity: Low

Several notes begin with duplicated `#` headings, for example:

- `# Architecture & Tech Stack` twice
- `# Pipeline Architecture — Full Reference` twice
- `# Trading Algorithm — Complete Documentation` twice
- `# Build Progress & Handoff Log` twice

Why this matters:

- it creates noisy outlines in Obsidian
- it weakens export readability and section navigation
- it signals low editorial hygiene even where the content is strong

Recommendation:

- remove duplicate H1s across the vault as a cleanup pass

---

## Optimization Opportunities

### 1. Split diagrams by responsibility, not by document convenience

Current diagrams mix:

- scheduled pipeline runtime
- interactive deep-dive UI flow
- on-demand PDF export flow

Recommended split:

1. Scheduled Analysis Pipeline
2. Interactive Deep-Dive / Globe Runtime
3. On-Demand PDF Export Flow
4. Shared Analysis Artifacts

This would reduce cognitive load and make each diagram accurate within one execution model.

### 2. Introduce a single canonical artifact model

A compact diagram centered on shared artifacts would help more than repeating subsystem diagrams.

Suggested artifact nodes:

- `CrossReferenceAnalysis`
- `TradeRecommendation`
- `DeepDiveAnalysis`
- `TriggerReport`
- `EnrichedMarketData`
- `IntradaySessionNarrative`

This would show what is deterministic, what is LLM-generated, and what is post-processed.

### 3. Add a legend for execution ownership

The docs would be clearer if every major diagram used a simple legend such as:

- scheduled / cron-driven
- user-triggered
- LLM-generated
- deterministic computed
- persisted to DB
- ephemeral / client-side only

This would immediately fix much of the current ambiguity.

### 4. Add one lifecycle diagram for Globe event analysis

The Globe flow is now important enough to justify its own lifecycle diagram. It should cover:

- event selection
- cached analyzed-event lookup
- high-impact pre-analysis backfill
- per-event ticker analysis
- event-ticker panel rendering

This would make the Globe system legible without bloating the general pipeline diagram.

---

## Recommended Next Edits

### Priority 1

- remove PDF export from the scheduled pipeline diagram and document it separately
- add a dedicated Globe event-ticker analysis diagram
- normalize all client-facing data flows to go through API routes

### Priority 2

- replace the top-level four-page overview with a current surface/mode map
- create one canonical “shared analysis artifacts” diagram

### Priority 3

- remove duplicate H1 headings
- reduce repeated trigger/intraday narrative text across notes by cross-linking instead of re-explaining

---

## Bottom Line

The documentation is directionally strong and much more current than it was before the recent updates, but the biggest remaining issue is **execution-model conflation**.

Right now the docs partially blur three distinct systems:

1. the scheduled analysis pipeline
2. the interactive deep-dive / Globe runtime
3. the on-demand PDF export path

Separating those cleanly would remove most of the remaining structural ambiguity and make the diagrams substantially easier to maintain.
