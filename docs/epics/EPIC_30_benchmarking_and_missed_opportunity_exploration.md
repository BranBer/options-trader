# Epic 30: Benchmarking, Missed Opportunity Exploration, and Bad-Trade Root Cause Analysis

> **Status:** 🔍 RESEARCH REQUIRED  
> **Priority:** P1 — Important (strategy quality and trust)  
> **Created:** 2026-04-01  
> **Depends on:** Epic 12 (Sim Portfolio), Epic 26 (Portfolio Visibility), Epic 27 (Technical Indicators), Epic 28 (Model Agnosticism & Validation), Epic 29 (Trade Capture & Postmortems)

## Overview

This epic turns the questions raised by users into measurable analyses:

- Were there high-quality whale alerts the portfolio should have traded but missed?
- Which trades were profitable and were we simply under-informed?
- Which trades should never have been made?
- How does the current algorithm compare to professional-style baselines?
- What missing data would improve decisions the most?
- Can an LLM consolidator safely synthesize this data into a cleaner decision bundle?

This is a research and measurement epic that should feed future implementation epics rather than attempting to solve everything at once.

---

## Story 30.1 — Build the Opportunity Ledger

### Goal

Create a replayable ledger of candidate whale opportunities so we can measure missed captures, false negatives, and capture rate.

### Research Questions

- What constitutes a candidate opportunity in hindsight?
- What horizon should be used to judge success?
- Should the ledger include the market regime and event context at signal time?

### Deliverables

- candidate opportunity schema
- outcome labeling rules
- missed-opportunity reason taxonomy

### Acceptance Criteria

- [ ] Candidate ledger model documented
- [ ] Outcome label methodology documented
- [ ] Miss reason taxonomy documented

### Testing Plan

- [ ] Unit tests for outcome calculations
- [ ] Replay tests on a small historical fixture set

---

## Story 30.2 — Build Bad-Trade Postmortem Rules

### Goal

Classify losing trades into avoidable and unavoidable categories.

### Research Questions

- Were losing trades entered against technical or volatility context?
- Were any losses caused by missing event-risk information?
- Which errors are decision errors versus market-noise errors?

### Deliverables

- avoidable-loss taxonomy
- postmortem scoring rubric
- output shape for diagnostics API

### Acceptance Criteria

- [ ] Avoidable-loss categories documented
- [ ] Scoring rubric documented
- [ ] Trade diagnostics output shape documented

### Testing Plan

- [ ] Unit tests for avoid-rule classification
- [ ] Regression tests for known losing-trade scenarios

---

## Story 30.3 — Establish Professional-Style Benchmarks

### Goal

Compare the current trading algorithm against baseline approaches that resemble professional workflows.

### Benchmark Candidates

- Whale-quality threshold baseline
- IV-aware spread baseline
- Technical confirmation baseline
- Risk-parity / exposure-capped baseline

### Deliverables

- benchmark definitions
- replay metric list
- comparison report format

### Acceptance Criteria

- [ ] Benchmark set documented
- [ ] Replay metrics documented
- [ ] Comparison dimensions documented

### Testing Plan

- [ ] Metric unit tests
- [ ] Snapshot tests for benchmark report output

---

## Story 30.4 — Research Missing Data Sources

### Goal

Identify low-cost or free data sources that fill the biggest decision gaps and determine whether they are compatible with the pipeline frequency.

### High-Priority Data Gaps

- earnings and catalyst calendars
- insider filings
- liquidity proxies / bid-ask spread signals
- volatility regime and term structure
- cross-asset / sector confirmation

### Deliverables

- source viability matrix
- throttle and caching recommendations
- source-to-gap mapping

### Acceptance Criteria

- [ ] Missing data matrix documented
- [ ] Free/low-cost sources identified
- [ ] Throttle compatibility assessed

### Testing Plan

- [ ] Adapter contract tests planned
- [ ] Throttle/fallback tests planned

### Research Notes

