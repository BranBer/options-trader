# Epic 31: Trade Execution Gap & Attribution Transparency

> **Status:** 🔧 IN PROGRESS  
> **Priority:** P0 — Critical (algorithm not trading despite high-quality alerts)  
> **Created:** 2026-04-02  
> **Depends on:** Epic 12 (Sim Portfolio), Epic 29 (Trade Capture & Postmortems), Epic 30 (Benchmarking & Attribution)

## Problem Statement

User observation on 2026-04-02:

- Same-day whale alerts with quality_score > 70 are being detected
- The algorithm is **not making trades** despite these high-quality signals
- Attribution UI shows many **"unknown"** miss reasons — ambiguous label that makes diagnosis impossible
- High-quality alerts are **not appearing** in "Missed High-Quality Opportunities" section
- This suggests the algorithm's decision pipeline is silently rejecting alerts, OR the pipeline itself is not running

## Root Cause Hypotheses

1. **Pipeline not executing** — scheduler/executor failing silently
2. **Time gating blocking same-day (0DTE) contracts** — entry windows or market-hours guards rejecting valid alerts
3. **Confidence/validation gates too aggressive** — alerts failing IV regime, technical contradiction, or concentration checks
4. **Attribution taxonomy incomplete** — alerts ARE being rejected but classified as `unknown` instead of a specific reason
5. **Whale alerts not reaching evaluation stage** — detection pipeline running but not passing to trade engine

## Investigation Approach

Start with **taxonomy fix** (eliminate "unknown"), then **instrument the decision funnel**, then **verify pipeline execution health**, and finally **correlate alerts to trade decisions**.

## Progress Update (2026-04-02)

- ✅ Story 31.1 started: explicit miss-reason taxonomy wired into attribution using `sim_evaluations`
- ✅ Story 31.2 started: attribution API now exposes funnel counters and recent decision traces
- ✅ Story 31.3 started: pipeline status API now exposes derived health (`healthy` / `stale` / `running` / `never_run`)
- ✅ Story 31.4 started: same-day / 0DTE entries now use an explicit regular-hours + cutoff policy instead of a generic same-day rejection
- ✅ Story 31.5 started: attribution now exposes whale alert → evaluation → trade correlation summaries for high-quality alerts
- ✅ Correlation accuracy improved: recommendation analyses now persist whale IDs for exact alert → evaluation → trade linking when available
- ✅ Pipeline health is now visible in the navbar, not only through the status API
- ✅ UX audit started for Epic 31/32: attribution and diagnostics surfaces reviewed for operational debugging friction, with immediate trace-list overflow fixes shipped in Epic 32
- ✅ Attribution surfaces now deep-link into diagnostics: funnel pipeline gaps, recent decision traces, correlation rows, and missed opportunities can all open the diagnostics console with contextual filters
- ✅ Decision funnel UX improved: funnel stages now show retention bars and dominant drop-off emphasis instead of only flat counts
- ✅ Follow-up planning created for Epic 32 (Alert Diagnostics Console), Epic 33 (Signal Lineage & Correlation Hardening), and Epic 34 (Capture Rate Calibration & Root Cause Reporting)
- ⏳ Next: continue with Epic 33 and Epic 34, plus any remaining navigation-level coverage or summary-card filter shortcuts in diagnostics

---

## Story 31.1 — Define and Replace `unknown` Miss Reason

### Goal

Audit the miss-reason assignment logic in the attribution engine and replace the ambiguous `unknown` label with specific, actionable reasons.

### Research Questions

- Where does `unknown` get assigned in the attribution engine?
- Are alerts that should have a specific reason (e.g., low quality, time filter) being misclassified?
- What are ALL the possible reasons an alert could be missed?

### Proposed Miss Reasons

| Reason                    | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `confidence_too_low`      | Composite confidence below entry threshold             |
| `quality_too_low`         | Whale quality score below minimum                      |
| `position_size_limit`     | Premium too small or portfolio too concentrated        |
| `entry_filter_rejected`   | IV regime, earnings proximity, technical contradiction |
| `outside_trade_window`    | Alert detected outside market hours or entry cutoff    |
| `0dte_rejected`           | Same-day expiry contracts blocked by time/risk rules   |
| `portfolio_concentration` | Already have position in same ticker                   |
| `pipeline_not_run`        | Pipeline did not execute when alert arrived            |
| `missing_market_data`     | Required market data unavailable at decision time      |
| `analysis_not_completed`  | AI analysis didn't finish before entry window closed   |

### Acceptance Criteria

- [ ] No `unknown` reason appears in attribution API or UI
- [ ] Every missed opportunity has one explicit reason from taxonomy above
- [ ] Unit tests cover all reason branches
- [ ] UI displays user-friendly labels with tooltips for each reason

### Testing Plan

- [ ] Unit tests for each miss reason path
- [ ] Integration test: quality=70 alert → should NOT be `unknown`
- [ ] Regression test: verify no `unknown` in attribution snapshot

---

## Story 31.2 — Build Trade Decision Funnel Diagnostics

### Goal

Add event-level counters and per-alert decision traces so we can see exactly WHERE in the pipeline each alert was dropped.

### Funnel Stages

```
Detection → Validation → Scoring → Risk Check → Entry Decision → Trade
```

### Deliverables

