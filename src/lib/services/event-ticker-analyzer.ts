import { and, desc, eq, gte, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  analyses,
  marketSnapshots,
  newsEvents,
  whaleAlerts,
} from "@/lib/db/schema";
import {
  generateDeepDive,
  generateRecommendation,
} from "@/lib/services/llm-analyzer";
import { detectAllIndicatorPatterns } from "@/lib/utils/indicator-patterns";
import {
  computeRealizedVol,
  fetchEarningsDate,
  fetchHistoricalData,
  fetchMarketData,
  fetchOptionsChain,
  fetchVIX,
} from "@/lib/services/market-fetcher";
import {
  getRemainingBudget,
  isOverBudget,
  recordApiCall,
} from "@/lib/utils/api-budget";
import { getEarningsProximity } from "@/lib/utils/earnings-proximity";
import { getFOMCProximity } from "@/lib/utils/fomc-calendar";
import { buildVIXContext } from "@/lib/utils/vix-regimes";
import type {
  Correlation,
  EventTickerAnalysis,
  EventTickerAnalysisEventContext,
  EventTickerAnalysisSummary,
  EventTickerWhaleMatch,
} from "@/types/analysis";
import type { MarketSnapshot, OptionsChainSummary } from "@/types/market";
import type { WhaleAlertRow } from "@/types/whale";
import type { NewsEventRow } from "@/types/news";

const CONCURRENCY = 2;
const HOURS_TO_CACHE = 2;
const HOURS_FOR_WHALES = 48;
const YAHOO_CALLS_PER_TICKER = 8;
const AUTO_TRIGGER_MAX_EVENTS = 3;
const RECENT_HIGH_IMPACT_LOOKBACK_HOURS = 24;

export interface EventTickerAnalysisParams {
  eventId: number;
  tickers: string[];
  eventContext: EventTickerAnalysisEventContext;
}

function uniqueTickers(tickers: string[]): string[] {
  return [
    ...new Set(
      tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean),
    ),
  ].slice(0, 5);
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function toEventContext(event: NewsEventRow): EventTickerAnalysisEventContext {
  return {
    headline: event.headline,
    summary: event.rawSummary ?? undefined,
    sentiment:
      event.sentiment === "bullish" || event.sentiment === "bearish"
        ? event.sentiment
        : "neutral",
    impactScore: event.impactScore ?? 1,
    eventType: event.eventType ?? undefined,
    sectors: parseStringArray(event.sectors),
  };
}

type EligibleEvent = NewsEventRow & { parsedTickers: string[] };

async function triggerEligibleEventAnalyses(
  events: NewsEventRow[],
  options?: { respectEnv?: boolean; maxEvents?: number },
): Promise<number> {
  const { respectEnv = true, maxEvents = AUTO_TRIGGER_MAX_EVENTS } =
    options ?? {};

  if (respectEnv && process.env.EVENT_ANALYSIS_AUTO_TRIGGER !== "true") {
    return 0;
  }

  const eligibleEvents: EligibleEvent[] = events
    .map((event) => ({
      ...event,
      parsedTickers: uniqueTickers(parseStringArray(event.tickers)),
    }))
    .filter(
      (event) =>
        (event.impactScore ?? 0) >= 8 && event.parsedTickers.length > 0,
    )
    .sort((left, right) => (right.impactScore ?? 0) - (left.impactScore ?? 0))
    .slice(0, maxEvents);

  if (eligibleEvents.length === 0) {
    return 0;
  }

  const remainingBudget = getRemainingBudget("yahoo");
  if (remainingBudget < 30) {
    console.warn(
      `[EventTickerAnalyzer] Skipping auto-trigger due to low yahoo budget (${remainingBudget} remaining)`,
    );
    return 0;
  }

  let triggered = 0;
  const timeoutMs = Number(process.env.EVENT_ANALYSIS_TIMEOUT_MS ?? 120000);

  for (const event of eligibleEvents) {
    const cached = await getEventTickerAnalysesByEventId(event.id, {
      sinceHours: HOURS_TO_CACHE,
    });
    if (cached.length >= Math.min(event.parsedTickers.length, 5)) {
      continue;
    }

    await Promise.race([
      analyzeEventTickers({
        eventId: event.id,
        tickers: event.parsedTickers,
        eventContext: toEventContext(event),
      }),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error("Event analysis auto-trigger timed out")),
          timeoutMs,
        );
      }),
    ]);
    triggered += 1;
  }

  return triggered;
}

function getSmartMoneySignal(
  sentiment: EventTickerAnalysisEventContext["sentiment"],
): Correlation["smart_money_signal"] {
  if (sentiment === "bullish") return "bullish";
  if (sentiment === "bearish") return "bearish";
  return "neutral";
}

