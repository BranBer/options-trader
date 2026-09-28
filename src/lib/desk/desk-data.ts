/**
 * Story S6 — builds the `DeskResponse` contract (src/types/desk.ts) from the
 * paper_trades / desk_runs tables plus the existing Jev calibration and LLM
 * routing status services.
 */
import { desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deskRuns, paperTrades } from "@/lib/db/schema";
import { getJevCalibration } from "@/lib/services/jev-judgments";
import { getLlmRoutingStatus } from "@/lib/services/llm-client";
import { hasJevKey } from "@/lib/services/jev-client";
import { buildStrategy, computeForwardStats } from "@/lib/desk/strategies";
import { resolveAsOf } from "@/lib/desk/run-desk";
import type {
  DeskResponse,
  DeskRunSummary,
  JevCalibrationSummary,
  PaperTrade,
  StrategyId,
} from "@/types/desk";

const STRATEGY_IDS: StrategyId[] = [
  "earnings_iron_fly",
  "cheap_vol_straddle",
  "whale_follow",
  "llm_recommendation",
  "rec_trend",
];

const RECENT_CLOSED_LIMIT = 50;

function toPaperTrade(row: typeof paperTrades.$inferSelect): PaperTrade {
  return {
    id: row.id,
    strategy: row.strategy as StrategyId,
    ticker: row.ticker,
    status: row.status as "open" | "closed",
    entryDate: row.entryDate,
    plannedExit: row.plannedExit,
    exitDate: row.exitDate ?? null,
    exitReason: row.exitReason ?? null,
    legs: JSON.parse(row.legs),
    entryValue: row.entryValue,
    risk: row.risk,
    markValue: row.markValue ?? null,
    pnl: row.pnl ?? null,
    ret: row.ret ?? null,
    context: JSON.parse(row.context || "{}"),
  };
}

async function getLastRun(): Promise<DeskRunSummary | null> {
  const rows = await db.select().from(deskRuns).orderBy(desc(deskRuns.id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? null,
    opened: row.opened,
    marked: row.marked,
    closed: row.closed,
    errors: JSON.parse(row.errors || "[]"),
  };
}

function toClaudeCooldownIso(cooldownUntilMs: number): string | null {
  return cooldownUntilMs > Date.now() ? new Date(cooldownUntilMs).toISOString() : null;
}

/** Builds the full DeskResponse contract. Never throws — degrades individual sections rather than failing the whole response. */
export async function buildDeskResponse(): Promise<DeskResponse> {
  const [asOf, allTrades, lastRun, calibrationRows] = await Promise.all([
    resolveAsOf(),
    db.select().from(paperTrades),
    getLastRun(),
    getJevCalibration(),
  ]);

  const open: PaperTrade[] = [];
  const closedByStrategy = Object.fromEntries(STRATEGY_IDS.map((id) => [id, [] as PaperTrade[]])) as Record<StrategyId, PaperTrade[]>;
  const openCountByStrategy = Object.fromEntries(STRATEGY_IDS.map((id) => [id, 0])) as Record<StrategyId, number>;

  for (const row of allTrades) {
    const trade = toPaperTrade(row);
    if (trade.status === "open") {
      open.push(trade);
      if (STRATEGY_IDS.includes(trade.strategy)) openCountByStrategy[trade.strategy]++;
    } else if (STRATEGY_IDS.includes(trade.strategy)) {
      closedByStrategy[trade.strategy].push(trade);
    }
  }

  const strategies = STRATEGY_IDS.map((id) => {
    const closed = closedByStrategy[id];
    const forward = computeForwardStats(
      closed.map((t) => t.ret).filter((r): r is number => r != null),
      closed.map((t) => t.pnl).filter((p): p is number => p != null),
      openCountByStrategy[id],
    );
    return buildStrategy(id, forward);
  });

  const allClosedSorted = STRATEGY_IDS.flatMap((id) => closedByStrategy[id])
    .sort((a, b) => (b.exitDate ?? "").localeCompare(a.exitDate ?? ""))
    .slice(0, RECENT_CLOSED_LIMIT);

  const calibration: JevCalibrationSummary[] = calibrationRows.map((row) => ({
    contextType: row.contextType,
    questionId: row.questionId,
    n: row.n,
    hitRate: row.hitRate,
    brier: row.brier,
  }));

  const routing = getLlmRoutingStatus();

  return {
    asOf,
    lastRun,
    strategies,
    open,
    recentClosed: allClosedSorted,
    calibration,
    system: {
      llmPrimary: routing.primary,
      claudeModel: routing.claudeModel,
      claudeCooldownUntil: toClaudeCooldownIso(routing.claudeCooldownUntil),
      lastClaudeError: routing.lastClaudeError,
      jevConfigured: hasJevKey(),
      unusualWhalesConfigured: !!process.env.UNUSUAL_WHALES_API_KEY,
    },
  };
}
