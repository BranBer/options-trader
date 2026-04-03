import { describe, expect, it } from "vitest";
import { isTimeframeAwareDeepDiveOutput } from "@/lib/utils/deep-dive-freshness";

describe("isTimeframeAwareDeepDiveOutput", () => {
  it("returns false for legacy deep dives without timeframe data", () => {
    expect(
      isTimeframeAwareDeepDiveOutput(
        JSON.stringify({
          ticker: "AAPL",
          technical_patterns: [
            {
              name: "Legacy Channel",
              type: "bullish",
              description: "Built from a single 3M dataset.",
              confidence: 0.78,
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("returns true when timeframe_patterns exists", () => {
    expect(
      isTimeframeAwareDeepDiveOutput(
        JSON.stringify({
          ticker: "AAPL",
          technical_patterns: [],
          timeframe_patterns: {
            "1W": [],
            "1M": [],
            "3M": [],
            "6M": [],
            "1Y": [],
          },
        }),
      ),
    ).toBe(true);
  });

  it("returns true when aggregate patterns are explicitly tagged by timeframe", () => {
    expect(
      isTimeframeAwareDeepDiveOutput(
        JSON.stringify({
          ticker: "AAPL",
          technical_patterns: [
            {
              name: "V-Shape Recovery",
              type: "bullish",
              description: "Recovered rapidly.",
              confidence: 0.71,
              timeframe: "1W",
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("returns false for invalid JSON", () => {
    expect(isTimeframeAwareDeepDiveOutput("not-json")).toBe(false);
  });
});
