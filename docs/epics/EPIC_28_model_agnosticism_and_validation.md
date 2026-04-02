# Epic 28: Model Agnosticism & Decision Factor Validation

> **Status:** ✅ COMPLETE  
> **Priority:** P1 — Important (accuracy and trust)  
> **Created:** 2026-04-01  
> **Depends on:** Epic 24 (OpenRouter Migration)

## Overview

Users have noticed the UI still displays "Gemini correlation" labels despite the system using Qwen via OpenRouter. This creates confusion and reduces trust in the analysis. This epic ensures all model references are agnostic and validates that the decision-making factors (IV regime, insider alignment, technical patterns) are actually influencing trade decisions as intended.

---

## Story 28.1 — Audit & Replace Model References

### Implementation Plan

#### Step 1: Global Search for "Gemini"

**Files to audit:**

```bash
# Search all UI components
grep -rn "Gemini" src/components/ --include="*.tsx"

# Search all API routes
grep -rn "Gemini" src/app/api/ --include="*.ts"

# Search all lib services
grep -rn "Gemini" src/lib/ --include="*.ts"

# Search all prompt files
grep -rn "Gemini" src/lib/prompts/ --include="*.ts"

# Search all types
grep -rn "Gemini" src/types/ --include="*.ts"

# Search documentation
grep -rn "Gemini" docs/ README.md CLAUDE.md
```

#### Step 2: Define Replacements

| Original Text                      | Replacement             | Rationale                 |
| ---------------------------------- | ----------------------- | ------------------------- |
| "Gemini correlation"               | "AI correlation"        | Model-agnostic            |
| "Gemini analysis"                  | "AI analysis"           | Model-agnostic            |
| "Gemini recommendation"            | "AI recommendation"     | Model-agnostic            |
| "Gemini trade evaluation"          | "AI trade evaluation"   | Model-agnostic            |
| "Powered by Gemini"                | "Powered by AI"         | Model-agnostic            |
| `gemini-analyzer.ts`               | `llm-analyzer.ts`       | Already renamed (Epic 24) |
| Variable names containing "gemini" | Rename to "llm" or "ai" | Code consistency          |

#### Step 3: Update UI Components

**File:** `src/components/portfolio/PortfolioPage.tsx`

```tsx
// BEFORE:
<p className="text-sm text-muted">
  Gemini correlation: {trade.correlationConfidence}
</p>

// AFTER:
<p className="text-sm text-muted">
  AI correlation: {trade.correlationConfidence}
</p>
```

**File:** `src/components/analysis/AnalysisPage.tsx`

```tsx
// BEFORE:
<Badge>Gemini: {analysis.confidence}</Badge>

// AFTER:
<Badge>AI: {analysis.confidence}</Badge>
```

**File:** `src/components/dashboard/DashboardHome.tsx`

```tsx
// BEFORE:
<h3>Gemini Market Analysis</h3>

// AFTER:
<h3>AI Market Analysis</h3>
```

#### Step 4: Update Prompt System Instructions

**File:** `src/lib/prompts/trade-analyzer.ts`

```typescript
// BEFORE:
export const TRADE_ANALYZER_SYSTEM_INSTRUCTION = `
You are Gemini, an expert options trading strategist...
`;

// AFTER:
export const TRADE_ANALYZER_SYSTEM_INSTRUCTION = `
You are an expert options trading strategist...
`;
```

**File:** `src/lib/prompts/cross-reference.ts`

```typescript
// BEFORE:
export const CROSS_REFERENCE_SYSTEM_INSTRUCTION = `
As Gemini, analyze the correlation between...
`;

// AFTER:
export const CROSS_REFERENCE_SYSTEM_INSTRUCTION = `
Analyze the correlation between...
`;
```

#### Step 5: Update API Response Shapes

**File:** `src/app/api/pipeline-status/route.ts`

```typescript
// Add model info to pipeline status
const status = {
  // ... existing fields
  model: {
    name: process.env.OPENROUTER_MODEL || "unknown",
    provider: "OpenRouter",
  },
};
```

### Acceptance Criteria

