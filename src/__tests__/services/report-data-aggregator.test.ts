import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  aggregateReportData,
  fetchAllTimeframeCandles,
  type AggregateReportInput,
  type CandlesByPeriod,
} from "@/lib/services/report-data-aggregator";
import type { DeepDiveAnalysis } from "@/types/analysis";
import type { Candle } from "@/lib/utils/technical-indicators";

// ---------- helpers --------------------------------------------------------

function makeCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, i) => ({
    time: `2025-01-${String(i + 1).padStart(2, "0")}`,
    open: 100 + i,
    high: 105 + i,
    low: 98 + i,
    close: 102 + i,
    volume: 10_000 + i * 100,
  }));
}

const MINIMAL_DEEP_DIVE: DeepDiveAnalysis = {
  ticker: "AAPL",
  whale_trade_summary: "Big whale trade",
  market_narrative: "The market is doing things.",
  technical_patterns: [],
  support_resistance: [],
  indicators: [],
  options_context: {
    iv_percentile: "45",
    iv_interpretation: "Normal",
    put_call_ratio: "0.8",
    unusual_activity_note: "Heavy call buying.",
    greeks_summary: "Delta neutral.",
  },
  entry_exit: {
    recommended_option_type: "Long Call",
    entry_price_range: { low: 3.5, high: 4.2 },
    strike_selection: "$180 strike",
    expiry_guidance: "45 DTE",
    profit_target: "+50%",
    stop_loss: "-30%",
    position_sizing: "2% of portfolio",
    rationale: "Strong technicals.",
  },
  global_events_connection: "Trade talks ongoing.",
  risk_assessment: {
    overall_risk: "moderate",
    key_risks: ["Earnings next week"],
    max_recommended_allocation: "3%",
  },
  educational_notes: [{ term: "IV", explanation: "Implied volatility." }],
  disclaimer: "Not financial advice.",
};

function makeInput(
  overrides?: Partial<AggregateReportInput>,
): AggregateReportInput {
  const candles = makeCandles(30);
  const candlesByPeriod: CandlesByPeriod = {
    "1d": candles,
    "1wk": candles,
    "1mo": candles,
    "3mo": candles,
    "6mo": candles,
    "1y": candles,
  };
  return {
    ticker: "AAPL",
    deepDive: MINIMAL_DEEP_DIVE,
    recommendation: null,
    confidenceBreakdown: null,
    whaleAlert: null,
    cascadeContext: null,
    candlesByPeriod,
    ...overrides,
  };
}

// ---------- tests ----------------------------------------------------------

describe("aggregateReportData", () => {
  it("returns all 6 timeframes", () => {
    const result = aggregateReportData(makeInput());
    expect(result.timeframes).toHaveLength(6);
    const labels = result.timeframes.map((t) => t.timeframe);
    expect(labels).toEqual(["1D", "1W", "1M", "3M", "6M", "1Y"]);
  });

  it("sets ticker and generatedAt", () => {
    const result = aggregateReportData(makeInput());
    expect(result.ticker).toBe("AAPL");
    expect(result.generatedAt).toBeTruthy();
    // ISO string
    expect(() => new Date(result.generatedAt)).not.toThrow();
  });

  it("passes through recommendation and whaleAlert", () => {
    const result = aggregateReportData(
      makeInput({
        recommendation: { ticker: "AAPL", thesis: "Bull" } as never,
        whaleAlert: { ticker: "AAPL", strike: 180 } as never,
      }),
    );
    expect(result.recommendation?.ticker).toBe("AAPL");
    expect(result.whaleAlert?.ticker).toBe("AAPL");
  });

  it("handles missing timeframe_patterns gracefully", () => {
    const deepDive = { ...MINIMAL_DEEP_DIVE, timeframe_patterns: undefined };
    const result = aggregateReportData(makeInput({ deepDive }));
    // No crash, and all timeframes still present
    expect(result.timeframes).toHaveLength(6);
  });

  it("populates patterns from timeframe_patterns when present", () => {
    const deepDive: DeepDiveAnalysis = {
      ...MINIMAL_DEEP_DIVE,
      timeframe_patterns: {
        "1W": [
          {
            name: "Bull Flag",
            type: "bullish",
            description: "Flagging",
            confidence: 0.8,
          },
        ],
        "1M": [],
        "3M": [],
        "6M": [],
        "1Y": [],
      },
    };
    const result = aggregateReportData(makeInput({ deepDive }));
    const weekData = result.timeframes.find((t) => t.timeframe === "1W");
    expect(weekData?.patterns).toHaveLength(1);
    expect(weekData?.patterns[0].name).toBe("Bull Flag");
  });

  it("handles empty candles for a timeframe", () => {
    const candlesByPeriod: CandlesByPeriod = {
      "1d": [],
      "1wk": makeCandles(30),
      "1mo": [],
      "3mo": makeCandles(30),
      "6mo": [],
      "1y": [],
    };
    const result = aggregateReportData(makeInput({ candlesByPeriod }));
    expect(result.timeframes).toHaveLength(6);
    const dayData = result.timeframes.find((t) => t.timeframe === "1D");
    expect(dayData?.candles).toHaveLength(0);
    expect(dayData?.indicatorPatterns).toHaveLength(0);
  });

  it("initializes chartScreenshots as empty object", () => {
    const result = aggregateReportData(makeInput());
    expect(result.chartScreenshots).toEqual({});
  });

  it("passes cascadeContext through", () => {
    const cascades = [
      {
        nexusTicker: "TSMC",
        nexusName: "Taiwan Semi",
        sector: "Technology",
        reportedAt: "2025-01-01T00:00:00Z",
        hoursSinceReport: 12,
        epsSurprisePct: 8.2,
        direction: "bullish" as const,
        dependentCount: 5,
      },
    ];
    const result = aggregateReportData(makeInput({ cascadeContext: cascades }));
    expect(result.cascadeContext).toHaveLength(1);
    expect(result.cascadeContext![0].nexusTicker).toBe("TSMC");
  });
});

describe("fetchAllTimeframeCandles", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches candles for all 6 timeframes", async () => {
    const mockCandles = makeCandles(5);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ candles: mockCandles }),
    });

    const result = await fetchAllTimeframeCandles("AAPL");
    expect(Object.keys(result)).toHaveLength(6);
    expect(result["3mo"]).toHaveLength(5);
    expect(globalThis.fetch).toHaveBeenCalledTimes(6);
  });

  it("returns empty array for failed timeframes", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const result = await fetchAllTimeframeCandles("AAPL");
    expect(Object.keys(result)).toHaveLength(6);
    expect(result["1d"]).toEqual([]);
  });

  it("handles network errors without throwing", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await fetchAllTimeframeCandles("AAPL");
    expect(Object.keys(result)).toHaveLength(6);
    expect(result["1d"]).toEqual([]);
  });
});
