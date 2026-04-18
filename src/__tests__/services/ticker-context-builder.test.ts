import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchMarketData: vi.fn(),
  fetchOptionsChain: vi.fn(),
  fetchHistoricalData: vi.fn(),
  getOrFetchShortInterest: vi.fn(),
  computeRealizedVol: vi.fn(),
  detectAllIndicatorPatterns: vi.fn(),
  computeVolumeProfile: vi.fn(),
  computeAlgoSR: vi.fn(),
  computeIVSkew: vi.fn(),
  computeOISummary: vi.fn(),
  buildTriggerReport: vi.fn(),
  vwap: vi.fn(),
}));

vi.mock("@/lib/services/market-fetcher", () => ({
  fetchMarketData: mocks.fetchMarketData,
  fetchOptionsChain: mocks.fetchOptionsChain,
  fetchHistoricalData: mocks.fetchHistoricalData,
  getOrFetchShortInterest: mocks.getOrFetchShortInterest,
  computeRealizedVol: mocks.computeRealizedVol,
}));

vi.mock("@/lib/utils/indicator-patterns", () => ({
  detectAllIndicatorPatterns: mocks.detectAllIndicatorPatterns,
}));

vi.mock("@/lib/utils/volume-profile", () => ({
  computeVolumeProfile: mocks.computeVolumeProfile,
}));

vi.mock("@/lib/utils/algo-sr", () => ({
  computeAlgoSR: mocks.computeAlgoSR,
}));

vi.mock("@/lib/utils/options-analytics", () => ({
  computeIVSkew: mocks.computeIVSkew,
  computeOISummary: mocks.computeOISummary,
}));

vi.mock("@/lib/utils/trigger-engine", () => ({
  buildTriggerReport: mocks.buildTriggerReport,
}));

vi.mock("@/lib/utils/technical-indicators", () => ({
  vwap: mocks.vwap,
}));

import { buildTickerAnalysisContext } from "@/lib/services/ticker-context-builder";
import type { TickerAnalysisContext } from "@/types/ticker-context";

const marketSnapshot = {
  ticker: "AAPL",
  price: 200,
  volume: 1_000_000,
  dayChangePct: 1.2,
};

const optionsChain = {
  ticker: "AAPL",
  expirations: ["2026-04-18"],
  nearestExpiry: {
    date: "2026-04-18",
    calls: [
      {
        strike: 198,
        bid: 1,
        ask: 2,
        volume: 100,
        openInterest: 200,
        iv: 0.4,
      },
      {
        strike: 205,
        bid: 1,
        ask: 2,
        volume: 120,
        openInterest: 220,
        iv: 0.42,
      },
    ],
    puts: [
      {
        strike: 195,
        bid: 1,
        ask: 2,
        volume: 80,
        openInterest: 180,
        iv: 0.38,
      },
    ],
  },
  maxPain: 200,
  oiWalls: {
    callWalls: [{ strike: 205, oi: 220 }],
    putWalls: [{ strike: 195, oi: 180 }],
  },
  gex: {
    netGEX: 10_000,
    gexFlipLevel: 202,
    topConcentrations: [{ strike: 200, gex: 10_000 }],
    dealerPositioning: "long_gamma",
  },
};

