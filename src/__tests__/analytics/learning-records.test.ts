import { describe, expect, it } from "vitest";
import {
  buildLearningExportManifest,
  buildLearningRecords,
  serializeLearningRecordsToCsv,
  serializeLearningRecordsToJsonl,
  summarizeLearningRecords,
  type LearningRecordAnalysis,
  type LearningRecordEvaluation,
  type LearningRecordTrade,
} from "@/lib/analytics/learning-records";
import type { WhaleAlertRow } from "@/types/whale";

function createWhale(overrides?: Partial<WhaleAlertRow>): WhaleAlertRow {
  return {
    id: 101,
    ticker: "NVDA",
    strike: 120,
    expiry: "2026-04-19",
    callPut: "C",
    premium: 250000,
    volume: 1200,
    openInterest: 1800,
    underlyingPrice: 111.5,
    sentiment: "bullish",
    source: "uw",
    detectedAt: "2026-04-02T14:00:00.000Z",
    qualityScore: 82,
    createdAt: "2026-04-02T14:00:00.000Z",
    ...overrides,
  };
}

function createEvaluation(
  overrides?: Partial<LearningRecordEvaluation>,
): LearningRecordEvaluation {
  return {
    id: 700,
    ticker: "NVDA",
    shouldEnter: true,
    reasoning: "Signal quality and defined risk justify entry.",
    strategyName: "Bull Call Spread",
    legs: JSON.stringify([
      {
        action: "buy",
        type: "call",
        strike: 120,
        expiry: "2026-04-19",
        premium: 5.4,
        quantity: 1,
      },
    ]),
    positionSize: 350,
    netPremium: 350,
    confidence: 0.64,
    whaleQualityScore: 82,
    portfolioBalance: 30000,
    sourceAnalysisId: 900,
    rejectionGate: null,
    rejectionReason: null,
    createdAt: "2026-04-02T14:03:00.000Z",
    primaryWhaleId: 101,
    whaleIds: [101],
    ...overrides,
  };
}

function createTrade(
  overrides?: Partial<LearningRecordTrade>,
): LearningRecordTrade {
  return {
    id: 501,
    ticker: "NVDA",
    strike: 120,
    expiry: "2026-04-19",
    entryPrice: 350,
    entryDate: "2026-04-02T14:05:00.000Z",
    exitPrice: 490,
    exitDate: "2026-04-05T14:30:00.000Z",
    pnl: 140,
    pnlPct: 40,
    status: "closed",
    exitReason: "profit_target",
    direction: "bullish",
    sourceWhaleId: 101,
    sourceAnalysisId: 900,
    ...overrides,
  };
}

