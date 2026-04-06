import { beforeEach, describe, expect, it, vi } from "vitest";

type MockResponse = { data: unknown; init?: { status?: number } };

const {
  mockDb,
  mockRecordShadowPolicyFeedback,
  mockGetRecentShadowPolicyReview,
} = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
  mockRecordShadowPolicyFeedback: vi.fn(),
  mockGetRecentShadowPolicyReview: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  db: mockDb,
}));

vi.mock("@/lib/cron/scheduler", () => ({
  getLastRefreshAt: vi.fn(() => "2026-04-02T12:10:00.000Z"),
}));

vi.mock("@/lib/analytics/shadow-policy-store", () => ({
  recordShadowPolicyFeedback: mockRecordShadowPolicyFeedback,
  getRecentShadowPolicyReview: mockGetRecentShadowPolicyReview,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) => ({
      data,
      init,
    })),
  },
}));

import { GET, POST } from "@/app/api/portfolio/route";

function createChain(result: unknown) {
  return {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

function seedLearningQueries() {
  mockDb.select
    .mockReturnValueOnce({
      from: vi.fn(() =>
        createChain([
          {
            id: 101,
            ticker: "NVDA",
            strike: 120,
            expiry: "2026-04-19",
            callPut: "C",
            premium: 250000,
            volume: 1000,
            openInterest: 500,
            underlyingPrice: 910,
            sentiment: "bullish",
            source: "uw",
            detectedAt: "2026-04-02T14:00:00.000Z",
            qualityScore: 82,
            createdAt: "2026-04-02T14:00:00.000Z",
          },
          {
            id: 102,
            ticker: "AAPL",
            strike: 190,
            expiry: "2026-04-19",
            callPut: "C",
            premium: 120000,
            volume: 700,
            openInterest: 400,
            underlyingPrice: 185,
            sentiment: "bullish",
            source: "uw",
            detectedAt: "2026-04-03T14:00:00.000Z",
            qualityScore: 76,
            createdAt: "2026-04-03T14:00:00.000Z",
          },
        ]),
      ),
    })
    .mockReturnValueOnce({
      from: vi.fn(() =>
        createChain([
          {
            id: 700,
            ticker: "NVDA",
            shouldEnter: true,
            reasoning: "Signal quality supports defined-risk entry.",
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
          },
          {
            id: 701,
            ticker: "AAPL",
            shouldEnter: false,
            reasoning: "Rejected because of lower conviction.",
            strategyName: "Bull Call Spread",
            legs: null,
            positionSize: null,
            netPremium: null,
            confidence: 0.44,
            whaleQualityScore: 76,
            portfolioBalance: 30000,
            sourceAnalysisId: 901,
            rejectionGate: "validation",
            rejectionReason: "insufficient alignment",
            createdAt: "2026-04-03T14:03:00.000Z",
          },
        ]),
      ),
    })
    .mockReturnValueOnce({
      from: vi.fn(() =>
        createChain([
          {
            id: 501,
            ticker: "NVDA",
            direction: "bullish",
            legs: JSON.stringify([
              {
                action: "buy",
                type: "call",
                strike: 120,
                expiry: "2026-04-19",
              },
            ]),
            entryPrice: 350,
            entryDate: "2026-04-02T14:05:00.000Z",
            exitPrice: 490,
            exitDate: "2026-04-05T14:30:00.000Z",
            pnl: 140,
            pnlPct: 40,
            status: "closed",
            exitReason: "profit_target",
            sourceWhaleId: 101,
            sourceAnalysisId: 900,
            createdAt: "2026-04-02T14:05:00.000Z",
          },
        ]),
      ),
    })
    .mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([
          {
            id: 900,
            type: "trade_recommendation",
            inputRefs: JSON.stringify({ primaryWhaleId: 101, whaleIds: [101] }),
            output: JSON.stringify({
              ticker: "NVDA",
              direction: "bullish",
              confidence: 0.66,
              recommendation_direction: "bullish",
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
              deep_dive_risk_level: "moderate",
            }),
            confidence: 0.66,
            confidenceBreakdown: JSON.stringify({ composite: 0.61 }),
            createdAt: "2026-04-02T14:01:00.000Z",
          },
          {
            id: 901,
            type: "trade_recommendation",
            inputRefs: JSON.stringify({ primaryWhaleId: 102, whaleIds: [102] }),
            output: JSON.stringify({
              ticker: "AAPL",
              direction: "bullish",
              confidence: 0.44,
              recommendation_direction: "neutral",
              primary_strategy: {
                name: "Bull Call Spread",
                legs: [],
                max_profit: "$300",
                max_loss: "$150",
                breakeven: "$191.50",
                risk_reward_ratio: "1:2",
              },
              market_context: {
                iv_assessment: "normal",
                iv_strategy_note: "Defined risk remains appropriate.",
                volume_assessment: "above_average",
              },
              risk_factors: ["macro uncertainty"],
              whale_alignment: {
                matches_whale: false,
                whale_position_size: "$120K",
                similarity_note: "less aligned",
              },
              disclaimer: "paper trade only",
              deep_dive_risk_level: "high",
            }),
            confidence: 0.44,
            confidenceBreakdown: JSON.stringify({ composite: 0.43 }),
            createdAt: "2026-04-03T14:01:00.000Z",
          },
        ]),
      })),
    })
    .mockReturnValueOnce({
      from: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([
          {
            id: 1,
            startingBalance: 30000,
          },
        ]),
      })),
    });
}

