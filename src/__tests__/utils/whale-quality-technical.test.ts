import { describe, it, expect } from "vitest";
import {
  scoreWhaleQuality,
  computeTechnicalAlignmentScore,
} from "@/lib/utils/whale-quality";
import type { WhaleAlert } from "@/types/whale";

function createMockWhale(overrides?: Partial<WhaleAlert>): WhaleAlert {
  return {
    ticker: "AAPL",
    strike: 200,
    expiry: "2025-05-16",
    callPut: "C",
    premium: 500000,
    volume: 2000,
    openInterest: 1000,
    underlyingPrice: 190,
    sentiment: "bullish",
    source: "test",
    detectedAt: new Date().toISOString(),
    qualityScore: undefined,
    delta: undefined,
    gamma: undefined,
    theta: undefined,
    vega: undefined,
    impliedVolatility: undefined,
    breakEvenPrice: undefined,
    ...overrides,
  };
}

describe("Whale Quality with Technical Indicators", () => {
  it("increases quality score when whale sentiment aligns with bullish patterns", () => {
    const bullishWhale = createMockWhale({
      sentiment: "bullish",
      underlyingPrice: 190,
      strike: 200,
    });

    // With bullish technical data
    const withTech = scoreWhaleQuality(bullishWhale, 190, {
      price: 190,
      sma20: 185, // Price above SMA = bullish
      rsi: 60, // RSI > 50 = bullish momentum
      supportLevels: [185],
      resistanceLevels: [200],
    });

    // Without technical data
    const withoutTech = scoreWhaleQuality(bullishWhale, 190);

    expect(withTech).toBeGreaterThan(withoutTech);
  });

  it("decreases quality score when whale sentiment contradicts patterns", () => {
    const bullishWhale = createMockWhale({
      sentiment: "bullish",
      underlyingPrice: 190,
      strike: 200,
    });

    // With bearish technical data (price below SMA)
    const withBearishTech = scoreWhaleQuality(bullishWhale, 190, {
      price: 190,
      sma20: 195, // Price below SMA = bearish
      rsi: 40, // RSI < 50 = bearish momentum
      supportLevels: [180],
      resistanceLevels: [195],
    });

    // Without technical data
    const withoutTech = scoreWhaleQuality(bullishWhale, 190);

    expect(withBearishTech).toBeLessThan(withoutTech);
  });

  it("uses neutral score when no technical data available", () => {
    const whale = createMockWhale();
    const score = scoreWhaleQuality(whale, 190);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("handles empty support/resistance arrays", () => {
    const whale = createMockWhale();
    const score = scoreWhaleQuality(whale, 190, {
      price: 190,
      sma20: 185,
      rsi: 60,
      supportLevels: [],
      resistanceLevels: [],
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("handles null SMA and RSI values", () => {
    const whale = createMockWhale();
    const score = scoreWhaleQuality(whale, 190, {
      price: 190,
      sma20: null,
      rsi: null,
      supportLevels: [185],
      resistanceLevels: [200],
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe("computeTechnicalAlignmentScore", () => {
  it("returns 100 when all factors confirm bullish direction", () => {
    const bullishWhale = createMockWhale({ sentiment: "bullish" });
    const score = computeTechnicalAlignmentScore(bullishWhale, {
      price: 190,
      sma20: 185, // Above SMA
      rsi: 60, // RSI > 50
      supportLevels: [188], // Within 2% of 190 (|190-188|/190 = 1.05%)
      resistanceLevels: [],
    });
    expect(score).toBe(100);
  });

  it("returns low score when factors contradict bullish direction", () => {
    const bullishWhale = createMockWhale({ sentiment: "bullish" });
    const score = computeTechnicalAlignmentScore(bullishWhale, {
      price: 190,
      sma20: 195, // Below SMA
      rsi: 40, // RSI < 50
      supportLevels: [],
      resistanceLevels: [195], // Near resistance (bad for bullish)
    });
    expect(score).toBeLessThan(50);
  });

  it("returns 50 when no technical data available", () => {
    const whale = createMockWhale();
    const score = computeTechnicalAlignmentScore(whale, {
      price: 190,
      sma20: null,
      rsi: null,
      supportLevels: [],
      resistanceLevels: [],
    });
    expect(score).toBe(50);
  });

  it("handles bearish whale with confirming bearish technicals", () => {
    const bearishWhale = createMockWhale({ sentiment: "bearish" });
    const score = computeTechnicalAlignmentScore(bearishWhale, {
      price: 190,
      sma20: 195, // Below SMA = bearish (confirms)
      rsi: 40, // RSI < 50 = bearish (confirms)
      supportLevels: [188], // Within 2% of 190
      resistanceLevels: [],
    });
    expect(score).toBe(100);
  });
});
