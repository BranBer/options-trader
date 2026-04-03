# Sprint: Offline Policy Shadowing

> **Window:** Sprint immediately after Learning Readiness Foundation  
> **Status:** 📋 PLANNED  
> **Primary Objective:** evaluate learned decision support offline and in shadow mode without changing execution

## Why This Sprint Exists

Once the training corpus is trustworthy, the next step is to test whether learned decision support beats the current threshold/LLM stack under offline evaluation. This sprint keeps the learned policy non-authoritative.

## Sprint Scope

- Epic 34.2 — identify high-impact over-filtering rules
- Epic 34.3 — threshold sensitivity replay
- Epic 35.3 — reward labels and evaluation targets
- Epic 35.5 — export offline training snapshots
- Epic 36.1 — baseline offline decision models
- Epic 36.2 — counterfactual policy evaluation harness
- Epic 36.3 — learned policy shadow mode

## Expected Outputs

- baseline learned models that can be evaluated against current heuristics
- replay and counterfactual reports with explicit caveats
- shadow recommendations persisted beside current decisions for review

## Exit Criteria

- [ ] offline evaluation compares current and candidate policies on the same windows
- [ ] shadow recommendations are logged without affecting execution
- [ ] disagreement review is possible from diagnostics/reporting outputs
- [ ] promotion remains blocked until explicit criteria are met

## Risks

- offline evaluation may overstate performance if action coverage is too narrow
- learned models may simply mirror the current policy instead of improving it
- shadow review volume may exceed what the current UI can explain cleanly

## Non-Goals

- no live policy promotion
- no autonomous threshold rewrites
- no claim that offline gains guarantee real-world gains