function createAnalysis(
  overrides?: Partial<LearningRecordAnalysis>,
): LearningRecordAnalysis {
  return {
    id: 900,
    type: "trade_recommendation",
    inputRefs: { primaryWhaleId: 101, whaleIds: [101] },
    output: {
      ticker: "NVDA",
      thesis: "Momentum and flow remain aligned.",
      direction: "bullish",
      confidence: 0.66,
      primary_strategy: {
        name: "Bull Call Spread",
        legs: [
          {
            action: "buy",
            type: "call",
            strike: 120,
            expiry: "2026-04-19",
            estimated_premium: 5.4,
          },
        ],
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
    ...overrides,
  };
}

describe("buildLearningRecords", () => {
  it("builds an explicit joined record from alert, evaluation, trade, and analysis data", () => {
    const records = buildLearningRecords({
      whales: [createWhale()],
      evaluations: [createEvaluation()],
      trades: [createTrade()],
      analyses: [createAnalysis()],
      startingBalance: 30000,
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      action: {
        decision: "enter",
        evaluationId: 700,
      },
      outcome: {
        finalOutcome: "entered",
        tradeId: 501,
        pnlPct: 40,
      },
      metadata: {
        lineageQuality: "explicit",
      },
    });
    expect(records[0].state.analysis.strategyName).toBe("Bull Call Spread");
    expect(records[0].state.portfolio.openPositionsCount).toBe(1);
  });

  it("marks heuristic matches as inferred when no explicit source refs exist", () => {
    const records = buildLearningRecords({
      whales: [createWhale()],
      evaluations: [
        createEvaluation({
          shouldEnter: false,
          primaryWhaleId: null,
          whaleIds: [],
          sourceAnalysisId: null,
        }),
      ],
      trades: [],
      analyses: [],
      startingBalance: 30000,
    });

    expect(records[0].metadata.lineageQuality).toBe("inferred");
    expect(records[0].outcome.finalOutcome).toBe("rejected");
    expect(records[0].reward.status).toBe("computed");
    expect(records[0].reward.opportunityCostPenalty).toBeGreaterThan(0);
  });

  it("summarizes decision, outcome, and lineage counts", () => {
    const records = buildLearningRecords({
      whales: [createWhale(), createWhale({ id: 102, ticker: "AAPL" })],
      evaluations: [createEvaluation()],
      trades: [createTrade()],
      analyses: [createAnalysis()],
      startingBalance: 30000,
    });

    const summary = summarizeLearningRecords(records);
    expect(summary).toMatchObject({
      total: 2,
      byDecision: { enter: 1, reject: 0, not_evaluated: 1 },
      byOutcome: { entered: 1, rejected: 0, not_evaluated: 1 },
      byRewardStatus: { computed: 2, pending: 0, not_applicable: 0 },
    });
    expect(summary.byLineageQuality.explicit).toBe(1);
  });

  it("computes negative reward for losing terminal trades", () => {
    const records = buildLearningRecords({
      whales: [createWhale()],
      evaluations: [
        createEvaluation({ portfolioBalance: 22000, positionSize: 3600 }),
      ],
      trades: [
        createTrade({ pnl: -120, pnlPct: -34, exitReason: "stop_loss" }),
      ],
      analyses: [createAnalysis()],
      startingBalance: 30000,
    });

    expect(records[0].reward.status).toBe("computed");
    expect(records[0].reward.primaryReward).toBeLessThan(0);
    expect(records[0].reward.drawdownPenalty).toBeGreaterThan(0);
  });

  it("keeps open trades pending until outcome is realized", () => {
    const records = buildLearningRecords({
      whales: [createWhale()],
      evaluations: [createEvaluation()],
      trades: [
        createTrade({
          status: "open",
          exitDate: null,
          exitPrice: null,
          pnl: null,
          pnlPct: null,
        }),
      ],
      analyses: [createAnalysis()],
      startingBalance: 30000,
    });

    expect(records[0].reward).toMatchObject({
      status: "pending",
      primaryReward: null,
    });
  });

  it("serializes manifest, jsonl, and csv learning exports", () => {
    const records = buildLearningRecords({
      whales: [createWhale()],
      evaluations: [createEvaluation()],
      trades: [createTrade()],
      analyses: [createAnalysis()],
      startingBalance: 30000,
    });
    const summary = summarizeLearningRecords(records);
    const filters = { lineageQuality: null, limit: 10 } as const;

    const manifest = buildLearningExportManifest({ records, summary, filters });
    const jsonl = serializeLearningRecordsToJsonl({
      records,
      summary,
      filters,
    });
    const csv = serializeLearningRecordsToCsv({ records, summary, filters });

    expect(manifest.rowCount).toBe(1);
    expect(jsonl.split("\n")).toHaveLength(2);
    expect(jsonl).toContain('"type":"manifest"');
    expect(csv).toContain(
      "exportGeneratedAt,exportSchemaVersion,exportRowCount",
    );
    expect(csv).toContain("alert-101");
  });

  it("builds observation-only event ticker records without forcing rewards", () => {
    const records = buildLearningRecords({
      whales: [],
      evaluations: [],
      trades: [],
      analyses: [],
      eventSignals: [
        {
          id: "event-77-NVDA",
          eventId: 77,
          ticker: "NVDA",
          detectedAt: "2026-04-06T12:00:00.000Z",
          sentiment: "bullish",
          impactScore: 9,
          analysis: createAnalysis({
            id: 177,
            inputRefs: { eventId: 77, ticker: "NVDA" },
            output: {
              ...createAnalysis().output,
              ticker: "NVDA",
              deepDive: {
                market_narrative: "Event-driven momentum remains constructive.",
                risk_assessment: { overall_risk: "moderate" },
              },
            },
          }),
        },
      ],
      startingBalance: 30000,
    });

    expect(records).toHaveLength(1);
    expect(records[0].state.alert.signalSource).toBe("event_ticker");
    expect(records[0].reward.status).toBe("not_applicable");
    expect(records[0].metadata.sourceRefs.primaryWhaleId).toBeNull();
  });
});
