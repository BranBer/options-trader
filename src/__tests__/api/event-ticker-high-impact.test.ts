import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockBackfillRecentHighImpactEventAnalyses } = vi.hoisted(() => ({
  mockBackfillRecentHighImpactEventAnalyses: vi.fn(),
}));

vi.mock("@/lib/services/event-ticker-analyzer", () => ({
  backfillRecentHighImpactEventAnalyses:
    mockBackfillRecentHighImpactEventAnalyses,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) => ({
      data,
      init,
    })),
  },
}));

import { POST } from "@/app/api/analysis/event-tickers/high-impact/route";

describe("POST /api/analysis/event-tickers/high-impact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the number of triggered backfill analyses", async () => {
    mockBackfillRecentHighImpactEventAnalyses.mockResolvedValue(2);

    const response = (await POST()) as { data: unknown };

    expect(response.data).toEqual({ triggered: 2 });
  });
});