function getOptionType(
  sentiment: EventTickerAnalysisEventContext["sentiment"],
): "call" | "put" {
  return sentiment === "bearish" ? "put" : "call";
}

function summarizeOptionsChain(chain: OptionsChainSummary | null): string {
  if (!chain) return "No options chain data available";
  return `${chain.expirations.length} expirations, nearest: ${chain.nearestExpiry.date} (${chain.nearestExpiry.calls.length} calls, ${chain.nearestExpiry.puts.length} puts)`;
}

function buildMarketOpenFlag(date: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );
  const totalMinutes = hour * 60 + minute;
  const isWeekday = !["Sat", "Sun"].includes(weekday);
  return isWeekday && totalMinutes >= 9 * 60 + 30 && totalMinutes <= 16 * 60;
}

function buildSyntheticCorrelation(args: {
  ticker: string;
  eventContext: EventTickerAnalysisEventContext;
  whaleAlert?: WhaleAlertRow | null;
}): Correlation {
  const { ticker, eventContext, whaleAlert } = args;
  const optionType =
    whaleAlert?.callPut === "P"
      ? "put"
      : whaleAlert?.callPut === "C"
        ? "call"
        : getOptionType(eventContext.sentiment);
  const confidence = Math.max(0.1, Math.min(1, eventContext.impactScore / 10));

  return {
    whale_trade: {
      ticker,
      strike: whaleAlert?.strike ?? 0,
      expiry: whaleAlert?.expiry ?? "",
      type: optionType,
      premium: whaleAlert?.premium ?? 0,
      volume: whaleAlert?.volume ?? 0,
    },
    related_event: {
      headline: eventContext.headline,
      impact_score: Math.round(eventContext.impactScore),
      event_type: eventContext.eventType ?? "macro_event",
    },
    correlation_confidence: confidence,
    alignment: whaleAlert ? "confirming" : "hedging",
    thesis: eventContext.summary ?? eventContext.headline,
    smart_money_signal: getSmartMoneySignal(eventContext.sentiment),
  };
}

function parseEventTickerAnalysis(row: {
  output: string | null;
  createdAt: string | null;
}): EventTickerAnalysis | null {
  if (!row.output) return null;
  try {
    const parsed = JSON.parse(row.output) as EventTickerAnalysis;
    return {
      ...parsed,
      createdAt: parsed.createdAt ?? row.createdAt,
    };
  } catch {
    return null;
  }
}

async function buildMacroContext() {
  const vixLevel = await fetchVIX();
  recordApiCall("yahoo");
  const vixContext = vixLevel != null ? buildVIXContext(vixLevel) : null;
  const fomc = getFOMCProximity();

  return {
    vixLevel: vixContext?.level ?? null,
    vixRegime: vixContext?.regime,
    fomcNextDate: fomc.nextDate,
    fomcIsDecisionWeek: fomc.isDecisionWeek,
  };
}

function computeOptionsAnalytics(args: {
  chain: OptionsChainSummary | null;
  marketData: MarketSnapshot | null;
  candles3M: Awaited<ReturnType<typeof fetchHistoricalData>>;
}) {
  const { chain, marketData, candles3M } = args;
  let atmIV: number | null = null;
  let realizedVol: number | null = null;
  let ivRvSpread: number | null = null;

  if (chain && marketData && marketData.price > 0) {
    const allContracts = [
      ...chain.nearestExpiry.calls,
      ...chain.nearestExpiry.puts,
    ];
    const atmContracts = allContracts.filter(
      (contract) =>
        contract.iv > 0 &&
        Math.abs(contract.strike - marketData.price) / marketData.price < 0.05,
    );

    if (atmContracts.length > 0) {
      atmIV =
        atmContracts.reduce((sum, contract) => sum + contract.iv, 0) /
        atmContracts.length;
      realizedVol = computeRealizedVol(candles3M);
      if (realizedVol != null) {
        ivRvSpread = atmIV - realizedVol;
      }
    }
  }

  return {
    atmIV,
    realizedVol,
    ivRvSpread,
    optionsAnalytics: chain
      ? {
          maxPain: chain.maxPain ?? null,
          oiWalls: chain.oiWalls ?? null,
          ivRvSpread,
          realizedVol,
          gex: chain.gex ?? null,
        }
      : undefined,
  };
}

