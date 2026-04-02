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

export interface AttributionFunnel {
  detected: number;
  qualityPassed: number;
  evaluated: number;
  llmAccepted: number;
  entered: number;
  droppedByStage: {
    scoring: number;
    validation: number;
    riskCheck: number;
    entryDecision: number;
    tradeOpen: number;
    pipeline: number;
  };
}

export interface AttributionDecisionTrace {
  ticker: string;
  outcome: "entered" | "rejected";
  stage: string;
  reason: string | null;
  timestamp: string | null;
}

export interface AttributionAlertCorrelation {
  ticker: string;
  detectedAt: string;
  qualityScore: number | null | undefined;
  evaluatedAt: string | null;
  shouldEnter: boolean | null;
  rejectionGate: string | null;
  rejectionReason: string | null;
  tradeId: number | null;
  tradeStatus: "open" | "closed" | null;
}

export interface AttributionResponse {
  captureRate: number;
  totalCandidates: number;
  capturedCount: number;
  missedCount: number;
  captured: AttributionCapturedOpportunity[];
  missed: AttributionMissedOpportunity[];
  diagnostics: {
    funnel: AttributionFunnel;
    recentDecisions: AttributionDecisionTrace[];
    correlations: AttributionAlertCorrelation[];
  };
  summary: string;
}

// ============================================================
// Alert Diagnostics (Epic 32)
// ============================================================

export type AlertDiagnosticsOutcome = "entered" | "rejected" | "not_evaluated";

export type AlertDiagnosticsReasonCluster =
  | "same_day_blocked"
  | "missing_market_data"
  | "pipeline_gap"
  | "confidence_threshold"
  | "portfolio_concentration";

export type AlertDiagnosticsStage =
  | "detection"
  | "analysis"
  | "evaluation"
  | "validation"
  | "entry"
  | "trade_execution";

export type AlertDiagnosticsStageStatus =
  | "completed"
  | "passed"
  | "blocked"
  | "missing"
  | "not_applicable";

export interface AlertDiagnosticsStageEvent {
  stage: AlertDiagnosticsStage;
  status: AlertDiagnosticsStageStatus;
  timestamp: string | null;
  reason: string | null;
}

export interface AlertDecisionTrace {
  alertId: number | null;
  ticker: string;
  detectedAt: string;
  qualityScore: number | null | undefined;
  finalOutcome: AlertDiagnosticsOutcome;
  reasonCluster: AlertDiagnosticsReasonCluster | null;
  primaryReason: string | null;
  sourceRefs: {
    primaryWhaleId: number | null;
    whaleIds: number[];
    sourceAnalysisId: number | null;
    tradeId: number | null;
  };
  stageEvents: AlertDiagnosticsStageEvent[];
}

export interface AlertDiagnosticsSummary {
  total: number;
  byOutcome: Record<AlertDiagnosticsOutcome, number>;
  topReasons: Array<{ reason: string; count: number }>;
  dropOffByStage: Record<AlertDiagnosticsStage, number>;
}

export interface DiagnosticsPipelineHealth {
  lastRefreshAt: string | null;
  minutesSinceRefresh: number | null;
  isStale: boolean;
  status: "healthy" | "stale" | "running" | "never_run";
}

export interface PortfolioDiagnosticsFilters {
  ticker: string | null;
  outcome: AlertDiagnosticsOutcome | null;
  reasonCluster: AlertDiagnosticsReasonCluster | null;
  minQuality: number | null;
  startDate: string | null;
  endDate: string | null;
}

export interface PortfolioDiagnosticsPageInfo {
  limit: number;
  nextCursor: number | null;
  hasMore: boolean;
}

export interface PortfolioDiagnosticsPayload {
  traces: AlertDecisionTrace[];
  summary: AlertDiagnosticsSummary;
  pipelineHealth: DiagnosticsPipelineHealth;
  pageInfo: PortfolioDiagnosticsPageInfo;
  filters: PortfolioDiagnosticsFilters;
}

export interface PortfolioDiagnosticsResponse {
  diagnostics: PortfolioDiagnosticsPayload;
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
