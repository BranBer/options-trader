/**
 * Story 7.2 — Integration Tests for Pipeline Orchestration
 *
 * Covers:
 *   1. Classification failure → run record is persisted as "error"
 *   2. Correlation failure → graceful degradation to "partial" (does not throw)
 *   3. Concurrent run prevention — DB stale "running" row and in-memory Set guards
 *   4. Subscription capacity enforcement
 *   5. Market window gating — cycle skips all tickers outside market hours
 *   6. Cycle resilience — continues for remaining tickers after a non-409 failure
 *
 * Key notes:
 *   - vi.resetAllMocks() is used in every beforeEach to clear mockImplementationOnce
 *     queues so unused values from one test do not leak into the next.
 *   - April 17, 2026 is used as a known Friday for market-hours assertions.
 *   - April 19, 2026 is used as a known Saturday for market-closed assertions.
 *   - The engine module is NOT mocked: classifyCandles/orchestrateTickerPulse run
 *     their real implementations against the mocked DB and LLM client.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketPulsePreparedCandle } from "@/types/market-pulse";

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
}));

const mockFetchCandleWindow = vi.fn();
const mockCallLlmWithRetry = vi.fn();
const mockGetTokenUsageSnapshot = vi.fn();
const mockGetCachedCalendar = vi.fn();
const mockGetRecentReleaseSummary = vi.fn();
const mockIsMarketOpen = vi.fn();

vi.mock("@/lib/db/client", () => ({ db: mockDb }));
vi.mock("@/lib/services/market-pulse-candles", () => ({
  MARKET_PULSE_DEFAULT_WINDOW_SIZE: 8,
  LOOKBACK_CANDLE_COUNT: 96,
  fetchCandleWindow: (...args: unknown[]) => mockFetchCandleWindow(...args),
}));
vi.mock("@/lib/services/llm-client", () => ({
  callLlmWithRetry: (...args: unknown[]) => mockCallLlmWithRetry(...args),
  getTokenUsageSnapshot: () => mockGetTokenUsageSnapshot(),
  getMarketPulseModel: () => "test-model",
}));
vi.mock("@/lib/services/live-economic-calendar", () => ({
  getCachedCalendar: () => mockGetCachedCalendar(),
}));
vi.mock("@/lib/services/post-release-analyzer", () => ({
  getRecentReleaseSummary: () => mockGetRecentReleaseSummary(),
}));
vi.mock("@/lib/utils/market-hours", () => ({
  isMarketOpen: (...args: unknown[]) => mockIsMarketOpen(...args),
}));

// No engine mock — classifyCandles and orchestrateTickerPulse use real implementations.

import {
  classifyCandles,
  orchestrateTickerPulse,
} from "@/lib/services/market-pulse-engine";
import {
  addTicker,
  isMarketPulseRunActive,
  isWithinMarketPulseWindow,
  MarketPulseSubscriptionError,
  runMarketPulseCycle,
} from "@/lib/services/market-pulse-scheduler";

// ─── Helper factories ────────────────────────────────────────────────────────

function makeInsertChain() {
  return {
    values: vi.fn(() => ({
      run: vi.fn(),
      then: (onfulfilled?: ((v: unknown) => unknown) | null) =>
        Promise.resolve(undefined).then(onfulfilled ?? undefined),
      catch: vi.fn(() => Promise.resolve()),
    })),
  };
}

function makeUpdateChain() {
  const makeWhereResult = () => ({
    run: vi.fn(),
    then: (onfulfilled?: ((v: unknown) => unknown) | null) =>
      Promise.resolve(undefined).then(onfulfilled ?? undefined),
    catch: vi.fn(() => Promise.resolve()),
  });
  const set = vi.fn(() => ({ where: vi.fn(makeWhereResult) }));
  return { set };
}

/**
 * Select chain that handles every Drizzle terminal pattern used in the engine:
 *   • .from().where().limit()            — single-column lookup
 *   • .from().where().orderBy()          — subscription list (no limit)
 *   • .from().where().orderBy().limit()  — previousNarrative, recentNewsForTicker
 *
 * The object returned by orderBy() is a "thenable" so `await` resolves it
 * directly AND it exposes .limit() for callers that chain further.
 */
