import { describe, expect, it } from "vitest";
import { getTechnicalPatternsForTimeframe } from "@/lib/utils/deep-dive-patterns";
import type { DeepDiveAnalysis, TechnicalPattern } from "@/types/analysis";

function createPattern(
  overrides?: Partial<TechnicalPattern>,
): TechnicalPattern {
  return {
    name: "Descending Trendline Break",
    type: "bullish",
    description: "Price broke above a descending trendline.",
    confidence: 0.74,
    timeframe: "3M",
    price_target: 215,
    drawing_type: "trendline",
    start_time: "2026-03-01",
    end_time: "2026-03-28",
    start_price: 202,
    end_price: 210,
    secondary_start_price: null,
    secondary_end_price: null,
    ...overrides,
  };
}

describe("getTechnicalPatternsForTimeframe", () => {
  it("returns the explicit timeframe-specific patterns when available", () => {
    const timeframePatterns: NonNullable<
      DeepDiveAnalysis["timeframe_patterns"]
    > = {
      "1W": [createPattern({ name: "V-Shape Recovery", timeframe: "1W" })],
      "1M": [createPattern({ name: "Descending Channel", timeframe: "1M" })],
      "3M": [createPattern({ timeframe: "3M" })],
      "6M": [],
      "1Y": [],
    };

    const result = getTechnicalPatternsForTimeframe({
      technicalPatterns: timeframePatterns["3M"],
      timeframePatterns,
      period: "1wk",
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("V-Shape Recovery");
    expect(result[0].timeframe).toBe("1W");
  });

  it("filters aggregate patterns by explicit timeframe tags when no map exists", () => {
    const patterns = [
      createPattern({ name: "V-Shape Recovery", timeframe: "1W" }),
      createPattern({ name: "Descending Channel", timeframe: "1M" }),
      createPattern({ name: "Descending Trendline Break", timeframe: "3M" }),
    ];

    const result = getTechnicalPatternsForTimeframe({
      technicalPatterns: patterns,
      period: "1mo",
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Descending Channel");
    expect(result[0].timeframe).toBe("1M");
  });

  it("treats legacy untagged patterns as 3M-only data", () => {
    const legacyPatterns = [
      createPattern({ timeframe: null, name: "Legacy Channel" }),
    ];

    const oneWeek = getTechnicalPatternsForTimeframe({
      technicalPatterns: legacyPatterns,
      period: "1wk",
    });
    const threeMonth = getTechnicalPatternsForTimeframe({
      technicalPatterns: legacyPatterns,
      period: "3mo",
    });

    expect(oneWeek).toHaveLength(0);
    expect(threeMonth).toHaveLength(1);
    expect(threeMonth[0].timeframe).toBe("3M");
  });
});
