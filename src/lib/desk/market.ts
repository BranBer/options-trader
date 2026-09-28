/**
 * Story S6 — market data access for the paper-trading desk.
 *
 * Ports the shapes verified in scripts/research/lib.mjs to the app (that file
 * is a standalone offline research script and is never imported from TS —
 * see the story). No disk caching here: this runs against live data on a
 * cron/API call, not a repeatable backtest.
 */
import YahooFinance from "yahoo-finance2";

// yahoo-finance2 v3 class API — types export `never` for some methods but
// they exist at runtime (same workaround as src/lib/services/market-fetcher.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] }) as any;

// ---------- half-spread cost model ----------
// Opening: buy legs at close*(1+h), sell legs at close*(1-h). Closing reverses.
// `side` is the PaperLeg convention: +1 long, -1 short.

export function fillOpen(price: number, h: number, side: 1 | -1): number {
  return side > 0 ? price * (1 + h) : price * (1 - h);
}

export function fillClose(price: number, h: number, side: 1 | -1): number {
  // Closing a long = selling (receive less); closing a short = buying back (pay more).
  return side > 0 ? price * (1 - h) : price * (1 + h);
}

/** Per-share value of a leg set at given per-leg prices, sign-weighted (long positive, short negative). */
export function legsValue(
  legs: { side: 1 | -1; qty: number }[],
  prices: number[],
): number {
  return legs.reduce((s, l, i) => s + l.side * l.qty * prices[i], 0);
}

/**
 * Position value with the half-spread cost model applied per leg, on the
 * SAME sign scale for opening and closing (ported from bt-dashboard-recs.mjs
 * `withCost`): a long leg contributes positively, a short leg negatively;
 * opening a long / closing a short both pay `price*(1+h)`, opening a short /
 * closing a long both receive `price*(1-h)`. `entryValue = positionValue(...,
 * opening=true)`; P&L is simply `positionValue(..., opening=false) -
 * entryValue` for any leg combination (debit or credit).
 */
export function positionValue(
  legs: { side: 1 | -1; qty: number }[],
  prices: number[],
  h: number,
  opening: boolean,
): number {
  return legs.reduce((s, l, i) => {
    const paying = opening ? l.side > 0 : l.side < 0;
    return s + l.side * l.qty * prices[i] * (paying ? 1 + h : 1 - h);
  }, 0);
}

// ---------- payoff / max-loss (ported from bt-dashboard-recs.mjs) ----------

export interface PayoffLeg {
  side: 1 | -1;
  qty: number;
  cp: "C" | "P";
  strike: number;
}

export function payoffAt(legs: PayoffLeg[], underlyingClose: number): number {
  return legs.reduce(
    (s, l) =>
      s +
      l.side *
        l.qty *
        Math.max(
          0,
          l.cp === "C" ? underlyingClose - l.strike : l.strike - underlyingClose,
        ),
    0,
  );
}

/**
 * Worst-case loss over a payoff grid anchored at 0 and 3x the max strike.
 * Returns Infinity for unbounded loss (net-short calls with no long call above).
 */
export function payoffGridMaxLoss(legs: PayoffLeg[], v0: number): number {
  const strikes = legs.map((l) => l.strike);
  if (strikes.length === 0) return Infinity;
  const grid = [0, ...strikes, Math.max(...strikes) * 3];
  const worst = Math.min(...grid.map((s) => payoffAt(legs, s) - v0));
  const callSlope = legs.reduce(
    (s, l) => s + (l.cp === "C" ? l.side * l.qty : 0),
    0,
  );
  return callSlope < 0 ? Infinity : -worst;
}

// ---------- OCC ticker + NY date helpers ----------

/** OCC option ticker, e.g. occ("NVDA","2026-05-15","C",215) -> "O:NVDA260515C00215000". */
export function occ(
  underlying: string,
  expiry: string,
  cp: "C" | "P",
  strike: number,
): string {
  const [y, m, d] = expiry.split("-");
  return `O:${underlying}${y.slice(2)}${m}${d}${cp}${String(
    Math.round(strike * 1000),
  ).padStart(8, "0")}`;
}

const nyDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD in New York for a ms timestamp/Date. */
export function toNyDate(t: number | Date): string {
  return nyDateFmt.format(t instanceof Date ? t : new Date(t));
}

/** Current NY wall-clock date + minute-of-day. */
export function nowInNy(): { date: string; minutes: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10),
  };
}

export function addDays(date: string, n: number): string {
  return new Date(Date.parse(date + "T12:00:00Z") + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Next weekday after `date` (skips Sat/Sun only — market holidays are NOT
 * modeled). Used only as an approximate forward-looking calendar (the next
 * session's realized bar doesn't exist yet when we need it); actual exit
 * timing during marking uses the real SPY-bar session calendar instead, see
 * src/lib/desk/AGENTS.md.
 */
export function nextWeekday(date: string): string {
  let d = addDays(date, 1);
  while ([0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())) d = addDays(d, 1);
  return d;
}

/** Add `n` weekdays (Sat/Sun skipped, holidays not modeled) to `date`. */
export function addWeekdays(date: string, n: number): string {
  let d = date;
  for (let remaining = n; remaining > 0; ) {
    d = addDays(d, 1);
    if (![0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())) remaining--;
  }
  return d;
}

// ---------- Massive (options aggs + reference) ----------

function massiveKey(): string {
  const key = process.env.MASSIVE_API_KEY;
  if (!key) throw new Error("MASSIVE_API_KEY is not configured");
  return key;
}

async function massiveFetch(
  pathAndQuery: string,
): Promise<{ status?: number; results?: unknown[]; next_url?: string; error?: string }> {
  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const url = `https://api.massive.com${pathAndQuery}${sep}apiKey=${encodeURIComponent(massiveKey())}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      const json = await res.json();
      if (res.status !== 200) {
        return { status: res.status, error: json?.message ?? json?.error ?? "error", results: [] };
      }
      return json;
    } catch {
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    }
  }
  return { status: 599, error: "network", results: [] };
}

export interface ListedContract {
  ticker: string;
  type: "call" | "put";
  strike: number;
  expiry: string;
}

/** Option contracts listed for an underlying around a date (strike window optional). */
export async function listContracts(
  underlying: string,
  opts: {
    asOf: string;
    expGte?: string;
    expLte?: string;
    strikeGte?: number;
    strikeLte?: number;
  },
): Promise<ListedContract[]> {
  const q = new URLSearchParams({
    underlying_ticker: underlying,
    as_of: opts.asOf,
    limit: "1000",
  });
  if (opts.expGte) q.set("expiration_date.gte", opts.expGte);
  if (opts.expLte) q.set("expiration_date.lte", opts.expLte);
  if (opts.strikeGte != null) q.set("strike_price.gte", String(opts.strikeGte));
  if (opts.strikeLte != null) q.set("strike_price.lte", String(opts.strikeLte));

  const rows: Array<{
    ticker: string;
    contract_type: string;
    strike_price: number;
    expiration_date: string;
  }> = [];

  for (const expired of ["true", "false"]) {
    q.set("expired", expired);
    let json = await massiveFetch(`/v3/reference/options/contracts?${q}`);
    rows.push(...((json.results as typeof rows) ?? []));
    let pages = 0;
    while (json.next_url && pages++ < 5) {
      const u = new URL(json.next_url);
      u.searchParams.delete("apiKey");
      json = await massiveFetch(u.pathname + u.search);
      rows.push(...((json.results as typeof rows) ?? []));
    }
  }

  return rows.map((r) => ({
    ticker: r.ticker,
    type: r.contract_type === "call" ? "call" : "put",
    strike: r.strike_price,
    expiry: r.expiration_date,
  }));
}

export interface OptionDailyBar {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  vw?: number;
}

/** Daily option bars for `ticker` between `from`/`to` (inclusive), keyed by NY date. */
export async function optionDailyRange(
  ticker: string,
  from: string,
  to: string,
): Promise<Record<string, OptionDailyBar>> {
  const json = await massiveFetch(
    `/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000`,
  );
  const bars: Record<string, OptionDailyBar> = {};
  for (const b of (json.results as Array<{ t: number; o: number; h: number; l: number; c: number; v: number; vw?: number }>) ?? []) {
    bars[toNyDate(b.t)] = { o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.vw };
  }
  return bars;
}

/** Single-day option bar, or null if none printed. */
export async function optionDailyBar(
  ticker: string,
  date: string,
): Promise<OptionDailyBar | null> {
  const bars = await optionDailyRange(ticker, date, date);
  return bars[date] ?? null;
}

/** MIN_VOL-gated close: the bar's close only if it printed volume >= minVol. */
export function liquidClose(bar: OptionDailyBar | undefined, minVol = 20): number | null {
  return bar && bar.v >= minVol ? bar.c : null;
}

// ---------- Finnhub forward earnings calendar ----------

export type EarningsHour = "bmo" | "amc" | "dmh" | "";

export interface EarningsCalendarRow {
  symbol: string;
  date: string;
  hour: EarningsHour;
}

/** Forward earnings calendar rows in [from, to]. Historical dates are not available on the free tier. */
export async function fetchForwardEarningsCalendar(
  from: string,
  to: string,
): Promise<EarningsCalendarRow[]> {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) throw new Error("FINNHUB_API_KEY is not configured");
  const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Finnhub earnings calendar failed: ${res.status}`);
  const json = await res.json();
  const rows: Array<{ symbol?: string; date?: string; hour?: string }> = json?.earningsCalendar ?? [];
  return rows
    .filter((r) => r.symbol && r.date)
    .map((r) => ({
      symbol: String(r.symbol).toUpperCase(),
      date: String(r.date).slice(0, 10),
      hour: (r.hour === "bmo" || r.hour === "amc" || r.hour === "dmh" ? r.hour : "") as EarningsCalendarRow["hour"],
    }));
}

// ---------- Yahoo underlying bars + session calendar ----------

export interface UnderlyingBar {
  date: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** Daily OHLCV for a stock/ETF, ordered ascending by NY date. Never throws; [] on failure. */
export async function stockDailyBars(
  ticker: string,
  from: string,
  to: string,
): Promise<UnderlyingBar[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await yf.chart(ticker, { period1: from, period2: to, interval: "1d" });
      const quotes: Array<{ date: string | Date; open?: number; high?: number; low?: number; close?: number; volume?: number }> =
        res?.quotes ?? [];
      return quotes
        .filter((q) => q.open != null && q.close != null)
        .map((q) => ({
          date: toNyDate(new Date(q.date)),
          o: q.open as number,
          h: q.high as number,
          l: q.low as number,
          c: q.close as number,
          v: q.volume ?? 0,
        }));
    } catch (err) {
      if (/Not Found|No data|delisted/i.test(String((err as Error)?.message ?? err))) return [];
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    }
  }
  return [];
}

/**
 * Trading-session calendar: SPY's own bar dates, i.e. a date is a session iff
 * SPY has a bar (Massive/Yahoo history starts 2024-09-30 for options; give a
 * wide-enough window either side of `centerFrom`/`centerTo`).
 */
export async function sessionCalendar(from: string, to: string): Promise<string[]> {
  const bars = await stockDailyBars("SPY", from, to);
  return bars.map((b) => b.date);
}

/** Annualized stdev of daily log returns over the trailing `window` closes ending at `closes[closes.length-1]`. */
export function annualizedHV(closes: number[], window = 20): number | null {
  if (closes.length < window + 1) return null;
  const tail = closes.slice(-(window + 1));
  const logRets: number[] = [];
  for (let i = 1; i < tail.length; i++) logRets.push(Math.log(tail[i] / tail[i - 1]));
  const m = logRets.reduce((s, x) => s + x, 0) / logRets.length;
  const variance = logRets.reduce((s, x) => s + (x - m) ** 2, 0) / (logRets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}