- [ ] Zero occurrences of "Gemini" in UI components
- [ ] Zero occurrences of "Gemini" in prompt system instructions
- [ ] Zero occurrences of "Gemini" in API responses
- [ ] Pipeline status API includes current model name
- [ ] All "Gemini" references in types/interfaces renamed
- [ ] Unit test: grep for "Gemini" returns 0 results in src/
- [ ] E2E test: no "Gemini" text visible on any page

---

## Story 28.2 — Decision Factor Validation Tests

### Implementation Plan

#### Test 1: Verify IV Regime Influences Decisions

**File:** `src/__tests__/services/sim-pipeline-iv.test.ts`

```typescript
describe("Sim Pipeline IV Environment Check", () => {
  it("rejects debit strategies in extremely high IV environment", async () => {
    // Setup: Create a debit spread recommendation in high IV
    const recommendation = createMockRecommendation({
      strategy: "Bull Call Spread",
      netPremium: 5.0, // Debit (positive)
      ticker: "SPY",
    });

    // Mock market snapshot with very high IV-RV spread
    await insertMarketSnapshot({
      ticker: "SPY",
      ivRvSpread: 0.3, // Extremely expensive options
    });

    // Run sim pipeline
    const result = await runSimPipeline();

    // Verify trade was rejected due to IV environment
    expect(result.rejections).toContainEqual({
      ticker: "SPY",
      reason: expect.stringContaining("IV"),
      stage: "validation",
    });

    // Verify no trade was opened
    const trades = await getOpenTrades();
    expect(trades.find((t) => t.ticker === "SPY")).toBeUndefined();
  });

  it("allows credit strategies in high IV environment", async () => {
    const recommendation = createMockRecommendation({
      strategy: "Put Credit Spread",
      netPremium: -3.0, // Credit (negative)
      ticker: "AAPL",
    });

    await insertMarketSnapshot({
      ticker: "AAPL",
      ivRvSpread: 0.25, // High IV but credit strategy benefits
    });

    const result = await runSimPipeline();

    // Credit strategies should NOT be rejected for high IV
    const ivRejection = result.rejections.find(
      (r) => r.ticker === "AAPL" && r.reason.includes("IV"),
    );
    expect(ivRejection).toBeUndefined();
  });
});
```

#### Test 2: Verify Insider Alignment Is Tracked

**File:** `src/__tests__/services/sim-pipeline-insider.test.ts`

```typescript
describe("Sim Pipeline Insider Alignment", () => {
  it("stores insider alignment data with trade", async () => {
    const recommendation = createMockRecommendation({
      ticker: "NVDA",
      insiderAlignment: "bullish", // Insider net buying
    });

    await runSimPipeline();

    const trade = await getLatestTrade("NVDA");
    expect(trade.insiderAlignment).toBe("bullish");
  });

  it("includes insider context in Gemini evaluation prompt", async () => {
    const buildPromptSpy = vi.spyOn(
      simTradeEvaluator,
      "buildSimTradeEvalPrompt",
    );

    const recommendation = createMockRecommendation({
      ticker: "TSLA",
      insiderAlignment: "bearish",
    });

    await runSimPipeline();

    // Verify the prompt included insider context
    const promptCall = buildPromptSpy.mock.calls[0][0];
    expect(promptCall).toContain("Insider Alignment: bearish");
  });
});
```

#### Test 3: Verify Technical Patterns Affect Quality Score

**File:** `src/__tests__/utils/whale-quality-technical.test.ts`

