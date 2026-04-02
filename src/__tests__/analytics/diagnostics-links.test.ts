import { describe, expect, it } from "vitest";
import {
  getDiagnosticsHrefForCorrelation,
  getDiagnosticsHrefForDecisionTrace,
  getDiagnosticsHrefForMissedOpportunity,
  getDiagnosticsHrefForPipelineGaps,
} from "@/lib/analytics/diagnostics-links";

describe("diagnostics deep links", () => {
  it("maps missed opportunities into diagnostics filters", () => {
    expect(
      getDiagnosticsHrefForMissedOpportunity({
        ticker: "NVDA",
        sentiment: "bullish",
        premium: 250000,
        qualityScore: 82,
        missReason: "missing_market_data",
        detectedAt: "2026-04-02T14:00:00.000Z",
      }),
    ).toBe(
      "/portfolio?tab=diagnostics&ticker=NVDA&outcome=rejected&reasonCluster=missing_market_data&minQuality=82",
    );
  });

  it("maps unevaluated correlations to pipeline-gap diagnostics", () => {
    expect(
      getDiagnosticsHrefForCorrelation({
        ticker: "SPY",
        detectedAt: "2026-04-02T15:00:00.000Z",
        qualityScore: 78,
        evaluatedAt: null,
        shouldEnter: null,
        rejectionGate: null,
        rejectionReason: null,
        tradeId: null,
        tradeStatus: null,
      }),
    ).toBe(
      "/portfolio?tab=diagnostics&ticker=SPY&outcome=not_evaluated&reasonCluster=pipeline_gap&minQuality=78",
    );
  });

  it("maps recent decision traces to the diagnostics outcome lane", () => {
    expect(
      getDiagnosticsHrefForDecisionTrace({
        ticker: "AAPL",
        outcome: "entered",
        stage: "trade",
        reason: null,
        timestamp: "2026-04-02T16:00:00.000Z",
      }),
    ).toBe("/portfolio?tab=diagnostics&ticker=AAPL&outcome=entered");
  });

  it("builds the pipeline-gap diagnostics lane shortcut", () => {
    expect(getDiagnosticsHrefForPipelineGaps()).toBe(
      "/portfolio?tab=diagnostics&outcome=not_evaluated&reasonCluster=pipeline_gap",
    );
  });
});
