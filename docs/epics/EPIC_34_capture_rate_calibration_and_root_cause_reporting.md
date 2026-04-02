# Epic 34: Capture Rate Calibration & Root Cause Reporting

> **Status:** 📋 PLANNED  
> **Priority:** P1 — Important (turn diagnostics into algorithm improvements)  
> **Created:** 2026-04-02  
> **Depends on:** Epic 30 (Benchmarking & Missed Opportunity Exploration), Epic 31 (Trade Execution Gap & Attribution Transparency), Epic 32 (Alert Diagnostics Console), Epic 33 (Signal Lineage & Correlation Hardening)

## Overview

After diagnostics and lineage are strong enough to trust, the next step is to use them to improve strategy behavior. This epic turns the new observability into a disciplined calibration loop:

- quantify which gates block the most high-quality opportunities
- separate healthy risk control from overly conservative filtering
- generate actionable reports and tuning recommendations backed by trace data

This is the bridge between investigation and measurable strategy improvement.

---

## Story 34.1 — Build Root Cause Reporting Pipeline

### Goal

Generate periodic summaries showing where opportunities are being lost and which failure clusters are growing.

### Deliverables

- report generator for top miss reasons, drop stages, and stale-pipeline windows
- configurable report windows (daily, weekly, sprint)
- markdown-ready summary output for docs and sprint planning

### Acceptance Criteria

- [ ] Reports quantify drop reasons and stage frequencies
- [ ] Reports can be generated for a chosen historical window
- [ ] Output is easy to paste into docs or issue tracking

### Testing Plan

- [ ] Report aggregation tests
- [ ] Time-window filtering tests

---

## Story 34.2 — Identify High-Impact Over-Filtering Rules

### Goal

Use diagnostics data to isolate the gates that most often reject otherwise attractive opportunities.

### Deliverables

- ranked list of high-impact rejection rules
- separation of intentional risk controls vs likely over-filtering
- confidence notes for each recommendation based on sample size and lineage quality

### Acceptance Criteria

- [ ] Top rejection gates are ranked by missed-opportunity impact
- [ ] Recommendations distinguish protective filters from likely tuning opportunities
- [ ] Findings account for confidence and sample size

### Testing Plan

- [ ] Ranking logic tests
- [ ] Small-sample guard tests

---

## Story 34.3 — Add Threshold Sensitivity Replay

### Goal

Replay recent opportunities under alternative thresholds to estimate what would have changed.

### Deliverables

- sensitivity analysis for confidence, quality, time cutoff, and concentration thresholds
- before/after capture-rate comparison outputs
- guardrails preventing unrealistic optimistic replays

### Acceptance Criteria

- [ ] Can compare current thresholds against candidate threshold sets
- [ ] Replay output estimates capture-rate change and risk trade-offs
- [ ] Sensitivity runs clearly label assumptions and limitations

### Testing Plan

- [ ] Replay scenario tests
- [ ] Guardrail validation tests

---

## Story 34.4 — Formalize Tuning Recommendation Workflow

### Goal

Create a repeatable process for turning root cause findings into safe threshold or policy changes.

### Deliverables

- recommendation template linking evidence, proposed change, expected upside, and rollback trigger
- checklist for shipping threshold changes safely
- requirement that tuning proposals reference diagnostics evidence, not intuition alone

### Acceptance Criteria

- [ ] Tuning proposals follow one repeatable template
- [ ] Every proposal includes evidence, risk, and rollback conditions
- [ ] Strategy changes can be audited back to the report that justified them

### Testing Plan

- [ ] Template/schema validation tests
- [ ] Recommendation generation tests

---

## Story 34.5 — Publish Sprint-Facing Strategy Health Dashboard

### Goal

Summarize the most important operational and strategy-quality signals in one view for sprint review.

### Deliverables

- dashboard summary of capture rate, miss reasons, stale runs, and trend changes
- comparison against previous sprint window
- links into diagnostics traces behind each major trend

### Acceptance Criteria

- [ ] One sprint-facing summary captures both operational and strategy-quality drift
- [ ] Trend changes link back to supporting diagnostics
- [ ] Dashboard helps decide whether to tune rules, improve data, or fix pipeline reliability

### Testing Plan

- [ ] Summary metric tests
- [ ] Trend comparison tests

---

## Suggested Execution Order

1. Story 34.1 — Build root cause reporting pipeline
2. Story 34.2 — Identify high-impact over-filtering rules
3. Story 34.3 — Add threshold sensitivity replay
4. Story 34.4 — Formalize tuning recommendation workflow
5. Story 34.5 — Publish sprint-facing strategy health dashboard
