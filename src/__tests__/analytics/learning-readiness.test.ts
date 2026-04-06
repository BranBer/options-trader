import { describe, expect, it } from "vitest";
import { buildLearningReadinessScorecard } from "@/lib/analytics/learning-readiness";
import { buildLearningRecords } from "@/lib/analytics/learning-records";
import type { WhaleAlertRow } from "@/types/whale";
import type {
  LearningRecordAnalysis,
  LearningRecordEvaluation,
  LearningRecordTrade,
} from "@/lib/analytics/learning-records";

function createWhale(id: number, ticker: string): WhaleAlertRow {
  return {
    id,
    ticker,
    strike: 120,
    expiry: "2026-04-19",
    callPut: "C",
    premium: 250000,
    volume: 1200,
    openInterest: 1800,
    underlyingPrice: 111.5,
    sentiment: "bullish",
    source: "uw",
    detectedAt: `2026-04-${String((id % 20) + 1).padStart(2, "0")}T14:00:00.000Z`,
    qualityScore: 82,
    createdAt: `2026-04-${String((id % 20) + 1).padStart(2, "0")}T14:00:00.000Z`,
  };
}

function createEvaluation(
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
    positionSize: shouldEnter ? 350 : null,
    netPremium: shouldEnter ? 350 : null,
    confidence: 0.66,
    whaleQualityScore: 82,
    portfolioBalance: 30000,
    sourceAnalysisId: id + 1000,
    rejectionGate: shouldEnter ? null : "validation",
    rejectionReason: shouldEnter ? null : "insufficient alignment",
    createdAt: `2026-04-${String((id % 20) + 1).padStart(2, "0")}T14:03:00.000Z`,
    primaryWhaleId: whaleId,
    whaleIds: [whaleId],
  };
}

function createTrade(
  id: number,
  whaleId: number,
  analysisId: number,
  ticker: string,
  pnlPct: number,
): LearningRecordTrade {
  return {
    id,
    ticker,
    strike: 120,
    expiry: "2026-04-19",
    entryPrice: 350,
    entryDate: `2026-04-${String((id % 20) + 1).padStart(2, "0")}T14:05:00.000Z`,
    exitPrice: 490,
    exitDate: `2026-04-${String((id % 20) + 2).padStart(2, "0")}T14:05:00.000Z`,
    pnl: (pnlPct / 100) * 350,
    pnlPct,
    status: "closed",
    exitReason: pnlPct > 0 ? "profit_target" : "stop_loss",
    direction: "bullish",
    sourceWhaleId: whaleId,
    sourceAnalysisId: analysisId,
  };
}

function createAnalysis(id: number, whaleId: number): LearningRecordAnalysis {
  return {
    id,
    type: "trade_recommendation",
    inputRefs: { primaryWhaleId: whaleId, whaleIds: [whaleId] },
    output: {
      ticker: "NVDA",
      direction: "bullish",
      confidence: 0.68,
      primary_strategy: {
        name: "Bull Call Spread",
        legs: [],
        max_profit: "$650",
        max_loss: "$350",
        breakeven: "$123.50",
        risk_reward_ratio: "1:1.85",
      },
      market_context: {
        iv_assessment: "normal",
        iv_strategy_note: "Defined risk remains appropriate.",
        volume_assessment: "unusual_high",
      },
      risk_factors: ["event volatility"],
      whale_alignment: {
        matches_whale: true,
        whale_position_size: "$250K",
        similarity_note: "Matches directional flow",
      },
      disclaimer: "paper trade only",
      market_narrative: "Momentum and flow remain aligned.",
      risk_assessment: { overall_risk: "moderate" },
    },
    confidence: 0.66,
    confidenceBreakdown: { composite: 0.61 },
    createdAt: "2026-04-02T14:01:00.000Z",
  };
}

describe("buildLearningReadinessScorecard", () => {
  it("flags sparse datasets as not ready", () => {
    const records = buildLearningRecords({
      whales: [createWhale(1, "NVDA")],
      evaluations: [createEvaluation(1, 1, "NVDA", true)],
      trades: [createTrade(1, 1, 1001, "NVDA", 20)],
      analyses: [createAnalysis(1001, 1)],
      startingBalance: 30000,
    });

    const scorecard = buildLearningReadinessScorecard(records);
    expect(scorecard.status).toBe("not_ready");
    expect(scorecard.blockers.length).toBeGreaterThan(0);
  });

  it("promotes sufficiently rich datasets to limited offline tuning", () => {
    const whales = Array.from({ length: 60 }, (_, idx) =>
      createWhale(idx + 1, idx % 2 === 0 ? "NVDA" : "AAPL"),
    );
    const evaluations = whales.map((whale, idx) =>
      createEvaluation(idx + 1, whale.id, whale.ticker, idx % 2 === 0),
    );
    const trades = whales
      .filter((_, idx) => idx % 2 === 0)
      .map((whale, idx) =>
        createTrade(
          idx + 1,
          whale.id,
          idx + 1001,
          whale.ticker,
          idx % 3 === 0 ? 18 : -8,
        ),
      );
    const analyses = whales.map((whale, idx) =>
      createAnalysis(idx + 1001, whale.id),
    );

    const scorecard = buildLearningReadinessScorecard(
      buildLearningRecords({
        whales,
        evaluations,
        trades,
        analyses,
        startingBalance: 30000,
      }),
    );

    expect(scorecard.status).toBe("limited_offline_tuning");
    expect(scorecard.metrics.totalRecords).toBe(60);
    expect(scorecard.metrics.whaleSignalCount).toBe(60);
    expect(scorecard.metrics.computedRewardCoveragePct).toBeGreaterThanOrEqual(
      45,
    );
  });

  it("segments event ticker records separately in readiness metrics", () => {
    const scorecard = buildLearningReadinessScorecard(
      buildLearningRecords({
        whales: [],
        evaluations: [],
        trades: [],
        analyses: [],
        eventSignals: [
          {
            id: "event-1-NVDA",
            eventId: 1,
            ticker: "NVDA",
            detectedAt: "2026-04-06T12:00:00.000Z",
            sentiment: "bullish",
            impactScore: 8,
            analysis: {
              id: 5001,
              type: "event_ticker_analysis",
              inputRefs: { eventId: 1, ticker: "NVDA" },
              output: {
                ticker: "NVDA",
                direction: "bullish",
                confidence: 0.7,
                primary_strategy: {
                  name: "Bull Call Spread",
                  legs: [],
                  max_profit: "$100",
                  max_loss: "$50",
                  breakeven: "$123",
                  risk_reward_ratio: "1:2",
                },
                market_context: {
                  iv_assessment: "normal",
                  iv_strategy_note: "ok",
                  volume_assessment: "normal",
                },
                risk_factors: [],
                whale_alignment: {
                  matches_whale: false,
                  whale_position_size: "$0",
                  similarity_note: "event only",
                },
                disclaimer: "paper trade only",
                deepDive: {
                  market_narrative: "Event narrative",
                  risk_assessment: { overall_risk: "moderate" },
                },
              },
              confidence: 0.7,
              confidenceBreakdown: { composite: 0.68 },
              createdAt: "2026-04-06T12:00:00.000Z",
            },
          },
        ],
      }),
    );

    expect(scorecard.metrics.totalRecords).toBe(1);
    expect(scorecard.metrics.eventTickerSignalCount).toBe(1);
    expect(scorecard.metrics.whaleSignalCount).toBe(0);
  });
});
