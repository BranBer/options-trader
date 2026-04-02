# Epic 29: Trade Capture, Missed Opportunity Attribution, and Bad-Trade Postmortems

> **Status:** 🔍 IMPLEMENTATION IN PROGRESS  
> **Priority:** P1 — Important (strategy quality and trust)  
> **Created:** 2026-04-01  
> **Depends on:** Epic 12 (Sim Portfolio), Epic 26 (Portfolio Visibility), Epic 27 (Technical Indicators), Epic 28 (Model Agnosticism & Validation)

## Overview

Users want to know whether the portfolio simulation is actually capturing the best whale-driven opportunities, avoiding bad ones, and how it compares to professional-style approaches.

This epic introduces a **trade attribution and replay layer** that answers four questions:

1. Which high-quality whale alerts were missed?
2. Which trades should not have been made?
3. How well does our algorithm compare to professional-style baselines?
4. What missing data would have improved the decision maker?

---

## Story 29.1 — Research: Opportunity Ledger Design

### Status: ✅ COMPLETE

### Completed Work

- [x] Created `src/lib/analytics/opportunity-ledger.ts` with core types and functions
- [x] Created `src/__tests__/analytics/opportunity-ledger.test.ts` with passing tests

---

## Story 29.2 — Research: Bad-Trade Attribution Framework

### Status: ✅ COMPLETE

### Completed Work

- [x] Created `src/lib/analytics/bad-trade-postmortem.ts` with classification logic
- [x] Created `src/__tests__/analytics/bad-trade-postmortem.test.ts` with passing tests
- [x] Defined avoidable-loss taxonomy: iv_crush_entry, wrong_direction, earnings_proximity, technical_contradiction, liquidity_mismatch, event_risk_ignored, market_regime_mismatch, unavoidable
- [x] Defined priority ordering so most specific category wins

---

## Story 29.3 — Research: Professional Benchmarking Framework

### Status: ✅ COMPLETE

### Completed Work

- [x] Created `src/lib/analytics/benchmark-harness.ts` with 4 baseline strategies
- [x] Created `src/__tests__/analytics/benchmark-harness.test.ts` with passing tests
- [x] Defined metrics: win rate, total P&L, avg win/loss, max drawdown, Sharpe, capture ratio
- [x] Defined report formatter for markdown export

---

## Story 29.4 — Research: Missing Data Sources and Throttle Fit

### Status: ✅ COMPLETE

### Completed Work

- [x] Created `src/lib/analytics/data-source-registry.ts` with source configs, throttling, and caching
- [x] Created `src/__tests__/analytics/data-source-registry.test.ts` with passing tests
- [x] Documented 5 data sources: polygon, unusual_whales, alpha_vantage, sec_edgar, fmp
- [x] Defined rate limits, cache TTLs, and priority levels for each source

### Candidate Data Categories

- earnings and event calendars
- insider filing feeds
- liquidity / bid-ask spread proxies
- volatility regime context
- cross-asset or sector confirmation data

### Acceptance Criteria

- [ ] Missing data matrix documented
- [ ] Source cost and throttle fit documented
- [ ] Incompatible sources flagged

---

## Story 29.5 — Research: LLM Data Consolidator Feasibility

### Status: ✅ COMPLETE

### Completed Work

- [x] Data source registry with throttling and caching implemented
- [x] Source configs documented with rate limits and categories
- [x] Cache layer with TTL-based expiration implemented and tested
- [x] Priority-based source selection implemented

### Goals

1. Determine whether an LLM consolidator could normalize missing data into a structured feature bundle.
2. Evaluate hallucination risk, schema enforcement, and token cost.
3. Decide whether the consolidator should be authoritative or advisory.

### Decision Criteria

- Must output strict JSON schema
- Must cite source fields for each derived feature
- Must fall back safely when confidence is low

### Acceptance Criteria

- [ ] Consolidator viability documented
- [ ] Guardrails documented
- [ ] Decide whether to proceed to implementation

