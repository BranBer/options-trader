# Epic 43 — Earnings Cascade & Nexus Company Intelligence

## Motivation

Certain companies sit at critical nodes in the global supply chain and technology
ecosystem — TSMC, NVIDIA, Microsoft, ASML, etc. When these **nexus companies**
report strong (or weak) earnings the effect **cascades** through dependent
companies in a predictable but diminishing wave:

```
TSMC beats → NVIDIA rallies → cloud hyperscalers rally → SaaS names on Azure/AWS rally → …
```

Today our deep-dive and trade-analyzer prompts have **no awareness** of this
dependency structure. They evaluate each ticker in isolation, missing the
highest-signal catalyst pattern in earnings season: the upstream beat/miss that
moves an entire dependency tree.

### Core Questions

| #   | Question                                                                                    | Story |
| --- | ------------------------------------------------------------------------------------------- | ----- |
| 1   | How do we **identify** nexus companies — and does the set change over time?                 | 43.0  |
| 2   | What **data sources** (free/low-cost) can map supply-chain & revenue dependencies at scale? | 43.1  |
| 3   | How should we **model the cascade** — wave depth, attenuation, timing?                      | 43.2  |
| 4   | How do we **integrate** cascade context into deep-dive analysis & trade recommendations?    | 43.3  |

---

## Phase 0 — Research

### Story 43.0 — Nexus Company Identification Research

**No code changes — research output only.**

#### Goal

Determine how to identify "nexus" companies whose earnings have outsized
downstream effects, and whether the set is static or dynamic.

#### Research Questions

1. **What makes a company a nexus?**
   - Revenue concentration (>20 % of industry revenue flows through them)
   - Sole-source or dominant supplier position (TSMC for leading-edge fab,
     ASML for EUV lithography, NVIDIA for AI GPUs)
   - Platform dependency (AWS/Azure/GCP for cloud workloads)
   - Can LLMs reliably identify these from public knowledge + earnings
     transcripts, or do we need structured data?

2. **Static vs. dynamic nexus lists**
   - Some nexus positions are structural (TSMC ≥ 90 % of leading-edge
     chips — unlikely to change quarter-to-quarter)
   - Others shift with market cycles (e.g. during COVID, shipping
     companies became temporary nexuses for retail supply chains)
   - Can we use LLM calls to periodically re-evaluate the nexus set
     (e.g. weekly), or should we maintain a curated seed list and let
     LLMs add/remove at the edges?

3. **Existing taxonomies**
   - GICS sector/industry classification
   - S&P supply chain indices
   - FactSet Revere supply-chain dataset (paid)
   - SEC 10-K "significant customers" disclosures
   - Do any **free** sources publish structured dependency graphs?

#### Deliverables

- `docs/research/nexus-company-identification.md`
  - Definition & criteria for "nexus company"
  - Evaluation of LLM-only vs. structured-data vs. hybrid approach
  - Recommended nexus identification strategy with pros/cons table
  - Seed list of ~15-20 obvious nexus companies with justification

#### Acceptance Criteria

- [x] Research doc exists at the expected path
- [x] At least 3 approaches evaluated (LLM-only, structured data, hybrid)
- [x] Seed nexus list covers semiconductors, cloud/hyperscale, energy,
      financials, and at least one non-tech sector
- [x] Recommendation is clear with rationale

**Output:** `docs/research/nexus-company-identification.md`

---

### Story 43.1 — Dependency Data Source Evaluation

**No code changes — research output only.**

#### Goal

Survey free and low-cost data sources that can map company-to-company
dependencies — supplier/customer relationships, platform dependencies,
revenue exposure — to build the cascade graph.

#### Sources to Evaluate

| Source                              | Type                                      | Cost                  |
| ----------------------------------- | ----------------------------------------- | --------------------- |
| SEC EDGAR 10-K full text            | Customer concentration disclosures        | Free                  |
| Finnhub supply chain endpoint       | `/stock/supply-chain`                     | Free tier             |
| Yahoo Finance key statistics        | Major holders, institutional overlap      | Free                  |
| LLM knowledge (Gemini / OpenRouter) | Zero-shot dependency extraction           | API cost only         |
| Wikipedia / Wikidata                | Company relationships via structured data | Free                  |
| GDELT Global Knowledge Graph        | Organization co-occurrence                | Free                  |
| FactSet Revere                      | Gold-standard supply chain                | $$$$ (reference only) |
| Alpha Vantage fundamentals          | Sector, industry, peers                   | Free tier             |

