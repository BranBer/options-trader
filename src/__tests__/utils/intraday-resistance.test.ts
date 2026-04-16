import { describe, expect, it } from "vitest";
import {
  buildIntradayResistanceLevels,
  buildIntradaySupportLevels,
  getIntradayResistanceControl,
  getIntradaySupportControl,
  summarizeIntradaySessionChronology,
  summarizeIntradayResistance,
  summarizeIntradaySupport,
} from "@/lib/utils/intraday-resistance";
import type { Candle } from "@/lib/utils/technical-indicators";

function intradayCandle(
  iso: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number = 1000,
): Candle {
  return {
    time: Math.floor(new Date(iso).getTime() / 1000),
    open,
    high,
    low,
    close,
    volume,
  };
}

function dailyCandle(
  date: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number = 1000,
): Candle {
  return { time: date, open, high, low, close, volume };
}

describe("buildIntradayResistanceLevels", () => {
  it("computes opening range, prior-day, and VWAP band resistances", () => {
    const intradayCandles = [
      intradayCandle("2026-04-15T11:45:00.000Z", 101.4, 103.1, 101.2, 102.8),
      intradayCandle("2026-04-15T12:10:00.000Z", 102.8, 103.4, 102.6, 103.1),
      intradayCandle("2026-04-15T13:30:00.000Z", 100, 101, 99.8, 100.8),
      intradayCandle("2026-04-15T13:35:00.000Z", 100.8, 102, 100.6, 101.5),
      intradayCandle("2026-04-15T13:40:00.000Z", 101.5, 102.4, 101.1, 101.8),
      intradayCandle("2026-04-15T13:45:00.000Z", 101.8, 102.2, 101.3, 101.4),
      intradayCandle("2026-04-15T13:50:00.000Z", 101.4, 102.1, 100.9, 101.1),
      intradayCandle("2026-04-15T13:55:00.000Z", 101.1, 101.9, 100.7, 100.9),
      intradayCandle("2026-04-15T14:00:00.000Z", 100.9, 101.3, 100.2, 100.6),
      intradayCandle("2026-04-15T14:05:00.000Z", 100.6, 100.9, 100.1, 100.4),
    ];
    const dailyCandles = [
      dailyCandle("2026-04-14", 99, 103, 98.5, 101.7),
      dailyCandle("2026-04-15", 100, 102, 99.5, 100.4),
    ];

    const levels = buildIntradayResistanceLevels({
      intradayCandles,
      dailyCandles,
    });

    expect(levels.some((level) => level.label.includes("ORH"))).toBe(true);
    expect(levels.some((level) => level.label.includes("AVWAP LOD"))).toBe(
      true,
    );
    expect(levels.some((level) => level.label.includes("PDH"))).toBe(true);
    expect(levels.some((level) => level.label.includes("VWAP +1σ"))).toBe(true);
    expect(levels.every((level) => level.distanceFromPrice >= 0)).toBe(true);
    expect(levels.every((level) => level.distancePct >= 0)).toBe(true);
  });

  it("includes premarket-high resistance when it is the nearest overhead band", () => {
    const levels = buildIntradayResistanceLevels({
      intradayCandles: [
        intradayCandle("2026-04-15T11:45:00.000Z", 100.2, 100.9, 100.1, 100.7),
        intradayCandle(
          "2026-04-15T12:10:00.000Z",
          100.7,
          101.05,
          100.6,
          100.95,
        ),
        intradayCandle("2026-04-15T13:30:00.000Z", 99.4, 99.9, 99.2, 99.6),
        intradayCandle("2026-04-15T13:35:00.000Z", 99.6, 99.95, 99.4, 99.7),
        intradayCandle("2026-04-15T13:40:00.000Z", 99.7, 99.92, 99.5, 99.8),
        intradayCandle("2026-04-15T13:45:00.000Z", 99.8, 99.98, 99.6, 99.7),
        intradayCandle("2026-04-15T13:50:00.000Z", 99.7, 99.94, 99.55, 99.72),
        intradayCandle("2026-04-15T13:55:00.000Z", 99.72, 99.96, 99.58, 99.74),
        intradayCandle("2026-04-15T14:00:00.000Z", 99.74, 99.88, 99.6, 99.7),
      ],
      dailyCandles: [dailyCandle("2026-04-14", 98.7, 104, 98.4, 103.5)],
    });

    expect(levels.some((level) => level.label.includes("PMH"))).toBe(true);
  });

  it("summarizes the nearest overhead supply band", () => {
    const levels = buildIntradayResistanceLevels({
      intradayCandles: [
        intradayCandle("2026-04-15T11:45:00.000Z", 101.4, 103.1, 101.2, 102.8),
        intradayCandle("2026-04-15T13:30:00.000Z", 100, 101, 99.8, 100.8),
        intradayCandle("2026-04-15T13:35:00.000Z", 100.8, 102, 100.6, 101.5),
        intradayCandle("2026-04-15T13:40:00.000Z", 101.5, 102.4, 101.1, 101.8),
        intradayCandle("2026-04-15T13:45:00.000Z", 101.8, 102.2, 101.3, 101.4),
        intradayCandle("2026-04-15T13:50:00.000Z", 101.4, 102.1, 100.9, 101.1),
        intradayCandle("2026-04-15T13:55:00.000Z", 101.1, 101.9, 100.7, 100.9),
        intradayCandle("2026-04-15T14:00:00.000Z", 100.9, 101.3, 100.2, 100.6),
      ],
      dailyCandles: [
        dailyCandle("2026-04-14", 99, 103, 98.5, 101.7),
        dailyCandle("2026-04-15", 100, 102, 99.5, 100.4),
      ],
    });

    const summary = summarizeIntradayResistance(levels, 100.6);

    expect(summary).toContain("Nearest overhead supply sits at");
    expect(summary).toContain("above price");
  });

  it("classifies nearby overhead supply as seller control", () => {
    const control = getIntradayResistanceControl([
      {
        level: 101,
        label: "ORH",
        strength: "strong",
        note: "Opening range high",
        distanceFromPrice: 0.25,
        distancePct: 0.25,
        source: "opening-range",
      },
    ]);

    expect(control.label).toBe("Sellers In Control");
    expect(control.tone).toBe("seller-control");
  });

  it("returns no levels when the session is too short", () => {
    const levels = buildIntradayResistanceLevels({
      intradayCandles: [
        intradayCandle("2026-04-15T13:30:00.000Z", 100, 101, 99.8, 100.8),
        intradayCandle("2026-04-15T13:35:00.000Z", 100.8, 102, 100.6, 101.5),
      ],
      dailyCandles: [dailyCandle("2026-04-14", 99, 103, 98.5, 101.7)],
    });

    expect(levels).toEqual([]);
  });
});

