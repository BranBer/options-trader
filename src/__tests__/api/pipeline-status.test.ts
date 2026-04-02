import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies
vi.mock("@/lib/cron/pipeline-progress", () => ({
  getProgress: vi.fn(() => ({
    active: false,
    steps: [{ label: "Test step", status: "done" }],
    startedAt: "2026-03-29T12:00:00Z",
    lastError: null,
    stageResults: null,
  })),
  getLastError: vi.fn(() => null),
  getStageResults: vi.fn(() => null),
}));

vi.mock("@/lib/cron/scheduler", () => ({
  getLastRefreshAt: vi.fn(() => "2026-03-29T12:30:00Z"),
}));

vi.mock("@/lib/cron/exit-monitor", () => ({
  getExitMonitorStatus: vi.fn(() => ({
    lastRunAt: "2026-03-29T12:25:00Z",
    lastRunResult: {
      timestamp: "2026-03-29T12:25:00Z",
      skipped: false,
      positionsChecked: 3,
      positionsClosed: 1,
      closedTrades: [{ tradeId: 1, ticker: "AAPL", reason: "profit_target" }],
    },
    isRunning: false,
  })),
}));

vi.mock("@/lib/utils/api-budget", () => ({
  getBudgetSummary: vi.fn(() => ({
    yahoo: { used: 150, budget: 1800, pct: 8 },
    finnhub: { used: 10, budget: 250, pct: 4 },
  })),
}));

vi.mock("@/lib/cron/pipelines/sim-pipeline", () => ({
  getLastRunRejections: vi.fn(() => []),
}));

vi.mock("@/lib/services/llm-analyzer", () => ({
  getTokenUsageStats: vi.fn(() => ({
    recentCalls: [],
    byCallType: {},
  })),
}));

// We need to mock NextResponse to test the route handler
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((data: unknown) => ({ json: () => data, data })),
  },
}));

import { GET } from "@/app/api/pipeline-status/route";

describe("GET /api/pipeline-status", () => {
  it("returns pipeline progress fields", async () => {
    const response = await GET();
    const data = (response as any).data;

    expect(data).toHaveProperty("active");
    expect(data).toHaveProperty("steps");
    expect(data).toHaveProperty("startedAt");
    expect(data).toHaveProperty("lastRefreshAt");
  });

  it("includes exitMonitor status", async () => {
    const response = await GET();
    const data = (response as any).data;

    expect(data).toHaveProperty("exitMonitor");
    expect(data.exitMonitor).toHaveProperty("lastRunAt");
    expect(data.exitMonitor).toHaveProperty("lastRunResult");
    expect(data.exitMonitor).toHaveProperty("isRunning");
    expect(data.exitMonitor.isRunning).toBe(false);
  });

  it("includes apiBudget summary", async () => {
    const response = await GET();
    const data = (response as any).data;

    expect(data).toHaveProperty("apiBudget");
    expect(data.apiBudget).toHaveProperty("yahoo");
    expect(data.apiBudget.yahoo).toEqual({ used: 150, budget: 1800, pct: 8 });
  });

  it("includes derived pipelineHealth summary", async () => {
    const response = await GET();
    const data = (response as any).data;

    expect(data).toHaveProperty("pipelineHealth");
    expect(data.pipelineHealth).toHaveProperty("isStale");
    expect(data.pipelineHealth).toHaveProperty("minutesSinceRefresh");
    expect(data.pipelineHealth).toHaveProperty("status");
  });
});
