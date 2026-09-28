// Where did the experiment's P&L come from? For every option position in the Robinhood export:
// the stock's and QQQ's move over the exact holding minutes (the "tide" test), whether the dashboard had a
// same-direction recommendation or whale alert beforehand, DTE and holding time, and what holding to expiry
// would have paid. Usage: node scripts/research/rh-trade-analysis.mjs rh-history.html 2026
// Stock minute bars come from Massive at ≤5 calls/min (plan limit), cached, so the first run is slow.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { cached, massive, sleep, stockDaily, median, pct, CACHE } from "./lib.mjs";
import { parseRobinhoodHistory, buildPositions, nyTime } from "./rh-parse.mjs";

const YEAR = Number(process.argv[3] ?? 2026);
const parsed = parseRobinhoodHistory(process.argv[2] ?? "rh-history.html", YEAR);
const closeOn = async (t, d) => ((await stockDaily(t, `${YEAR}-01-01`, `${YEAR}-12-31`)) ?? []).find((b) => b.date === d)?.c ?? null;
const positions = (await buildPositions(parsed, closeOn)).filter((p) => !p.preExport && p.entry && p.exit && p.openUnits === 0);

let lastCall = 0;
const minutes = (ticker, day) =>
  cached("stock-minute", `${ticker}|${day}`, async () => {
    const wait = lastCall + 12_500 - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    const j = await massive(`/v2/aggs/ticker/${ticker}/range/1/minute/${day}/${day}?adjusted=true&sort=asc&limit=50000`, { cache: false });
    if (typeof j.status === "number") return undefined; // lib.massive's error shape; don't cache failures
    return (j.results ?? []).map((b) => [b.t, b.o, b.c]);
  });
const priceAt = async (ticker, date, hhmm) => {
  const bars = (await minutes(ticker, date)) ?? [];
  const T = nyTime(date, hhmm);
  const before = bars.filter(([t]) => t + 60_000 <= T).at(-1);
  return before?.[2] ?? bars.find(([t]) => t >= T)?.[1] ?? null;
};

const db = new Database("data/dashboard.db", { readonly: true });
const recs = db.prepare("select output, created_at from analyses where type = 'trade_recommendation'").all().flatMap((r) => {
  try {
    const o = JSON.parse(r.output);
    return [{ ticker: String(o.ticker ?? "").toUpperCase(), dir: o.direction, t: Date.parse(r.created_at.replace(" ", "T") + "Z") }];
  } catch {
    return [];
  }
});
const whales = db.prepare("select ticker, call_put, detected_at from whale_alerts").all().map((w) => ({ ...w, t: Date.parse(w.detected_at) }));

const pairs = new Set();
for (const p of positions) for (const d of [p.entry.date, p.exit.date]) pairs.add(`${p.und}|${d}`).add(`QQQ|${d}`);
console.log(`positions: ${positions.length}; stock-minute series needed: ${pairs.size} (uncached ones take ~12.5 s each)`);

const rows = [];
for (const p of positions) {
  const t0 = nyTime(p.entry.date, p.entry.time);
  const [s0, s1, q0, q1] = await Promise.all([
    priceAt(p.und, p.entry.date, p.entry.time),
    priceAt(p.und, p.exit.date, p.exit.time),
    priceAt("QQQ", p.entry.date, p.entry.time),
    priceAt("QQQ", p.exit.date, p.exit.time),
  ]);
  const sign = p.cp === "C" ? 1 : -1;
  const want = p.cp === "C" ? "bullish" : "bearish";
  const within = (t, hours) => t <= t0 && t >= t0 - hours * 3_600_000;
  const expS = await closeOn(p.und, p.expiry);
  const holdToExpiry = expS == null ? null : (Math.max(0, p.cp === "C" ? expS - p.strike : p.strike - expS) - p.avgIn) * p.bought * 100;
  rows.push({
    ...p,
    month: p.entry.date.slice(0, 7) <= "2026-04" ? "Mar 27 – Apr 30" : "May",
    dte: Math.round((Date.parse(p.expiry) - Date.parse(p.entry.date)) / 864e5),
    holdMin: Math.round((nyTime(p.exit.date, p.exit.time) - t0) / 60_000),
    stockMove: s0 && s1 ? sign * (s1 / s0 - 1) : null,
    qqqMove: q0 && q1 ? sign * (q1 / q0 - 1) : null,
    moneyness: s0 ? sign * (p.strike / s0 - 1) : null,
    dashboardRec: recs.some((r) => r.ticker === p.und && r.dir === want && within(r.t, 48)),
    whaleSameSide: whales.some((w) => w.ticker === p.und && w.call_put === p.cp && within(w.t, 24)),
    cost: p.avgIn * p.bought * 100,
    holdToExpiry,
  });
}
fs.writeFileSync(path.join(CACHE, "rh-trade-analysis.json"), JSON.stringify(rows, null, 1));

