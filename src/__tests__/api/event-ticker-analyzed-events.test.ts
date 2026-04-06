import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetAnalyzedEventIds, mockGetAnalyzedEventSummaries } = vi.hoisted(
  () => ({
    mockGetAnalyzedEventIds: vi.fn(),
    mockGetAnalyzedEventSummaries: vi.fn(),
  }),
);

vi.mock("@/lib/services/event-ticker-analyzer", () => ({
  getAnalyzedEventIds: mockGetAnalyzedEventIds,
  getAnalyzedEventSummaries: mockGetAnalyzedEventSummaries,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) => ({
      data,
      init,
    })),
  },
}));

import { GET } from "@/app/api/analysis/event-tickers/analyzed-events/route";

describe("GET /api/analysis/event-tickers/analyzed-events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns analyzed event ids and recent summaries", async () => {
    mockGetAnalyzedEventIds.mockResolvedValue([101, 102]);
    mockGetAnalyzedEventSummaries.mockResolvedValue([
      {
        eventId: 101,
        headline: "Policy shift helps AAPL",
        tickers: ["AAPL"],
        createdAt: "2026-04-06T12:00:00.000Z",
      },
    ]);

    const response = (await GET()) as { data: unknown };
    expect(response.data).toEqual({
      analyzedEventIds: [101, 102],
      recentAnalyses: [
        {
          eventId: 101,
          headline: "Policy shift helps AAPL",
          tickers: ["AAPL"],
          createdAt: "2026-04-06T12:00:00.000Z",
        },
      ],
    });
  });
});
