# Epic 33: Signal Lineage, Provenance, and Correlation Hardening

> **Status:** 📋 PLANNED  
> **Priority:** P1 — Important (reduce heuristic attribution and improve trust)  
> **Created:** 2026-04-02  
> **Depends on:** Epic 31 (Trade Execution Gap & Attribution Transparency), Epic 32 (Alert Diagnostics Console)

## Overview

The current correlation logic is materially better because recommendation analyses now persist whale IDs when available. The remaining gap is that lineage is still partially reconstructed from heuristics in older or incomplete records.

This epic finishes the job by making alert-to-analysis-to-evaluation-to-trade provenance explicit, queryable, and durable enough for both real-time debugging and historical replay.

---

## Story 33.1 — Define Canonical Source Reference Contract

### Goal

Standardize how source references are stored across analyses, evaluations, trades, and diagnostics records.

### Deliverables

- canonical `inputRefs` contract covering `sourceAlertIds`, `primaryWhaleId`, `whaleIds`, `sourceAnalysisId`, and lineage timestamps
- validation rules for required vs optional provenance fields
- migration note describing how new records should populate lineage data

### Acceptance Criteria

- [ ] One documented provenance contract exists for all downstream records
- [ ] New recommendation/evaluation/trade records can be joined without heuristic guessing when lineage data is present
- [ ] Validation catches malformed provenance payloads early

### Testing Plan

- [ ] Contract validation tests
- [ ] Serialization/deserialization tests

---

## Story 33.2 — Persist Explicit Lineage Through Trade Lifecycle

### Goal

Carry source IDs all the way from detected alert through opened trade and portfolio snapshots.

### Deliverables

- source references persisted on evaluation outputs and opened trade records
- portfolio-facing records include enough lineage to trace a position back to the originating alert set
- fallback annotations showing when lineage was inferred instead of explicit

### Acceptance Criteria

- [ ] Open trades can be traced back to source alerts without joining on ticker/time alone
- [ ] Diagnostics can distinguish explicit lineage from inferred lineage
- [ ] Historical snapshots preserve lineage context for later review

### Testing Plan

- [ ] End-to-end lineage persistence tests
- [ ] Snapshot lineage regression tests

---

## Story 33.3 — Backfill Historical Provenance Where Safe

### Goal

Improve historical diagnostics by backfilling lineage into existing records when confidence is high enough.

### Deliverables

- backfill script for legacy analyses/evaluations/trades
- confidence tiers for exact, strong, and weak matches
- safety rules preventing low-confidence backfills from polluting current diagnostics

### Acceptance Criteria

- [ ] Legacy records gain explicit lineage where confidence is high
- [ ] Low-confidence matches remain clearly marked as inferred
- [ ] Backfill is idempotent and safe to re-run

### Testing Plan

- [ ] Backfill fixture tests
- [ ] Idempotency tests
- [ ] Confidence-tier classification tests

---

## Story 33.4 — Tighten Correlation Engine Scoring

### Goal

Reduce false matches by ranking exact identifiers above all heuristic fallbacks and making the scoring transparent.

### Deliverables

- explicit correlation confidence scoring in diagnostics output
- ranked matching rules for exact ID, exact analysis, exact timestamp window, then heuristic fallback
- correlation reason strings that explain why a match was selected

### Acceptance Criteria

- [ ] Correlation output exposes confidence and match basis
- [ ] Exact-ID matches always outrank heuristic matches
- [ ] Users can see why a given alert was linked to a trade or evaluation

### Testing Plan

- [ ] Match-ranking unit tests
- [ ] False-positive regression tests

---

## Story 33.5 — Surface Lineage Quality in UI and API

### Goal

Make provenance quality visible so users know when to trust a correlation and when they are looking at a best-effort reconstruction.

### Deliverables

- lineage quality badge (`explicit`, `backfilled`, `inferred`)
- API fields exposing provenance quality and match confidence
- UI affordances that explain degraded certainty on older data

### Acceptance Criteria

- [ ] Correlation and diagnostics views expose lineage quality
- [ ] Users can filter for explicit-only vs inferred records
- [ ] Older heuristic records no longer look identical to exact matches

### Testing Plan

- [ ] API response tests for lineage quality fields
- [ ] UI badge/filter tests

---

## Suggested Execution Order

1. Story 33.1 — Define canonical source reference contract
2. Story 33.2 — Persist explicit lineage through trade lifecycle
3. Story 33.4 — Tighten correlation engine scoring
4. Story 33.5 — Surface lineage quality in UI/API
5. Story 33.3 — Backfill historical provenance
