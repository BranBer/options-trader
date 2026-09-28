/**
 * Story S6 — strategy registry: metadata, evidence constants, live criteria,
 * status computation, and the pure per-strategy entry/exit math. Everything
 * here is a pure function over already-fetched numbers so it is testable
 * without network/DB — data fetching and DB writes live in run-desk.ts.
 */
import type {
  DeskStrategy,
  ForwardStats,
  LiveCriteria,
  StrategyEvidence,
  StrategyExecution,
  StrategyId,
  StrategyStatus,
} from "@/types/desk";

// ---------- registry metadata ----------

export const CONTROL_STRATEGIES: ReadonlySet<StrategyId> = new Set([
  "whale_follow",
  "llm_recommendation",
]);

export const STRATEGY_META: Record<
  StrategyId,
  { label: string; thesis: string; execution: StrategyExecution }
> = {
  earnings_iron_fly: {
    label: "Earnings iron fly",
    thesis:
      "Sell the at-the-money straddle into earnings with wings 1.25x the implied move away, and close at the reaction-day close — the volatility risk premium favours selling defined-risk premium around events.",
    execution: "manual-level3",
  },
  cheap_vol_straddle: {
    label: "Cheap-vol straddle",
    thesis:
      "Buy ~30-day ATM straddles on the top decile of 20-day realized vol over implied vol, sell after 10 sessions — the long side of Goyal & Saretto's cheap-options effect.",
    execution: "agent",
  },
  whale_follow: {
    label: "Whale follow (control)",
    thesis:
      "Buy the exact contract of each detected whale alert and sell after 3 sessions — a control to check whether the alerts carry directional information beyond market beta.",
    execution: "agent",
  },
  rec_trend: {
    label: "Rec + trend calls",
    thesis:
      "The owner's April playbook as rules: take the dashboard's recommended direction only when QQQ's trend agrees (close above its 10-day average for calls, below for puts), buy the single contract nearest the money expiring 7–21 days out, and exit at +100%, −50% or after 5 sessions.",
    execution: "agent",
  },
  llm_recommendation: {
    label: "Dashboard LLM recommendation (control)",
    thesis:
      "Forward-test the dashboard's own trade_recommendation output with a ±50% take-profit/stop-loss — a control to check whether the LLM's picks beat market beta.",
    execution: "agent",
  },
};

export const EVIDENCE: Record<StrategyId, StrategyEvidence> = {
  earnings_iron_fly: {
    n: 671,
    meanAfterCosts: -0.003,
    ci95: [-0.054, 0.048],
    costModel: "2% half-spread per leg per side on daily closes; losses floored at the defined-risk maximum",
    verdict:
      "No edge after costs overall. Only the Apr–Jun 2025 season paid, right after the tariff crash with VIX mostly ≥ 22 — one episode, so VIX is recorded on every entry to test it forward.",
    summary:
      "Sell the at-the-money straddle with wings 1.25× the implied move away at the last close before earnings; close at the reaction-day close. About +6% per trade before costs, −0.3% after 2% spreads (n=671, Oct 2024–Jun 2025).",
  },
  cheap_vol_straddle: {
    n: 104,
    meanAfterCosts: 0.034,
    ci95: [-0.052, 0.135],
    costModel: "2% half-spread per leg per side on daily closes",
    verdict: "Points the right way (cheap beats rich) but not significant (t=0.7).",
    summary:
      "Buy ~30-day straddles on the top decile of 20-day realized ÷ implied volatility and sell after 10 sessions. +3.4% per trade after 2% spreads (n=104, Oct 2024–Sep 2026).",
  },
  whale_follow: {
    n: 1302,
    meanAfterCosts: 0.124,
    ci95: [-0.018, 0.292],
    costModel: "2.5% half-spread per side",
    verdict:
      "Control. Median trade −18.9% with 36% winners; the alert's direction carried no information beyond market beta (+0.2% per 5 days).",
    summary:
      "Buy the exact contract of each whale alert and sell after 3 sessions (n=1,302, Apr–Jun 2026, a strong bull market).",
  },
  rec_trend: {
    n: 589,
    meanAfterCosts: 0.036,
    ci95: [-0.044, 0.117],
    costModel: "2.5% half-spread per side on daily closes",
    verdict:
      "Unproven. On the dashboard's own picks it made +74.6% per trade (n=109), but those were April 2026 calls, and plain mega-cap calls under the same trend filter made +78.3% that month. Over two years the filter alone made +3.6% per trade (t=0.9).",
    summary:
      "Calls when QQQ closes above its 10-day average (puts below), nearest the money, 7–21 days out, exits at +100% / −50% / 5 sessions. Two-year test on the 10 mega-caps without dashboard input: +3.6% per trade after 2.5% spreads (n=589, Oct 2024–Sep 2026).",
  },
  llm_recommendation: {
    n: 149,
    meanAfterCosts: 0.1,
    ci95: [-0.028, 0.219],
    costModel: "2.5% half-spread per leg per side",
    verdict:
      "Control. Returns came from market beta; beta-adjusted direction was +0.8% per 5 days (t=1.25).",
    summary:
      "The dashboard's own LLM trade recommendations, entered at the next minute and managed with ±50% take-profit/stop-loss (n=149, Apr–Jun 2026).",
  },
};

