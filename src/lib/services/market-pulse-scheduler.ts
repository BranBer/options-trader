import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { marketPulseRuns, marketPulseSubscriptions } from "@/lib/db/schema";
import { orchestrateTickerPulse } from "@/lib/services/market-pulse-engine";
import { isMarketOpen } from "@/lib/utils/market-hours";
import {
  marketPulseTickerSchema,
  type MarketPulseSubscription,
} from "@/types/market-pulse";

export const MAX_MARKET_PULSE_TICKERS = 4;
export const MARKET_PULSE_INTERVAL_MS = 15 * 60 * 1000;

const schedulerState = globalThis as typeof globalThis & {
  __marketPulseSchedulerStarted?: boolean;
  __marketPulseSchedulerInterval?: ReturnType<typeof setInterval>;
};

const activeRuns = new Set<string>();

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
  const existing = await db
    .select()
    .from(marketPulseSubscriptions)
    .where(eq(marketPulseSubscriptions.ticker, normalizedTicker))
    .limit(1);

  const activeSubscriptions = await getMarketPulseSubscriptions();
  const activeTickers = activeSubscriptions.map(
    (subscription) => subscription.ticker,
  );

  if (activeTickers.includes(normalizedTicker)) {
    return activeTickers;
  }

  if (activeSubscriptions.length >= MAX_MARKET_PULSE_TICKERS) {
    throw new MarketPulseSubscriptionError(
      `You can track at most ${MAX_MARKET_PULSE_TICKERS} tickers on Market Pulse`,
      409,
    );
  }

  const addedAt = new Date().toISOString();

  if (existing.length > 0) {
    await db
      .update(marketPulseSubscriptions)
      .set({ isActive: true, addedAt })
      .where(eq(marketPulseSubscriptions.ticker, normalizedTicker));
  } else {
    await db.insert(marketPulseSubscriptions).values({
      ticker: normalizedTicker,
      addedAt,
      isActive: true,
    });
  }

  return getTrackedTickers();
}

export async function removeTicker(ticker: string): Promise<string[]> {
  const normalizedTicker = normalizeTicker(ticker);

  await db
    .update(marketPulseSubscriptions)
    .set({ isActive: false })
    .where(eq(marketPulseSubscriptions.ticker, normalizedTicker));

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
  if (activeRuns.has(normalizedTicker)) return true;

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

async function runSingleTicker(
  ticker: string,
  trigger: "manual" | "scheduled",
  runId?: string,
): Promise<string> {
  const normalizedTicker = normalizeTicker(ticker);
  const finalRunId = runId ?? crypto.randomUUID();

  if (activeRuns.has(normalizedTicker)) {
    throw new MarketPulseSchedulerError(
      `A Market Pulse run is already active for ${normalizedTicker}`,
      409,
    );
  }

  activeRuns.add(normalizedTicker);
  try {
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

    if (rows.length > 0) {
      throw new MarketPulseSchedulerError(
        `A Market Pulse run is already active for ${normalizedTicker}`,
        409,
      );
    }

    await orchestrateTickerPulse({
      ticker: normalizedTicker,
      trigger,
      runId: finalRunId,
    });
    return finalRunId;
  } finally {
    activeRuns.delete(normalizedTicker);
  }
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

  for (const ticker of tickers) {
    try {
      await runSingleTicker(ticker, trigger);
      completed.push(ticker);
    } catch (error) {
      if (error instanceof MarketPulseSchedulerError && error.status === 409) {
        skipped.push(ticker);
        continue;
      }
      console.error(`[MarketPulseScheduler] ${ticker} failed:`, error);
    }
  }

  return { attempted: tickers, completed, skipped };
}

export function startMarketPulseScheduler(): void {
  if (schedulerState.__marketPulseSchedulerStarted) {
    return;
  }

  schedulerState.__marketPulseSchedulerStarted = true;
  schedulerState.__marketPulseSchedulerInterval = setInterval(() => {
    void runMarketPulseCycle("scheduled");
  }, MARKET_PULSE_INTERVAL_MS);

  void runMarketPulseCycle("scheduled");
}

export function stopMarketPulseScheduler(): void {
  if (schedulerState.__marketPulseSchedulerInterval) {
    clearInterval(schedulerState.__marketPulseSchedulerInterval);
  }
  schedulerState.__marketPulseSchedulerInterval = undefined;
  schedulerState.__marketPulseSchedulerStarted = false;
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
