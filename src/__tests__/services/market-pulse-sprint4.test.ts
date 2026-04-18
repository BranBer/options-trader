import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

const mockFetchCandleWindow = vi.fn();
const mockCallLlmWithRetry = vi.fn();
const mockGetTokenUsageSnapshot = vi.fn();
const mockGetCachedCalendar = vi.fn();
const mockGetRecentReleaseSummary = vi.fn();

vi.mock("@/lib/db/client", () => ({ db: mockDb }));
vi.mock("@/lib/services/market-pulse-candles", () => ({
  MARKET_PULSE_DEFAULT_WINDOW_SIZE: 8,
  fetchCandleWindow: (...args: unknown[]) => mockFetchCandleWindow(...args),
}));
vi.mock("@/lib/services/llm-client", () => ({
  callLlmWithRetry: (...args: unknown[]) => mockCallLlmWithRetry(...args),
  getTokenUsageSnapshot: () => mockGetTokenUsageSnapshot(),
}));
vi.mock("@/lib/services/live-economic-calendar", () => ({
  getCachedCalendar: () => mockGetCachedCalendar(),
}));
vi.mock("@/lib/services/post-release-analyzer", () => ({
  getRecentReleaseSummary: () => mockGetRecentReleaseSummary(),
}));

import { orchestrateTickerPulse } from "@/lib/services/market-pulse-engine";

function makeInsertChain() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function makeUpdateChain() {
  return {
    set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  };
}

function makeSelectChain(result: unknown, withLimit = false) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() =>
        withLimit
          ? {
              orderBy: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue(result),
              })),
              limit: vi.fn().mockResolvedValue(result),
            }
          : {
              orderBy: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue(result),
              })),
              limit: vi.fn().mockResolvedValue(result),
            },
      ),
      orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(result) })),
    })),
  };
}

describe("market-pulse Sprint 4 orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.update.mockImplementation(() => makeUpdateChain());
    (mockDb as { insert?: unknown }).insert = vi.fn(() => makeInsertChain());
    mockGetCachedCalendar.mockReturnValue([]);
    mockGetRecentReleaseSummary.mockReturnValue({
      recentReleases: [],
      generatedAt: new Date().toISOString(),
    });
    mockGetTokenUsageSnapshot
      .mockReturnValueOnce({})
      .mockReturnValueOnce({
        marketPulseClassify: { count: 1, totalTokens: 100 },
      })
      .mockReturnValueOnce({
        marketPulseClassify: { count: 1, totalTokens: 100 },
        marketPulseCorrelate: { count: 1, totalTokens: 40 },
      })
      .mockReturnValueOnce({
        marketPulseClassify: { count: 1, totalTokens: 100 },
        marketPulseCorrelate: { count: 1, totalTokens: 40 },
        marketPulseNarrative: { count: 1, totalTokens: 30 },
      });

    mockFetchCandleWindow.mockResolvedValue([
      {
        ticker: "AAPL",
        candleTime: "2026-04-18T14:00:00.000Z",
        payload: {
          candle: { open: 100, high: 102, low: 99, close: 101, volume: 1000 },
          indicators: {
            rsi: 60,
            bb_upper: 105,
            bb_lower: 95,
            bb_position: "mid",
            volume_vs_avg: 1.2,
          },
          context: {
            trend: "uptrend",
            key_levels: [99, 101, 103],
            timeframe: "15m",
          },
        },
      },
      {
        ticker: "AAPL",
        candleTime: "2026-04-18T14:15:00.000Z",
        payload: {
          candle: { open: 101, high: 103, low: 100, close: 102, volume: 1000 },
          indicators: {
            rsi: 62,
            bb_upper: 106,
            bb_lower: 96,
            bb_position: "mid",
            volume_vs_avg: 1.1,
          },
          context: {
            trend: "uptrend",
            key_levels: [100, 102, 104],
            timeframe: "15m",
          },
        },
      },
      {
        ticker: "AAPL",
        candleTime: "2026-04-18T14:30:00.000Z",
        payload: {
          candle: { open: 102, high: 104, low: 101, close: 103, volume: 1000 },
          indicators: {
            rsi: 65,
            bb_upper: 107,
            bb_lower: 97,
            bb_position: "upper",
            volume_vs_avg: 1.3,
          },
          context: {
            trend: "uptrend",
            key_levels: [101, 103, 105],
            timeframe: "15m",
          },
        },
      },
    ]);
  });

  it("runs classification, correlation, and narrative with one shared runId", async () => {
    mockGetCachedCalendar.mockReturnValue([
      {
        date: "2026-04-18",
        name: "Fed speaker",
        impact: "medium",
        description: "Fed commentary",
        source: "calendar",
      },
    ]);

    mockDb.select
      .mockImplementationOnce(() => makeSelectChain([], true))
      .mockImplementationOnce(() => makeSelectChain([], true))
      .mockImplementationOnce(() => makeSelectChain([], true));

    mockCallLlmWithRetry
      .mockResolvedValueOnce({
        classifications: [
          {
            candle_time: "2026-04-18T14:00:00.000Z",
            classification: {
              control: "buyers",
              control_strength: 7,
              rejection_type: "lower_rejection",
              rejection_strength: 5,
              absorption_detected: false,
              momentum_state: "expanding",
              structure_state: "trend_continuation",
              volatility_state: "expansion",
            },
            event: "Buyers held control.",
            significance: "medium",
            tradability: "watch",
          },
          {
            candle_time: "2026-04-18T14:15:00.000Z",
            classification: {
              control: "buyers",
              control_strength: 7,
              rejection_type: "none",
              rejection_strength: 2,
              absorption_detected: false,
              momentum_state: "expanding",
              structure_state: "trend_continuation",
              volatility_state: "expansion",
            },
            event: "Buyers kept control.",
            significance: "medium",
            tradability: "watch",
          },
          {
            candle_time: "2026-04-18T14:30:00.000Z",
            classification: {
              control: "buyers",
              control_strength: 8,
              rejection_type: "none",
              rejection_strength: 1,
              absorption_detected: false,
              momentum_state: "expanding",
              structure_state: "trend_continuation",
              volatility_state: "expansion",
            },
            event: "Buyers confirmed continuation.",
            significance: "high",
            tradability: "actionable",
          },
        ],
      })
      .mockResolvedValueOnce({ correlations: [] })
      .mockResolvedValueOnce({
        current_control: "buyers",
        control_strength: 7,
        narrative_summary: "Buyers stayed in control across the sequence.",
        market_phase: "trend",
        expected_behavior: "continuation",
        key_conflicts: [],
        confidence_in_assessment: 0.8,
      });

    const result = await orchestrateTickerPulse({
      ticker: "AAPL",
      runId: "run-orch-1",
    });

    expect(result.runId).toBe("run-orch-1");
    expect(result.status).toBe("success");
    expect(result.correlations).toEqual([]);
    expect(result.narrative).toMatchObject({ market_phase: "trend" });
  });
});
