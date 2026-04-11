import type { ReportData, TimeframeReportData } from "@/types/report";
import type {
  DeepDiveAnalysis,
  TradeRecommendation,
  TechnicalPattern,
} from "@/types/analysis";
import type { WhaleAlert } from "@/types/whale";
import type { ActiveCascadeEntry } from "@/app/api/analysis/active-cascades/route";
import type { CompositeConfidenceBreakdown } from "@/lib/utils/composite-confidence";
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
  };
}