#### Research Questions

1. Which free sources provide **structured** supplier→customer edges?
2. Can LLMs synthesize an accurate dependency graph from earnings
   transcripts + 10-K text, or do they hallucinate edges?
3. How frequently do dependencies change? (quarterly with 10-K updates
   vs. real-time with M&A / contract wins)
4. What's the minimum viable data quality to produce useful cascade
   predictions — do we need exact revenue %, or is "NVDA depends on
   TSMC for fab" sufficient?

#### Deliverables

- `docs/research/dependency-data-sources.md`
  - Source-by-source evaluation table (coverage, accuracy, latency, cost)
  - Data quality assessment per source
  - Sample dependency edges extracted from each viable source
  - Recommended source stack (primary + fallback)

#### Acceptance Criteria

- [x] At least 5 sources evaluated with structured comparison table
- [x] At least 1 source tested with a real API call and sample output documented
- [x] Accuracy assessment: can we trust the edges enough for trading signals?
- [x] Recommended stack identified with estimated API budget impact

**Output:** `docs/research/dependency-data-sources.md`

---

### Story 43.2 — Cascade Wave Modeling Research

**No code changes — research output only.**

#### Goal

Design the mathematical / heuristic model for how an earnings
beat/miss at a nexus company propagates through the dependency tree,
including wave attenuation and timing.

#### Research Questions

1. **Wave attenuation**
   - How much does impact diminish per hop in the dependency graph?
   - Is it linear decay (e.g. 100% → 60% → 36% → 22%) or does it
     depend on the strength of each specific edge?
   - Example: TSMC beat → NVIDIA (direct customer, 80% weight) vs.
     TSMC beat → Qualcomm (partial customer, 40% weight)

2. **Timing dynamics**
   - Immediate effect: TSMC reports → NVDA moves in after-hours
   - Delayed effect: NVDA rally → MSFT "AI narrative" rally over 2-3 days
   - Do we model a time-decay function, or is it simpler to say
     "cascade is relevant for N calendar days post-earnings"?

3. **Directionality**
   - Beat cascades bullish; miss cascades bearish — but is it symmetric?
   - Revenue-dependent companies: direct correlation
   - Competitors: inverse correlation (TSMC beat might hurt GFS/SMIC)

4. **EPS surprise magnitude mapping**
   - Small beat (1-5%) vs. large beat (>10%) — does cascade strength scale
     linearly or is there a threshold effect?

5. **Integration with existing signals**
   - Our deep-dive already has `macroContext.earningsDate` and IV crush
   - How does cascade context compose with existing whale signals,
     technical indicators, and news correlations?
   - Should cascade produce a separate confidence factor, or modify
     existing factors (earningsRisk, newsCorrelation)?

#### Deliverables

- `docs/research/cascade-wave-model.md`
  - Proposed attenuation formula with worked examples
  - Timing model (immediate / delayed / exhausted)
  - Directionality rules (confirm / inverse / neutral)
  - Integration design: how cascade context enters the analysis pipeline
  - Comparison of simple (flat decay) vs. edge-weighted approaches

#### Acceptance Criteria

- [x] Attenuation model defined with at least 2 worked numerical examples
- [x] Timing model specifies how long a cascade signal remains relevant
- [x] Directionality covers both positive and negative cascades
- [x] Integration design references existing types (`DeepDivePromptInput`,
      `macroContext`, composite confidence factors)
- [x] Recommendation on simple vs. complex model with justification

**Output:** `docs/research/cascade-wave-model.md`

---

### Story 43.3 — Analysis Pipeline Integration Design

**No code changes — research output only.**

#### Goal

Design where cascade intelligence enters the existing analysis pipeline:
prompt engineering, response schema extensions, confidence scoring, and UI
presentation.

#### Existing Integration Points

| Component              | File                                          | Current Earnings Awareness                  |
| ---------------------- | --------------------------------------------- | ------------------------------------------- |
| Deep-dive prompt       | `src/lib/prompts/deep-dive-analyzer.ts`       | `macroContext.earningsDate`, IV crush rules |
| Trade analyzer prompt  | `src/lib/prompts/trade-analyzer.ts`           | Rule #8 IV crush, FOMC context              |
| Cross-reference prompt | `src/lib/prompts/cross-reference.ts`          | None — correlates whale ↔ news only         |
| Composite confidence   | `src/lib/utils/composite-confidence.ts`       | `earningsRisk` factor (9% weight)           |
| Analysis pipeline      | `src/lib/cron/pipelines/analysis-pipeline.ts` | Fetches earnings date, computes proximity   |
| Event-ticker analyzer  | `src/lib/services/event-ticker-analyzer.ts`   | News-driven analysis                        |

