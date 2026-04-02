import type { OpportunityMissReason } from "./opportunity-ledger";

export interface FunnelEvaluationRecord {
  ticker: string;
  shouldEnter: boolean;
  rejectionGate: string | null;
  rejectionReason: string | null;
  createdAt: string | null;
}

export interface FunnelMissedRecord {
  ticker: string;
  missReason: OpportunityMissReason | null | undefined;
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

export interface DecisionTrace {
  ticker: string;
  outcome: "entered" | "rejected";
  stage: string;
  reason: string | null;
  timestamp: string | null;
}

export interface AttributionDiagnostics {
  funnel: AttributionFunnel;
  recentDecisions: DecisionTrace[];
}

function mapGateToStage(
  gate: string | null,
): keyof AttributionFunnel["droppedByStage"] {
  switch (gate) {
    case "whale_quality":
      return "scoring";
    case "market_data":
    case "validation":
      return "validation";
    case "iv_environment":
    case "earnings_proximity":
    case "concentration":
      return "riskCheck";
    case "llm_eval":
      return "entryDecision";
    case "position_open":
      return "tradeOpen";
    default:
      return "pipeline";
  }
}

function mapMissReasonToStage(
  missReason: OpportunityMissReason | null | undefined,
): keyof AttributionFunnel["droppedByStage"] {
  switch (missReason) {
    case "quality_too_low":
      return "scoring";
    case "missing_market_data":
    case "0dte_rejected":
    case "outside_trade_window":
      return "validation";
    case "entry_filter_rejected":
    case "portfolio_concentration":
      return "riskCheck";
    case "confidence_too_low":
      return "entryDecision";
    case "position_size_limit":
      return "tradeOpen";
    case "pipeline_not_run":
    case "analysis_not_completed":
    default:
      return "pipeline";
  }
}

function mapGateToTraceLabel(gate: string | null, accepted: boolean): string {
  if (accepted) return "trade entered";

  switch (gate) {
    case "whale_quality":
      return "scoring";
    case "market_data":
      return "market data";
    case "validation":
      return "validation";
    case "iv_environment":
      return "IV environment";
    case "earnings_proximity":
      return "earnings filter";
    case "concentration":
      return "concentration";
    case "llm_eval":
      return "entry decision";
    case "position_open":
      return "trade open";
    default:
      return "pipeline";
  }
}

export function buildAttributionDiagnostics(args: {
  whales: Array<{ qualityScore?: number | null }>;
  evaluations: FunnelEvaluationRecord[];
  missed: FunnelMissedRecord[];
}): AttributionDiagnostics {
  const { whales, evaluations, missed } = args;

  const droppedByStage: AttributionFunnel["droppedByStage"] = {
    scoring: 0,
    validation: 0,
    riskCheck: 0,
    entryDecision: 0,
    tradeOpen: 0,
    pipeline: 0,
  };

  for (const evaluation of evaluations) {
    if (evaluation.shouldEnter && !evaluation.rejectionGate) continue;
    const stage = mapGateToStage(evaluation.rejectionGate);
    droppedByStage[stage] += 1;
  }

  for (const missedRecord of missed) {
    const stage = mapMissReasonToStage(missedRecord.missReason);
    droppedByStage[stage] += 1;
  }

  const llmAccepted = evaluations.filter(
    (evaluation) => evaluation.shouldEnter,
  ).length;
  const entered = evaluations.filter(
    (evaluation) => evaluation.shouldEnter && !evaluation.rejectionGate,
  ).length;

  return {
    funnel: {
      detected: whales.length,
      qualityPassed: whales.filter((whale) => (whale.qualityScore ?? 0) >= 50)
        .length,
      evaluated: evaluations.length,
      llmAccepted,
      entered,
      droppedByStage,
    },
    recentDecisions: evaluations.slice(0, 10).map((evaluation) => ({
      ticker: evaluation.ticker,
      outcome:
        evaluation.shouldEnter && !evaluation.rejectionGate
          ? "entered"
          : "rejected",
      stage: mapGateToTraceLabel(
        evaluation.rejectionGate,
        evaluation.shouldEnter && !evaluation.rejectionGate,
      ),
      reason: evaluation.rejectionReason,
      timestamp: evaluation.createdAt,
    })),
  };
}
