import { desc, eq, isNotNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import {
  marketPulseClassifications,
  marketPulseCorrelations,
  marketPulseNarratives,
  marketPulseRuns,
  newsEvents,
  whaleAlerts,
} from "@/lib/db/schema";
import {
  getTrackedTickers,
  MARKET_PULSE_INTERVAL_MS,
} from "@/lib/services/market-pulse-scheduler";
import { fetchHistoricalData } from "@/lib/services/market-fetcher";
import { fetchIntraday15mCandles } from "@/lib/services/market-pulse-candles";
import { getTickerProgress } from "@/lib/services/market-pulse-progress";

export const dynamic = "force-dynamic";

export type MarketPulseApiTickerState = {
  ticker: string;
  status: "pending" | "running" | "success" | "partial" | "error";
  lastRunId: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  /** Progress info — non-null only while status === "running" */
  progress: {
    pct: number;
    currentStage: string | null;
  } | null;
  /** Error message from the last run — non-null only when status is "error" or "partial" */
  errorMessage: string | null;
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  /** Daily candles shown while status === "pending" (no pulse run yet) */
  fallbackCandles: Array<{
    time: string | number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  classifications: Array<{
    id: number;
    candleTime: string;
    eventBlurb: string;
    significance: string;
    tradability: string;
    level: string;
    classification: Record<string, unknown>;
  }>;
  correlations: Array<{
    id: number;
    candleTime: string;
    priceEvent: string;
    externalEventType: string;
    externalEventSummary: string;
    correlationConfidence: number;
    sentiment: string;
    reasoning: string | null;
    externalEventPayload: Record<string, unknown> | null;
  }>;
  narrative: {
    currentControl: string;
    controlStrength: number;
    marketPhase: string;
    expectedBehavior: string;
    narrativeSummary: string;
    keyConflicts: string[];
    confidenceInAssessment: number | null;
    createdAt: string | null;
  } | null;
};

export type MarketPulseStateResponse = {
  subscriptions: string[];
  candidates: string[];
  intervalMs: number;
  tickers: MarketPulseApiTickerState[];
};

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseStringArray(value: string | null | undefined): string[] {
  const parsed = parseJson<unknown>(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function candleTimeToSeconds(time: string | number): number {
  if (typeof time === "number") {
    return time > 10_000_000_000 ? Math.floor(time / 1000) : time;
  }

  return Math.floor(new Date(time).getTime() / 1000);
}

function normalizeRequestedTickers(raw: string | null): string[] | null {
  if (!raw) return null;

  const requested = [
    ...new Set(
      raw
        .split(",")
        .map((ticker) => ticker.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  return requested.length > 0 ? requested : null;
}

function sortTickersBySubscriptionOrder(
  subscriptions: string[],
  tickers: string[],
): string[] {
  const order = new Map(subscriptions.map((ticker, index) => [ticker, index]));
  return [...tickers].sort(
    (left, right) => (order.get(left) ?? 999) - (order.get(right) ?? 999),
  );
}

async function getCandidateTickers(
  activeSubscriptions: string[],
): Promise<string[]> {
  const [recentWhales, recentNews] = await Promise.all([
    db
      .select({ ticker: whaleAlerts.ticker })
      .from(whaleAlerts)
      .orderBy(desc(whaleAlerts.createdAt))
      .limit(24),
    db
      .select({ tickers: newsEvents.tickers })
      .from(newsEvents)
      .where(isNotNull(newsEvents.tickers))
      .orderBy(desc(newsEvents.createdAt))
      .limit(16),
  ]);

  const candidates = new Set<string>(activeSubscriptions);
  for (const row of recentWhales) {
    if (row.ticker?.trim()) {
      candidates.add(row.ticker.trim().toUpperCase());
    }
  }

  for (const row of recentNews) {
    for (const ticker of parseStringArray(row.tickers)) {
      candidates.add(ticker.trim().toUpperCase());
    }
  }

  return [...candidates].slice(0, 20);
}

async function buildTickerState(
  ticker: string,
): Promise<MarketPulseApiTickerState> {
  const runs = await db
    .select()
    .from(marketPulseRuns)
    .where(eq(marketPulseRuns.ticker, ticker))
    .orderBy(desc(marketPulseRuns.createdAt))
    .limit(1);

  const latestRun = runs[0] ?? null;
  if (!latestRun) {
    // Fetch 30 days of daily candles as a chart placeholder while pending
    const fallbackCandles = await fetchHistoricalData(ticker, "1mo");
    return {
      ticker,
      status: "pending",
      lastRunId: null,
      lastRunAt: null,
      nextRunAt: null,
      progress: null,
      errorMessage: null,
      candles: [],
      fallbackCandles,
      classifications: [],
      correlations: [],
      narrative: null,
    };
  }

  const [classificationRows, correlationRows, narrativeRows, candles] =
    await Promise.all([
      db
        .select()
        .from(marketPulseClassifications)
        .where(eq(marketPulseClassifications.runId, latestRun.runId)),
      db
        .select()
        .from(marketPulseCorrelations)
        .where(eq(marketPulseCorrelations.runId, latestRun.runId)),
      db
        .select()
        .from(marketPulseNarratives)
        .where(eq(marketPulseNarratives.runId, latestRun.runId))
        .limit(1),
      fetchIntraday15mCandles(ticker),
    ]);

  const classifications = classificationRows
    .map((row) => ({
      id: row.id,
      candleTime: row.candleTime,
      eventBlurb: row.eventBlurb,
      significance: row.significance,
      tradability: row.tradability,
      level: row.level,
      classification:
        parseJson<Record<string, unknown>>(row.classification) ?? {},
    }))
    .sort((left, right) => left.candleTime.localeCompare(right.candleTime));

  const correlations = correlationRows
    .map((row) => ({
      id: row.id,
      candleTime: row.candleTime,
      priceEvent: row.priceEvent,
      externalEventType: row.externalEventType,
      externalEventSummary: row.externalEventSummary,
      correlationConfidence: row.correlationConfidence,
      sentiment: row.sentiment,
      reasoning: row.reasoning,
      externalEventPayload: parseJson<Record<string, unknown>>(
        row.externalEventPayload,
      ),
    }))
    .sort((left, right) => left.candleTime.localeCompare(right.candleTime));

  const narrativeRow = narrativeRows[0] ?? null;
  const narrative =
    narrativeRow == null
      ? null
      : {
          currentControl: narrativeRow.currentControl,
          controlStrength: narrativeRow.controlStrength,
          marketPhase: narrativeRow.marketPhase,
          expectedBehavior: narrativeRow.expectedBehavior,
          narrativeSummary: narrativeRow.narrativeSummary,
          keyConflicts: parseStringArray(narrativeRow.keyConflicts),
          confidenceInAssessment: narrativeRow.confidenceInAssessment,
          createdAt: narrativeRow.createdAt,
        };

  // Safety net: if the DB says "running" but the run started more than 15 min
  // ago, the process that owned it is gone.  Report "error" to the client so
  // the user can retry instead of staring at a stuck spinner.
  let effectiveStatus = latestRun.status as MarketPulseApiTickerState["status"];
  if (effectiveStatus === "running") {
    const startedMs = new Date(latestRun.startedAt).getTime();
    const ageMs = Date.now() - startedMs;
    if (ageMs > 15 * 60 * 1000) {
      effectiveStatus = "error";
    }
  }

  // Build progress info for running tickers.
  // Prefer the in-memory store (sub-second updates) and fall back to DB columns.
  let progress: MarketPulseApiTickerState["progress"] = null;
  if (effectiveStatus === "running") {
    const mem = getTickerProgress(ticker);
    if (mem) {
      progress = {
        pct: mem.pct,
        currentStage: mem.stages.find((s) => s.status === "active")?.id ?? null,
      };
    } else {
      // In-memory store was lost (restart) — use DB columns
      progress = {
        pct: latestRun.progressPct ?? 0,
        currentStage: latestRun.currentStage ?? null,
      };
    }
  }

  // Derive error message — include a user-friendly note when the safety net
  // upgraded a stale "running" to "error".
  let errorMessage: string | null = latestRun.errorMessage;
  if (
    effectiveStatus === "error" &&
    latestRun.status === "running" &&
    !errorMessage
  ) {
    errorMessage =
      "Run interrupted — server restarted. Click Refresh to retry.";
  }

  return {
    ticker,
    status: effectiveStatus,
    lastRunId: latestRun.runId,
    lastRunAt: latestRun.completedAt ?? latestRun.startedAt,
    nextRunAt:
      latestRun.completedAt != null
        ? new Date(
            new Date(latestRun.completedAt).getTime() +
              MARKET_PULSE_INTERVAL_MS,
          ).toISOString()
        : null,
    progress,
    errorMessage,
    candles,
    fallbackCandles: [],
    classifications,
    correlations,
    narrative,
  };
}

export async function GET(req: NextRequest) {
  const subscriptions = await getTrackedTickers();
  const requested = normalizeRequestedTickers(
    req.nextUrl.searchParams.get("tickers"),
  );
  const tickers = requested
    ? subscriptions.filter((ticker) => requested.includes(ticker))
    : subscriptions;
  const orderedTickers = sortTickersBySubscriptionOrder(subscriptions, tickers);

  const [states, candidates] = await Promise.all([
    Promise.all(orderedTickers.map((ticker) => buildTickerState(ticker))),
    getCandidateTickers(subscriptions),
  ]);

  return NextResponse.json({
    subscriptions,
    candidates,
    intervalMs: MARKET_PULSE_INTERVAL_MS,
    tickers: states,
  } satisfies MarketPulseStateResponse);
}