#### Design Questions

1. **New prompt section or separate prompt?**
   - Option A: Add `cascadeContext` to `DeepDivePromptInput` and
     inject a new `## Earnings Cascade Context` section
   - Option B: Separate "cascade analyzer" prompt that runs before
     deep-dive and produces a structured cascade report
   - Option C: Enrich the cross-reference prompt to detect
     earnings-driven cascade patterns alongside whale-news correlations

2. **LLM cascade graph generation**
   - Should the LLM build the dependency graph on-the-fly during analysis,
     or should we pre-compute it and inject as context?
   - Token budget considerations: a full 3-hop dependency tree for 15
     nexus companies could be large

3. **Response schema changes**
   - Extend `DeepDiveAnalysis` with cascade fields?
   - New standalone type `CascadeAnalysis`?
   - How does the UI present cascade intelligence? (New section in
     event-ticker panel? Separate page?)

4. **Confidence scoring**
   - New `cascadeStrength` factor in composite confidence?
   - How does it interact with existing `earningsRisk`?
   - Should a strong upstream beat INCREASE confidence for dependent
     ticker trades, or only serve as additional context?

5. **Caching & freshness**
   - Dependency graph: cache for 1 week (changes slowly)
   - Cascade signals: recompute when nexus earnings land
   - How do we detect "nexus company just reported"?

#### Deliverables

- `docs/research/cascade-integration-design.md`
  - Architecture diagram showing data flow from earnings event →
    dependency lookup → cascade scoring → prompt injection → analysis
  - Recommended integration option (A/B/C) with trade-offs
  - Schema design for cascade types
  - Prompt engineering plan (system instruction additions, context format)
  - UI wireframe / description for cascade presentation
  - Migration plan: what changes in existing files, what's new

#### Acceptance Criteria

- [x] Integration option selected with clear rationale
- [x] Schema design covers cascade graph, cascade signal, and analysis extension
- [x] Prompt engineering plan shows exact new sections to add to
      deep-dive and/or trade-analyzer prompts
- [x] UI presentation described (even if rough wireframe)
- [x] File change inventory: every source file that needs modification listed
- [x] Estimated LLM token budget for cascade context

**Output:** `docs/research/cascade-integration-design.md`

---

## Phase 1 — Cascade Engine Core (Stories 43.4 – 43.6)

### Story 43.4 — Cascade Detector Core

#### Goal

Build the cascade detection engine: annotate nexus edges with weights
and directionality, then implement `detectCascade()` that computes
cascade strength using the wave model from Story 43.2.

#### Changes

- `src/lib/data/nexus-companies.ts` — Add `edgeWeight` (0-1) and
  `directionality` ("customer"|"supplier"|"platform"|"competitive")
  to `NexusDependency`; annotate all 20 nexus companies
- `src/lib/utils/cascade-detector.ts` — NEW: `CascadeSignal`,
  `CascadeEdge`, `CascadeContext` types and `detectCascade()` function
- `src/__tests__/utils/cascade-detector.test.ts` — Unit tests

#### Acceptance Criteria

- [x] `NexusDependency` includes `edgeWeight` and `directionality`
- [x] All nexus companies have edges annotated with weights + directionality
- [x] `detectCascade()` returns context when active cascade, null otherwise
- [x] Wave model math verified: 1-hop and 2-hop decay, timing phases, miss asymmetry
- [x] Unit tests pass for cascade detection

---

### Story 43.5 — Confidence Factor + Prompt Injection

#### Goal

Add `cascadeStrength` as a 10th composite confidence factor and inject
cascade context into trade-analyzer and deep-dive prompts.

#### Changes

- `src/lib/utils/composite-confidence.ts` — Add `cascadeStrength` factor (0.08 weight), redistribute
- `src/lib/prompts/trade-analyzer.ts` — Accept + render `## Earnings Cascade Context` section
- `src/lib/prompts/deep-dive-analyzer.ts` — Accept + render cascade section
- System instructions in both prompts — Add cascade awareness rule #15

#### Acceptance Criteria

- [x] `cascadeStrength` factor in composite confidence (0.08 weight)
- [x] Trade analyzer prompt renders cascade section when context present
- [x] Deep dive prompt renders cascade section when context present
- [x] System instructions include cascade rule
- [x] Existing tests still pass

---