describe("GET /api/portfolio learning insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRecentShadowPolicyReview.mockResolvedValue({
      decisions: [],
      summary: {
        totalLoggedDecisions: 0,
        recommendEnterCount: 0,
        disagreeCount: 0,
        agreementRatePct: 0,
        feedbackCount: 0,
        usefulCount: 0,
        misleadingCount: 0,
        needsReviewCount: 0,
        lastLoggedAt: null,
      },
    });
  });

  it("returns a learning readiness scorecard", async () => {
    seedLearningQueries();

    const req = {
      nextUrl: new URL(
        "http://localhost/api/portfolio?view=learning-readiness&limit=10",
      ),
    };

    const response = await GET(req as unknown as Parameters<typeof GET>[0]);
    const data = (response as MockResponse).data as {
      readiness: {
        status: string;
        metrics: { totalRecords: number; computedRewardCount: number };
      };
      summary: { total: number };
    };

    expect(data.readiness.status).toBe("not_ready");
    expect(data.readiness.metrics.totalRecords).toBe(2);
    expect(data.readiness.metrics.computedRewardCount).toBe(2);
    expect(data.summary.total).toBe(2);
  });

  it("returns offline policy baseline comparisons", async () => {
    seedLearningQueries();

    const req = {
      nextUrl: new URL(
        "http://localhost/api/portfolio?view=policy-baseline&limit=10",
      ),
    };

    const response = await GET(req as unknown as Parameters<typeof GET>[0]);
    const data = (response as MockResponse).data as {
      policyBaseline: {
        evaluatedRecordCount: number;
        current: { metrics: { selectedCount: number } };
        baselines: Array<{ name: string }>;
      };
    };

    expect(data.policyBaseline.evaluatedRecordCount).toBe(2);
    expect(data.policyBaseline.current.metrics.selectedCount).toBe(1);
    expect(data.policyBaseline.baselines).toHaveLength(3);
  });

  it("returns replay-window policy evaluation results", async () => {
    seedLearningQueries();

    const req = {
      nextUrl: new URL(
        "http://localhost/api/portfolio?view=policy-evaluation&limit=10",
      ),
    };

    const response = await GET(req as unknown as Parameters<typeof GET>[0]);
    const data = (response as MockResponse).data as {
      policyEvaluation: {
        windows: Array<{
          id: string;
          supported: boolean;
          evaluatedRecordCount: number;
        }>;
      };
    };

    expect(data.policyEvaluation.windows).toHaveLength(3);
    expect(
      data.policyEvaluation.windows.find((window) => window.id === "all")
        ?.evaluatedRecordCount,
    ).toBe(2);
    expect(
      data.policyEvaluation.windows.some(
        (window) => window.supported === false,
      ),
    ).toBe(true);
  });

  it("returns promotion gates when shadow evidence is sparse", async () => {
    seedLearningQueries();
    mockDb.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      })),
    });

    const req = {
      nextUrl: new URL(
        "http://localhost/api/portfolio?view=promotion-gates&limit=10",
      ),
    };

    const response = await GET(req as unknown as Parameters<typeof GET>[0]);
    const data = (response as MockResponse).data as {
      promotionGates: { currentMode: string; checklist: Array<{ id: string }> };
    };

    expect(["analysis_only", "shadow"]).toContain(
      data.promotionGates.currentMode,
    );
    expect(data.promotionGates.checklist.length).toBeGreaterThan(0);
  });
});

describe("POST /api/portfolio shadow feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists shadow recommendation feedback", async () => {
    const req = {
      nextUrl: new URL("http://localhost/api/portfolio?view=shadow-feedback"),
      json: vi.fn().mockResolvedValue({
        shadowDecisionId: 42,
        verdict: "useful",
        notes: "Aligned with the later price follow-through.",
      }),
    };

    const response = await POST(req as unknown as Parameters<typeof POST>[0]);
    const data = (response as MockResponse).data as { ok: boolean };

    expect(mockRecordShadowPolicyFeedback).toHaveBeenCalledWith({
      shadowDecisionId: 42,
      verdict: "useful",
      notes: "Aligned with the later price follow-through.",
    });
    expect(data.ok).toBe(true);
  });

  it("rejects invalid shadow feedback payloads", async () => {
    const req = {
      nextUrl: new URL("http://localhost/api/portfolio?view=shadow-feedback"),
      json: vi.fn().mockResolvedValue({ verdict: "useful" }),
    };

    const response = await POST(req as unknown as Parameters<typeof POST>[0]);
    const payload = (response as MockResponse).data as { error: string };

    expect(mockRecordShadowPolicyFeedback).not.toHaveBeenCalled();
    expect(payload.error).toContain(
      "shadowDecisionId and verdict are required",
    );
    expect((response as MockResponse).init?.status).toBe(400);
  });
});
