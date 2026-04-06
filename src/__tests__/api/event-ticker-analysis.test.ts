import { beforeEach, describe, expect, it, vi } from "vitest";

type MockResponse = { data: unknown; init?: { status?: number } };

const { mockDb, mockAnalyzeEventTickers, mockGetEventTickerAnalysesByEventId } =
  vi.hoisted(() => ({
    mockDb: {
      select: vi.fn(),
    },
    mockAnalyzeEventTickers: vi.fn(),
    mockGetEventTickerAnalysesByEventId: vi.fn(),
  }));

vi.mock("@/lib/db/client", () => ({
  db: mockDb,
}));

vi.mock("@/lib/services/event-ticker-analyzer", () => ({
  analyzeEventTickers: mockAnalyzeEventTickers,
  getEventTickerAnalysesByEventId: mockGetEventTickerAnalysesByEventId,
  HOURS_TO_CACHE: 2,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) => ({
      data,
      init,
    })),
  },
}));

import { GET, POST } from "@/app/api/analysis/event-tickers/route";

function eventRequest(body: unknown): { json: () => Promise<unknown> } {
  return {
    json: async () => body,
  };
}

function createEventExistsChain(result: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

describe("/api/analysis/event-tickers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached analyses on POST when all requested tickers are already cached", async () => {
    mockDb.select.mockImplementationOnce(() =>
      createEventExistsChain([{ id: 101 }]),
    );
    mockGetEventTickerAnalysesByEventId.mockResolvedValue([
      {
        ticker: "AAPL",
        eventId: 101,
        eventContext: {
          headline: "Policy update supports AAPL",
          sentiment: "bullish",
          impactScore: 8,
        },
        marketSnapshot: null,
        optionsSummary: null,
        deepDive: { ticker: "AAPL" },
        recommendation: { ticker: "AAPL" },
        whaleMatch: {
          hasWhaleActivity: false,
          alerts: [],
          bestQualityScore: null,
        },
        source: "event_ticker",
      },
    ]);

    const response = (await POST(
      eventRequest({
        eventId: 101,
        tickers: ["AAPL"],
        eventContext: {
          headline: "Policy update supports AAPL",
          sentiment: "bullish",
          impactScore: 8,
        },
      }) as any,
    )) as MockResponse;

    expect((response.data as any).cached).toBe(true);
    expect(mockAnalyzeEventTickers).not.toHaveBeenCalled();
  });

  it("returns 404 when the event does not exist", async () => {
    mockDb.select.mockImplementationOnce(() => createEventExistsChain([]));

    const response = (await POST(
      eventRequest({
        eventId: 999,
        tickers: ["AAPL"],
        eventContext: {
          headline: "Missing event",
          sentiment: "bullish",
          impactScore: 8,
        },
      }) as any,
    )) as MockResponse;

    expect(response.init?.status).toBe(404);
  });

  it("returns 400 for invalid POST bodies", async () => {
    const response = (await POST(
      eventRequest({
        eventId: 0,
        tickers: [],
      }) as any,
    )) as MockResponse;

    expect(response.init?.status).toBe(400);
  });

  it("normalizes oversized ticker lists to the first five unique symbols", async () => {
    mockDb.select.mockImplementationOnce(() =>
      createEventExistsChain([
        {
          id: 101,
          headline: "Policy update supports AAPL",
          rawSummary: "Semis recover.",
          sentiment: "bullish",
          impactScore: 8,
          eventType: "regulatory",
          sectors: JSON.stringify(["Technology"]),
          tickers: JSON.stringify([
            "AAPL",
            "MSFT",
            "NVDA",
            "AMD",
            "TSLA",
            "META",
          ]),
        },
      ]),
    );
    mockGetEventTickerAnalysesByEventId.mockResolvedValue([]);
    mockAnalyzeEventTickers.mockResolvedValue([]);

    const response = (await POST(
      eventRequest({
        eventId: 101,
        tickers: ["AAPL", "MSFT", "NVDA", "AMD", "TSLA", "META"],
      }) as any,
    )) as MockResponse;

    expect(response.init?.status).toBeUndefined();
    expect(mockAnalyzeEventTickers).toHaveBeenCalledWith(
      expect.objectContaining({
        tickers: ["AAPL", "MSFT", "NVDA", "AMD", "TSLA"],
        eventContext: expect.objectContaining({
          headline: "Policy update supports AAPL",
          sentiment: "bullish",
          impactScore: 8,
        }),
      }),
    );
  });

  it("returns cached analyses on GET", async () => {
    mockGetEventTickerAnalysesByEventId.mockResolvedValue([
      {
        ticker: "AAPL",
        eventId: 101,
        eventContext: {
          headline: "Policy update supports AAPL",
          sentiment: "bullish",
          impactScore: 8,
        },
        marketSnapshot: null,
        optionsSummary: null,
        deepDive: { ticker: "AAPL" },
        recommendation: { ticker: "AAPL" },
        whaleMatch: {
          hasWhaleActivity: false,
          alerts: [],
          bestQualityScore: null,
        },
        source: "event_ticker",
      },
    ]);

    const response = (await GET({
      nextUrl: {
        searchParams: new URLSearchParams({ eventId: "101" }),
      },
    } as any)) as MockResponse;

    expect((response.data as any).analyses).toHaveLength(1);
    expect((response.data as any).cached).toBe(true);
  });
});
