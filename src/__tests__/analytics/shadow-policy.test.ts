import { describe, expect, it } from "vitest";
import { buildLearningRecords } from "@/lib/analytics/learning-records";
import {
  evaluateShadowPolicyCandidate,
  fitShadowPolicyModel,
} from "@/lib/analytics/shadow-policy";
import type { WhaleAlertRow } from "@/types/whale";
import type {
  LearningRecordAnalysis,
  LearningRecordEvaluation,
  LearningRecordTrade,
} from "@/lib/analytics/learning-records";

function whale(id: number, qualityScore: number): WhaleAlertRow {
  return {
    id,
    ticker: id % 2 === 0 ? "AAPL" : "NVDA",
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
    qualityScore,
    createdAt: `2026-04-${String((id % 20) + 1).padStart(2, "0")}T10:00:00.000Z`,
  };
}

function evaluation(
  id: number,
  whaleId: number,
  shouldEnter: boolean,
  confidence: number,
): LearningRecordEvaluation {
  return {
    id,
    ticker: whaleId % 2 === 0 ? "AAPL" : "NVDA",
    shouldEnter,
    reasoning: shouldEnter ? "enter" : "reject",
    strategyName: "Bull Call Spread",
    legs: null,
    positionSize: shouldEnter ? 250 : null,
    netPremium: shouldEnter ? 250 : null,
    confidence,
    whaleQualityScore: shouldEnter ? 82 : 55,
    portfolioBalance: 30000,
    sourceAnalysisId: 4000 + id,
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
  highQuality: boolean,
): LearningRecordAnalysis {
  const ticker = whaleId % 2 === 0 ? "AAPL" : "NVDA";
  return {
    id,
    type: "trade_recommendation",
    inputRefs: { primaryWhaleId: whaleId, whaleIds: [whaleId] },
    output: {
      ticker,
      direction: highQuality ? "bullish" : "neutral",
      confidence: highQuality ? 0.74 : 0.42,
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
      deep_dive_risk_level: highQuality ? "moderate" : "high",
      market_narrative: "bullish continuation",
      risk_assessment: { overall_risk: highQuality ? "moderate" : "high" },
    },
    confidence: highQuality ? 0.74 : 0.42,
    confidenceBreakdown: { composite: highQuality ? 0.71 : 0.41 },
    createdAt: "2026-04-02T10:01:00.000Z",
  };
}

function trade(
  id: number,
  whaleId: number,
  analysisId: number,
  pnlPct: number,
): LearningRecordTrade {
  const ticker = whaleId % 2 === 0 ? "AAPL" : "NVDA";
  return {
    id,
    ticker,
    strike: 100,
    expiry: "2026-05-17",
    entryPrice: 250,
    entryDate: `2026-04-${String((id % 20) + 1).padStart(2, "0")}T10:05:00.000Z`,
    exitPrice: 300,
    exitDate: `2026-04-${String((id % 20) + 2).padStart(2, "0")}T10:05:00.000Z`,
    pnl: (pnlPct / 100) * 250,
    pnlPct,
    status: "closed",
    exitReason: pnlPct > 0 ? "profit_target" : "stop_loss",
    direction: "bullish",
    sourceWhaleId: whaleId,
    sourceAnalysisId: analysisId,
  };
}

describe("shadow policy", () => {
  it("fits an empirical model and prefers strong candidates", () => {
    const whales = [
      whale(1, 85),
      whale(2, 84),
      whale(3, 50),
      whale(4, 48),
      whale(5, 88),
      whale(6, 52),
    ];
    const evaluations = [
      evaluation(1, 1, true, 0.74),
      evaluation(2, 2, true, 0.72),
      evaluation(3, 3, false, 0.41),
      evaluation(4, 4, false, 0.39),
      evaluation(5, 5, true, 0.76),
      evaluation(6, 6, false, 0.45),
    ];
    const analyses = [
      analysis(4001, 1, true),
      analysis(4002, 2, true),
      analysis(4003, 3, false),
      analysis(4004, 4, false),
      analysis(4005, 5, true),
      analysis(4006, 6, false),
    ];
    const trades = [
      trade(1, 1, 4001, 16),
      trade(2, 2, 4002, 12),
      trade(3, 5, 4005, 18),
    ];

    const records = buildLearningRecords({
      whales,
      evaluations,
      trades,
      analyses,
      startingBalance: 30000,
    });

    const model = fitShadowPolicyModel(records);
    const strongDecision = evaluateShadowPolicyCandidate(
      {
        ticker: "NVDA",
        qualityScore: 84,
        recommendationConfidence: 0.74,
        compositeConfidence: 0.71,
        recommendationDirection: "bullish",
        deepDiveRiskLevel: "moderate",
        openPositionsCount: 1,
        portfolioBalance: 30000,
        positionSizeDollars: 1200,
      },
      model,
    );
    const weakDecision = evaluateShadowPolicyCandidate(
      {
        ticker: "AAPL",
        qualityScore: 48,
        recommendationConfidence: 0.41,
        compositeConfidence: 0.39,
        recommendationDirection: "neutral",
        deepDiveRiskLevel: "high",
        openPositionsCount: 4,
        portfolioBalance: 30000,
        positionSizeDollars: 4000,
      },
      model,
    );

    expect(model.features.length).toBeGreaterThan(0);
    expect(strongDecision.recommendedAction).toBe("enter");
    expect(weakDecision.recommendedAction).toBe("reject");
    expect(strongDecision.score).toBeGreaterThan(weakDecision.score);
  });
});
