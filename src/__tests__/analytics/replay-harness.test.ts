import { describe, expect, it } from "vitest";
import { runReplayHarness } from "@/lib/analytics/replay-harness";
import type { ReplayTradeInput } from "@/lib/analytics/replay-harness";

function createTrade(overrides?: Partial<ReplayTradeInput>): ReplayTradeInput {
  return {
    tradeId: 1,
    ticker: "AAPL",
    entryDate: "2026-03-01",
    exitDate: "2026-03-15",
    entryPrice: 180,
    exitPrice: 185,
    direction: "bullish",
    pnl: 5,
    pnlPct: 5,
    qualityScore: 75,
    ivRegime: "normal",
    technicalAlignment: 0.7,
    compositeConfidence: 0.75,
    ...overrides,
  };
}

describe("runReplayHarness", () => {
  it("runs current algorithm and all baselines", () => {
    const trades = [
      createTrade({ qualityScore: 80, pnlPct: 10 }),
      createTrade({ qualityScore: 70, pnlPct: -3 }),
      createTrade({ qualityScore: 60, pnlPct: 8 }),
    ];

    const result = runReplayHarness(trades);

    expect(result.current.config.name).toBe("Current Algorithm");
    expect(result.baselines.length).toBeGreaterThan(0);
    expect(result.report).toContain("Benchmark Comparison Report");
  });

  it("computes comparison against best baseline", () => {
    const trades = [
      createTrade({ qualityScore: 80, pnlPct: 10 }),
      createTrade({ qualityScore: 75, pnlPct: -2 }),
    ];

    const result = runReplayHarness(trades);

    expect(result.comparison.currentVsBestBaseline).toBeDefined();
    expect(typeof result.comparison.currentVsBestBaseline.winRateDiff).toBe(
      "number",
    );
    expect(typeof result.comparison.currentVsBestBaseline.pnlDiff).toBe(
      "number",
    );
    expect(typeof result.comparison.currentVsBestBaseline.sharpeDiff).toBe(
      "number",
    );
  });

  it("handles empty trade list", () => {
    const result = runReplayHarness([]);

    expect(result.current.metrics.totalTrades).toBe(0);
    expect(result.baselines.length).toBeGreaterThan(0);
  });
});
