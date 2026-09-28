// One long call/put under the "rec-trend" rules, priced from daily closes: contract nearest the money expiring
// 7–21 days out (closest to 10), entered at the close of `day`, exited at +100% / −50% / 5 sessions / expiry.
// Shared by bt-rec-trend.mjs and bt-tide-baseline.mjs so both test exactly the same trade.
import { listContracts, optionDaily } from "./lib.mjs";

export const RULES = { H: 0.025, TP: 1.0, SL: -0.5, MAX_SESSIONS: 5, MIN_VOL: 20 };
const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** days: ascending session dates; stockCloses: Map date → close. Returns {ret, reason, expiry, strike} or {skip}. */
export async function simulateSingleLeg({ ticker, dir, day, days, stockCloses }) {
  const S = stockCloses.get(day);
  if (!S) return { skip: "no stock close" };
  const cp = dir === "bullish" ? "call" : "put";
  const chain = (
    await listContracts(ticker, { asOf: day, expGte: addDays(day, 7), expLte: addDays(day, 21), strikeGte: +(S * 0.9).toFixed(2), strikeLte: +(S * 1.1).toFixed(2) })
  ).filter((c) => c.type === cp);
  if (!chain.length) return { skip: "no chain" };
  const target = Date.parse(addDays(day, 10));
  const expiry = [...new Set(chain.map((c) => c.expiry))].sort((a, b) => Math.abs(Date.parse(a) - target) - Math.abs(Date.parse(b) - target))[0];
  const contract = chain.filter((c) => c.expiry === expiry).reduce((b, c) => (Math.abs(c.strike - S) < Math.abs(b.strike - S) ? c : b));
  const ob = await optionDaily(contract.ticker, day, expiry);
  if (!ob[day] || ob[day].v < RULES.MIN_VOL) return { skip: "illiquid" };
  const cost = ob[day].c * (1 + RULES.H);
  let last = ob[day].c;
  for (let k = days.indexOf(day) + 1, held = 1; k < days.length; k++, held++) {
    const d = days[k];
    if (d >= expiry) {
      const s = stockCloses.get(expiry) ?? stockCloses.get(d);
      if (s == null) return { skip: "no settlement" };
      return { ret: Math.max(0, cp === "call" ? s - contract.strike : contract.strike - s) / cost - 1, reason: "expiry", expiry, strike: contract.strike };
    }
    last = ob[d]?.c ?? last;
    const ret = (last * (1 - RULES.H)) / cost - 1;
    if (ret >= RULES.TP) return { ret, reason: "take-profit", expiry, strike: contract.strike };
    if (ret <= RULES.SL) return { ret, reason: "stop-loss", expiry, strike: contract.strike };
    if (held >= RULES.MAX_SESSIONS) return { ret, reason: "time-cap", expiry, strike: contract.strike };
  }
  return { skip: "no exit yet" };
}