function formatWhalePositionSize(whaleAlert: WhaleAlertRow | null): string {
  if (!whaleAlert) {
    return "$0";
  }

  if (
    typeof whaleAlert.premium === "number" &&
    Number.isFinite(whaleAlert.premium)
  ) {
    if (whaleAlert.premium >= 1_000_000) {
      return `$${(whaleAlert.premium / 1_000_000).toFixed(1)}M`;
    }
    if (whaleAlert.premium >= 1_000) {
      return `$${Math.round(whaleAlert.premium / 1_000)}K`;
    }
    return `$${whaleAlert.premium.toFixed(0)}`;
  }

  return "recent whale alert";
}

function enrichWhaleAlignment(args: {
  recommendation: Awaited<ReturnType<typeof generateRecommendation>>;
  whaleMatch: EventTickerWhaleMatch;
  whaleAlert: WhaleAlertRow | null;
}) {
  const { recommendation, whaleMatch, whaleAlert } = args;

  if (!whaleMatch.hasWhaleActivity || !whaleAlert) {
    return {
      ...recommendation,
      whale_alignment: {
        matches_whale: false,
        whale_position_size: "$0",
        similarity_note:
          recommendation.whale_alignment?.similarity_note ||
          "No whale flow detected — event-only signal",
      },
    };
  }

  const optionSide =
    whaleAlert.callPut === "P"
      ? "put"
      : whaleAlert.callPut === "C"
        ? "call"
        : null;
  const recommendationSide =
    recommendation.primary_strategy.legs[0]?.type ?? null;
  const directionalMatch =
    optionSide == null ||
    recommendationSide == null ||
    optionSide === recommendationSide;

  return {
    ...recommendation,
    whale_alignment: {
      matches_whale: directionalMatch,
      whale_position_size: formatWhalePositionSize(whaleAlert),
      similarity_note: directionalMatch
        ? `Recent whale flow confirmed this setup${
            whaleMatch.bestQualityScore != null
              ? ` (quality ${whaleMatch.bestQualityScore}/100)`
              : ""
          }.`
        : `Recent whale flow exists but is not directionally aligned with this setup${
            whaleMatch.bestQualityScore != null
              ? ` (quality ${whaleMatch.bestQualityScore}/100)`
              : ""
          }.`,
    },
  };
}

export async function lookupWhaleActivity(
  ticker: string,
  windowHours: number = HOURS_FOR_WHALES,
): Promise<EventTickerWhaleMatch> {
  const cutoff = new Date(
    Date.now() - windowHours * 60 * 60 * 1000,
  ).toISOString();
  const alerts = await db
    .select()
    .from(whaleAlerts)
    .where(
      and(
        eq(whaleAlerts.ticker, ticker.toUpperCase()),
        gte(whaleAlerts.detectedAt, cutoff),
      ),
    )
    .orderBy(desc(whaleAlerts.qualityScore), desc(whaleAlerts.detectedAt))
    .limit(20);

  return {
    hasWhaleActivity: alerts.length > 0,
    alerts,
    bestQualityScore: alerts[0]?.qualityScore ?? null,
  };
}

export async function getEventTickerAnalysesByEventId(
  eventId: number,
  options?: { sinceHours?: number },
): Promise<EventTickerAnalysis[]> {
  const conditions = [
    eq(analyses.type, "event_ticker_analysis"),
    eq(analyses.source, "event_ticker"),
    like(analyses.inputRefs, `%"eventId":${eventId}%`),
  ];

  if (options?.sinceHours != null) {
    const since = new Date(
      Date.now() - options.sinceHours * 60 * 60 * 1000,
    ).toISOString();
    conditions.push(gte(analyses.createdAt, since));
  }

  const rows = await db
    .select()
    .from(analyses)
    .where(and(...conditions))
    .orderBy(desc(analyses.createdAt));

  const deduped = new Map<string, EventTickerAnalysis>();
  for (const row of rows) {
    const parsed = parseEventTickerAnalysis(row);
    if (parsed && !deduped.has(parsed.ticker)) {
      deduped.set(parsed.ticker, parsed);
    }
  }

  return [...deduped.values()];
}

export async function getAnalyzedEventSummaries(
  limit: number = 20,
): Promise<EventTickerAnalysisSummary[]> {
  const rows = await db
    .select()
    .from(analyses)
    .where(
      and(
        eq(analyses.type, "event_ticker_analysis"),
        eq(analyses.source, "event_ticker"),
      ),
    )
    .orderBy(desc(analyses.createdAt))
    .limit(limit * 3);

  const seen = new Set<number>();
  const summaries: EventTickerAnalysisSummary[] = [];
  for (const row of rows) {
    if (!row.output) continue;
    try {
      const parsed = JSON.parse(row.output) as EventTickerAnalysis;
      if (seen.has(parsed.eventId)) continue;
      seen.add(parsed.eventId);
      const existing = summaries.find(
        (summary) => summary.eventId === parsed.eventId,
      );
      if (existing) continue;
      summaries.push({
        eventId: parsed.eventId,
        headline: parsed.eventContext.headline,
        tickers: [parsed.ticker],
        createdAt: row.createdAt,
      });
      if (summaries.length >= limit) break;
    } catch {
      continue;
    }
  }

  return summaries;
}

