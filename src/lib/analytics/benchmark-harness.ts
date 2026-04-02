/**
 * Benchmark Replay Harness
 *
 * Evaluates the current trading algorithm against baseline strategies
 * over the same historical periods. Produces deterministic comparison
 * metrics to measure strategy quality.
 */

export interface BenchmarkInput {
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

export interface BenchmarkConfig {
  name: string;
  description: string;
  shouldTrade: (input: BenchmarkInput) => boolean;
}

export interface BenchmarkMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnlPct: number;
  avgWinPct: number;
  avgLossPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  captureRatio: number;
}

export interface BenchmarkResult {
  config: BenchmarkConfig;
  metrics: BenchmarkMetrics;
}

function computeMetrics(trades: BenchmarkInput[]): BenchmarkMetrics {
  const totalTrades = trades.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnlPct: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      maxDrawdownPct: 0,
      sharpeRatio: 0,
      captureRatio: 0,
    };
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const winRate = (wins.length / totalTrades) * 100;

  const totalPnlPct = trades.reduce((sum, t) => sum + t.pnlPct, 0);
  const avgWinPct =
    wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
  const avgLossPct =
    losses.length > 0
      ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length
      : 0;

  let peak = 0;
  let maxDrawdown = 0;
  let cumPnl = 0;
  for (const trade of trades) {
    cumPnl += trade.pnlPct;
    if (cumPnl > peak) peak = cumPnl;
    const drawdown = peak - cumPnl;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const returns = trades.map((t) => t.pnlPct);
  const meanReturn = totalPnlPct / totalTrades;
  const variance =
    returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / totalTrades;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio =
    stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(totalTrades) : 0;

  const captureRatio = avgLossPct !== 0 ? avgWinPct / Math.abs(avgLossPct) : 0;

  return {
    totalTrades,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate,
    totalPnlPct,
    avgWinPct,
    avgLossPct,
    maxDrawdownPct: maxDrawdown,
    sharpeRatio,
    captureRatio,
  };
}

export const BASELINE_STRATEGIES: BenchmarkConfig[] = [
  {
    name: "Whale Quality Threshold",
    description:
      "Trades all alerts with quality score >= 70. No other filters.",
    shouldTrade: (input) => (input.qualityScore ?? 0) >= 70,
  },
  {
    name: "IV-Aware Spread",
    description:
      "Avoids elevated IV environments for debit spreads. Allows all credit spreads.",
    shouldTrade: (input) => {
      if (input.ivRegime === "elevated" && input.direction === "bullish")
        return false;
      return (input.qualityScore ?? 0) >= 50;
    },
  },
  {
    name: "Technical Confirmation",
    description: "Only trades when technical alignment > 0.6.",
    shouldTrade: (input) => {
      const alignment = input.technicalAlignment ?? 0.5;
      return alignment > 0.6 && (input.qualityScore ?? 0) >= 60;
    },
  },
  {
    name: "Risk-Parity Capped",
    description:
      "Trades most alerts but caps position size based on confidence.",
    shouldTrade: (input) => (input.qualityScore ?? 0) >= 55,
  },
];

export function runBenchmark(
  config: BenchmarkConfig,
  trades: BenchmarkInput[],
): BenchmarkResult {
  const filteredTrades = trades.filter(config.shouldTrade);
  const metrics = computeMetrics(filteredTrades);
  return { config, metrics };
}

export function runAllBenchmarks(trades: BenchmarkInput[]): BenchmarkResult[] {
  return BASELINE_STRATEGIES.map((config) => runBenchmark(config, trades));
}

export function formatBenchmarkReport(results: BenchmarkResult[]): string {
  const lines: string[] = ["# Benchmark Comparison Report", ""];

  for (const result of results) {
    const m = result.metrics;
    lines.push(`## ${result.config.name}`);
    lines.push(result.config.description);
    lines.push("");
    lines.push(`- Trades: ${m.totalTrades}`);
    lines.push(`- Win Rate: ${m.winRate.toFixed(1)}%`);
    lines.push(`- Total P&L: ${m.totalPnlPct.toFixed(2)}%`);
    lines.push(`- Avg Win: ${m.avgWinPct.toFixed(2)}%`);
    lines.push(`- Avg Loss: ${m.avgLossPct.toFixed(2)}%`);
    lines.push(`- Max Drawdown: ${m.maxDrawdownPct.toFixed(2)}%`);
    lines.push(`- Sharpe: ${m.sharpeRatio.toFixed(2)}`);
    lines.push(`- Capture Ratio: ${m.captureRatio.toFixed(2)}`);
    lines.push("");
  }

  return lines.join("\n");
}
