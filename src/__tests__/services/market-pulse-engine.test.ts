import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketPulsePreparedCandle } from "@/types/market-pulse";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
}));

const mockFetchCandleWindow = vi.fn();
const mockCallLlmWithRetry = vi.fn();
const mockGetTokenUsageSnapshot = vi.fn();

vi.mock("@/lib/db/client", () => ({ db: mockDb }));
vi.mock("@/lib/services/market-pulse-candles", () => ({
  MARKET_PULSE_DEFAULT_WINDOW_SIZE: 8,
  fetchCandleWindow: (...args: unknown[]) => mockFetchCandleWindow(...args),
}));
vi.mock("@/lib/services/llm-client", () => ({
  callLlmWithRetry: (...args: unknown[]) => mockCallLlmWithRetry(...args),
  getTokenUsageSnapshot: () => mockGetTokenUsageSnapshot(),
}));

import {
  classifyCandles,
  getMarketPulseRunDetails,
} from "@/lib/services/market-pulse-engine";

function makeInsertChain() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function makeUpdateChain() {
  return {
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
  };
}

function preparedCandle(
  candleTime: string,
  close: number,
): MarketPulsePreparedCandle {
  return {
    ticker: "AAPL",
    candleTime,
    payload: {
      candle: {
        open: close - 1,
        high: close + 1,
        low: close - 2,
        close,
        volume: 1000,
      },
      indicators: {
        rsi: 60,
        bb_upper: close + 5,
        bb_lower: close - 5,
        bb_position: "mid",
        volume_vs_avg: 1.2,
      },
      context: {
        trend: "uptrend",
        key_levels: [close - 3, close, close + 3],
        timeframe: "15m",
      },
    },
  };
}

describe("market-pulse-engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.insert.mockImplementation(() => makeInsertChain());
    mockDb.update.mockImplementation(() => makeUpdateChain());
    mockGetTokenUsageSnapshot
      .mockReturnValueOnce({})
      .mockReturnValueOnce({
        marketPulseClassify: { count: 1, totalTokens: 321 },
      });
  });

  it("classifies candles, persists rows, and creates a sequence event", async () => {
    mockFetchCandleWindow.mockResolvedValue([
      preparedCandle("2026-04-17T13:00:00.000Z", 101),
      preparedCandle("2026-04-17T13:15:00.000Z", 102),
      preparedCandle("2026-04-17T13:30:00.000Z", 103),
    ]);

    mockCallLlmWithRetry.mockResolvedValue({
      classifications: [
        {
          candle_time: "2026-04-17T13:00:00.000Z",
          classification: {
            control: "buyers",
            control_strength: 7,
            rejection_type: "lower_rejection",
            rejection_strength: 6,
            absorption_detected: false,
            momentum_state: "expanding",
            structure_state: "trend_continuation",
            volatility_state: "expansion",
          },
          event: "Buyers controlled the candle.",
          significance: "medium",
          tradability: "watch",
        },
        {
          candle_time: "2026-04-17T13:15:00.000Z",
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
          event: "Buyers kept pressure higher.",
          significance: "medium",
          tradability: "watch",
        },
        {
          candle_time: "2026-04-17T13:30:00.000Z",
          classification: {
            control: "buyers",
            control_strength: 8,
            rejection_type: "none",
            rejection_strength: 2,
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
    });

    const result = await classifyCandles({ ticker: "aapl" });

    expect(result.status).toBe("success");
    expect(result.classifications).toHaveLength(3);
    expect(result.sequenceEvents).toHaveLength(1);
    expect(result.llmTokensUsed).toBe(321);
    expect(mockDb.insert).toHaveBeenCalledTimes(2);

    const classificationInsert = mockDb.insert.mock.results[1]?.value;
    const classificationRows = classificationInsert.values.mock.calls[0][0];
    expect(classificationRows).toHaveLength(4);
    expect(classificationRows[3]).toMatchObject({ level: "sequence" });
  });

  it("parses stored run details for replay", async () => {
    const selectCalls: unknown[] = [
      [
        {
          id: 1,
          runId: "run-1",
          ticker: "AAPL",
          status: "success",
          trigger: "manual",
          candleWindow: JSON.stringify({ start: "a", end: "b", count: 2 }),
          llmTokensUsed: 111,
          durationMs: 2000,
          startedAt: "2026-04-17T13:00:00.000Z",
          completedAt: "2026-04-17T13:01:00.000Z",
          errorMessage: null,
          createdAt: "2026-04-17T13:00:00.000Z",
        },
      ],
      [
        {
          id: 2,
          runId: "run-1",
          ticker: "AAPL",
          candleTime: "2026-04-17T13:00:00.000Z",
          candleData: JSON.stringify({ close: 101 }),
          indicators: JSON.stringify({ rsi: 60 }),
          classification: JSON.stringify({ control: "buyers" }),
          eventBlurb: "Buyers in control.",
          significance: "medium",
          tradability: "watch",
          level: "candle",
          createdAt: "2026-04-17T13:00:00.000Z",
        },
      ],
      [],
      [],
    ];

    mockDb.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(selectCalls.shift() ?? []),
          then: undefined,
        })),
      })),
    }));

    // Override the second/third/fourth query shape, which does not use .limit.
    mockDb.select
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue(selectCalls[0]),
          })),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(selectCalls[1]),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(selectCalls[2]),
        })),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(selectCalls[3]),
        })),
      }));

    const details = await getMarketPulseRunDetails("run-1");

    expect(details?.run.candleWindow).toEqual({
      start: "a",
      end: "b",
      count: 2,
    });
    expect(details?.classifications[0]).toMatchObject({
      candleData: { close: 101 },
      indicators: { rsi: 60 },
      classification: { control: "buyers" },
    });
  });
});
