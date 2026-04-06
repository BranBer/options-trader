import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateRecommendation = vi.fn(async () => ({
  ticker: "AAPL",
  thesis: "Event impact plus supportive options flow.",
  direction: "bullish",
  confidence: 0.72,
  primary_strategy: {
    name: "Bull Call Spread",
    legs: [
      {
        action: "buy",
        type: "call",
        strike: 190,
        expiry: "2026-04-17",
        estimated_premium: 4.2,
      },
    ],
    max_profit: "$280",
    max_loss: "$120",
    breakeven: "$191.20",
    risk_reward_ratio: "1:2.3",
  },
  market_context: {
    iv_assessment: "normal",
    iv_strategy_note: "IV remains tradable.",
    volume_assessment: "above_average",
    catalyst_date: null,
    days_to_catalyst: null,
  },
  risk_factors: ["macro volatility"],
  whale_alignment: {
    matches_whale: false,
    whale_position_size: "$0",
    similarity_note: "No whale flow detected — event-only signal",
  },
  disclaimer: "paper trade only",
}));

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({
  db: mockDb,
}));

vi.mock("@/lib/services/market-fetcher", () => ({
  fetchVIX: vi.fn(async () => 18.2),
  fetchMarketData: vi.fn(async () => [
    {
      ticker: "AAPL",
      price: 189.5,
      volume: 1250000,
      dayChangePct: 1.2,
    },
  ]),
  fetchOptionsChain: vi.fn(async () => ({
    ticker: "AAPL",
    expirations: ["2026-04-17"],
    nearestExpiry: {
      date: "2026-04-17",
      calls: [
        {
          strike: 190,
          bid: 4,
          ask: 4.2,
          volume: 10,
          openInterest: 100,
          iv: 0.32,
        },
      ],
      puts: [
        {
          strike: 190,
          bid: 4.1,
          ask: 4.4,
          volume: 8,
          openInterest: 90,
          iv: 0.31,
        },
      ],
    },
    maxPain: 188,
    oiWalls: {
      callWalls: [{ strike: 190, oi: 100 }],
      putWalls: [{ strike: 185, oi: 90 }],
    },
    gex: {
      netGEX: 1000,
      gexFlipLevel: 188,
      topConcentrations: [{ strike: 190, gex: 800 }],
      dealerPositioning: "long_gamma",
    },
  })),
  fetchHistoricalData: vi.fn(async (_ticker: string, period: string) => {
    const base =
      period === "1wk"
        ? 7
        : period === "1mo"
          ? 30
          : period === "6mo"
            ? 180
            : period === "1y"
              ? 365
              : 90;
    return Array.from({ length: 30 }, (_, index) => ({
      time: `2026-03-${String((index % 28) + 1).padStart(2, "0")}`,
      open: 180 + index,
      high: 181 + index,
      low: 179 + index,
      close: 180 + index + base / 365,
      volume: 1000 + index,
    }));
  }),
  fetchEarningsDate: vi.fn(async () => "2026-04-20T00:00:00.000Z"),
  computeRealizedVol: vi.fn(() => 0.22),
}));

vi.mock("@/lib/services/llm-analyzer", () => ({
  generateRecommendation: (...args: unknown[]) =>
    mockGenerateRecommendation(...args),
  generateDeepDive: vi.fn(async () => ({
    ticker: "AAPL",
    whale_trade_summary: "Event-driven setup.",
    market_narrative: "Macro event creates directional interest.",
    technical_patterns: [],
    timeframe_patterns: { "1W": [], "1M": [], "3M": [], "6M": [], "1Y": [] },
    support_resistance: [],
    indicators: [],
    options_context: {
      iv_percentile: "45",
      iv_interpretation: "Normal",
      put_call_ratio: "0.8",
      unusual_activity_note: "No unusual activity",
      greeks_summary: "Balanced",
    },
    entry_exit: {
      recommended_option_type: "call",
      entry_price_range: { low: 3.8, high: 4.3 },
      strike_selection: "Near ATM",
      expiry_guidance: "2-4 weeks",
      profit_target: "25%",
      stop_loss: "15%",
      position_sizing: "Small starter",
      rationale: "Event needs confirmation.",
    },
    global_events_connection: "Directly tied to the event.",
    risk_assessment: {
      overall_risk: "moderate",
      key_risks: ["headline reversal"],
      max_recommended_allocation: "2%",
    },
    educational_notes: [],
    disclaimer: "paper trade only",
  })),
}));

vi.mock("@/lib/utils/api-budget", () => ({
  isOverBudget: vi.fn(() => false),
  getRemainingBudget: vi.fn(() => 500),
  recordApiCall: vi.fn(),
}));

import {
  analyzeEventTickers,
  getEventTickerAnalysesByEventId,
} from "@/lib/services/event-ticker-analyzer";

function createSelectChain(result: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(result),
        })),
      })),
    })),
  };
}

