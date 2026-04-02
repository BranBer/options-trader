/**
 * Benchmark Replay Harness
 *
 * Runs the current algorithm and baseline strategies over the same
 * historical periods and compares results consistently.
 */

import {
  runBenchmark,
  runAllBenchmarks,
  formatBenchmarkReport,
  BASELINE_STRATEGIES,
} from "./benchmark-harness";
import type { BenchmarkInput, BenchmarkResult } from "./benchmark-harness";

export interface ReplayTradeInput {
  tradeId: number;
  ticker: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  direction: "bullish" | "bearish" | "neutral";
  pnl: number;
  pnlPct: number;
  qualityScore?: number | null;
  ivRegime?: "elevated" | "normal" | "low";
  technicalAlignment?: number;
  compositeConfidence?: number;
  premium?: number;
}

export interface ReplayResult {
  current: BenchmarkResult;
  baselines: BenchmarkResult[];
  report: string;
  comparison: {
    currentVsBestBaseline: {
      winRateDiff: number;
      pnlDiff: number;
      sharpeDiff: number;
    };
  };
}

export function runReplayHarness(trades: ReplayTradeInput[]): ReplayResult {
  const benchmarkInputs: BenchmarkInput[] = trades.map((t) => ({
    tradeId: t.tradeId,
    ticker: t.ticker,
    entryDate: t.entryDate,
    exitDate: t.exitDate,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    direction: t.direction,
    pnl: t.pnl,
    pnlPct: t.pnlPct,
    qualityScore: t.qualityScore,
    ivRegime: t.ivRegime,
    technicalAlignment: t.technicalAlignment,
    compositeConfidence: t.compositeConfidence,
    premium: t.premium,
  }));

  // Run current algorithm (all trades)
  const currentConfig = {
    name: "Current Algorithm",
    description: "The current trading algorithm with all filters applied.",
    shouldTrade: () => true,
  };
  const current = runBenchmark(currentConfig, benchmarkInputs);

  // Run all baseline strategies
  const baselines = runAllBenchmarks(benchmarkInputs);

  // Find best baseline by Sharpe ratio
  const bestBaseline = baselines.reduce((best, b) =>
    b.metrics.sharpeRatio > best.metrics.sharpeRatio ? b : best,
  );

  // Generate report
  const allResults = [current, ...baselines];
  const report = formatBenchmarkReport(allResults);

  // Comparison
  const comparison = {
    currentVsBestBaseline: {
      winRateDiff: current.metrics.winRate - bestBaseline.metrics.winRate,
      pnlDiff: current.metrics.totalPnlPct - bestBaseline.metrics.totalPnlPct,
      sharpeDiff:
        current.metrics.sharpeRatio - bestBaseline.metrics.sharpeRatio,
    },
  };

  return { current, baselines, report, comparison };
}
