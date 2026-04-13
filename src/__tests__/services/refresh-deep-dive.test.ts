import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ db: mockDb }));

vi.mock("@/lib/db/schema", () => ({
  analyses: {
    type: "analyses",
    inputRefs: "inputRefs",
    createdAt: "createdAt",
  },
  newsEvents: { createdAt: "createdAt", impactScore: "impactScore" },
  whaleAlerts: {
    ticker: "ticker",
    detectedAt: "detectedAt",
    qualityScore: "qualityScore",
  },
}));

vi.mock("@/lib/services/market-fetcher", () => ({
  fetchVIX: vi.fn(async () => 18.5),
  fetchMarketData: vi.fn(async () => [
    { ticker: "AAPL", price: 190.0, volume: 1_200_000, dayChangePct: 0.5 },
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
  fetchHistoricalData: vi.fn(async () =>
    Array.from({ length: 30 }, (_, i) => ({
      time: `2026-03-${String((i % 28) + 1).padStart(2, "0")}`,
      open: 180 + i,
      high: 181 + i,
      low: 179 + i,
      close: 180.5 + i,
      volume: 1000 + i,
    })),
  ),
  fetchEarningsDate: vi.fn(async () => "2026-04-20T00:00:00.000Z"),
  computeRealizedVol: vi.fn(() => 0.22),
  getOrFetchShortInterest: vi.fn(async () => null),
}));

const mockGenerateDeepDive = vi.fn(async () => ({
  deepDive: {
    ticker: "AAPL",
    whale_trade_summary: "Refreshed analysis.",
    market_narrative: "Updated narrative.",
    technical_patterns: [],
    timeframe_patterns: { "1W": [], "1M": [], "3M": [], "6M": [], "1Y": [] },
    support_resistance: [],
    indicators: [],
    options_context: {
      iv_percentile: "45",
      iv_interpretation: "Normal",
      put_call_ratio: "0.8",
      unusual_activity_note: "None",
      greeks_summary: "Balanced",
    },
    entry_exit: {
      recommended_option_type: "call",
      entry_price_range: { low: 3.8, high: 4.3 },
      strike_selection: "Near ATM",
      expiry_guidance: "2-4 weeks",
      profit_target: "25%",
      stop_loss: "15%",
      position_sizing: "Small",
      rationale: "Refreshed.",
    },
    global_events_connection: "Macro aligned.",
    risk_assessment: {
      overall_risk: "moderate",
      key_risks: ["headline reversal"],
      max_recommended_allocation: "2%",
    },
    educational_notes: [],
    disclaimer: "paper trade only",
  },
  triggerReport: {
    ticker: "AAPL",
    computedAt: new Date().toISOString(),
    primaryTrigger: null,
    secondaryTriggers: [],
    activeLevels: [],
    swingStructure: {
      swings: [],
      structure: "higher_highs_higher_lows",
      structureShift: null,
      lastHigherLow: null,
      lastLowerHigh: null,
    },
    overallAssessment: {
      score: 30,
      classification: "setup_only",
      summary: "No active triggers.",
    },
  },
}));

vi.mock("@/lib/services/llm-analyzer", () => ({
  generateDeepDive: (...args: unknown[]) => mockGenerateDeepDive(...args),
}));

vi.mock("@/lib/utils/indicator-patterns", () => ({
  detectAllIndicatorPatterns: vi.fn(() => ({
    ticker: "AAPL",
    timeframe: "3M",
    patterns: [],
    summary: { bullish: 0, bearish: 0, neutral: 0 },
  })),
}));

vi.mock("@/lib/utils/vix-regimes", () => ({
  buildVIXContext: vi.fn((level: number) => ({
    level,
    regime: level < 20 ? "low" : "elevated",
  })),
}));

vi.mock("@/lib/utils/earnings-proximity", () => ({
  getEarningsProximity: vi.fn(() => ({
    earningsDate: "2026-04-20",
    ivCrushRisk: "moderate",
  })),
}));

vi.mock("@/lib/utils/fomc-calendar", () => ({
  getFOMCProximity: vi.fn(() => ({
    nextDate: "2026-04-28",
    isDecisionWeek: false,
  })),
}));

vi.mock("@/lib/utils/api-budget", () => ({
  isOverBudget: vi.fn(() => false),
  getRemainingBudget: vi.fn(() => 500),
  recordApiCall: vi.fn(),
}));

vi.mock("@/lib/cron/pipelines/pipeline-version", () => ({
  DEEP_DIVE_PIPELINE_VERSION: 3,
}));

// ── Import SUT after mocks ────────────────────────────────────────────

import {
  refreshTickerDeepDive,
  BudgetExceededError,
} from "@/lib/services/refresh-deep-dive";
import {
  getRemainingBudget,
  isOverBudget,
  recordApiCall,
} from "@/lib/utils/api-budget";
import { fetchMarketData } from "@/lib/services/market-fetcher";

// ── Helpers ────────────────────────────────────────────────────────────

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

// ── Tests ──────────────────────────────────────────────────────────────

describe("refreshTickerDeepDive", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset budget mocks to defaults
    vi.mocked(isOverBudget).mockReturnValue(false);
    vi.mocked(getRemainingBudget).mockReturnValue(500);

    // Default: no recent news, no whale alerts
    mockDb.select
      .mockImplementationOnce(() => createSelectChain([])) // news query
      .mockImplementationOnce(() => createSelectChain([])); // whale query

    mockDb.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("happy path — fetches data, generates deep dive, persists to DB", async () => {
    const result = await refreshTickerDeepDive("aapl");

    expect(result.deepDive.ticker).toBe("AAPL");
    expect(result.triggerReport).toBeTruthy();
    expect(result.createdAt).toBeTruthy();

    // Verify generateDeepDive was called with correct ticker
    expect(mockGenerateDeepDive).toHaveBeenCalledTimes(1);
    const input = mockGenerateDeepDive.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(input.ticker).toBe("AAPL");
    expect(input.macroContext).toHaveProperty("vixLevel", 18.5);
    expect(input.macroContext).toHaveProperty("earningsDate", "2026-04-20");

    // Verify DB insert
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const insertValues = mockDb.insert.mock.results[0].value.values;
    const insertArg = insertValues.mock.calls[0][0];
    expect(insertArg.type).toBe("deep_dive");
    const refs = JSON.parse(insertArg.inputRefs);
    expect(refs.ticker).toBe("AAPL");
    expect(refs.pipelineVersion).toBe(3);
    expect(refs.source).toBe("manual_refresh");
    expect(refs.triggerReport).toBeTruthy();

    // Verify API budget recorded
    expect(recordApiCall).toHaveBeenCalledWith("yahoo", 9);
  });

  it("throws BudgetExceededError when Yahoo budget is depleted", async () => {
    vi.mocked(isOverBudget).mockReturnValue(true);

    await expect(refreshTickerDeepDive("AAPL")).rejects.toThrow(
      BudgetExceededError,
    );

    // No market data calls should have been made
    expect(fetchMarketData).not.toHaveBeenCalled();
    expect(mockGenerateDeepDive).not.toHaveBeenCalled();
  });

  it("throws BudgetExceededError when remaining budget is too low", async () => {
    vi.mocked(isOverBudget).mockReturnValue(false);
    vi.mocked(getRemainingBudget).mockReturnValue(5); // Need 9

    await expect(refreshTickerDeepDive("TSLA")).rejects.toThrow(
      BudgetExceededError,
    );
    expect(fetchMarketData).not.toHaveBeenCalled();
  });

  it("works without whale data — uses fallback whaleTrade", async () => {
    // Already mocked: whale query returns []
    const result = await refreshTickerDeepDive("NVDA");

    expect(result.deepDive).toBeTruthy();
    const input = mockGenerateDeepDive.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    const whaleTrade = input.whaleTrade as Record<string, unknown>;
    expect(whaleTrade.ticker).toBe("NVDA");
    expect(whaleTrade.callPut).toBe("C"); // default fallback
    expect(whaleTrade.strike).toBeUndefined();
  });

  it("handles fetchMarketData returning no data — currentPrice defaults to 0", async () => {
    vi.mocked(fetchMarketData).mockResolvedValueOnce([]);

    const result = await refreshTickerDeepDive("XYZ");
    expect(result.deepDive).toBeTruthy();

    const input = mockGenerateDeepDive.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(input.currentPrice).toBe(0);
  });

  it("normalizes ticker to uppercase and trims whitespace", async () => {
    await refreshTickerDeepDive("  msft  ");

    const input = mockGenerateDeepDive.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(input.ticker).toBe("MSFT");
  });

  it("rejects empty ticker", async () => {
    await expect(refreshTickerDeepDive("")).rejects.toThrow("Invalid ticker");
  });

  it("rejects ticker longer than 10 characters", async () => {
    await expect(refreshTickerDeepDive("TOOLONGTICKER")).rejects.toThrow(
      "Invalid ticker",
    );
  });

  it("uses whale alert data when available", async () => {
    const whaleAlert = {
      ticker: "AAPL",
      strike: 195,
      expiry: "2026-05-16",
      callPut: "C",
      premium: 2_500_000,
      volume: 5000,
      openInterest: 12000,
      sentiment: "bullish",
      qualityScore: 85,
      detectedAt: new Date().toISOString(),
    };

    mockDb.select
      .mockReset()
      .mockImplementationOnce(() => createSelectChain([])) // news
      .mockImplementationOnce(() => createSelectChain([whaleAlert])); // whale

    const result = await refreshTickerDeepDive("AAPL");
    expect(result.deepDive).toBeTruthy();

    const input = mockGenerateDeepDive.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    const whaleTrade = input.whaleTrade as Record<string, unknown>;
    expect(whaleTrade.strike).toBe(195);
    expect(whaleTrade.expiry).toBe("2026-05-16");
    expect(whaleTrade.premium).toBe(2_500_000);
    expect(whaleTrade.sentiment).toBe("bullish");
  });
});
