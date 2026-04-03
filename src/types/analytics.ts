/**
 * Analytics API Response Types
 *
 * Strictly typed interfaces for attribution, postmortem, and benchmark API responses.
 */

import type {
  LearningLineageQuality,
  LearningRecordSummary,
} from "@/types/learning";

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

// ============================================================
// Learning Readiness / Offline Policy Evaluation
// ============================================================

export type LearningReadinessStatus =
  | "not_ready"
  | "limited_offline_tuning"
  | "ready_for_shadow_learning";

export interface LearningReadinessMetrics {
  totalRecords: number;
  enterCount: number;
  rejectCount: number;
  notEvaluatedCount: number;
  computedRewardCount: number;
  pendingRewardCount: number;
  terminalTradeCount: number;
  explicitLineageCount: number;
  backfilledLineageCount: number;
  inferredLineageCount: number;
  incompleteLineageCount: number;
  computedRewardCoveragePct: number;
  lineageCoveragePct: number;
  incompleteLineagePct: number;
  decisionBalanceRatio: number;
}

export interface LearningReadinessThresholds {
  minRecordsForLimited: number;
  minRecordsForShadow: number;
  minComputedRewardCoveragePctForLimited: number;
  minComputedRewardCoveragePctForShadow: number;
  minLineageCoveragePctForLimited: number;
  minLineageCoveragePctForShadow: number;
}

export interface LearningReadinessScorecard {
  status: LearningReadinessStatus;
  score: number;
  summary: string;
  blockers: string[];
  metrics: LearningReadinessMetrics;
  thresholds: LearningReadinessThresholds;
}

export interface LearningInsightsFilters {
  lineageQuality: LearningLineageQuality | null;
  limit: number;
}

export interface LearningReadinessResponse {
  readiness: LearningReadinessScorecard;
  summary: LearningRecordSummary;
  filters: LearningInsightsFilters;
}

export interface LearningPolicyBaselineMetrics {
  selectedCount: number;
  acceptanceRatePct: number;
  computedRewardCount: number;
  avgPrimaryReward: number;
  totalPrimaryReward: number;
  positiveRewardRatePct: number;
  terminalTradeCount: number;
  winRatePct: number;
  avgEnteredPnlPct: number;
}

export interface LearningPolicyBaselineResult {
  name: string;
  description: string;
  metrics: LearningPolicyBaselineMetrics;
}

export interface LearningPolicyBaselineEvaluation {
  corpusSize: number;
  evaluatedRecordCount: number;
  current: LearningPolicyBaselineResult;
  baselines: LearningPolicyBaselineResult[];
  bestBaseline: LearningPolicyBaselineResult | null;
  comparison: {
    currentVsBestBaseline: {
      avgPrimaryRewardDiff: number;
      totalPrimaryRewardDiff: number;
      winRateDiffPct: number;
    } | null;
  };
}

export interface LearningPolicyBaselineResponse {
  policyBaseline: LearningPolicyBaselineEvaluation;
  summary: LearningRecordSummary;
  filters: LearningInsightsFilters;
}

export interface PolicyEvaluationWindow {
  id: "recent_7d" | "recent_30d" | "all";
  label: string;
  startAt: string | null;
  endAt: string | null;
  evaluatedRecordCount: number;
  supported: boolean;
  supportReason: string | null;
  assumptions: string[];
  caveats: string[];
  evaluation: LearningPolicyBaselineEvaluation;
}

export interface LearningPolicyEvaluationHarness {
  referenceTimestamp: string | null;
  totalRecords: number;
  windows: PolicyEvaluationWindow[];
  globalCaveats: string[];
}

export interface LearningPolicyEvaluationResponse {
  policyEvaluation: LearningPolicyEvaluationHarness;
  summary: LearningRecordSummary;
  filters: LearningInsightsFilters;
}

export interface ShadowPolicyFeatureWeight {
  key: string;
  label: string;
  description: string;
  support: number;
  avgReward: number;
  positiveRatePct: number;
  weight: number;
}

export interface ShadowPolicyCalibration {
  holdoutSize: number;
  accuracyPct: number;
  precisionPct: number;
  recallPct: number;
  positivePredictionRatePct: number;
  avgSelectedReward: number;
}

export interface ShadowPolicyModelArtifact {
  policyName: string;
  modelVersion: string;
  trainedAt: string;
  corpusSize: number;
  evaluatedRecordCount: number;
  threshold: number;
  bias: number;
  features: ShadowPolicyFeatureWeight[];
  calibration: ShadowPolicyCalibration;
}

export interface ShadowPolicyDriver {
  label: string;
  contribution: number;
  impact: "positive" | "negative";
}

export type ShadowPolicyFeedbackVerdict =
  | "useful"
  | "misleading"
  | "needs_review";

export interface ShadowPolicyDecisionRecord {
  id: number;
  ticker: string;
  sourceAnalysisId: number | null;
  sourceWhaleId: number | null;
  modelName: string;
  modelVersion: string;
  deploymentMode: string;
  recommendedAction: "enter" | "reject";
  score: number;
  confidence: number;
  expectedValue: number | null;
  reasonSummary: string | null;
  drivers: ShadowPolicyDriver[];
  currentDecision: "enter" | "reject";
  agreedWithCurrent: boolean;
  createdAt: string | null;
  feedback: {
    id: number;
    verdict: ShadowPolicyFeedbackVerdict;
    notes: string | null;
    createdAt: string | null;
  } | null;
}

export interface ShadowPolicyReviewSummary {
  totalLoggedDecisions: number;
  recommendEnterCount: number;
  disagreeCount: number;
  agreementRatePct: number;
  feedbackCount: number;
  usefulCount: number;
  misleadingCount: number;
  needsReviewCount: number;
  lastLoggedAt: string | null;
}

export interface ShadowPolicyReviewResponse {
  shadowPolicy: {
    model: ShadowPolicyModelArtifact;
    summary: ShadowPolicyReviewSummary;
    decisions: ShadowPolicyDecisionRecord[];
  };
  summary: LearningRecordSummary;
  filters: LearningInsightsFilters;
}

export interface PromotionChecklistItem {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "pending";
  detail: string;
}

export interface PromotionGatesReport {
  currentMode: "analysis_only" | "shadow" | "advisory" | "execution_eligible";
  summary: string;
  checklist: PromotionChecklistItem[];
  rollbackTriggers: string[];
  modeDefinitions: Array<{ mode: string; meaning: string }>;
}

export interface PromotionGatesResponse {
  promotionGates: PromotionGatesReport;
  summary: LearningRecordSummary;
  filters: LearningInsightsFilters;
}