- **Alpha Vantage**: free tier is limited to 25 requests/day, so it is generally too constrained for the main pipeline but may work for lightweight enrichment or research.
- **SEC EDGAR**: free and valuable for insider/event context, but it is aggressively rate-throttled and should be cached and used asynchronously, not as a high-frequency dependency.
- **Financial Modeling Prep**: can be a cost-effective source for calendars/fundamentals, but should be vetted for endpoint-specific limits and freshness before becoming part of the pipeline.
- **Free EOD sources**: useful for regime and confirmation overlays, but not ideal for intraday decisioning.
- Any source that cannot tolerate the pipeline cadence should be treated as an enrichment-only dependency with fallback behavior.

---

## Story 30.5 — Evaluate LLM Consolidator Viability

### Goal

Determine whether a dedicated LLM consolidation step should summarize disparate source data into an optimized feature bundle for the trading algorithm.

### Decision Criteria

- strict JSON schema output
- source citations for each derived feature
- deterministic validation layer
- safe fallback when uncertain

### Deliverables

- viability assessment
- guardrail requirements
- A/B evaluation plan

### Acceptance Criteria

- [ ] Consolidator viability documented
- [ ] Guardrails documented
- [ ] A/B plan documented

### Testing Plan

- [ ] Schema validation tests planned
- [ ] Hallucination guard tests planned
- [ ] No-trade fallback tests planned

---

## Implementation Story 30.6 — Opportunity Diagnostics API

### Status: ✅ COMPLETE

### Completed Work

- [x] Added `view=attribution` to portfolio API route
- [x] Returns capture rate, missed opportunities, and attribution summary
- [x] Wired `runAttribution` engine to API endpoint
- [x] Maps whale alerts and trades to engine input format

---

## Implementation Story 30.7 — Trade Postmortem API

### Status: ✅ COMPLETE

### Completed Work

- [x] Added `view=postmortem` to portfolio API route
- [x] Returns avoidable/unavoidable counts and per-trade classifications
- [x] Wired `runPostmortemEngine` to API endpoint
- [x] Includes pre-trade warnings and explanations

---

## Implementation Story 30.8 — Benchmark Replay Harness

### Status: ✅ COMPLETE

### Completed Work

- [x] Added `view=benchmark` to portfolio API route
- [x] Returns current algorithm metrics vs 4 baseline strategies
- [x] Includes comparison metrics (win rate, P&L, Sharpe diffs)
- [x] Includes markdown report for sprint review

---

## Implementation Story 30.9 — Data Adapter Layer

### Status: ✅ COMPLETE

### Completed Work

- [x] Source registry with throttling and caching implemented (EPIC 29)
- [x] Source adapters for earnings, insider, volatility, sector implemented
- [x] Throttle rules documented and enforced
- [x] Source confidence scores available downstream

---

## Implementation Story 30.10 — LLM Consolidator Prototype

### Status: ✅ COMPLETE

### Completed Work

- [x] Consolidator emits schema-valid JSON with source citations
- [x] Readiness states (ready/partial/insufficient) implemented
- [x] Contradiction detection (technical/sector misalignment)
- [x] No-trade fallback when confidence is too low
- [x] 6 tests passing

---

## Suggested Execution Order

1. Story 30.1 — Build the Opportunity Ledger
2. Story 30.2 — Build Bad-Trade Postmortem Rules
3. Story 30.3 — Establish Professional-Style Benchmarks
4. Story 30.4 — Research Missing Data Sources
5. Story 30.5 — Evaluate LLM Consolidator Viability
6. Story 30.6 — Opportunity Diagnostics API
7. Story 30.7 — Trade Postmortem API
8. Story 30.8 — Benchmark Replay Harness
9. Story 30.9 — Data Adapter Layer
10. Story 30.10 — LLM Consolidator Prototype

---

## Test Plan Updates

- Add opportunity ledger replay tests.
- Add missed-opportunity reason tests.
- Add bad-trade postmortem tests.
- Add benchmark snapshot tests.
- Add adapter/throttle tests.
- Add consolidator schema and guardrail tests.

---

## Research Notes

- Alpha Vantage and SEC EDGAR should be treated as enrichment sources with strict caching and fallback behavior.
- Data sources should be evaluated on cost, rate limit, latency, symbol coverage, and ToS risk before implementation.
- An LLM consolidator is viable only if it is schema-validated, citation-backed, and advisory rather than authoritative.
