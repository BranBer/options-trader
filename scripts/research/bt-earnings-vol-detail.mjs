// Detail for Backtest C's short-vol legs: by earnings season, by implied-move size, tails.
import fs from "node:fs";
import { summarize, fmtSummary, quantile, pct } from "./lib.mjs";
const res = JSON.parse(fs.readFileSync("data/cache/bt-earnings-vol.json", "utf8"));
const season = (d) => (d < "2025-01-01" ? "S1 Oct-Dec 2024" : d < "2025-04-01" ? "S2 Jan-Mar 2025" : "S3 Apr-Jun 2025");
for (const k of ["c1_short", "c1_fly"]) {
  console.log(`\n### ${k} @ 2% half-spread`);
  for (const s of ["S1 Oct-Dec 2024", "S2 Jan-Mar 2025", "S3 Apr-Jun 2025"])
    console.log(fmtSummary(`  ${s}`, summarize(res.filter((r) => season(r.t0) === s && r[k]?.[0.02] != null).map((r) => r[k][0.02]))));
  const withIm = res.filter((r) => r.impliedMove && r[k]?.[0.02] != null);
  const q = [quantile(withIm.map((r) => r.impliedMove), 1 / 3), quantile(withIm.map((r) => r.impliedMove), 2 / 3)];
  for (const [lab, f] of [[`implied move < ${pct(q[0])}`, (r) => r.impliedMove < q[0]], [`implied move ${pct(q[0])}-${pct(q[1])}`, (r) => r.impliedMove >= q[0] && r.impliedMove < q[1]], [`implied move >= ${pct(q[1])}`, (r) => r.impliedMove >= q[1]]])
    console.log(fmtSummary(`  ${lab}`, summarize(withIm.filter(f).map((r) => r[k][0.02]))));
  const xs = res.map((r) => r[k]?.[0.02]).filter((x) => x != null);
  console.log(`  tails: p1=${pct(quantile(xs, 0.01))} p5=${pct(quantile(xs, 0.05))} p10=${pct(quantile(xs, 0.1))} p50=${pct(quantile(xs, 0.5))} p90=${pct(quantile(xs, 0.9))} worst=${pct(Math.min(...xs))}`);
}
const both = res.filter((r) => r.impliedMove);
console.log(`\nrealized/implied move ratio: median ${quantile(both.map((r) => Math.abs(r.moveT0) / r.impliedMove), 0.5).toFixed(2)}, share of events where the stock moved MORE than implied: ${pct(both.filter((r) => Math.abs(r.moveT0) > r.impliedMove).length / both.length)}`);
