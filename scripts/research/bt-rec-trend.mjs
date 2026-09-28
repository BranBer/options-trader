// Backtest F: the owner's April playbook as rules. Take the dashboard's recommended direction only when QQQ's trend
// agrees (close above its 10-day average for calls, below for puts); buy the single call/put nearest the money
// expiring 7–21 days out (closest to 10); enter at that session's close; exit at +100%, −50%, or after 5 sessions.
// Rules were fixed before this test was run. Usage: node scripts/research/bt-rec-trend.mjs
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { stockDaily, pool, summarize, fmtSummary, toNyDate, nyMinutes, CACHE, mean } from "./lib.mjs";
import { simulateSingleLeg } from "./sim-single-leg.mjs";


const qqq = await stockDaily("QQQ", "2026-02-01", "2026-09-27");
const days = qqq.map((b) => b.date);
const qqqTrend = new Map(qqq.map((b, i) => [b.date, i >= 9 ? b.c - mean(qqq.slice(i - 9, i + 1).map((x) => x.c)) : null]));

const db = new Database("data/dashboard.db", { readonly: true });
const seen = new Set();
const recs = [];
for (const r of db.prepare("select output, source, created_at from analyses where type = 'trade_recommendation' order by id").all()) {
  let o;
  try { o = JSON.parse(r.output); } catch { continue; }
  const ticker = String(o?.ticker ?? "").toUpperCase();
  if (!/^[A-Z]{1,5}$/.test(ticker) || !["bullish", "bearish"].includes(o.direction)) continue;
  const ms = Date.parse(r.created_at.replace(" ", "T") + "Z");
  let i = days.findIndex((d) => d >= toNyDate(ms));
  if (i < 0) continue;
  if (days[i] === toNyDate(ms) && nyMinutes(ms) >= 16 * 60) i++; // after the close → next session's close
  const key = `${ticker}|${days[i]}|${r.source ?? "whale"}`;
  if (!days[i] || seen.has(key)) continue;
  seen.add(key);
  recs.push({ ticker, dir: o.direction, source: r.source ?? "whale_pipeline", day: days[i], i });
}

const results = [];
const skip = {};
await pool(recs, 8, async (rec) => {
  const trend = qqqTrend.get(rec.day);
  if (trend == null) return (skip["no QQQ trend"] = (skip["no QQQ trend"] ?? 0) + 1);
  const stockCloses = new Map(((await stockDaily(rec.ticker, "2026-02-01", "2026-09-27")) ?? []).map((b) => [b.date, b.c]));
  const r = await simulateSingleLeg({ ticker: rec.ticker, dir: rec.dir, day: rec.day, days, stockCloses });
  if (r.skip) return (skip[r.skip] = (skip[r.skip] ?? 0) + 1);
  results.push({ ...rec, ...r, tideAgrees: rec.dir === "bullish" ? trend > 0 : trend < 0 });
});
fs.writeFileSync(path.join(CACHE, "bt-rec-trend.json"), JSON.stringify(results));

console.log(`recs (unique ticker/day/source, bullish or bearish): ${recs.length}; traded: ${results.length}; skipped: ${JSON.stringify(skip)}`);
console.log(`date range: ${results.map((r) => r.day).sort()[0]} → ${results.map((r) => r.day).sort().at(-1)}\n`);
const show = (label, f) => console.log(fmtSummary(label, summarize(results.filter(f).map((r) => r.ret))));
show("tide agrees (THE STRATEGY)", (r) => r.tideAgrees);
show("tide against (skipped by the rule)", (r) => !r.tideAgrees);
show("every rec, no filter", () => true);
show("  strategy: bullish", (r) => r.tideAgrees && r.dir === "bullish");
show("  strategy: bearish", (r) => r.tideAgrees && r.dir === "bearish");
show("  strategy: whale_pipeline recs", (r) => r.tideAgrees && r.source === "whale_pipeline");
show("  strategy: event_ticker recs", (r) => r.tideAgrees && r.source === "event_ticker");
const reasons = results.filter((r) => r.tideAgrees).reduce((m, r) => ((m[r.reason] = (m[r.reason] ?? 0) + 1), m), {});
console.log(`\nexit reasons (strategy): ${JSON.stringify(reasons)}`);
const byMonth = {};
for (const r of results.filter((x) => x.tideAgrees)) (byMonth[r.day.slice(0, 7)] ??= []).push(r.ret);
for (const [m, xs] of Object.entries(byMonth).sort()) console.log(fmtSummary(`  strategy entered ${m}`, summarize(xs)));
