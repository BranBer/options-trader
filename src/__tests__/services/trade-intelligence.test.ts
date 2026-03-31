import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSector, areCorrelated } from "@/lib/utils/sector-map";

// ---------------------------------------------------------------------------
// Mock the DB and external dependencies so we can test the pipeline helpers
// ---------------------------------------------------------------------------
const mockLimit = vi.fn();
const mockOrderBy = vi.fn().mockReturnValue({ limit: mockLimit });
const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

vi.mock("@/lib/db/client", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
      }),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  marketSnapshots: {
    ivRvSpread: "iv_rv_spread",
    ticker: "ticker",
    capturedAt: "captured_at",
  },
  simEvaluations: {},
  simTrades: {},
  analyses: {},
  whaleAlerts: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  desc: vi.fn(),
  gte: vi.fn(),
  and: vi.fn(),
}));

const mockFetchEarningsDate = vi.fn();
vi.mock("@/lib/services/market-fetcher", () => ({
  fetchEarningsDate: (...args: unknown[]) => mockFetchEarningsDate(...args),
  fetchMarketData: vi.fn(),
}));

vi.mock("@/lib/utils/market-hours", () => ({
  isMarketOpen: vi.fn(() => ({
    isOpen: true,
    isExtendedHours: false,
    reason: "Regular hours",
  })),
}));

vi.mock("@/lib/services/llm-analyzer", () => ({
  evaluateTradeForSim: vi.fn(),
}));

vi.mock("@/lib/services/sim-engine", () => ({
  openPosition: vi.fn(),
  evaluateOpenPositions: vi.fn(),
  takePortfolioSnapshot: vi.fn(),
  getOrCreatePortfolio: vi.fn(),
  getOpenPositionsSummary: vi.fn(),
  validateTradeLegs: vi.fn(),
}));

vi.mock("@/lib/cron/pipeline-progress", () => ({
  activate: vi.fn(),
  complete: vi.fn(),
  updateDetail: vi.fn(),
}));

// Import AFTER mocks are set up
import {
  checkIVEnvironment,
  checkEarningsProximity,
  checkConcentration,
} from "@/lib/cron/pipelines/sim-pipeline";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================================
// Story 20.1 — IV Environment Fitness Check
// ============================================================

