import type {
  ReportData,
  TimeframeReportData,
  EnrichedMarketData,
} from "@/types/report";
import type {
  DeepDiveAnalysis,
  TradeRecommendation,
  TechnicalPattern,
} from "@/types/analysis";
import type { WhaleAlert } from "@/types/whale";
import type { ActiveCascadeEntry } from "@/app/api/analysis/active-cascades/route";
import type { CompositeConfidenceBreakdown } from "@/lib/utils/composite-confidence";
import type { TriggerReport } from "@/lib/utils/trigger-engine";
import type { Candle } from "@/lib/utils/technical-indicators";
import type {
  AnalysisTimeframe,
  ChartHistoryPeriod,
} from "@/lib/utils/chart-timeframes";
import {
  CHART_HISTORY_PERIODS,
  CHART_HISTORY_TO_ANALYSIS_TIMEFRAME,
} from "@/lib/utils/chart-timeframes";
import { getTechnicalPatternsForTimeframe } from "@/lib/utils/deep-dive-patterns";
import { detectAllIndicatorPatterns } from "@/lib/utils/indicator-patterns";
import { computeVolumeProfile } from "@/lib/utils/volume-profile";
import { computeAlgoSR } from "@/lib/utils/algo-sr";
import { computeIVSkew, computeOISummary } from "@/lib/utils/options-analytics";
import {
  getUpcomingCatalysts,
  type CatalystSummary,
} from "@/lib/utils/economic-calendar";
import {
  buildIntradayResistanceLevels,
  summarizeIntradaySessionChronology,
  buildIntradaySupportLevels,
} from "@/lib/utils/intraday-resistance";
import type { OptionsChainSummary } from "@/types/market";
import type { GEXSummary } from "@/lib/utils/gex-calculator";
import { vwap } from "@/lib/utils/technical-indicators";

/** Mapping from ChartHistoryPeriod to candle arrays, fetched externally. */
export type CandlesByPeriod = Partial<Record<ChartHistoryPeriod, Candle[]>>;

/**
 * Fetch candle data for all 6 timeframes from the market history API.
 * Returns a map of period → candles. Individual timeframe failures are
 * silently skipped (empty array) so the rest of the report still works.
 */
export async function fetchAllTimeframeCandles(
  ticker: string,
): Promise<CandlesByPeriod> {
  const results: CandlesByPeriod = {};

  // Fetch all 6 in parallel
  const entries = await Promise.all(
    CHART_HISTORY_PERIODS.map(async (period) => {
      try {
        const res = await fetch(
          `/api/market/history?ticker=${encodeURIComponent(ticker)}&period=${period}`,
        );
        if (!res.ok) return [period, []] as const;
        const data = await res.json();
        return [period, (data.candles ?? []) as Candle[]] as const;
      } catch {
        return [period, []] as const;
      }
    }),
  );

  for (const [period, candles] of entries) {
    results[period] = candles;
  }
  return results;
}

function indicatorPatternsToOverlays(
  patterns: {
    indicator: string;
    name: string;
    signal: string;
    description: string;
    confidence: number;
    isRecent: boolean;
    detectedAt: number;
  }[],
  candles: Candle[],
): TechnicalPattern[] {
  return patterns
    .filter(
      (p) => p.isRecent && p.detectedAt >= 0 && p.detectedAt < candles.length,
    )
    .map((p) => {
      const candle = candles[p.detectedAt];
      const time =
        typeof candle.time === "number"
          ? new Date(candle.time * 1000).toISOString()
          : candle.time;
      return {
        name: p.name,
        type: p.signal as "bullish" | "bearish" | "neutral",
        description: p.description,
        confidence: p.confidence,
        timeframe: null,
        price_target: null,
        drawing_type: "marker" as const,
        start_time: time,
        end_time: time,
        start_price: p.signal === "bearish" ? candle.high : candle.low,
        end_price: p.signal === "bearish" ? candle.high : candle.low,
        secondary_start_price: null,
        secondary_end_price: null,
        indicator: p.indicator,
      };
    });
}