function makeSelectChain(result: unknown) {
  const makeOrderByResult = () => ({
    // Thenable so `await db...where().orderBy()` resolves to `result`.
    then: (
      onfulfilled?: ((v: unknown) => unknown) | null,
      onrejected?: ((r: unknown) => unknown) | null,
    ) =>
      Promise.resolve(result).then(
        onfulfilled ?? undefined,
        onrejected ?? undefined,
      ),
    // `.limit()` for callers that chain further after `.orderBy()`.
    limit: vi.fn(() => ({
      all: vi.fn(() => result),
      then: (
        onfulfilled?: ((v: unknown) => unknown) | null,
        onrejected?: ((r: unknown) => unknown) | null,
      ) =>
        Promise.resolve(result).then(
          onfulfilled ?? undefined,
          onrejected ?? undefined,
        ),
    })),
    // `.all()` for synchronous transaction usage.
    all: vi.fn(() => result),
  });

  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(makeOrderByResult),
        limit: vi.fn(() => ({
          all: vi.fn(() => result),
          then: (
            onfulfilled?: ((v: unknown) => unknown) | null,
            onrejected?: ((r: unknown) => unknown) | null,
          ) =>
            Promise.resolve(result).then(
              onfulfilled ?? undefined,
              onrejected ?? undefined,
            ),
        })),
      })),
      orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(result) })),
    })),
  };
}

function makeSubscriptionRow(ticker: string, id = 1) {
  return {
    id,
    ticker,
    addedAt: "2026-04-17T14:00:00.000Z",
    isActive: true,
    createdAt: "2026-04-17T14:00:00.000Z",
  };
}

function makePreparedCandle(
  ticker: string,
  candleTime: string,
  close: number,
): MarketPulsePreparedCandle {
  return {
    ticker,
    candleTime,
    payload: {
      candle: {
        open: close - 1,
        high: close + 1,
        low: close - 2,
        close,
        volume: 1_000,
      },
      indicators: {
        rsi: 55,
        bb_upper: close + 5,
        bb_lower: close - 5,
        bb_position: "mid",
        volume_vs_avg: 1.1,
      },
      context: {
        trend: "uptrend",
        key_levels: [close - 3, close, close + 3],
        timeframe: "15m",
      },
    },
  };
}

/** Three AAPL candles (Friday April 17, 2026 at 10:00–10:30 AM ET). */
const SAMPLE_CANDLES_AAPL = [
  makePreparedCandle("AAPL", "2026-04-17T14:00:00.000Z", 101),
  makePreparedCandle("AAPL", "2026-04-17T14:15:00.000Z", 102),
  makePreparedCandle("AAPL", "2026-04-17T14:30:00.000Z", 103),
];

/** Three MSFT candles matching the same window. */
const SAMPLE_CANDLES_MSFT = [
  makePreparedCandle("MSFT", "2026-04-17T14:00:00.000Z", 420),
  makePreparedCandle("MSFT", "2026-04-17T14:15:00.000Z", 422),
  makePreparedCandle("MSFT", "2026-04-17T14:30:00.000Z", 421),
];

/**
 * Returns a classification LLM response with exactly one classification per
 * candle in the input array (required by validateBatchResponse).
 */
function makeClassificationResponse(
  candleTimes: string[] = [
    "2026-04-17T14:00:00.000Z",
    "2026-04-17T14:15:00.000Z",
    "2026-04-17T14:30:00.000Z",
  ],
) {
  return {
    classifications: candleTimes.map((candle_time) => ({
      candle_time,
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
      event: "Buyers in control.",
      significance: "medium",
      tradability: "watch",
    })),
  };
}

/** Minimal valid narrative LLM response. */
function makeNarrativeResponse() {
  return {
    current_control: "buyers",
    control_strength: 7,
    narrative_summary: "Buyers held intraday control throughout the window.",
    market_phase: "trend",
    expected_behavior: "continuation",
    key_conflicts: [],
    confidence_in_assessment: 0.8,
  };
}

// ─── Engine-level tests: classification failure path ─────────────────────────

