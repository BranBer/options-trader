// Shared helpers for offline research/backtest scripts (not imported by the app).
// Everything historical is cached under data/cache/ (gitignored) so reruns are free and reproducible.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import YahooFinance from "yahoo-finance2";

export const ROOT = process.cwd();
export const CACHE = path.join(ROOT, "data", "cache");

export function loadEnv() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}
loadEnv();

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Disk-cached JSON: returns cached value for (ns, key) or computes, stores and returns it. */
export async function cached(ns, key, compute) {
  const dir = path.join(CACHE, ns);
  const file = path.join(dir, crypto.createHash("sha1").update(key).digest("hex") + ".json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const value = await compute();
  if (value !== undefined) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  }
  return value;
}

/** Minimal promise pool: run fn over items with at most n in flight. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

// ---------- Massive (ex-Polygon) ----------
// Owner's plan: option aggs unlimited, stock aggs 5/min, no trades/quotes, history from ~2024-09-30.
export async function massive(pathAndQuery, { cacheNs = "massive", cache = true } = {}) {
  const run = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const sep = pathAndQuery.includes("?") ? "&" : "?";
      const url = `https://api.massive.com${pathAndQuery}${sep}apiKey=${encodeURIComponent(process.env.MASSIVE_API_KEY)}`;
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
        if (r.status === 429 || r.status >= 500) {
          await sleep(1500 * 2 ** attempt);
          continue;
        }
        const j = await r.json();
        if (r.status !== 200) return { status: r.status, error: j.message ?? j.error ?? "error", results: [] };
        return j;
      } catch {
        await sleep(1000 * 2 ** attempt);
      }
    }
    return { status: 599, error: "network", results: [] };
  };
  return cache ? cached(cacheNs, pathAndQuery, run) : run();
}

/** OCC option ticker, e.g. occ("NVDA","2026-05-15","C",215) -> "O:NVDA260515C00215000". */
export function occ(underlying, expiry, cp, strike) {
  const [y, m, d] = expiry.split("-");
  return `O:${underlying}${y.slice(2)}${m}${d}${cp}${String(Math.round(strike * 1000)).padStart(8, "0")}`;
}

const nyDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
/** YYYY-MM-DD in New York for a ms timestamp or Date. */
export const toNyDate = (t) => nyDate.format(new Date(t));

/** Daily bars for an option contract, keyed by NY date. Empty object when none. */
export async function optionDaily(ticker, from, to) {
  const j = await massive(`/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=50000`, { cacheNs: "opt-daily" });
  const bars = {};
  for (const b of j.results ?? []) bars[toNyDate(b.t)] = { o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.vw };
  return bars;
}

const nyHm = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Minutes since NY midnight for a ms timestamp. */
export const nyMinutes = (t) => {
  const [h, m] = nyHm.format(new Date(t)).split(":").map(Number);
  return h * 60 + m;
};

/** First minute bar of `ticker` on NY `day` at/after minute-of-day `fromMinute`, within `windowMin`. VWAP fill. */
export async function minuteFill(ticker, day, fromMinute, windowMin = 60) {
  const j = await massive(`/v2/aggs/ticker/${ticker}/range/1/minute/${day}/${day}?adjusted=true&sort=asc&limit=50000`, { cacheNs: "opt-minute" });
  const bar = (j.results ?? []).find((b) => nyMinutes(b.t) >= fromMinute && nyMinutes(b.t) <= fromMinute + windowMin);
  return bar ? { price: bar.vw ?? bar.c, minute: nyMinutes(bar.t) } : null;
}

/** Option contracts listed for an underlying around a date (strike window optional). */
export async function listContracts(underlying, { asOf, expGte, expLte, strikeGte, strikeLte }) {
  const q = new URLSearchParams({ underlying_ticker: underlying, as_of: asOf, limit: "1000" });
  if (expGte) q.set("expiration_date.gte", expGte);
  if (expLte) q.set("expiration_date.lte", expLte);
  if (strikeGte != null) q.set("strike_price.gte", String(strikeGte));
  if (strikeLte != null) q.set("strike_price.lte", String(strikeLte));
  const rows = [];
  for (const expired of ["true", "false"]) {
    q.set("expired", expired);
    let j = await massive(`/v3/reference/options/contracts?${q}`, { cacheNs: "opt-ref" });
    rows.push(...(j.results ?? []));
    let pages = 0;
    while (j.next_url && pages++ < 5) {
      const u = new URL(j.next_url);
      u.searchParams.delete("apiKey");
      j = await massive(u.pathname + u.search, { cacheNs: "opt-ref" });
      rows.push(...(j.results ?? []));
    }
  }
  return rows.map((r) => ({ ticker: r.ticker, type: r.contract_type, strike: r.strike_price, expiry: r.expiration_date }));
}

// ---------- Yahoo daily bars (underlyings) ----------
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
/** Daily OHLCV for a stock/ETF as an ordered array of {date,o,h,l,c,v}. */
export async function stockDaily(ticker, from, to) {
  return cached("yahoo-daily", `${ticker}|${from}|${to}`, async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await yf.chart(ticker, { period1: from, period2: to, interval: "1d" });
        return (res.quotes ?? [])
          .filter((q) => q.open != null && q.close != null)
          .map((q) => ({ date: toNyDate(q.date), o: q.open, h: q.high, l: q.low, c: q.close, v: q.volume }));
      } catch (e) {
        if (String(e?.message ?? e).match(/Not Found|No data|delisted/i)) return [];
        await sleep(2000 * 2 ** attempt);
      }
    }
    return undefined; // don't cache failures
  });
}

// ---------- stats ----------
export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : NaN);
export function stdev(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1));
}
export function quantile(a, q) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (pos - lo);
}
export const median = (a) => quantile(a, 0.5);
export const tstat = (a) => mean(a) / (stdev(a) / Math.sqrt(a.length));

/** Seeded PRNG (mulberry32) so bootstraps/Monte Carlo are reproducible. */
export function rng(seed = 42) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** 95% bootstrap CI of the mean. */
export function bootstrapMeanCI(a, iters = 2000, seed = 7) {
  if (a.length < 5) return [NaN, NaN];
  const rand = rng(seed);
  const means = [];
  for (let i = 0; i < iters; i++) {
    let s = 0;
    for (let j = 0; j < a.length; j++) s += a[Math.floor(rand() * a.length)];
    means.push(s / a.length);
  }
  return [quantile(means, 0.025), quantile(means, 0.975)];
}

/** One-line summary of per-trade returns (fractions, e.g. 0.12 = +12%). */
export function summarize(returns) {
  const r = returns.filter((x) => Number.isFinite(x));
  const [lo, hi] = bootstrapMeanCI(r);
  return {
    n: r.length,
    mean: mean(r),
    median: median(r),
    winRate: r.filter((x) => x > 0).length / (r.length || 1),
    t: tstat(r),
    ci95: [lo, hi],
    p10: quantile(r, 0.1),
    p90: quantile(r, 0.9),
    worst: Math.min(...r),
    best: Math.max(...r),
  };
}

export const pct = (x, d = 1) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "n/a");
export function fmtSummary(label, s) {
  return `${label.padEnd(44)} n=${String(s.n).padStart(4)}  mean=${pct(s.mean).padStart(7)}  med=${pct(s.median).padStart(7)}  win=${pct(s.winRate, 0).padStart(4)}  t=${Number.isFinite(s.t) ? s.t.toFixed(2).padStart(6) : "   n/a"}  CI95=[${pct(s.ci95[0])}, ${pct(s.ci95[1])}]`;
}