export async function getAnalyzedEventIds(
  limit: number = 200,
): Promise<number[]> {
  const summaries = await getAnalyzedEventSummaries(limit);
  return summaries.map((summary) => summary.eventId);
}

async function persistEventTickerAnalysis(args: {
  analysis: EventTickerAnalysis;
  confidence: number;
}) {
  const { analysis, confidence } = args;
  const { eventId, ticker, marketSnapshot, deepDive, recommendation } =
    analysis;

  if (marketSnapshot) {
    await db.insert(marketSnapshots).values({
      ticker: marketSnapshot.ticker,
      price: marketSnapshot.price,
      volume: marketSnapshot.volume,
      iv: marketSnapshot.iv ?? null,
      ivRank: marketSnapshot.ivRank ?? null,
      dayChangePct: marketSnapshot.dayChangePct,
      realizedVol: marketSnapshot.realizedVol ?? null,
      ivRvSpread: marketSnapshot.ivRvSpread ?? null,
    });
  }

  const inputRefs = JSON.stringify({ eventId, ticker, source: "event_ticker" });

  await db.insert(analyses).values({
    type: "deep_dive",
    source: "event_ticker",
    inputRefs,
    output: JSON.stringify(deepDive),
    confidence,
  });

  await db.insert(analyses).values({
    type: "trade_recommendation",
    source: "event_ticker",
    inputRefs,
    output: JSON.stringify(recommendation),
    confidence: recommendation.confidence,
  });

  await db.insert(analyses).values({
    type: "event_ticker_analysis",
    source: "event_ticker",
    inputRefs,
    output: JSON.stringify({
      ...analysis,
      createdAt: new Date().toISOString(),
    }),
    confidence,
  });
}

async function analyzeSingleTicker(args: {
  ticker: string;
  eventId: number;
  eventContext: EventTickerAnalysisEventContext;
  macroBase: Awaited<ReturnType<typeof buildMacroContext>>;
}): Promise<EventTickerAnalysis | null> {
  const { ticker, eventId, eventContext, macroBase } = args;

  const [
    whaleMatch,
    marketDataResults,
    chain,
    earningsDate,
    candles1W,
    candles1M,
    candles3M,
    candles6M,
    candles1Y,
  ] = await Promise.all([
    lookupWhaleActivity(ticker),
    fetchMarketData([ticker]),
    fetchOptionsChain(ticker),
    fetchEarningsDate(ticker),
    fetchHistoricalData(ticker, "1wk"),
    fetchHistoricalData(ticker, "1mo"),
    fetchHistoricalData(ticker, "3mo"),
    fetchHistoricalData(ticker, "6mo"),
    fetchHistoricalData(ticker, "1y"),
  ]);

  recordApiCall("yahoo", YAHOO_CALLS_PER_TICKER);

  const marketData = marketDataResults[0] ?? null;
  const optionsData = computeOptionsAnalytics({
    chain,
    marketData,
    candles3M,
  });
  const indicatorReport = detectAllIndicatorPatterns(candles3M, ticker, "3M");
  const primaryWhale = whaleMatch.alerts[0] ?? null;
  const syntheticCorrelation = buildSyntheticCorrelation({
    ticker,
    eventContext,
    whaleAlert: primaryWhale,
  });
  const earningsContext = getEarningsProximity(
    earningsDate,
    primaryWhale?.expiry ?? undefined,
  );

  const recommendation = await generateRecommendation(syntheticCorrelation, {
    price: marketData?.price ?? 0,
    ivRank: marketData?.ivRank,
    avgVolume: marketData?.volume ?? 0,
    todayVolume: marketData?.volume ?? 0,
    optionsChainSummary: summarizeOptionsChain(chain),
    macroContext: {
      ...macroBase,
      earningsDate: earningsContext.earningsDate,
      ivCrushRisk: earningsContext.ivCrushRisk,
    },
    optionsAnalytics: optionsData.optionsAnalytics,
    indicatorReport,
  });
  const normalizedRecommendation = enrichWhaleAlignment({
    recommendation,
    whaleMatch,
    whaleAlert: primaryWhale,
  });

  const deepDive = await generateDeepDive({
    ticker,
    whaleTrade: {
      ticker,
      strike: primaryWhale?.strike ?? undefined,
      expiry: primaryWhale?.expiry ?? undefined,
      callPut:
        primaryWhale?.callPut ??
        (getOptionType(eventContext.sentiment) === "put" ? "P" : "C"),
      premium: primaryWhale?.premium ?? undefined,
      volume: primaryWhale?.volume ?? undefined,
      openInterest: primaryWhale?.openInterest ?? undefined,
      sentiment: primaryWhale?.sentiment ?? eventContext.sentiment,
    },
    historicalData: candles3M,
    historicalDataByTimeframe: {
      "1W": candles1W,
      "1M": candles1M,
      "3M": candles3M,
      "6M": candles6M,
      "1Y": candles1Y,
    },
    optionsChain: chain,
    currentPrice: marketData?.price ?? 0,
    correlatedEvent: {
      headline: eventContext.headline,
      impact_score: Math.round(eventContext.impactScore),
      event_type: eventContext.eventType ?? "macro_event",
    },
    newsContext: [
      {
        headline: eventContext.headline,
        sentiment: eventContext.sentiment,
      },
    ],
    macroContext: {
      ...macroBase,
      earningsDate: earningsContext.earningsDate,
      ivCrushRisk: earningsContext.ivCrushRisk,
    },
    optionsAnalytics: optionsData.optionsAnalytics,
    indicatorReport,
  });

  const eventAnalysis: EventTickerAnalysis = {
    ticker,
    eventId,
    eventContext,
    marketSnapshot: marketData
      ? {
          ...marketData,
          iv: optionsData.atmIV ?? undefined,
          realizedVol: optionsData.realizedVol ?? undefined,
          ivRvSpread: optionsData.ivRvSpread ?? undefined,
          marketOpen: buildMarketOpenFlag(),
        }
      : null,
    optionsSummary: chain,
    deepDive,
    recommendation: normalizedRecommendation,
    whaleMatch,
    source: "event_ticker",
  };

  await persistEventTickerAnalysis({
    analysis: eventAnalysis,
    confidence: normalizedRecommendation.confidence,
  });

  return eventAnalysis;
}