```typescript
describe("Whale Quality with Technical Patterns", () => {
  it("increases score when patterns confirm whale direction", () => {
    const bullishWhale = createMockWhale({
      sentiment: "bullish",
      technicalContext: {
        patterns: [
          { name: "Bull Flag", signal: "bullish", confidence: 0.85 },
          { name: "Ascending Triangle", signal: "bullish", confidence: 0.7 },
        ],
        supportLevels: [150],
        resistanceLevels: [180],
        averageConfidence: 0.775,
      },
    });

    const score = scoreWhaleQuality(bullishWhale);

    // Compare to same whale without technical context
    const noTechWhale = { ...bullishWhale, technicalContext: undefined };
    const noTechScore = scoreWhaleQuality(noTechWhale);

    // Score should be higher with confirming technicals
    expect(score).toBeGreaterThan(noTechScore);

    // Should be at least 10 points higher
    expect(score - noTechScore).toBeGreaterThanOrEqual(10);
  });

  it("decreases score when patterns contradict whale direction", () => {
    const contradictoryWhale = createMockWhale({
      sentiment: "bullish", // Whale is bullish
      technicalContext: {
        patterns: [
          { name: "Head & Shoulders", signal: "bearish", confidence: 0.9 },
          { name: "Bearish Engulfing", signal: "bearish", confidence: 0.75 },
        ],
        supportLevels: [],
        resistanceLevels: [155],
        averageConfidence: 0.825,
      },
    });

    const score = scoreWhaleQuality(contradictoryWhale);
    const noTechWhale = { ...contradictoryWhale, technicalContext: undefined };
    const noTechScore = scoreWhaleQuality(noTechWhale);

    // Score should be lower with contradicting technicals
    expect(score).toBeLessThan(noTechScore);
  });

  it("handles missing technical context gracefully", () => {
    const whale = createMockWhale();
    delete whale.technicalContext;

    const score = scoreWhaleQuality(whale);

    // Should still produce a valid score
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("handles empty patterns array", () => {
    const whale = createMockWhale({
      technicalContext: {
        patterns: [],
        supportLevels: [],
        resistanceLevels: [],
        averageConfidence: 0.5,
      },
    });

    const score = scoreWhaleQuality(whale);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
```

#### Test 4: Verify All Factors Flow to Portfolio Display

**File:** `src/__tests__/api/portfolio-factors.test.ts`

```typescript
describe("Portfolio API Factor Visibility", () => {
  it("includes all signal factors in trade detail response", async () => {
    // Seed test data
    const trade = await seedTradeWithAnalysis({
      ticker: "AMD",
      whaleQuality: 75,
      ivRegime: "elevated",
      insiderAlignment: "bullish",
      compositeConfidence: 0.68,
    });

    // Call portfolio API
    const response = await fetch(`/api/portfolio?view=trade&id=${trade.id}`);
    const data = await response.json();

    // Verify all factors present
    expect(data.whaleQuality).toBe(75);
    expect(data.ivRegime).toBe("elevated");
    expect(data.insiderAlignment).toBe("bullish");
    expect(data.compositeConfidence).toBe(0.68);
    expect(data.confidenceBreakdown).toBeDefined();
    expect(data.confidenceBreakdown.factors).toBeInstanceOf(Array);
    expect(data.confidenceBreakdown.factors.length).toBe(8); // All 8 factors
  });

  it("returns exit price > 0 for closed trades", async () => {
    const trade = await seedClosedTrade({
      ticker: "SPY",
      entryPrice: 5.0,
      exitPrice: 7.5,
    });

    const response = await fetch(`/api/portfolio?view=trade&id=${trade.id}`);
    const data = await response.json();

    expect(data.exitPrice).toBe(7.5);
    expect(data.exitPrice).toBeGreaterThan(0);
    expect(data.pnl).toBeCloseTo(2.5 * 100 * trade.quantity); // (exit - entry) * 100 * qty
  });
});
```

#### Test 5: Verify Model Reference in Pipeline Status

**File:** `src/__tests__/api/pipeline-status-model.test.ts`

```typescript
describe("Pipeline Status Model Info", () => {
  it("returns current model name in status response", async () => {
    // Set test model
    process.env.OPENROUTER_MODEL = "test-model-123";

    const response = await fetch("/api/pipeline-status");
    const data = await response.json();

    expect(data.model).toBeDefined();
    expect(data.model.name).toBe("test-model-123");
    expect(data.model.provider).toBe("OpenRouter");
  });

  it('does not contain "Gemini" anywhere in response', async () => {
    const response = await fetch("/api/pipeline-status");
    const text = await response.text();

    expect(text.toLowerCase()).not.toContain("gemini");
  });
});
```

### Acceptance Criteria

