# Story 43.3 — Analysis Pipeline Integration Design

## 1. Architecture Overview

```
                    ┌─────────────────────┐
                    │  Nexus Seed List     │
                    │  nexus-companies.ts  │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
                    │  Earnings Monitor    │
                    │  (cron scheduler)    │
                    │  fetchEarningsDate() │
                    │  for each nexus co.  │
                    └────────┬────────────┘
                             │ nexus reported?
                    ┌────────▼────────────┐
                    │  Cascade Detector    │
                    │  cascade-detector.ts │
                    │  Computes:           │
                    │   • cascade_strength │
                    │   • time_factor      │
                    │   • direction        │
                    └────────┬────────────┘
                             │ CascadeContext
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ Trade Rec   │  │ Deep Dive  │  │ Composite  │
     │ Prompt      │  │ Prompt     │  │ Confidence │
     │ (new §)     │  │ (new §)    │  │ (new factor│
     └────────────┘  └────────────┘  └────────────┘
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                    ┌────────────────────┐
                    │  Analysis UI       │
                    │  Cascade badge +   │
                    │  context in cards  │
                    └────────────────────┘
```

## 2. Integration Option Selection

### Options Evaluated

| Option                                              | Description                                                                                                         | Pros                                                           | Cons                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **A: Inject cascade context into existing prompts** | Add `cascadeContext` field to `DeepDivePromptInput` and `MarketDataForRecommendation`, render as new prompt section | Minimal new code; LLM sees cascade alongside all other context | Increases prompt token count by ~200-400 tokens                                                  |
| B: Separate cascade analyzer prompt                 | New LLM call that runs before deep-dive, produces structured cascade report                                         | Clean separation of concerns                                   | Extra LLM call per analysis (cost + latency); redundant with inline context                      |
| C: Enrich cross-reference prompt                    | Detect earnings-driven cascades in the cross-reference stage                                                        | Natural fit for correlation discovery                          | Cross-ref operates on whale↔news pairs; cascade is ticker↔ticker dependency, different semantics |

### **Recommended: Option A — Inject into existing prompts**

**Rationale:**

- The cascade context is pre-computed (not LLM-generated), so it's just structured text injected into the prompt. No separate LLM call needed.
- The deep-dive and trade-analyzer prompts already accept `macroContext` with earnings date + IV crush risk. Cascade context is a natural extension of this pattern.
- Token budget impact is small (~200-400 tokens per analysis) — well within the 16K output limit.
- Keeps the analysis pipeline's per-ticker flow intact: fetch data → compute cascade → inject context → LLM call → store result.

## 3. Schema Design

### New Types

```typescript
// src/lib/data/nexus-companies.ts — already built, add edge_weight
interface NexusDependency {
  ticker: string;
  relationship: string;
  edgeWeight: number; // NEW: 0-1 strength (0.9=sole source, 0.3=minor)
  directionality: "customer" | "supplier" | "platform" | "competitive"; // NEW
}

// src/lib/utils/cascade-detector.ts — NEW FILE
interface CascadeSignal {
  nexusTicker: string;
  nexusName: string;
  reportedAt: string; // ISO timestamp of earnings report
  hoursSinceReport: number;
  epsSurprisePct: number; // e.g. 15.0 for 15% beat
  baseImpact: number; // normalized 0-1
  direction: "bullish" | "bearish";
}

interface CascadeEdge {
  nexusTicker: string;
  targetTicker: string;
  edgeWeight: number; // 0-1
  hop: number; // 1 = direct, 2 = second-order
  relationship: string; // human-readable
}

interface CascadeContext {
  signals: CascadeSignal[]; // which nexus companies reported recently
  edges: CascadeEdge[]; // which edges connect to the target ticker
  cascadeStrength: number; // final 0-1 composite for confidence factor
  cascadeDirection: "bullish" | "bearish" | "mixed";
  timeFactor: number; // 0-1 time decay
  promptSection: string; // pre-formatted text for prompt injection
}
```

### DB Schema (Optional — Phase 1 can skip DB storage)

