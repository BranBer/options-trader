import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

// ---- in-memory DB (real drizzle + better-sqlite3, no disk file) ----
// vi.hoisted's callback runs before top-level imports are initialized, so
// `better-sqlite3`/`drizzle-orm` are require()'d synchronously inside it
// rather than imported at module scope.
const { db, sqlite } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/better-sqlite3");
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE paper_trades (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      strategy text NOT NULL,
      ticker text NOT NULL,
      status text NOT NULL DEFAULT 'open',
      entry_date text NOT NULL,
      planned_exit text NOT NULL,
      exit_date text,
      exit_reason text,
      legs text NOT NULL,
      entry_value real NOT NULL,
      risk real NOT NULL,
      mark_value real,
      pnl real,
      ret real,
      context text NOT NULL DEFAULT '{}',
      created_at text DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX idx_paper_trades_dedupe ON paper_trades (strategy, ticker, entry_date);
    CREATE TABLE desk_runs (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      started_at text NOT NULL,
      completed_at text,
      opened integer NOT NULL DEFAULT 0,
      marked integer NOT NULL DEFAULT 0,
      closed integer NOT NULL DEFAULT 0,
      errors text NOT NULL DEFAULT '[]'
    );
    CREATE TABLE whale_alerts (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      ticker text NOT NULL,
      strike real,
      expiry text,
      call_put text,
      premium real,
      volume integer,
      open_interest integer,
      underlying_price real,
      sentiment text,
      source text,
      detected_at text,
      quality_score integer,
      delta real, gamma real, theta real, vega real,
      implied_volatility real, break_even_price real,
      inferred_sentiment text, sentiment_confidence text, intent_hint text,
      dedup_date text,
      created_at text DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE analyses (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      type text, source text, input_refs text, output text,
      confidence real, confidence_breakdown text,
      created_at text DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE news_events (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      headline text NOT NULL, category text NOT NULL DEFAULT 'general',
      source text, url text, published_at text, country_code text,
      lat real, lng real, impact_score integer, sentiment text,
      sectors text, tickers text, event_type text, raw_summary text,
      gemini_analysis text, created_at text DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE jev_judgments (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      created_at text DEFAULT CURRENT_TIMESTAMP,
      context_type text NOT NULL, context_ref text NOT NULL, ticker text NOT NULL,
      question_id text NOT NULL, question_type text NOT NULL, model text NOT NULL,
      answer text NOT NULL, state_hash text NOT NULL, horizon_days integer,
      outcome text, scored_at text
    );
    CREATE TABLE hype_snapshots (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      date text NOT NULL, ticker text NOT NULL, rank integer NOT NULL, mentions integer NOT NULL,
      mentions_24h_ago integer, rank_24h_ago integer, upvotes integer
    );
    CREATE UNIQUE INDEX idx_hype_snapshots_date_ticker ON hype_snapshots (date, ticker);
  `);
  // No `{ schema }` here — schema is a path-aliased import not resolvable via
  // require() inside vi.hoisted. Table objects (imported normally below) work
  // fine with a schema-less drizzle instance for insert/select/update.
  const db = drizzle(sqlite);
  return { db, sqlite };
});

vi.mock("@/lib/db/client", () => ({ db }));

vi.mock("@/lib/services/ticker-universe", () => ({
  getTickerUniverse: vi.fn(async () => []),
}));

vi.mock("@/lib/services/hype-fetcher", () => ({
  fetchRedditHype: vi.fn(async () => []),
}));

vi.mock("@/lib/desk/market", async () => {
  const actual = await vi.importActual<typeof import("@/lib/desk/market")>("@/lib/desk/market");
  return {
    ...actual,
    // Keep asOf resolution/date math real; stub every network call.
    sessionCalendar: vi.fn(async (from: string, to: string) => [to]),
    fetchForwardEarningsCalendar: vi.fn(async () => []),
    listContracts: vi.fn(async () => []),
    optionDailyBar: vi.fn(async () => ({ o: 5, h: 5, l: 5, c: 5, v: 100, vw: 5 })),
    stockDailyBars: vi.fn(async () => []),
  };
});

const ASOF = "2026-09-25";

async function seedWhaleAlert() {
  await db.insert(schema.whaleAlerts).values({
    ticker: "NVDA",
    strike: 200,
    expiry: "2026-10-16",
    callPut: "C",
    premium: 500_000,
    volume: 1000,
    openInterest: 500,
    detectedAt: `${ASOF} 14:30:00`,
    source: "unusual_whales",
  });
}

describe("runDesk idempotency", () => {
  beforeEach(() => {
    sqlite.exec("DELETE FROM paper_trades; DELETE FROM desk_runs; DELETE FROM whale_alerts; DELETE FROM hype_snapshots;");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("opens a whale_follow trade once, and a second run for the same asOf opens nothing new", async () => {
    const { runDesk } = await import("@/lib/desk/run-desk");
    await seedWhaleAlert();

    const first = await runDesk(ASOF);
    expect(first.opened).toBe(1);
    expect(first.errors).toEqual([]);

    const tradesAfterFirst = await db.select().from(schema.paperTrades);
    expect(tradesAfterFirst).toHaveLength(1);
    expect(tradesAfterFirst[0].strategy).toBe("whale_follow");
    expect(tradesAfterFirst[0].ticker).toBe("NVDA");

    const second = await runDesk(ASOF);
    expect(second.opened).toBe(0);

    const tradesAfterSecond = await db.select().from(schema.paperTrades);
    expect(tradesAfterSecond).toHaveLength(1); // no duplicate row
  });

  it("rejects a concurrent run while one is in progress", async () => {
    const { runDesk, DeskRunInProgressError } = await import("@/lib/desk/run-desk");
    const p1 = runDesk(ASOF);
    await expect(runDesk(ASOF)).rejects.toBeInstanceOf(DeskRunInProgressError);
    await p1;
  });

  it("records a desk_runs row for every run", async () => {
    const { runDesk } = await import("@/lib/desk/run-desk");
    await runDesk(ASOF);
    const runs = await db.select().from(schema.deskRuns);
    expect(runs).toHaveLength(1);
    expect(runs[0].startedAt).toBeTruthy();
    expect(runs[0].completedAt).toBeTruthy();
  });

  it("attaches the session's VIX and Reddit hype to entries opened on the latest session", async () => {
    const { runDesk, resolveAsOf } = await import("@/lib/desk/run-desk");
    const market = await import("@/lib/desk/market");
    const hype = await import("@/lib/services/hype-fetcher");
    const latest = await resolveAsOf();
    vi.mocked(market.stockDailyBars).mockImplementation(async (ticker: string) =>
      ticker === "^VIX" ? [{ date: latest, o: 23, h: 24, l: 22, c: 23.4, v: 0 }] : [],
    );
    vi.mocked(hype.fetchRedditHype).mockResolvedValueOnce([
      { ticker: "NVDA", rank: 4, mentions: 90, mentions24hAgo: 30, rank24hAgo: 9, upvotes: 10 },
    ]);
    await db.insert(schema.whaleAlerts).values({
      ticker: "NVDA",
      strike: 200,
      expiry: market.addDays(latest, 30),
      callPut: "C",
      premium: 500_000,
      detectedAt: `${latest} 14:30:00`,
      source: "unusual_whales",
    });

    const run = await runDesk();

    expect(run.opened).toBe(1);
    const [trade] = await db.select().from(schema.paperTrades);
    expect(JSON.parse(trade.context ?? "{}")).toMatchObject({
      vix: 23.4,
      hype: { rank: 4, mentions: 90, mentions24hAgo: 30 },
    });
    expect(await db.select().from(schema.hypeSnapshots)).toHaveLength(1);
  });

  it("rec_trend opens a call on a bullish recommendation in an uptrend and takes profit at +100%", async () => {
    const { runDesk } = await import("@/lib/desk/run-desk");
    const market = await import("@/lib/desk/market");
    sqlite.exec("DELETE FROM analyses;");
    const qqqUp = Array.from({ length: 15 }, (_, i) => ({ date: market.addDays("2026-09-05", i + 5), o: 600, h: 600, l: 600, c: 600 + i, v: 1 }));
    qqqUp.push({ date: ASOF, o: 620, h: 620, l: 620, c: 620, v: 1 });
    vi.mocked(market.stockDailyBars).mockImplementation(async (ticker: string) =>
      ticker === "QQQ" ? qqqUp : [{ date: ASOF, o: 100, h: 100, l: 100, c: 100, v: 1 }],
    );
    vi.mocked(market.listContracts).mockResolvedValue([
      { ticker: "O:AAPL261005C00100000", type: "call", strike: 100, expiry: "2026-10-05" },
      { ticker: "O:AAPL261005P00100000", type: "put", strike: 100, expiry: "2026-10-05" },
    ]);
    vi.mocked(market.optionDailyBar).mockResolvedValue({ o: 5, h: 5, l: 5, c: 5, v: 100, vw: 5 });
    await db.insert(schema.analyses).values({
      type: "trade_recommendation",
      output: JSON.stringify({ ticker: "AAPL", direction: "bullish", thesis: "test" }),
      createdAt: `${ASOF} 14:00:00`,
    });

    const run = await runDesk(ASOF);
    const opened = (await db.select().from(schema.paperTrades)).filter((t: typeof schema.paperTrades.$inferSelect) => t.strategy === "rec_trend");
    expect(run.errors).toEqual([]);
    expect(opened).toHaveLength(1);
    expect(JSON.parse(opened[0].legs)[0]).toMatchObject({ cp: "C", strike: 100, side: 1 });

    // Next session the call closes at 11: (11·0.975 − 5·1.025) / (5·1.025) ≈ +109% → take-profit.
    vi.mocked(market.optionDailyBar).mockResolvedValue({ o: 11, h: 11, l: 11, c: 11, v: 100, vw: 11 });
    await runDesk("2026-09-28");
    const [closed] = (await db.select().from(schema.paperTrades)).filter((t: typeof schema.paperTrades.$inferSelect) => t.strategy === "rec_trend");
    expect(closed.status).toBe("closed");
    expect(closed.exitReason).toBe("take-profit");
  });
});