describe("checkIVEnvironment (Story 20.1)", () => {
  it("rejects debit strategy when IV-RV spread > 0.25", async () => {
    mockLimit.mockResolvedValueOnce([{ ivRvSpread: 0.3 }]);
    const result = await checkIVEnvironment("AAPL", 5.0); // positive = debit
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("extremely overpriced");
  });

  it("warns for debit strategy when IV-RV spread > 0.15 but <= 0.25", async () => {
    mockLimit.mockResolvedValueOnce([{ ivRvSpread: 0.2 }]);
    const result = await checkIVEnvironment("AAPL", 5.0);
    expect(result.allowed).toBe(true);
    expect(result.warning).toContain("IV CAUTION");
    expect(result.warning).toContain("high-IV");
  });

  it("allows credit strategy when IV-RV spread is high (appropriate)", async () => {
    mockLimit.mockResolvedValueOnce([{ ivRvSpread: 0.2 }]);
    const result = await checkIVEnvironment("AAPL", -3.0); // negative = credit
    expect(result.allowed).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("warns for credit strategy in low-IV environment", async () => {
    mockLimit.mockResolvedValueOnce([{ ivRvSpread: -0.15 }]);
    const result = await checkIVEnvironment("AAPL", -3.0);
    expect(result.allowed).toBe(true);
    expect(result.warning).toContain("low-IV");
  });

  it("allows when no IV data available", async () => {
    mockLimit.mockResolvedValueOnce([]);
    const result = await checkIVEnvironment("AAPL", 5.0);
    expect(result.allowed).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("allows when IV-RV spread is null", async () => {
    mockLimit.mockResolvedValueOnce([{ ivRvSpread: null }]);
    const result = await checkIVEnvironment("AAPL", 5.0);
    expect(result.allowed).toBe(true);
  });

  it("allows debit strategy in normal IV environment", async () => {
    mockLimit.mockResolvedValueOnce([{ ivRvSpread: 0.05 }]);
    const result = await checkIVEnvironment("AAPL", 5.0);
    expect(result.allowed).toBe(true);
    expect(result.warning).toBeUndefined();
  });
});

// ============================================================
// Story 20.2 — Earnings Proximity Entry Block
// ============================================================

describe("checkEarningsProximity (Story 20.2)", () => {
  it("rejects debit spread when earnings in 2 days", async () => {
    const earningsDate = new Date();
    earningsDate.setDate(earningsDate.getDate() + 2);
    mockFetchEarningsDate.mockResolvedValueOnce(earningsDate.toISOString());

    const result = await checkEarningsProximity("AAPL", 5.0);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("IV crush");
  });

  it("allows credit spread when earnings in 2 days", async () => {
    const earningsDate = new Date();
    earningsDate.setDate(earningsDate.getDate() + 2);
    mockFetchEarningsDate.mockResolvedValueOnce(earningsDate.toISOString());

    const result = await checkEarningsProximity("AAPL", -3.0);
    expect(result.allowed).toBe(true);
  });

  it("allows debit spread when earnings in 10 days", async () => {
    const earningsDate = new Date();
    earningsDate.setDate(earningsDate.getDate() + 10);
    mockFetchEarningsDate.mockResolvedValueOnce(earningsDate.toISOString());

    const result = await checkEarningsProximity("AAPL", 5.0);
    expect(result.allowed).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("warns when earnings within 7 days (any strategy)", async () => {
    const earningsDate = new Date();
    earningsDate.setDate(earningsDate.getDate() + 5);
    mockFetchEarningsDate.mockResolvedValueOnce(earningsDate.toISOString());

    const result = await checkEarningsProximity("AAPL", -3.0);
    expect(result.allowed).toBe(true);
    expect(result.warning).toContain("Earnings proximity warning");
  });

  it("allows debit near earnings with high confidence catalyst override", async () => {
    const earningsDate = new Date();
    earningsDate.setDate(earningsDate.getDate() + 2);
    mockFetchEarningsDate.mockResolvedValueOnce(earningsDate.toISOString());

    const result = await checkEarningsProximity("AAPL", 5.0, 0.85);
    expect(result.allowed).toBe(true);
    expect(result.warning).toContain("catalyst override");
  });

  it("skips when no earnings date available", async () => {
    mockFetchEarningsDate.mockResolvedValueOnce(null);
    const result = await checkEarningsProximity("AAPL", 5.0);
    expect(result.allowed).toBe(true);
  });

  it("skips when fetchEarningsDate throws", async () => {
    mockFetchEarningsDate.mockRejectedValueOnce(new Error("API error"));
    const result = await checkEarningsProximity("AAPL", 5.0);
    expect(result.allowed).toBe(true);
  });

  it("skips when earnings already passed", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);
    mockFetchEarningsDate.mockResolvedValueOnce(pastDate.toISOString());

    const result = await checkEarningsProximity("AAPL", 5.0);
    expect(result.allowed).toBe(true);
  });
});

// ============================================================
// Story 20.3 — Concentration Guard
// ============================================================

describe("checkConcentration (Story 20.3)", () => {
  it("rejects when sector already has 2 same-direction positions", () => {
    const openPositions = [
      { ticker: "AAPL", direction: "bullish" },
      { ticker: "MSFT", direction: "bullish" },
    ];
    const result = checkConcentration("NVDA", "bullish", openPositions);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Sector concentration");
    expect(result.reason).toContain("Technology");
  });

  it("allows different direction in same sector (hedge)", () => {
    const openPositions = [
      { ticker: "AAPL", direction: "bullish" },
      { ticker: "MSFT", direction: "bullish" },
    ];
    const result = checkConcentration("INTC", "bearish", openPositions);
    expect(result.allowed).toBe(true);
  });

  it("allows position in a new sector with room", () => {
    const openPositions = [
      { ticker: "AAPL", direction: "bullish" },
      { ticker: "JPM", direction: "bullish" },
      { ticker: "XOM", direction: "bearish" },
    ];
    const result = checkConcentration("CAT", "bullish", openPositions);
    expect(result.allowed).toBe(true);
  });

  it("warns about correlated positions", () => {
    const openPositions = [{ ticker: "AMD", direction: "bullish" }];
    const result = checkConcentration("NVDA", "bullish", openPositions);
    expect(result.allowed).toBe(true);
    expect(result.warnings.some((w) => w.includes("correlated"))).toBe(true);
  });

  it("rejects when 3+ positions in same direction", () => {
    const openPositions = [
      { ticker: "AAPL", direction: "bullish" },
      { ticker: "JPM", direction: "bullish" },
      { ticker: "XOM", direction: "bullish" },
    ];
    const result = checkConcentration("CAT", "bullish", openPositions);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Directional concentration");
  });

  it("warns when all existing positions are same direction", () => {
    const openPositions = [
      { ticker: "AAPL", direction: "bearish" },
      { ticker: "JPM", direction: "bearish" },
    ];
    const result = checkConcentration("XOM", "bearish", openPositions);
    // 2 existing + 1 new = 3, which triggers directional limit
    expect(result.allowed).toBe(true);
    expect(
      result.warnings.some((w) => w.includes("directional exposure")),
    ).toBe(true);
  });

  it("allows opposite direction even with many positions", () => {
    const openPositions = [
      { ticker: "AAPL", direction: "bullish" },
      { ticker: "JPM", direction: "bullish" },
      { ticker: "XOM", direction: "bullish" },
    ];
    const result = checkConcentration("CAT", "bearish", openPositions);
    expect(result.allowed).toBe(true);
  });

  it("allows unknown sector tickers without sector block", () => {
    const openPositions = [
      { ticker: "ZZZZZ", direction: "bullish" },
      { ticker: "YYYYY", direction: "bearish" },
    ];
    // Unknown sector — should not trigger sector concentration
    const result = checkConcentration("XXXXX", "bullish", openPositions);
    expect(result.allowed).toBe(true);
  });
});

// ============================================================
// Sector map utility tests
// ============================================================

describe("getSector", () => {
  it("returns correct sector for known tickers", () => {
    expect(getSector("AAPL")).toBe("Technology");
    expect(getSector("JPM")).toBe("Financials");
    expect(getSector("XOM")).toBe("Energy");
    expect(getSector("UNH")).toBe("Healthcare");
  });

  it("returns Unknown for unmapped tickers", () => {
    expect(getSector("ZZZZZ")).toBe("Unknown");
  });

  it("is case-insensitive", () => {
    expect(getSector("aapl")).toBe("Technology");
  });
});

describe("areCorrelated", () => {
  it("identifies known correlated pairs", () => {
    expect(areCorrelated("AAPL", "MSFT")).toBe(true);
    expect(areCorrelated("AMD", "NVDA")).toBe(true);
    expect(areCorrelated("V", "MA")).toBe(true);
  });

  it("works in both directions", () => {
    expect(areCorrelated("MSFT", "AAPL")).toBe(true);
    expect(areCorrelated("NVDA", "AMD")).toBe(true);
  });

  it("returns false for non-correlated pairs", () => {
    expect(areCorrelated("AAPL", "XOM")).toBe(false);
    expect(areCorrelated("JPM", "TSLA")).toBe(false);
  });
});
