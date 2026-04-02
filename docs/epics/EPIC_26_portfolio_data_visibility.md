# Epic 26: Portfolio Data Visibility & Accuracy

> **Status:** 🔍 IN PROGRESS  
> **Priority:** P0 — Critical (user-reported accuracy issues)  
> **Created:** 2026-04-01  
> **Depends on:** Epic 12 (Sim Portfolio), Epic 9-11 (Signal Enhancements)

## Overview

Users have reported several data visibility issues on the portfolio page:

1. Whale quality scores not showing for correlated trades
2. Implied Volatility Regime not displayed
3. Insider Alignment not displayed
4. Exit prices showing $0.00 even for profitable trades
5. Model reference says "Gemini correlation" instead of generic "AI"

These are primarily data pipeline issues where analysis factors exist in the database but aren't flowing through to the portfolio API responses or UI components.

---

## Story 26.1 — Research: Diagnose Missing Portfolio Data

### Research Goals

1. **Whale Quality Score Propagation**
   - Trace the data flow: `whaleAlerts.qualityScore` → `analyses.whaleAlertId` → `simTrades.sourceWhaleId` → Portfolio API
   - Identify where the chain breaks (API not joining? Type missing? Frontend not rendering?)
   - Check if `simTrades` stores a reference to the source whale alert

2. **IV Regime & Insider Alignment**
   - Verify these fields exist in the `analyses` table (they should from Epic 9-11)
   - Check if the portfolio trade detail API joins the source analysis correctly
   - Confirm the frontend component has props for these fields

3. **Exit Price $0 Bug**
   - Trace `closePosition()` in `sim-engine.ts`
   - Check where `exitPrice` is set: does it use the options chain mid-price?
   - Verify the TSLA trade specifically: was the options chain fetch failing?
   - Check if fallback intrinsic value calculation is working

4. **Model Reference**
   - Global search for "Gemini" in all UI components
   - Check prompt system instructions for model-agnostic language
   - Verify `OPENROUTER_MODEL` is being used in all LLM calls

### Research Steps

```bash
# 1. Check sim_trades schema for whale reference
grep -r "sourceWhaleId\|source_whale" src/types/ src/lib/db/

# 2. Check portfolio API response shape
grep -r "whaleQuality\|qualityScore" src/app/api/portfolio/

# 3. Check TradeDetail component props
grep -r "whaleQuality\|ivRegime\|insiderAlignment" src/components/portfolio/

# 4. Trace exit price calculation
grep -r "exitPrice\|closePosition" src/lib/services/sim-engine.ts

# 5. Find "Gemini" references in UI
grep -r "Gemini" src/components/ --include="*.tsx"
```

### Expected Findings

| Issue                         | Likely Root Cause                            | Fix Location                     |
| ----------------------------- | -------------------------------------------- | -------------------------------- |
| Whale quality not showing     | Portfolio API doesn't JOIN whaleAlerts table | `src/app/api/portfolio/route.ts` |
| IV regime not showing         | Not included in trade detail response        | `src/app/api/portfolio/route.ts` |
| Insider alignment not showing | Not included in trade detail response        | `src/app/api/portfolio/route.ts` |
| Exit price $0                 | Options chain fetch failing silently         | `src/lib/services/sim-engine.ts` |
| Gemini label                  | Hardcoded string in UI components            | `src/components/portfolio/*.tsx` |

### Acceptance Criteria

- [ ] Root cause identified for each of the 5 issues
- [ ] Documented in a findings section below
- [ ] Story 26.2 updated with specific file paths and line numbers for fixes

---

## Story 26.2 — Fix Portfolio API Data Pipeline

### Implementation Plan

_Update after Story 26.1 research findings_

#### Fix 1: Add Whale Quality Score to Portfolio Response

**File:** `src/app/api/portfolio/route.ts`

```typescript
// In the trade detail endpoint, JOIN whale alerts table
const tradeWithDetails = await db
  .select({
    // ... existing fields
    whaleQuality: whaleAlerts.qualityScore,
    whalePremium: whaleAlerts.premium,
    whaleSentiment: whaleAlerts.sentiment,
    whaleDetectedAt: whaleAlerts.detectedAt,
  })
  .from(simTrades)
  .leftJoin(analyses, eq(simTrades.sourceAnalysisId, analyses.id))
  .leftJoin(whaleAlerts, eq(simTrades.sourceWhaleId, whaleAlerts.id))
  .where(eq(simTrades.id, tradeId));
```

