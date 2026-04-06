# Epic 36: Offline Policy Learning & Shadow Evaluation

> **Status:** 🚧 IN PROGRESS  
> **Priority:** P2 — Important (improve decision quality without live policy risk)  
> **Created:** 2026-04-02  
> **Depends on:** Epic 35 (Learning Readiness & Training Data Foundation)

## Overview

This epic is the sensible next step after data readiness, not before it. The goal is not to jump into full reinforcement learning. The goal is to use the new offline corpus to learn better decision support in a controlled sequence:

- start with supervised ranking and acceptance calibration
- compare learned policies against the current rule/LLM stack offline
- run the learned policy in shadow mode before it can influence live simulated execution

This epic treats learning as an assistive layer first, and only later as a candidate decision-maker.

## Progress Update (2026-04-03)

- ✅ Story 36.1 started: the portfolio API now compares the current enter-policy against deterministic offline baseline selectors on the materialized learning corpus
- ✅ Story 36.1 inspected: the portfolio learning tab now shows baseline-level acceptance rate, reward, and win-rate comparisons for quick operator review
- ⏳ Story 36.1 remains partial: these are interpretable heuristic baselines, not yet trained classifier or ranking models
- ✅ Story 36.2 started: a counterfactual replay harness now evaluates policy comparisons across recent and full-corpus windows with explicit support thresholds and caveats
- ✅ Story 36.2 inspected: unsupported replay windows remain visible in the UI, but are clearly marked so small-sample comparisons are not overstated
- ✅ Story 36.3 started: the simulation pipeline now logs empirical shadow-policy recommendations alongside current decisions without affecting execution
- ✅ Story 36.4 started: the portfolio learning tab now shows recent shadow decisions, disagreement review, and operator feedback capture
- ✅ Story 36.5 started: promotion gates now summarize readiness, replay support, shadow evidence, rollback triggers, and deployment modes
- ✅ Validation updated: focused Epic 35/36 analytics and portfolio API tests are green after tightening shadow-policy guardrails and promotion gating behavior

---

## Story 36.1 — Build Baseline Offline Decision Models

### Goal

Train simple, interpretable baselines before exploring more complex policy learners.

### Deliverables

- acceptance/rejection classifier baseline
- trade-priority ranking model for candidate alerts
- calibration metrics for confidence and expected value quality

### Acceptance Criteria

- [ ] Baselines outperform naive threshold-only heuristics on held-out data
- [ ] Model outputs are inspectable enough to debug bad recommendations
- [ ] Confidence calibration is measured, not assumed

### Testing Plan

- [ ] Offline evaluation tests on fixed fixtures
- [ ] Calibration metric tests

---

## Story 36.2 — Add Counterfactual Policy Evaluation Harness

### Goal

Evaluate candidate decision policies offline against the logged corpus before any live use.

### Deliverables

- policy evaluation harness comparing current policy vs learned alternatives
- support for replay windows and conservative counterfactual assumptions
- explicit caveats around unsupported counterfactual conclusions

### Acceptance Criteria

- [x] Candidate policies can be compared on the same historical window
- [x] Evaluation results clearly label assumptions and blind spots
- [x] Unsupported conclusions are rejected instead of overstated

### Testing Plan

- [x] Replay comparison tests
- [x] Guardrail tests for unsupported counterfactuals

---

## Story 36.3 — Run Learned Policy in Shadow Mode

### Goal

Generate policy recommendations in parallel with the current system without affecting execution.

### Deliverables

- shadow inference path that scores recent alerts alongside the current LLM/rule decisions
- diagnostics view showing agreement, disagreement, and estimated upside/downside
- logging of shadow recommendations for later review

### Acceptance Criteria

- [x] Shadow policy never changes live simulated execution
- [x] Disagreements are visible and attributable in diagnostics
- [x] Shadow output is persisted for audit and review

### Testing Plan

- [ ] Shadow logging tests
- [x] Non-interference tests
- [ ] UI/API comparison tests

---

## Story 36.4 — Add Learning-Guided Recommendation Review

### Goal

Expose the learned policy as a decision-support signal for sprint review and tuning, not as an opaque replacement.

### Deliverables

- review panel for `current policy`, `learned policy`, and `actual outcome`
- reason summaries explaining feature importance or score drivers where feasible
- feedback workflow for marking useful vs misleading learned suggestions

### Acceptance Criteria

- [x] Operators can compare policy disagreement without reading raw training outputs
- [x] Learned recommendations are reviewable enough to support trust decisions
- [x] Feedback can be captured for future model evaluation

### Testing Plan

- [ ] Comparison-view tests
- [x] Feedback-capture tests

---

## Story 36.5 — Define Promotion Gates for Live Use

### Goal

Set strict criteria for when a learned policy may influence simulated execution.

### Deliverables

- promotion checklist covering offline performance, calibration, shadow stability, and rollback conditions
- explicit ban on live promotion without minimum sample and stability thresholds
- deployment mode definitions for `analysis only`, `shadow`, `advisory`, and `execution eligible`

### Acceptance Criteria

- [x] Promotion requires evidence across multiple evaluation windows
- [x] Rollback triggers are defined before any advisory or live use
- [x] Deployment modes are explicit and auditable

### Testing Plan

- [ ] Checklist/schema validation tests
- [x] Mode-gating tests

---

## Suggested Execution Order

1. Story 36.1 — Build baseline offline decision models
2. Story 36.2 — Add counterfactual policy evaluation harness
3. Story 36.3 — Run learned policy in shadow mode
4. Story 36.4 — Add learning-guided recommendation review
5. Story 36.5 — Define promotion gates for live use
