import { describe, expect, it } from "vitest";
import { runAttribution } from "@/lib/analytics/attribution-engine";
import type { TradeRecord } from "@/lib/analytics/attribution-engine";
import type { WhaleAlert } from "@/types/whale";

function createWhale(overrides?: Partial<WhaleAlert>): WhaleAlert {
  return {
    ticker: "AAPL",
    strike: 200,
    expiry: "2026-05-15",
    callPut: "C",
    premium: 200_000,
    volume: 5000,
    openInterest: 1000,
    sentiment: "bullish",
    source: "unusual_whales",
    detectedAt: "2026-04-01T12:00:00.000Z",
    qualityScore: 85,
    ...overrides,
  };
}

function createTrade(overrides?: Partial<TradeRecord>): TradeRecord {
  return {
    id: 1,
    ticker: "AAPL",
    entryDate: "2026-04-01",
    exitDate: "2026-04-15",
    strike: 200,
    expiry: "2026-05-15",
    entryPrice: 5.0,
    exitPrice: 7.0,
    pnl: 200,
    pnlPct: 40,
    status: "closed",
    ...overrides,
  };
}

describe("runAttribution", () => {
  it("identifies captured opportunities when trade matches whale", () => {
    const whales = [createWhale()];
    const trades = [createTrade()];

    const result = runAttribution(whales, trades);

    expect(result.captured.length).toBe(1);
    expect(result.missed.length).toBe(0);
    expect(result.captureRate).toBe(100);
  });

  it("identifies missed opportunities when no trade matches", () => {
    const whales = [createWhale(), createWhale({ ticker: "SPY", strike: 500 })];
    const trades = [createTrade()];

    const result = runAttribution(whales, trades);

    expect(result.captured.length).toBe(1);
    expect(result.missed.length).toBe(1);
    expect(result.captureRate).toBe(50);
  });

  it("skips open trades", () => {
    const whales = [createWhale()];
    const trades = [createTrade({ status: "open", exitDate: null })];

    const result = runAttribution(whales, trades);

    // Open trade should be skipped, whale is not captured yet
    expect(result.captured.length).toBe(0);
    expect(result.missed.length).toBe(0);
  });

  it("generates summary string", () => {
    const whales = [createWhale()];
    const trades = [createTrade()];

    const result = runAttribution(whales, trades);

    expect(result.summary).toContain("Attribution Summary");
    expect(result.summary).toContain("Captured");
    expect(result.summary).toContain("AAPL");
  });
});