describe("event-ticker-analyzer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateRecommendation.mockResolvedValue({
      ticker: "AAPL",
      thesis: "Event impact plus supportive options flow.",
      direction: "bullish",
      confidence: 0.72,
      primary_strategy: {
        name: "Bull Call Spread",
        legs: [
          {
            action: "buy",
            type: "call",
            strike: 190,
            expiry: "2026-04-17",
            estimated_premium: 4.2,
          },
        ],
        max_profit: "$280",
        max_loss: "$120",
        breakeven: "$191.20",
        risk_reward_ratio: "1:2.3",
      },
      market_context: {
        iv_assessment: "normal",
        iv_strategy_note: "IV remains tradable.",
        volume_assessment: "above_average",
        catalyst_date: null,
        days_to_catalyst: null,
      },
      risk_factors: ["macro volatility"],
      whale_alignment: {
        matches_whale: false,
        whale_position_size: "$0",
        similarity_note: "No whale flow detected — event-only signal",
      },
      disclaimer: "paper trade only",
    });
    mockDb.select.mockImplementationOnce(() => createSelectChain([]));
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("analyzes a ticker and persists the combined result", async () => {
    const results = await analyzeEventTickers({
      eventId: 55,
      tickers: ["aapl"],
      eventContext: {
        headline: "Tariff delay lifts consumer tech",
        summary: "Supply chain relief improves sentiment.",
        sentiment: "bullish",
        impactScore: 8,
        eventType: "policy",
        sectors: ["Technology"],
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      ticker: "AAPL",
      eventId: 55,
      source: "event_ticker",
    });
    expect(mockDb.insert).toHaveBeenCalledTimes(4);
  });

  it("forces recommendation whale alignment to reflect actual whale matches", async () => {
    mockDb.select.mockReset();
    mockDb.select.mockImplementationOnce(() =>
      createSelectChain([
        {
          id: 91,
          ticker: "AAPL",
          strike: 190,
          expiry: "2026-04-17",
          callPut: "C",
          premium: 250000,
          volume: 120,
          openInterest: 400,
          sentiment: "bullish",
          detectedAt: "2026-04-06T12:00:00.000Z",
          qualityScore: 88,
        },
      ]),
    );
    mockGenerateRecommendation.mockResolvedValue({
      ticker: "AAPL",
      thesis: "Event impact plus supportive options flow.",
      direction: "bullish",
      confidence: 0.72,
      primary_strategy: {
        name: "Bull Call Spread",
        legs: [
          {
            action: "buy",
            type: "call",
            strike: 190,
            expiry: "2026-04-17",
            estimated_premium: 4.2,
          },
        ],
        max_profit: "$280",
        max_loss: "$120",
        breakeven: "$191.20",
        risk_reward_ratio: "1:2.3",
      },
      market_context: {
        iv_assessment: "normal",
        iv_strategy_note: "IV remains tradable.",
        volume_assessment: "above_average",
        catalyst_date: null,
        days_to_catalyst: null,
      },
      risk_factors: ["macro volatility"],
      whale_alignment: {
        matches_whale: false,
        whale_position_size: "$0",
        similarity_note: "No whale flow detected — event-only signal",
      },
      disclaimer: "paper trade only",
    });

    const [result] = await analyzeEventTickers({
      eventId: 55,
      tickers: ["aapl"],
      eventContext: {
        headline: "Tariff delay lifts consumer tech",
        summary: "Supply chain relief improves sentiment.",
        sentiment: "bullish",
        impactScore: 8,
        eventType: "policy",
        sectors: ["Technology"],
      },
    });

    expect(result.whaleMatch.hasWhaleActivity).toBe(true);
    expect(result.recommendation.whale_alignment.matches_whale).toBe(true);
    expect(result.recommendation.whale_alignment.whale_position_size).toBe(
      "$250K",
    );
  });

  it("parses cached event ticker analyses by event id", async () => {
    mockDb.select.mockReset();
    mockDb.select.mockImplementationOnce(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn().mockResolvedValue([
            {
              output: JSON.stringify({
                ticker: "AAPL",
                eventId: 55,
                eventContext: {
                  headline: "Tariff delay lifts consumer tech",
                  sentiment: "bullish",
                  impactScore: 8,
                },
                marketSnapshot: null,
                optionsSummary: null,
                deepDive: { ticker: "AAPL" },
                recommendation: { ticker: "AAPL" },
                whaleMatch: {
                  hasWhaleActivity: false,
                  alerts: [],
                  bestQualityScore: null,
                },
                source: "event_ticker",
              }),
              createdAt: "2026-04-06T12:00:00.000Z",
            },
          ]),
        })),
      })),
    }));

    const results = await getEventTickerAnalysesByEventId(55);
    expect(results).toHaveLength(1);
    expect(results[0].ticker).toBe("AAPL");
  });
});
