import { db } from "@/lib/db/client";
import {
  simTrades,
  simPortfolio,
  simPortfolioSnapshots,
} from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import {
  fetchMarketData,
  fetchOptionsChain,
} from "@/lib/services/market-fetcher";
import { getSameDayEntryPolicy } from "@/lib/utils/market-hours";
import type {
  TradeDecision,
  SimLeg,
  PositionValuation,
} from "@/types/portfolio";
import { recordApiCall } from "@/lib/utils/api-budget";

// ============================================================
// Portfolio initialization
// ============================================================

const STARTING_BALANCE = 2000;

export async function getOrCreatePortfolio() {
  const existing = await db.select().from(simPortfolio).limit(1);
  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(simPortfolio)
    .values({
      balance: STARTING_BALANCE,
      startingBalance: STARTING_BALANCE,
    })
    .returning();
  console.log(`[SimEngine] Portfolio initialized with $${STARTING_BALANCE}`);
  return created;
}

// ============================================================
// Trade leg validation
// ============================================================

/**
 * Get the current date string in Eastern Time (YYYY-MM-DD).
 * Options expire at 4:00 PM ET, so we use the ET date for comparison.
 */
function getTodayET(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/**
 * Count trading (business) days between two dates, excluding weekends.
 */
function tradingDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const current = new Date(from);
  current.setDate(current.getDate() + 1); // start counting from next day
  while (current <= to) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export interface TradeValidationResult {
  valid: boolean;
  reason?: string;
  warnings: string[];
}

const MIN_DTE = 2;
const MAX_OTM_PCT = 0.5;

// Known multi-leg strategy patterns for Story 19.5
const VERTICAL_SPREAD_NAMES = [
  "bull call spread",
  "bear call spread",
  "bull put spread",
  "bear put spread",
  "call credit spread",
  "call debit spread",
  "put credit spread",
  "put debit spread",
  "vertical spread",
];

const IRON_CONDOR_NAMES = ["iron condor"];
const STRADDLE_STRANGLE_NAMES = [
  "straddle",
  "strangle",
  "long straddle",
  "long strangle",
];
const SINGLE_LEG_NAMES = [
  "long call",
  "long put",
  "naked call",
  "naked put",
  "cash secured put",
];

/**
 * Story 19.5 — Validate that strategy legs are internally consistent.
 * E.g. a vertical spread should have exactly 2 legs of the same type and expiry.
 */
export function validateStrategyConsistency(
  strategyName: string,
  legs: SimLeg[],
): TradeValidationResult {
  const warnings: string[] = [];
  const name = strategyName.toLowerCase().trim();

  // --- Vertical spreads ---
  if (VERTICAL_SPREAD_NAMES.some((s) => name.includes(s))) {
    if (legs.length !== 2) {
      return {
        valid: false,
        reason: `Vertical spread "${strategyName}" requires exactly 2 legs, got ${legs.length}`,
        warnings,
      };
    }
    const actions = new Set(legs.map((l) => l.action));
    if (actions.size !== 2) {
      return {
        valid: false,
        reason: `Vertical spread must have one buy and one sell leg`,
        warnings,
      };
    }
    const types = new Set(legs.map((l) => l.type));
    if (types.size !== 2) {
      // same type = good for vertical spread
    } else {
      return {
        valid: false,
        reason: `Vertical spread legs must be the same type (both calls or both puts), got mixed`,
        warnings,
      };
    }
    const expiries = new Set(legs.map((l) => l.expiry));
    if (expiries.size > 1) {
      return {
        valid: false,
        reason: `Vertical spread legs must share the same expiry date`,
        warnings,
      };
    }
    const strikes = new Set(legs.map((l) => l.strike));
    if (strikes.size < 2) {
      return {
        valid: false,
        reason: `Vertical spread legs must have different strikes`,
        warnings,
      };
    }
  }

  // --- Iron condor ---
  else if (IRON_CONDOR_NAMES.some((s) => name.includes(s))) {
    if (legs.length !== 4) {
      return {
        valid: false,
        reason: `Iron condor requires exactly 4 legs, got ${legs.length}`,
        warnings,
      };
    }
    const calls = legs.filter((l) => l.type === "call");
    const puts = legs.filter((l) => l.type === "put");
    if (calls.length !== 2 || puts.length !== 2) {
      return {
        valid: false,
        reason: `Iron condor requires 2 calls and 2 puts`,
        warnings,
      };
    }
    const expiries = new Set(legs.map((l) => l.expiry));
    if (expiries.size > 1) {
      return {
        valid: false,
        reason: `Iron condor legs must share the same expiry date`,
        warnings,
      };
    }
  }

  // --- Straddle / Strangle ---
  else if (STRADDLE_STRANGLE_NAMES.some((s) => name.includes(s))) {
    if (legs.length !== 2) {
      return {
        valid: false,
        reason: `${strategyName} requires exactly 2 legs, got ${legs.length}`,
        warnings,
      };
    }
    const types = new Set(legs.map((l) => l.type));
    if (types.size !== 2) {
      return {
        valid: false,
        reason: `${strategyName} requires one call and one put`,
        warnings,
      };
    }
    const expiries = new Set(legs.map((l) => l.expiry));
    if (expiries.size > 1) {
      return {
        valid: false,
        reason: `${strategyName} legs must share the same expiry date`,
        warnings,
      };
    }
    if (name.includes("straddle")) {
      const strikes = new Set(legs.map((l) => l.strike));
      if (strikes.size > 1) {
        return {
          valid: false,
          reason: `Straddle legs must have the same strike`,
          warnings,
        };
      }
    }
  }

  // --- Single-leg ---
  else if (SINGLE_LEG_NAMES.some((s) => name.includes(s))) {
    if (legs.length !== 1) {
      warnings.push(`"${strategyName}" expected 1 leg but got ${legs.length}`);
    }
  }

  // Unrecognized strategy — allow through with warning
  else {
    warnings.push(
      `Unrecognized strategy "${strategyName}" — skipping consistency check`,
    );
  }

  return { valid: true, warnings };
}

/**
 * Validate trade legs before opening a position.
 * Checks: expiry validity, minimum DTE, strike reasonableness, premium sanity, strategy consistency.
 */
export function validateTradeLegs(
  legs: SimLeg[],
  currentPrice: number,
  portfolioBalance: number,
  strategyName?: string,
  now: Date = new Date(),
): TradeValidationResult {
  const warnings: string[] = [];
  const todayStr = getTodayET(now);
  const sameDayPolicy = getSameDayEntryPolicy(now);
  const sameDayLegs: SimLeg[] = [];

  // --- Expiry validation ---
  for (const leg of legs) {
    const expDate = new Date(leg.expiry);
    if (isNaN(expDate.getTime())) {
      return {
        valid: false,
        reason: `Invalid expiry date format: "${leg.expiry}"`,
        warnings,
      };
    }
    // Normalize to date-only string for comparison (YYYY-MM-DD)
    const legDateStr = expDate.toISOString().split("T")[0];
    if (legDateStr < todayStr) {
      return {
        valid: false,
        reason: `Leg expires in the past: ${leg.action.toUpperCase()} ${leg.type.toUpperCase()} $${leg.strike} exp ${leg.expiry}`,
        warnings,
      };
    }

    if (legDateStr === todayStr) {
      if (!sameDayPolicy.allowed) {
        return {
          valid: false,
          reason: `${sameDayPolicy.reason}: ${leg.action.toUpperCase()} ${leg.type.toUpperCase()} $${leg.strike} exp ${leg.expiry}`,
          warnings,
        };
      }
      sameDayLegs.push(leg);
    }
  }

  if (sameDayLegs.length > 0) {
    warnings.push(
      `0DTE entry: ${sameDayPolicy.reason}. Manage closely due to elevated intraday theta risk.`,
    );
  }

  // --- Minimum DTE validation ---
  const today = new Date(todayStr + "T16:00:00-05:00"); // 4 PM ET
  const dtePerLeg = legs.map((leg) => {
    const expDate = new Date(leg.expiry + "T16:00:00-05:00");
    return { leg, dte: tradingDaysBetween(today, expDate) };
  });

  const nonSameDayDte = dtePerLeg.filter((l) => l.leg.expiry !== todayStr);
  const allBelowMinDTE =
    nonSameDayDte.length > 0 && nonSameDayDte.every((l) => l.dte < MIN_DTE);
  if (allBelowMinDTE) {
    return {
      valid: false,
      reason: `All legs expire within ${MIN_DTE} trading days — excessive theta risk`,
      warnings,
    };
  }
  const lowDTELegs = nonSameDayDte.filter((l) => l.dte < MIN_DTE);
  if (lowDTELegs.length > 0) {
    for (const { leg, dte } of lowDTELegs) {
      warnings.push(
        `Low DTE: ${leg.action.toUpperCase()} ${leg.type.toUpperCase()} $${leg.strike} exp ${leg.expiry} has only ${dte} trading day(s)`,
      );
    }
  }

  // --- Strike reasonableness ---
  // Determine if a spread (has both buy and sell of same type)
  const hasBuyCall = legs.some((l) => l.action === "buy" && l.type === "call");
  const hasSellCall = legs.some(
    (l) => l.action === "sell" && l.type === "call",
  );
  const hasBuyPut = legs.some((l) => l.action === "buy" && l.type === "put");
  const hasSellPut = legs.some((l) => l.action === "sell" && l.type === "put");
  const isCallSpread = hasBuyCall && hasSellCall;
  const isPutSpread = hasBuyPut && hasSellPut;

  for (const leg of legs) {
    const isPartOfSpread =
      (leg.type === "call" && isCallSpread) ||
      (leg.type === "put" && isPutSpread);
    // For spread protective (buy) legs, relax the check
    if (isPartOfSpread && leg.action === "buy") continue;

    const otmPct =
      leg.type === "call"
        ? (leg.strike - currentPrice) / currentPrice
        : (currentPrice - leg.strike) / currentPrice;

    if (otmPct > MAX_OTM_PCT) {
      return {
        valid: false,
        reason: `Strike $${leg.strike} is ${(otmPct * 100).toFixed(0)}% OTM from current price $${currentPrice.toFixed(2)} — unreasonably far out`,
        warnings,
      };
    }
  }

  // --- Premium sanity ---
  for (const leg of legs) {
    if (leg.premium <= 0 && leg.action === "buy") {
      return {
        valid: false,
        reason: `Buy leg has non-positive premium: $${leg.premium} for ${leg.type.toUpperCase()} $${leg.strike}`,
        warnings,
      };
    }
    if (leg.premium > currentPrice * 0.5) {
      return {
        valid: false,
        reason: `Leg premium $${leg.premium.toFixed(2)} exceeds 50% of stock price $${currentPrice.toFixed(2)}`,
        warnings,
      };
    }
  }

  // --- Strategy consistency (Story 19.5) ---
  if (strategyName) {
    const consistency = validateStrategyConsistency(strategyName, legs);
    if (!consistency.valid)
      return {
        valid: false,
        reason: consistency.reason,
        warnings: [...warnings, ...consistency.warnings],
      };
    warnings.push(...consistency.warnings);
  }

  return { valid: true, warnings };
}

// ============================================================
// Open a new position
// ============================================================

interface OpenPositionInput {
  ticker: string;
  decision: TradeDecision;
  sourceAnalysisId?: number;
  sourceWhaleId?: number;
}

export async function openPosition(
  input: OpenPositionInput,
): Promise<number | null> {
  const portfolio = await getOrCreatePortfolio();

  const netCost = Math.abs(input.decision.adjusted_entry.net_premium);
  if (netCost > portfolio.balance * 0.25) {
    console.warn(
      `[SimEngine] Skipping ${input.ticker}: cost $${netCost.toFixed(2)} exceeds 25% of balance $${portfolio.balance.toFixed(2)}`,
    );
    return null;
  }

  if (netCost > portfolio.balance) {
    console.warn(`[SimEngine] Insufficient balance for ${input.ticker}`);
    return null;
  }

  // Determine direction from legs
  const legs = input.decision.adjusted_entry.legs;
  const direction = inferDirection(legs);

  const [trade] = await db
    .insert(simTrades)
    .values({
      ticker: input.ticker,
      strategyName: input.decision.adjusted_entry.strategy_name,
      direction,
      legs: JSON.stringify(legs),
      entryPrice: input.decision.adjusted_entry.net_premium,
      entryDate: new Date().toISOString(),
      quantity: 1,
      status: "open",
      geminiReasoning: JSON.stringify(input.decision),
      profitTargetPct: input.decision.exit_plan.profit_target_pct,
      stopLossPct: input.decision.exit_plan.stop_loss_pct,
      timeExitDays: input.decision.exit_plan.time_exit_days,
      sourceAnalysisId: input.sourceAnalysisId ?? null,
      sourceWhaleId: input.sourceWhaleId ?? null,
    })
    .returning();

  // Deduct cost from balance (for debit trades)
  if (input.decision.adjusted_entry.net_premium > 0) {
    await db
      .update(simPortfolio)
      .set({
        balance: portfolio.balance - netCost,
        totalTrades: portfolio.totalTrades + 1,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(simPortfolio.id, portfolio.id));
  } else {
    // Credit trade: add premium received
    await db
      .update(simPortfolio)
      .set({
        balance:
          portfolio.balance +
          Math.abs(input.decision.adjusted_entry.net_premium),
        totalTrades: portfolio.totalTrades + 1,
        lastUpdated: new Date().toISOString(),
      })
      .where(eq(simPortfolio.id, portfolio.id));
  }

  console.log(
    `[SimEngine] Opened ${input.decision.adjusted_entry.strategy_name} on ${input.ticker} ` +
      `(trade #${trade.id}, cost: $${netCost.toFixed(2)})`,
  );

  return trade.id;
}

// ============================================================
// Evaluate open positions for exit
// ============================================================

export async function evaluateOpenPositions(): Promise<number> {
  const openTrades = await db
    .select()
    .from(simTrades)
    .where(eq(simTrades.status, "open"));

  if (openTrades.length === 0) {
    console.log("[SimEngine] No open positions to evaluate");
    return 0;
  }

  console.log(`[SimEngine] Evaluating ${openTrades.length} open positions`);

  let closedCount = 0;

  for (const trade of openTrades) {
    try {
      const result = await evaluateSinglePosition(trade);
      if (result.shouldClose) {
        await closePosition(trade.id, result.exitPrice, result.reason);
        closedCount++;
      }
    } catch (err) {
      console.error(`[SimEngine] Error evaluating trade #${trade.id}:`, err);
    }
  }

  return closedCount;
}

interface EvalResult {
  shouldClose: boolean;
  exitPrice: number;
  reason: string;
}

async function evaluateSinglePosition(
  trade: typeof simTrades.$inferSelect,
): Promise<EvalResult> {
  const noClose: EvalResult = { shouldClose: false, exitPrice: 0, reason: "" };

  // Check time-based exit first
  const entryDate = new Date(trade.entryDate);
  const daysSinceEntry =
    (Date.now() - entryDate.getTime()) / (1000 * 60 * 60 * 24);
  const timeExitDays = trade.timeExitDays ?? 14;

  if (daysSinceEntry >= timeExitDays) {
    const currentPrice = await estimatePositionValue(trade);
    return {
      shouldClose: true,
      exitPrice: currentPrice,
      reason: "time_exit",
    };
  }

  // Check expiry — if any leg expires today or before, close
  const legs: SimLeg[] = JSON.parse(trade.legs);
  const earliestExpiry = legs.reduce((earliest, leg) => {
    const exp = new Date(leg.expiry);
    return exp < earliest ? exp : earliest;
  }, new Date("2099-12-31"));

  if (earliestExpiry <= new Date()) {
    return {
      shouldClose: true,
      exitPrice: 0, // expired worthless (simplified)
      reason: "expiry",
    };
  }

  // Check profit target / stop loss
  const currentValue = await estimatePositionValue(trade);
  const entryPrice = trade.entryPrice;

  if (entryPrice === 0) return noClose;

  const pnlPct = ((currentValue - entryPrice) / Math.abs(entryPrice)) * 100;
  const profitTarget = trade.profitTargetPct ?? 50;
  const stopLoss = trade.stopLossPct ?? 30;

  if (pnlPct >= profitTarget) {
    return {
      shouldClose: true,
      exitPrice: currentValue,
      reason: "profit_target",
    };
  }

  if (pnlPct <= -stopLoss) {
    return {
      shouldClose: true,
      exitPrice: currentValue,
      reason: "stop_loss",
    };
  }

  return noClose;
}

// ============================================================
// Estimate current value of a position
// ============================================================

async function estimatePositionValue(
  trade: typeof simTrades.$inferSelect,
): Promise<number> {
  const legs: SimLeg[] = JSON.parse(trade.legs);

  // Try to get current options prices
  const chain = await fetchOptionsChain(trade.ticker);
  if (!chain) {
    // Fallback: use stock price movement to estimate
    return estimateFromStockPrice(trade, legs);
  }

  let totalValue = 0;
  for (const leg of legs) {
    const contracts =
      leg.type === "call"
        ? chain.nearestExpiry.calls
        : chain.nearestExpiry.puts;

    // Find matching contract by strike (closest)
    const match = contracts.reduce(
      (best, c) => {
        const diff = Math.abs(c.strike - leg.strike);
        return diff < best.diff ? { contract: c, diff } : best;
      },
      { contract: contracts[0], diff: Infinity },
    );

    if (match.contract) {
      const midPrice = (match.contract.bid + match.contract.ask) / 2;
      const contractValue = midPrice * 100 * leg.quantity;
      totalValue += leg.action === "buy" ? contractValue : -contractValue;
    }
  }

  return totalValue;
}

async function estimateFromStockPrice(
  trade: typeof simTrades.$inferSelect,
  legs: SimLeg[],
): Promise<number> {
  const [marketData] = await fetchMarketData([trade.ticker]);
  if (!marketData) return trade.entryPrice;

  const currentPrice = marketData.price;

  // Simple intrinsic value estimation
  let totalValue = 0;
  for (const leg of legs) {
    let intrinsic = 0;
    if (leg.type === "call") {
      intrinsic = Math.max(0, currentPrice - leg.strike);
    } else {
      intrinsic = Math.max(0, leg.strike - currentPrice);
    }
    const contractValue = intrinsic * 100 * leg.quantity;
    totalValue += leg.action === "buy" ? contractValue : -contractValue;
  }

  return totalValue;
}

// ============================================================
// Close a position
// ============================================================

export async function closePosition(
  tradeId: number,
  exitPrice: number,
  reason: string,
): Promise<void> {
  const [trade] = await db
    .select()
    .from(simTrades)
    .where(and(eq(simTrades.id, tradeId), eq(simTrades.status, "open")));

  if (!trade) return;

  const pnl = exitPrice - trade.entryPrice;
  const pnlPct =
    trade.entryPrice !== 0
      ? ((exitPrice - trade.entryPrice) / Math.abs(trade.entryPrice)) * 100
      : 0;

  await db
    .update(simTrades)
    .set({
      exitPrice,
      exitDate: new Date().toISOString(),
      pnl,
      pnlPct,
      status: "closed",
      exitReason: reason,
    })
    .where(eq(simTrades.id, tradeId));

  // Update portfolio stats
  const portfolio = await getOrCreatePortfolio();
  const isWin = pnl > 0;
  const newBalance = portfolio.balance + pnl;
  const drawdown =
    ((portfolio.startingBalance - newBalance) / portfolio.startingBalance) *
    100;

  await db
    .update(simPortfolio)
    .set({
      balance: newBalance,
      totalPnl: portfolio.totalPnl + pnl,
      winningTrades: isWin
        ? portfolio.winningTrades + 1
        : portfolio.winningTrades,
      losingTrades: isWin ? portfolio.losingTrades : portfolio.losingTrades + 1,
      maxDrawdown: Math.max(portfolio.maxDrawdown, drawdown > 0 ? drawdown : 0),
      bestTradePnl: pnl > portfolio.bestTradePnl ? pnl : portfolio.bestTradePnl,
      worstTradePnl:
        pnl < portfolio.worstTradePnl ? pnl : portfolio.worstTradePnl,
      lastUpdated: new Date().toISOString(),
    })
    .where(eq(simPortfolio.id, portfolio.id));

  console.log(
    `[SimEngine] Closed trade #${tradeId} (${trade.ticker}): P&L $${pnl.toFixed(2)} (${pnlPct.toFixed(1)}%), reason: ${reason}`,
  );
}

// ============================================================
// Snapshot equity curve
// ============================================================

export async function takePortfolioSnapshot(): Promise<void> {
  const portfolio = await getOrCreatePortfolio();
  const openCount = await db
    .select()
    .from(simTrades)
    .where(eq(simTrades.status, "open"));

  await db.insert(simPortfolioSnapshots).values({
    balance: portfolio.balance,
    totalPnl: portfolio.totalPnl,
    openPositions: openCount.length,
    snapshotDate: new Date().toISOString().split("T")[0],
  });

  console.log(
    `[SimEngine] Snapshot: balance=$${portfolio.balance.toFixed(2)}, P&L=$${portfolio.totalPnl.toFixed(2)}, open=${openCount.length}`,
  );
}

// ============================================================
// Helpers
// ============================================================

function inferDirection(legs: SimLeg[]): string {
  // Simple heuristic: if net delta is positive → bullish, negative → bearish
  let netDeltaSign = 0;
  for (const leg of legs) {
    const sign = leg.action === "buy" ? 1 : -1;
    const typeSign = leg.type === "call" ? 1 : -1;
    netDeltaSign += sign * typeSign * leg.quantity;
  }
  if (netDeltaSign > 0) return "bullish";
  if (netDeltaSign < 0) return "bearish";
  return "neutral";
}

export function getOpenPositionsSummary(
  trades: Array<typeof simTrades.$inferSelect>,
) {
  return trades
    .filter((t) => t.status === "open")
    .map((t) => ({
      ticker: t.ticker,
      direction: t.direction,
      entryPrice: t.entryPrice,
      currentPnlPct: 0, // Will be updated during evaluation
    }));
}

// ============================================================
// Batch position valuation (for exit monitor)
// ============================================================

/** Mutex: true while positions are being evaluated (prevents concurrent runs) */
let isEvaluatingPositions = false;
export function getIsEvaluating(): boolean {
  return isEvaluatingPositions;
}

/**
 * Batch-evaluate all open positions using a single batch quote call.
 * Returns valuations including near-threshold flags.
 * Only fetches the full options chain for positions near an exit trigger.
 */
export async function batchEvaluatePositions(): Promise<PositionValuation[]> {
  if (isEvaluatingPositions) {
    console.log("[ExitMonitor] Evaluation already in progress, skipping");
    return [];
  }

  isEvaluatingPositions = true;
  try {
    const openTrades = await db
      .select()
      .from(simTrades)
      .where(eq(simTrades.status, "open"));

    if (openTrades.length === 0) return [];

    // Batch quote: one API call for all tickers
    const tickers = [...new Set(openTrades.map((t) => t.ticker))];
    const quotes = await fetchMarketData(tickers);
    recordApiCall("yahoo", 1); // batch quote = 1 call
    const priceMap = new Map(quotes.map((q) => [q.ticker, q.price]));

    const valuations: PositionValuation[] = [];

    for (const trade of openTrades) {
      const entryDate = new Date(trade.entryDate);
      const daysHeld =
        (Date.now() - entryDate.getTime()) / (1000 * 60 * 60 * 24);
      const timeExitDays = trade.timeExitDays ?? 14;
      const profitTarget = trade.profitTargetPct ?? 50;
      const stopLoss = trade.stopLossPct ?? 30;

      // Check expiry
      const legs: SimLeg[] = JSON.parse(trade.legs);
      const earliestExpiry = legs.reduce((earliest, leg) => {
        const exp = new Date(leg.expiry);
        return exp < earliest ? exp : earliest;
      }, new Date("2099-12-31"));

      if (earliestExpiry <= new Date()) {
        valuations.push({
          tradeId: trade.id,
          ticker: trade.ticker,
          currentValue: 0,
          pnlPct: -100,
          daysHeld,
          nearExitThreshold: true,
          exitTriggered: true,
          exitReason: "expiry",
        });
        continue;
      }

      // Check time exit
      if (daysHeld >= timeExitDays) {
        // Need current value — fetch options chain for this one
        const currentValue = await estimatePositionValue(trade);
        recordApiCall("yahoo", 1);
        valuations.push({
          tradeId: trade.id,
          ticker: trade.ticker,
          currentValue,
          pnlPct:
            trade.entryPrice !== 0
              ? ((currentValue - trade.entryPrice) /
                  Math.abs(trade.entryPrice)) *
                100
              : 0,
          daysHeld,
          nearExitThreshold: true,
          exitTriggered: true,
          exitReason: "time_exit",
        });
        continue;
      }

      // Quick estimate from stock price to check proximity
      const stockPrice = priceMap.get(trade.ticker);
      if (!stockPrice) {
        valuations.push({
          tradeId: trade.id,
          ticker: trade.ticker,
          currentValue: trade.entryPrice,
          pnlPct: 0,
          daysHeld,
          nearExitThreshold: false,
          exitTriggered: false,
          exitReason: null,
        });
        continue;
      }

      // Quick intrinsic value estimate from stock price
      let quickValue = 0;
      for (const leg of legs) {
        let intrinsic = 0;
        if (leg.type === "call") {
          intrinsic = Math.max(0, stockPrice - leg.strike);
        } else {
          intrinsic = Math.max(0, leg.strike - stockPrice);
        }
        const contractValue = intrinsic * 100 * leg.quantity;
        quickValue += leg.action === "buy" ? contractValue : -contractValue;
      }

      const quickPnlPct =
        trade.entryPrice !== 0
          ? ((quickValue - trade.entryPrice) / Math.abs(trade.entryPrice)) * 100
          : 0;

      // "Near threshold" = within 80% of any exit trigger
      const nearProfit = quickPnlPct >= profitTarget * 0.8;
      const nearStop = quickPnlPct <= -(stopLoss * 0.8);
      const nearTime = daysHeld >= timeExitDays * 0.8;
      const nearThreshold = nearProfit || nearStop || nearTime;

      // If near threshold, do a full options chain evaluation for precision
      if (nearThreshold) {
        const preciseValue = await estimatePositionValue(trade);
        recordApiCall("yahoo", 1);

        const precisePnlPct =
          trade.entryPrice !== 0
            ? ((preciseValue - trade.entryPrice) / Math.abs(trade.entryPrice)) *
              100
            : 0;

        let exitReason: string | null = null;
        let exitTriggered = false;

        if (precisePnlPct >= profitTarget) {
          exitTriggered = true;
          exitReason = "profit_target";
        } else if (precisePnlPct <= -stopLoss) {
          exitTriggered = true;
          exitReason = "stop_loss";
        }

        valuations.push({
          tradeId: trade.id,
          ticker: trade.ticker,
          currentValue: preciseValue,
          pnlPct: precisePnlPct,
          daysHeld,
          nearExitThreshold: true,
          exitTriggered,
          exitReason,
        });
      } else {
        valuations.push({
          tradeId: trade.id,
          ticker: trade.ticker,
          currentValue: quickValue,
          pnlPct: quickPnlPct,
          daysHeld,
          nearExitThreshold: false,
          exitTriggered: false,
          exitReason: null,
        });
      }
    }

    return valuations;
  } finally {
    isEvaluatingPositions = false;
  }
}
