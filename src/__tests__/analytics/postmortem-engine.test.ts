import { describe, expect, it } from "vitest";
import { runPostmortemEngine } from "@/lib/analytics/postmortem-engine";
import type { PostmortemTradeInput } from "@/lib/analytics/postmortem-engine";

function createLosingTrade(
  overrides?: Partial<PostmortemTradeInput>,
): PostmortemTradeInput {
  return {
    tradeId: 1,
    ticker: "AAPL",
    direction: "bullish",
    entryDate: "2026-03-01",
    exitDate: "2026-03-15",
    entryPrice: 180,
    exitPrice: 170,
    pnl: -10,
    pnlPct: -5.5,
    ivRegime: "normal",
    technicalAlignment: 0.6,
    earningsDays: 30,
    insiderSentiment: "bullish",
    sectorMomentum: 0.6,
    compositeConfidence: 0.65,
    ...overrides,
  };
}

function createProfitableTrade(
  overrides?: Partial<PostmortemTradeInput>,
): PostmortemTradeInput {
  return {
    tradeId: 2,
    ticker: "SPY",
    direction: "bullish",
    entryDate: "2026-03-01",
    exitDate: "2026-03-15",
    entryPrice: 170,
    exitPrice: 180,
    pnl: 10,
    pnlPct: 5.9,
    ivRegime: "normal",
    technicalAlignment: 0.7,
    earningsDays: 30,
    insiderSentiment: "bullish",
    sectorMomentum: 0.7,
    compositeConfidence: 0.8,
    ...overrides,
  };
}

describe("runPostmortemEngine", () => {
  it("processes profitable trades without postmortem", () => {
    const trades = [createProfitableTrade()];
    const result = runPostmortemEngine(trades);

    expect(result.results.length).toBe(1);
    expect(result.results[0].isLosingTrade).toBe(false);
    expect(result.avoidableCount).toBe(0);
  });

  it("classifies avoidable losing trades", () => {
    const trades = [
      createLosingTrade({
        ivRegime: "elevated",
        earningsDays: 3,
        pnlPct: -15,
      }),
    ];
    const result = runPostmortemEngine(trades);

    expect(result.results.length).toBe(1);
    expect(result.results[0].isLosingTrade).toBe(true);
    expect(result.results[0].isAvoidable).toBe(true);
    expect(result.avoidableCount).toBe(1);
  });

  it("counts unavoidable losses correctly", () => {
    const trades = [
      createLosingTrade({
        ivRegime: "normal",
        earningsDays: 30,
        technicalAlignment: 0.6,
        compositeConfidence: 0.7,
        sectorMomentum: 0.5,
        pnlPct: -3,
      }),
    ];
    const result = runPostmortemEngine(trades);

    expect(result.results[0].isLosingTrade).toBe(true);
    expect(result.results[0].isAvoidable).toBe(false);
    expect(result.unavoidableCount).toBe(1);
  });

  it("generates summary string", () => {
    const trades = [
      createProfitableTrade(),
      createLosingTrade({ pnlPct: -15, earningsDays: 3 }),
    ];
    const result = runPostmortemEngine(trades);

    expect(result.summary).toContain("Postmortem Summary");
    expect(result.summary).toContain("losing trades");
  });
});
