import type { WhaleAlert } from "@/types/whale";
import type { EvaluationRecord, TradeRecord } from "./attribution-engine";

export type AlertTraceStage =
  | "detection"
  | "analysis"
  | "evaluation"
  | "validation"
  | "entry"
  | "trade_execution";

export type AlertTraceStageStatus =
  | "completed"
  | "passed"
  | "blocked"
  | "missing"
  | "not_applicable";

export type AlertTraceOutcome = "entered" | "rejected" | "not_evaluated";

export type AlertDiagnosticsReasonCluster =
  | "same_day_blocked"
  | "missing_market_data"
  | "pipeline_gap"
  | "confidence_threshold"
  | "portfolio_concentration";

export interface AlertTraceStageEvent {
  stage: AlertTraceStage;
  status: AlertTraceStageStatus;
  timestamp: string | null;
  reason: string | null;
}

export interface AlertDecisionTrace {
  alertId: number | null;
  ticker: string;
  detectedAt: string;
  qualityScore: number | null | undefined;
  finalOutcome: AlertTraceOutcome;
  reasonCluster: AlertDiagnosticsReasonCluster | null;
  primaryReason: string | null;
  sourceRefs: {
    primaryWhaleId: number | null;
    whaleIds: number[];
    sourceAnalysisId: number | null;
    tradeId: number | null;
  };
  stageEvents: AlertTraceStageEvent[];
}

export interface AlertDiagnosticsSummary {
  total: number;
  byOutcome: Record<AlertTraceOutcome, number>;
  topReasons: Array<{ reason: string; count: number }>;
  dropOffByStage: Record<AlertTraceStage, number>;
}

