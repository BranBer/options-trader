// Backtest A: replay every stored trade_recommendation with real option prices (Massive aggs).
// Entry = first minute bar after the rec was written (never in the first 5 min of the session);
// exits: hold-to-expiry, ±50% TP/SL on daily closes (10-day cap), fixed 1/3/5-day holds.
// Costs: half-spread h per leg per side (0 / 2.5% / 5%). Output: data/cache/bt-dashboard-recs.json + console tables.
// Usage: node scripts/research/bt-dashboard-recs.mjs
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { massive, occ, optionDaily, stockDaily, pool, summarize, fmtSummary, toNyDate, CACHE, pct, median } from "./lib.mjs";

const db = new Database("data/dashboard.db", { readonly: true });
const rows = db
  .prepare("select id, source, output, confidence, created_at from analyses where type = 'trade_recommendation' order by id")
  .all();

const spy = await stockDaily("SPY", "2026-03-01", "2026-09-27");
const tradingDays = spy.map((b) => b.date);
const nextTradingDayIdx = (date) => tradingDays.findIndex((d) => d >= date);

const nyParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const nyMinutes = (ms) => {
  const [h, m] = nyParts.format(new Date(ms)).split(":").map(Number);
  return h * 60 + m;
};

// ---- parse + dedupe (one rec per ticker per NY day per source) ----
const recs = [];
const seen = new Set();
let unsupported = 0;
for (const r of rows) {
  let out;
  try {
    out = JSON.parse(r.output);
  } catch {
    continue;
  }
  const legs = out?.primary_strategy?.legs;
  const ticker = String(out?.ticker ?? "").toUpperCase();
  if (!ticker || !Array.isArray(legs) || !legs.length) continue;
  const createdMs = Date.parse(r.created_at.replace(" ", "T") + "Z");
  const key = `${ticker}|${toNyDate(createdMs)}|${r.source ?? "whale"}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const parsedLegs = legs.map((l) => ({
    sign: /sell|short|write/i.test(l.action) ? -1 : 1,
    cp: /put/i.test(l.type) ? "P" : /call/i.test(l.type) ? "C" : null,
    strike: Number(l.strike),
    expiry: String(l.expiry ?? "").slice(0, 10),
    qty: Math.max(1, Math.round(Number(l.quantity ?? 1)) || 1),
    est: Number(l.estimated_premium ?? l.premium),
  }));
  const expiries = new Set(parsedLegs.map((l) => l.expiry));
  if (parsedLegs.some((l) => !l.cp || !Number.isFinite(l.strike) || !/^\d{4}-\d{2}-\d{2}$/.test(l.expiry)) || expiries.size !== 1) {
    unsupported++;
    continue;
  }
  recs.push({
    id: r.id,
    source: r.source ?? "whale_pipeline",
    ticker,
    direction: out.direction ?? "neutral",
    confidence: r.confidence ?? out.confidence ?? null,
    strategy: out.primary_strategy?.name ?? "?",
    whaleMatch: out.whale_alignment?.matches_whale ?? null,
    createdMs,
    expiry: parsedLegs[0].expiry,
    legs: parsedLegs,
  });
}
console.log(`recommendations: ${rows.length} rows → ${recs.length} unique (ticker/day/source); ${unsupported} unsupported structures skipped`);

// ---- helpers ----
const payoffAt = (legs, S) => legs.reduce((s, l) => s + l.sign * l.qty * Math.max(0, l.cp === "C" ? S - l.strike : l.strike - S), 0);
function maxLoss(legs, v0) {
  const ks = legs.map((l) => l.strike);
  const grid = [0, ...ks, Math.max(...ks) * 3];
  const worst = Math.min(...grid.map((S) => payoffAt(legs, S) - v0));
  // Unbounded upside loss for net-short calls: payoff slope at the top of the grid
  const slope = legs.reduce((s, l) => s + (l.cp === "C" ? l.sign * l.qty : 0), 0);
  return slope < 0 ? Infinity : -worst;
}
const withCost = (legs, prices, h, opening) =>
  // opening: buy at p(1+h), sell at p(1-h); closing reverses. Returns position value (long minus short).
  legs.reduce((s, l, i) => {
    const p = prices[i];
    const paying = opening ? l.sign > 0 : l.sign < 0;
    return s + l.sign * l.qty * p * (paying ? 1 + h : 1 - h);
  }, 0);

async function entryFill(rec) {
  // First eligible session minute: ≥ created time, ≥ 09:35 ET, ≤ 15:50 ET; else next session 09:35.
  let dayIdx = nextTradingDayIdx(toNyDate(rec.createdMs));
  let minMinute = 9 * 60 + 35;
  if (tradingDays[dayIdx] === toNyDate(rec.createdMs)) {
    const m = nyMinutes(rec.createdMs);
    if (m > 15 * 60 + 50) dayIdx++;
    else minMinute = Math.max(minMinute, m + 1);
  }
  const day = tradingDays[dayIdx];
  if (!day || day > rec.expiry) return null;
  const prices = [];
  let fillMinute = null;
  for (const l of rec.legs) {
    const tk = occ(rec.ticker, l.expiry, l.cp, l.strike);
    const j = await massive(`/v2/aggs/ticker/${tk}/range/1/minute/${day}/${day}?adjusted=true&sort=asc&limit=50000`, { cacheNs: "opt-minute" });
    const bar = (j.results ?? []).find((b) => nyMinutes(b.t) >= minMinute && nyMinutes(b.t) <= minMinute + 60);
    if (!bar) return { day, illiquid: true };
    prices.push(bar.vw ?? bar.c);
    fillMinute = Math.max(fillMinute ?? 0, nyMinutes(bar.t));
  }
  return { day, dayIdx, prices, fillMinute };
}

const COSTS = [0, 0.025, 0.05];
const results = [];
let illiquid = 0, noEntry = 0, unbounded = 0;
await pool(recs, 8, async (rec) => {
  const e = await entryFill(rec);
  if (!e) return noEntry++;
  if (e.illiquid) return illiquid++;
  const legBars = await Promise.all(rec.legs.map((l) => optionDaily(occ(rec.ticker, l.expiry, l.cp, l.strike), e.day, rec.expiry)));
  const under = (await stockDaily(rec.ticker, "2026-03-01", "2026-09-27")) ?? [];
  const uClose = new Map(under.map((b) => [b.date, b.c]));
  const v0mid = withCost(rec.legs, e.prices, 0, true);
  const risk = v0mid > 0 ? v0mid : maxLoss(rec.legs, v0mid);
  if (!Number.isFinite(risk) || risk <= 0) return unbounded++;

  // Position value (mid) on each session after entry, through expiry.
  const path_ = [];
  let last = e.prices.slice();
  for (let i = e.dayIdx + 1; i < tradingDays.length && tradingDays[i] <= rec.expiry; i++) {
    const d = tradingDays[i];
    if (d === rec.expiry && uClose.has(d)) {
      path_.push({ d, expiry: true, value: payoffAt(rec.legs, uClose.get(d)) });
      break;
    }
    last = rec.legs.map((_, k) => legBars[k][d]?.c ?? last[k]);
    path_.push({ d, prices: last.slice() });
  }
  if (!path_.length) return noEntry++;

  const r = { ...rec, entryDay: e.day, entryPrices: e.prices, risk, v0mid, byCost: {} };
  // Estimated vs actual entry premium (how far off were the LLM's price assumptions?)
  const estOk = rec.legs.every((l) => Number.isFinite(l.est) && l.est > 0);
  r.premiumError = estOk ? median(rec.legs.map((l, k) => Math.abs(l.est - e.prices[k]) / e.prices[k])) : null;

  for (const h of COSTS) {
    const v0 = withCost(rec.legs, e.prices, h, true);
    const riskH = v0 > 0 ? v0 : maxLoss(rec.legs, v0);
    const exitVal = (p) => (p.expiry ? p.value : withCost(rec.legs, p.prices, h, false));
    const ret = (p) => (exitVal(p) - v0) / riskH;
    const out = {};
    out.hold = ret(path_[path_.length - 1]);
    for (const n of [1, 3, 5]) out[`d${n}`] = ret(path_[Math.min(n, path_.length) - 1]);
    let tpsl = null;
    for (let i = 0; i < path_.length && i < 10; i++) {
      const x = ret(path_[i]);
      if (x >= 0.5 || x <= -0.5 || i === Math.min(10, path_.length) - 1) {
        tpsl = x;
        break;
      }
    }
    out.tpsl = tpsl;
    r.byCost[h] = out;
  }
  // Underlying direction check (close of entry day → +5 sessions)
  const i0 = e.dayIdx;
  const c0 = uClose.get(tradingDays[i0]);
  const c5 = uClose.get(tradingDays[Math.min(i0 + 5, tradingDays.length - 1)]);
  r.under5 = c0 && c5 ? c5 / c0 - 1 : null;
  results.push(r);
});

fs.writeFileSync(path.join(CACHE, "bt-dashboard-recs.json"), JSON.stringify(results));
console.log(`backtested: ${results.length}; no entry/expired: ${noEntry}; illiquid at entry: ${illiquid}; unbounded risk skipped: ${unbounded}`);
console.log(`LLM premium estimate error (median |est-actual|/actual): ${pct(median(results.map((r) => r.premiumError).filter((x) => x != null)))}`);

const kinds = (r) => (r.legs.length === 1 ? (r.legs[0].sign > 0 ? "single long" : "single short") : r.v0mid > 0 ? "debit spread" : "credit spread");
const conf = (r) => (r.confidence == null ? "?" : r.confidence >= 0.65 ? "conf>=0.65" : r.confidence >= 0.5 ? "conf 0.50-0.64" : "conf<0.50");
for (const h of COSTS) {
  console.log(`\n=== half-spread cost ${pct(h)} per leg per side ===`);
  for (const exit of ["d1", "d3", "d5", "tpsl", "hold"]) console.log(fmtSummary(`ALL exit=${exit}`, summarize(results.map((r) => r.byCost[h][exit]))));
  if (h !== 0.025) continue;
  for (const [label, fn] of [["source", (r) => r.source], ["structure", kinds], ["direction", (r) => r.direction], ["confidence", conf], ["whaleMatch", (r) => String(r.whaleMatch)]]) {
    const groups = {};
    for (const r of results) (groups[fn(r)] ??= []).push(r.byCost[h].tpsl);
    for (const [g, xs] of Object.entries(groups)) console.log(fmtSummary(`  by ${label}: ${g} (tpsl)`, summarize(xs)));
  }
}
const dir = results.filter((r) => r.under5 != null && r.direction !== "neutral");
const hit = dir.filter((r) => (r.direction === "bullish") === r.under5 > 0).length;
console.log(`\nDirectional hit rate (underlying, 5 sessions): ${hit}/${dir.length} = ${pct(hit / dir.length)}; share of up-moves in sample: ${pct(dir.filter((r) => r.under5 > 0).length / dir.length)}`);
