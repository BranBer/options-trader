# Process Architecture Review - 2026-04-17

## Scope

Deep review of the application's runtime processes, modular boundaries, prompt/calculation flow, and structural efficiency.

Primary sources reviewed:

- Obsidian architecture and process documentation
- `src/lib/cron/scheduler.ts`
- `src/lib/cron/pipelines/analysis-pipeline.ts`
- `src/lib/cron/pipelines/news-pipeline.ts`
- `src/lib/cron/pipelines/whale-pipeline.ts`
- `src/lib/services/llm-analyzer.ts`
- `src/lib/services/report-data-aggregator.ts`
- deterministic analytics utilities (`trigger-engine`, `intraday-resistance`)

## Findings

### 1. Per-ticker analysis context is recomputed multiple times within the same cycle

Severity: High

The recommendation stage, fallback recommendation stage, and deep-dive stage each fetch overlapping market data for the same ticker and recompute many of the same derived artifacts:

- options chain
- 1W/1M/3M candles
- indicator reports
- IV-RV spread / ATM IV
- volume profile
- algo S/R
- `TriggerReport`

Evidence:

- `analysis-pipeline.ts` recommendation path fetches market data, options chain, and 1W/1M/3M candles, then computes indicator reports, IV-RV spread, volume profile, algo S/R, and `TriggerReport`
- `analysis-pipeline.ts` fallback recommendation path repeats nearly the same work
- `analysis-pipeline.ts` deep-dive path then fetches broader candle ranges plus options chain and market data again
- `llm-analyzer.ts` deep-dive generation recomputes signal hierarchy, volume profile, algo S/R, IV skew, OI summary, catalysts, and `TriggerReport`

Impact:

- more external calls than necessary
- duplicated CPU work in the same pipeline cycle
- greater risk of intra-cycle drift when two stages compute similar artifacts independently
- weaker modularity because artifact ownership is split across orchestrator and LLM service layers

Recommendation:

Create a per-ticker `AnalysisContext` / `AnalysisArtifacts` builder that runs once per ticker per cycle and returns a canonical object with:

- raw fetches: market snapshot, options chain, candles by timeframe
- derived analytics: indicator reports, IV-RV spread, volume profile, algo S/R, OI summary, IV skew
- deterministic artifacts: `TriggerReport`, scorecard inputs, catalyst context

Then pass that object to recommendation generation, deep-dive generation, and any future export or event-analysis flows.

### 2. The analysis pipeline duplicates recommendation-building logic instead of isolating it into a reusable stage

Severity: High

The fallback recommendation path is not just a small adapter. It duplicates most of the main recommendation path with slightly different synthetic-correlation setup.

Evidence:

- high-confidence recommendation flow in `analysis-pipeline.ts`
- fallback whale-signal-only flow in the same file repeats fetch, indicator, IV-RV, short-interest, trigger, and scorecard work

Impact:

- bug-fix tax: changes to recommendation inputs must be applied in two separate branches
- prompt/calc drift risk between normal and fallback modes
- difficult testing because the real behavior is spread across two long inline branches

Recommendation:

Extract a shared `buildRecommendationContext(ticker, mode, inputs)` helper or service that:

- resolves market/options/history data
- computes shared derived artifacts
- builds either correlated or whale-signal-only prompt input adapters

The pipeline should choose the mode, not duplicate the artifact-building steps.

### 3. Domain analytics are split between the pipeline orchestrator and the LLM service layer

Severity: High

`llm-analyzer.ts` is no longer just a transport/orchestration layer for LLM calls. It also computes deterministic market artifacts such as volume profile, algo S/R, IV skew, OI summary, catalysts, and `TriggerReport` during deep-dive generation.

At the same time, `analysis-pipeline.ts` computes some of those same artifacts before recommendation generation.

Impact:

- unclear ownership of deterministic analytics
- larger blast radius for changes to analytics rules
- hard-to-reason-about module responsibilities
- increased risk that non-LLM consumers and LLM consumers diverge over time

Recommendation:

Split responsibilities into three explicit layers:

1. `market-context-builder` or `analysis-artifacts-builder`
2. `prompt-adapter` layer that converts artifacts into prompt-friendly structures
3. `llm-client` / `llm-analyzer` layer that only handles model invocation, retries, validation, and parse concerns

