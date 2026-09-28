/**
 * Story S6 — paper-trading desk orchestrator.
 *
 * Order per run: mark every open trade at `asOf` closes (settling at/after
 * expiry), apply exit rules, then open new entries per strategy. Idempotent
 * via a (strategy, ticker, entryDate) existence check backed by a unique DB
 * index; a module-level lock prevents overlapping runs. Each strategy's
 * failure is caught and recorded in the run's errors without stopping the
 * others (see the per-strategy try/catch in `runDesk`).
 */
import { createHash } from "crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { analyses, jevJudgments, newsEvents, paperTrades, deskRuns, whaleAlerts, hypeSnapshots } from "@/lib/db/schema";
import { parseDbTime } from "@/lib/utils/formatters";
import { getTickerUniverse } from "@/lib/services/ticker-universe";
import { askJev, warnIfJevKeyMissing } from "@/lib/services/jev-client";
import { fetchRedditHype, type HypeRow } from "@/lib/services/hype-fetcher";
import type { DeskRunSummary, PaperLeg, PaperTradeContext, StrategyId } from "@/types/desk";
import type { TradeRecommendation } from "@/types/analysis";
import {
  addDays,
  addWeekdays,
  annualizedHV,
  fetchForwardEarningsCalendar,
  fillOpen,
  listContracts,
  liquidClose,
  nextWeekday,
  nowInNy,
  occ,
  optionDailyBar,
  payoffAt,
  payoffGridMaxLoss,
  positionValue,
  sessionCalendar,
  stockDailyBars,
  toNyDate,
  type EarningsHour,
} from "@/lib/desk/market";
import {
  H_CHEAP_VOL,
  H_IRON_FLY,
  H_LLM_REC,
  H_REC_TREND,
  H_WHALE,
  MIN_LEG_VOLUME,
  ironFlyCredit,
  ironFlyRisk,
  ironFlyWings,
  ivProxy,
  nearestStrike,
  pickRecTrendContract,
  selectCheapVolCandidates,
  straddleDebit,
  tpSlExitReason,
  trendAgrees,
  trendVs10DayAverage,
  type CheapVolCandidate,
} from "@/lib/desk/strategies";

const IRON_FLY_JEV_QUESTION =
  "Do `headlines` point to something beyond a routine quarterly report that could move the stock far more than usual — a guidance shock, merger, regulatory ruling, accounting problem or leadership change?";
const CHEAP_VOL_JEV_QUESTION =
  "Do `headlines` mention a specific event within the next two weeks that could move the stock sharply — earnings, a product launch, a court or FDA decision, an investor day?";

export class DeskRunInProgressError extends Error {
  constructor() {
    super("A desk run is already in progress");
    this.name = "DeskRunInProgressError";
  }
}

let running = false;

// Session-wide facts attached to every entry this run opens: VIX (the backtest's short-vol edge showed up only
// with VIX ≥ 22, in one episode) and Reddit attention. Set once per run by runDesk, read by insertTrade.
let sessionExtras: { vix?: number; hype: Map<string, HypeRow> } = { hype: new Map() };

async function loadSessionExtras(asOf: string, isLatestSession: boolean): Promise<typeof sessionExtras> {
  const vixBar = (await stockDailyBars("^VIX", addDays(asOf, -7), addDays(asOf, 1))).find((b) => b.date === asOf);
  const hype = new Map<string, HypeRow>();
  // ApeWisdom only serves "now", so a backfill run for an older session gets no hype rather than today's.
  if (isLatestSession) {
    const rows = await fetchRedditHype(2);
    for (const r of rows) hype.set(r.ticker, r);
    const today = nowInNy().date;
    for (const r of rows) {
      await db
        .insert(hypeSnapshots)
        .values({ date: today, ticker: r.ticker, rank: r.rank, mentions: r.mentions, mentions24hAgo: r.mentions24hAgo, rank24hAgo: r.rank24hAgo, upvotes: r.upvotes })
        .onConflictDoNothing();
    }
  }
  return { vix: vixBar?.c, hype };
}