describe("classifyCandles — classification failure path", () => {
  let capturedUpdateChain: ReturnType<typeof makeUpdateChain>;

  beforeEach(() => {
    vi.resetAllMocks();
    capturedUpdateChain = makeUpdateChain();
    mockDb.insert.mockImplementation(() => makeInsertChain());
    mockDb.update.mockReturnValue(capturedUpdateChain);
    // Token snapshot: called before and after the LLM batch(es).
    mockGetTokenUsageSnapshot.mockReturnValue({});
  });

  it("updates the run record to status 'error' when all LLM batches fail", async () => {
    mockFetchCandleWindow.mockResolvedValue(SAMPLE_CANDLES_AAPL);
    mockCallLlmWithRetry.mockRejectedValue(new Error("LLM timeout"));

    await expect(classifyCandles({ ticker: "aapl" })).rejects.toThrow(
      "Market Pulse classification failed",
    );

    // The run record must have been updated to "error".
    expect(capturedUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error" }),
    );
    const setArg: Record<string, unknown> =
      capturedUpdateChain.set.mock.calls[0]?.[0] ?? {};
    expect(typeof setArg.errorMessage).toBe("string");
    expect((setArg.errorMessage as string).length).toBeGreaterThan(0);
  });

  it("throws with a descriptive message naming the affected ticker", async () => {
    mockFetchCandleWindow.mockResolvedValue(SAMPLE_CANDLES_AAPL);
    mockCallLlmWithRetry.mockRejectedValue(new Error("API rate limit"));

    await expect(classifyCandles({ ticker: "tsla" })).rejects.toThrow("TSLA");
  });
});

// ─── Engine-level tests: correlation / narrative failure paths ───────────────

describe("orchestrateTickerPulse — graceful degradation on downstream failures", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDb.insert.mockImplementation(() => makeInsertChain());
    mockDb.update.mockImplementation(() => makeUpdateChain());
    // Default: all DB selects return empty (no prior news, no prior narrative).
    mockDb.select.mockImplementation(() => makeSelectChain([]));
    mockGetCachedCalendar.mockReturnValue([]);
    mockGetRecentReleaseSummary.mockReturnValue({
      recentReleases: [],
      generatedAt: new Date().toISOString(),
    });
    mockGetTokenUsageSnapshot.mockReturnValue({});
  });

  it("completes with status 'partial' when correlation LLM fails but classification succeeds", async () => {
    mockFetchCandleWindow.mockResolvedValue(SAMPLE_CANDLES_AAPL);

    // Provide one news item so correlateCatalysts actually calls the LLM.
    // The row MUST include `tickers` as a JSON-serialised string because
    // recentNewsForTicker filters with `parseStringArray(row.tickers).includes(ticker)`.
    // Without the field the filter removes the row, news=[],  macro=[], and
    // correlateCatalysts short-circuits to [] without calling the LLM.
    //
    // Select ordering:
    //   1. fetchTodaysClassifications → [] (no prior classifications)
    //   2. recentNewsForTicker → 1 news item
    mockDb.select
      .mockImplementationOnce(() => makeSelectChain([]))
      .mockImplementationOnce(() =>
        makeSelectChain([
          { id: 1, headline: "AAPL beats earnings", tickers: '["AAPL"]' },
        ]),
      );

    mockCallLlmWithRetry
      .mockResolvedValueOnce(
        makeClassificationResponse(
          SAMPLE_CANDLES_AAPL.map((c) => c.candleTime),
        ),
      )
      .mockRejectedValueOnce(new Error("Correlator LLM unavailable"))
      .mockResolvedValueOnce(makeNarrativeResponse());

    const result = await orchestrateTickerPulse({
      ticker: "AAPL",
      runId: "run-partial-1",
    });

    // Correlation failure is non-fatal: should degrade to partial, not throw.
    expect(result.status).toBe("partial");
    expect(result.correlations).toEqual([]);
    expect(result.narrative?.market_phase).toBe("trend");
    expect(result.errorMessages.some((m) => m.includes("correlation"))).toBe(
      true,
    );
  });

  it("completes with status 'partial' when narrative LLM fails but classification succeeds", async () => {
    mockFetchCandleWindow.mockResolvedValue(SAMPLE_CANDLES_AAPL);

    mockCallLlmWithRetry
      .mockResolvedValueOnce(
        makeClassificationResponse(
          SAMPLE_CANDLES_AAPL.map((c) => c.candleTime),
        ),
      )
      // correlateCatalysts: no news/macro → returns [] without calling LLM
      .mockRejectedValueOnce(new Error("Narrative LLM rate-limited"));

    const result = await orchestrateTickerPulse({
      ticker: "AAPL",
      runId: "run-partial-2",
    });

    expect(result.status).toBe("partial");
    expect(result.narrative).toBeNull();
    expect(result.errorMessages.some((m) => m.includes("narrative"))).toBe(
      true,
    );
  });
});

// ─── Scheduler-level tests ───────────────────────────────────────────────────

