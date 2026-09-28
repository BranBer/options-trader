import { beforeEach, describe, expect, it, vi } from "vitest";

// Build two independent chainable query builders so getWhaleWeightedTickers()
// and getHighImpactNewsTickers() (each doing db.select().from().where()) can
// return different fixtures within the same test.
const { mockDb, whaleRows, newsRows } = vi.hoisted(() => {
  const whaleRows: Array<{ ticker: string | null; premium: number | null }> = [];
  const newsRows: Array<{ tickers: string | null }> = [];

  const makeBuilder = (rows: unknown[]) => ({
    from: vi.fn(() => ({
      where: vi.fn(async () => rows),
    })),
  });

  const mockDb = {
    select: vi.fn((_shape: unknown) => {
      // Distinguish by shape: whale query selects {ticker, premium},
      // news query selects {tickers}.
      const keys = Object.keys(_shape as Record<string, unknown>);
      if (keys.includes("premium")) return makeBuilder(whaleRows);
      return makeBuilder(newsRows);
    }),
  };

  return { mockDb, whaleRows, newsRows };
});

vi.mock("@/lib/db/client", () => ({ db: mockDb }));

import { getTickerUniverse, FALLBACK_TICKERS } from "@/lib/services/ticker-universe";

beforeEach(() => {
  whaleRows.length = 0;
  newsRows.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getTickerUniverse", () => {
  it("ranks whale-alert tickers by aggregate premium, highest first", async () => {
    whaleRows.push(
      { ticker: "AAPL", premium: 100_000 },
      { ticker: "TSLA", premium: 500_000 },
      { ticker: "AAPL", premium: 50_000 }, // AAPL total = 150,000
    );

    const result = await getTickerUniverse();

    expect(result[0]).toBe("TSLA"); // 500,000 > 150,000
    expect(result[1]).toBe("AAPL");
  });

  it("includes tickers from high-impact news events", async () => {
    newsRows.push({ tickers: JSON.stringify(["NVDA", "MSFT"]) });

    const result = await getTickerUniverse();

    expect(result).toContain("NVDA");
    expect(result).toContain("MSFT");
  });

  it("normalizes case and drops tickers that don't match /^[A-Z]{1,5}$/", async () => {
    whaleRows.push({ ticker: "aapl", premium: 100_000 });
    newsRows.push({
      tickers: JSON.stringify(["nvda", "TOO-LONG-SYM", "BRK.B", "GOOGL", ""]),
    });

    const result = await getTickerUniverse();

    expect(result).toContain("AAPL");
    expect(result).toContain("NVDA");
    expect(result).toContain("GOOGL");
    expect(result).not.toContain("TOO-LONG-SYM");
    expect(result).not.toContain("BRK.B");
  });

  it("dedupes tickers appearing in both whale and news sources", async () => {
    whaleRows.push({ ticker: "SPY", premium: 200_000 });
    newsRows.push({ tickers: JSON.stringify(["SPY"]) });

    const result = await getTickerUniverse();

    expect(result.filter((t) => t === "SPY")).toHaveLength(1);
  });

  it("skips rows with malformed JSON in the tickers column", async () => {
    newsRows.push({ tickers: "{not valid json" }, { tickers: JSON.stringify(["IBM"]) });

    const result = await getTickerUniverse();

    expect(result).toContain("IBM");
  });

  it("respects the max option", async () => {
    whaleRows.push(
      { ticker: "AAA", premium: 500 },
      { ticker: "BBB", premium: 400 },
      { ticker: "CCC", premium: 300 },
    );

    const result = await getTickerUniverse({ max: 2 });

    expect(result).toHaveLength(2);
  });

  it("falls back to SPY/QQQ/IWM when every dynamic source is empty", async () => {
    const result = await getTickerUniverse();
    expect(result).toEqual([...FALLBACK_TICKERS]);
  });
});
