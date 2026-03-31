import { describe, it, expect } from "vitest";
import {
  inferSentiment,
  computeMarketPulse,
} from "@/lib/utils/sentiment-inference";
import type { WhaleAlert } from "@/types/whale";

function makeAlert(overrides: Partial<WhaleAlert> = {}): WhaleAlert {
  return {
    ticker: "AAPL",
    strike: 200,
    expiry: "2026-04-18",
    callPut: "C",
    premium: 500_000,
    volume: 5000,
    openInterest: 1000,
    sentiment: "bullish",
    source: "polygon",
    detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("inferSentiment", () => {
  it("returns bullish for a standard OTM call", () => {
    const result = inferSentiment(makeAlert(), 190);
    expect(result.inferred).toMatch(/bullish/);
  });

  it("returns bearish for a standard OTM put", () => {
    const result = inferSentiment(
      makeAlert({ callPut: "P", sentiment: "bearish", strike: 180 }),
      190,
    );
    expect(result.inferred).toMatch(/bearish/);
  });

  it("amplifies bullish signal with low delta call", () => {
    const result = inferSentiment(makeAlert({ delta: 0.15 }), 190);
    expect(result.inferred).toBe("strongly_bullish");
  });

  it("dampens bullish signal for deep ITM call (high delta)", () => {
    const result = inferSentiment(makeAlert({ delta: 0.85, strike: 150 }), 190);
    // Should not be strongly bullish — could be a hedge
    expect(result.inferred).not.toBe("strongly_bullish");
  });

  it("amplifies bearish signal with low delta put", () => {
    const result = inferSentiment(
      makeAlert({
        callPut: "P",
        sentiment: "bearish",
        strike: 150,
        delta: -0.1,
      }),
      190,
    );
    expect(result.inferred).toBe("strongly_bearish");
  });

  it("detects speculative intent for far OTM + high vol/OI", () => {
    const result = inferSentiment(
      makeAlert({ strike: 250, volume: 5000, openInterest: 500 }),
      190,
    );
    expect(result.intent).toBe("speculative");
  });

  it("detects institutional intent for large premium near ATM", () => {
    const result = inferSentiment(
      makeAlert({ strike: 191, premium: 2_000_000 }),
      190,
    );
    expect(result.intent).toBe("institutional");
  });

  it("detects hedge intent for deep ITM option", () => {
    const result = inferSentiment(makeAlert({ strike: 150 }), 190);
    expect(result.intent).toBe("hedge");
  });

  it("high vol/OI ratio gives high confidence", () => {
    const result = inferSentiment(
      makeAlert({ volume: 10000, openInterest: 500, premium: 1_500_000 }),
      190,
    );
    expect(result.confidence).toBe("high");
  });

  it("low vol/OI and small premium gives low confidence", () => {
    const result = inferSentiment(
      makeAlert({ volume: 200, openInterest: 500, premium: 100_000 }),
      190,
    );
    expect(result.confidence).toBe("low");
  });
});

describe("computeMarketPulse", () => {
  it("computes correct P/C ratio", () => {
    const alerts = [
      makeAlert({ callPut: "C", premium: 500_000 }),
      makeAlert({ callPut: "C", premium: 300_000 }),
      makeAlert({ callPut: "P", premium: 200_000, sentiment: "bearish" }),
    ];
    const pulse = computeMarketPulse(alerts);
    expect(pulse.callCount).toBe(2);
    expect(pulse.putCount).toBe(1);
    expect(pulse.pcRatio).toBe(0.5);
    expect(pulse.callPremium).toBe(800_000);
    expect(pulse.putPremium).toBe(200_000);
  });

  it("labels extreme bullish when no puts", () => {
    const alerts = [
      makeAlert({ callPut: "C", premium: 500_000 }),
      makeAlert({ callPut: "C", premium: 300_000 }),
    ];
    const pulse = computeMarketPulse(alerts);
    expect(pulse.sentimentLabel).toBe("Extreme Bullish Skew");
    expect(pulse.pcRatio).toBe(0);
  });

  it("highlights top bearish signals", () => {
    const alerts = [
      makeAlert({ callPut: "C", premium: 500_000 }),
      makeAlert({
        callPut: "P",
        ticker: "NVDA",
        strike: 170,
        premium: 1_000_000,
        sentiment: "bearish",
      }),
      makeAlert({
        callPut: "P",
        ticker: "SPY",
        strike: 510,
        premium: 500_000,
        sentiment: "bearish",
      }),
    ];
    const pulse = computeMarketPulse(alerts);
    expect(pulse.topBearishSignals).toHaveLength(2);
    expect(pulse.topBearishSignals[0].ticker).toBe("NVDA");
    expect(pulse.topBearishSignals[0].premium).toBe(1_000_000);
  });

  it("net sentiment score reflects premium balance", () => {
    const alerts = [
      makeAlert({ callPut: "C", premium: 900_000 }),
      makeAlert({ callPut: "P", premium: 100_000, sentiment: "bearish" }),
    ];
    const pulse = computeMarketPulse(alerts);
    // (900k - 100k) / 1M * 100 = 80
    expect(pulse.netSentimentScore).toBe(80);
  });

  it("handles empty alerts", () => {
    const pulse = computeMarketPulse([]);
    expect(pulse.totalAlerts).toBe(0);
    expect(pulse.pcRatio).toBe(0);
    expect(pulse.netSentimentScore).toBe(0);
  });
});