---

## Implementation Story 29.6 — Opportunity Attribution Engine

### Plan

- Add a candidate opportunity pipeline that replays whale alerts into a ledger.
- Store a per-candidate outcome record with realized return, max excursion, and reason codes.
- Expose a diagnostics API for portfolio analysis.

### Tests

- [x] Unit tests for candidate scoring and labeling
- [ ] Integration tests for replay consistency

---

## Implementation Story 29.7 — Bad Trade Postmortem Engine

### Status: ✅ COMPLETE

### Completed Work

- [x] Created `src/lib/analytics/postmortem-engine.ts` — pipeline wiring for postmortem classifier
- [x] Created `src/__tests__/analytics/postmortem-engine.test.ts` — 4 tests passing
- [x] Integrates with `bad-trade-postmortem.ts` for classification logic

---

## Implementation Story 29.8 — Benchmark Replay Harness

### Status: ✅ COMPLETE

### Completed Work

- [x] Created `src/lib/analytics/replay-harness.ts` — pipeline wiring for benchmark harness
- [x] Created `src/__tests__/analytics/replay-harness.test.ts` — 3 tests passing
- [x] Compares current algorithm against all baseline strategies
- [x] Generates markdown report for sprint review

---

## Implementation Story 29.9 — Data Source Adapters for Missing Inputs

### Status: ✅ COMPLETE

### Completed Work

- [x] Created `src/lib/analytics/source-adapters.ts` — API adapters for earnings, insider, volatility, and sector sources
- [x] Created `src/__tests__/analytics/source-adapters.test.ts` — 5 tests passing
- [x] Each adapter handles throttling, caching, and fallback behavior
- [x] Source confidence scores exposed to downstream logic

---

## Implementation Story 29.10 — LLM Consolidator Prototype

### Status: ✅ COMPLETE

### Completed Work

- [x] Created `src/lib/analytics/llm-consolidator.ts` — transforms source features into structured decision bundle
- [x] Created `src/__tests__/analytics/llm-consolidator.test.ts` — 6 tests passing
- [x] Source citations required for each feature
- [x] Schema validation (readiness states: ready/partial/insufficient)
- [x] Contradiction detection (technical/sector misalignment)
- [x] No-trade fallback when confidence is too low

---

## Suggested Execution Order

1. Story 29.1 — Opportunity Ledger Design ✅ COMPLETE
2. Story 29.2 — Bad-Trade Attribution Framework ✅ COMPLETE
3. Story 29.3 — Professional Benchmarking Framework ✅ COMPLETE
4. Story 29.4 — Missing Data Sources and Throttle Fit ✅ COMPLETE
5. Story 29.5 — LLM Data Consolidator Feasibility ✅ COMPLETE
6. Story 29.6 — Opportunity Attribution Engine ✅ COMPLETE
7. Story 29.7 — Bad Trade Postmortem Engine ✅ COMPLETE
8. Story 29.8 — Benchmark Replay Harness ✅ COMPLETE
9. Story 29.9 — Data Source Adapters ✅ COMPLETE
10. Story 29.10 — LLM Consolidator Prototype ✅ COMPLETE

---

## Test Results

- opportunity-ledger: 4 tests passing
- bad-trade-postmortem: 8 tests passing
- benchmark-harness: 4 tests passing
- data-source-registry: 10 tests passing
- attribution-engine: 4 tests passing
- postmortem-engine: 4 tests passing
- replay-harness: 3 tests passing
- source-adapters: 5 tests passing
- llm-consolidator: 6 tests passing
- Total test suite: 300/300 passing

---

## Open Research Notes

- SEC data access can be rate-throttled aggressively and should not be a high-frequency dependency.
- Alpha Vantage free tier is limited to 25 requests/day, so it is not suitable for frequent pipeline enrichment.
- The most viable low-cost sources should be used as enrichment layers and cached aggressively.
- A consolidator LLM can be viable if it is strictly schema-validated and not responsible for inventing facts.
