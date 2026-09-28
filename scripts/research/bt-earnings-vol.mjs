// Backtest C: earnings-volatility strategies on large caps, Oct 2024 → Sep 2026 (Massive daily option closes).
//   C2  long ATM straddle, entry close t-5 (and t-3) → exit close t-1 (never holds through the print)
//   C1  short ATM straddle, entry close t-1 → exit close t0 (reaction day); plus defined-risk iron fly
// t0 = first session trading on the news. Expiry = first listed expiry ≥ t0. Legs need volume ≥ MIN_VOL on
// entry and exit days (a real trader wouldn't trade dead strikes; stale closes are the main data risk).
// Usage: node scripts/research/bt-earnings-vol.mjs   (needs data/cache/earnings-events.json)
import fs from "node:fs";
import path from "node:path";
import { listContracts, optionDaily, pool, summarize, fmtSummary, CACHE, pct, mean, median } from "./lib.mjs";

const MIN_VOL = 20;
const COSTS = [0, 0.02, 0.04]; // half-spread per leg per side, as a fraction of the option price
const events = JSON.parse(fs.readFileSync(path.join(CACHE, "earnings-events.json"), "utf8"));
const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

const results = [];
const skip = {};
const bump = (k) => (skip[k] = (skip[k] ?? 0) + 1);

await pool(events, 10, async (ev) => {
  const S5 = ev.closeTm5;
  const contracts = await listContracts(ev.ticker, {
    asOf: ev.tm5,
    expGte: ev.t0,
    expLte: addDays(ev.t0, 14),
    strikeGte: +(S5 * 0.6).toFixed(2),
    strikeLte: +(S5 * 1.4).toFixed(2),
  });
  if (!contracts.length) return bump("no contracts");
  const expiry = contracts.map((c) => c.expiry).sort()[0];
  const chain = contracts.filter((c) => c.expiry === expiry);
  const strikes = [...new Set(chain.map((c) => c.strike))].filter((k) => chain.some((c) => c.strike === k && c.type === "call") && chain.some((c) => c.strike === k && c.type === "put")).sort((a, b) => a - b);
  if (strikes.length < 5) return bump("thin chain");
  const tk = (type, k) => chain.find((c) => c.type === type && c.strike === k)?.ticker;
  const nearest = (x) => strikes.reduce((b, k) => (Math.abs(k - x) < Math.abs(b - x) ? k : b), strikes[0]);
  const bars = async (t) => (t ? optionDaily(t, ev.tm5, ev.tp1) : {});
  const px = (b, d) => (b[d] && b[d].v >= MIN_VOL ? b[d].c : null);
  const r = { ticker: ev.ticker, t0: ev.t0, timing: ev.timing, expiry, dteAtT0: Math.round((Date.parse(expiry) - Date.parse(ev.t0)) / 864e5), moveT0: ev.moveT0 };

  // --- C2: long straddle run-up (t-5 and t-3 entries) ---
  for (const [label, d, S] of [["c2_t5", ev.tm5, ev.closeTm5], ["c2_t3", ev.tm3, ev.closeTm3]]) {
    const K = nearest(S);
    const [cb, pb] = await Promise.all([bars(tk("call", K)), bars(tk("put", K))]);
    const c0 = px(cb, d), p0 = px(pb, d), c1 = px(cb, ev.tm1), p1 = px(pb, ev.tm1);
    if ([c0, p0, c1, p1].some((x) => x == null)) {
      bump(`${label} illiquid`);
      continue;
    }
    r[label] = Object.fromEntries(COSTS.map((h) => [h, ((c1 + p1) * (1 - h)) / ((c0 + p0) * (1 + h)) - 1]));
  }

  // --- C1: short straddle + iron fly through the print (t-1 close → t0 close) ---
  const S1 = ev.closeTm1;
  const K = nearest(S1);
  const [cb, pb] = await Promise.all([bars(tk("call", K)), bars(tk("put", K))]);
  const c0 = px(cb, ev.tm1), p0 = px(pb, ev.tm1);
  const atExpiry = expiry === ev.t0;
  const settle = (type, k) => Math.max(0, type === "call" ? ev.closeT0 - k : k - ev.closeT0);
  const c1 = atExpiry ? settle("call", K) : px(cb, ev.t0);
  const p1 = atExpiry ? settle("put", K) : px(pb, ev.t0);
  if ([c0, p0, c1, p1].some((x) => x == null)) return bump("c1 illiquid"), results.push(r);
  const straddle = c0 + p0;
  r.impliedMove = straddle / S1;
  r.c1_short = Object.fromEntries(COSTS.map((h) => {
    const credit = straddle * (1 - h), debit = atExpiry ? c1 + p1 : (c1 + p1) * (1 + h);
    return [h, (credit - debit) / credit]; // return on premium collected
  }));
  // Iron fly: wings ≈ 1.25 × implied move away (nearest listed strikes at/beyond)
  const up = strikes.find((k) => k >= K + 1.25 * straddle), dn = [...strikes].reverse().find((k) => k <= K - 1.25 * straddle);
  if (up && dn) {
    const [cwb, pwb] = await Promise.all([bars(tk("call", up)), bars(tk("put", dn))]);
    const cw0 = px(cwb, ev.tm1), pw0 = px(pwb, ev.tm1);
    const cw1 = atExpiry ? settle("call", up) : px(cwb, ev.t0), pw1 = atExpiry ? settle("put", dn) : px(pwb, ev.t0);
    if ([cw0, pw0, cw1, pw1].every((x) => x != null)) {
      const width = Math.max(up - K, K - dn);
      r.c1_fly = Object.fromEntries(COSTS.map((h) => {
        const credit = (c0 + p0) * (1 - h) - (cw0 + pw0) * (1 + h);
        const close = atExpiry ? c1 + p1 - cw1 - pw1 : (c1 + p1) * (1 + h) - (cw1 + pw1) * (1 - h);
        const maxLoss = width - credit;
        return [h, maxLoss > 0 ? (credit - close) / maxLoss : null]; // return on capital at risk
      }));
    } else bump("fly wings illiquid");
  } else bump("fly no wings");
  results.push(r);
});

