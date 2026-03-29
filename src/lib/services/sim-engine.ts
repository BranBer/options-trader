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
import type {
  GeminiTradeDecision,
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
// Open a new position
// ============================================================

interface OpenPositionInput {
  ticker: string;
  decision: GeminiTradeDecision;
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