export const LIVE_CRITERIA: LiveCriteria = {
  minClosedTrades: 60,
  minTStat: 2,
  rule: "At least 60 closed paper trades with a positive mean after costs and t ≥ 2.0. Controls are never promoted.",
};

// ---------- forward stats + status ----------

function mean(a: number[]): number {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
}

function stdev(a: number[]): number {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

export function computeForwardStats(
  closedRets: number[],
  closedPnls: number[],
  openCount: number,
): ForwardStats {
  const closed = closedRets.length;
  const meanRet = closed > 0 ? mean(closedRets) : null;
  const winRate = closed > 0 ? closedRets.filter((r) => r > 0).length / closed : null;
  const sd = closed > 1 ? stdev(closedRets) : NaN;
  const tStat =
    closed > 1 && Number.isFinite(sd) && sd > 0 ? mean(closedRets) / (sd / Math.sqrt(closed)) : null;
  const totalPnl = closedPnls.reduce((s, x) => s + x, 0);
  return { closed, open: openCount, meanRet, winRate, tStat: tStat != null && Number.isFinite(tStat) ? tStat : null, totalPnl };
}

/** Status is computed from forward stats, never authored by a model. Controls are always "paper". */
export function computeStatus(id: StrategyId, forward: ForwardStats): StrategyStatus {
  if (CONTROL_STRATEGIES.has(id)) return "paper";
  const eligible =
    forward.closed >= LIVE_CRITERIA.minClosedTrades &&
    forward.meanRet != null &&
    forward.meanRet > 0 &&
    forward.tStat != null &&
    forward.tStat >= LIVE_CRITERIA.minTStat;
  return eligible ? "live-eligible" : "paper";
}

export function buildStrategy(id: StrategyId, forward: ForwardStats): DeskStrategy {
  const meta = STRATEGY_META[id];
  return {
    id,
    label: meta.label,
    thesis: meta.thesis,
    execution: meta.execution,
    status: computeStatus(id, forward),
    evidence: EVIDENCE[id],
    forward,
    liveCriteria: LIVE_CRITERIA,
  };
}

// ---------- cost model constants ----------

export const H_IRON_FLY = 0.02;
export const H_CHEAP_VOL = 0.02;
export const H_WHALE = 0.025;
export const H_LLM_REC = 0.025;
export const H_REC_TREND = 0.025;

// ---------- rec_trend ----------

/** QQQ close minus its 10-session average; null without 10 closes. Positive = uptrend. */
export function trendVs10DayAverage(closes: number[]): number | null {
  if (closes.length < 10) return null;
  const last10 = closes.slice(-10);
  return closes[closes.length - 1] - last10.reduce((s, x) => s + x, 0) / 10;
}

export function trendAgrees(direction: string, trend: number | null): boolean {
  if (trend == null) return false;
  return (direction === "bullish" && trend > 0) || (direction === "bearish" && trend < 0);
}

/** Expiry closest to 10 days out among those listed 7–21 days out, then the strike nearest the stock. */
export function pickRecTrendContract<T extends { expiry: string; strike: number }>(
  chain: T[],
  spot: number,
  asOf: string,
): T | null {
  if (chain.length === 0) return null;
  const target = Date.parse(asOf + "T12:00:00Z") + 10 * 864e5;
  const expiries = [...new Set(chain.map((c) => c.expiry))];
  const expiry = expiries.reduce((best, e) =>
    Math.abs(Date.parse(e + "T12:00:00Z") - target) < Math.abs(Date.parse(best + "T12:00:00Z") - target) ? e : best,
  );
  return chain.filter((c) => c.expiry === expiry).reduce((best, c) => (Math.abs(c.strike - spot) < Math.abs(best.strike - spot) ? c : best));
}
export const MIN_LEG_VOLUME = 20;

// ---------- earnings_iron_fly ----------

/** Nearest listed strike to `target` among strikes that have both a call and a put. */
export function nearestStrike(strikes: number[], target: number): number | null {
  if (strikes.length === 0) return null;
  return strikes.reduce((best, k) => (Math.abs(k - target) < Math.abs(best - target) ? k : best), strikes[0]);
}

/** First listed strike >= target (call wing) / last listed strike <= target (put wing). */
export function ironFlyWings(
  strikes: number[],
  k: number,
  straddle: number,
): { callWing: number | null; putWing: number | null } {
  const sorted = [...strikes].sort((a, b) => a - b);
  const callWing = sorted.find((s) => s >= k + 1.25 * straddle) ?? null;
  const putWing = [...sorted].reverse().find((s) => s <= k - 1.25 * straddle) ?? null;
  return { callWing, putWing };
}

/** Credit received opening the fly: sell the straddle, buy the wings, at half-spread h. */
export function ironFlyCredit(c0: number, p0: number, cw0: number, pw0: number, h: number): number {
  return (c0 + p0) * (1 - h) - (cw0 + pw0) * (1 + h);
}

/** Max loss (capital at risk) for the fly: width of the wider wing minus the credit collected. */
export function ironFlyRisk(k: number, callWing: number, putWing: number, credit: number): number {
  return Math.max(callWing - k, k - putWing) - credit;
}

/** Cost to close (buy back the straddle, sell the wings) — or intrinsic value if settling at/after expiry (no cost). */
export function ironFlyCloseCost(
  c1: number,
  p1: number,
  cw1: number,
  pw1: number,
  h: number,
  atExpiry: boolean,
): number {
  return atExpiry ? c1 + p1 - cw1 - pw1 : (c1 + p1) * (1 + h) - (cw1 + pw1) * (1 - h);
}

/** Return on capital at risk, floored at -1 (a defined-risk position cannot lose more than its risk). */
export function ironFlyReturn(credit: number, closeCost: number, risk: number): number {
  if (!(risk > 0)) return NaN;
  return Math.max(-1, (credit - closeCost) / risk);
}

// ---------- cheap_vol_straddle ----------

/** IV proxy from the ATM straddle: straddle / (0.8 * S * sqrt(T)). */
export function ivProxy(straddle: number, underlyingPrice: number, yearsToExpiry: number): number {
  return straddle / (0.8 * underlyingPrice * Math.sqrt(yearsToExpiry));
}

export interface CheapVolCandidate {
  ticker: string;
  hv20: number;
  iv: number;
  ratio: number;
}

/**
 * Top decile of HV20/IV among priced candidates: at least 1 when >= 5 are
 * priced, at most 6. Returns the selected tickers, highest ratio first.
 */
export function selectCheapVolCandidates(rows: CheapVolCandidate[]): CheapVolCandidate[] {
  if (rows.length === 0) return [];
  const sorted = [...rows].sort((a, b) => b.ratio - a.ratio);
  const decileCount = Math.ceil(sorted.length * 0.1);
  const minCount = rows.length >= 5 ? 1 : 0;
  const count = Math.min(6, Math.max(minCount, decileCount));
  return sorted.slice(0, count);
}

export function straddleDebit(c0: number, p0: number, h: number): number {
  return (c0 + p0) * (1 + h);
}

export function straddleExitValue(c1: number, p1: number, h: number): number {
  return (c1 + p1) * (1 - h);
}

// ---------- shared exit helpers ----------

/** True once a position has been held `daysHeld` sessions and hit `cap`, or a TP/SL threshold. */
export function tpSlExitReason(
  ret: number,
  daysHeld: number,
  cap: number,
  tp = 0.5,
  sl = -0.5,
): "take-profit" | "stop-loss" | "time-cap" | null {
  if (ret >= tp) return "take-profit";
  if (ret <= sl) return "stop-loss";
  if (daysHeld >= cap) return "time-cap";
  return null;
}
