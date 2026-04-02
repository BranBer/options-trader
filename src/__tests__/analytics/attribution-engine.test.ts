import { describe, expect, it } from "vitest";
import { runAttribution } from "@/lib/analytics/attribution-engine";
import type { TradeRecord } from "@/lib/analytics/attribution-engine";
import type { EvaluationRecord } from "@/lib/analytics/attribution-engine";
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

function createEvaluation(
  overrides?: Partial<EvaluationRecord>,
): EvaluationRecord {
  return {
    ticker: "AAPL",
    shouldEnter: false,
    confidence: 0.62,
    rejectionGate: "concentration",
    rejectionReason: "Sector concentration",
    createdAt: "2026-04-01T12:05:00.000Z",
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
    expect(result.missed[0]?.missReason).toBe("pipeline_not_run");
  });

  it("uses analysis_not_completed when other evaluations exist but this ticker was never evaluated", () => {
    const result = runAttribution(
      [createWhale({ ticker: "SPY", strike: 500 })],
      [],
      [createEvaluation({ ticker: "AAPL" })],
    );

    expect(result.missed[0]?.missReason).toBe("analysis_not_completed");
  });

  it("maps low-quality whales to quality_too_low", () => {
    const result = runAttribution(
      [createWhale({ qualityScore: 35 })],
      [],
      [createEvaluation()],
    );

    expect(result.missed[0]?.missReason).toBe("quality_too_low");
  });

  it("maps concentration rejections from sim evaluations", () => {
    const result = runAttribution([createWhale()], [], [createEvaluation()]);

    expect(result.missed[0]?.missReason).toBe("portfolio_concentration");
  });

  it("maps same-day validation failures to 0dte_rejected", () => {
    const result = runAttribution(
      [createWhale()],
      [],
      [
        createEvaluation({
          rejectionGate: "validation",
          rejectionReason:
            "Leg expires in the past or today: BUY CALL $200 exp 2026-04-01",
        }),
      ],
    );

    expect(result.missed[0]?.missReason).toBe("0dte_rejected");
  });

  it("uses pipeline_not_run when no evaluations exist", () => {
    const result = runAttribution([createWhale()], [], []);

    expect(result.missed[0]?.missReason).toBe("pipeline_not_run");
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
