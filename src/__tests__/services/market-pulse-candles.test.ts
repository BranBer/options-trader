import { describe, expect, it } from "vitest";
import type { CandleData } from "@/types/market";
import {
  computeIndicators,
  deriveKeyLevels,
  deriveTrend,
} from "@/lib/services/market-pulse-candles";

function buildCandles(closes: number[], volumeBase = 1_000): CandleData[] {
  return closes.map((close, index) => ({
    time: 1_700_000_000 + index * 900,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: volumeBase === 0 ? 0 : volumeBase + index * 25,
  }));
}

describe("market-pulse-candles", () => {
  it("computes stable indicators for an upward trend", () => {
    const candles = buildCandles([
      100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114,
      115, 116, 117, 118, 119, 120, 121, 122, 123, 124,
    ]);

    const indicators = computeIndicators(candles);
    const latest = indicators.at(-1);

    expect(latest).toBeDefined();
    expect(latest?.rsi).toBeGreaterThan(70);
    expect(latest?.bbUpper).toBeGreaterThan(latest?.bbLower ?? 0);
    expect(["upper", "mid", "lower"]).toContain(latest?.bbPosition);
    expect(latest?.volumeVsAvg).toBeGreaterThan(1);
    expect(deriveTrend(candles)).toBe("uptrend");
    expect(deriveKeyLevels(candles).length).toBeGreaterThan(0);
  });

  it("falls back to neutral-style indicator defaults for flat candles", () => {
    const candles = buildCandles(new Array(25).fill(100), 0);

    const indicators = computeIndicators(candles);
    const latest = indicators.at(-1);

    expect(latest).toBeDefined();
    expect(latest?.rsi).toBe(50);
    expect(latest?.bbPosition).toBe("mid");
    expect(latest?.volumeVsAvg).toBe(1);
    expect(deriveTrend(candles)).toBe("range");
  });
});
