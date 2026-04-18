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

export const dynamic = "force-dynamic";

export type MarketPulseApiTickerState = {
  ticker: string;
  status: "pending" | "running" | "success" | "partial" | "error";
  lastRunId: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  candles: Array<{
    time: number;
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
    return {
      ticker,
      status: "pending",
      lastRunId: null,
      lastRunAt: null,
      nextRunAt: null,
      candles: [],
      classifications: [],
      correlations: [],
      narrative: null,
    };
  }

  const [classificationRows, correlationRows, narrativeRows] =
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
    ]);

  const candleRows = classificationRows
    .filter((row) => row.level === "candle")
    .sort((left, right) => left.candleTime.localeCompare(right.candleTime));

  const candles = candleRows
    .map((row) => {
      const candleData = parseJson<{
        open: number;
        high: number;
        low: number;
        close: number;
        volume: number;
      }>(row.candleData);

      if (!candleData) return null;
      return {
        time: candleTimeToSeconds(row.candleTime),
        open: candleData.open,
        high: candleData.high,
        low: candleData.low,
        close: candleData.close,
        volume: candleData.volume,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

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

  return {
    ticker,
    status: latestRun.status as MarketPulseApiTickerState["status"],
    lastRunId: latestRun.runId,
    lastRunAt: latestRun.completedAt ?? latestRun.startedAt,
    nextRunAt:
      latestRun.completedAt != null
        ? new Date(
            new Date(latestRun.completedAt).getTime() +
              MARKET_PULSE_INTERVAL_MS,
          ).toISOString()
        : null,
    candles,
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
