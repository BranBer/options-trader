// Backtest E: long ATM straddles on stocks whose options look CHEAP vs realized vol (Goyal & Saretto 2009,
// long leg only — buy-only, so it fits a Level-2 / agent-account constraint).
// Monthly: first session of each month, for each large cap: HV20 from closes; IV proxy from the ~30-DTE ATM
// straddle (IV ≈ straddle / (0.8 · S · √T)). Buy the top decile of HV20/IV at the close, sell 10 sessions later.
// Events inside the holding window are allowed (they'd show up as rich IV, so rarely selected).
// Usage: node scripts/research/bt-cheap-vol.mjs
import fs from "node:fs";
import path from "node:path";
import { listContracts, optionDaily, stockDaily, pool, summarize, fmtSummary, CACHE, pct, quantile, stdev } from "./lib.mjs";

const HOLD = 10;
const COSTS = [0, 0.02, 0.04];
const events = JSON.parse(fs.readFileSync(path.join(CACHE, "earnings-events.json"), "utf8"));
const universe = [...new Set(events.map((e) => e.ticker))];
const spy = await stockDaily("SPY", "2024-08-01", "2026-09-27");
const days = spy.map((b) => b.date);
const rebal = days.filter((d, i) => i > 0 && d.slice(0, 7) !== days[i - 1].slice(0, 7) && d >= "2024-10-01" && i + HOLD < days.length);
const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
console.log(`universe ${universe.length} stocks × ${rebal.length} monthly rebalances`);

const rows = [];
for (const d0 of rebal) {
  const d1 = days[days.indexOf(d0) + HOLD];
  const monthRows = (await pool(universe, 12, async (t) => {
    const bars = (await stockDaily(t, "2024-08-01", "2026-09-27")) ?? [];
    const i = bars.findIndex((b) => b.date === d0);
    if (i < 21) return null;
    const S = bars[i].c;
    const hv = stdev(bars.slice(i - 20, i + 1).map((b, k, a) => (k ? Math.log(b.c / a[k - 1].c) : 0)).slice(1)) * Math.sqrt(252);
    const chain = await listContracts(t, { asOf: d0, expGte: addDays(d0, 24), expLte: addDays(d0, 45), strikeGte: +(S * 0.85).toFixed(2), strikeLte: +(S * 1.15).toFixed(2) });
    if (!chain.length) return null;
    const expiry = chain.map((c) => c.expiry).sort((a, b) => Math.abs(Date.parse(a) - Date.parse(d0) - 30 * 864e5) - Math.abs(Date.parse(b) - Date.parse(d0) - 30 * 864e5))[0];
    const ks = [...new Set(chain.filter((c) => c.expiry === expiry).map((c) => c.strike))];
    const K = ks.reduce((b, k) => (Math.abs(k - S) < Math.abs(b - S) ? k : b), ks[0]);
    const call = chain.find((c) => c.expiry === expiry && c.strike === K && c.type === "call"), put = chain.find((c) => c.expiry === expiry && c.strike === K && c.type === "put");
    if (!call || !put) return null;
    const [cb, pb] = await Promise.all([optionDaily(call.ticker, d0, d1), optionDaily(put.ticker, d0, d1)]);
    const ok = (b, d) => b[d] && b[d].v >= 20;
    if (!ok(cb, d0) || !ok(pb, d0) || !cb[d1] || !pb[d1]) return null;
    const T = (Date.parse(expiry) - Date.parse(d0)) / (365 * 864e5);
    const straddle0 = cb[d0].c + pb[d0].c, straddle1 = cb[d1].c + pb[d1].c;
    const iv = straddle0 / (0.8 * S * Math.sqrt(T));
    return { t, d0, hv, iv, ratio: hv / iv, straddle0, straddle1 };
  })).filter(Boolean);
  const cut = quantile(monthRows.map((r) => r.ratio), 0.9);
  for (const r of monthRows) rows.push({ ...r, topDecile: r.ratio >= cut, rets: Object.fromEntries(COSTS.map((h) => [h, (r.straddle1 * (1 - h)) / (r.straddle0 * (1 + h)) - 1])) });
  process.stdout.write(`${d0}: ${monthRows.length} priced; `);
}
fs.writeFileSync(path.join(CACHE, "bt-cheap-vol.json"), JSON.stringify(rows));
console.log("\n");
for (const h of COSTS) {
  console.log(`=== half-spread ${pct(h)} ===`);
  console.log(fmtSummary("all straddles (baseline)", summarize(rows.map((r) => r.rets[h]))));
  console.log(fmtSummary("top decile HV/IV (cheap options)", summarize(rows.filter((r) => r.topDecile).map((r) => r.rets[h]))));
  console.log(fmtSummary("bottom 50% HV/IV", summarize(rows.filter((r) => r.ratio < quantile(rows.map((x) => x.ratio), 0.5)).map((r) => r.rets[h]))));
}
