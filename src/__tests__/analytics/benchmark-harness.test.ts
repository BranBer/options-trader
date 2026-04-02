import { describe, expect, it } from "vitest";
import {
  runBenchmark,
  runAllBenchmarks,
  formatBenchmarkReport,
  BASELINE_STRATEGIES,
} from "@/lib/analytics/benchmark-harness";
import type { BenchmarkInput } from "@/lib/analytics/benchmark-harness";

function createTrade(overrides?: Partial<BenchmarkInput>): BenchmarkInput {
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

describe("runBenchmark", () => {
  it("filters trades based on strategy config", () => {
    const trades = [
      createTrade({ qualityScore: 80, pnlPct: 10 }),
      createTrade({ qualityScore: 60, pnlPct: -5 }),
      createTrade({ qualityScore: 90, pnlPct: 8 }),
    ];

    const result = runBenchmark(BASELINE_STRATEGIES[0], trades);

    expect(result.metrics.totalTrades).toBe(2); // Only quality >= 70
    expect(result.metrics.winningTrades).toBe(2);
    expect(result.metrics.winRate).toBe(100);
  });

  it("returns zero metrics when no trades match", () => {
    const trades = [
      createTrade({ qualityScore: 30 }),
      createTrade({ qualityScore: 40 }),
    ];

    const result = runBenchmark(BASELINE_STRATEGIES[0], trades);

    expect(result.metrics.totalTrades).toBe(0);
    expect(result.metrics.winRate).toBe(0);
  });

  it("computes max drawdown correctly", () => {
    const trades = [
      createTrade({ pnlPct: 10 }),
      createTrade({ pnlPct: -15 }),
      createTrade({ pnlPct: 5 }),
    ];

    const result = runBenchmark(BASELINE_STRATEGIES[3], trades);

    expect(result.metrics.maxDrawdownPct).toBeGreaterThan(0);
  });
});

describe("runAllBenchmarks", () => {
  it("runs all baseline strategies", () => {
    const trades = [
      createTrade({ qualityScore: 80, pnlPct: 5 }),
      createTrade({ qualityScore: 70, pnlPct: -3 }),
      createTrade({ qualityScore: 60, pnlPct: 8 }),
      createTrade({ qualityScore: 50, pnlPct: -2 }),
    ];

    const results = runAllBenchmarks(trades);

    expect(results.length).toBe(BASELINE_STRATEGIES.length);
    results.forEach((r) => {
      expect(r.config.name).toBeTruthy();
      expect(r.metrics.totalTrades).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("formatBenchmarkReport", () => {
  it("generates a markdown report", () => {
    const trades = [
      createTrade({ qualityScore: 80, pnlPct: 5 }),
      createTrade({ qualityScore: 75, pnlPct: -2 }),
    ];

    const results = runAllBenchmarks(trades);
    const report = formatBenchmarkReport(results);

    expect(report).toContain("Benchmark Comparison Report");
    expect(report).toContain("Whale Quality Threshold");
    expect(report).toContain("Win Rate");
    expect(report).toContain("Total P&L");
  });
});