- [ ] Unit test: IV environment blocks inappropriate strategies
- [ ] Unit test: IV environment allows appropriate strategies
- [ ] Unit test: Insider alignment stored with trade
- [ ] Unit test: Insider alignment included in evaluation prompt
- [ ] Unit test: Technical patterns increase quality score when aligned
- [ ] Unit test: Technical patterns decrease quality score when contradicted
- [ ] Unit test: Missing technical context handled gracefully
- [ ] Integration test: All factors visible in portfolio API response
- [ ] Integration test: Exit prices always > 0 for closed trades
- [ ] Integration test: Pipeline status includes model info
- [ ] E2E test: No "Gemini" text on any page

---

## Story 28.3 — Composite Confidence Factor Display

### Implementation Plan

**File:** `src/components/shared/ConfidenceBreakdownPanel.tsx`

```tsx
// Ensure all 8 factors are displayed with proper labels
const FACTOR_LABELS: Record<string, { name: string; description: string }> = {
  geminiCorrelationConf: {
    name: "AI Correlation", // Changed from "Gemini Correlation"
    description:
      "How strongly the AI correlated the whale trade with news events",
  },
  whaleQualityScore: {
    name: "Whale Quality",
    description:
      "Quality of the whale trade based on volume/OI, premium, and technicals",
  },
  technicalAlignment: {
    name: "Technical Alignment", // NEW
    description: "How well technical patterns confirm the trade direction",
  },
  ivRegimeScore: {
    name: "IV Regime",
    description:
      "Whether options are cheap or expensive relative to historical volatility",
  },
  vixRegimeScore: {
    name: "VIX Regime",
    description: "Current market volatility environment",
  },
  earningsRiskPenalty: {
    name: "Earnings Risk",
    description: "Penalty applied if trade expires near an earnings date",
  },
  insiderAlignment: {
    name: "Insider Alignment",
    description: "Recent insider trading sentiment for this ticker",
  },
  sectorMomentum: {
    name: "Sector Momentum",
    description: "Relative performance of the ticker's sector",
  },
};
```

### Acceptance Criteria

- [ ] All 8 factors displayed in confidence breakdown panel
- [ ] "AI Correlation" label replaces "Gemini Correlation"
- [ ] "Technical Alignment" factor included with description
- [ ] Each factor has tooltip explaining its meaning
- [ ] Factor colors: green (≥0.6), amber (≥0.4), red (<0.4)
- [ ] Unit test: all 8 factors render correctly

---

## Dependencies & Sequencing

```
Story 28.1 (Model References) ──→ Story 28.2 (Validation Tests)
                                       │
                                       └──→ Story 28.3 (Factor Display)
```

## Suggested Execution Order

| Phase        | Stories | Notes                                       |
| ------------ | ------- | ------------------------------------------- |
| **Sprint 1** | 28.1    | Replace all "Gemini" references — quick win |
| **Sprint 2** | 28.2    | Create comprehensive validation tests       |
| **Sprint 3** | 28.3    | Update confidence breakdown display         |

## Risk & Mitigation

| Risk                        | Impact                  | Mitigation                                            |
| --------------------------- | ----------------------- | ----------------------------------------------------- |
| Missed "Gemini" references  | Confusion persists      | Global grep verification + E2E test catches all       |
| Validation tests too strict | Block legitimate trades | Start with warning-only mode, tighten after observing |
| Factor display overwhelming | Users ignore breakdown  | Use progressive disclosure (collapsed by default)     |

---

## Test Plan Summary

### Unit Tests (Story 28.2)

- IV environment strategy matching
- Insider alignment storage and prompt inclusion
- Technical pattern quality score impact
- Missing data graceful handling

### Integration Tests (Story 28.2)

- Portfolio API returns all factors
- Pipeline status includes model info
- Exit prices always valid

### E2E Tests (Story 28.1)

- No "Gemini" visible on any page
- Confidence breakdown shows all 8 factors
- Model info visible in pipeline status

### Regression Tests

- Existing 234 tests still pass
- Pipeline cycles complete successfully
- Portfolio page renders without errors
