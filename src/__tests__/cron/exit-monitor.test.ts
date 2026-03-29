import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing
const mockBatchEvaluatePositions = vi.fn();
const mockClosePosition = vi.fn();
const mockTakePortfolioSnapshot = vi.fn();
const mockGetIsEvaluating = vi.fn();
const mockIsMarketOpen = vi.fn();
const mockIsOverBudget = vi.fn();

vi.mock("@/lib/services/sim-engine", () => ({
  batchEvaluatePositions: (...args: unknown[]) =>
    mockBatchEvaluatePositions(...args),
  closePosition: (...args: unknown[]) => mockClosePosition(...args),
  takePortfolioSnapshot: (...args: unknown[]) =>
    mockTakePortfolioSnapshot(...args),
  getIsEvaluating: () => mockGetIsEvaluating(),
}));

vi.mock("@/lib/utils/market-hours", () => ({
  isMarketOpen: () => mockIsMarketOpen(),
}));

vi.mock("@/lib/utils/api-budget", () => ({
  isOverBudget: (provider: string) => mockIsOverBudget(provider),
}));

import { runExitMonitor, getExitMonitorStatus } from "@/lib/cron/exit-monitor";

describe("runExitMonitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: market open, budget OK, not evaluating
    mockIsMarketOpen.mockReturnValue({
      isOpen: true,
      isExtendedHours: false,
      reason: "regular_hours",
    });
    mockIsOverBudget.mockReturnValue(false);
    mockGetIsEvaluating.mockReturnValue(false);
    mockBatchEvaluatePositions.mockResolvedValue([]);
    mockClosePosition.mockResolvedValue(undefined);
    mockTakePortfolioSnapshot.mockResolvedValue(undefined);

    // Ensure env allows running
    delete process.env.EXIT_MONITOR_ENABLED;
    delete process.env.EXIT_MONITOR_MARKET_HOURS_ONLY;
  });

  it("skips when EXIT_MONITOR_ENABLED=false", async () => {
    process.env.EXIT_MONITOR_ENABLED = "false";
    const result = await runExitMonitor();
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("disabled");
    expect(mockBatchEvaluatePositions).not.toHaveBeenCalled();
  });

  it("skips when market is closed and market-hours-only is enabled", async () => {
    mockIsMarketOpen.mockReturnValue({
      isOpen: false,
      isExtendedHours: false,
      reason: "weekend",
    });
    const result = await runExitMonitor();
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain("market_closed");
  });

  it("does NOT skip when market is closed but market-hours-only is disabled", async () => {
    process.env.EXIT_MONITOR_MARKET_HOURS_ONLY = "false";
    mockIsMarketOpen.mockReturnValue({
      isOpen: false,
      isExtendedHours: false,
      reason: "weekend",
    });

    const result = await runExitMonitor();
    expect(result.skipped).toBe(false);
    expect(mockBatchEvaluatePositions).toHaveBeenCalled();
  });

  it("skips when API budget is exceeded", async () => {
    mockIsOverBudget.mockReturnValue(true);
    const result = await runExitMonitor();
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("api_budget_exceeded");
  });

  it("skips when main pipeline is evaluating", async () => {
    mockGetIsEvaluating.mockReturnValue(true);
    const result = await runExitMonitor();
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("pipeline_evaluating");
  });

  it("closes positions that hit exit triggers", async () => {
    mockBatchEvaluatePositions.mockResolvedValue([
      {
        tradeId: 1,
        ticker: "AAPL",
        currentValue: 750,
        pnlPct: 55,
        daysHeld: 5,
        nearExitThreshold: true,
        exitTriggered: true,
        exitReason: "profit_target",
      },
      {
        tradeId: 2,
        ticker: "TSLA",
        currentValue: 300,
        pnlPct: 10,
        daysHeld: 3,
        nearExitThreshold: false,
        exitTriggered: false,
        exitReason: null,
      },
    ]);

    const result = await runExitMonitor();
    expect(result.skipped).toBe(false);
    expect(result.positionsChecked).toBe(2);
    expect(result.positionsClosed).toBe(1);
    expect(result.closedTrades).toHaveLength(1);
    expect(result.closedTrades[0].ticker).toBe("AAPL");
    expect(result.closedTrades[0].reason).toBe("profit_target");
    expect(mockClosePosition).toHaveBeenCalledWith(1, 750, "profit_target");
  });

  it("takes portfolio snapshot only when positions are closed", async () => {
    // No exit triggers
    mockBatchEvaluatePositions.mockResolvedValue([
      {
        tradeId: 1,
        ticker: "AAPL",
        currentValue: 500,
        pnlPct: 0,
        daysHeld: 2,
        nearExitThreshold: false,
        exitTriggered: false,
        exitReason: null,
      },
    ]);

    await runExitMonitor();
    expect(mockTakePortfolioSnapshot).not.toHaveBeenCalled();

    // With exit trigger
    mockBatchEvaluatePositions.mockResolvedValue([
      {
        tradeId: 2,
        ticker: "TSLA",
        currentValue: 100,
        pnlPct: -35,
        daysHeld: 5,
        nearExitThreshold: true,
        exitTriggered: true,
        exitReason: "stop_loss",
      },
    ]);

    await runExitMonitor();
    expect(mockTakePortfolioSnapshot).toHaveBeenCalledTimes(1);
  });

  it("updates status after a run", async () => {
    mockBatchEvaluatePositions.mockResolvedValue([]);
    await runExitMonitor();

    const status = getExitMonitorStatus();
    expect(status.lastRunAt).toBeTruthy();
    expect(status.lastRunResult).toBeTruthy();
    expect(status.isRunning).toBe(false);
    expect(status.lastRunResult!.positionsChecked).toBe(0);
  });
});
