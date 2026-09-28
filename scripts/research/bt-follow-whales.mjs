// Backtest D: "follow the whale" — buy the exact contract of each stored whale alert shortly after detection.
// Entry: first minute bar ≥ detection + 1 min (≥ 09:35 ET), else next session 09:35. Exits: close after 1/3/5
// sessions (or expiry settlement if sooner). Costs: half-spread 0 / 2.5% / 5% per side.
// Also: beta-adjusted signed underlying return (does the alert's direction beat what beta alone predicts?).
// Usage: node scripts/research/bt-follow-whales.mjs
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { occ, optionDaily, stockDaily, minuteFill, nyMinutes, toNyDate, pool, summarize, fmtSummary, CACHE, pct, mean } from "./lib.mjs";

const db = new Database("data/dashboard.db", { readonly: true });
const alerts = db
  .prepare("select id, ticker, strike, expiry, call_put cp, premium, volume, open_interest oi, detected_at, quality_score q, source from whale_alerts where strike is not null and expiry is not null order by detected_at")
  .all();

const spy = await stockDaily("SPY", "2025-12-01", "2026-09-27");
const days = spy.map((b) => b.date), spyC = new Map(spy.map((b) => [b.date, b.c]));
const COSTS = [0, 0.025, 0.05];

// One trade per contract per day (the pipeline re-detects the same contract every 10 minutes).
const uniq = new Map();
for (const a of alerts) {
  const ms = Date.parse(a.detected_at);
  if (!Number.isFinite(ms)) continue;
  const key = `${a.ticker}|${a.expiry}|${a.cp}|${a.strike}|${toNyDate(ms)}`;
  if (!uniq.has(key)) uniq.set(key, { ...a, ms });
}
console.log(`whale alerts: ${alerts.length} → ${uniq.size} unique contract-days`);

const results = [];
let noFill = 0;
await pool([...uniq.values()], 10, async (a) => {
  const expiry = String(a.expiry).slice(0, 10);
  const tk = occ(a.ticker, expiry, a.cp, a.strike);
  let dayIdx = days.findIndex((d) => d >= toNyDate(a.ms));
  let from = 9 * 60 + 35;
  if (days[dayIdx] === toNyDate(a.ms)) {
    const m = nyMinutes(a.ms);
    if (m > 15 * 60 + 50) dayIdx++;
    else from = Math.max(from, m + 1);
  }
  const day = days[dayIdx];
  if (!day || day > expiry) return noFill++;
  const fill = await minuteFill(tk, day, from);
  if (!fill) return noFill++;
  const bars = await optionDaily(tk, day, expiry);
  const under = (await stockDaily(a.ticker, "2025-12-01", "2026-09-27")) ?? [];
  const uc = new Map(under.map((b) => [b.date, b.c]));
  const valueOn = (i) => {
    const d = days[i];
    if (d >= expiry && uc.has(expiry)) return { v: Math.max(0, a.cp === "C" ? uc.get(expiry) - a.strike : a.strike - uc.get(expiry)), settle: true };
    return bars[d]?.c != null ? { v: bars[d].c, settle: false } : null;
  };
  const r = { ticker: a.ticker, cp: a.cp, day, q: a.q, premium: a.premium, dte: Math.round((Date.parse(expiry) - Date.parse(day)) / 864e5), otm: a.cp === "C" ? a.strike / uc.get(day) - 1 : 1 - a.strike / uc.get(day), byCost: {} };
  for (const h of COSTS) {
    const cost = fill.price * (1 + h);
    const out = {};
    for (const n of [1, 3, 5]) {
      let i = Math.min(dayIdx + n, days.length - 1);
      while (i > dayIdx && days[i] > expiry) i--;
      let val = valueOn(i);
      for (let k = i - 1; !val && k > dayIdx; k--) val = valueOn(k); // last traded close if no print that day
      out[`d${n}`] = val ? (val.settle ? val.v : val.v * (1 - h)) / cost - 1 : null;
    }
    r.byCost[h] = out;
  }
  // underlying direction, beta-adjusted (60 sessions before entry)
  const win = days.slice(Math.max(0, dayIdx - 60), dayIdx + 1).filter((d) => uc.has(d));
  const rs = win.slice(1).map((d, k) => uc.get(d) / uc.get(win[k]) - 1), rm = win.slice(1).map((d, k) => spyC.get(d) / spyC.get(win[k]) - 1);
  const mm = mean(rm), ms = mean(rs);
  const beta = rs.reduce((s, x, k) => s + (x - ms) * (rm[k] - mm), 0) / rm.reduce((s, x) => s + (x - mm) ** 2, 0);
  const j5 = Math.min(dayIdx + 5, days.length - 1);
  const s5 = uc.get(days[j5]) / uc.get(day) - 1, m5 = spyC.get(days[j5]) / spyC.get(day) - 1;
  r.xb = (a.cp === "C" ? 1 : -1) * (s5 - beta * m5);
  results.push(r);
});
fs.writeFileSync(path.join(CACHE, "bt-follow-whales.json"), JSON.stringify(results));
console.log(`filled: ${results.length}, no fill/expired: ${noFill}`);
for (const h of COSTS) {
  console.log(`\n=== half-spread ${pct(h)} ===`);
  for (const k of ["d1", "d3", "d5"]) console.log(fmtSummary(`follow whale, exit ${k}`, summarize(results.map((r) => r.byCost[h][k]).filter((x) => x != null))));
}
const g = (label, f) => console.log(fmtSummary(label, summarize(results.filter(f).map((r) => r.byCost[0.025].d3).filter((x) => x != null))));
console.log("\n--- 2.5% cost, exit d3, by slice ---");
g("calls", (r) => r.cp === "C");
g("puts", (r) => r.cp === "P");
g("DTE <= 7", (r) => r.dte <= 7);
g("DTE 8-30", (r) => r.dte > 7 && r.dte <= 30);
g("DTE > 30", (r) => r.dte > 30);
g("OTM > 5%", (r) => r.otm > 0.05);
g("near-the-money (|otm| <= 5%)", (r) => Math.abs(r.otm) <= 0.05);
g("quality score >= 70", (r) => (r.q ?? 0) >= 70);
console.log(fmtSummary("underlying beta-adj signed 5d return", summarize(results.map((r) => r.xb).filter(Number.isFinite))));