describe("buildIntradaySupportLevels", () => {
  it("computes opening range, prior-day, and VWAP support bands", () => {
    const levels = buildIntradaySupportLevels({
      intradayCandles: [
        intradayCandle("2026-04-15T11:45:00.000Z", 98.9, 99.2, 98.4, 98.8),
        intradayCandle("2026-04-15T12:05:00.000Z", 98.8, 99.0, 98.3, 98.6),
        intradayCandle("2026-04-15T13:30:00.000Z", 99.2, 100.0, 99.0, 99.8),
        intradayCandle("2026-04-15T13:35:00.000Z", 99.8, 100.4, 99.6, 100.2),
        intradayCandle("2026-04-15T13:40:00.000Z", 100.2, 100.8, 100.0, 100.5),
        intradayCandle("2026-04-15T13:45:00.000Z", 100.5, 101.2, 100.3, 101.0),
        intradayCandle("2026-04-15T13:50:00.000Z", 101.0, 101.4, 100.7, 101.1),
        intradayCandle("2026-04-15T13:55:00.000Z", 101.1, 101.5, 100.9, 101.2),
        intradayCandle("2026-04-15T14:00:00.000Z", 101.2, 101.6, 100.8, 101.4),
      ],
      dailyCandles: [dailyCandle("2026-04-14", 97.8, 103.5, 98.1, 99.0)],
    });

    expect(levels.some((level) => level.label.includes("ORL"))).toBe(true);
    expect(levels.some((level) => level.label.includes("PML"))).toBe(true);
    expect(levels.some((level) => level.label.includes("PDL"))).toBe(true);
    expect(levels.some((level) => level.label.includes("VWAP -1σ"))).toBe(true);
    expect(levels.every((level) => level.distanceFromPrice >= 0)).toBe(true);
  });

  it("classifies nearby support as buyers defending nearby", () => {
    const control = getIntradaySupportControl([
      {
        level: 99.75,
        label: "ORL",
        strength: "strong",
        note: "Opening range low",
        distanceFromPrice: 0.25,
        distancePct: 0.25,
        source: "opening-range-low",
      },
    ]);

    expect(control.label).toBe("Buyers Defending Nearby");
    expect(control.tone).toBe("buyer-control");
  });

  it("summarizes the nearest downside defense band", () => {
    const levels = buildIntradaySupportLevels({
      intradayCandles: [
        intradayCandle("2026-04-15T13:30:00.000Z", 99.2, 100.0, 99.0, 99.8),
        intradayCandle("2026-04-15T13:35:00.000Z", 99.8, 100.4, 99.6, 100.2),
        intradayCandle("2026-04-15T13:40:00.000Z", 100.2, 100.8, 100.0, 100.5),
        intradayCandle("2026-04-15T13:45:00.000Z", 100.5, 101.2, 100.3, 101.0),
        intradayCandle("2026-04-15T13:50:00.000Z", 101.0, 101.4, 100.7, 101.1),
        intradayCandle("2026-04-15T13:55:00.000Z", 101.1, 101.5, 100.9, 101.2),
        intradayCandle("2026-04-15T14:00:00.000Z", 101.2, 101.6, 100.8, 101.4),
      ],
      dailyCandles: [dailyCandle("2026-04-14", 97.8, 103.5, 98.1, 99.0)],
    });

    const summary = summarizeIntradaySupport(levels, 101.4);
    expect(summary).toContain("Nearest downside defense sits at");
    expect(summary).toContain("below price");
  });
});

