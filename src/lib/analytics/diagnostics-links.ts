import type {
  AlertDiagnosticsReasonCluster,
  AttributionAlertCorrelation,
  AttributionDecisionTrace,
  AttributionMissedOpportunity,
} from "@/types/analytics";

function buildDiagnosticsHref(
  params: Record<string, string | number | null | undefined>,
) {
  const searchParams = new URLSearchParams();
  searchParams.set("tab", "diagnostics");

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    searchParams.set(key, String(value));
  }

  return `/portfolio?${searchParams.toString()}`;
}

function mapMissReasonToReasonCluster(
  missReason: string | null | undefined,
): AlertDiagnosticsReasonCluster | null {
  switch (missReason) {
    case "pipeline_not_run":
    case "analysis_not_completed":
      return "pipeline_gap";
    case "missing_market_data":
      return "missing_market_data";
    case "confidence_too_low":
      return "confidence_threshold";
    case "portfolio_concentration":
      return "portfolio_concentration";
    case "0dte_rejected":
    case "outside_trade_window":
      return "same_day_blocked";
    default:
      return null;
  }
}

function mapCorrelationToReasonCluster(
  correlation: AttributionAlertCorrelation,
): AlertDiagnosticsReasonCluster | null {
  if (!correlation.evaluatedAt) {
    return "pipeline_gap";
  }

  const reason = correlation.rejectionReason?.toLowerCase() ?? "";
  const gate = correlation.rejectionGate?.toLowerCase() ?? "";

  if (reason.includes("market data") || gate === "market_data") {
    return "missing_market_data";
  }
  if (reason.includes("confidence") || gate === "llm_eval") {
    return "confidence_threshold";
  }
  if (reason.includes("concentration") || gate === "concentration") {
    return "portfolio_concentration";
  }
  if (
    reason.includes("0dte") ||
    reason.includes("same-day") ||
    reason.includes("theta risk") ||
    reason.includes("outside trade window")
  ) {
    return "same_day_blocked";
  }

  return null;
}

export function getDiagnosticsHrefForMissedOpportunity(
  missed: AttributionMissedOpportunity,
): string {
  const reasonCluster = mapMissReasonToReasonCluster(missed.missReason);

  return buildDiagnosticsHref({
    ticker: missed.ticker,
    outcome:
      missed.missReason === "pipeline_not_run" ||
      missed.missReason === "analysis_not_completed"
        ? "not_evaluated"
        : "rejected",
    reasonCluster,
    minQuality: missed.qualityScore,
  });
}

export function getDiagnosticsHrefForCorrelation(
  correlation: AttributionAlertCorrelation,
): string {
  const outcome =
    correlation.tradeId != null
      ? "entered"
      : correlation.evaluatedAt
        ? "rejected"
        : "not_evaluated";

  return buildDiagnosticsHref({
    ticker: correlation.ticker,
    outcome,
    reasonCluster:
      outcome === "entered" ? null : mapCorrelationToReasonCluster(correlation),
    minQuality: correlation.qualityScore,
  });
}

export function getDiagnosticsHrefForDecisionTrace(
  trace: AttributionDecisionTrace,
): string {
  return buildDiagnosticsHref({
    ticker: trace.ticker,
    outcome: trace.outcome,
  });
}

export function getDiagnosticsHrefForPipelineGaps(): string {
  return buildDiagnosticsHref({
    outcome: "not_evaluated",
    reasonCluster: "pipeline_gap",
  });
}
