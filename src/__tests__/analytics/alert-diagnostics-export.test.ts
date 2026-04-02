import { describe, expect, it } from "vitest";
import {
  buildDiagnosticsJsonReport,
  buildDiagnosticsMarkdownReport,
  summarizeReasonClusters,
} from "@/lib/analytics/alert-diagnostics-export";
import type { PortfolioDiagnosticsPayload } from "@/types/analytics";

const payload: PortfolioDiagnosticsPayload = {
  traces: [
    {
      alertId: 101,
      ticker: "NVDA",
      detectedAt: "2026-04-02T14:00:00.000Z",
      qualityScore: 82,
      finalOutcome: "rejected",
      reasonCluster: "missing_market_data",
      primaryReason: "Missing market data for options chain",
      sourceRefs: {
        primaryWhaleId: 101,
        whaleIds: [101],
        sourceAnalysisId: 900,
        tradeId: null,
      },
      stageEvents: [
        {
          stage: "detection",
          status: "completed",
          timestamp: "2026-04-02T14:00:00.000Z",
          reason: null,
        },
        {
          stage: "validation",
          status: "blocked",
          timestamp: "2026-04-02T14:03:00.000Z",
          reason: "Missing market data for options chain",
        },
      ],
    },
    {
      alertId: 102,
      ticker: "AAPL",
      detectedAt: "2026-04-02T15:00:00.000Z",
      qualityScore: 75,
      finalOutcome: "entered",
      reasonCluster: null,
      primaryReason: null,
      sourceRefs: {
        primaryWhaleId: 102,
        whaleIds: [102],
        sourceAnalysisId: 901,
        tradeId: 77,
      },
      stageEvents: [
        {
          stage: "trade_execution",
          status: "completed",
          timestamp: "2026-04-02T15:04:00.000Z",
          reason: "trade opened",
        },
      ],
    },
  ],
  summary: {
    total: 2,
    byOutcome: {
      entered: 1,
      rejected: 1,
      not_evaluated: 0,
    },
    topReasons: [{ reason: "Missing market data for options chain", count: 1 }],
    dropOffByStage: {
      detection: 0,
      analysis: 0,
      evaluation: 0,
      validation: 1,
      entry: 0,
      trade_execution: 0,
    },
  },
  pipelineHealth: {
    lastRefreshAt: "2026-04-02T15:10:00.000Z",
    minutesSinceRefresh: 5,
    isStale: false,
    status: "healthy",
  },
  pageInfo: {
    limit: 8,
    nextCursor: null,
    hasMore: false,
  },
  filters: {
    ticker: null,
    outcome: "rejected",
    reasonCluster: "missing_market_data",
    minQuality: 70,
    startDate: null,
    endDate: null,
  },
};

describe("alert diagnostics export", () => {
  it("summarizes failure clusters from non-entered traces", () => {
    expect(summarizeReasonClusters(payload.traces)).toEqual([
      {
        cluster: "missing_market_data",
        label: "Missing Market Data",
        count: 1,
      },
    ]);
  });

  it("builds a markdown sprint review report for the current filter set", () => {
    const report = buildDiagnosticsMarkdownReport(payload);

    expect(report).toContain("# Alert Diagnostics Sprint Review");
    expect(report).toContain("- Outcome: rejected");
    expect(report).toContain("- Reason Cluster: missing_market_data");
    expect(report).toContain("- Missing Market Data: 1");
    expect(report).toContain("### NVDA - rejected");
    expect(report).toContain("- Stage Events:");
  });

  it("builds a JSON export with failure cluster summaries", () => {
    const report = JSON.parse(buildDiagnosticsJsonReport(payload)) as {
      failureClusters: Array<{ cluster: string; count: number }>;
      traces: Array<{ ticker: string }>;
    };

    expect(report.failureClusters).toEqual([
      {
        cluster: "missing_market_data",
        label: "Missing Market Data",
        count: 1,
      },
    ]);
    expect(report.traces).toHaveLength(2);
  });
});
