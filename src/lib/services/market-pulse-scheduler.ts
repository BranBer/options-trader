import { and, asc, eq, gte, lt, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { marketPulseRuns, marketPulseSubscriptions } from "@/lib/db/schema";
import { orchestrateTickerPulse } from "@/lib/services/market-pulse-engine";
import { isMarketOpen } from "@/lib/utils/market-hours";
import {
  marketPulseTickerSchema,
  type MarketPulseSubscription,
} from "@/types/market-pulse";
import { LOOKBACK_CANDLE_COUNT } from "@/lib/services/market-pulse-candles";
import { finishTickerProgress } from "@/lib/services/market-pulse-progress";

export const MAX_MARKET_PULSE_TICKERS = 4;
export const MARKET_PULSE_INTERVAL_MS = 15 * 60 * 1000;

const schedulerState = globalThis as typeof globalThis & {
  __marketPulseSchedulerStarted?: boolean;
  __marketPulseSchedulerInterval?: ReturnType<typeof setInterval>;
};

const activeRuns = new Set<string>();
/** Tracks when each in-memory run started for staleness detection */
const activeRunStartTimes = new Map<string, number>();
const STALE_RUN_THRESHOLD_MS = 10 * 60 * 1000;
/** Maps ticker → AbortController for the in-flight orchestration promise */
const activeCancellations = new Map<string, AbortController>();
/** Maps ticker → completion promise for drain support */
const activePromises = new Map<string, Promise<unknown>>();

export class MarketPulseSubscriptionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MarketPulseSubscriptionError";
    this.status = status;
  }
}

export class MarketPulseSchedulerError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "MarketPulseSchedulerError";
    this.status = status;
  }
}

/** Abort the in-flight run for a ticker, if one exists. */
export function cancelTicker(ticker: string): void {
  const normalizedTicker = normalizeTicker(ticker);
  activeCancellations.get(normalizedTicker)?.abort();
}

function normalizeTicker(ticker: string): string {
  const parsed = marketPulseTickerSchema.safeParse(ticker);
  if (!parsed.success) {
    throw new MarketPulseSubscriptionError(
      "Ticker must be 1-5 alphabetic characters",
      400,
    );
  }

  return parsed.data;
}

export async function getMarketPulseSubscriptions(): Promise<
  MarketPulseSubscription[]
> {
  const rows = await db
    .select()
    .from(marketPulseSubscriptions)
    .where(eq(marketPulseSubscriptions.isActive, true))
    .orderBy(asc(marketPulseSubscriptions.addedAt));

  return rows;
}

export async function getTrackedTickers(): Promise<string[]> {
  const subscriptions = await getMarketPulseSubscriptions();
  return subscriptions.map((subscription) => subscription.ticker);
}

export async function addTicker(ticker: string): Promise<string[]> {
  const normalizedTicker = normalizeTicker(ticker);

  // Transaction-wrapped read-check-write to prevent TOCTOU races when
  // concurrent addTicker calls arrive for the same ticker.
  const alreadyActive = db.transaction((tx) => {
    const activeSubscriptions = tx
      .select()
      .from(marketPulseSubscriptions)
      .where(eq(marketPulseSubscriptions.isActive, true))
      .orderBy(asc(marketPulseSubscriptions.addedAt))
      .all();

    const activeTickers = activeSubscriptions.map((s) => s.ticker);

    // Idempotent: if already subscribed, return early without error or new run
    if (activeTickers.includes(normalizedTicker)) {
      return true;
    }

    if (activeSubscriptions.length >= MAX_MARKET_PULSE_TICKERS) {
      throw new MarketPulseSubscriptionError(
        `You can track at most ${MAX_MARKET_PULSE_TICKERS} tickers on Market Pulse`,
        409,
      );
    }

    const existing = tx
      .select()
      .from(marketPulseSubscriptions)
      .where(eq(marketPulseSubscriptions.ticker, normalizedTicker))
      .limit(1)
      .all();

    const addedAt = new Date().toISOString();

    if (existing.length > 0) {
      tx.update(marketPulseSubscriptions)
        .set({ isActive: true, addedAt })
        .where(eq(marketPulseSubscriptions.ticker, normalizedTicker))
        .run();
    } else {
      tx.insert(marketPulseSubscriptions)
        .values({
          ticker: normalizedTicker,
          addedAt,
          isActive: true,
        })
        .run();
    }

    return false;
  });

  if (!alreadyActive) {
    // Fire the initial 24h catch-up run non-blocking so the UI populates immediately
    void runSingleTicker(normalizedTicker, "initial").catch((error) => {
      console.error(
        `[MarketPulseScheduler] Initial catch-up failed for ${normalizedTicker}:`,
        error,
      );
    });
  }

  return getTrackedTickers();
}

