import { describe, expect, it } from "vitest";
import {
  classifyPostmortem,
  formatPostmortemSummary,
} from "@/lib/analytics/bad-trade-postmortem";
import type { PostmortemInput } from "@/lib/analytics/bad-trade-postmortem";

function createLosingTrade(
  overrides?: Partial<PostmortemInput>,
): PostmortemInput {
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
  overrides?: Partial<PostmortemInput>,
): PostmortemInput {
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

describe("classifyPostmortem", () => {
  it("returns no postmortem needed for profitable trades", () => {
    const result = classifyPostmortem(createProfitableTrade());
    expect(result.isLosingTrade).toBe(false);
    expect(result.isAvoidable).toBe(false);
    expect(result.riskScore).toBe(0);
  });

  it("classifies iv crush entry as avoidable", () => {
    const result = classifyPostmortem(
      createLosingTrade({
        ivRegime: "elevated",
        earningsDays: 3,
        pnlPct: -15,
      }),
    );
    expect(result.isLosingTrade).toBe(true);
    expect(result.isAvoidable).toBe(true);
    expect(result.avoidableCategory).toBe("iv_crush_entry");
    expect(result.riskScore).toBeGreaterThan(0);
  });

  it("classifies earnings proximity as avoidable", () => {
    const result = classifyPostmortem(
      createLosingTrade({
        earningsDays: 2,
        pnlPct: -8,
      }),
    );
    expect(result.isLosingTrade).toBe(true);
    expect(result.isAvoidable).toBe(true);
    expect(result.avoidableCategory).toBe("earnings_proximity");
  });

  it("classifies technical contradiction as avoidable", () => {
    const result = classifyPostmortem(
      createLosingTrade({
        direction: "bullish",
        technicalAlignment: 0.2,
        pnlPct: -3, // Small loss — below wrong_direction threshold (-5)
      }),
    );
    expect(result.isLosingTrade).toBe(true);
    expect(result.isAvoidable).toBe(true);
    expect(result.avoidableCategory).toBe("technical_contradiction");
  });

  it("classifies liquidity mismatch when low confidence and large loss", () => {
    const result = classifyPostmortem(
      createLosingTrade({
        compositeConfidence: 0.3,
        pnlPct: -15,
      }),
    );
    expect(result.isLosingTrade).toBe(true);
    expect(result.isAvoidable).toBe(true);
    expect(result.avoidableCategory).toBe("liquidity_mismatch");
  });

  it("classifies market regime mismatch", () => {
    const result = classifyPostmortem(
      createLosingTrade({
        direction: "bullish",
        sectorMomentum: 0.2,
        pnlPct: -5,
      }),
    );
    expect(result.isLosingTrade).toBe(true);
    expect(result.isAvoidable).toBe(true);
    expect(result.avoidableCategory).toBe("market_regime_mismatch");
  });

  it("marks losses with no warning signals as unavoidable", () => {
    const result = classifyPostmortem(
      createLosingTrade({
        ivRegime: "normal",
        earningsDays: 30,
        technicalAlignment: 0.6,
        compositeConfidence: 0.7,
        sectorMomentum: 0.5,
        pnlPct: -3,
      }),
    );
    expect(result.isLosingTrade).toBe(true);
    expect(result.isAvoidable).toBe(false);
    expect(result.avoidableCategory).toBeNull();
  });

  it("includes pre-trade warnings in result", () => {
    const result = classifyPostmortem(
      createLosingTrade({
        ivRegime: "elevated",
        earningsDays: 3,
        pnlPct: -15,
      }),
    );
    expect(result.preTradeWarnings.length).toBeGreaterThan(0);
    expect(result.explanation).toContain("avoidable");
  });
});

describe("formatPostmortemSummary", () => {
  it("generates a summary string", () => {
    const results = [
      classifyPostmortem(createProfitableTrade()),
      classifyPostmortem(createLosingTrade({ pnlPct: -15, earningsDays: 3 })),
      classifyPostmortem(
        createLosingTrade({
          pnlPct: -8,
          direction: "bullish",
          technicalAlignment: 0.2,
        }),
      ),
    ];

    const summary = formatPostmortemSummary(results);
    expect(summary).toContain("Postmortem Summary");
    expect(summary).toContain("losing trades");
    expect(summary).toContain("Avoidable losses");
  });
});
