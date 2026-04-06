import { describe, expect, it } from "vitest";
import {
  detectAllIndicatorPatterns,
  detectBollingerPatterns,
  detectCombinationPatterns,
  detectEMAPatterns,
  detectRSIPatterns,
  type CombinationPattern,
  type IndicatorPattern,
} from "@/lib/utils/indicator-patterns";
import {
  bollingerBands,
  ema,
  rsi,
  type Candle,
} from "@/lib/utils/technical-indicators";

function makeCandles(closes: number[], volume = 1000): Candle[] {
  return closes.map((close, index) => ({
    time: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    open: index === 0 ? close : closes[index - 1],
    high: close + 1,
    low: close - 1,
    close,
    volume,
  }));
}

function patternIds(patterns: IndicatorPattern[]): string[] {
  return patterns.map((pattern) => pattern.patternId);
}

describe("indicator pattern detection", () => {
  it("detects EMA cross and bullish alignment in a reversal series", () => {
    const closes = [
      100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83,
      84, 85, 86, 88, 90, 92, 94, 96, 98, 100, 102, 104, 106, 108, 110, 112,
      114, 116, 118, 120, 122, 124,
    ];
    const candles = makeCandles(closes);
    const ema9 = ema(closes, 9);
    const ema21 = ema(closes, 21);

    const patterns = detectEMAPatterns({ candles, closes, ema9, ema21 });

    expect(patternIds(patterns)).toContain("ema_golden_cross");
    expect(patternIds(patterns)).toContain("ema_bullish_alignment");
  });

  it("detects a Bollinger squeeze on the compressed portion of the chart", () => {
    const closes = [
      100, 100.2, 99.9, 100.1, 100, 100.1, 99.95, 100.05, 100.02, 99.98, 100.03,
      99.97, 100.01, 99.99, 100.02, 100.01, 99.98, 100.04, 100.02, 100, 100.01,
      99.99, 100.02, 100.01, 100.03, 100.06, 100.08, 100.1, 100.15, 103,
    ];
    const candles = makeCandles(closes, 1200);
    const bands = bollingerBands(closes);

    const patterns = detectBollingerPatterns({ candles, closes, bands });

    expect(patternIds(patterns)).toContain("bb_squeeze");
  });

  it("detects bullish RSI divergence from handcrafted pivot lows", () => {
    const closes = [
      100, 98, 96, 94, 97, 95, 93, 96, 92, 95, 98, 100, 102, 104, 106, 108,
    ];
    const candles = makeCandles(closes);
    const rsiValues = [
      60, 55, 45, 30, 48, 42, 38, 50, 36, 52, 58, 60, 62, 64, 66, 68,
    ];

    const patterns = detectRSIPatterns({ candles, closes, values: rsiValues });

    expect(patternIds(patterns)).toContain("rsi_bullish_divergence");
  });

  it("detects combination patterns when the constituent signals are recent", () => {
    const patterns: IndicatorPattern[] = [
      {
        indicator: "ema",
        name: "EMA 9 / EMA 21 Golden Cross",
        patternId: "ema_golden_cross",
        signal: "bullish",
        confidence: 0.8,
        detectedAt: 28,
        detectedDate: "2026-01-29T00:00:00.000Z",
        description: "test",
        isRecent: true,
      },
      {
        indicator: "volume",
        name: "Volume Breakout Up",
        patternId: "volume_breakout_bullish",
        signal: "bullish",
        confidence: 0.75,
        detectedAt: 30,
        detectedDate: "2026-01-31T00:00:00.000Z",
        description: "test",
        isRecent: true,
      },
    ];

    const combinations = detectCombinationPatterns(patterns);

    expect(combinations.map((pattern) => pattern.patternId)).toContain(
      "ema_cross_volume_breakout_bullish",
    );
    expect(combinations[0].signal).toBe("bullish");
  });

  it("returns a bullish aggregate signal for a reversal series", () => {
    const closes = [
      100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83,
      84, 85, 86, 88, 90, 92, 94, 96, 98, 100, 102, 104, 106, 108, 110, 112,
      114, 116, 118, 120, 122, 124,
    ];
    const candles = makeCandles(closes);

    const report = detectAllIndicatorPatterns(candles, "TEST", "1M");

    expect(report.patterns.length).toBeGreaterThan(0);
    expect(report.aggregateSignal.direction).toBe("bullish");
    expect(report.aggregateSignal.strength).toBeGreaterThan(0);
  });

  it("handles insufficient data without throwing", () => {
    const candles = makeCandles([100, 101, 102, 103, 104]);

    const report = detectAllIndicatorPatterns(candles);

    expect(report.patterns).toEqual([]);
    expect(report.combinations).toEqual([]);
    expect(report.aggregateSignal.direction).toBe("neutral");
  });
});