// Historical average |earnings move| per ticker using ONLY earlier events (no look-ahead) → cheap/rich implied move
results.sort((a, b) => a.t0.localeCompare(b.t0));
const hist = new Map();
for (const r of results) {
  const past = hist.get(r.ticker) ?? [];
  if (past.length >= 2 && r.impliedMove) r.richness = r.impliedMove / mean(past);
  hist.set(r.ticker, [...past, Math.abs(r.moveT0)]);
}
fs.writeFileSync(path.join(CACHE, "bt-earnings-vol.json"), JSON.stringify(results));

console.log(`events: ${events.length}, evaluated: ${results.length}; skips: ${JSON.stringify(skip)}`);
console.log(`median implied move at t-1: ${pct(median(results.map((r) => r.impliedMove).filter(Boolean)))}, median realized |move t0|: ${pct(median(results.map((r) => Math.abs(r.moveT0))))}`);
const years = (r) => (r.t0 < "2025-10-01" ? "Y1 (Oct24-Sep25)" : "Y2 (Oct25-Sep26)");
for (const h of COSTS) {
  console.log(`\n=== half-spread ${pct(h)} per leg per side ===`);
  for (const k of ["c2_t5", "c2_t3", "c1_short", "c1_fly"]) {
    const xs = results.map((r) => r[k]?.[h]).filter((x) => x != null);
    console.log(fmtSummary(k, summarize(xs)));
  }
  if (h !== 0.02) continue;
  for (const k of ["c2_t5", "c1_short", "c1_fly"]) {
    for (const y of ["Y1 (Oct24-Sep25)", "Y2 (Oct25-Sep26)"]) console.log(fmtSummary(`  ${k} ${y}`, summarize(results.filter((r) => years(r) === y).map((r) => r[k]?.[h]).filter((x) => x != null))));
    const withR = results.filter((r) => r.richness != null && r[k]?.[h] != null);
    const cut = median(withR.map((r) => r.richness));
    console.log(fmtSummary(`  ${k} implied move RICH vs own history`, summarize(withR.filter((r) => r.richness >= cut).map((r) => r[k][h]))));
    console.log(fmtSummary(`  ${k} implied move CHEAP vs own history`, summarize(withR.filter((r) => r.richness < cut).map((r) => r[k][h]))));
  }
}
