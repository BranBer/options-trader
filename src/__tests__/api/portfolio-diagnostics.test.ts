import { beforeEach, describe, expect, it, vi } from "vitest";

type MockResponse = { data: unknown };
const { mockDb, mockGetLastRefreshAt } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
  mockGetLastRefreshAt: vi.fn(() => "2026-04-02T12:10:00.000Z"),
}));

vi.mock("@/lib/db/client", () => ({
  db: mockDb,
}));

vi.mock("@/lib/cron/scheduler", () => ({
  getLastRefreshAt: mockGetLastRefreshAt,
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

describe("GET /api/portfolio?view=diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns filtered diagnostics traces with page info and summary", async () => {
    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn(() =>
          createChain([
            {
              id: 101,
              ticker: "NVDA",
              strike: 950,
              expiry: "2026-04-17",
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
              ticker: "NVDA",
              shouldEnter: false,
              confidence: 0.61,
              rejectionGate: "llm_eval",
              rejectionReason: "confidence too low",
              createdAt: "2026-04-02T14:03:00.000Z",
              sourceAnalysisId: 900,
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
              inputRefs: JSON.stringify({
                primaryWhaleId: 101,
                whaleIds: [101],
              }),
            },
          ]),
        })),
      });

    const req = {
      nextUrl: new URL(
        "http://localhost/api/portfolio?view=diagnostics&outcome=rejected&limit=10",
      ),
    };

    const response = await GET(req as unknown as Parameters<typeof GET>[0]);
    const data = (response as unknown as MockResponse).data as {
      diagnostics: {
        traces: Array<Record<string, unknown>>;
        summary: { byOutcome: Record<string, number> };
        pageInfo: { limit: number; hasMore: boolean };
        filters: { outcome: string | null };
      };
    };

    expect(data).toHaveProperty("diagnostics");
    expect(data.diagnostics.traces).toHaveLength(1);
    expect(data.diagnostics.traces[0]).toMatchObject({
      alertId: 101,
      ticker: "NVDA",
      finalOutcome: "rejected",
      reasonCluster: "confidence_threshold",
      primaryReason: "confidence too low",
    });
    expect(data.diagnostics.summary.byOutcome.rejected).toBe(1);
    expect(data.diagnostics.pageInfo).toMatchObject({
      limit: 10,
      hasMore: false,
    });
    expect(data.diagnostics.filters.outcome).toBe("rejected");
  });

  it("filters diagnostics traces by reason cluster", async () => {
    mockDb.select
      .mockReturnValueOnce({
        from: vi.fn(() =>
          createChain([
            {
              id: 101,
              ticker: "NVDA",
              strike: 950,
              expiry: "2026-04-17",
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
              ticker: "NVDA",
              shouldEnter: false,
              confidence: 0.61,
              rejectionGate: "market_data",
              rejectionReason: "Missing market data for options chain",
              createdAt: "2026-04-02T14:03:00.000Z",
              sourceAnalysisId: 900,
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
              inputRefs: JSON.stringify({
                primaryWhaleId: 101,
                whaleIds: [101],
              }),
            },
          ]),
        })),
      });

    const req = {
      nextUrl: new URL(
        "http://localhost/api/portfolio?view=diagnostics&reasonCluster=missing_market_data&limit=10",
      ),
    };

    const response = await GET(req as unknown as Parameters<typeof GET>[0]);
    const data = (response as unknown as MockResponse).data as {
      diagnostics: {
        traces: Array<Record<string, unknown>>;
        filters: { reasonCluster: string | null };
      };
    };

    expect(data.diagnostics.traces).toHaveLength(1);
    expect(data.diagnostics.traces[0]).toMatchObject({
      ticker: "NVDA",
      reasonCluster: "missing_market_data",
      primaryReason: "Missing market data for options chain",
    });
    expect(data.diagnostics.filters.reasonCluster).toBe("missing_market_data");
  });
});
