import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockEvaluateTradeForSim,
  mockOpenPosition,
  mockEvaluateOpenPositions,
  mockTakePortfolioSnapshot,
  mockGetOrCreatePortfolio,
  mockGetOpenPositionsSummary,
  mockValidateTradeLegs,
  mockFetchMarketData,
  mockFetchEarningsDate,
  mockLoadLearningDataset,
  mockFitShadowPolicyModel,
  mockEvaluateShadowPolicyCandidate,
  mockRecordShadowPolicyDecision,
  mockIsMarketOpen,
} = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
  },
  mockEvaluateTradeForSim: vi.fn(),
  mockOpenPosition: vi.fn(),
  mockEvaluateOpenPositions: vi.fn(),
  mockTakePortfolioSnapshot: vi.fn(),
  mockGetOrCreatePortfolio: vi.fn(),
  mockGetOpenPositionsSummary: vi.fn(),
  mockValidateTradeLegs: vi.fn(),
  mockFetchMarketData: vi.fn(),
  mockFetchEarningsDate: vi.fn(),
  mockLoadLearningDataset: vi.fn(),
  mockFitShadowPolicyModel: vi.fn(),
  mockEvaluateShadowPolicyCandidate: vi.fn(),
  mockRecordShadowPolicyDecision: vi.fn(),
  mockIsMarketOpen: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({
  analyses: {
    createdAt: "createdAt",
    type: "type",
    confidence: "confidence",
    source: "source",
  },
  marketSnapshots: {
    ivRvSpread: "ivRvSpread",
    ticker: "ticker",
    capturedAt: "capturedAt",
  },
  simEvaluations: {
    sourceAnalysisId: "sourceAnalysisId",
    createdAt: "createdAt",
  },
  simTrades: {
    status: "status",
    sourceAnalysisId: "sourceAnalysisId",
    createdAt: "createdAt",
  },
  whaleAlerts: { ticker: "ticker", createdAt: "createdAt" },
}));
vi.mock("drizzle-orm", () => ({
  desc: vi.fn((value) => value),
  gte: vi.fn((...args: unknown[]) => ({ op: "gte", args })),
  eq: vi.fn((...args: unknown[]) => ({ op: "eq", args })),
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
}));
vi.mock("@/lib/services/llm-analyzer", () => ({
  evaluateTradeForSim: (...args: unknown[]) => mockEvaluateTradeForSim(...args),
}));
vi.mock("@/lib/services/sim-engine", () => ({
  openPosition: (...args: unknown[]) => mockOpenPosition(...args),
  evaluateOpenPositions: (...args: unknown[]) =>
    mockEvaluateOpenPositions(...args),
  takePortfolioSnapshot: (...args: unknown[]) =>
    mockTakePortfolioSnapshot(...args),
  getOrCreatePortfolio: (...args: unknown[]) =>
    mockGetOrCreatePortfolio(...args),
  getOpenPositionsSummary: (...args: unknown[]) =>
    mockGetOpenPositionsSummary(...args),
  validateTradeLegs: (...args: unknown[]) => mockValidateTradeLegs(...args),
}));
vi.mock("@/lib/services/market-fetcher", () => ({
  fetchMarketData: (...args: unknown[]) => mockFetchMarketData(...args),
  fetchEarningsDate: (...args: unknown[]) => mockFetchEarningsDate(...args),
}));
vi.mock("@/lib/utils/market-hours", () => ({
  isMarketOpen: () => mockIsMarketOpen(),
}));
vi.mock("@/lib/utils/earnings-proximity", () => ({
  getEarningsProximity: vi.fn(() => ({
    daysToEarnings: null,
    earningsDate: null,
    ivCrushRisk: false,
  })),
}));
vi.mock("@/lib/utils/sector-map", () => ({
  getSector: vi.fn(() => "Technology"),
  areCorrelated: vi.fn(() => false),
}));
vi.mock("@/lib/analytics/learning-dataset", () => ({
  loadLearningDataset: (...args: unknown[]) => mockLoadLearningDataset(...args),
}));
vi.mock("@/lib/analytics/shadow-policy", () => ({
  fitShadowPolicyModel: (...args: unknown[]) =>
    mockFitShadowPolicyModel(...args),
  evaluateShadowPolicyCandidate: (...args: unknown[]) =>
    mockEvaluateShadowPolicyCandidate(...args),
}));
vi.mock("@/lib/analytics/shadow-policy-store", () => ({
  recordShadowPolicyDecision: (...args: unknown[]) =>
    mockRecordShadowPolicyDecision(...args),
}));
vi.mock("@/lib/cron/pipeline-progress", () => ({
  activate: vi.fn(),
  complete: vi.fn(),
  updateDetail: vi.fn(),
}));