const candles = Array.from({ length: 20 }, (_, index) => ({
  time: `2026-04-${String(index + 1).padStart(2, "0")}`,
  open: 190 + index,
  high: 191 + index,
  low: 189 + index,
  close: 190.5 + index,
  volume: 1000 + index,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchMarketData.mockResolvedValue([marketSnapshot]);
  mocks.fetchOptionsChain.mockResolvedValue(optionsChain);
  mocks.fetchHistoricalData.mockResolvedValue(candles);
  mocks.getOrFetchShortInterest.mockResolvedValue({
    shortPercentOfFloat: 0.12,
    shortRatio: 2.5,
    squeezePressure: "moderate",
  });
  mocks.computeRealizedVol.mockReturnValue(0.25);
  mocks.detectAllIndicatorPatterns.mockImplementation(
    (series, ticker, timeframe) => ({
      ticker,
      timeframe,
      patterns: [],
      combinations: [],
      aggregateSignal: {
        direction: "neutral",
        strength: 0.5,
        summary: `${timeframe} neutral`,
      },
      computedAt: "2026-04-17T00:00:00.000Z",
    }),
  );
  mocks.computeVolumeProfile.mockReturnValue({
    vpoc: 200,
    valueAreaHigh: 203,
    valueAreaLow: 197,
    buckets: [],
    hvn: [],
    lvn: [],
    totalVolume: 20_000,
  });
  mocks.computeAlgoSR.mockReturnValue([]);
  mocks.computeIVSkew.mockReturnValue({
    putCallSkew: 0.02,
    avgPutIV: 0.39,
    avgCallIV: 0.37,
    interpretation: "Moderate put skew",
  });
  mocks.computeOISummary.mockReturnValue({
    totalCallOI: 420,
    totalPutOI: 180,
    pcOIRatio: 0.43,
    topStrikes: [],
  });
  mocks.buildTriggerReport.mockReturnValue({
    ticker: "AAPL",
    computedAt: "2026-04-17T00:00:00.000Z",
    primaryTrigger: null,
    secondaryTriggers: [],
    activeLevels: [],
    swingStructure: {
      swings: [],
      structure: "consolidation",
      structureShift: null,
      lastHigherLow: null,
      lastLowerHigh: null,
    },
    overallAssessment: "no_trigger",
  });
  mocks.vwap.mockReturnValue([199, 200, 201]);
});

describe("buildTickerAnalysisContext", () => {
  it("builds a full shared context from fetched data", async () => {
    const context = await buildTickerAnalysisContext("AAPL", {
      timeframes: ["1W", "1M", "3M"],
    });

    expect(mocks.fetchMarketData).toHaveBeenCalledWith(["AAPL"]);
    expect(mocks.fetchOptionsChain).toHaveBeenCalledWith("AAPL");
    expect(mocks.fetchHistoricalData).toHaveBeenCalledTimes(3);
    expect(context.marketSnapshot?.price).toBe(200);
    expect(context.optionsChain?.ticker).toBe("AAPL");
    expect(context.atmIV).toBeCloseTo(0.4, 5);
    expect(context.realizedVol).toBe(0.25);
    expect(context.ivRvSpread).toBeCloseTo(0.15, 5);
    expect(context.volumeProfile?.vpoc).toBe(200);
    expect(context.triggerReport?.ticker).toBe("AAPL");
    expect(context.shortInterest?.shortPercentOfFloat).toBe(0.12);
    expect(context.indicatorsByTimeframe["3M"]?.aggregateSignal.summary).toBe(
      "3M neutral",
    );
  });

  it("reuses an existing context and fetches only missing timeframes", async () => {
    const existingContext: TickerAnalysisContext = {
      ticker: "AAPL",
      computedAt: "2026-04-17T00:00:00.000Z",
      marketSnapshot,
      optionsChain,
      candlesByTimeframe: {
        "1W": candles,
        "1M": candles,
        "3M": candles,
      },
      indicatorsByTimeframe: {
        "1W": mocks.detectAllIndicatorPatterns(candles, "AAPL", "1W"),
        "1M": mocks.detectAllIndicatorPatterns(candles, "AAPL", "1M"),
        "3M": mocks.detectAllIndicatorPatterns(candles, "AAPL", "3M"),
      },
      realizedVol: 0.25,
      atmIV: 0.4,
      ivRvSpread: 0.15,
      volumeProfile: mocks.computeVolumeProfile(candles),
      algoSR: [],
      ivSkew: mocks.computeIVSkew(optionsChain, 200),
      oiSummary: mocks.computeOISummary(optionsChain),
      triggerReport: mocks.buildTriggerReport({} as never),
      shortInterest: {
        shortPercentOfFloat: 0.12,
        shortRatio: 2.5,
        squeezePressure: "moderate",
      },
    };

    mocks.fetchMarketData.mockClear();
    mocks.fetchOptionsChain.mockClear();
    mocks.getOrFetchShortInterest.mockClear();
    mocks.fetchHistoricalData.mockClear();

    const context = await buildTickerAnalysisContext("AAPL", {
      timeframes: ["1D", "1W", "1M", "3M", "6M", "1Y"],
      existingContext,
    });

    expect(mocks.fetchMarketData).not.toHaveBeenCalled();
    expect(mocks.fetchOptionsChain).not.toHaveBeenCalled();
    expect(mocks.getOrFetchShortInterest).not.toHaveBeenCalled();
    expect(mocks.fetchHistoricalData).toHaveBeenCalledTimes(3);
    expect(mocks.fetchHistoricalData).toHaveBeenNthCalledWith(1, "AAPL", "1d");
    expect(mocks.fetchHistoricalData).toHaveBeenNthCalledWith(2, "AAPL", "6mo");
    expect(mocks.fetchHistoricalData).toHaveBeenNthCalledWith(3, "AAPL", "1y");
    expect(context.candlesByTimeframe["1D"]).toEqual(candles);
    expect(context.candlesByTimeframe["1Y"]).toEqual(candles);
  });

  it("returns a safe null-heavy context when fetches fail", async () => {
    mocks.fetchMarketData.mockResolvedValue([]);
    mocks.fetchOptionsChain.mockResolvedValue(null);
    mocks.getOrFetchShortInterest.mockResolvedValue(null);
    mocks.fetchHistoricalData.mockResolvedValue([]);
    mocks.computeRealizedVol.mockReturnValue(null);

    const context = await buildTickerAnalysisContext("AAPL", {
      timeframes: ["1W", "1M", "3M"],
    });

    expect(context.marketSnapshot).toBeNull();
    expect(context.optionsChain).toBeNull();
    expect(context.shortInterest).toBeNull();
    expect(context.volumeProfile).toBeNull();
    expect(context.triggerReport).toBeNull();
    expect(context.algoSR).toEqual([]);
    expect(context.candlesByTimeframe["3M"]).toEqual([]);
  });
});
