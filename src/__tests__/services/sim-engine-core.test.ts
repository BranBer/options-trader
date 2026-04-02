import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock("@/lib/db/client", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  simTrades: { status: "status", id: "id" },
  simPortfolio: { id: "id" },
  simPortfolioSnapshots: {},
  simEvaluations: {},
}));

const mockFetchMarketData = vi.fn();
const mockFetchOptionsChain = vi.fn();

vi.mock("@/lib/services/market-fetcher", () => ({
  fetchMarketData: (...args: unknown[]) => mockFetchMarketData(...args),
  fetchOptionsChain: (...args: unknown[]) => mockFetchOptionsChain(...args),
}));

vi.mock("@/lib/utils/api-budget", () => ({
  recordApiCall: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, _val) => ({ type: "eq" })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
}));

import { getOpenPositionsSummary } from "@/lib/services/sim-engine";

// Helper to create mock trades
function makeTrade(overrides: Record<string, unknown> = {}) {
  const futureExpiry = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  return {
    id: 1,
    ticker: "AAPL",
    optionSymbol: null,
    strategyName: "Bull Call Spread",
    direction: "bullish",
    legs: JSON.stringify([
      {
        action: "buy",
        type: "call",
        strike: 150,
        expiry: futureExpiry,
        premium: 5.0,
        quantity: 1,
      },
    ]),
    entryPrice: 500,
    entryDate: new Date().toISOString(),
    exitPrice: null,
    exitDate: null,
    quantity: 1,
    pnl: null,
    pnlPct: null,
    status: "open",
    exitReason: null,
    geminiReasoning: null,
    profitTargetPct: 50,
    stopLossPct: 30,
    timeExitDays: 14,
    sourceAnalysisId: null,
    sourceWhaleId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("getOpenPositionsSummary", () => {
  it("filters to only open positions", () => {
    const trades = [
      makeTrade({ id: 1, status: "open", ticker: "AAPL" }),
      makeTrade({ id: 2, status: "closed", ticker: "TSLA" }),
      makeTrade({ id: 3, status: "open", ticker: "MSFT" }),
    ] as any[];

    const summary = getOpenPositionsSummary(trades);
    expect(summary).toHaveLength(2);
    expect(summary.map((s: any) => s.ticker)).toEqual(["AAPL", "MSFT"]);
  });

  it("returns empty array for no open trades", () => {
    const trades = [makeTrade({ status: "closed" })] as any[];

    expect(getOpenPositionsSummary(trades)).toHaveLength(0);
  });

  it("includes correct shape per position", () => {
    const trades = [
      makeTrade({ ticker: "SPY", direction: "bearish", entryPrice: 300 }),
    ] as any[];
    const [pos] = getOpenPositionsSummary(trades);
    expect(pos).toEqual({
      ticker: "SPY",
      direction: "bearish",
      entryPrice: 300,
      currentPnlPct: 0,
    });
  });
});

describe("closePosition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when trade is not found", async () => {
    // Mock select chain to return empty
    const mockChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    };
    mockDbSelect.mockReturnValue(mockChain);

    const { closePosition } = await import("@/lib/services/sim-engine");
    await closePosition(999, 100, "profit_target");

    // update should not have been called
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});

describe("openPosition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects trades exceeding 25% of balance", async () => {
    // Mock getOrCreatePortfolio to return balance of 1000
    const mockLimit = vi.fn().mockResolvedValue([
      {
        id: 1,
        balance: 1000,
        startingBalance: 2000,
        totalPnl: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        maxDrawdown: 0,
        bestTradePnl: 0,
        worstTradePnl: 0,
        lastUpdated: null,
      },
    ]);
    const mockFromPortfolio = vi.fn().mockReturnValue({ limit: mockLimit });
    mockDbSelect.mockReturnValue({ from: mockFromPortfolio });

    const { openPosition } = await import("@/lib/services/sim-engine");
    const result = await openPosition({
      ticker: "AAPL",
      decision: {
        should_enter: true,
        reasoning: "test",
        position_size_dollars: 300,
        adjusted_entry: {
          strategy_name: "Test",
          legs: [
            {
              action: "buy" as const,
              type: "call" as const,
              strike: 150,
              expiry: "2026-06-01",
              premium: 3,
              quantity: 1,
            },
          ],
          net_premium: 300, // 300 > 250 (25% of 1000)
        },
        exit_plan: {
          profit_target_pct: 50,
          stop_loss_pct: 30,
          time_exit_days: 14,
        },
        risk_notes: [],
        educational_summary: "test",
      },
    });

    expect(result).toBeNull();
  });
});
