// Follow-up to Backtest A: is there directional skill beyond market beta?
// Signed excess return = direction × (stock 5-session return − SPY 5-session return), same window.
import fs from "node:fs";
import { stockDaily, summarize, fmtSummary, pct } from "./lib.mjs";
const res = JSON.parse(fs.readFileSync("data/cache/bt-dashboard-recs.json", "utf8"));
const spy = await stockDaily("SPY", "2026-03-01", "2026-09-27");
const days = spy.map((b) => b.date), spyC = new Map(spy.map((b) => [b.date, b.c]));
const rows = [];
for (const r of res) {
  if (r.direction === "neutral") continue;
  const i = days.indexOf(r.entryDay), j = Math.min(i + 5, days.length - 1);
  const u = (await stockDaily(r.ticker, "2026-03-01", "2026-09-27")) ?? [];
  const uc = new Map(u.map((b) => [b.date, b.c]));
  const s = uc.get(days[j]) / uc.get(days[i]) - 1, m = spyC.get(days[j]) / spyC.get(days[i]) - 1;
  if (!Number.isFinite(s) || !Number.isFinite(m)) continue;
  const sign = r.direction === "bullish" ? 1 : -1;
  rows.push({ ...r, raw: sign * s, excess: sign * (s - m), up: s > m });
}
console.log(fmtSummary("signed raw 5d stock return (all)", summarize(rows.map((r) => r.raw))));
console.log(fmtSummary("signed EXCESS vs SPY (all)", summarize(rows.map((r) => r.excess))));
for (const src of ["whale_pipeline", "event_ticker"]) console.log(fmtSummary(`signed EXCESS vs SPY (${src})`, summarize(rows.filter((r) => r.source === src).map((r) => r.excess))));
for (const d of ["bullish", "bearish"]) {
  const g = rows.filter((r) => r.direction === d);
  const hits = g.filter((r) => r.excess > 0).length;
  console.log(`${d}: n=${g.length}, beat-SPY-in-called-direction ${hits}/${g.length} = ${pct(hits / g.length)}`);
}
const spy5 = days.slice(0, -5).map((d, i) => spyC.get(days[i + 5]) / spyC.get(d) - 1).filter((x, i) => days[i] >= "2026-04-01" && days[i] <= "2026-06-05");
console.log(`SPY 5-session return over Apr 1–Jun 5 2026: mean ${pct(spy5.reduce((a, b) => a + b, 0) / spy5.length, 2)}, up ${pct(spy5.filter((x) => x > 0).length / spy5.length)}`);
console.log(`SPY Apr 1 → Jun 5 2026: ${pct(spyC.get(days.find((d) => d >= "2026-06-05")) / spyC.get(days.find((d) => d >= "2026-04-01")) - 1)}`);
