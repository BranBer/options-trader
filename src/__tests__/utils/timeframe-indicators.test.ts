import { describe, it, expect } from "vitest";
import {
  getIndicatorsForTimeframe,
  getAllIndicatorNames,
  INDICATOR_CONFIG,
} from "@/lib/utils/timeframe-indicators";

describe("Timeframe Indicators", () => {
  it("returns correct indicators for 1W timeframe", () => {
    const indicators = getIndicatorsForTimeframe("1W");
    const names = indicators.map((i) => i.name);

    expect(names).toContain("RSI");
    expect(names).toContain("MACD");
    expect(names).toContain("Bollinger Bands");
    expect(names).toContain("20-SMA");
    expect(names).not.toContain("200-SMA"); // Too slow for weekly
    expect(names).not.toContain("Volume Profile"); // Too macro for weekly
  });

  it("returns correct indicators for 1M timeframe", () => {
    const indicators = getIndicatorsForTimeframe("1M");
    const names = indicators.map((i) => i.name);

    expect(names).toContain("RSI");
    expect(names).toContain("MACD");
    expect(names).toContain("Bollinger Bands");
    expect(names).toContain("20-SMA");
    expect(names).toContain("50-SMA");
    expect(names).toContain("Fibonacci Retracement");
    expect(names).not.toContain("200-SMA"); // Too slow for monthly
    expect(names).not.toContain("Volume Profile");
  });

  it("returns correct indicators for 3M timeframe", () => {
    const indicators = getIndicatorsForTimeframe("3M");
    const names = indicators.map((i) => i.name);

    expect(names).toContain("MACD");
    expect(names).toContain("50-SMA");
    expect(names).toContain("200-SMA");
    expect(names).toContain("Fibonacci Retracement");
    expect(names).not.toContain("RSI"); // Too noisy for quarterly
    expect(names).not.toContain("Bollinger Bands");
  });

  it("returns correct indicators for 6M timeframe", () => {
    const indicators = getIndicatorsForTimeframe("6M");
    const names = indicators.map((i) => i.name);

    expect(names).toContain("50-SMA");
    expect(names).toContain("200-SMA");
    expect(names).toContain("Fibonacci Retracement");
    expect(names).toContain("Volume Profile");
    expect(names).not.toContain("RSI");
    expect(names).not.toContain("Bollinger Bands");
  });

  it("returns correct indicators for 1Y timeframe", () => {
    const indicators = getIndicatorsForTimeframe("1Y");
    const names = indicators.map((i) => i.name);

    expect(names).toContain("200-SMA");
    expect(names).toContain("Fibonacci Retracement");
    expect(names).toContain("Volume Profile");
    expect(names).not.toContain("RSI");
    expect(names).not.toContain("MACD");
    expect(names).not.toContain("Bollinger Bands");
  });

  it("every indicator has a beginner explanation", () => {
    INDICATOR_CONFIG.forEach((indicator) => {
      expect(indicator.beginnerExplanation).toBeTruthy();
      expect(indicator.beginnerExplanation.length).toBeGreaterThan(20);
    });
  });

  it("every indicator has a valid category", () => {
    const validCategories = ["momentum", "trend", "volatility", "volume"];
    INDICATOR_CONFIG.forEach((indicator) => {
      expect(validCategories).toContain(indicator.category);
    });
  });

  it("getAllIndicatorNames returns unique names", () => {
    const names = getAllIndicatorNames();
    const uniqueNames = [...new Set(names)];
    expect(names.length).toBe(uniqueNames.length);
  });
});
