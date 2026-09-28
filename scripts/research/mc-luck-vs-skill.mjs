// Monte Carlo: how often does a ZERO-EDGE short-dated option strategy triple an account in a month, and how
// often does it halve it? Per-trade returns are resampled from Backtest D's real "follow the whale" 3-day
// outcomes (2.5% half-spread), re-centred to a chosen mean. 20 sequential trades ≈ one month.
import fs from "node:fs";
import { rng, mean, quantile, pct } from "./lib.mjs";
const raw = JSON.parse(fs.readFileSync("data/cache/bt-follow-whales.json", "utf8")).map((r) => r.byCost[0.025].d3).filter((x) => Number.isFinite(x));
const m0 = mean(raw);
const TRADES = 20, PATHS = 200_000, rand = rng(11);
console.log(`empirical per-trade returns: n=${raw.length}, mean ${pct(m0)}, median ${pct(quantile(raw, 0.5))}, P(lose>90%) ${pct(raw.filter((x) => x < -0.9).length / raw.length)}, P(>+100%) ${pct(raw.filter((x) => x > 1).length / raw.length)}`);
console.log("edge/trade  stake  P(≥3x in a month)  P(≥2x)  P(≤ -50%)  P(≤ -80%)  median end");
for (const edge of [0, -0.05]) {
  const xs = raw.map((x) => Math.max(-1, x - m0 + edge));
  for (const f of [0.1, 0.2, 0.33, 0.5]) {
    const ends = new Float64Array(PATHS);
    for (let p = 0; p < PATHS; p++) {
      let w = 1;
      for (let t = 0; t < TRADES; t++) w *= 1 + f * xs[Math.floor(rand() * xs.length)];
      ends[p] = w;
    }
    const arr = Array.from(ends);
    const P = (c) => pct(arr.filter(c).length / PATHS, 1);
    console.log(`${pct(edge, 0).padStart(9)}  ${pct(f, 0).padStart(5)}  ${P((w) => w >= 3).padStart(17)}  ${P((w) => w >= 2).padStart(6)}  ${P((w) => w <= 0.5).padStart(9)}  ${P((w) => w <= 0.2).padStart(9)}  ${pct(quantile(arr, 0.5) - 1).padStart(10)}`);
  }
}
