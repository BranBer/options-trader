import type {
  AlertDecisionTrace,
  AlertDiagnosticsReasonCluster,
  PortfolioDiagnosticsPayload,
} from "@/types/analytics";

export type AlertDiagnosticsClusterKey =
  | AlertDiagnosticsReasonCluster
  | "unclassified";

export interface AlertDiagnosticsClusterSummary {
  cluster: AlertDiagnosticsClusterKey;
  label: string;
  count: number;
}

const REASON_CLUSTER_LABELS: Record<AlertDiagnosticsReasonCluster, string> = {
  same_day_blocked: "Same-Day Blocked",
  missing_market_data: "Missing Market Data",
  pipeline_gap: "Pipeline Gaps",
  confidence_threshold: "Confidence Threshold",
  portfolio_concentration: "Portfolio Concentration",
};

export function getReasonClusterLabel(
  cluster: AlertDiagnosticsReasonCluster | null,
): string {
  if (!cluster) return "Unclassified";
  return REASON_CLUSTER_LABELS[cluster];
}

export function summarizeReasonClusters(
  traces: AlertDecisionTrace[],
): AlertDiagnosticsClusterSummary[] {
  const counts = new Map<AlertDiagnosticsClusterKey, number>();

  for (const trace of traces) {
    if (trace.finalOutcome === "entered") continue;
    const cluster = trace.reasonCluster ?? "unclassified";
    counts.set(cluster, (counts.get(cluster) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([cluster, count]) => ({
      cluster,
      count,
      label:
        cluster === "unclassified"
          ? "Unclassified"
          : getReasonClusterLabel(cluster),
    }));
}

function formatFilterValue(value: string | number | null): string {
  return value == null || value === "" ? "all" : String(value);
}

function formatStageEvent(trace: AlertDecisionTrace): string[] {
  return trace.stageEvents.map((event) => {
    const timestamp = event.timestamp
      ? new Date(event.timestamp).toISOString()
      : "n/a";
    const reason = event.reason ? ` - ${event.reason}` : "";
    return `  - ${event.stage}: ${event.status} @ ${timestamp}${reason}`;
  });
}

export function buildDiagnosticsExportObject(
  payload: PortfolioDiagnosticsPayload,
) {
  return {
    generatedAt: new Date().toISOString(),
    filters: payload.filters,
    pageInfo: payload.pageInfo,
    pipelineHealth: payload.pipelineHealth,
    summary: payload.summary,
    failureClusters: summarizeReasonClusters(payload.traces),
    traces: payload.traces,
  };
}

export function buildDiagnosticsJsonReport(
  payload: PortfolioDiagnosticsPayload,
): string {
  return JSON.stringify(buildDiagnosticsExportObject(payload), null, 2);
}

export function buildDiagnosticsMarkdownReport(
  payload: PortfolioDiagnosticsPayload,
): string {
  const exportData = buildDiagnosticsExportObject(payload);
  const lines = [
    "# Alert Diagnostics Sprint Review",
    "",
    `Generated: ${exportData.generatedAt}`,
    "",
    "## Filters",
    `- Ticker: ${formatFilterValue(payload.filters.ticker)}`,
    `- Outcome: ${formatFilterValue(payload.filters.outcome)}`,
    `- Reason Cluster: ${formatFilterValue(payload.filters.reasonCluster)}`,
    `- Minimum Quality: ${formatFilterValue(payload.filters.minQuality)}`,
    `- Start Date: ${formatFilterValue(payload.filters.startDate)}`,
    `- End Date: ${formatFilterValue(payload.filters.endDate)}`,
    "",
    "## Window Summary",
    `- Total Alerts: ${payload.summary.total}`,
    `- Entered: ${payload.summary.byOutcome.entered}`,
    `- Rejected: ${payload.summary.byOutcome.rejected}`,
    `- Not Evaluated: ${payload.summary.byOutcome.not_evaluated}`,
    `- Pipeline Health: ${payload.pipelineHealth.status}`,
    `- Minutes Since Refresh: ${formatFilterValue(payload.pipelineHealth.minutesSinceRefresh)}`,
    "",
    "## Failure Clusters",
  ];

  if (exportData.failureClusters.length === 0) {
    lines.push("- None in current filtered window");
  } else {
    for (const cluster of exportData.failureClusters) {
      lines.push(`- ${cluster.label}: ${cluster.count}`);
    }
  }

  lines.push("", "## Top Reasons");

  if (payload.summary.topReasons.length === 0) {
    lines.push("- None");
  } else {
    for (const item of payload.summary.topReasons) {
      lines.push(`- ${item.reason}: ${item.count}`);
    }
  }

  lines.push("", "## Traces");

  if (payload.traces.length === 0) {
    lines.push("- No traces matched the current filters");
  } else {
    for (const trace of payload.traces) {
      lines.push(
        `### ${trace.ticker} - ${trace.finalOutcome}`,
        `- Alert ID: ${trace.alertId ?? "n/a"}`,
        `- Detected At: ${trace.detectedAt}`,
        `- Quality Score: ${trace.qualityScore ?? "n/a"}`,
        `- Reason Cluster: ${getReasonClusterLabel(trace.reasonCluster)}`,
        `- Primary Reason: ${trace.primaryReason ?? "n/a"}`,
        `- Whale Ref: ${trace.sourceRefs.primaryWhaleId ?? "n/a"}`,
        `- Analysis Ref: ${trace.sourceRefs.sourceAnalysisId ?? "n/a"}`,
        `- Trade Ref: ${trace.sourceRefs.tradeId ?? "n/a"}`,
        "- Stage Events:",
        ...formatStageEvent(trace),
        "",
      );
    }
  }

  return lines.join("\n");
}