No new tables needed for Phase 1. Cascade context is computed on-the-fly during the analysis pipeline and injected into prompts. The cascade_strength value is stored implicitly in the `confidenceBreakdown` JSON on the `analyses` table.

Phase 2 could add:

```sql
CREATE TABLE cascade_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nexus_ticker TEXT NOT NULL,
  reported_at TEXT NOT NULL,
  eps_surprise_pct REAL,
  guidance_signal TEXT,
  cascade_assessment TEXT, -- JSON
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## 4. Prompt Engineering Plan

### Trade Analyzer Prompt — New Section

Add after the macro context section in `buildTradeAnalyzerPrompt()`:

```typescript
if (cascadeContext && cascadeContext.signals.length > 0) {
  prompt += `\n\n## Earnings Cascade Context`;
  prompt += `\n${cascadeContext.promptSection}`;
  prompt += `\nFactor this upstream earnings cascade into your thesis `;
  prompt += `and confidence assessment. The cascade signal is `;
  prompt += `${cascadeContext.cascadeDirection} with strength `;
  prompt += `${cascadeContext.cascadeStrength.toFixed(2)}.`;
}
```

**Example rendered prompt section:**

```
## Earnings Cascade Context
Upstream nexus company TSMC (TSM) reported earnings 18 hours ago.
- EPS surprise: +15.2% beat (LARGE — strong cascade trigger)
- Cascade phase: IMMEDIATE (18h post-report, signal at 84% strength)
- Your relationship to TSM: Direct customer — sole leading-edge chip fabrication source
- Edge weight: 0.9 (high dependency)
- Cascade signal: STRONG BULLISH (cascade_strength: 0.72)
- Other affected tickers in this wave: AMD, AAPL, QCOM, AVGO, MRVL

Factor this upstream earnings cascade into your thesis and confidence
assessment. The cascade signal is bullish with strength 0.72.
```

**Token impact:** ~150-250 tokens per cascade section. Well within budget.

### Deep Dive Prompt — New Section

Same pattern. Add `cascadeContext` to `DeepDivePromptInput` and render in `buildDeepDivePrompt()`:

```typescript
// In DeepDivePromptInput interface:
cascadeContext?: {
  promptSection: string;
  cascadeStrength: number;
  cascadeDirection: "bullish" | "bearish" | "mixed";
};

// In buildDeepDivePrompt():
if (input.cascadeContext) {
  prompt += `\n\n## Earnings Cascade Context`;
  prompt += `\n${input.cascadeContext.promptSection}`;
  prompt += `\nIncorporate this upstream catalyst in your risk `;
  prompt += `assessment and entry/exit timing analysis.`;
}
```

### System Instruction Addition

Add to both `TRADE_ANALYZER_SYSTEM_INSTRUCTION` and `DEEP_DIVE_SYSTEM_INSTRUCTION`:

```
15. EARNINGS CASCADE: When upstream nexus companies have recently reported
    earnings, a cascade context section will be provided. Use this to:
    - Adjust your directional confidence (strong upstream beat = bullish tailwind)
    - Factor cascade timing into entry recommendation (immediate phase = stronger signal)
    - Note cascade risk in risk factors (e.g. "upstream catalyst may already be priced in if >48h old")
    - Do NOT double-count cascade with earningsRisk — cascade is about UPSTREAM events, earningsRisk is about THIS ticker's own upcoming earnings.
