import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────

const mockRefreshTickerDeepDive = vi.fn();

vi.mock("@/lib/services/refresh-deep-dive", () => ({
  refreshTickerDeepDive: (...args: unknown[]) =>
    mockRefreshTickerDeepDive(...args),
  BudgetExceededError: class BudgetExceededError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "BudgetExceededError";
    }
  },
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

import { POST } from "@/app/api/analysis/deep-dive/refresh/route";
import { BudgetExceededError } from "@/lib/services/refresh-deep-dive";

// Helper to create a mock NextRequest
function makeRequest(body: unknown, url = "http://localhost/api/analysis/deep-dive/refresh") {
  return {
    json: async () => body,
    nextUrl: new URL(url),
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === "content-length") return body == null ? "0" : "1";
        return null;
      },
    },
  } as any;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("POST /api/analysis/deep-dive/refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshTickerDeepDive.mockResolvedValue({
      deepDive: {
        ticker: "AAPL",
        risk_assessment: { overall_risk: "moderate" },
      },
      triggerReport: { ticker: "AAPL", overallAssessment: { score: 45 } },
      createdAt: "2026-04-13T00:00:00.000Z",
    });
  });

  it("returns refreshed deep dive on valid request", async () => {
    const response = await POST(makeRequest({ ticker: "AAPL" }));
    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      success: true,
      analysis: { ticker: "AAPL" },
      triggerReport: { ticker: "AAPL" },
      createdAt: expect.any(String),
    });
    expect(mockRefreshTickerDeepDive).toHaveBeenCalledWith("AAPL");
  });

  it("returns 400 for missing ticker", async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
    expect(response.data).toHaveProperty("error");
  });

  it("returns 400 for empty ticker", async () => {
    const response = await POST(makeRequest({ ticker: "   " }));
    expect(response.status).toBe(400);
  });

  it("returns 429 when budget is exceeded", async () => {
    mockRefreshTickerDeepDive.mockRejectedValueOnce(
      new BudgetExceededError("Yahoo API budget too low"),
    );
    const response = await POST(makeRequest({ ticker: "TSLA" }));
    expect(response.status).toBe(429);
    expect(response.data.error).toContain("budget");
  });

  it("returns 500 on unexpected error", async () => {
    mockRefreshTickerDeepDive.mockRejectedValueOnce(
      new Error("Something broke"),
    );
    const response = await POST(makeRequest({ ticker: "NVDA" }));
    expect(response.status).toBe(500);
  });

  it("normalizes ticker to uppercase", async () => {
    await POST(makeRequest({ ticker: "msft" }));
    expect(mockRefreshTickerDeepDive).toHaveBeenCalledWith("MSFT");
  });

  it("accepts ticker from query string when POST body is empty", async () => {
    const response = await POST(
      makeRequest(
        null,
        "http://localhost/api/analysis/deep-dive/refresh?ticker=FLWS",
      ),
    );
    expect(response.status).toBe(200);
    expect(mockRefreshTickerDeepDive).toHaveBeenCalledWith("FLWS");
  });

  it("rate-limits repeated calls for the same ticker", async () => {
    // First call succeeds
    const r1 = await POST(makeRequest({ ticker: "GOOG" }));
    expect(r1.status).toBe(200);

    // Second immediate call should be rate-limited
    const r2 = await POST(makeRequest({ ticker: "GOOG" }));
    expect(r2.status).toBe(429);
    expect(r2.data.error).toContain("cooldown");

    // Different ticker should still work
    const r3 = await POST(makeRequest({ ticker: "AMZN" }));
    expect(r3.status).toBe(200);
  });
});