/**
 * Build per-timeframe report data from candle data + deep dive analysis.
 */
function buildTimeframeData(
  deepDive: DeepDiveAnalysis,
  candlesByPeriod: CandlesByPeriod,
  ticker: string,
): TimeframeReportData[] {
  return CHART_HISTORY_PERIODS.map((period) => {
    const timeframe = CHART_HISTORY_TO_ANALYSIS_TIMEFRAME[
      period
    ] as AnalysisTimeframe;
    const candles = candlesByPeriod[period] ?? [];

    const patterns = getTechnicalPatternsForTimeframe({
      technicalPatterns: deepDive.technical_patterns,
      timeframePatterns: deepDive.timeframe_patterns,
      period,
    });

    // Client-side indicator pattern detection
    const report = detectAllIndicatorPatterns(candles, ticker, timeframe);
    const indicatorPatterns =
      candles.length > 0
        ? indicatorPatternsToOverlays(report.patterns, candles)
        : [];

    return { timeframe, period, candles, patterns, indicatorPatterns };
  });
}

export interface AggregateReportInput {
  ticker: string;
  deepDive: DeepDiveAnalysis;
  recommendation: TradeRecommendation | null;
  confidenceBreakdown: CompositeConfidenceBreakdown | null;
  whaleAlert: WhaleAlert | null;
  cascadeContext: ActiveCascadeEntry[] | null;
  candlesByPeriod: CandlesByPeriod;
  optionsChain?: OptionsChainSummary | null;
  earningsDate?: string | null;
  /** Live catalyst data fetched from /api/calendar/upcoming — bypasses client-side fallback to hardcoded dates */
  liveCatalysts?: CatalystSummary;
  /** Epic 48 — trigger report computed during pipeline analysis */
  triggerReport?: TriggerReport | null;
}

/** Combined options data fetched from the API route */
export interface OptionsChainResult {
  chain: OptionsChainSummary | null;
  earningsDate: string | null;
}

/**
 * Fetch options chain + earnings date from the client-side API route.
 * Fails silently — returns nulls if unavailable.
 */
export async function fetchOptionsChainClient(
  ticker: string,
): Promise<OptionsChainResult> {
  try {
    const res = await fetch(
      `/api/market/options-chain?ticker=${encodeURIComponent(ticker)}`,
    );
    if (!res.ok) return { chain: null, earningsDate: null };
    const data = await res.json();
    return {
      chain: data.chain ?? null,
      earningsDate: data.earningsDate ?? null,
    };
  } catch {
    return { chain: null, earningsDate: null };
  }
}

/**
 * Pick the best available candles for volume/S&R analysis.
 * Prefers 3M, then 6M, then 1M, then 1W — whichever has ≥5 bars first.
 */
function pickBestCandles(candlesByPeriod: CandlesByPeriod): Candle[] {
  const preferred: ChartHistoryPeriod[] = ["3mo", "6mo", "1mo", "1wk"];
  for (const p of preferred) {
    const c = candlesByPeriod[p] ?? [];
    if (c.length >= 5) return c;
  }
  return [];
}

/**
 * Compute enriched market structure data for the PDF report.
 * Uses candles + options chain + existing deep dive data.
 * Falls back through multiple candle timeframes so data is available
 * even when one period fails to fetch.
 *
 * NEVER returns null — always returns at minimum catalyst calendar and
 * whatever data is available. Individual sections may be null.
 */
