import { beforeEach, describe, expect, it, vi } from "vitest";

type MockResponse = { data: unknown };

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({
  db: mockDb,
}));

vi.mock("@/lib/cron/scheduler", () => ({
  getLastRefreshAt: vi.fn(() => "2026-04-02T12:10:00.000Z"),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((data: unknown) => ({ data })),
  },
}));

import { GET } from "@/app/api/portfolio/route";

function createChain(result: unknown) {
  return {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
}

describe("GET /api/portfolio?view=learning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns materialized learning records and summary counts", async () => {
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
              inputRefs: JSON.stringify({
                primaryWhaleId: 101,
                whaleIds: [101],
              }),
              output: JSON.stringify({
                ticker: "NVDA",
                thesis: "Momentum and flow remain aligned.",
                direction: "bullish",
                confidence: 0.66,
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
              }),
              confidence: 0.66,
              confidenceBreakdown: JSON.stringify({ composite: 0.61 }),
              createdAt: "2026-04-02T14:01:00.000Z",
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

    const req = {
      nextUrl: new URL("http://localhost/api/portfolio?view=learning&limit=10"),
    };

    const response = await GET(req as unknown as Parameters<typeof GET>[0]);
    const data = (response as unknown as MockResponse).data as {
      learning: {
        records: Array<Record<string, unknown>>;
        manifest: {
          rowCount: number;
          schemaVersion: string;
        };
        summary: {
          total: number;
          byDecision: Record<string, number>;
          byOutcome: Record<string, number>;
          byLineageQuality: Record<string, number>;
          byRewardStatus: Record<string, number>;
        };
        filters: { lineageQuality: string | null; limit: number };
      };
    };

    expect(data.learning.records).toHaveLength(1);
    expect(data.learning.records[0]).toMatchObject({
      metadata: { lineageQuality: "explicit" },
      action: { decision: "enter" },
      outcome: { finalOutcome: "entered", pnlPct: 40 },
    });
    expect(data.learning.summary).toMatchObject({
      total: 1,
      byDecision: { enter: 1 },
      byOutcome: { entered: 1 },
      byLineageQuality: { explicit: 1 },
      byRewardStatus: { computed: 1 },
    });
    expect(data.learning.manifest).toMatchObject({
      rowCount: 1,
      schemaVersion: "v1",
    });
    expect(data.learning.filters.limit).toBe(10);
  });

  it("exports jsonl learning snapshots with a manifest line", async () => {
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
          ]),
        ),
      })
      .mockReturnValueOnce({
        from: vi.fn(() =>
          createChain([
            {
              id: 700,
              ticker: "NVDA",
              shouldEnter: false,
              reasoning: "Capital preservation gate held the trade out.",
              strategyName: "Bull Call Spread",
              legs: null,
              positionSize: null,
              netPremium: null,
              confidence: 0.64,
              whaleQualityScore: 82,
              portfolioBalance: 30000,
              sourceAnalysisId: 900,
              rejectionGate: "capital_preservation",
              rejectionReason: "Open exposure already at limit",
              createdAt: "2026-04-02T14:03:00.000Z",
            },
          ]),
        ),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => createChain([])),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([
            {
              id: 900,
              type: "trade_recommendation",
              inputRefs: JSON.stringify({
                primaryWhaleId: 101,
                whaleIds: [101],
              }),
              output: JSON.stringify({
                ticker: "NVDA",
                thesis: "Momentum and flow remain aligned.",
                direction: "bullish",
                confidence: 0.66,
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
              }),
              confidence: 0.66,
              confidenceBreakdown: JSON.stringify({ composite: 0.61 }),
              createdAt: "2026-04-02T14:01:00.000Z",
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

    const req = {
      nextUrl: new URL(
        "http://localhost/api/portfolio?view=learning&limit=10&format=jsonl",
      ),
    };

    const response = await GET(req as unknown as Parameters<typeof GET>[0]);
    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );

    const body = await (response as Response).text();
    const lines = body.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('"type":"manifest"');
    expect(lines[1]).toContain('"type":"learning_record"');
  });
});
