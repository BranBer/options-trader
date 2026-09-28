// Builds data/cache/earnings-events.json: large-cap earnings reaction sessions (t0) with the sessions around them.
// Source: Nasdaq's earnings calendar, cached for 2024-10-01..2025-06-27 (the API then 403'd this machine).
// ponytail: inferring later report dates from volume spikes was tried and rejected — it matched only ~57% of
// known dates, and a one-day miss breaks every straddle test. Extend with UW's earnings history once keyed.
// Usage: node scripts/research/build-earnings-events.mjs
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pool, stockDaily, CACHE, median } from "./lib.mjs";

const MIN_CAP = 20e9;
const GT_FROM = "2024-10-01", GT_END = "2025-06-27";

const dir = path.join(CACHE, "nasdaq-earnings");
const reports = new Map(); // ticker -> Set(reportDate)
for (let t = Date.parse(GT_FROM); t <= Date.parse(GT_END); t += 864e5) {
  const d = new Date(t).toISOString().slice(0, 10);
  const f = path.join(dir, crypto.createHash("sha1").update(d).digest("hex") + ".json");
  if (!fs.existsSync(f)) continue;
  for (const r of JSON.parse(fs.readFileSync(f, "utf8")))
    if (r.cap >= MIN_CAP && /^[A-Z]{1,5}$/.test(r.symbol)) (reports.get(r.symbol) ?? reports.set(r.symbol, new Set()).get(r.symbol)).add(d);
}

const spy = await stockDaily("SPY", "2024-08-01", "2026-09-27");
const spyIdx = new Map(spy.map((b, i) => [b.date, i]));
const volRatio = (bars, i) => {
  const base = median(bars.slice(i - 25, i - 4).map((b) => b.v));
  return base > 0 ? bars[i].v / base : 0;
};
// Idiosyncratic reaction strength: volume spike relative to SPY's that day × market-adjusted overnight gap.
function reaction(bars, i) {
  const j = spyIdx.get(bars[i].date);
  if (i < 26 || j == null) return 0;
  const rel = volRatio(bars, i) / Math.max(0.5, volRatio(spy, j));
  const gap = Math.max(0, Math.abs(Math.log(bars[i].o / bars[i - 1].c)) - Math.abs(Math.log(spy[j].o / spy[j - 1].c)));
  return rel * (gap + 0.005);
}

const events = [];
let mixed = 0;
await pool([...reports.keys()], 6, async (ticker) => {
  const bars = (await stockDaily(ticker, "2024-08-01", "2026-09-27")) ?? [];
  const idx = new Map(bars.map((b, i) => [b.date, i]));
  // For report date D: BMO trades the news on D, AMC on D+1. Vote per report, then use the ticker's majority
  // (companies keep a fixed schedule; a lone disagreeing vote is almost always a quiet reaction, not a switch).
  const rows = [...reports.get(ticker)].sort().map((d) => idx.get(d)).filter((i) => i != null && i >= 27 && i + 2 < bars.length);
  const votesAmc = rows.filter((i) => reaction(bars, i + 1) > reaction(bars, i)).length;
  if (votesAmc && votesAmc < rows.length) mixed++;
  const amc = votesAmc * 2 > rows.length;
  for (const i of rows) {
    const t0 = amc ? i + 1 : i;
    events.push({
      ticker,
      timing: amc ? "AMC" : "BMO",
      reportDate: bars[i].date,
      t0: bars[t0].date,
      tm1: bars[t0 - 1].date,
      tm3: bars[t0 - 3].date,
      tm5: bars[t0 - 5].date,
      tp1: bars[t0 + 1].date,
      closeTm1: bars[t0 - 1].c,
      closeTm3: bars[t0 - 3].c,
      closeTm5: bars[t0 - 5].c,
      closeT0: bars[t0].c,
      moveT0: Math.log(bars[t0].c / bars[t0 - 1].c),
    });
  }
});

events.sort((a, b) => a.t0.localeCompare(b.t0) || a.ticker.localeCompare(b.ticker));
fs.writeFileSync(path.join(CACHE, "earnings-events.json"), JSON.stringify(events, null, 1));
const t = events.reduce((m, e) => ((m[e.timing] = (m[e.timing] ?? 0) + 1), m), {});
console.log(`tickers: ${reports.size}; events: ${events.length} ${JSON.stringify(t)}; tickers with mixed timing votes (majority applied): ${mixed}`);
console.log(`t0 range: ${events[0]?.t0} → ${events.at(-1)?.t0}`);
