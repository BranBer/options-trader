import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockAskJev, mockChart } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  mockAskJev: vi.fn(),
  mockChart: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ db: mockDb }));
vi.mock("@/lib/services/jev-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/jev-client")>(
    "@/lib/services/jev-client",
  );
  return {
    ...actual,
    askJev: mockAskJev,
    warnIfJevKeyMissing: () => true,
  };
});
vi.mock("yahoo-finance2", () => ({
  default: class {
    chart = mockChart;
  },
}));

import {
  getJevCalibration,
  judgeNewsForTicker,
  judgeRecommendation,
  publishTimeBucket,
  scoreMaturedJudgments,
  truncateText,
} from "@/lib/services/jev-judgments";

// A minimal thenable query-builder stub that resolves to `result` no matter
// how many .from()/.where()/.orderBy()/.limit() calls precede the await.
function makeQueryChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  (chain as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("truncateText", () => {
  it("leaves short text unchanged", () => {
    expect(truncateText("short")).toBe("short");
  });

  it("truncates long text to the max length plus an ellipsis", () => {
    const long = "x".repeat(700);
    const result = truncateText(long, 600);
    expect(result.length).toBe(601);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("publishTimeBucket", () => {
  it("buckets pre-market (before 9:30 ET)", () => {
    expect(publishTimeBucket("2024-01-10T13:00:00.000Z")).toBe("pre-market");
  });

  it("buckets regular session", () => {
    expect(publishTimeBucket("2024-01-10T15:00:00.000Z")).toBe(
      "regular session",
    );
  });

  it("buckets after-hours", () => {
    expect(publishTimeBucket("2024-01-10T22:00:00.000Z")).toBe(
      "after-hours",
    );
  });

  it("buckets weekend", () => {
    // 2024-01-13 is a Saturday
    expect(publishTimeBucket("2024-01-13T15:00:00.000Z")).toBe("weekend");
  });

  it("returns unknown for null/invalid input", () => {
    expect(publishTimeBucket(null)).toBe("unknown");
    expect(publishTimeBucket("not-a-date")).toBe("unknown");
  });
});

describe("judgeNewsForTicker", () => {
  it("sends a bucketed state (no raw dates) and inserts one ledger row per question", async () => {
    mockAskJev.mockResolvedValue({
      model: "jev-1.13.0",
      answers: {
        relevance: { type: "noul", noul: 0.9 },
        direction: {
          type: "choice",
          choice: "up",
          probabilities: { up: 0.7, down: 0.1, unclear: 0.2 },
          confidence: 0.6,
        },
        surprise: {
          type: "score",
          score: 2.1,
          legend: {},
          probabilities: {},
          confidence: 0.5,
        },
        magnitude: {
          type: "score",
          score: 1.4,
          legend: {},
          probabilities: {},
          confidence: 0.5,
        },
      },
      usage: { input_tokens: 100, output_tokens: 10 },
    });

    const insertedValues: unknown[] = [];
    mockDb.insert.mockReturnValue({
      values: vi.fn((rows: unknown) => {
        insertedValues.push(rows);
        return Promise.resolve(undefined);
      }),
    });

    const count = await judgeNewsForTicker(
      {
        id: 42,
        headline: "Acme Corp beats on earnings",
        rawSummary: "x".repeat(700),
        source: "reuters",
        publishedAt: "2024-01-10T15:00:00.000Z",
      },
      "acme",
    );

    expect(count).toBe(4);
    expect(mockAskJev).toHaveBeenCalledTimes(1);

    const [state] = mockAskJev.mock.calls[0];
    expect(state.ticker).toBe("acme");
    expect(state.publish_time).toBe("regular session");
    expect(state.summary.length).toBeLessThanOrEqual(601);
    // No raw ISO date should leak into state.
    expect(JSON.stringify(state)).not.toContain("2024-01-10T15:00:00.000Z");

    const rows = insertedValues[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.contextType).toBe("news");
      expect(row.contextRef).toBe("42");
      expect(row.ticker).toBe("acme");
      expect(row.model).toBe("jev-1.13.0");
      expect(typeof row.stateHash).toBe("string");
    }
    const directionRow = rows.find((r) => r.questionId === "direction");
    expect(directionRow?.horizonDays).toBe(5);
    const relevanceRow = rows.find((r) => r.questionId === "relevance");
    expect(relevanceRow?.horizonDays).toBeNull();
  });

  it("returns 0 and does not throw when Jev fails", async () => {
    mockAskJev.mockRejectedValue(new Error("boom"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const count = await judgeNewsForTicker(
      {
        id: 1,
        headline: "h",
        rawSummary: null,
        source: null,
        publishedAt: null,
      },
      "XYZ",
    );

    expect(count).toBe(0);
    expect(mockDb.insert).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("judgeRecommendation", () => {
  it("buckets breakeven into a word bucket and never leaks raw prices/dates", async () => {
    mockDb.select.mockReturnValue(
      makeQueryChain([{ ticker: "ACME", price: 100, capturedAt: "2024-01-02T00:00:00.000Z" }]),
    );
    mockAskJev.mockResolvedValue({
      model: "jev-1.13.0",
      answers: {
        thesis_supported: {
          type: "choice",
          choice: "supports",
          probabilities: { supports: 0.8, partial: 0.1, contradicts: 0.05, unrelated: 0.05 },
          confidence: 0.7,
        },
        scheduled_catalyst: { type: "noul", noul: 0.3 },
        direction: {
          type: "choice",
          choice: "up",
          probabilities: { up: 0.6, down: 0.2, unclear: 0.2 },
          confidence: 0.5,
        },
      },
      usage: { input_tokens: 50, output_tokens: 5 },
    });
    const insertedValues: unknown[] = [];
    mockDb.insert.mockReturnValue({
      values: vi.fn((rows: unknown) => {
        insertedValues.push(rows);
        return Promise.resolve(undefined);
      }),
    });

    const output = JSON.stringify({
      ticker: "ACME",
      thesis: "Acme's new product cycle drives upside.",
      direction: "bullish",
      confidence: 0.7,
      primary_strategy: {
        name: "long call",
        legs: [],
        max_profit: "unlimited",
        max_loss: "$500",
        breakeven: "$105.00",
        risk_reward_ratio: "3:1",
      },
      market_context: {
        iv_assessment: "elevated",
        iv_strategy_note: "note",
        volume_assessment: "above_average",
        catalyst_date: "2024-02-01",
        days_to_catalyst: 10,
      },
      risk_factors: ["Earnings could disappoint"],
      whale_alignment: {
        matches_whale: true,
        whale_position_size: "large",
        similarity_note: "aligned",
      },
      disclaimer: "not advice",
    });

    const count = await judgeRecommendation({
      id: 7,
      createdAt: "2024-01-05T14:00:00.000Z",
      output,
    });

    expect(count).toBe(3);
    const [state] = mockAskJev.mock.calls[0];
    // Breakeven ($105 vs $100 price = 5% move) buckets into a word range.
    expect(state.required_move_to_breakeven).toBe("3% to 7%");
    expect(state.market_context.has_scheduled_catalyst_before_expiry).toBe(true);
    // No raw catalyst date or raw price should leak into state.
    expect(JSON.stringify(state)).not.toContain("2024-02-01");
    expect(JSON.stringify(state)).not.toContain("105.00");

    const rows = insertedValues[0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.contextRef === "7")).toBe(true);
  });
});

describe("scoreMaturedJudgments", () => {
  it("labels an outcome from a stubbed price series", async () => {
    mockDb.select.mockReturnValue(
      makeQueryChain([
        {
          id: 1,
          ticker: "AAPL",
          createdAt: "2024-01-02T10:00:00.000Z", // 05:00 ET — before cutoff
          horizonDays: 5,
          outcome: null,
        },
      ]),
    );

    const tickerQuotes = [
      { date: "2024-01-02T12:00:00.000Z", open: 100, close: 101 },
      { date: "2024-01-03T12:00:00.000Z", open: 101, close: 102 },
      { date: "2024-01-04T12:00:00.000Z", open: 102, close: 103 },
      { date: "2024-01-05T12:00:00.000Z", open: 103, close: 104 },
      { date: "2024-01-06T12:00:00.000Z", open: 104, close: 105 },
      { date: "2024-01-07T12:00:00.000Z", open: 105, close: 110 },
    ];
    const spyQuotes = [
      { date: "2024-01-02T12:00:00.000Z", open: 100, close: 100.2 },
      { date: "2024-01-03T12:00:00.000Z", open: 100.2, close: 100.4 },
      { date: "2024-01-04T12:00:00.000Z", open: 100.4, close: 100.6 },
      { date: "2024-01-05T12:00:00.000Z", open: 100.6, close: 100.7 },
      { date: "2024-01-06T12:00:00.000Z", open: 100.7, close: 100.8 },
      { date: "2024-01-07T12:00:00.000Z", open: 100.8, close: 101 },
    ];
    mockChart.mockImplementation(async (ticker: string) => {
      if (ticker === "SPY") return { quotes: spyQuotes };
      return { quotes: tickerQuotes };
    });

    const updateCalls: Array<Record<string, unknown>> = [];
    mockDb.update.mockReturnValue({
      set: vi.fn((setArgs: Record<string, unknown>) => {
        updateCalls.push(setArgs);
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    });

    const { scored, skipped } = await scoreMaturedJudgments();

    expect(scored).toBe(1);
    expect(skipped).toBe(0);
    expect(updateCalls).toHaveLength(1);
    const outcome = JSON.parse(updateCalls[0].outcome as string);
    expect(outcome.ret).toBeCloseTo(0.1, 3);
    expect(outcome.spyRet).toBeCloseTo(0.01, 3);
    expect(outcome.excess).toBeCloseTo(0.09, 3);
    expect(outcome.label).toBe("up");
  });

  it("leaves rows unscored (skipped) when the horizon has not elapsed yet", async () => {
    mockDb.select.mockReturnValue(
      makeQueryChain([
        {
          id: 2,
          ticker: "AAPL",
          createdAt: "2024-01-02T10:00:00.000Z",
          horizonDays: 5,
          outcome: null,
        },
      ]),
    );
    // Only 2 bars available past entry — not enough to reach horizon 5.
    const shortSeries = [
      { date: "2024-01-02T12:00:00.000Z", open: 100, close: 101 },
      { date: "2024-01-03T12:00:00.000Z", open: 101, close: 102 },
    ];
    mockChart.mockResolvedValue({ quotes: shortSeries });

    const { scored, skipped } = await scoreMaturedJudgments();
    expect(scored).toBe(0);
    expect(skipped).toBe(1);
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("getJevCalibration", () => {
  it("computes hit rate, mean excess by choice, and Brier score for directional questions", async () => {
    const fixtureRows = [
      {
        contextType: "news",
        questionId: "direction",
        answer: JSON.stringify({
          type: "choice",
          choice: "up",
          probabilities: { up: 0.9, down: 0.05, unclear: 0.05 },
          confidence: 0.8,
        }),
        outcome: JSON.stringify({ ret: 0.05, spyRet: 0.01, excess: 0.04, label: "up" }),
      },
      {
        contextType: "news",
        questionId: "direction",
        answer: JSON.stringify({
          type: "choice",
          choice: "down",
          probabilities: { up: 0.1, down: 0.8, unclear: 0.1 },
          confidence: 0.75,
        }),
        outcome: JSON.stringify({ ret: -0.03, spyRet: 0.0, excess: -0.03, label: "down" }),
      },
      {
        contextType: "news",
        questionId: "direction",
        answer: JSON.stringify({
          type: "choice",
          choice: "unclear",
          probabilities: { up: 0.3, down: 0.3, unclear: 0.4 },
          confidence: 0.3,
        }),
        outcome: JSON.stringify({ ret: 0.001, spyRet: 0.0, excess: 0.001, label: "flat" }),
      },
      {
        contextType: "news",
        questionId: "relevance",
        answer: JSON.stringify({ type: "noul", noul: 0.9 }),
        outcome: JSON.stringify({ ret: 0.05, spyRet: 0.01, excess: 0.04, label: "up" }),
      },
    ];
    mockDb.select.mockReturnValue(makeQueryChain(fixtureRows));

    const calibration = await getJevCalibration();

    const direction = calibration.find(
      (c) => c.contextType === "news" && c.questionId === "direction",
    );
    expect(direction?.n).toBe(3);
    expect(direction?.hitRate).toBeCloseTo(1.0, 5); // up->up, down->down, unclear->flat all correct
    expect(direction?.meanExcessReturnByChoice?.up).toBeCloseTo(0.04, 5);
    expect(direction?.meanExcessReturnByChoice?.down).toBeCloseTo(-0.03, 5);
    expect(direction?.meanExcessReturnByChoice?.unclear).toBeCloseTo(0.001, 5);

    // ys = [1, 0, 0], ps = [0.9, 0.1, 0.3], baseRate = 1/3
    const expectedJevBrier = ((0.9 - 1) ** 2 + (0.1 - 0) ** 2 + (0.3 - 0) ** 2) / 3;
    const baseRate = 1 / 3;
    const expectedBaselineBrier =
      ((baseRate - 1) ** 2 + (baseRate - 0) ** 2 + (baseRate - 0) ** 2) / 3;
    expect(direction?.brier?.jev).toBeCloseTo(expectedJevBrier, 5);
    expect(direction?.brier?.baseline).toBeCloseTo(expectedBaselineBrier, 5);

    const relevance = calibration.find(
      (c) => c.contextType === "news" && c.questionId === "relevance",
    );
    expect(relevance?.n).toBe(1);
    expect(relevance?.hitRate).toBeNull();
    expect(relevance?.brier).toBeNull();
  });

  it("returns an empty array when there are no scored judgments", async () => {
    mockDb.select.mockReturnValue(makeQueryChain([]));
    const calibration = await getJevCalibration();
    expect(calibration).toEqual([]);
  });
});
