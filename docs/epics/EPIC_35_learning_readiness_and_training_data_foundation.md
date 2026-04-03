# Epic 35: Learning Readiness & Training Data Foundation

> **Status:** 🚧 IN PROGRESS  
> **Priority:** P1 — Important (create trustworthy training data before any policy learning)  
> **Created:** 2026-04-02  
> **Depends on:** Epic 33 (Signal Lineage, Provenance, and Correlation Hardening), Epic 34 (Capture Rate Calibration & Root Cause Reporting)

## Overview

The system now has enough observability to support learning-oriented infrastructure, but not enough stable, high-quality experience data to justify reinforcement learning.

This epic focuses on the prerequisite work:

- define the canonical learning record for each alert decision
- persist enough state, action, and outcome context for offline analysis
- build reward labels that reflect strategy quality instead of raw P&L alone
- measure whether the accumulated dataset is actually safe to train on

The output of this epic should be a trustworthy offline training corpus and a clear answer to: **do we have enough usable decision data to learn from yet?**

## Progress Update (2026-04-02)

- ✅ Story 35.1 started: canonical learning-record contract now exists in code with a versioned schema for `state`, `action`, `outcome`, `reward`, and `metadata`
- ✅ Story 35.1 tested: schema validation and JSON round-trip coverage added for complete and incomplete learning records
- ✅ Story 35.2 started: alerts, evaluations, analyses, and trades can now be materialized into joined learning records via a dedicated analytics builder
- ✅ Story 35.2 inspected: lightweight `view=learning` API added on the portfolio route so the first generated rows can be reviewed before adding a dedicated table
- ✅ Story 35.3 started: materialized records now compute reproducible reward labels for terminal trades, pending open positions, and missed-opportunity proxies
- ✅ Story 35.4 started: a learning readiness scorecard now measures sample count, decision balance, reward coverage, lineage quality, and terminal-outcome depth
- ✅ Story 35.4 inspected: the portfolio API and UI now expose readiness status, blockers, thresholds, and corpus summary without manual SQL inspection
- ✅ Story 35.5 started: the learning inspection API can now export reproducible JSONL and CSV snapshots with manifest metadata

---

## Story 35.1 — Define Canonical Learning Record Contract

### Goal

Create one training-oriented schema that joins alert state, analysis context, evaluation decision, trade action, and realized outcome.

### Deliverables

- canonical learning record shape for `state`, `action`, `outcome`, `reward`, and `metadata`
- field-level definitions for mandatory vs optional learning inputs
- versioned schema note so future feature changes remain traceable

### Acceptance Criteria

- [ ] One documented learning record exists for every decisionable alert
- [ ] State, action, and outcome fields are separable without ad hoc parsing
- [ ] Schema changes can be versioned without invalidating older records silently

### Testing Plan

- [ ] Schema validation tests
- [ ] Serialization/deserialization tests

---

## Story 35.2 — Persist and Backfill Joined Training Rows

### Goal

Materialize the learning record into a durable dataset instead of reconstructing it on demand from multiple tables.

### Deliverables

- table or export pipeline for joined learning rows
- backfill job for historical alerts/evaluations/trades where lineage is explicit enough
- provenance flags showing `explicit`, `backfilled`, or `incomplete`

### Acceptance Criteria

- [ ] Learning rows can be generated without re-implementing attribution logic in every consumer
- [ ] Historical rows are backfilled when confidence is high enough
- [ ] Incomplete rows remain visible instead of being dropped silently

### Testing Plan

- [ ] Backfill fixture tests
- [ ] Row completeness tests
- [ ] Provenance classification tests

---

## Story 35.3 — Define Reward Labels and Evaluation Targets

### Goal

Create reward signals suitable for offline learning and policy evaluation.

### Deliverables

- primary reward definitions for realized P&L, risk-adjusted return, drawdown penalty, and opportunity-cost proxies
- delayed-outcome handling for open positions and unevaluated alerts
- documented distinction between operator metrics, strategy metrics, and training rewards

### Acceptance Criteria

- [ ] Reward definitions are explicit and reproducible from stored data
- [ ] Open and partial outcomes are labeled consistently
- [ ] Reward signals discourage pathological overtrading and capital misuse

### Testing Plan

- [ ] Reward computation tests
- [ ] Open-position label tests
- [ ] Opportunity-cost approximation tests

---

## Story 35.4 — Build Learning Readiness Scorecard

### Goal

Quantify whether the available dataset is large, diverse, and trustworthy enough for offline learning.

### Deliverables

- readiness scorecard for sample count, class balance, lineage quality, reward completeness, and action diversity
- thresholds for `not ready`, `limited offline tuning`, and `ready for shadow learning`
- sprint-facing summary that highlights the current blockers

### Acceptance Criteria

- [x] Dataset quality can be assessed without manual SQL inspection
- [x] The scorecard highlights the exact bottlenecks blocking learning
- [x] The system can distinguish sparse data from structurally bad data

### Testing Plan

- [x] Scorecard metric tests
- [x] Threshold classification tests

---

## Story 35.5 — Export Offline Training Snapshots

### Goal

Make the learning corpus usable by external notebooks, trainers, or evaluation jobs without touching production tables directly.

### Deliverables

- versioned JSON/CSV export for learning records
- reproducible export filters by date window and provenance quality
- metadata manifest describing schema version, row counts, and label coverage

### Acceptance Criteria

- [ ] Training data can be exported reproducibly for a chosen window
- [ ] Exports include enough metadata to reproduce later experiments
- [ ] Consumers do not need direct DB access to start analysis

### Testing Plan

- [ ] Export shape tests
- [ ] Manifest completeness tests

---

## Suggested Execution Order

1. Story 35.1 — Define canonical learning record contract
2. Story 35.2 — Persist and backfill joined training rows
3. Story 35.3 — Define reward labels and evaluation targets
4. Story 35.4 — Build learning readiness scorecard
5. Story 35.5 — Export offline training snapshots
