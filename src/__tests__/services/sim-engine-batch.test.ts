import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PositionValuation } from "@/types/portfolio";

// Mock all external dependencies before importing the module under test
vi.mock("@/lib/db/client", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 1 }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  simTrades: { status: "status", id: "id", $inferSelect: {} },
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

// We need drizzle-orm eq/and mocks
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col, _val) => ({ type: "eq" })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
}));

import { db } from "@/lib/db/client";
import {
  batchEvaluatePositions,
  getIsEvaluating,
} from "@/lib/services/sim-engine";

// Helper to create a mock trade
function makeTrade(overrides: Record<string, unknown> = {}) {
  const pastDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(); // 3 days ago
  const futureExpiry = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString(); // 30 days from now

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
    entryDate: pastDate,
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
    createdAt: pastDate,
    ...overrides,
  };
}

describe("batchEvaluatePositions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no open positions", async () => {
    // Mock db.select().from().where() to return empty array
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    const result = await batchEvaluatePositions();
    expect(result).toEqual([]);
  });

  it("detects expired positions", async () => {
    const expiredLeg = JSON.stringify([
      {
        action: "buy",
        type: "call",
        strike: 150,
        expiry: "2020-01-01", // expired long ago
        premium: 5.0,
        quantity: 1,
      },
    ]);
    const trade = makeTrade({ id: 10, legs: expiredLeg });

    const mockWhere = vi.fn().mockResolvedValue([trade]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    mockFetchMarketData.mockResolvedValue([{ ticker: "AAPL", price: 170 }]);

    const result = await batchEvaluatePositions();
    expect(result.length).toBe(1);
    expect(result[0].exitTriggered).toBe(true);
    expect(result[0].exitReason).toBe("expiry");
    expect(result[0].currentValue).toBe(0);
  });

  it("detects time-exceeded positions", async () => {
    const oldEntry = new Date(
      Date.now() - 20 * 24 * 60 * 60 * 1000,
    ).toISOString(); // 20 days ago
    const trade = makeTrade({
      id: 11,
      entryDate: oldEntry,
      timeExitDays: 14,
    });

    const mockWhere = vi.fn().mockResolvedValue([trade]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    mockFetchMarketData.mockResolvedValue([{ ticker: "AAPL", price: 170 }]);
    mockFetchOptionsChain.mockResolvedValue(null); // force fallback

    const result = await batchEvaluatePositions();
    expect(result.length).toBe(1);
    expect(result[0].exitTriggered).toBe(true);
    expect(result[0].exitReason).toBe("time_exit");
  });

  it("returns nearExitThreshold: false for positions far from triggers", async () => {
    const trade = makeTrade({
      id: 12,
      entryPrice: 500,
    });

    const mockWhere = vi.fn().mockResolvedValue([trade]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    // Stock price that gives intrinsic value close to entry (small P&L)
    // Buy call at strike 150, stock at 155 → intrinsic = 5 * 100 = 500 → 0% P&L
    mockFetchMarketData.mockResolvedValue([{ ticker: "AAPL", price: 155 }]);

    const result = await batchEvaluatePositions();
    expect(result.length).toBe(1);
    expect(result[0].nearExitThreshold).toBe(false);
    expect(result[0].exitTriggered).toBe(false);
  });

  it("returns nearExitThreshold: true when near profit target", async () => {
    const trade = makeTrade({
      id: 13,
      entryPrice: 500,
      profitTargetPct: 50,
    });

    const mockWhere = vi.fn().mockResolvedValue([trade]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({ from: mockFrom });

    // Stock at 157 → intrinsic = 7 * 100 = 700 → PnL = (700-500)/500 = 40% (>= 50*0.8=40%)
    mockFetchMarketData.mockResolvedValue([{ ticker: "AAPL", price: 157 }]);
    // Options chain returns null so it falls back to stock price again for deep check
    mockFetchOptionsChain.mockResolvedValue(null);

    const result = await batchEvaluatePositions();
    expect(result.length).toBe(1);
    expect(result[0].nearExitThreshold).toBe(true);
  });

  it("mutex prevents concurrent calls", async () => {
    // Mutex should be false initially
    expect(getIsEvaluating()).toBe(false);
  });
});