### Story 43.6 — Analysis Pipeline Integration

#### Goal

Wire cascade detection into the analysis pipeline so that active
cascades flow through to LLM prompts and confidence scoring.

#### Changes

- `src/lib/services/llm-analyzer.ts` — Thread `cascadeContext` through
  `MarketDataForRecommendation`, `DeepDiveInput`, and both generator functions
- `src/lib/cron/pipelines/analysis-pipeline.ts` — Nexus earnings monitor
  at pipeline start, call `detectCascade()` per ticker, pass to LLM calls

#### Acceptance Criteria

- [x] Pipeline detects recent nexus earnings at start
- [x] Cascade context threads through recommendation + deep dive generators
- [x] Cascade context appears in prompts when active
- [x] Null path works when no nexus companies reported recently
- [x] Build compiles cleanly

## Phase 2 — Real Data & UI Visibility (Stories 43.7 – 43.9)

> Phase 1 already implemented the cascade wave calculator, earnings detector,
> and prompt injection. Phase 2 fills the remaining gaps: real EPS surprise
> data (currently hardcoded to 0), UI visibility for active cascades, and
> cascade badges on recommendation cards.

### Story 43.7 — Real EPS Surprise Sourcing

**Goal:** Replace the hardcoded `epsSurprisePct: 0` in the pipeline with
actual EPS surprise data from yahoo-finance2.

#### Changes

- `src/lib/services/market-fetcher.ts` — Add `fetchEpsSurprise(ticker)`
  using `quoteSummary({modules: ["earningsHistory"]})` to get EPS actual vs
  estimate for the most recent quarter, returning the surprise percentage
- `src/lib/cron/pipelines/analysis-pipeline.ts` — Call `fetchEpsSurprise()`
  in Step 0b for each nexus company that recently reported, replacing the
  hardcoded `epsSurprisePct: 0`
- `src/__tests__/services/eps-surprise.test.ts` — Unit tests for the new
  fetcher (mocked yahoo-finance2 responses)

#### Acceptance Criteria

- [x] `fetchEpsSurprise()` returns EPS surprise % from yahoo-finance2
- [x] Pipeline uses real EPS surprise for nexus earnings within 72h
- [x] Graceful fallback to 0 when data is unavailable
- [x] Unit tests cover beat, miss, and unavailable scenarios
- [x] Build compiles cleanly

### Story 43.8 — Active Cascades in UI

**Goal:** Show which nexus companies have recently reported earnings and the
resulting cascade signals in the NexusDriftPanel.

#### Changes

- `src/app/api/analysis/active-cascades/route.ts` — New GET endpoint that
  runs the nexus earnings monitor + detectCascade for all tracked tickers,
  returns active cascade signals
- `src/hooks/useApiData.ts` — Add `useActiveCascades()` query hook
- `src/components/analysis/NexusDriftPanel.tsx` — Add "Active Cascades"
  section showing recently reported nexus companies with direction badges,
  time-since-report, EPS surprise %, and cascade strength

#### Acceptance Criteria

- [x] API endpoint returns active cascade data
- [x] NexusDriftPanel shows active cascades when present
- [x] Empty state when no cascades are active
- [x] Auto-refreshes on a reasonable interval
- [x] Build compiles cleanly

### Story 43.9 — Cascade Badge on Recommendation Cards

**Goal:** Add a cascade indicator badge on recommendation cards that were
influenced by an active cascade, and ensure the cascade factor appears
with a proper label/tooltip in the confidence breakdown.

#### Changes

- `src/components/analysis/AnalysisPage.tsx` — Add cascade badge next to
  direction badge on RecommendationCard when the confidence breakdown
  contains a non-zero cascade strength factor
- `src/components/shared/ConfidenceBreakdownPanel.tsx` — Add cascade
  tooltip to FACTOR_TOOLTIPS map

#### Acceptance Criteria

- [x] Cascade badge appears on cards with active cascade influence
- [x] Badge shows cascade direction (bullish/bearish/mixed)
- [x] Confidence breakdown shows "Cascade Strength" factor with tooltip
- [x] No badge when cascade factor is absent or zero
- [x] Build compiles cleanly
- [ ] Build compiles cleanly

## Phase 3 — Visualization & Polish (Stories 43.10 – 43.12)

_To be defined after Phase 2 implementation._

Likely scope:

- 43.10: Cascade dependency tree visualization (interactive graph)
- 43.11: Earnings calendar integration page
- 43.12: End-to-end testing, empty states, navigation polish
