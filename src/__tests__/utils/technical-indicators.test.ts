import { describe, it, expect } from "vitest";
import {
  sma,
  ema,
  bollingerBands,
  rsi,
  macd,
  obv,
  vwap,
  volumeSMA,
  type Candle,
} from "@/lib/utils/technical-indicators";

// Helper: round to N decimals
const r = (v: number | null, d = 4) =>
  v == null ? null : Math.round(v * 10 ** d) / 10 ** d;

describe("SMA", () => {
  it("returns nulls for insufficient data then correct averages", () => {
    const values = [1, 2, 3, 4, 5];
    const result = sma(values, 3);
    expect(result).toEqual([null, null, 2, 3, 4]);
  });

  it("handles period of 1", () => {
    expect(sma([10, 20, 30], 1)).toEqual([10, 20, 30]);
  });

  it("returns all nulls when data shorter than period", () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });
});

describe("EMA", () => {
  it("first value equals SMA of initial period", () => {
    const values = [
      22, 22.27, 22.19, 22.08, 22.17, 22.18, 22.13, 22.23, 22.43, 22.24,
    ];
    const result = ema(values, 10);
    // First 9 should be null, 10th is the SMA of all 10
    for (let i = 0; i < 9; i++) expect(result[i]).toBeNull();
    const expectedSma = values.reduce((a, b) => a + b, 0) / 10;
    expect(r(result[9]!, 4)).toBe(r(expectedSma, 4));
  });

  it("returns correct length", () => {
    const result = ema([1, 2, 3, 4, 5, 6], 3);
    expect(result.length).toBe(6);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).not.toBeNull();
  });
});

describe("Bollinger Bands", () => {
  it("returns upper, middle, lower of correct length", () => {
    const values = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i));
    const bb = bollingerBands(values, 20, 2);
    expect(bb.upper.length).toBe(25);
    expect(bb.middle.length).toBe(25);
    expect(bb.lower.length).toBe(25);
    // First 19 should be null
    for (let i = 0; i < 19; i++) {
      expect(bb.upper[i]).toBeNull();
      expect(bb.middle[i]).toBeNull();
      expect(bb.lower[i]).toBeNull();
    }
    // After that, upper > middle > lower
    for (let i = 19; i < 25; i++) {
      expect(bb.upper[i]!).toBeGreaterThan(bb.middle[i]!);
      expect(bb.middle[i]!).toBeGreaterThan(bb.lower[i]!);
    }
  });
});

describe("RSI", () => {
  it("returns values between 0 and 100", () => {
    const values = [
      44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89,
      46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64,
    ];
    const result = rsi(values, 14);
    expect(result.length).toBe(values.length);
    // First 14 should be null
    for (let i = 0; i < 14; i++) expect(result[i]).toBeNull();
    // Remaining should be 0-100
    for (let i = 14; i < result.length; i++) {
      expect(result[i]).not.toBeNull();
      expect(result[i]!).toBeGreaterThanOrEqual(0);
      expect(result[i]!).toBeLessThanOrEqual(100);
    }
  });

  it("returns 100 when all changes are positive", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    const result = rsi(values, 14);
    expect(result[14]).toBe(100);
  });
});

describe("MACD", () => {
  it("returns macd, signal, histogram of same length", () => {
    const values = Array.from(
      { length: 50 },
      (_, i) => 100 + i * 0.5 + Math.sin(i) * 2,
    );
    const result = macd(values, 12, 26, 9);
    expect(result.macd.length).toBe(50);
    expect(result.signal.length).toBe(50);
    expect(result.histogram.length).toBe(50);
  });

  it("first 25 MACD values are null (need slowPeriod=26)", () => {
    const values = Array.from({ length: 50 }, (_, i) => 100 + i);
    const result = macd(values, 12, 26, 9);
    for (let i = 0; i < 25; i++) expect(result.macd[i]).toBeNull();
    expect(result.macd[25]).not.toBeNull();
  });
});

describe("OBV", () => {
  it("accumulates volume correctly", () => {
    const candles: Candle[] = [
      {
        time: "2024-01-01",
        open: 10,
        high: 11,
        low: 9,
        close: 10,
        volume: 100,
      },
      {
        time: "2024-01-02",
        open: 10,
        high: 12,
        low: 10,
        close: 11,
        volume: 200,
      }, // up
      { time: "2024-01-03", open: 11, high: 11, low: 9, close: 9, volume: 150 }, // down
      { time: "2024-01-04", open: 9, high: 10, low: 9, close: 9, volume: 50 }, // flat
    ];
    expect(obv(candles)).toEqual([0, 200, 50, 50]);
  });
});

describe("VWAP", () => {
  it("returns cumulative VWAP", () => {
    const candles: Candle[] = [
      {
        time: "2024-01-01",
        open: 10,
        high: 12,
        low: 8,
        close: 10,
        volume: 100,
      },
      {
        time: "2024-01-02",
        open: 10,
        high: 14,
        low: 10,
        close: 12,
        volume: 200,
      },
    ];
    const result = vwap(candles);
    expect(result.length).toBe(2);
    // First bar: typical = (12+8+10)/3 = 10, VWAP = 10*100/100 = 10
    expect(result[0]).toBe(10);
    // Second bar: typical = (14+10+12)/3 = 12, cumTP = 10*100 + 12*200 = 3400, cumV = 300
    expect(r(result[1]!, 4)).toBe(r(3400 / 300, 4));
  });
});

describe("volumeSMA", () => {
  it("returns SMA of volume values", () => {
    const candles: Candle[] = Array.from({ length: 5 }, (_, i) => ({
      time: `2024-01-0${i + 1}`,
      open: 10,
      high: 11,
      low: 9,
      close: 10,
      volume: (i + 1) * 100,
    }));
    const result = volumeSMA(candles, 3);
    expect(result).toEqual([null, null, 200, 300, 400]);
  });
});