describe("addTicker — subscription capacity enforcement", () => {
  beforeEach(() => {
    // resetAllMocks clears mockImplementationOnce queues so no test leaks into another.
    vi.resetAllMocks();
    mockDb.update.mockImplementation(() => makeUpdateChain());
    mockDb.insert.mockImplementation(() => makeInsertChain());
    // Default: all selects return empty (safe fallback).
    mockDb.select.mockImplementation(() => makeSelectChain([]));
    // Pass-through transaction: callback receives mockDb as the tx argument.
    mockDb.transaction.mockImplementation((fn: Function) => fn(mockDb));
  });

  it("rejects tickers with invalid format before touching the DB", async () => {
    await expect(addTicker("TOOLONG")).rejects.toBeInstanceOf(
      MarketPulseSubscriptionError,
    );
    await expect(addTicker("123")).rejects.toBeInstanceOf(
      MarketPulseSubscriptionError,
    );
    await expect(addTicker("")).rejects.toBeInstanceOf(
      MarketPulseSubscriptionError,
    );
    // normalizeTicker throws before any DB access.
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("enforces the 4-ticker capacity limit with a 409 status", async () => {
    const fourActiveSubs = [
      makeSubscriptionRow("AAPL", 1),
      makeSubscriptionRow("TSLA", 2),
      makeSubscriptionRow("NVDA", 3),
      makeSubscriptionRow("MSFT", 4),
    ];

    // Inside the transaction, the first tx.select returns active subs → triggers capacity check.
    mockDb.select.mockImplementationOnce(() => makeSelectChain(fourActiveSubs));

    await expect(addTicker("AMZN")).rejects.toMatchObject({
      status: 409,
    });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("is idempotent when the ticker is already being tracked", async () => {
    // tx.select 1 (inside transaction): activeSubscriptions → [AAPL] → early return true.
    // db.select 2 (getTrackedTickers after transaction): subscriptions → [AAPL].
    mockDb.select
      .mockImplementationOnce(() =>
        makeSelectChain([makeSubscriptionRow("AAPL")]),
      )
      .mockImplementationOnce(() =>
        makeSelectChain([makeSubscriptionRow("AAPL")]),
      );

    const result = await addTicker("AAPL");

    expect(result).toContain("AAPL");
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("isWithinMarketPulseWindow — market window detection", () => {
  // April 17, 2026 is a confirmed Friday (Jan 1 = Thu; +106 days % 7 = 5 = Fri).
  // April 19, 2026 is a confirmed Sunday.

  it("returns false on weekends", () => {
    mockIsMarketOpen.mockReturnValue({ reason: "weekend" });
    // Sunday April 19, 2026 at noon ET = 16:00 UTC
    expect(
      isWithinMarketPulseWindow(new Date("2026-04-19T16:00:00.000Z")),
    ).toBe(false);
  });

  it("returns false for exchange holidays", () => {
    mockIsMarketOpen.mockReturnValue({ reason: "holiday" });
    expect(
      isWithinMarketPulseWindow(new Date("2026-12-25T17:00:00.000Z")),
    ).toBe(false);
  });

  it("returns false before market open (pre-market hours)", () => {
    // No weekend/holiday reason — only the time window should gate this.
    mockIsMarketOpen.mockReturnValue({ isOpen: false });
    // Friday April 17, 2026 at 8:00 AM ET = 12:00 UTC (EDT = UTC-4)
    // totalMinutes = 480, open = 540 → false
    expect(
      isWithinMarketPulseWindow(new Date("2026-04-17T12:00:00.000Z")),
    ).toBe(false);
  });

  it("returns true during regular market hours on a weekday", () => {
    mockIsMarketOpen.mockReturnValue({ isOpen: true });
    // Friday April 17, 2026 at 10:30 AM ET = 14:30 UTC
    // dayOfWeek = 5 (Fri), totalMinutes = 630, open = 540, close = 990 → true
    expect(
      isWithinMarketPulseWindow(new Date("2026-04-17T14:30:00.000Z")),
    ).toBe(true);
  });

  it("returns false after market close", () => {
    mockIsMarketOpen.mockReturnValue({ isOpen: true });
    // Friday April 17, 2026 at 5:00 PM ET = 21:00 UTC
    // totalMinutes = 1020 > close (990) → false
    expect(
      isWithinMarketPulseWindow(new Date("2026-04-17T21:00:00.000Z")),
    ).toBe(false);
  });
});

describe("isMarketPulseRunActive — concurrency detection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDb.select.mockImplementation(() => makeSelectChain([]));
  });

  it("returns true when a stale 'running' row exists in the DB", async () => {
    mockDb.select.mockImplementationOnce(() =>
      makeSelectChain([
        {
          id: 1,
          runId: "stale-run-xyz",
          ticker: "GOOG",
          status: "running",
          trigger: "scheduled",
          startedAt: "2026-04-17T14:00:00.000Z",
        },
      ]),
    );

    expect(await isMarketPulseRunActive("GOOG")).toBe(true);
  });

  it("returns false when no stale running row exists", async () => {
    // Default implementation returns []; just verify the guard works.
    expect(await isMarketPulseRunActive("GOOG")).toBe(false);
  });
});

describe("runMarketPulseCycle — scheduler pipeline orchestration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // April 17, 2026 is a Friday. 10:30 AM ET = 14:30 UTC (EDT = UTC-4).
    vi.setSystemTime(new Date("2026-04-17T14:30:00.000Z"));
    vi.resetAllMocks();
    mockDb.update.mockImplementation(() => makeUpdateChain());
    mockDb.insert.mockImplementation(() => makeInsertChain());
    // Pass-through transaction: callback receives mockDb as the tx argument.
    mockDb.transaction.mockImplementation((fn: Function) => fn(mockDb));
    // Default: open market, all selects return empty.
    mockIsMarketOpen.mockReturnValue({ isOpen: true });
    mockDb.select.mockImplementation(() => makeSelectChain([]));
    mockGetTokenUsageSnapshot.mockReturnValue({});
    mockGetCachedCalendar.mockReturnValue([]);
    mockGetRecentReleaseSummary.mockReturnValue({
      recentReleases: [],
      generatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips all tickers and reports them as 'skipped' when outside the market window", async () => {
    // Sunday April 19 — isMarketOpen correctly returns weekend reason.
    vi.setSystemTime(new Date("2026-04-19T16:00:00.000Z"));
    mockIsMarketOpen.mockReturnValue({ reason: "weekend" });
    mockDb.select.mockImplementationOnce(() =>
      makeSelectChain([makeSubscriptionRow("AAPL")]),
    );

    const result = await runMarketPulseCycle("scheduled");

    expect(result.skipped).toEqual(["AAPL"]);
    expect(result.completed).toEqual([]);
  });

  it("marks a ticker as 'skipped' when a stale DB 'running' row is detected", async () => {
    // Subscription: AAPL active.
    // Running check in runSingleTicker: returns stale row → 409 throw.
    mockDb.select
      .mockImplementationOnce(() =>
        makeSelectChain([makeSubscriptionRow("AAPL")]),
      )
      .mockImplementationOnce(() =>
        makeSelectChain([
          { id: 1, runId: "stale-run", ticker: "AAPL", status: "running" },
        ]),
      );

    const result = await runMarketPulseCycle("scheduled");

    expect(result.skipped).toEqual(["AAPL"]);
    expect(result.completed).toEqual([]);
  });

  it("continues to the next ticker after a non-409 orchestration failure", async () => {
    // subscriptions: [AAPL, MSFT]
    mockDb.select.mockImplementationOnce(() =>
      makeSelectChain([
        makeSubscriptionRow("AAPL", 1),
        makeSubscriptionRow("MSFT", 2),
      ]),
    );

    // AAPL: fetchCandleWindow throws before any DB insert (cleanest failure path).
    // MSFT: full orchestration succeeds.
    mockFetchCandleWindow
      .mockRejectedValueOnce(new Error("No candle data for AAPL"))
      .mockResolvedValueOnce(SAMPLE_CANDLES_MSFT);

    mockCallLlmWithRetry
      .mockResolvedValueOnce(
        makeClassificationResponse(
          SAMPLE_CANDLES_MSFT.map((c) => c.candleTime),
        ),
      )
      .mockResolvedValueOnce(makeNarrativeResponse());

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runMarketPulseCycle("scheduled");

    expect(result.completed).toEqual(["MSFT"]);
    expect(result.attempted).toContain("AAPL");
    expect(result.attempted).toContain("MSFT");
    // AAPL errored (not skipped — different catch path).
    expect(result.skipped).not.toContain("AAPL");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("AAPL"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("returns empty results when there are no active subscriptions", async () => {
    // Default mock already returns [] for subscriptions.
    const result = await runMarketPulseCycle("scheduled");

    expect(result.attempted).toEqual([]);
    expect(result.completed).toEqual([]);
    expect(result.skipped).toEqual([]);
  });
});
