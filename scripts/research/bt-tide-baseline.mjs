// Backtest G: is Backtest F's edge the dashboard's picks or just the QQQ trend filter in one rally?
// Same contract/exit rules (sim-single-leg.mjs) on the 10 mega-caps the dashboard covered, every 5th session,
// Oct 2024 → Sep 2026, with NO dashboard input. Compares trend-following, calls-only-in-uptrends, and always-calls.
// Usage: node scripts/research/bt-tide-baseline.mjs
import fs from "node:fs";
import path from "node:path";
import { stockDaily, pool, summarize, fmtSummary, CACHE, mean } from "./lib.mjs";
import { simulateSingleLeg } from "./sim-single-leg.mjs";

const UNIVERSE = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "AMZN", "MSFT", "META", "GOOGL", "AMD"];
const qqq = await stockDaily("QQQ", "2024-09-01", "2026-09-27");
const days = qqq.map((b) => b.date);
const trend = new Map(qqq.map((b, i) => [b.date, i >= 9 ? b.c - mean(qqq.slice(i - 9, i + 1).map((x) => x.c)) : null]));
const entryDays = days.filter((d, i) => d >= "2024-10-15" && d <= "2026-09-01" && i % 5 === 0);
const closes = new Map();
for (const t of UNIVERSE) closes.set(t, new Map(((await stockDaily(t, "2024-09-01", "2026-09-27")) ?? []).map((b) => [b.date, b.c])));

const jobs = entryDays.flatMap((day) => UNIVERSE.flatMap((ticker) => ["bullish", "bearish"].map((dir) => ({ day, ticker, dir }))));
console.log(`simulations: ${jobs.length} (${entryDays.length} weekly entry days × ${UNIVERSE.length} tickers × call/put)`);
const results = (
  await pool(jobs, 10, async (j) => {
    const r = await simulateSingleLeg({ ...j, days, stockCloses: closes.get(j.ticker) });
    return r.skip ? null : { ...j, ...r, trendUp: trend.get(j.day) > 0 };
  })
).filter(Boolean);
fs.writeFileSync(path.join(CACHE, "bt-tide-baseline.json"), JSON.stringify(results));

const pick = (f) => results.filter(f).map((r) => r.ret);
const show = (label, f) => console.log(fmtSummary(label, summarize(pick(f))));
const follow = (r) => (r.trendUp ? r.dir === "bullish" : r.dir === "bearish");
console.log(`priced: ${results.length}\n`);
show("follow the QQQ trend (calls up / puts down)", follow);
show("calls only when QQQ trend is up (strategy, no dashboard)", (r) => r.dir === "bullish" && r.trendUp);
show("calls when QQQ trend is down", (r) => r.dir === "bullish" && !r.trendUp);
show("always calls (no filter)", (r) => r.dir === "bullish");
show("always puts (no filter)", (r) => r.dir === "bearish");
console.log("\nby half-year, calls only when trend is up:");
const half = (d) => `${d.slice(0, 4)} H${d.slice(5, 7) <= "06" ? 1 : 2}`;
for (const h of [...new Set(results.map((r) => half(r.day)))].sort()) show(`  ${h}`, (r) => half(r.day) === h && r.dir === "bullish" && r.trendUp);
console.log("\nby half-year, follow the trend both ways:");
for (const h of [...new Set(results.map((r) => half(r.day)))].sort()) show(`  ${h}`, (r) => half(r.day) === h && follow(r));