- Per-alert decision trace: `{ alertId, stage, outcome, reason, timestamp }`
- Funnel counters: `{ detected, validated, scored, risk_passed, entered, dropped_by_stage: {...} }`
- Diagnostic API endpoint returning last N alerts with full trace

### Acceptance Criteria

- [ ] Can trace any alert through the full decision pipeline
- [ ] Dashboard shows drop-off rates by stage
- [ ] Logs include alert ID + rejection gate + reason

### Testing Plan

- [ ] Funnel counter unit tests
- [ ] Alert trace end-to-end test
- [ ] API contract test for diagnostics endpoint

---

## Story 31.3 — Verify Pipeline Scheduling and Execution Health

### Goal

Prove whether the pipeline ran today when whale alerts arrived, and surface execution health metrics.

### Deliverables

- Health endpoint: `{ lastRun, lastRunDuration, alertsProcessed, errors, isStale }`
- Stale-run alert if no successful run in configurable threshold (e.g., 30 min)
- Run history log with timestamps and status

### Acceptance Criteria

- [ ] Can prove whether pipeline ran when whale alerts arrived
- [ ] Health status visible via API
- [ ] Alerts generated for stalled pipeline

### Testing Plan

- [ ] Health endpoint unit tests
- [ ] Stale detection test
- [ ] Run history persistence test

---

## Story 31.4 — Audit Same-Day (0DTE) Handling and Time Gating

### Goal

Verify how "today expiry" contracts are treated by filters and risk rules, and confirm the algorithm can enter same-day trades when appropriate.

### Research Questions

- Are 0DTE contracts silently excluded by a filter?
- Is there a cutoff time after which same-day entries are blocked?
- How does the time-exit rule interact with 0DTE contracts?

### Deliverables

- Documented 0DTE policy and cutoff behavior
- Configurable entry cutoff time (e.g., no entries after 3:30 PM for same-day)
- Regression tests for before-open, intraday, near-close scenarios

### Acceptance Criteria

- [ ] 0DTE policy documented
- [ ] Time-gating logic visible in decision trace
- [ ] No silent exclusion of valid same-day opportunities

### Testing Plan

- [ ] 0DTE filter unit tests
- [ ] Time boundary tests (before-open, mid-day, near-close)
- [ ] Integration test: same-day alert → should enter if before cutoff

---

## Story 31.5 — Correlate Whale Alerts to Sim Evaluations and Trades

### Goal

Build a correlation report that traces each whale alert to its evaluation outcome and trade decision.

### Deliverables

- Correlation query: for each alert, show `{ detectedAt, evaluatedAt, shouldEnter, rejectionGate, rejectionReason, tradeId }`
- UI panel showing alert → evaluation → trade lifecycle
- Export capability for sprint debugging

### Acceptance Criteria

- [ ] For any alert (e.g., quality > 70), can trace exact lifecycle outcome
- [ ] Query/report available via API
- [ ] UI shows correlation in attribution tab

### Testing Plan

- [ ] Correlation query unit tests
- [ ] API contract tests
- [ ] UI rendering tests

---

## Story 31.6 — UI/Terminology Cleanup for Attribution Confidence

### Goal

Replace ambiguous labels in the attribution UI with clear, actionable terminology.

### Changes

| Before               | After                                 |
| -------------------- | ------------------------------------- |
| `unknown`            | Specific reason from taxonomy         |
| `confidence too low` | `Entry confidence below threshold`    |
| Generic badges       | Color-coded reason tags with tooltips |

### Acceptance Criteria

- [ ] Attribution panel is self-explanatory
- [ ] PM/dev can diagnose missed opportunities without reading code
- [ ] Tooltips explain each miss reason

### Testing Plan

- [ ] UI snapshot tests for reason labels
- [ ] Tooltip content verification

---

## Story 31.7 — Root Cause Report + Fix Prioritization

### Goal

Produce a short root cause report with quantified causes and prioritized fixes.

### Deliverables

- Root cause report under `docs/` with:
  - % of alerts dropped by each gate
  - Top 3 highest-impact fixable issues
  - Estimated capture rate improvement per fix
- Follow-up epic/stories created for permanent fixes

### Acceptance Criteria

- [ ] Root cause report committed
- [ ] Follow-up epics created
- [ ] Sprint planning recommendations included

---

## Suggested Execution Order

1. Story 31.1 — Taxonomy fix (`unknown` removal) — **Immediate**
2. Story 31.2 — Decision funnel instrumentation — **High priority**
3. Story 31.3 — Pipeline execution health — **High priority**
4. Story 31.4 — Same-day/0DTE gate audit — **Medium priority**
5. Story 31.5 — Alert→evaluation→trade correlation — **Medium priority**
6. Story 31.6 — UI terminology cleanup — **Medium priority**
7. Story 31.7 — Root cause report — **After investigation**

---

## Test Plan Updates

- Add miss-reason taxonomy tests
- Add funnel counter tests
- Add health endpoint tests
- Add 0DTE filter tests
- Add correlation query tests

---

## Investigation Notes

- 2026-04-02: User reports same-day alerts with quality > 70 not being traded
- Attribution UI shows many "unknown" labels — taxonomy needs immediate fix
- High-quality alerts not appearing in missed opportunities section — possible pipeline execution gap
- Next step: Fix "unknown" taxonomy (Story 31.1) and instrument decision funnel (Story 31.2)