function withSessionExtras(ticker: string, context: PaperTradeContext): PaperTradeContext {
  const h = sessionExtras.hype.get(ticker);
  return {
    ...context,
    ...(sessionExtras.vix !== undefined ? { vix: sessionExtras.vix } : {}),
    ...(h ? { hype: { rank: h.rank, mentions: h.mentions, mentions24hAgo: h.mentions24hAgo } } : {}),
  };
}

function hForStrategy(strategy: string): number {
  switch (strategy) {
    case "earnings_iron_fly":
      return H_IRON_FLY;
    case "cheap_vol_straddle":
      return H_CHEAP_VOL;
    case "whale_follow":
      return H_WHALE;
    case "rec_trend":
      return H_REC_TREND;
    default:
      return H_LLM_REC;
  }
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Most recent COMPLETED session: on a session day before 16:15 ET use the
 * previous session; weekends/holidays fall back to the last session.
 * NOTE: market holidays beyond weekends are not modeled here (see
 * src/lib/desk/AGENTS.md) — only relevant to forward-looking date math, not
 * this resolver, which only reads realized SPY bars.
 */
export async function resolveAsOf(): Promise<string> {
  const { date: today, minutes } = nowInNy();
  const sessions = await sessionCalendar(addDays(today, -12), today);
  if (sessions.length === 0) throw new Error("No session calendar data available");
  const lastIdx = sessions.length - 1;
  const lastSession = sessions[lastIdx];
  if (lastSession === today) {
    if (minutes >= 16 * 60 + 15) return today;
    return sessions[lastIdx - 1] ?? lastSession;
  }
  return lastSession;
}

async function tradeExists(strategy: StrategyId, ticker: string, entryDate: string): Promise<boolean> {
  const rows = await db
    .select({ id: paperTrades.id })
    .from(paperTrades)
    .where(and(eq(paperTrades.strategy, strategy), eq(paperTrades.ticker, ticker), eq(paperTrades.entryDate, entryDate)))
    .limit(1);
  return rows.length > 0;
}

async function insertTrade(input: {
  strategy: StrategyId;
  ticker: string;
  entryDate: string;
  plannedExit: string;
  legs: PaperLeg[];
  entryValue: number;
  risk: number;
  context: PaperTradeContext;
}): Promise<number | null> {
  if (await tradeExists(input.strategy, input.ticker, input.entryDate)) return null;
  try {
    const rows = await db
      .insert(paperTrades)
      .values({
        strategy: input.strategy,
        ticker: input.ticker,
        status: "open",
        entryDate: input.entryDate,
        plannedExit: input.plannedExit,
        legs: JSON.stringify(input.legs),
        entryValue: input.entryValue,
        risk: input.risk,
        context: JSON.stringify(withSessionExtras(input.ticker, input.context)),
      })
      .returning({ id: paperTrades.id });
    return rows[0]?.id ?? null;
  } catch {
    // Unique-index race — another concurrent path won; idempotency preserved.
    return null;
  }
}

async function recentHeadlines(ticker: string, asOf: string): Promise<string[]> {
  const cutoff = `${addDays(asOf, -3)} 00:00:00`;
  const rows = await db
    .select({ headline: newsEvents.headline, tickers: newsEvents.tickers })
    .from(newsEvents)
    .where(gte(newsEvents.createdAt, cutoff));
  const headlines: string[] = [];
  for (const row of rows) {
    if (!row.tickers) continue;
    try {
      const parsed = JSON.parse(row.tickers);
      if (Array.isArray(parsed) && parsed.map(String).includes(ticker)) {
        headlines.push(row.headline);
      }
    } catch {
      continue;
    }
    if (headlines.length >= 5) break;
  }
  return headlines.slice(0, 5);
}

/** Jev at entry: logged and displayed, never a filter. No headlines -> skipped entirely. */
async function maybeJudgeWithJev(
  tradeId: number,
  ticker: string,
  asOf: string,
  questionId: string,
  instructions: string,
  extraState: Record<string, unknown>,
): Promise<PaperTradeContext["jev"] | undefined> {
  if (!warnIfJevKeyMissing()) return undefined;
  const headlines = await recentHeadlines(ticker, asOf);
  if (headlines.length === 0) return undefined;

  const state = { ticker, headlines, ...extraState };
  try {
    const result = await askJev(state, { [questionId]: { type: "noul", instructions } });
    const answer = result.answers[questionId];
    if (!answer || answer.type !== "noul") return undefined;
    await db.insert(jevJudgments).values({
      contextType: "desk",
      contextRef: String(tradeId),
      ticker,
      questionId,
      questionType: "noul",
      model: result.model,
      answer: JSON.stringify(answer),
      stateHash: sha256(state),
      horizonDays: null,
    });
    return [{ question: instructions, answer: answer.noul >= 0.5 ? "yes" : "no", p: answer.noul }];
  } catch (err) {
    console.warn(`[desk] Jev judgment failed for ${ticker}:`, err instanceof Error ? err.message : err);
    return undefined;
  }
}

async function sessionsHeld(entryDate: string, asOf: string): Promise<number> {
  if (entryDate >= asOf) return 0;
  const sessions = await sessionCalendar(entryDate, asOf);
  return Math.max(0, sessions.length - 1);
}

// ---------- marking / exits ----------

async function markAndMaybeExit(
  trade: typeof paperTrades.$inferSelect,
  asOf: string,
): Promise<{ closed: boolean }> {
  const legs: PaperLeg[] = JSON.parse(trade.legs);
  const expiry = legs[0]?.expiry;
  const atExpiry = !!expiry && expiry <= asOf;
  const h = hForStrategy(trade.strategy);

  let markValue: number;
  let updatedLegs: PaperLeg[];

  if (atExpiry) {
    const under = await stockDailyBars(trade.ticker, addDays(expiry, -6), expiry);
    const settle = under.find((b) => b.date === expiry)?.c ?? under[under.length - 1]?.c ?? null;
    if (settle == null) throw new Error(`no settlement close for ${trade.ticker} on ${expiry}`);
    markValue = payoffAt(legs, settle);
    updatedLegs = legs.map((l) => ({ ...l, lastPrice: null }));
  } else {
    const prices: number[] = [];
    for (const leg of legs) {
      const bar = await optionDailyBar(leg.occ, asOf);
      const liquid = liquidClose(bar ?? undefined, MIN_LEG_VOLUME);
      prices.push(liquid ?? leg.lastPrice ?? leg.entryPrice);
    }
    markValue = positionValue(legs, prices, h, false);
    updatedLegs = legs.map((l, i) => ({ ...l, lastPrice: prices[i] }));
  }

  const pnl = markValue - trade.entryValue;
  // markValue (closing position value, same sign convention as entryValue)
  // minus entryValue is the general P&L; the iron fly's defined-risk floor
  // (a credit spread cannot lose more than its risk) is applied on top.
  let ret = trade.risk > 0 ? pnl / trade.risk : NaN;
  if (trade.strategy === "earnings_iron_fly" && Number.isFinite(ret)) {
    ret = Math.max(-1, ret);
  }

  const held = await sessionsHeld(trade.entryDate, asOf);
  let exitReason: string | null = null;
  if (trade.strategy === "earnings_iron_fly") {
    if (atExpiry) exitReason = "expiry";
    else if (asOf >= trade.plannedExit) exitReason = "reaction-day-close";
  } else if (trade.strategy === "cheap_vol_straddle") {
    if (atExpiry) exitReason = "expiry";
    else if (held >= 10) exitReason = "time-cap";
  } else if (trade.strategy === "whale_follow") {
    if (atExpiry) exitReason = "expiry";
    else if (held >= 3) exitReason = "time-cap";
  } else if (trade.strategy === "llm_recommendation") {
    exitReason = atExpiry ? "expiry" : tpSlExitReason(Number.isFinite(ret) ? ret : 0, held, 10);
  } else if (trade.strategy === "rec_trend") {
    exitReason = atExpiry ? "expiry" : tpSlExitReason(Number.isFinite(ret) ? ret : 0, held, 5, 1.0, -0.5);
  }

  if (exitReason) {
    await db
      .update(paperTrades)
      .set({
        status: "closed",
        exitDate: asOf,
        exitReason,
        legs: JSON.stringify(updatedLegs),
        markValue,
        pnl,
        ret: Number.isFinite(ret) ? ret : null,
      })
      .where(eq(paperTrades.id, trade.id));
    return { closed: true };
  }

  await db
    .update(paperTrades)
    .set({ legs: JSON.stringify(updatedLegs), markValue, pnl, ret: Number.isFinite(ret) ? ret : null })
    .where(eq(paperTrades.id, trade.id));
  return { closed: false };
}

// ---------- earnings_iron_fly ----------

interface BuiltIronFly {
  ticker: string;
  legs: PaperLeg[];
  entryValue: number;
  risk: number;
  liquidity: number;
  context: PaperTradeContext;
}

async function buildIronFly(
  ticker: string,
  asOf: string,
  t0: string,
  hour: EarningsHour,
  eventDate: string,
): Promise<BuiltIronFly | null> {
  const under = await stockDailyBars(ticker, addDays(asOf, -10), asOf);
  const S = under[under.length - 1]?.c;
  if (!S) return null;

  const contracts = await listContracts(ticker, {
    asOf,
    expGte: t0,
    expLte: addDays(t0, 14),
    strikeGte: +(S * 0.6).toFixed(2),
    strikeLte: +(S * 1.4).toFixed(2),
  });
  if (contracts.length === 0) return null;

  const expiry = [...contracts.map((c) => c.expiry)].sort()[0];
  const chain = contracts.filter((c) => c.expiry === expiry);
  const strikes = [...new Set(chain.map((c) => c.strike))].filter(
    (k) => chain.some((c) => c.strike === k && c.type === "call") && chain.some((c) => c.strike === k && c.type === "put"),
  );
  if (strikes.length < 5) return null;

  const findTicker = (type: "call" | "put", k: number) => chain.find((c) => c.type === type && c.strike === k)?.ticker;
  const K = nearestStrike(strikes, S);
  if (K == null) return null;
  const callTk = findTicker("call", K);
  const putTk = findTicker("put", K);
  if (!callTk || !putTk) return null;

  const [callBar, putBar] = await Promise.all([optionDailyBar(callTk, asOf), optionDailyBar(putTk, asOf)]);
  const c0 = liquidClose(callBar ?? undefined, MIN_LEG_VOLUME);
  const p0 = liquidClose(putBar ?? undefined, MIN_LEG_VOLUME);
  if (c0 == null || p0 == null) return null;

  const straddle = c0 + p0;
  const { callWing, putWing } = ironFlyWings(strikes, K, straddle);
  if (callWing == null || putWing == null) return null;
  const callWingTk = findTicker("call", callWing);
  const putWingTk = findTicker("put", putWing);
  if (!callWingTk || !putWingTk) return null;

  const [cwBar, pwBar] = await Promise.all([optionDailyBar(callWingTk, asOf), optionDailyBar(putWingTk, asOf)]);
  const cw0 = liquidClose(cwBar ?? undefined, MIN_LEG_VOLUME);
  const pw0 = liquidClose(pwBar ?? undefined, MIN_LEG_VOLUME);
  if (cw0 == null || pw0 == null) return null;

  const credit = ironFlyCredit(c0, p0, cw0, pw0, H_IRON_FLY);
  const risk = ironFlyRisk(K, callWing, putWing, credit);
  if (!(risk > 0)) return null;

  const liquidity = (callBar?.v ?? 0) + (putBar?.v ?? 0) + (cwBar?.v ?? 0) + (pwBar?.v ?? 0);
  const legs: PaperLeg[] = [
    { occ: callTk, side: -1, qty: 1, cp: "C", strike: K, expiry, entryPrice: c0, lastPrice: c0 },
    { occ: putTk, side: -1, qty: 1, cp: "P", strike: K, expiry, entryPrice: p0, lastPrice: p0 },
    { occ: callWingTk, side: 1, qty: 1, cp: "C", strike: callWing, expiry, entryPrice: cw0, lastPrice: cw0 },
    { occ: putWingTk, side: 1, qty: 1, cp: "P", strike: putWing, expiry, entryPrice: pw0, lastPrice: pw0 },
  ];

  return {
    ticker,
    legs,
    entryValue: -credit,
    risk,
    liquidity,
    context: {
      impliedMove: straddle / S,
      eventDate,
      eventTiming: hour === "amc" ? "AMC" : "BMO",
      note: `Sold the ${ticker} at-the-money straddle into earnings; wings 1.25x the implied move away.`,
    },
  };
}

async function runEarningsIronFly(asOf: string): Promise<number> {
  const t0 = nextWeekday(asOf);
  const calendar = await fetchForwardEarningsCalendar(asOf, addDays(asOf, 3));
  const candidates = calendar.filter(
    (r) => (r.hour === "amc" && r.date === asOf) || (r.hour === "bmo" && r.date === t0),
  );

  const built: BuiltIronFly[] = [];
  for (const cand of candidates) {
    if (await tradeExists("earnings_iron_fly", cand.symbol, asOf)) continue;
    try {
      const b = await buildIronFly(cand.symbol, asOf, t0, cand.hour, cand.date);
      if (b) built.push(b);
    } catch (err) {
      console.warn(`[desk] earnings_iron_fly build failed for ${cand.symbol}:`, err instanceof Error ? err.message : err);
    }
  }
  built.sort((a, b) => b.liquidity - a.liquidity);

  let opened = 0;
  for (const b of built.slice(0, 25)) {
    const id = await insertTrade({
      strategy: "earnings_iron_fly",
      ticker: b.ticker,
      entryDate: asOf,
      plannedExit: t0,
      legs: b.legs,
      entryValue: b.entryValue,
      risk: b.risk,
      context: b.context,
    });
    if (id == null) continue;
    const jev = await maybeJudgeWithJev(id, b.ticker, asOf, "unusual_event_risk", IRON_FLY_JEV_QUESTION, {
      event: "reports earnings before the next session opens",
    });
    if (jev) {
      await db.update(paperTrades).set({ context: JSON.stringify({ ...withSessionExtras(b.ticker, b.context), jev }) }).where(eq(paperTrades.id, id));
    }
    opened++;
  }
  return opened;
}

// ---------- cheap_vol_straddle ----------

interface BuiltCheapVol {
  legs: PaperLeg[];
  entryValue: number;
  risk: number;
  context: PaperTradeContext;
}

async function buildCheapVolCandidate(
  ticker: string,
  asOf: string,
): Promise<{ candidate: CheapVolCandidate; trade: BuiltCheapVol } | null> {
  const bars = await stockDailyBars(ticker, addDays(asOf, -40), asOf);
  const i = bars.findIndex((b) => b.date === asOf);
  if (i < 20) return null;
  const S = bars[i].c;
  const hv = annualizedHV(bars.slice(0, i + 1).map((b) => b.c), 20);
  if (hv == null) return null;

  const chain = await listContracts(ticker, {
    asOf,
    expGte: addDays(asOf, 24),
    expLte: addDays(asOf, 45),
    strikeGte: +(S * 0.85).toFixed(2),
    strikeLte: +(S * 1.15).toFixed(2),
  });
  if (chain.length === 0) return null;

  const targetMs = Date.parse(asOf) + 30 * 86_400_000;
  const expiry = [...chain.map((c) => c.expiry)].sort(
    (a, b) => Math.abs(Date.parse(a) - targetMs) - Math.abs(Date.parse(b) - targetMs),
  )[0];
  const strikes = [...new Set(chain.filter((c) => c.expiry === expiry).map((c) => c.strike))];
  const K = nearestStrike(strikes, S);
  if (K == null) return null;
  const call = chain.find((c) => c.expiry === expiry && c.strike === K && c.type === "call");
  const put = chain.find((c) => c.expiry === expiry && c.strike === K && c.type === "put");
  if (!call || !put) return null;

  const [cBar, pBar] = await Promise.all([optionDailyBar(call.ticker, asOf), optionDailyBar(put.ticker, asOf)]);
  const c0 = liquidClose(cBar ?? undefined, MIN_LEG_VOLUME);
  const p0 = liquidClose(pBar ?? undefined, MIN_LEG_VOLUME);
  if (c0 == null || p0 == null) return null;

  const T = (Date.parse(expiry) - Date.parse(asOf)) / (365 * 86_400_000);
  const iv = ivProxy(c0 + p0, S, T);
  const ratio = hv / iv;
  const legs: PaperLeg[] = [
    { occ: call.ticker, side: 1, qty: 1, cp: "C", strike: K, expiry, entryPrice: c0, lastPrice: c0 },
    { occ: put.ticker, side: 1, qty: 1, cp: "P", strike: K, expiry, entryPrice: p0, lastPrice: p0 },
  ];
  const entryValue = straddleDebit(c0, p0, H_CHEAP_VOL);
  return {
    candidate: { ticker, hv20: hv, iv, ratio },
    trade: {
      legs,
      entryValue,
      risk: entryValue,
      context: { note: `Long ${ticker} ~30-day ATM straddle; HV20/IV ratio ${ratio.toFixed(2)}.` },
    },
  };
}

async function runCheapVolStraddle(asOf: string): Promise<number> {
  const sessions = await sessionCalendar(addDays(asOf, -10), asOf);
  const idx = sessions.indexOf(asOf);
  const isFirstOfMonth = idx > 0 && sessions[idx].slice(0, 7) !== sessions[idx - 1].slice(0, 7);
  if (!isFirstOfMonth) return 0;

  const universe = await getTickerUniverse({ max: 60 });
  const rows: CheapVolCandidate[] = [];
  const built = new Map<string, BuiltCheapVol>();
  for (const ticker of universe) {
    if (await tradeExists("cheap_vol_straddle", ticker, asOf)) continue;
    try {
      const r = await buildCheapVolCandidate(ticker, asOf);
      if (r) {
        rows.push(r.candidate);
        built.set(ticker, r.trade);
      }
    } catch (err) {
      console.warn(`[desk] cheap_vol_straddle build failed for ${ticker}:`, err instanceof Error ? err.message : err);
    }
  }

  const selected = selectCheapVolCandidates(rows);
  let opened = 0;
  for (const c of selected) {
    const b = built.get(c.ticker);
    if (!b) continue;
    const id = await insertTrade({
      strategy: "cheap_vol_straddle",
      ticker: c.ticker,
      entryDate: asOf,
      plannedExit: addWeekdays(asOf, 10),
      legs: b.legs,
      entryValue: b.entryValue,
      risk: b.risk,
      context: b.context,
    });
    if (id == null) continue;
    const jev = await maybeJudgeWithJev(id, c.ticker, asOf, "upcoming_catalyst", CHEAP_VOL_JEV_QUESTION, {});
    if (jev) {
      await db.update(paperTrades).set({ context: JSON.stringify({ ...withSessionExtras(c.ticker, b.context), jev }) }).where(eq(paperTrades.id, id));
    }
    opened++;
  }
  return opened;
}

// ---------- whale_follow (control) ----------

async function runWhaleFollow(asOf: string): Promise<number> {
  const rows = await db.select().from(whaleAlerts).orderBy(desc(whaleAlerts.id)).limit(2000);
  const sameDay = rows.filter(
    (r) =>
      r.detectedAt &&
      toNyDate(parseDbTime(r.detectedAt).getTime()) === asOf &&
      r.expiry &&
      r.expiry.slice(0, 10) > asOf &&
      r.strike != null &&
      r.callPut,
  );
  sameDay.sort((a, b) => (b.premium ?? 0) - (a.premium ?? 0));

  const byTicker = new Map<string, (typeof sameDay)[number]>();
  for (const r of sameDay) {
    if (byTicker.size >= 3) break;
    if (!byTicker.has(r.ticker)) byTicker.set(r.ticker, r);
  }

  let opened = 0;
  for (const [ticker, alert] of byTicker) {
    if (await tradeExists("whale_follow", ticker, asOf)) continue;
    try {
      const expiry = String(alert.expiry).slice(0, 10);
      const cp: "C" | "P" = alert.callPut === "P" ? "P" : "C";
      const tk = occ(ticker, expiry, cp, alert.strike as number);
      const bar = await optionDailyBar(tk, asOf);
      const price = liquidClose(bar ?? undefined, MIN_LEG_VOLUME);
      if (price == null) continue;
      const entryValue = fillOpen(price, H_WHALE, 1);
      const legs: PaperLeg[] = [
        { occ: tk, side: 1, qty: 1, cp, strike: alert.strike as number, expiry, entryPrice: price, lastPrice: price },
      ];
      const id = await insertTrade({
        strategy: "whale_follow",
        ticker,
        entryDate: asOf,
        plannedExit: addWeekdays(asOf, 3),
        legs,
        entryValue,
        risk: entryValue,
        context: { note: `Followed a whale alert: ${cp === "C" ? "call" : "put"} $${alert.strike} exp ${expiry}.` },
      });
      if (id != null) opened++;
    } catch (err) {
      console.warn(`[desk] whale_follow build failed for ${ticker}:`, err instanceof Error ? err.message : err);
    }
  }
  return opened;
}

// ---------- llm_recommendation (control) ----------

async function buildLlmRecommendation(
  ticker: string,
  output: string | null,
  asOf: string,
): Promise<{ legs: PaperLeg[]; entryValue: number; risk: number; context: PaperTradeContext } | null> {
  let parsed: TradeRecommendation;
  try {
    parsed = JSON.parse(output ?? "{}");
  } catch {
    return null;
  }
  const rawLegs = parsed?.primary_strategy?.legs ?? [];
  if (rawLegs.length === 0) return null;
  const expiries = new Set(rawLegs.map((l) => l.expiry.slice(0, 10)));
  if (expiries.size !== 1) return null;
  const expiry = rawLegs[0].expiry.slice(0, 10);

  const legs: PaperLeg[] = [];
  for (const l of rawLegs) {
    const cp: "C" | "P" = l.type === "put" ? "P" : "C";
    const side: 1 | -1 = l.action === "sell" ? -1 : 1;
    const tk = occ(ticker, expiry, cp, l.strike);
    const bar = await optionDailyBar(tk, asOf);
    const price = liquidClose(bar ?? undefined, MIN_LEG_VOLUME);
    if (price == null) return null;
    legs.push({ occ: tk, side, qty: 1, cp, strike: l.strike, expiry, entryPrice: price, lastPrice: price });
  }

  const entryValue = positionValue(legs, legs.map((l) => l.entryPrice), H_LLM_REC, true);
  const risk = entryValue > 0 ? entryValue : payoffGridMaxLoss(legs, entryValue);
  if (!Number.isFinite(risk) || risk <= 0) return null;

  return {
    legs,
    entryValue,
    risk,
    context: { note: `Dashboard LLM recommendation for ${ticker}: ${(parsed.thesis ?? "").slice(0, 200)}` },
  };
}

/** The latest trade_recommendation per ticker written on asOf (NY date), parsed. */
async function sameDayRecsByTicker(
  asOf: string,
): Promise<Map<string, { id: number; output: string | null; parsed: TradeRecommendation }>> {
  const rows = await db
    .select({ id: analyses.id, output: analyses.output, createdAt: analyses.createdAt })
    .from(analyses)
    .where(eq(analyses.type, "trade_recommendation"))
    .orderBy(desc(analyses.id))
    .limit(500);

  const sameDay = rows.filter((r) => r.createdAt && toNyDate(parseDbTime(r.createdAt).getTime()) === asOf);
  const latestByTicker = new Map<string, { id: number; output: string | null; parsed: TradeRecommendation }>();
  for (const r of sameDay) {
    let parsed: TradeRecommendation;
    try {
      parsed = JSON.parse(r.output ?? "{}");
    } catch {
      continue;
    }
    const ticker = parsed?.ticker?.toUpperCase();
    if (!ticker) continue;
    const existing = latestByTicker.get(ticker);
    if (!existing || r.id > existing.id) latestByTicker.set(ticker, { id: r.id, output: r.output, parsed });
  }
  return latestByTicker;
}

async function runLlmRecommendation(asOf: string): Promise<number> {
  const latestByTicker = await sameDayRecsByTicker(asOf);
  let opened = 0;
  for (const [ticker, row] of latestByTicker) {
    if (await tradeExists("llm_recommendation", ticker, asOf)) continue;
    try {
      const built = await buildLlmRecommendation(ticker, row.output, asOf);
      if (!built) continue;
      const id = await insertTrade({
        strategy: "llm_recommendation",
        ticker,
        entryDate: asOf,
        plannedExit: addWeekdays(asOf, 10),
        legs: built.legs,
        entryValue: built.entryValue,
        risk: built.risk,
        context: built.context,
      });
      if (id != null) opened++;
    } catch (err) {
      console.warn(`[desk] llm_recommendation build failed for ${ticker}:`, err instanceof Error ? err.message : err);
    }
  }
  return opened;
}

// ---------- orchestrator ----------

async function runRecTrend(asOf: string): Promise<number> {
  const recs = await sameDayRecsByTicker(asOf);
  if (recs.size === 0) return 0;
  const qqq = await stockDailyBars("QQQ", addDays(asOf, -30), addDays(asOf, 1));
  const trend = trendVs10DayAverage(qqq.filter((b) => b.date <= asOf).map((b) => b.c));

  let opened = 0;
  for (const [ticker, { parsed }] of recs) {
    const direction = parsed.direction;
    if (trend == null || !trendAgrees(direction, trend)) continue;
    if (await tradeExists("rec_trend", ticker, asOf)) continue;
    try {
      const spot = (await stockDailyBars(ticker, addDays(asOf, -7), addDays(asOf, 1))).find((b) => b.date === asOf)?.c;
      if (!spot) continue;
      const type = direction === "bullish" ? "call" : "put";
      const chain = (
        await listContracts(ticker, {
          asOf,
          expGte: addDays(asOf, 7),
          expLte: addDays(asOf, 21),
          strikeGte: +(spot * 0.9).toFixed(2),
          strikeLte: +(spot * 1.1).toFixed(2),
        })
      ).filter((c) => c.type === type);
      const contract = pickRecTrendContract(chain, spot, asOf);
      if (!contract) continue;
      const price = liquidClose((await optionDailyBar(contract.ticker, asOf)) ?? undefined, MIN_LEG_VOLUME);
      if (price == null) continue;
      const legs: PaperLeg[] = [
        { occ: contract.ticker, side: 1, qty: 1, cp: type === "call" ? "C" : "P", strike: contract.strike, expiry: contract.expiry, entryPrice: price, lastPrice: price },
      ];
      const entryValue = positionValue(legs, [price], H_REC_TREND, true);
      const id = await insertTrade({
        strategy: "rec_trend",
        ticker,
        entryDate: asOf,
        plannedExit: addWeekdays(asOf, 5),
        legs,
        entryValue,
        risk: entryValue,
        context: {
          note: `Dashboard said ${direction}; QQQ closed ${trend > 0 ? "above" : "below"} its 10-day average by $${Math.abs(trend).toFixed(2)}. Exit at +100%, −50% or after 5 sessions.`,
        },
      });
      if (id != null) opened++;
    } catch (err) {
      console.warn(`[desk] rec_trend build failed for ${ticker}:`, err instanceof Error ? err.message : err);
    }
  }
  return opened;
}

export async function runDesk(explicitAsOf?: string): Promise<DeskRunSummary> {
  if (running) throw new DeskRunInProgressError();
  running = true;
  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  let opened = 0;
  let marked = 0;
  let closed = 0;

  try {
    const latest = await resolveAsOf();
    const asOf = explicitAsOf ?? latest;
    try {
      sessionExtras = await loadSessionExtras(asOf, asOf === latest);
    } catch (err) {
      errors.push(`session extras (VIX/hype): ${err instanceof Error ? err.message : String(err)}`);
    }

    const openTrades = await db.select().from(paperTrades).where(eq(paperTrades.status, "open"));
    for (const trade of openTrades) {
      try {
        const result = await markAndMaybeExit(trade, asOf);
        marked++;
        if (result.closed) closed++;
      } catch (err) {
        errors.push(
          `mark ${trade.strategy}/${trade.ticker}#${trade.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const runners: Array<[StrategyId, () => Promise<number>]> = [
      ["earnings_iron_fly", () => runEarningsIronFly(asOf)],
      ["cheap_vol_straddle", () => runCheapVolStraddle(asOf)],
      ["whale_follow", () => runWhaleFollow(asOf)],
      ["llm_recommendation", () => runLlmRecommendation(asOf)],
      ["rec_trend", () => runRecTrend(asOf)],
    ];
    for (const [id, run] of runners) {
      try {
        opened += await run();
      } catch (err) {
        errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const completedAt = new Date().toISOString();
    await db.insert(deskRuns).values({
      startedAt,
      completedAt,
      opened,
      marked,
      closed,
      errors: JSON.stringify(errors),
    });

    return { startedAt, completedAt, opened, marked, closed, errors };
  } finally {
    running = false;
    sessionExtras = { hype: new Map() };
  }
}