```

## 5. Cascade Detector Implementation

### `src/lib/utils/cascade-detector.ts`

```typescript
export function detectCascade(
  targetTicker: string,
  nexusCompanies: NexusCompany[],
  recentEarnings: Map<string, { reportedAt: string; epsSurprisePct: number }>,
): CascadeContext | null;
```

**Algorithm:**

1. For each nexus company in the seed list:
   a. Check if it appears in `recentEarnings` (reported within last 72h)
   b. If yes, check if `targetTicker` is in its dependents list (hop 1)
   c. Also check if any of the nexus company's direct dependents are themselves nexus companies that have `targetTicker` as a dependent (hop 2)
2. Compute cascade_strength for each edge using the wave model formula
3. Apply time_factor based on hours since report
4. Aggregate: if multiple nexus companies have cascaded, take the strongest signal
5. Generate the `promptSection` text
6. Return null if no active cascades (most common case — saves tokens)

### Integration into Analysis Pipeline

In `analysis-pipeline.ts`, add cascade detection in the per-ticker analysis loop:

```typescript
// After fetching earningsDate, before calling generateRecommendation:
import { detectCascade } from "@/lib/utils/cascade-detector";
import { NEXUS_COMPANIES } from "@/lib/data/nexus-companies";

const cascadeContext = detectCascade(
  ticker,
  NEXUS_COMPANIES,
  recentNexusEarnings, // Map populated earlier in pipeline
);

// Pass to recommendation:
const recommendation = await generateRecommendation(correlation, {
  ...existingData,
  cascadeContext: cascadeContext ?? undefined,
});

// Pass to deep dive:
const deepDive = await generateDeepDive({
  ...existingInput,
  cascadeContext: cascadeContext ?? undefined,
});
```

### Nexus Earnings Monitor

At the start of the pipeline run, check earnings status for all nexus companies:

```typescript
const recentNexusEarnings = new Map<
  string,
  { reportedAt: string; epsSurprisePct: number }
>();

for (const nexus of NEXUS_COMPANIES) {
  const earningsDate = await fetchEarningsDate(nexus.ticker);
  if (!earningsDate) continue;

  const hoursSince = (Date.now() - new Date(earningsDate).getTime()) / 3.6e6;
  if (hoursSince >= 0 && hoursSince <= 72) {
    // Nexus company reported recently — fetch EPS surprise
    // Phase 1: use a simple heuristic from price change
    // Phase 2: fetch actual EPS surprise from earnings calendar API
    recentNexusEarnings.set(nexus.ticker, {
      reportedAt: earningsDate,
      epsSurprisePct: 0, // placeholder — Phase 1 uses LLM assessment
    });
  }
}
```

**Note:** `fetchEarningsDate()` returns the NEXT earnings date, not the most recent. To detect "just reported," we need to check if the returned date is in the past (within 72h). This already works — `getEarningsProximity` computes `daysToEarnings` which goes negative after the report.

## 6. Composite Confidence Factor

### Integration into `composite-confidence.ts`

Add to `CompositeInputs`:

```typescript
cascadeStrength?: number | null;  // 0-1 from cascade detector
```

Add to `FACTOR_WEIGHTS`:

```typescript
const FACTOR_WEIGHTS = {
  geminiCorrelationConf: 0.16, // was 0.18
  whaleQualityScore: 0.13, // was 0.14
  technicalAlignment: 0.13, // was 0.14
  cascadeStrength: 0.08, // NEW
  ivRegime: 0.08, // was 0.09
  vixRegime: 0.08, // was 0.09
  earningsRisk: 0.09, // unchanged
  insiderAlignment: 0.08, // was 0.09
  sectorMomentum: 0.09, // unchanged
  shortInterest: 0.08, // was 0.09
} as const;
```

Factor normalization:

```typescript
// Cascade Strength factor
if (inputs.cascadeStrength != null) {
  // If cascade direction matches recommendation direction → boost
  // If cascade direction opposes → penalize
  // cascadeStrength already encodes direction alignment (0 = opposing, 0.5 = neutral, 1 = confirming)
  rawFactors.push({
    name: "Cascade Strength",
    key: "cascadeStrength",
    value: inputs.cascadeStrength,
    description: `Upstream nexus earnings cascade signal`,
  });
} else {
  rawFactors.push({
    name: "Cascade Strength",
    key: "cascadeStrength",
    value: null, // weight redistributed to other factors
    description: "No active cascade signal",
  });
}
```

When no nexus company has recently reported (the majority of the time), this factor's weight (0.08) is redistributed proportionally to the other factors — effectively the system behaves exactly as it does today.

## 7. UI Presentation

### Recommendation Card — Cascade Badge

When a trade recommendation has active cascade context, show a badge:

```tsx
{
  cascadeStrength > 0 && (
    <Badge variant="outline" className="border-blue-500/30 text-blue-400">
      <Network className="h-3 w-3 mr-1" />
      Cascade: {cascadeDirection} ({(cascadeStrength * 100).toFixed(0)}%)
    </Badge>
  );
}
```

### Confidence Breakdown Panel — Cascade Factor

The existing `ConfidenceBreakdownPanel` already renders all factors from the breakdown. Adding `cascadeStrength` to the composite will automatically display it as a bar in the breakdown panel without any UI changes.

### Nexus Map Tab (Already Built)

The Nexus Map tab in the Analysis page (built in Story 43.0 implementation) already shows:

- Seed nexus companies grouped by sector
- Re-Analyze Drift button for geopolitical shift detection
- Risk alerts, removals, additions

Phase 1 can add to this tab:

- **Active Cascades** section showing which nexus companies have recently reported and which dependents are affected
- Clicking a nexus company shows its dependency tree

## 8. File Change Inventory

### New Files (Phase 1)

| File                                | Purpose                                            |
| ----------------------------------- | -------------------------------------------------- |
| `src/lib/utils/cascade-detector.ts` | Core cascade detection: `detectCascade()` function |

### Modified Files (Phase 1)

| File                                          | Change                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/lib/data/nexus-companies.ts`             | Add `edgeWeight` and `directionality` to `NexusDependency` interface                                       |
| `src/lib/utils/composite-confidence.ts`       | Add `cascadeStrength` factor (10th factor, 0.08 weight)                                                    |
| `src/lib/prompts/trade-analyzer.ts`           | Add `cascadeContext` param, render `## Earnings Cascade Context` section, add system instruction rule #15  |
| `src/lib/prompts/deep-dive-analyzer.ts`       | Add `cascadeContext` to `DeepDivePromptInput`, render cascade section, add system instruction rule         |
| `src/lib/services/llm-analyzer.ts`            | Thread `cascadeContext` through `generateRecommendation()` and `generateDeepDive()`                        |
| `src/lib/cron/pipelines/analysis-pipeline.ts` | Add nexus earnings monitor at pipeline start, call `detectCascade()` per ticker, pass context to LLM calls |
| `src/components/analysis/AnalysisPage.tsx`    | Add cascade badge to RecommendationCard                                                                    |
| `src/components/analysis/NexusDriftPanel.tsx` | Add "Active Cascades" section                                                                              |

