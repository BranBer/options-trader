import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so the mock fn exists before vi.mock's factory runs
const { mockQuoteSummary } = vi.hoisted(() => ({
  mockQuoteSummary: vi.fn(),
}));

vi.mock("yahoo-finance2", () => {
  return {
    default: class {
      quoteSummary = mockQuoteSummary;
    },
  };
});

import { fetchEpsSurprise } from "@/lib/services/market-fetcher";

describe("fetchEpsSurprise", () => {
  beforeEach(() => {
    mockQuoteSummary.mockReset();
  });

  it("returns EPS surprise for a beat", async () => {
    mockQuoteSummary.mockResolvedValue({
      earningsHistory: {
        history: [
          {
            quarter: new Date("2024-09-30"),
            epsActual: 1.64,
            epsEstimate: 1.5,
          },
          {
            quarter: new Date("2024-12-31"),
            epsActual: 2.18,
            epsEstimate: 2.0,
          },
        ],
      },
    });

    const result = await fetchEpsSurprise("AAPL");
    expect(result).not.toBeNull();
    expect(result!.epsActual).toBe(2.18);
    expect(result!.epsEstimate).toBe(2.0);
    // (2.18 - 2.0) / 2.0 * 100 = 9%
    expect(result!.epsSurprisePct).toBe(9);
    expect(result!.quarter).toBe("2024-12-31");
  });

  it("returns negative surprise for a miss", async () => {
    mockQuoteSummary.mockResolvedValue({
      earningsHistory: {
        history: [
          {
            quarter: new Date("2025-03-31"),
            epsActual: 0.85,
            epsEstimate: 1.0,
          },
        ],
      },
    });

    const result = await fetchEpsSurprise("INTC");
    expect(result).not.toBeNull();
    expect(result!.epsSurprisePct).toBe(-15);
    expect(result!.epsActual).toBe(0.85);
    expect(result!.epsEstimate).toBe(1.0);
  });

  it("handles raw-wrapped values from yahoo-finance2", async () => {
    mockQuoteSummary.mockResolvedValue({
      earningsHistory: {
        history: [
          {
            quarter: "2025-03-31",
            epsActual: { raw: 3.5, fmt: "3.50" },
            epsEstimate: { raw: 3.0, fmt: "3.00" },
          },
        ],
      },
    });

    const result = await fetchEpsSurprise("NVDA");
    expect(result).not.toBeNull();
    // (3.5 - 3.0) / 3.0 * 100 = 16.67%
    expect(result!.epsSurprisePct).toBeCloseTo(16.67, 1);
  });

  it("returns null when earningsHistory is missing", async () => {
    mockQuoteSummary.mockResolvedValue({});
    const result = await fetchEpsSurprise("XYZ");
    expect(result).toBeNull();
  });

  it("returns null when history array is empty", async () => {
    mockQuoteSummary.mockResolvedValue({
      earningsHistory: { history: [] },
    });
    const result = await fetchEpsSurprise("XYZ");
    expect(result).toBeNull();
  });

  it("returns null when epsActual is missing", async () => {
    mockQuoteSummary.mockResolvedValue({
      earningsHistory: {
        history: [
          {
            quarter: new Date("2025-03-31"),
            epsActual: null,
            epsEstimate: 1.0,
          },
        ],
      },
    });
    const result = await fetchEpsSurprise("XYZ");
    expect(result).toBeNull();
  });

  it("handles zero estimate gracefully", async () => {
    mockQuoteSummary.mockResolvedValue({
      earningsHistory: {
        history: [
          {
            quarter: new Date("2025-03-31"),
            epsActual: 0.5,
            epsEstimate: 0.0,
          },
        ],
      },
    });

    const result = await fetchEpsSurprise("TINY");
    expect(result).not.toBeNull();
    // When estimate is ~0, should return +100% for a beat
    expect(result!.epsSurprisePct).toBe(100);
  });

  it("returns null on fetch failure", async () => {
    mockQuoteSummary.mockRejectedValue(new Error("Network error"));
    const result = await fetchEpsSurprise("FAIL");
    expect(result).toBeNull();
  });
});
