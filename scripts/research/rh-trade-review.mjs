// Robinhood trade review: parse the saved History page (HTML), pair option opens/closes/expirations into round
// trips, and check each fill against market data (DTE, moneyness, where it sat in the day's range, what the
// contract did afterwards). Usage: node scripts/research/rh-trade-review.mjs rh-history.html
// Get the HTML with scripts/research/rh-history-collector.js (runs in your logged-in browser's DevTools console).
import { occ, optionDaily, stockDaily, pct } from "./lib.mjs";
import { parseRobinhoodHistory, buildPositions } from "./rh-parse.mjs";

const YEAR = Number(process.argv[3] ?? new Date().getFullYear());
const parsed = parseRobinhoodHistory(process.argv[2] ?? "rh-history.html", YEAR);
const { items, orders, expirations } = parsed;
const dates = orders.map((o) => o.date).sort();
console.log(`activity items: ${items.length}; filled option orders: ${orders.length}; expirations: ${expirations.length}; range ${dates[0]} → ${dates.at(-1)}`);

const closeOn = async (t, d) => ((await stockDaily(t, `${YEAR}-01-01`, `${YEAR}-12-31`)) ?? []).find((b) => b.date === d)?.c ?? null;
const positions = await buildPositions(parsed, closeOn);
const usd = (x) => `${x >= 0 ? "+" : "−"}$${Math.abs(x).toFixed(0)}`;
let net = 0;
console.log("\ncontract                  bought  avg in   sold  avg out  expired   P&L of contracts opened in this export");
for (const p of positions) {
  if (p.pnl != null) net += p.pnl;
  const cell = p.preExport
    ? "opened before this export"
    : `${usd(p.pnl)}${p.settled ? ` (${p.settled} settled at expiry value, no expiration record)` : ""}${p.openUnits ? ` (${p.openUnits} still open)` : ""}`;
  console.log(`${p.key.padEnd(25)} ${String(p.bought).padStart(6)}  ${p.avgIn != null ? p.avgIn.toFixed(2).padStart(6) : "     -"}  ${String(p.sold).padStart(5)}  ${(p.avgOut != null ? p.avgOut.toFixed(2) : "-").padStart(7)}  ${String(p.expired).padStart(7)}   ${cell}`);
}
console.log(`net P&L of contracts opened in this export: ${usd(net)}`);

// ---- each fill vs the market ----
console.log("\nside  contract                 filled        qty   price  DTE  moneyness   fill in day's range   next close  best close→expiry  expiry value");
for (const o of orders) {
  const bars = await optionDaily(occ(o.und, o.expiry, o.cp, o.strike), o.date, o.expiry);
  const u = new Map(((await stockDaily(o.und, `${YEAR}-01-01`, `${YEAR}-12-31`)) ?? []).map((b) => [b.date, b.c]));
  const day = bars[o.date], later = Object.entries(bars).filter(([d]) => d > o.date).map(([, b]) => b.c);
  const S = u.get(o.date), uExp = u.get(o.expiry);
  const mny = S ? (o.cp === "C" ? o.strike / S - 1 : 1 - o.strike / S) : null;
  const expVal = uExp ? Math.max(0, o.cp === "C" ? uExp - o.strike : o.strike - uExp) : null;
  const pos = day && day.h > day.l ? pct((o.px - day.l) / (day.h - day.l), 0) : "n/a";
  console.log(
    `${o.side.padEnd(5)} ${`${o.und} ${o.strike}${o.cp} ${o.expiry.slice(5)}`.padEnd(24)} ${`${o.date.slice(5)} ${o.time}`.padEnd(13)} ${String(o.qty).padStart(3)}  ${o.px.toFixed(2).padStart(6)}  ${String(Math.round((Date.parse(o.expiry) - Date.parse(o.date)) / 864e5)).padStart(3)}  ${mny == null ? "       n/a" : `${pct(Math.abs(mny))} ${mny > 0 ? "OTM" : "ITM"}`.padStart(10)}   ${pos.padStart(6)} (${day ? `${day.l}-${day.h}` : "n/a"})`.padEnd(112) +
      `${later[0]?.toFixed(2) ?? "n/a"}`.padEnd(12) + `${later.length ? Math.max(...later).toFixed(2) : "n/a"}`.padEnd(19) + `${expVal?.toFixed(2) ?? "n/a"}`,
  );
}