This would make the LLM layer thinner and move reusable deterministic logic into a single canonical dependency.

### 4. The nexus earnings monitor is serialized at pipeline start and should be separated or concurrency-limited

Severity: Medium

At the start of `runAnalysisPipeline()`, the code loops through `NEXUS_COMPANIES` and sequentially fetches earnings dates and, when applicable, EPS surprise data.

Impact:

- pipeline latency grows linearly with nexus list size
- this work is front-loaded before recommendation/deep-dive processing can begin
- the data is relatively slow-moving compared with the 10-minute pipeline cadence

Recommendation:

Move nexus earnings monitoring into a separate cached service or scheduled refresh path. If it remains inline, process it with bounded concurrency and persist the results for reuse across pipeline cycles.

### 5. News storage performs row-by-row inserts plus row-by-row re-queries before auto-trigger analysis

Severity: Medium

`classifyAndStoreNews()` inserts each event individually and then immediately performs another select to retrieve the inserted row so it can be passed into `autoTriggerEventAnalysis()`.

Impact:

- N+1 database write/read pattern in a hot ingestion path
- unnecessary database round-trips proportional to article count
- storage concerns and event-trigger concerns are too tightly coupled in the same loop

Recommendation:

Batch inserts where possible and return inserted rows in a single follow-up query, or introduce a cleaner event handoff mechanism that avoids per-row re-selection.

### 6. Current process documentation still implies an active simulated-execution stage that the workspace no longer contains

Severity: Medium

The current docs still describe a six-stage pipeline with active sim execution, while the workspace’s current cron pipeline is fetch/classify/analysis only and the previously documented sim prompt/pipeline files are not present.

Impact:

- readers reason about the wrong runtime boundary
- future work can be planned against an outdated execution model
- maintenance effort increases because historical and active process models are mixed together

Recommendation:

Treat the current runtime as a three-stage pipeline plus separate export/event-analysis subsystems unless and until the sim execution path is restored in code. Historical sim design can remain documented, but it should be clearly marked as historical or planned.

## Architectural Themes

### Theme 1: Shared artifacts exist, but they are not yet promoted to a first-class pipeline contract

The system is moving in the right direction with `TriggerReport`, intraday structure, and report enrichment artifacts. The next step is to promote a wider canonical artifact bundle for each ticker/cycle.

### Theme 2: The LLM layer is doing too much non-LLM work

The codebase has partly escaped the “ask the model to do everything” trap, but some deterministic analytics are still being assembled inside the LLM service boundary. That weakens modularity and makes reuse harder.

### Theme 3: Fallback behavior is implemented as duplicate branches rather than alternate adapters over shared context

This is the clearest source of unnecessary complexity in the recommendation process.

## Highest-Leverage Refactor Directions

### 1. Introduce a canonical `TickerAnalysisContext`

Suggested contents:

- ticker identity and whale metadata
- market snapshot
- options chain
- candles by timeframe
- indicator reports by timeframe
- IV-RV and volatility metrics
- volume profile and algo S/R
- `TriggerReport`
- short interest
- earnings / macro / catalyst context
- optional prior deep-dive summary

### 2. Split `llm-analyzer.ts` into thinner modules

Suggested targets:

- `llm-client.ts` for retries, model selection, token logging, JSON handling
- `prompt-adapters/` for turning shared artifacts into prompt payloads
- `analysis-artifacts/` for deterministic market calculations reused by prompts, UI, and reports

### 3. Unify standard and fallback recommendation flows

Keep one recommendation execution path with interchangeable upstream input adapters instead of two near-copy branches.

### 4. Separate slow-moving monitors from hot-cycle analysis work

Nexus earnings drift and similar contextual monitors should be cached and refreshed on their own cadence rather than fully recomputed inline at every analysis run.

## Review Conclusion

The application is directionally strong: deterministic analytics are replacing ad hoc model inference in the right places, and shared artifacts like `TriggerReport` and intraday structure are clear improvements.

The main remaining structural problem is not lack of capability; it is that the same capability is still assembled in multiple places. The next maturity step is to centralize per-ticker analysis context and make prompt generation, UI rendering, and reporting consume that shared contract instead of each rebuilding pieces of it.
