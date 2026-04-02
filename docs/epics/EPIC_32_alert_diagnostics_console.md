# Epic 32: Alert Diagnostics Console & Decision Trace Explorer

> **Status:** 🔧 IN PROGRESS  
> **Priority:** P1 — Important (make Epic 31 diagnostics operationally usable)  
> **Created:** 2026-04-02  
> **Depends on:** Epic 31 (Trade Execution Gap & Attribution Transparency), Epic 29 (Trade Capture & Benchmarking), Epic 30 (Benchmarking & Missed Opportunity Exploration)

## Overview

Epic 31 added the core building blocks for attribution, funnel diagnostics, correlation, and pipeline health. The next natural step is to turn those raw diagnostics into a dedicated operator workflow that answers a practical question quickly:

**For the last N whale alerts, exactly what happened, where did each alert drop, and what should we investigate first?**

This epic focuses on giving the portfolio and operations views a purpose-built diagnostics surface instead of requiring users to infer the answer from attribution summaries.

## Progress Update (2026-04-02)

- ✅ Story 32.1 started: canonical per-alert decision trace model defined in analytics layer
- ✅ Story 32.2 started: dedicated diagnostics API response added for recent alert traces with filters and cursor-style paging
- ✅ Story 32.3 started: portfolio page now includes a diagnostics tab with filters, summary cards, paged recent-alert traces, and expandable per-stage timelines
- ✅ Diagnostics quick filters expanded: same-day blocked and missing-market-data clusters now have dedicated filters backed by the diagnostics API
- ✅ Story 32.4 started: diagnostics console now exports the current filtered window as JSON/markdown, supports pinned 2-3 alert comparisons, and surfaces failure-cluster summary cards for sprint review
- ✅ Story 32.4 tested: lightweight jsdom component tests now cover pinned compare interactions plus empty and stale-state CTAs
- ✅ Story 32.5 started: navbar pipeline health badge now deep-links into the diagnostics tab, using pipeline-gap filters when health is stale or never-run
- ✅ Story 32.5 polished: diagnostics tab now distinguishes fetch failure, never-run, stale pipeline, and filter-empty states with direct recovery CTAs
- ✅ Story 32.5 expanded: dashboard home now includes direct diagnostics entry points from the operations card plus whale/analysis sections
- ✅ Story 32.5 tested: dashboard diagnostics entry points now have jsdom navigation coverage for healthy and stale pipeline states
- ✅ Diagnostics trace-list layout fixed: expanded bottom-row accordions no longer collide with the paginator, and the load-more control now lives inside the same scroll flow
- ✅ Attribution-driven entry points added: Epic 31 panels can now open diagnostics with contextual filters instead of stopping at summary cards
- ✅ Diagnostics filter UX improved: active filters now surface in a dedicated summary strip with one-click removal and reset
- ✅ Diagnostics side-rail summaries now apply filters directly from failure-cluster and top-reason cards
- ✅ Pinned trace comparison now supports a compact mode for tighter layouts
- ⏳ Next: consider any further responsive polish for dense compare states

---

## Story 32.1 — Normalize Per-Alert Decision Trace Model

### Goal

Define a stable, reusable trace shape for alert lifecycle diagnostics so every API and UI surface can consume the same per-alert decision record.

### Deliverables

- shared trace schema for `{ alertId, ticker, detectedAt, stageEvents, finalOutcome, primaryReason, sourceRefs }`
- normalized stage vocabulary across detection, analysis, evaluation, validation, entry, and trade execution
- deterministic final-outcome derivation rules

### Acceptance Criteria

- [ ] One shared trace model is used across diagnostics endpoints
- [ ] Stage names are consistent across pipeline logging, attribution, and UI
- [ ] Final outcome is deterministic even when some intermediate records are missing

### Testing Plan

- [ ] Unit tests for trace normalization
- [ ] Fixture coverage for partial/missing lifecycle records

---

## Story 32.2 — Add Last-N Alert Diagnostics API

### Goal

Expose a dedicated diagnostics endpoint returning the most recent alert traces with filtering and summary metadata.

### Deliverables

- API endpoint for last-N alerts with filter support for ticker, quality band, outcome, and date range
- response metadata summarizing drop-off counts, common reasons, and stale-pipeline context
- pagination or cursor support so the endpoint scales beyond a single debugging session

### Acceptance Criteria

- [ ] Can request the last N alerts without loading the entire portfolio dataset
- [ ] API returns both per-alert traces and aggregate summaries
- [ ] Filters support fast triage of high-quality missed alerts

### Testing Plan

- [ ] API contract tests
- [ ] Filter behavior tests
- [ ] Pagination tests

---

## Story 32.3 — Build Diagnostics Console UI

### Goal

Create a dedicated UI for recent alerts that makes stage-by-stage failures obvious without reading raw JSON.

### Deliverables

- diagnostics table for recent alerts with outcome badges and primary miss reasons
- expandable timeline/trace view per alert
- quick filters for `high quality missed`, `pipeline not run`, `missing market data`, and `same-day blocked`

### Acceptance Criteria

- [ ] A user can inspect any recent alert in 1-2 clicks
- [ ] Timeline makes the drop stage visually obvious
- [ ] UI works on desktop and mobile without collapsing into unreadable traces

### Testing Plan

- [ ] Component rendering tests
- [ ] Interaction tests for expand/filter flows
- [ ] Visual regression coverage for key states

---

## Story 32.4 — Add Session-Level Sprint Debugging Tools

### Goal

Make the diagnostics console useful during sprint reviews and live debugging sessions.

### Deliverables

- exportable JSON/markdown summary for the currently filtered alert set
- pinned trace comparisons for 2-3 alerts side by side
- summary cards for top failure clusters in the selected window

### Acceptance Criteria

- [ ] A sprint review can be run from the diagnostics console without ad hoc database queries
- [ ] Users can compare a captured alert against a missed alert side by side
- [ ] Export contains enough detail to attach to docs or issue reports

### Testing Plan

- [x] Export shape tests
- [x] Comparison-state UI tests

---

## Story 32.5 — Integrate Diagnostics with Global Navigation

### Goal

Connect pipeline health and diagnostics so the app shell can lead users straight to the right investigation view.

### Deliverables

- navbar/global-status links into diagnostics console
- contextual CTA when pipeline health is stale or never-run
- clear empty/error states when diagnostics data is unavailable

### Acceptance Criteria

- [x] Pipeline health badge can deep-link to relevant diagnostics
- [x] Stale health state leads to operational investigation, not a dead end
- [x] Empty states explain whether the issue is no alerts, no pipeline runs, or missing data

### Testing Plan

- [x] Navigation tests
- [ ] Empty/error state tests

---

## Suggested Execution Order

1. Story 32.1 — Normalize trace model
2. Story 32.2 — Build last-N diagnostics API
3. Story 32.3 — Build diagnostics console UI
4. Story 32.5 — Wire diagnostics into global navigation
5. Story 32.4 — Add sprint debugging/export tools
