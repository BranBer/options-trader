import { describe, expect, it } from "vitest";
import { runLearningPolicyBaselineEvaluation } from "@/lib/analytics/learning-policy-baselines";
import { buildLearningRecords } from "@/lib/analytics/learning-records";
import type { WhaleAlertRow } from "@/types/whale";
import type {
  LearningRecordAnalysis,
  LearningRecordEvaluation,
  LearningRecordTrade,
} from "@/lib/analytics/learning-records";

function whale(id: number, ticker: string): WhaleAlertRow {
  return {
    id,
    ticker,
    strike: 100,
    expiry: "2026-05-17",
    callPut: "C",
    premium: 150000,
    volume: 900,
    openInterest: 1100,
    underlyingPrice: 100,
    sentiment: "bullish",
    source: "uw",
    detectedAt: `2026-04-${String((id % 20) + 1).padStart(2, "0")}T10:00:00.000Z`,
    qualityScore: 72,
    createdAt: `2026-04-${String((id % 20) + 1).padStart(2, "0")}T10:00:00.000Z`,
  };
}

function evaluation(
  id: number,
  whaleId: number,
  ticker: string,
  shouldEnter: boolean,
): LearningRecordEvaluation {
  return {
    id,
    ticker,
    shouldEnter,
    reasoning: shouldEnter ? "enter" : "reject",
    strategyName: "Bull Call Spread",
    legs: null,
    positionSize: shouldEnter ? 250 : null,
    netPremium: shouldEnter ? 250 : null,
    confidence: 0.67,
    whaleQualityScore: 72,
    portfolioBalance: 30000,
    sourceAnalysisId: 2000 + id,
    rejectionGate: shouldEnter ? null : "validation",
    rejectionReason: shouldEnter ? null : "insufficient alignment",
    createdAt: `2026-04-${String((id % 20) + 1).padStart(2, "0")}T10:03:00.000Z`,
    primaryWhaleId: whaleId,
    whaleIds: [whaleId],
  };
}

function analysis(
  id: number,
  whaleId: number,
  ticker: string,
): LearningRecordAnalysis {
  return {
    id,
    type: "trade_recommendation",
    inputRefs: { primaryWhaleId: whaleId, whaleIds: [whaleId] },
    output: {
      ticker,
      direction: "bullish",
      confidence: 0.67,
      primary_strategy: {
        name: "Bull Call Spread",
        legs: [],
        max_profit: "$450",
        max_loss: "$250",
        breakeven: "$102.50",
        risk_reward_ratio: "1:1.8",
      },
      market_context: {
        iv_assessment: "normal",
        iv_strategy_note: "defined risk",
        volume_assessment: "unusual_high",
      },
      risk_factors: ["headline risk"],
      whale_alignment: {
        matches_whale: true,
        whale_position_size: "$150K",
        similarity_note: "aligned",
      },
      disclaimer: "paper trade only",
      market_narrative: "bullish continuation",
      risk_assessment: { overall_risk: "moderate" },
    },
    confidence: 0.67,
    confidenceBreakdown: { composite: 0.64 },
    createdAt: "2026-04-02T10:01:00.000Z",
  };
}

function trade(
  id: number,
  whaleId: number,
  analysisId: number,
  ticker: string,
  pnlPct: number,
): LearningRecordTrade {
  return {
    id,
    ticker,
    strike: 100,
    expiry: "2026-05-17",
    entryPrice: 250,
    entryDate: "2026-04-02T10:05:00.000Z",
    exitPrice: 300,
    exitDate: "2026-04-08T10:05:00.000Z",
    pnl: (pnlPct / 100) * 250,
    pnlPct,
    status: "closed",
    exitReason: pnlPct > 0 ? "profit_target" : "stop_loss",
    direction: "bullish",
    sourceWhaleId: whaleId,
    sourceAnalysisId: analysisId,
  };
}

describe("runLearningPolicyBaselineEvaluation", () => {
  it("compares the current policy against deterministic baseline selectors", () => {
    const whales = [
      whale(1, "NVDA"),
      whale(2, "AAPL"),
      whale(3, "MSFT"),
      whale(4, "AMD"),
    ];
    const evaluations = [
      evaluation(1, 1, "NVDA", true),
      evaluation(2, 2, "AAPL", false),
      evaluation(3, 3, "MSFT", true),
      evaluation(4, 4, "AMD", false),
    ];
    const analyses = whales.map((record, idx) =>
      analysis(2001 + idx, record.id, record.ticker),
    );
    const trades = [
      trade(1, 1, 2001, "NVDA", 18),
      trade(2, 3, 2003, "MSFT", -10),
    ];

    const records = buildLearningRecords({
      whales,
      evaluations,
      trades,
      analyses,
      startingBalance: 30000,
    });
    const result = runLearningPolicyBaselineEvaluation(records);

    expect(result.current.metrics.selectedCount).toBe(2);
    expect(result.baselines.length).toBe(3);
    expect(result.bestBaseline).not.toBeNull();
    expect(result.evaluatedRecordCount).toBe(4);
  });
});
