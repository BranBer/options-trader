// Does the market's volatility regime (VIX at t−1) explain when earnings short-vol pays?
import fs from "node:fs";
import { stockDaily, summarize, fmtSummary, quantile } from "./lib.mjs";
const res = JSON.parse(fs.readFileSync("data/cache/bt-earnings-vol.json", "utf8"));
const events = JSON.parse(fs.readFileSync("data/cache/earnings-events.json", "utf8"));
const tm1 = new Map(events.map((e) => [`${e.ticker}|${e.t0}`, e.tm1]));
const vix = new Map(((await stockDaily("^VIX", "2024-08-01", "2026-09-27")) ?? []).map((b) => [b.date, b.c]));
const rows = res.map((r) => ({ ...r, vix: vix.get(tm1.get(`${r.ticker}|${r.t0}`)) })).filter((r) => r.vix);
const cuts = [quantile(rows.map((r) => r.vix), 1 / 3), quantile(rows.map((r) => r.vix), 2 / 3)];
console.log(`VIX terciles at t−1: < ${cuts[0].toFixed(1)} | ${cuts[0].toFixed(1)}–${cuts[1].toFixed(1)} | ≥ ${cuts[1].toFixed(1)}`);
const season = (d) => (d < "2025-01-01" ? "S1" : d < "2025-04-01" ? "S2" : "S3");
for (const k of ["c1_short", "c1_fly"]) {
  console.log(`\n### ${k} @ 2% half-spread (fly floored at −100%)`);
  const val = (r) => (k === "c1_fly" ? Math.max(-1, r[k][0.02]) : r[k][0.02]);
  const ok = rows.filter((r) => r[k]?.[0.02] != null);
  for (const [lab, f] of [["VIX low", (r) => r.vix < cuts[0]], ["VIX mid", (r) => r.vix >= cuts[0] && r.vix < cuts[1]], ["VIX high", (r) => r.vix >= cuts[1]]]) {
    console.log(fmtSummary(`  ${lab}`, summarize(ok.filter(f).map(val))));
    for (const s of ["S1", "S2", "S3"]) {
      const g = ok.filter((r) => f(r) && season(r.t0) === s);
      if (g.length >= 20) console.log(fmtSummary(`     ${lab} within ${s}`, summarize(g.map(val))));
    }
  }
  console.log(fmtSummary("  ALL (fly floored)", summarize(ok.map(val))));
}
