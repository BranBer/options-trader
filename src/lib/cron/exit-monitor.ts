/**
 * Near-real-time exit monitor — runs every 5 minutes during market hours
 * to check open positions for exit triggers.
 *
 * Key design choices:
 * - Market-hours-only polling to conserve API budget
 * - Batch quotes (1 API call for all tickers)
 * - Conditional deep check only for positions near exit thresholds
 * - Mutex with main pipeline to prevent concurrent evaluation
 */

import {
  batchEvaluatePositions,
  closePosition,
  takePortfolioSnapshot,
  getIsEvaluating,
} from "@/lib/services/sim-engine";
import { isMarketOpen } from "@/lib/utils/market-hours";
import { isOverBudget } from "@/lib/utils/api-budget";

// Exit monitor state (exported for status reporting)
let lastRunAt: string | null = null;
let lastRunResult: ExitMonitorResult | null = null;
let isRunning = false;

export interface ExitMonitorResult {
  timestamp: string;
  skipped: boolean;
  skipReason?: string;
  positionsChecked: number;
  positionsClosed: number;
  closedTrades: Array<{ tradeId: number; ticker: string; reason: string }>;
}

export function getExitMonitorStatus() {
  return {
    lastRunAt,
    lastRunResult,
    isRunning,
  };
}

/**
 * Main entry point — called by cron scheduler every N minutes.
 */
export async function runExitMonitor(): Promise<ExitMonitorResult> {
  const now = new Date().toISOString();

  // Guard: already running
  if (isRunning) {
    return makeSkipped(now, "already_running");
  }

  // Guard: check if enabled via env
  if (process.env.EXIT_MONITOR_ENABLED === "false") {
    return makeSkipped(now, "disabled");
  }

  // Guard: market hours check (skip unless market-hours-only is disabled)
  const marketHoursOnly =
    process.env.EXIT_MONITOR_MARKET_HOURS_ONLY !== "false";
  if (marketHoursOnly) {
    const market = isMarketOpen();
    if (!market.isOpen) {
      return makeSkipped(now, `market_closed:${market.reason}`);
    }
  }

  // Guard: main pipeline is evaluating positions
  if (getIsEvaluating()) {
    return makeSkipped(now, "pipeline_evaluating");
  }

  // Guard: API budget
  if (isOverBudget("yahoo")) {
    return makeSkipped(now, "api_budget_exceeded");
  }

  isRunning = true;
  console.log("[ExitMonitor] Starting evaluation cycle");

  try {
    const valuations = await batchEvaluatePositions();
    const closedTrades: ExitMonitorResult["closedTrades"] = [];

    for (const val of valuations) {
      if (val.exitTriggered && val.exitReason) {
        try {
          await closePosition(val.tradeId, val.currentValue, val.exitReason);
          closedTrades.push({
            tradeId: val.tradeId,
            ticker: val.ticker,
            reason: val.exitReason,
          });
          console.log(
            `[ExitMonitor] Closed trade #${val.tradeId} (${val.ticker}): ${val.exitReason}, P&L ${val.pnlPct.toFixed(1)}%`,
          );
        } catch (err) {
          console.error(
            `[ExitMonitor] Failed to close trade #${val.tradeId}:`,
            err,
          );
        }
      }
    }

    // Take snapshot if any positions were closed
    if (closedTrades.length > 0) {
      await takePortfolioSnapshot();
    }

    const result: ExitMonitorResult = {
      timestamp: now,
      skipped: false,
      positionsChecked: valuations.length,
      positionsClosed: closedTrades.length,
      closedTrades,
    };

    lastRunAt = now;
    lastRunResult = result;
    isRunning = false;

    console.log(
      `[ExitMonitor] Complete: ${valuations.length} checked, ${closedTrades.length} closed`,
    );

    return result;
  } catch (err) {
    console.error("[ExitMonitor] Cycle failed:", err);
    isRunning = false;

    const result: ExitMonitorResult = {
      timestamp: now,
      skipped: false,
      positionsChecked: 0,
      positionsClosed: 0,
      closedTrades: [],
    };
    lastRunAt = now;
    lastRunResult = result;
    return result;
  }
}

function makeSkipped(timestamp: string, reason: string): ExitMonitorResult {
  const result: ExitMonitorResult = {
    timestamp,
    skipped: true,
    skipReason: reason,
    positionsChecked: 0,
    positionsClosed: 0,
    closedTrades: [],
  };
  lastRunAt = timestamp;
  lastRunResult = result;
  return result;
}