export async function removeTicker(ticker: string): Promise<string[]> {
  const normalizedTicker = normalizeTicker(ticker);

  // Cancel any in-flight pipeline and clear its progress entry immediately
  cancelTicker(normalizedTicker);
  finishTickerProgress(normalizedTicker, true);

  // Idempotent: if ticker isn't active (or doesn't exist), the UPDATE is a
  // harmless no-op — no error thrown.
  await db
    .update(marketPulseSubscriptions)
    .set({ isActive: false })
    .where(
      and(
        eq(marketPulseSubscriptions.ticker, normalizedTicker),
        eq(marketPulseSubscriptions.isActive, true),
      ),
    );

  return getTrackedTickers();
}

function getEtClock(now: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const parts = Object.fromEntries(
    formatter.map((part) => [part.type, part.value]),
  );
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    dayOfWeek: dayMap[parts.weekday] ?? 0,
    dateStr: `${parts.year}-${parts.month}-${parts.day}`,
    totalMinutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function isWithinMarketPulseWindow(now: Date = new Date()): boolean {
  const marketState = isMarketOpen(now);
  if (marketState.reason === "weekend" || marketState.reason === "holiday") {
    return false;
  }

  const { dayOfWeek, dateStr, totalMinutes } = getEtClock(now);
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  if (!dateStr) return false;

  const open = 9 * 60;
  const close = 16 * 60 + 30;
  return totalMinutes >= open && totalMinutes <= close;
}

export async function isMarketPulseRunActive(ticker: string): Promise<boolean> {
  const normalizedTicker = normalizeTicker(ticker);

  // Evict stale in-memory entries (e.g. hung LLM calls from before a code reload)
  const startedAt = activeRunStartTimes.get(normalizedTicker);
  if (
    activeRuns.has(normalizedTicker) &&
    startedAt != null &&
    Date.now() - startedAt > STALE_RUN_THRESHOLD_MS
  ) {
    activeRuns.delete(normalizedTicker);
    activeRunStartTimes.delete(normalizedTicker);
    activeCancellations.get(normalizedTicker)?.abort();
    activeCancellations.delete(normalizedTicker);
    activePromises.delete(normalizedTicker);
  }

  if (activeRuns.has(normalizedTicker)) return true;

  // Clear stale "running" rows from crashed/restarted processes before checking
  await clearStaleRuns(normalizedTicker);

  const rows = await db
    .select()
    .from(marketPulseRuns)
    .where(
      and(
        eq(marketPulseRuns.ticker, normalizedTicker),
        eq(marketPulseRuns.status, "running"),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * Returns true when the ticker has no successful/partial run in the past 24 hours,
 * meaning a full catch-up window should be used instead of the rolling window.
 */
async function needsInitialCatchUp(ticker: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await db
    .select({ runId: marketPulseRuns.runId })
    .from(marketPulseRuns)
    .where(
      and(
        eq(marketPulseRuns.ticker, ticker),
        gte(marketPulseRuns.startedAt, since),
        or(
          eq(marketPulseRuns.status, "success"),
          eq(marketPulseRuns.status, "partial"),
        ),
      ),
    )
    .limit(1);
  return rows.length === 0;
}

/** Resolve any DB rows stuck at "running" for longer than 10 minutes. */
async function clearStaleRuns(ticker: string): Promise<void> {
  const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await db
    .update(marketPulseRuns)
    .set({
      status: "error",
      errorMessage: "Run timed out (stale — process likely restarted)",
      completedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(marketPulseRuns.ticker, ticker),
        eq(marketPulseRuns.status, "running"),
        lt(marketPulseRuns.startedAt, staleThreshold),
      ),
    );
}

async function runSingleTicker(
  ticker: string,
  trigger: "manual" | "scheduled" | "initial",
  runId?: string,
): Promise<string> {
  const normalizedTicker = normalizeTicker(ticker);
  const finalRunId = runId ?? crypto.randomUUID();

  // Fast in-memory guard — prevents duplicate runs from the same process
  if (activeRuns.has(normalizedTicker)) {
    throw new MarketPulseSchedulerError(
      `A Market Pulse run is already active for ${normalizedTicker}`,
      409,
    );
  }

  // Resolve any DB rows from crashed previous runs before checking the DB guard
  await clearStaleRuns(normalizedTicker);

  // DB guard — check inside a transaction so the read+claim is atomic.
  // This eliminates the TOCTOU race where two calls both pass the SELECT
  // check before either inserts the "running" row.
  const alreadyRunning = db.transaction((tx) => {
    const rows = tx
      .select()
      .from(marketPulseRuns)
      .where(
        and(
          eq(marketPulseRuns.ticker, normalizedTicker),
          eq(marketPulseRuns.status, "running"),
        ),
      )
      .limit(1)
      .all();
    return rows.length > 0;
  });

  if (alreadyRunning) {
    throw new MarketPulseSchedulerError(
      `A Market Pulse run is already active for ${normalizedTicker}`,
      409,
    );
  }

  activeRuns.add(normalizedTicker);
  activeRunStartTimes.set(normalizedTicker, Date.now());
  const controller = new AbortController();
  activeCancellations.set(normalizedTicker, controller);

  const work = (async () => {
    try {
      // For initial and scheduled triggers, check if we need a full 24h catch-up
      const catchUp =
        trigger === "initial" ||
        (trigger === "scheduled" &&
          (await needsInitialCatchUp(normalizedTicker)));

      await orchestrateTickerPulse({
        ticker: normalizedTicker,
        trigger: trigger === "initial" ? "initial" : trigger,
        windowSize: catchUp ? LOOKBACK_CANDLE_COUNT : undefined,
        runId: finalRunId,
        signal: controller.signal,
      });
      return finalRunId;
    } finally {
      activeRuns.delete(normalizedTicker);
      activeRunStartTimes.delete(normalizedTicker);
      activeCancellations.delete(normalizedTicker);
      activePromises.delete(normalizedTicker);
    }
  })();

  activePromises.set(normalizedTicker, work);
  return work;
}

export async function runMarketPulseCycle(
  trigger: "manual" | "scheduled" = "scheduled",
): Promise<{ attempted: string[]; completed: string[]; skipped: string[] }> {
  const tickers = await getTrackedTickers();
  const completed: string[] = [];
  const skipped: string[] = [];

  if (!isWithinMarketPulseWindow()) {
    return { attempted: tickers, completed, skipped: tickers };
  }

  const results = await Promise.allSettled(
    tickers.map(async (ticker) => {
      try {
        await runSingleTicker(ticker, trigger);
        return { ticker, outcome: "completed" as const };
      } catch (error) {
        if (
          error instanceof MarketPulseSchedulerError &&
          error.status === 409
        ) {
          return { ticker, outcome: "skipped" as const };
        }
        console.error(`[MarketPulseScheduler] ${ticker} failed:`, error);
        return { ticker, outcome: "failed" as const };
      }
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value.outcome === "completed")
        completed.push(result.value.ticker);
      else if (result.value.outcome === "skipped")
        skipped.push(result.value.ticker);
    }
  }

  return { attempted: tickers, completed, skipped };
}

export function startMarketPulseScheduler(): void {
  if (schedulerState.__marketPulseSchedulerStarted) {
    return;
  }

  schedulerState.__marketPulseSchedulerStarted = true;

  // Resolve any "running" rows orphaned by a previous process crash/restart
  // before the first cycle fires — this is the ONLY place where we clean up
  // without a 10-minute threshold (any "running" row from before this process
  // started is definitionally orphaned).
  void resolveOrphanedRuns().then(() => {
    void runMarketPulseCycle("scheduled");
  });

  schedulerState.__marketPulseSchedulerInterval = setInterval(() => {
    void runMarketPulseCycle("scheduled");
  }, MARKET_PULSE_INTERVAL_MS);
}

/**
 * Mark ALL "running" rows as "error" — called exactly once on startup.
 * Any row still at "running" when a new process starts is orphaned because
 * the in-memory activeRuns Set that tracks genuine runs was wiped.
 */
export async function resolveOrphanedRuns(): Promise<number> {
  const result = await db
    .update(marketPulseRuns)
    .set({
      status: "error",
      errorMessage: "Orphaned — server restarted",
      completedAt: new Date().toISOString(),
    })
    .where(eq(marketPulseRuns.status, "running"));

  const count = result.changes ?? 0;
  if (count > 0) {
    console.log(
      `[MarketPulseScheduler] Resolved ${count} orphaned "running" row(s) from previous process`,
    );
  }
  return count;
}

export function stopMarketPulseScheduler(): void {
  if (schedulerState.__marketPulseSchedulerInterval) {
    clearInterval(schedulerState.__marketPulseSchedulerInterval);
  }
  schedulerState.__marketPulseSchedulerInterval = undefined;
  schedulerState.__marketPulseSchedulerStarted = false;
}

/**
 * Wait for all in-flight Market Pulse runs to finish (up to `timeoutMs`).
 * Stops the scheduler first so no new runs start, then awaits active promises.
 * Returns true if all runs drained within the timeout.
 */
export async function drainActiveRuns(timeoutMs = 60_000): Promise<boolean> {
  stopMarketPulseScheduler();

  const pending = [...activePromises.values()];
  if (pending.length === 0) return true;

  console.log(
    `[MarketPulseScheduler] Draining ${pending.length} active run(s)…`,
  );

  const settled = Promise.allSettled(pending);
  const timeout = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), timeoutMs),
  );

  const result = await Promise.race([settled, timeout]);
  if (result === "timeout") {
    console.warn(
      `[MarketPulseScheduler] Drain timed out after ${timeoutMs}ms — ` +
        `${activePromises.size} run(s) still active`,
    );
    return false;
  }

  console.log("[MarketPulseScheduler] All runs drained successfully");
  return true;
}

export function requestManualMarketPulseRefresh(ticker: string): {
  runId: string;
  status: "started";
} {
  const normalizedTicker = normalizeTicker(ticker);
  const runId = crypto.randomUUID();

  void runSingleTicker(normalizedTicker, "manual", runId).catch((error) => {
    console.error(
      `[MarketPulseScheduler] Manual refresh failed for ${normalizedTicker}:`,
      error,
    );
  });

  return { runId, status: "started" };
}
