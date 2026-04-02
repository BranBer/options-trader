import { describe, expect, it } from "vitest";
import {
  buildAlertDecisionTraces,
  buildAlertDiagnostics,
  classifyAlertReasonCluster,
} from "@/lib/analytics/alert-diagnostics";

describe("alert diagnostics", () => {
  it("builds a canonical per-alert trace with deterministic stages", () => {
    const traces = buildAlertDecisionTraces({
      whales: [
        {
          id: 101,
          ticker: "NVDA",
          strike: 950,
          expiry: "2026-04-17",
          callPut: "C",
          premium: 250000,
          volume: 1000,
          openInterest: 500,
          sentiment: "bullish",
          source: "uw",
          detectedAt: "2026-04-02T14:00:00.000Z",
          qualityScore: 82,
        },
      ],
      evaluations: [
        {
          ticker: "NVDA",
          shouldEnter: false,
          confidence: 0.61,
          rejectionGate: "concentration",
          rejectionReason: "Directional concentration",
          createdAt: "2026-04-02T14:03:00.000Z",
          sourceAnalysisId: 900,
          primaryWhaleId: 101,
          whaleIds: [101],
        },
      ],
      trades: [],
      lastRefreshAt: "2026-04-02T14:05:00.000Z",
    });

    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({
      alertId: 101,
      ticker: "NVDA",
      finalOutcome: "rejected",
      reasonCluster: "portfolio_concentration",
      primaryReason: "Directional concentration",
      sourceRefs: {
        primaryWhaleId: 101,
        sourceAnalysisId: 900,
        tradeId: null,
      },
    });
    expect(traces[0].stageEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "detection", status: "completed" }),
        expect.objectContaining({ stage: "analysis", status: "completed" }),
        expect.objectContaining({ stage: "evaluation", status: "completed" }),
        expect.objectContaining({ stage: "validation", status: "blocked" }),
        expect.objectContaining({
          stage: "trade_execution",
          status: "not_applicable",
        }),
      ]),
    );
  });

  it("marks alerts without evaluations as not_evaluated with a pipeline-aware reason", () => {
    const traces = buildAlertDecisionTraces({
      whales: [
        {
          id: 202,
          ticker: "SPY",
          strike: 500,
          expiry: "2026-04-17",
          callPut: "P",
          premium: 150000,
          volume: 800,
          openInterest: 450,
          sentiment: "bearish",
          source: "uw",
          detectedAt: "2026-04-02T15:00:00.000Z",
          qualityScore: 78,
        },
      ],
      evaluations: [],
      trades: [],
      lastRefreshAt: null,
    });

    expect(traces[0].finalOutcome).toBe("not_evaluated");
    expect(traces[0].reasonCluster).toBe("pipeline_gap");
    expect(traces[0].primaryReason).toBe("pipeline never ran for this window");
    expect(traces[0].stageEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "analysis", status: "missing" }),
        expect.objectContaining({ stage: "evaluation", status: "missing" }),
      ]),
    );
  });

  it("summarizes outcomes, reasons, and stage drop-offs for a diagnostics window", () => {
    const recentRefresh = new Date().toISOString();

    const diagnostics = buildAlertDiagnostics({
      whales: [
        {
          id: 1,
          ticker: "AAPL",
          strike: 200,
          expiry: "2026-04-17",
          callPut: "C",
          premium: 120000,
          volume: 500,
          openInterest: 400,
          sentiment: "bullish",
          source: "uw",
          detectedAt: "2026-04-02T12:00:00.000Z",
          qualityScore: 70,
        },
        {
          id: 2,
          ticker: "MSFT",
          strike: 420,
          expiry: "2026-04-17",
          callPut: "C",
          premium: 90000,
          volume: 450,
          openInterest: 300,
          sentiment: "bullish",
          source: "uw",
          detectedAt: "2026-04-02T12:05:00.000Z",
          qualityScore: 76,
        },
      ],
      evaluations: [
        {
          ticker: "AAPL",
          shouldEnter: true,
          confidence: 0.7,
          rejectionGate: null,
          rejectionReason: null,
          createdAt: "2026-04-02T12:03:00.000Z",
          primaryWhaleId: 1,
          whaleIds: [1],
        },
        {
          ticker: "MSFT",
          shouldEnter: false,
          confidence: 0.42,
          rejectionGate: "llm_eval",
          rejectionReason: "confidence too low",
          createdAt: "2026-04-02T12:08:00.000Z",
          primaryWhaleId: 2,
          whaleIds: [2],
        },
      ],
      trades: [
        {
          id: 50,
          ticker: "AAPL",
          entryDate: "2026-04-02T12:04:00.000Z",
          exitDate: null,
          strike: 200,
          expiry: "2026-04-17",
          entryPrice: 4.2,
          exitPrice: null,
          pnl: null,
          pnlPct: null,
          status: "open",
          sourceWhaleId: 1,
        },
      ],
      lastRefreshAt: recentRefresh,
    });

    expect(diagnostics.summary.byOutcome).toEqual({
      entered: 1,
      rejected: 1,
      not_evaluated: 0,
    });
    expect(diagnostics.summary.dropOffByStage.entry).toBe(1);
    expect(diagnostics.summary.topReasons[0]).toEqual({
      reason: "confidence too low",
      count: 1,
    });
    expect(diagnostics.pipelineHealth.status).toBe("healthy");
  });

  it("classifies same-day, market-data, and pipeline-gap reason clusters", () => {
    expect(
      classifyAlertReasonCluster({
        alertId: 1,
        ticker: "SPY",
        detectedAt: "2026-04-02T12:00:00.000Z",
        qualityScore: 80,
        finalOutcome: "rejected",
        primaryReason:
          "All legs expire within 2 trading days — excessive theta risk",
        sourceRefs: {
          primaryWhaleId: 1,
          whaleIds: [1],
          sourceAnalysisId: 10,
          tradeId: null,
        },
        stageEvents: [],
      }),
    ).toBe("same_day_blocked");

    expect(
      classifyAlertReasonCluster({
        alertId: 2,
        ticker: "NVDA",
        detectedAt: "2026-04-02T12:00:00.000Z",
        qualityScore: 80,
        finalOutcome: "rejected",
        primaryReason: "Missing market data for options chain",
        sourceRefs: {
          primaryWhaleId: 2,
          whaleIds: [2],
          sourceAnalysisId: 11,
          tradeId: null,
        },
        stageEvents: [],
      }),
    ).toBe("missing_market_data");

    expect(
      classifyAlertReasonCluster({
        alertId: 3,
        ticker: "AAPL",
        detectedAt: "2026-04-02T12:00:00.000Z",
        qualityScore: 80,
        finalOutcome: "not_evaluated",
        primaryReason: "pipeline stale before alert could be evaluated",
        sourceRefs: {
          primaryWhaleId: 3,
          whaleIds: [3],
          sourceAnalysisId: null,
          tradeId: null,
        },
        stageEvents: [],
      }),
    ).toBe("pipeline_gap");
  });
});