function computeEnrichedData(
  deepDive: DeepDiveAnalysis,
  candlesByPeriod: CandlesByPeriod,
  optionsChain: OptionsChainSummary | null,
  earningsDate: string | null,
  liveCatalysts?: CatalystSummary,
): EnrichedMarketData {
  const candles = pickBestCandles(candlesByPeriod);
  const candles1D = candlesByPeriod["1d"] ?? [];

  // Current price — try candles first, then fall back to deep dive S/R mid-point
  let currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0;
  if (currentPrice <= 0 && deepDive.support_resistance.length > 0) {
    currentPrice = deepDive.support_resistance[0].price;
  }

  // Volume profile — needs candles; null if unavailable
  const volumeProfile =
    candles.length >= 5 ? computeVolumeProfile(candles) : null;

  // VWAP from intraday candles
  const vwapValues = candles1D.length > 0 ? vwap(candles1D) : [];
  const latestVwap =
    vwapValues.length > 0 ? vwapValues[vwapValues.length - 1] : null;

  const intradayResistance =
    candles1D.length >= 6
      ? buildIntradayResistanceLevels({
          intradayCandles: candles1D,
          dailyCandles: candlesByPeriod["1mo"] ?? candles,
        })
      : [];
  const intradaySupport =
    candles1D.length >= 6
      ? buildIntradaySupportLevels({
          intradayCandles: candles1D,
          dailyCandles: candlesByPeriod["1mo"] ?? candles,
        })
      : [];
  const intradayNarrative =
    candles1D.length >= 6
      ? summarizeIntradaySessionChronology({
          intradayCandles: candles1D,
          dailyCandles: candlesByPeriod["1mo"] ?? candles,
        })
      : [];

  // Extract OI walls, max pain, GEX from deep dive options_context
  const ctx = deepDive.options_context;
  const oiWallsFromDD = ctx.oi_walls
    ? {
        callWalls: ctx.oi_walls.call_walls,
        putWalls: ctx.oi_walls.put_walls,
      }
    : null;
  const gexFromDD: GEXSummary | null = ctx.gex_summary
    ? {
        netGEX: ctx.gex_summary.net_gex,
        gexFlipLevel: ctx.gex_summary.gex_flip_level ?? null,
        topConcentrations: [],
        dealerPositioning: ctx.gex_summary.dealer_positioning,
      }
    : null;

  // Algo S/R with multi-source confluence — needs candles + price
  const algoSR =
    candles.length >= 5 && currentPrice > 0
      ? computeAlgoSR({
          candles,
          currentPrice,
          volumeProfile,
          oiWalls: oiWallsFromDD,
          maxPain: ctx.max_pain ?? null,
          gex: gexFromDD,
          vwap: latestVwap,
        })
      : [];

  // IV skew + OI summary from live options chain
  const ivSkew =
    optionsChain && currentPrice > 0
      ? computeIVSkew(optionsChain, currentPrice)
      : null;
  const oiSummary = optionsChain ? computeOISummary(optionsChain) : null;

  // Catalyst calendar (14-day window) — use server-fetched live data when
  // available (client-side PDF export passes this in); otherwise call
  // getUpcomingCatalysts which works correctly server-side.
  const catalysts = liveCatalysts ?? getUpcomingCatalysts(14);

  return {
    volumeProfile,
    algoSR,
    intradayResistance,
    intradaySupport,
    intradayNarrative,
    ivSkew,
    oiSummary,
    catalysts,
    currentPrice,
    earningsDate,
  };
}

/**
 * Aggregate all data needed for the PDF report into a single ReportData object.
 * This is a pure synchronous function — all fetching should happen beforehand.
 */
export function aggregateReportData(input: AggregateReportInput): ReportData {
  const timeframes = buildTimeframeData(
    input.deepDive,
    input.candlesByPeriod,
    input.ticker,
  );

  const enrichedData = computeEnrichedData(
    input.deepDive,
    input.candlesByPeriod,
    input.optionsChain ?? null,
    input.earningsDate ?? null,
    input.liveCatalysts,
  );

  return {
    ticker: input.ticker,
    generatedAt: new Date().toISOString(),
    deepDive: input.deepDive,
    recommendation: input.recommendation,
    confidenceBreakdown: input.confidenceBreakdown,
    timeframes,
    cascadeContext: input.cascadeContext,
    whaleAlert: input.whaleAlert,
    chartScreenshots: {}, // Populated later by chart capture utility
    enrichedData,
    triggerReport: input.triggerReport ?? null,
  };
}
