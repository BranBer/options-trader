import { describe, expect, it } from "vitest";
import {
  LEARNING_RECORD_SCHEMA_VERSION,
  learningRecordSchema,
  type LearningRecord,
} from "@/types/learning";

function createLearningRecord(
  overrides?: Partial<LearningRecord>,
): LearningRecord {
  return {
    state: {
      alert: {
        alertId: 101,
        ticker: "NVDA",
        detectedAt: "2026-04-02T15:00:00.000Z",
        callPut: "C",
        strike: 120,
        expiry: "2026-04-19",
        premium: 250000,
        volume: 800,
        openInterest: 1200,
        underlyingPrice: 111.2,
        sentiment: "bullish",
        inferredSentiment: "strong_bullish",
        sentimentConfidence: "high",
        intentHint: "institutional",
        qualityScore: 82,
        delta: 0.42,
        gamma: 0.03,
        theta: -0.08,
        vega: 0.14,
        impliedVolatility: 0.37,
        breakEvenPrice: 123.4,
      },
      analysis: {
        sourceAnalysisId: 900,
        recommendationDirection: "bullish",
        recommendationConfidence: 0.66,
        compositeConfidence: 0.61,
        whaleQualityScore: 82,
        strategyName: "Bull Call Spread",
        riskRewardRatio: "1:1.4",
        riskFactors: ["event volatility", "elevated IV"],
        deepDiveRiskLevel: "moderate",
        marketNarrative: "Momentum and flow remain aligned.",
      },
      portfolio: {
        portfolioBalance: 30000,
        startingBalance: 30000,
        openPositionsCount: 1,
        openTickers: ["AAPL"],
        openDirectionCounts: {
          bullish: 1,
          bearish: 0,
          neutral: 0,
        },
      },
    },
    action: {
      decision: "enter",
      evaluationId: 700,
      decisionTimestamp: "2026-04-02T15:03:00.000Z",
      shouldEnter: true,
      reasoning:
        "Defined-risk structure fits the current balance and signal quality.",
      rejectionGate: null,
      rejectionReason: null,
      positionSizeDollars: 350,
      netPremium: 350,
      strategyName: "Bull Call Spread",
      legs: [
        {
          action: "buy",
          type: "call",
          strike: 120,
          expiry: "2026-04-19",
          premium: 5.4,
          quantity: 1,
        },
        {
          action: "sell",
          type: "call",
          strike: 125,
          expiry: "2026-04-19",
          premium: 1.9,
          quantity: 1,
        },
      ],
    },
    outcome: {
      finalOutcome: "entered",
      tradeId: 501,
      tradeStatus: "closed",
      pnl: 140,
      pnlPct: 40,
      exitReason: "profit_target",
      holdingDays: 3,
      realizedAt: "2026-04-05T15:30:00.000Z",
    },
    reward: {
      status: "computed",
      primaryReward: 0.34,
      realizedPnl: 140,
      realizedPnlPct: 40,
      drawdownPenalty: -0.02,
      opportunityCostPenalty: null,
      notes: ["reward_v1_placeholder"],
    },
    metadata: {
      recordId: "alert-101",
      schemaVersion: LEARNING_RECORD_SCHEMA_VERSION,
      generatedAt: "2026-04-05T15:31:00.000Z",
      lineageQuality: "explicit",
      sourceRefs: {
        primaryWhaleId: 101,
        whaleIds: [101],
        sourceAnalysisId: 900,
        evaluationId: 700,
        tradeId: 501,
      },
      completeness: {
        hasAlert: true,
        hasAnalysis: true,
        hasEvaluation: true,
        hasTrade: true,
        hasReward: true,
      },
    },
    ...overrides,
  };
}

describe("learningRecordSchema", () => {
  it("accepts a fully populated learning record", () => {
    const record = createLearningRecord();
    const parsed = learningRecordSchema.parse(record);

    expect(parsed.metadata.schemaVersion).toBe("v1");
    expect(parsed.action.decision).toBe("enter");
    expect(parsed.outcome.finalOutcome).toBe("entered");
  });

  it("supports incomplete records without forcing unavailable fields", () => {
    const record = createLearningRecord({
      action: {
        decision: "not_evaluated",
        evaluationId: null,
        decisionTimestamp: null,
        shouldEnter: null,
        reasoning: null,
        rejectionGate: null,
        rejectionReason: null,
        positionSizeDollars: null,
        netPremium: null,
        strategyName: null,
        legs: null,
      },
      outcome: {
        finalOutcome: "not_evaluated",
        tradeId: null,
        tradeStatus: null,
        pnl: null,
        pnlPct: null,
        exitReason: null,
        holdingDays: null,
        realizedAt: null,
      },
      reward: {
        status: "pending",
        primaryReward: null,
        realizedPnl: null,
        realizedPnlPct: null,
        drawdownPenalty: null,
        opportunityCostPenalty: null,
        notes: [],
      },
      metadata: {
        recordId: "alert-101-incomplete",
        schemaVersion: LEARNING_RECORD_SCHEMA_VERSION,
        generatedAt: "2026-04-02T15:05:00.000Z",
        lineageQuality: "incomplete",
        sourceRefs: {
          primaryWhaleId: 101,
          whaleIds: [101],
          sourceAnalysisId: null,
          evaluationId: null,
          tradeId: null,
        },
        completeness: {
          hasAlert: true,
          hasAnalysis: false,
          hasEvaluation: false,
          hasTrade: false,
          hasReward: false,
        },
      },
    });

    const parsed = learningRecordSchema.parse(record);
    expect(parsed.metadata.lineageQuality).toBe("incomplete");
    expect(parsed.reward.status).toBe("pending");
  });

  it("rejects records without the required versioned metadata", () => {
    const record = createLearningRecord();
    const invalid = {
      ...record,
      metadata: {
        ...record.metadata,
        schemaVersion: "v2",
      },
    };

    expect(() => learningRecordSchema.parse(invalid)).toThrow();
  });

  it("round-trips through JSON serialization without schema drift", () => {
    const record = createLearningRecord();
    const roundTripped = JSON.parse(JSON.stringify(record));
    const parsed = learningRecordSchema.parse(roundTripped);

    expect(parsed).toEqual(record);
  });
});