export async function analyzeEventTickers(
  params: EventTickerAnalysisParams,
): Promise<EventTickerAnalysis[]> {
  const tickers = uniqueTickers(params.tickers);
  if (tickers.length === 0) return [];

  const remainingBudget = getRemainingBudget("yahoo");
  const estimatedBudget = tickers.length * YAHOO_CALLS_PER_TICKER + 1;
  if (isOverBudget("yahoo") || remainingBudget < estimatedBudget) {
    throw new Error(
      `Yahoo API budget too low for event analysis (${remainingBudget} remaining, ${estimatedBudget} required).`,
    );
  }

  const macroBase = await buildMacroContext();
  const results: EventTickerAnalysis[] = [];

  for (let index = 0; index < tickers.length; index += CONCURRENCY) {
    const chunk = tickers.slice(index, index + CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((ticker) =>
        analyzeSingleTicker({
          ticker,
          eventId: params.eventId,
          eventContext: params.eventContext,
          macroBase,
        }),
      ),
    );

    for (const result of settled) {
      if (result.status === "fulfilled" && result.value) {
        results.push(result.value);
      } else if (result.status === "rejected") {
        console.error(
          "[EventTickerAnalyzer] Ticker analysis failed:",
          result.reason,
        );
      }
    }
  }

  return tickers
    .map((ticker) => results.find((result) => result.ticker === ticker) ?? null)
    .filter((result): result is EventTickerAnalysis => result != null);
}

export async function autoTriggerEventAnalysis(
  events: NewsEventRow[],
): Promise<number> {
  return triggerEligibleEventAnalyses(events, {
    respectEnv: true,
    maxEvents: AUTO_TRIGGER_MAX_EVENTS,
  });
}

export async function backfillRecentHighImpactEventAnalyses(
  limit: number = AUTO_TRIGGER_MAX_EVENTS,
): Promise<number> {
  const since = new Date(
    Date.now() - RECENT_HIGH_IMPACT_LOOKBACK_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const recentEvents = await db
    .select()
    .from(newsEvents)
    .where(
      and(gte(newsEvents.createdAt, since), gte(newsEvents.impactScore, 8)),
    )
    .orderBy(desc(newsEvents.impactScore), desc(newsEvents.createdAt))
    .limit(limit * 4);

  return triggerEligibleEventAnalyses(recentEvents, {
    respectEnv: false,
    maxEvents: limit,
  });
}

export { HOURS_TO_CACHE };
