import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockGetTrackedTickers } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
  mockGetTrackedTickers: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ db: mockDb }));
vi.mock("@/lib/services/market-pulse-scheduler", () => ({
  getTrackedTickers: mockGetTrackedTickers,
  MARKET_PULSE_INTERVAL_MS: 15 * 60 * 1000,
}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) => ({
      data,
      status: init?.status ?? 200,
      json: () => data,
    })),
  },
}));

import { GET } from "@/app/api/market-pulse/route";

function makeRequest(url: string) {
  return {
    nextUrl: new URL(url),
  } as any;
}

function createQueryMock(results: unknown[]) {
  return vi.fn(() => {
    const result = results.shift();
    const promise = Promise.resolve(result);
    const limit = vi.fn().mockResolvedValue(result);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({
      orderBy,
      limit,
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
      finally: promise.finally.bind(promise),
    }));

    return {
      from: vi.fn(() => ({
        where,
        orderBy,
        limit,
      })),
    };
  });
}

describe("GET /api/market-pulse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTrackedTickers.mockResolvedValue(["AAPL"]);
  });

  it("returns ticker state, candidates, and parsed structured data", async () => {
    mockDb.select = createQueryMock([
      [
        {
          runId: "run-aapl-1",
          ticker: "AAPL",
          status: "success",
          startedAt: "2026-04-18T12:00:00.000Z",
          completedAt: "2026-04-18T12:03:00.000Z",
          createdAt: "2026-04-18T12:03:00.000Z",
        },
      ],
      [{ ticker: "MSFT" }],
      [{ tickers: JSON.stringify(["NVDA", "AMD"]) }],
      [
        {
          id: 1,
          candleTime: "2026-04-18T12:00:00.000Z",
          candleData: JSON.stringify({
            open: 100,
            high: 102,
            low: 99,
            close: 101,
            volume: 1000,
          }),
          classification: JSON.stringify({ control: "buyers" }),
          eventBlurb: "Buyers reclaimed control.",
          significance: "high",
          tradability: "actionable",
          level: "candle",
        },
      ],
      [
        {
          id: 10,
          candleTime: "2026-04-18T12:00:00.000Z",
          priceEvent: "Buyers reclaimed control.",
          externalEventType: "news",
          externalEventSummary: "AI headline",
          correlationConfidence: 0.84,
          sentiment: "bullish",
          reasoning: "Aligned with the intraday reversal.",
          externalEventPayload: JSON.stringify({ headline: "AI headline" }),
        },
      ],
      [
        {
          currentControl: "buyers",
          controlStrength: 7,
          marketPhase: "trend",
          expectedBehavior: "continuation",
          narrativeSummary: "Buyers regained control.",
          keyConflicts: JSON.stringify(["Light seller reaction near highs"]),
          confidenceInAssessment: 0.7,
          createdAt: "2026-04-18T12:03:00.000Z",
        },
      ],
    ]);

    const response = await GET(
      makeRequest("http://localhost:3000/api/market-pulse"),
    );
    const data = (response as any).data;

    expect(response.status).toBe(200);
    expect(data.subscriptions).toEqual(["AAPL"]);
    expect(data.candidates).toEqual(["AAPL", "MSFT", "NVDA", "AMD"]);
    expect(data.intervalMs).toBe(900000);
    expect(data.tickers[0]).toMatchObject({
      ticker: "AAPL",
      status: "success",
      lastRunId: "run-aapl-1",
    });
    expect(data.tickers[0].candles[0]).toMatchObject({
      close: 101,
      volume: 1000,
    });
    expect(data.tickers[0].classifications[0].classification).toEqual({
      control: "buyers",
    });
    expect(data.tickers[0].correlations[0].externalEventPayload).toEqual({
      headline: "AI headline",
    });
    expect(data.tickers[0].narrative).toMatchObject({
      currentControl: "buyers",
      keyConflicts: ["Light seller reaction near highs"],
    });
  });
});