#### Fix 2: Include IV Regime & Insider Alignment

**File:** `src/app/api/portfolio/route.ts`

```typescript
// Extend the analysis JOIN to include signal enhancement fields
const analysisDetails = await db
  .select({
    ivRegime: analyses.ivRegime, // From Story 9.1
    insiderAlignment: analyses.insiderAlignment, // From Story 11.2
    compositeConfidence: analyses.confidenceBreakdown,
  })
  .from(analyses)
  .where(eq(analyses.id, trade.sourceAnalysisId));
```

#### Fix 3: Exit Price Calculation

**File:** `src/lib/services/sim-engine.ts`

```typescript
// In closePosition(), ensure exit price is captured
async function closePosition(tradeId: number, reason: string) {
  const trade = await getTradeById(tradeId);

  // Get current option price (primary method)
  let exitPrice: number | null = null;

  try {
    const chain = await fetchOptionsChain(trade.ticker);
    const matchingLeg =
      chain.calls.find(
        (c) => c.strike === trade.strike && c.expiry === trade.expiry,
      ) ||
      chain.puts.find(
        (p) => p.strike === trade.strike && p.expiry === trade.expiry,
      );

    if (matchingLeg) {
      exitPrice = (matchingLeg.bid + matchingLeg.ask) / 2; // Mid-price
    }
  } catch (e) {
    log.warn(`Options chain fetch failed for ${trade.ticker}, using intrinsic`);
  }

  // Fallback: intrinsic value
  if (exitPrice === null) {
    const stockPrice = await getPrice(trade.ticker);
    exitPrice = Math.max(0, stockPrice - trade.strike); // Simplified
  }

  // CRITICAL: Ensure exitPrice is never null/undefined
  await updateTrade(tradeId, {
    exitPrice: exitPrice ?? 0,
    exitDate: new Date(),
    status: "closed",
    exitReason: reason,
    pnl: (exitPrice - trade.entryPrice) * trade.quantity * 100,
    pnlPct: ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100,
  });
}
```

#### Fix 4: Replace "Gemini" References

**Files to update:**

- `src/components/portfolio/PortfolioPage.tsx` — Search for "Gemini"
- `src/components/analysis/AnalysisPage.tsx` — Search for "Gemini"
- `src/lib/prompts/*.ts` — System instructions should say "AI model"

### Acceptance Criteria

- [ ] Portfolio API returns whale quality score for correlated trades
- [ ] Portfolio API returns IV regime for each trade
- [ ] Portfolio API returns insider alignment for each trade
- [ ] Exit prices are never $0.00 (fallback to intrinsic value)
- [ ] All "Gemini" references replaced with "AI model" or "AI"
- [ ] New unit test: API response includes all signal fields

---

## Story 26.3 — Portfolio UI Updates

### Implementation Plan

**File:** `src/components/portfolio/PortfolioPage.tsx`

#### Add Missing Data Fields to Trade Detail

```tsx
<TradeDetail trade={trade}>
  {/* Existing sections */}

  {/* NEW: Whale Correlation Section */}
  <Section title="Source Whale Trade">
    <StatCard label="Whale Quality" value={`${trade.whaleQuality}/100`} />
    <StatCard
      label="Whale Premium"
      value={formatCurrency(trade.whalePremium)}
    />
    <Badge variant={trade.whaleSentiment}>{trade.whaleSentiment}</Badge>
    <p className="text-sm text-muted">
      Detected {formatRelativeTime(trade.whaleDetectedAt)}
    </p>
  </Section>

  {/* NEW: Analysis Factors Section */}
  <Section title="Analysis Factors">
    <StatCard
      label="IV Regime"
      value={trade.ivRegime}
      tooltip="Current Implied Volatility environment: low (<15), normal (15-20), elevated (20-30), high (30+)"
    />
    <StatCard
      label="Insider Alignment"
      value={trade.insiderAlignment}
      tooltip="Recent insider trading sentiment: bullish (net buying), bearish (net selling), neutral"
    />
    <ConfidenceBreakdownPanel breakdown={trade.confidenceBreakdown} />
  </Section>
</TradeDetail>
```

#### Fix Exit Price Display

```tsx
<StatCard
  label="Exit Price"
  value={trade.exitPrice > 0 ? formatCurrency(trade.exitPrice) : "—"}
  className={trade.exitPrice === 0 ? "text-warning" : ""}
/>
```

### Acceptance Criteria

