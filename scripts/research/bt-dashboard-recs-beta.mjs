// Beta-adjusted, cluster-robust check of Backtest A's directional skill.
// excess_beta = sign × (r_stock − β·r_SPY), β from 60 sessions of daily returns BEFORE entry.
// Clustered: average within (ticker, ISO week) first, so overlapping calls count once.
import fs from "node:fs";
import { stockDaily, summarize, fmtSummary, pct, mean } from "./lib.mjs";
const res = JSON.parse(fs.readFileSync("data/cache/bt-dashboard-recs.json", "utf8"));
const spy = await stockDaily("SPY", "2025-09-01", "2026-09-27");
const days = spy.map((b) => b.date), spyC = new Map(spy.map((b) => [b.date, b.c]));
const rets = (m, ds) => ds.slice(1).map((d, k) => m.get(d) / m.get(ds[k]) - 1);
const rows = [];
for (const r of res) {
  if (r.direction === "neutral") continue;
  const u = (await stockDaily(r.ticker, "2025-09-01", "2026-09-27")) ?? [];
  const uc = new Map(u.map((b) => [b.date, b.c]));
  const i = days.indexOf(r.entryDay);
  const win = days.slice(i - 60, i + 1).filter((d) => uc.has(d));
  if (win.length < 40) continue;
  const rs = rets(uc, win), rm = rets(spyC, win);
  const mm = mean(rm), ms = mean(rs);
  const beta = rs.reduce((s, x, k) => s + (x - ms) * (rm[k] - mm), 0) / rm.reduce((s, x) => s + (x - mm) ** 2, 0);
  const j = Math.min(i + 5, days.length - 1);
  const s5 = uc.get(days[j]) / uc.get(days[i]) - 1, m5 = spyC.get(days[j]) / spyC.get(days[i]) - 1;
  if (!Number.isFinite(s5)) continue;
  const sign = r.direction === "bullish" ? 1 : -1;
  const d = new Date(r.entryDay + "T12:00:00Z");
  const week = `${d.getUTCFullYear()}-${Math.ceil(((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 864e5 + 1) / 7)}`;
  rows.push({ ...r, beta, xb: sign * (s5 - beta * m5), cluster: `${r.ticker}|${week}|${r.direction}` });
}
console.log(`median beta of recommended names: ${[...rows.map((r) => r.beta)].sort((a, b) => a - b)[rows.length >> 1].toFixed(2)}`);
console.log(fmtSummary("beta-adj signed excess (all calls)", summarize(rows.map((r) => r.xb))));
const clusters = {};
for (const r of rows) (clusters[r.cluster] ??= []).push(r.xb);
console.log(fmtSummary("beta-adj, clustered by ticker-week", summarize(Object.values(clusters).map(mean))));
for (const [label, f] of [["bullish", (r) => r.direction === "bullish"], ["bearish", (r) => r.direction === "bearish"], ["whale_pipeline", (r) => r.source === "whale_pipeline"], ["event_ticker", (r) => r.source === "event_ticker"]]) {
  const g = {};
  for (const r of rows.filter(f)) (g[r.cluster] ??= []).push(r.xb);
  console.log(fmtSummary(`  clustered: ${label}`, summarize(Object.values(g).map(mean))));
}
