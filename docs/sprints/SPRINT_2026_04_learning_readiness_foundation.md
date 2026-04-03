# Sprint: Learning Readiness Foundation

> **Window:** Next natural sprint after Epic 33 / Epic 34 groundwork  
> **Status:** 📋 PLANNED  
> **Primary Objective:** make the diagnostics stack produce a trustworthy offline training corpus

## Why This Sprint Exists

The project is not ready for reinforcement learning today because the logged decision/outcome corpus is sparse and recently reset. The immediate job is to make the next wave of data collection durable, analyzable, and exportable.

## Sprint Scope

- Epic 33.1 — canonical provenance contract
- Epic 33.2 — explicit lineage through evaluation and trade lifecycle
- Epic 34.1 — root cause reporting pipeline
- Epic 35.1 — canonical learning record contract
- Epic 35.2 — persisted/backfilled joined training rows
- Epic 35.4 — learning readiness scorecard

## Expected Outputs

- every decisionable alert can be mapped into a single joined learning row
- lineage quality is explicit instead of heuristic-only
- sprint review can see dataset health and the current blockers to learning

## Exit Criteria

- [ ] joined learning records exist for new pipeline runs
- [ ] lineage quality is exposed in diagnostics or reporting outputs
- [ ] learning readiness report shows counts, class balance, and missing-label coverage
- [ ] the team can answer whether the dataset is still too sparse, and exactly why

## Risks

- historical records may not backfill cleanly enough for immediate dataset growth
- reward and outcome labels may remain incomplete while too many trades are still open
- reset workflows can erase scarce training data if retention/export discipline is weak

## Non-Goals

- no live model-driven execution changes
- no full RL training loop
- no promotion of learned policies into production behavior
