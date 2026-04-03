import { describe, expect, it } from "vitest";
import { buildLearningRecords } from "@/lib/analytics/learning-records";
import { runLearningPolicyEvaluationHarness } from "@/lib/analytics/learning-policy-evaluator";
import type { WhaleAlertRow } from "@/types/whale";
import type {
  LearningRecordAnalysis,
  LearningRecordEvaluation,
  LearningRecordTrade,
} from "@/lib/analytics/learning-records";

function whale(id: number): WhaleAlertRow {
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
    qualityScore: 72,
    createdAt: `2026-04-${String((id % 20) + 1).padStart(2, "0")}T10:00:00.000Z`,
  };
}

function evaluation(
  id: number,
  whaleId: number,
  shouldEnter: boolean,
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
    confidence: shouldEnter ? 0.7 : 0.45,
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

function analysis(id: number, whaleId: number): LearningRecordAnalysis {
  const ticker = whaleId % 2 === 0 ? "AAPL" : "NVDA";

  return {
    id,
    type: "trade_recommendation",
    inputRefs: { primaryWhaleId: whaleId, whaleIds: [whaleId] },
    output: {
      ticker,
      direction: whaleId % 3 === 0 ? "neutral" : "bullish",
      confidence: whaleId % 3 === 0 ? 0.45 : 0.68,
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
      deep_dive_risk_level: whaleId % 4 === 0 ? "high" : "moderate",
      market_narrative: "bullish continuation",
      risk_assessment: {
        overall_risk: whaleId % 4 === 0 ? "high" : "moderate",
      },
    },
    confidence: 0.67,
    confidenceBreakdown: { composite: whaleId % 3 === 0 ? 0.42 : 0.64 },
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

describe("runLearningPolicyEvaluationHarness", () => {
  it("builds replay windows for a sufficiently sized corpus", () => {
    const whales = Array.from({ length: 8 }, (_, idx) => whale(idx + 1));
    const evaluations = whales.map((entry, idx) =>
      evaluation(idx + 1, entry.id, idx % 2 === 0),
    );
    const analyses = whales.map((entry, idx) => analysis(2001 + idx, entry.id));
    const trades = whales
      .filter((_, idx) => idx % 2 === 0)
      .map((entry, idx) =>
        trade(idx + 1, entry.id, 2001 + idx * 2, idx % 3 === 0 ? 14 : -6),
      );

    const records = buildLearningRecords({
      whales,
      evaluations,
      trades,
      analyses,
      startingBalance: 30000,
    });

    const result = runLearningPolicyEvaluationHarness(records);

    expect(result.windows).toHaveLength(3);
    expect(
      result.windows.find((window) => window.id === "all")?.supported,
    ).toBe(true);
    expect(
      result.windows.find((window) => window.id === "recent_7d")?.supported,
    ).toBe(true);
    expect(result.globalCaveats.length).toBeGreaterThan(0);
  });

  it("flags sparse replay windows as unsupported", () => {
    const whales = Array.from({ length: 3 }, (_, idx) => whale(idx + 1));
    const evaluations = whales.map((entry, idx) =>
      evaluation(idx + 1, entry.id, idx % 2 === 0),
    );
    const analyses = whales.map((entry, idx) => analysis(3001 + idx, entry.id));
    const trades = whales
      .filter((_, idx) => idx % 2 === 0)
      .map((entry, idx) =>
        trade(idx + 1, entry.id, 3001 + idx * 2, idx === 0 ? 12 : -4),
      );

    const records = buildLearningRecords({
      whales,
      evaluations,
      trades,
      analyses,
      startingBalance: 30000,
    });

    const result = runLearningPolicyEvaluationHarness(records);

    expect(
      result.windows.find((window) => window.id === "all")?.supported,
    ).toBe(false);
    expect(
      result.windows.find((window) => window.id === "all")?.supportReason,
    ).toBeTruthy();
  });
});
