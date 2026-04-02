import { describe, expect, it } from "vitest";
import { buildAlertCorrelations } from "@/lib/analytics/alert-correlation";

describe("buildAlertCorrelations", () => {
  it("links a whale alert to the nearest evaluation and matching trade", () => {
    const correlations = buildAlertCorrelations({
      whales: [
        {
          id: 101,
          ticker: "NVDA",
          strike: 950,
          expiry: "2026-04-17",
          callPut: "C",
          premium: 250000,
          volume: 1000,
          openInterest: 500,
          sentiment: "bullish",
          source: "uw",
          detectedAt: "2026-04-02T14:00:00.000Z",
          qualityScore: 82,
        },
      ],
      evaluations: [
        {
          ticker: "NVDA",
          shouldEnter: false,
          confidence: 0.61,
          rejectionGate: "concentration",
          rejectionReason: "Directional concentration",
          createdAt: "2026-04-02T14:03:00.000Z",
          primaryWhaleId: 101,
          whaleIds: [101],
        },
      ],
      trades: [
        {
          id: 11,
          ticker: "NVDA",
          entryDate: "2026-04-02T14:05:00.000Z",
          exitDate: null,
          strike: 950,
          expiry: "2026-04-17",
          entryPrice: 4.5,
          exitPrice: null,
          pnl: null,
          pnlPct: null,
          status: "open",
          sourceWhaleId: 101,
        },
      ],
    });

    expect(correlations).toHaveLength(1);
    expect(correlations[0]).toMatchObject({
      ticker: "NVDA",
      evaluatedAt: "2026-04-02T14:03:00.000Z",
      rejectionGate: "concentration",
      tradeId: 11,
      tradeStatus: "open",
    });
  });

  it("returns null lifecycle fields when no evaluation or trade exists", () => {
    const correlations = buildAlertCorrelations({
      whales: [
        {
          id: 222,
          ticker: "SPY",
          strike: 500,
          expiry: "2026-04-17",
          callPut: "P",
          premium: 150000,
          volume: 800,
          openInterest: 450,
          sentiment: "bearish",
          source: "uw",
          detectedAt: "2026-04-02T15:00:00.000Z",
          qualityScore: 78,
        },
      ],
      evaluations: [],
      trades: [],
    });

    expect(correlations[0]).toMatchObject({
      ticker: "SPY",
      evaluatedAt: null,
      shouldEnter: null,
      tradeId: null,
      tradeStatus: null,
    });
  });
});