describe("summarizeIntradaySessionChronology", () => {
  it("builds a usable four-part session narrative for the PDF 1D page", () => {
    const narrative = summarizeIntradaySessionChronology({
      intradayCandles: [
        intradayCandle("2026-04-15T11:45:00.000Z", 100.3, 101.2, 100.1, 101.0),
        intradayCandle("2026-04-15T12:10:00.000Z", 101.0, 101.4, 100.7, 101.2),
        intradayCandle("2026-04-15T13:30:00.000Z", 101.2, 101.5, 100.8, 101.0),
        intradayCandle("2026-04-15T13:35:00.000Z", 101.0, 101.1, 100.4, 100.6),
        intradayCandle("2026-04-15T13:40:00.000Z", 100.6, 100.9, 100.0, 100.2),
        intradayCandle("2026-04-15T13:45:00.000Z", 100.2, 100.6, 99.8, 100.0),
        intradayCandle("2026-04-15T13:50:00.000Z", 100.0, 100.7, 99.9, 100.4),
        intradayCandle("2026-04-15T13:55:00.000Z", 100.4, 101.0, 100.2, 100.8),
        intradayCandle("2026-04-15T14:00:00.000Z", 100.8, 101.3, 100.6, 101.1),
      ],
      dailyCandles: [
        dailyCandle("2026-04-14", 99.1, 102.4, 98.9, 100.7),
        dailyCandle("2026-04-15", 100.3, 101.3, 99.8, 101.1),
      ],
    });

    expect(narrative).toHaveLength(4);
    expect(narrative[0]?.title).toBe("Opening Auction");
    expect(narrative[1]?.detail).toContain("session");
    expect(narrative[2]?.detail).toContain("session VWAP");
    expect(narrative[3]?.detail).toContain("prior-day high");
  });

  it("returns no narrative when the regular session is too short", () => {
    const narrative = summarizeIntradaySessionChronology({
      intradayCandles: [
        intradayCandle("2026-04-15T13:30:00.000Z", 100, 100.5, 99.8, 100.1),
        intradayCandle("2026-04-15T13:35:00.000Z", 100.1, 100.4, 99.9, 100.0),
      ],
      dailyCandles: [dailyCandle("2026-04-14", 99, 101, 98.8, 100.2)],
    });

    expect(narrative).toEqual([]);
  });
});
