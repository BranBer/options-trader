/**
 * Analytics API Response Types
 *
 * Strictly typed interfaces for attribution, postmortem, and benchmark API responses.
 */

// ============================================================
// Attribution (Missed Opportunities)
// ============================================================

export interface AttributionMissedOpportunity {
  ticker: string;
  sentiment: string;
  premium: number;
  qualityScore: number | null;
  missReason: string;
  detectedAt: string;
}

export interface AttributionCapturedOpportunity {
  ticker: string;
  sentiment: string;
  premium: number;
  qualityScore: number | null;
  realizedReturnPct: number;
  detectedAt: string;
}

export interface AttributionResponse {
  captureRate: number;
  totalCandidates: number;
  capturedCount: number;
  missedCount: number;
  captured: AttributionCapturedOpportunity[];
  missed: AttributionMissedOpportunity[];
  summary: string;
}

// ============================================================
// Postmortem (Bad Trade Analysis)
// ============================================================

export interface PostmortemResult {
  tradeId: number;
  ticker?: string;
  isLosingTrade: boolean;
  isAvoidable: boolean;
  avoidableCategory: string | null;
  riskScore: number;
  explanation: string;
  preTradeWarnings: string[];
}

export interface PostmortemResponse {
  avoidableCount: number;
  unavoidableCount: number;
  results: PostmortemResult[];
  summary: string;
}

// ============================================================
// Benchmark (Algorithm Comparison)
// ============================================================

export interface BenchmarkMetrics {
  totalTrades: number;
  winRate: number;
  totalPnlPct: number;
  avgPnlPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  captureRatio: number;
}

export interface BenchmarkBaseline {
  name: string;
  description: string;
  metrics: BenchmarkMetrics;
}

export interface BenchmarkCurrent {
  name: string;
  metrics: BenchmarkMetrics;
}

export interface BenchmarkComparison {
  currentVsBestBaseline: {
    winRateDiff: number;
    pnlDiff: number;
    sharpeDiff: number;
    bestBaselineName: string;
  };
  currentVsWorstBaseline: {
    winRateDiff: number;
    pnlDiff: number;
    sharpeDiff: number;
    worstBaselineName: string;
  };
}

export interface BenchmarkResponse {
  current: BenchmarkCurrent;
  baselines: BenchmarkBaseline[];
  comparison: BenchmarkComparison;
  report: string;
}