- [ ] Whale quality score visible on portfolio trade cards
- [ ] IV regime displayed with tooltip explanation
- [ ] Insider alignment displayed with tooltip explanation
- [ ] Exit price shows actual value or dash (not $0.00)
- [ ] "Gemini" label replaced with "AI" throughout
- [ ] New test: TradeDetail renders all signal fields correctly

---

## Story 26.4 — Equity Curve & StatCard UI

### Implementation Plan

#### Convert Equity Chart to Line Graph

**File:** `src/components/portfolio/PortfolioPage.tsx`

```tsx
import { createChart, LineSeries } from "lightweight-charts";

function EquityCurveChart({ snapshots }: { snapshots: EquitySnapshot[] }) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current) return;

    const chart = createChart(chartRef.current, {
      layout: { background: { color: "transparent" }, textColor: "#a1a1aa" },
      grid: {
        vertLines: { color: "#27272a" },
        horzLines: { color: "#27272a" },
      },
      width: chartRef.current.clientWidth,
      height: 200,
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#22c55e",
      lineWidth: 2,
    });

    lineSeries.setData(
      snapshots.map((s) => ({
        time: s.date as any,
        value: s.balance,
      })),
    );

    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [snapshots]);

  return <div ref={chartRef} className="w-full h-[200px]" />;
}
```

#### Fix StatCard Spacing

```tsx
// Change from:
<div className="grid grid-cols-4 gap-4">

// To:
<div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
  <StatCard
    className="py-2 px-3"  // Reduced padding
    label="Starting Balance"
    value="$2,000"
  />
```

### Acceptance Criteria

- [ ] Equity curve displays as a line chart
- [ ] StatCard grid uses compact spacing
- [ ] Chart is responsive to container width
- [ ] Line chart color matches theme (green for profit, red for loss)
- [ ] New test: EquityCurveChart renders with valid data

---

## Dependencies & Sequencing

```
Story 26.1 (Research) ──→ Story 26.2 (API Fixes)
                              │
                              ├──→ Story 26.3 (UI Updates)
                              └──→ Story 26.4 (Chart & Layout)
```

## Risk & Mitigation

| Risk                                  | Impact         | Mitigation                         |
| ------------------------------------- | -------------- | ---------------------------------- |
| API changes break existing hooks      | Frontend crash | Run full test suite before merge   |
| Exit price still $0 in edge cases     | Misleading P&L | Add validation test with mock data |
| Chart performance with many snapshots | Slow render    | Limit to 90 days by default        |

---

## Test Plan

### Unit Tests

```typescript
// src/__tests__/api/portfolio.test.ts
describe("Portfolio API", () => {
  it("includes whale quality score in trade detail", async () => {
    const response = await GET("/api/portfolio?view=trade&id=1");
    expect(response.whaleQuality).toBeDefined();
    expect(response.whaleQuality).toBeGreaterThanOrEqual(0);
    expect(response.whaleQuality).toBeLessThanOrEqual(100);
  });

  it("includes IV regime in trade detail", async () => {
    const response = await GET("/api/portfolio?view=trade&id=1");
    expect(response.ivRegime).toMatch(/^(low|normal|elevated|high)$/);
  });

  it("never returns exit price of $0", async () => {
    const response = await GET("/api/portfolio?view=trade&id=1");
    if (response.status === "closed") {
      expect(response.exitPrice).toBeGreaterThan(0);
    }
  });
});
```

### Integration Tests

```typescript
// src/__tests__/services/sim-engine-exit.test.ts
describe("closePosition", () => {
  it("falls back to intrinsic value when options chain fails", async () => {
    // Mock options chain to throw
    vi.spyOn(marketFetcher, "fetchOptionsChain").mockRejectedValue(
      new Error("API down"),
    );

    const trade = await createMockTrade({ entryPrice: 5.0, strike: 100 });
    await closePosition(trade.id, "test");

    const updated = await getTradeById(trade.id);
    expect(updated.exitPrice).toBeGreaterThan(0);
  });
});
```

### E2E Test

```typescript
// src/__tests__/e2e/portfolio-display.spec.ts
test("trade detail shows all signal factors", async ({ page }) => {
  await page.goto("/portfolio");
  await page.click('[data-testid="trade-card-1"]');

  await expect(page.locator("text=Whale Quality")).toBeVisible();
  await expect(page.locator("text=IV Regime")).toBeVisible();
  await expect(page.locator("text=Insider Alignment")).toBeVisible();
});
```
