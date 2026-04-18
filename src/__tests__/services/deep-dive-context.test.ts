import { describe, expect, it } from "vitest";
import {
  buildDeepDivePromptContext,
  createFallbackTimeframePattern,
} from "@/lib/prompts/deep-dive-context";

describe("deep-dive-context", () => {
  it("builds a prompt from precomputed context without computing analytics in llm layer", () => {
    const triggerReport = {
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
    } as const;

    const result = buildDeepDivePromptContext({
      ticker: "AAPL",
      whaleTrade: { ticker: "AAPL", callPut: "C", premium: 500000 },
      historicalData: [
        {
          time: "2026-04-01",
          open: 195,
          high: 201,
          low: 194,
          close: 200,
          volume: 1000,
        },
      ],
      historicalDataByTimeframe: {
        "1W": [
          {
            time: "2026-04-01",
            open: 195,
            high: 201,
            low: 194,
            close: 200,
            volume: 1000,
          },
        ],
        "3M": [
          {
            time: "2026-04-01",
            open: 195,
            high: 201,
            low: 194,
            close: 200,
            volume: 1000,
          },
        ],
      },
      optionsChain: null,
      currentPrice: 200,
      computedIndicators: {
        "3M": {
          ticker: "AAPL",
          timeframe: "3M",
          patterns: [],
          combinations: [],
          aggregateSignal: {
            direction: "neutral",
            strength: 0.5,
            summary: "neutral",
          },
          computedAt: "2026-04-17T00:00:00.000Z",
        },
      },
      signalHierarchy: {
        currentPrice: 200,
        volumeProfile: {
          vpoc: 200,
          valueAreaHigh: 202,
          valueAreaLow: 198,
          buckets: [],
          hvn: [],
          lvn: [],
          totalVolume: 1000,
        },
      },
      triggerReport,
    });

    expect(result.triggerReport).toBe(triggerReport);
    expect(result.prompt).toContain("## Whale Trade");
    expect(result.prompt).toContain("## Historical Price Data");
    expect(result.prompt).toContain("Signal Hierarchy");
  });

  it("creates fallback long-range patterns for omitted 6M/1Y structures", () => {
    const pattern = createFallbackTimeframePattern({
      timeframe: "1Y",
      candles: [
        {
          time: "2026-01-01",
          open: 100,
          high: 101,
          low: 99,
          close: 100,
          volume: 1000,
        },
        {
          time: "2026-04-01",
          open: 110,
          high: 112,
          low: 109,
          close: 111,
          volume: 1000,
        },
      ],
    });

    expect(pattern).not.toBeNull();
    expect(pattern?.timeframe).toBe("1Y");
  });
});