import { runSimPipeline } from "@/lib/cron/pipelines/sim-pipeline";

describe("runSimPipeline event-ticker integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockIsMarketOpen.mockReturnValue({
      isOpen: true,
      isExtendedHours: false,
      reason: "regular_hours",
    });
    mockEvaluateOpenPositions.mockResolvedValue(0);
    mockGetOrCreatePortfolio.mockResolvedValue({ balance: 100000 });
    mockGetOpenPositionsSummary.mockReturnValue([]);
    mockLoadLearningDataset.mockResolvedValue({ learningRecords: [] });
    mockFitShadowPolicyModel.mockReturnValue(null);
    mockEvaluateShadowPolicyCandidate.mockReturnValue(null);
    mockFetchMarketData.mockResolvedValue([
      {
        ticker: "XOM",
        price: 120,
        volume: 1000000,
      },
    ]);
    mockFetchEarningsDate.mockResolvedValue(null);
    mockEvaluateTradeForSim.mockResolvedValue({
      should_enter: true,
      reasoning: "High-impact event setup",
      position_size_dollars: 3000,
      adjusted_entry: {
        strategy_name: "Bull Call Spread",
        legs: [
          {
            action: "buy",
            type: "call",
            strike: 120,
            expiry: "2026-05-15",
            premium: 4.5,
            quantity: 1,
          },
        ],
        net_premium: 450,
      },
      exit_plan: {
        profit_target_pct: 50,
        stop_loss_pct: 30,
        time_exit_days: 14,
      },
      risk_notes: [],
      educational_summary: "test",
    });
    mockValidateTradeLegs.mockReturnValue({ valid: true, warnings: [] });
    mockOpenPosition.mockResolvedValue(701);
    mockTakePortfolioSnapshot.mockResolvedValue(undefined);
    mockRecordShadowPolicyDecision.mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    mockDb.select
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([
                {
                  id: 5001,
                  source: "event_ticker",
                  inputRefs: JSON.stringify({
                    eventId: 4590,
                    ticker: "XOM",
                    source: "event_ticker",
                  }),
                  output: JSON.stringify({
                    ticker: "XOM",
                    thesis: "Oil supply shock supports energy names.",
                    direction: "bullish",
                    confidence: 0.74,
                    primary_strategy: {
                      name: "Bull Call Spread",
                      legs: [
                        {
                          action: "buy",
                          type: "call",
                          strike: 120,
                          expiry: "2026-05-15",
                          estimated_premium: 4.5,
                        },
                      ],
                      max_profit: "$300",
                      max_loss: "$150",
                      breakeven: "$124.50",
                      risk_reward_ratio: "1:2",
                    },
                    risk_factors: [],
                  }),
                  confidence: 0.74,
                },
              ]),
            })),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([]),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn().mockResolvedValue([]),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn().mockResolvedValue([
              {
                source: "event_ticker",
                output: JSON.stringify({
                  ticker: "XOM",
                  eventId: 4590,
                  eventContext: {
                    headline: "Middle East escalation hits infrastructure",
                    sentiment: "bullish",
                    impactScore: 9,
                  },
                  deepDive: {
                    market_narrative: "Energy shock persists.",
                    risk_assessment: { overall_risk: "moderate" },
                    entry_exit: {
                      profit_target: "25%",
                      stop_loss: "15%",
                      position_sizing: "small",
                    },
                  },
                  whaleMatch: {
                    hasWhaleActivity: false,
                    alerts: [],
                    bestQualityScore: null,
                  },
                }),
              },
            ]),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue([{ ivRvSpread: 0.05 }]),
            })),
          })),
        })),
      }));
  });

  it("opens a position for a high-impact event_ticker recommendation without whale flow", async () => {
    const result = await runSimPipeline();

    expect(result).toBe(1);
    expect(mockOpenPosition).toHaveBeenCalledOnce();
    expect(mockEvaluateTradeForSim).toHaveBeenCalledOnce();
  });
});