### Unchanged Files

| File                                  | Why Unchanged                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `src/lib/db/schema.ts`                | No new tables in Phase 1 — cascade context stored in existing `analyses.confidenceBreakdown` JSON                      |
| `src/lib/utils/earnings-proximity.ts` | Cascade is separate from own-earnings proximity                                                                        |
| `src/types/analysis.ts`               | Nexus drift types already added; no cascade-specific response schema needed (cascade is input context, not LLM output) |

## 9. LLM Token Budget Estimate

| Component                               | Tokens Added | When                                                      |
| --------------------------------------- | ------------ | --------------------------------------------------------- |
| Cascade prompt section (trade-analyzer) | ~200         | Only when active cascade exists for this ticker           |
| Cascade prompt section (deep-dive)      | ~200         | Only when active cascade exists for this ticker           |
| System instruction rule #15             | ~80          | Always (but one-time per prompt)                          |
| **Total per analysis with cascade**     | **~280**     | Occasional (only when nexus company reported in last 72h) |
| **Total per analysis without cascade**  | **~80**      | Most of the time (just the system instruction addition)   |

Impact is minimal. The system instruction addition (80 tokens) is always-on but tiny. The cascade section (~200 tokens) only appears when a nexus company has recently reported — maybe 2-4 weeks per quarter across all 20 nexus companies.

**Estimated quarterly token budget increase:** ~50K tokens ≈ **$0.05** via OpenRouter.