export interface DerivedPipelineHealth {
  lastRefreshAt: string | null;
  minutesSinceRefresh: number | null;
  isStale: boolean;
  status: "healthy" | "stale" | "running" | "never_run";
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeReason(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isValidationGate(gate: string | null): boolean {
  return [
    "market_data",
    "validation",
    "iv_environment",
    "earnings_proximity",
    "concentration",
  ].includes(gate ?? "");
}

function deriveNoEvaluationReason(args: {
  lastRefreshAt?: string | null;
  evaluationsAvailable: number;
}): string {
  const { lastRefreshAt, evaluationsAvailable } = args;

  if (!lastRefreshAt) return "pipeline never ran for this window";

  const minutesSinceRefresh = Math.round(
    (Date.now() - Date.parse(lastRefreshAt)) / 60000,
  );
  if (!Number.isNaN(minutesSinceRefresh) && minutesSinceRefresh > 30) {
    return "pipeline stale before alert could be evaluated";
  }

  if (evaluationsAvailable === 0) {
    return "analysis pipeline did not produce evaluations for this window";
  }

  return "analysis not completed for this alert";
}

function findNearestEvaluation(
  whale: WhaleAlert & { id?: number | null },
  evaluations: EvaluationRecord[],
): EvaluationRecord | null {
  const whaleId = whale.id;

  if (whaleId != null) {
    const exact = evaluations.find(
      (evaluation) =>
        evaluation.primaryWhaleId === whaleId ||
        (evaluation.whaleIds?.includes(whaleId) ?? false),
    );
    if (exact) return exact;
  }

  const whaleTs = parseTimestamp(whale.detectedAt);
  const tickerMatches = evaluations.filter((evaluation) => {
    if (evaluation.ticker !== whale.ticker) return false;
    const evaluationTs = parseTimestamp(evaluation.createdAt);
    if (whaleTs == null || evaluationTs == null) return true;

    return (
      evaluationTs >= whaleTs - 5 * 60 * 1000 &&
      evaluationTs <= whaleTs + 24 * 60 * 60 * 1000
    );
  });

  if (tickerMatches.length === 0) return null;
  if (whaleTs == null) return tickerMatches[0];

  return tickerMatches.sort((left, right) => {
    const leftTs = parseTimestamp(left.createdAt) ?? whaleTs;
    const rightTs = parseTimestamp(right.createdAt) ?? whaleTs;
    return Math.abs(leftTs - whaleTs) - Math.abs(rightTs - whaleTs);
  })[0];
}

function findMatchedTrade(
  whale: WhaleAlert & { id?: number | null },
  trades: TradeRecord[],
): TradeRecord | null {
  if (whale.id != null) {
    const exact = trades.find((trade) => trade.sourceWhaleId === whale.id);
    if (exact) return exact;
  }

  return (
    trades.find(
      (trade) =>
        trade.ticker === whale.ticker &&
        (trade.strike == null || trade.strike === whale.strike) &&
        (trade.expiry == null || trade.expiry === whale.expiry),
    ) ?? null
  );
}

function derivePipelineHealth(
  lastRefreshAt: string | null,
): DerivedPipelineHealth {
  const minutesSinceRefresh = lastRefreshAt
    ? Math.round((Date.now() - Date.parse(lastRefreshAt)) / 60000)
    : null;
  const isStale = minutesSinceRefresh != null ? minutesSinceRefresh > 30 : true;

  return {
    lastRefreshAt,
    minutesSinceRefresh,
    isStale,
    status: !lastRefreshAt ? "never_run" : isStale ? "stale" : "healthy",
  };
}

function buildStageEvents(args: {
  whale: WhaleAlert & { id?: number | null };
  evaluation: EvaluationRecord | null;
  trade: TradeRecord | null;
  primaryReason: string | null;
}): AlertTraceStageEvent[] {
  const { whale, evaluation, trade, primaryReason } = args;
  const gate = evaluation?.rejectionGate ?? null;

  return [
    {
      stage: "detection",
      status: "completed",
      timestamp: whale.detectedAt,
      reason: null,
    },
    {
      stage: "analysis",
      status:
        evaluation?.sourceAnalysisId != null || trade?.sourceAnalysisId != null
          ? "completed"
          : evaluation != null
            ? "completed"
            : "missing",
      timestamp: evaluation?.createdAt ?? trade?.entryDate ?? null,
      reason: evaluation || trade ? null : primaryReason,
    },
    {
      stage: "evaluation",
      status: evaluation ? "completed" : "missing",
      timestamp: evaluation?.createdAt ?? null,
      reason: evaluation ? null : primaryReason,
    },
    {
      stage: "validation",
      status: !evaluation
        ? "missing"
        : isValidationGate(gate)
          ? "blocked"
          : "passed",
      timestamp: evaluation?.createdAt ?? null,
      reason: isValidationGate(gate)
        ? normalizeReason(evaluation?.rejectionReason)
        : null,
    },
    {
      stage: "entry",
      status: !evaluation
        ? "missing"
        : gate === "llm_eval" || evaluation.shouldEnter === false
          ? "blocked"
          : "passed",
      timestamp: evaluation?.createdAt ?? null,
      reason:
        gate === "llm_eval" || evaluation?.shouldEnter === false
          ? (normalizeReason(evaluation?.rejectionReason) ??
            "entry decision rejected candidate")
          : null,
    },
    {
      stage: "trade_execution",
      status: trade
        ? "completed"
        : gate === "position_open"
          ? "blocked"
          : evaluation
            ? "not_applicable"
            : "missing",
      timestamp: trade?.entryDate ?? evaluation?.createdAt ?? null,
      reason: trade
        ? trade.status === "open"
          ? "trade opened"
          : "trade opened and later closed"
        : gate === "position_open"
          ? (normalizeReason(evaluation?.rejectionReason) ??
            "position could not be opened")
          : !evaluation
            ? primaryReason
            : null,
    },
  ];
}

function deriveDropOffStage(trace: AlertDecisionTrace): AlertTraceStage {
  const blockedEvent = trace.stageEvents.find(
    (event) => event.status === "blocked",
  );
  if (blockedEvent) return blockedEvent.stage;

  const missingEvent = trace.stageEvents.find(
    (event) =>
      event.status === "missing" &&
      event.stage !== "detection" &&
      event.stage !== "trade_execution",
  );
  return missingEvent?.stage ?? "analysis";
}

export function buildAlertDecisionTraces(args: {
  whales: Array<WhaleAlert & { id?: number | null }>;
  evaluations: EvaluationRecord[];
  trades: TradeRecord[];
  lastRefreshAt?: string | null;
}): AlertDecisionTrace[] {
  const { whales, evaluations, trades, lastRefreshAt = null } = args;

  return whales.map((whale) => {
    const evaluation = findNearestEvaluation(whale, evaluations);
    const trade = findMatchedTrade(whale, trades);

    const finalOutcome: AlertTraceOutcome = trade
      ? "entered"
      : evaluation
        ? "rejected"
        : "not_evaluated";

    const primaryReason = trade
      ? null
      : (normalizeReason(evaluation?.rejectionReason) ??
        deriveNoEvaluationReason({
          lastRefreshAt,
          evaluationsAvailable: evaluations.length,
        }));

    const trace: AlertDecisionTrace = {
      alertId: whale.id ?? null,
      ticker: whale.ticker,
      detectedAt: whale.detectedAt,
      qualityScore: whale.qualityScore,
      finalOutcome,
      reasonCluster: null,
      primaryReason,
      sourceRefs: {
        primaryWhaleId: evaluation?.primaryWhaleId ?? whale.id ?? null,
        whaleIds: evaluation?.whaleIds ?? (whale.id != null ? [whale.id] : []),
        sourceAnalysisId:
          evaluation?.sourceAnalysisId ?? trade?.sourceAnalysisId ?? null,
        tradeId: trade?.id ?? null,
      },
      stageEvents: buildStageEvents({
        whale,
        evaluation,
        trade,
        primaryReason,
      }),
    };

    return {
      ...trace,
      reasonCluster: classifyAlertReasonCluster(trace),
    };
  });
}

export function summarizeAlertDecisionTraces(
  traces: AlertDecisionTrace[],
): AlertDiagnosticsSummary {
  const byOutcome: Record<AlertTraceOutcome, number> = {
    entered: 0,
    rejected: 0,
    not_evaluated: 0,
  };
  const dropOffByStage: Record<AlertTraceStage, number> = {
    detection: 0,
    analysis: 0,
    evaluation: 0,
    validation: 0,
    entry: 0,
    trade_execution: 0,
  };
  const reasonCounts = new Map<string, number>();

  for (const trace of traces) {
    byOutcome[trace.finalOutcome] += 1;

    if (trace.finalOutcome !== "entered") {
      dropOffByStage[deriveDropOffStage(trace)] += 1;
    }

    if (trace.primaryReason) {
      reasonCounts.set(
        trace.primaryReason,
        (reasonCounts.get(trace.primaryReason) ?? 0) + 1,
      );
    }
  }

  return {
    total: traces.length,
    byOutcome,
    topReasons: [...reasonCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([reason, count]) => ({ reason, count })),
    dropOffByStage,
  };
}

export function classifyAlertReasonCluster(
  trace: AlertDecisionTrace,
): AlertDiagnosticsReasonCluster | null {
  const reason = trace.primaryReason?.toLowerCase() ?? "";

  if (
    trace.finalOutcome === "not_evaluated" ||
    reason.includes("pipeline") ||
    reason.includes("analysis not completed") ||
    reason.includes("did not produce evaluations") ||
    reason.includes("stale before alert")
  ) {
    return "pipeline_gap";
  }

  if (reason.includes("market data")) {
    return "missing_market_data";
  }

  if (
    reason.includes("0dte") ||
    reason.includes("same-day") ||
    reason.includes("today") ||
    reason.includes("trading day") ||
    reason.includes("theta risk")
  ) {
    return "same_day_blocked";
  }

  if (reason.includes("concentration")) {
    return "portfolio_concentration";
  }

  if (reason.includes("confidence")) {
    return "confidence_threshold";
  }

  return null;
}

export function matchesAlertReasonCluster(
  trace: AlertDecisionTrace,
  cluster: AlertDiagnosticsReasonCluster | null,
): boolean {
  if (!cluster) return true;
  return (trace.reasonCluster ?? classifyAlertReasonCluster(trace)) === cluster;
}

export function buildAlertDiagnostics(args: {
  whales: Array<WhaleAlert & { id?: number | null }>;
  evaluations: EvaluationRecord[];
  trades: TradeRecord[];
  lastRefreshAt?: string | null;
}): {
  traces: AlertDecisionTrace[];
  summary: AlertDiagnosticsSummary;
  pipelineHealth: DerivedPipelineHealth;
} {
  const traces = buildAlertDecisionTraces(args);
  return {
    traces,
    summary: summarizeAlertDecisionTraces(traces),
    pipelineHealth: derivePipelineHealth(args.lastRefreshAt ?? null),
  };
}