const usd = (x) => `${x >= 0 ? "+" : "−"}$${Math.abs(x).toFixed(0)}`;
const line = (label, xs) => {
  if (!xs.length) return console.log(`${label.padEnd(46)} n=0`);
  const pnl = xs.reduce((s, r) => s + r.pnl, 0);
  const wins = xs.filter((r) => r.pnl > 0).length;
  console.log(`${label.padEnd(46)} n=${String(xs.length).padStart(3)}  P&L ${usd(pnl).padStart(7)}  win ${pct(wins / xs.length, 0).padStart(4)}  median ret ${pct(median(xs.map((r) => r.ret))).padStart(7)}  avg cost $${(xs.reduce((s, r) => s + r.cost, 0) / xs.length).toFixed(0)}`);
};
console.log("\n=== P&L by slice ===");
line("ALL positions", rows);
for (const m of ["Mar 27 – Apr 30", "May"]) line(`entered ${m}`, rows.filter((r) => r.month === m));
line("calls", rows.filter((r) => r.cp === "C"));
line("puts", rows.filter((r) => r.cp === "P"));
line("0-1 DTE at entry", rows.filter((r) => r.dte <= 1));
line("2-5 DTE", rows.filter((r) => r.dte >= 2 && r.dte <= 5));
line("6+ DTE", rows.filter((r) => r.dte >= 6));
line("closed same day", rows.filter((r) => r.exit.date === r.entry.date));
line("held overnight or longer", rows.filter((r) => r.exit.date !== r.entry.date));
line("stock moved your way during the hold", rows.filter((r) => r.stockMove > 0));
line("stock moved against you", rows.filter((r) => r.stockMove != null && r.stockMove <= 0));
line("QQQ moved your way (the tide)", rows.filter((r) => r.qqqMove > 0));
line("QQQ moved against you", rows.filter((r) => r.qqqMove != null && r.qqqMove <= 0));
line("stock beat QQQ in your direction (picking)", rows.filter((r) => r.stockMove != null && r.qqqMove != null && r.stockMove > r.qqqMove));
line("stock lagged QQQ in your direction", rows.filter((r) => r.stockMove != null && r.qqqMove != null && r.stockMove <= r.qqqMove));
line("dashboard rec, same direction, ≤48h before", rows.filter((r) => r.dashboardRec));
line("no matching dashboard rec", rows.filter((r) => !r.dashboardRec));
line("whale alert, same side, ≤24h before", rows.filter((r) => r.whaleSameSide));
line("no matching whale alert", rows.filter((r) => !r.whaleSameSide));

const withCf = rows.filter((r) => r.holdToExpiry != null);
console.log(`\nHolding every position to expiry instead: ${usd(withCf.reduce((s, r) => s + r.holdToExpiry, 0))} vs actual ${usd(withCf.reduce((s, r) => s + r.pnl, 0))} (n=${withCf.length})`);
const big = [...rows].sort((a, b) => b.pnl - a.pnl);
console.log("\nTop 5 winners:", big.slice(0, 5).map((r) => `${r.key} ${usd(r.pnl)} (stock ${pct(r.stockMove)}, QQQ ${pct(r.qqqMove)} your way)`).join(" | "));
console.log("Top 5 losers:", big.slice(-5).map((r) => `${r.key} ${usd(r.pnl)} (stock ${pct(r.stockMove)}, QQQ ${pct(r.qqqMove)} your way)`).join(" | "));
