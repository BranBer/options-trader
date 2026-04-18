import type { AnalysisTimeframe, TechnicalPattern } from "@/types/analysis";
import type { CandleData, OptionsChainSummary } from "@/types/market";
import type { IndicatorPatternReport } from "@/lib/utils/indicator-patterns";
import type { ShortInterestData } from "@/lib/services/market-fetcher";
import type { CascadeContext } from "@/lib/utils/cascade-detector";
import type { SignalHierarchyInput } from "@/lib/utils/signal-hierarchy";
import type { TriggerReport } from "@/lib/utils/trigger-engine";
import { buildDeepDivePrompt } from "@/lib/prompts/deep-dive-analyzer";
import { buildRichOptionsChainSummary } from "@/lib/prompts/options-chain-summary";

export interface DeepDiveInput {
  ticker: string;
  whaleTrade: {
    ticker: string;
    strike?: number;
    expiry?: string;
    callPut?: string;
    premium?: number;
    volume?: number;
    openInterest?: number;
    sentiment?: string;
  };
  historicalData: CandleData[];
  historicalDataByTimeframe?: Partial<Record<AnalysisTimeframe, CandleData[]>>;
  optionsChain: OptionsChainSummary | null;
  currentPrice: number;
  correlatedEvent?: {
    headline: string;
    impact_score: number;
    event_type: string;
  };
  newsContext?: Array<{ headline: string; sentiment: string }>;
  macroContext?: {
    vixLevel?: number | null;
    vixRegime?: string;
    earningsDate?: string | null;
    ivCrushRisk?: string;
    fomcNextDate?: string;
    fomcIsDecisionWeek?: boolean;
  };
  optionsAnalytics?: {
    maxPain?: number | null;
    oiWalls?: {
      callWalls: { strike: number; oi: number }[];
      putWalls: { strike: number; oi: number }[];
    } | null;
    ivRvSpread?: number | null;
    realizedVol?: number | null;
    gex?: {
      netGEX: number;
      gexFlipLevel: number | null;
      topConcentrations: { strike: number; gex: number }[];
      dealerPositioning: string;
    } | null;
  };
  computedIndicators?: Partial<
    Record<AnalysisTimeframe, IndicatorPatternReport>
  >;
  shortInterest?: ShortInterestData | null;
  cascadeContext?: CascadeContext | null;
  signalHierarchy?: SignalHierarchyInput | null;
  triggerReport?: TriggerReport | null;
}

const DEEP_DIVE_TIMEFRAME_CONFIG: Array<{
  timeframe: AnalysisTimeframe;
  maxRows: number;
}> = [
  { timeframe: "1D", maxRows: 78 },
  { timeframe: "1W", maxRows: 36 },
  { timeframe: "1M", maxRows: 30 },
  { timeframe: "3M", maxRows: 45 },
  { timeframe: "6M", maxRows: 36 },
  { timeframe: "1Y", maxRows: 36 },
];

function formatCandleTimeForPrompt(value: CandleData["time"]): string {
  if (typeof value === "number") {
    return new Date(value * 1000).toISOString();
  }
  return value;
}

function summarizeCandlesForPrompt(
  candles: CandleData[],
  maxRows: number,
): string {
  if (candles.length === 0) {
    return "No historical data available.";
  }

  const sampled =
    candles.length <= maxRows
      ? candles
      : Array.from({ length: maxRows }, (_, index) => {
          const position = Math.round(
            (index * (candles.length - 1)) / (maxRows - 1),
          );
          return candles[position];
        });

  return (
    `Time | Open | High | Low | Close | Volume\n` +
    sampled
      .map(
        (candle) =>
          `${formatCandleTimeForPrompt(candle.time)} | ${candle.open.toFixed(2)} | ${candle.high.toFixed(2)} | ${candle.low.toFixed(2)} | ${candle.close.toFixed(2)} | ${candle.volume}`,
      )
      .join("\n")
  );
}

export function createFallbackTimeframePattern(args: {
  timeframe: Extract<AnalysisTimeframe, "6M" | "1Y">;
  candles: CandleData[];
}): TechnicalPattern | null {
  const { timeframe, candles } = args;
  if (candles.length < 2) {
    return null;
  }

  const first = candles[0];
  const last = candles[candles.length - 1];
  const startClose = first.close;
  const endClose = last.close;
  const changePct = startClose !== 0 ? (endClose - startClose) / startClose : 0;
  const minLow = candles.reduce(
    (accumulator, candle) => Math.min(accumulator, candle.low),
    Number.POSITIVE_INFINITY,
  );
  const maxHigh = candles.reduce(
    (accumulator, candle) => Math.max(accumulator, candle.high),
    Number.NEGATIVE_INFINITY,
  );

  if (!Number.isFinite(minLow) || !Number.isFinite(maxHigh)) {
    return null;
  }

  if (Math.abs(changePct) < 0.05) {
    return {
      name:
        timeframe === "1Y"
          ? "Primary Yearly Range"
          : "Primary Medium-Term Range",
      type: "neutral",
      description:
        timeframe === "1Y"
          ? "Price has remained in a broad yearly range, so the dominant long-horizon structure is a horizontal channel rather than a strong trend."
          : "Price has remained in a broad medium-term range over the selected window, so the dominant structure is a horizontal channel.",
      confidence: 0.55,
      timeframe,
      price_target: null,
      drawing_type: "channel",
      start_time: formatCandleTimeForPrompt(first.time),
      end_time: formatCandleTimeForPrompt(last.time),
      start_price: minLow,
      end_price: minLow,
      secondary_start_price: maxHigh,
      secondary_end_price: maxHigh,
    };
  }

  const isBullish = changePct > 0;
  const lowerStart = Math.min(first.open, first.close, first.low);
  const lowerEnd = Math.min(last.open, last.close, last.low);
  const upperStart = Math.max(first.open, first.close, first.high);
  const upperEnd = Math.max(last.open, last.close, last.high);

  return {
    name:
      timeframe === "1Y"
        ? isBullish
          ? "Primary Yearly Uptrend"
          : "Primary Yearly Downtrend"
        : isBullish
          ? "Primary Medium-Term Uptrend"
          : "Primary Medium-Term Downtrend",
    type: isBullish ? "bullish" : "bearish",
    description: `${timeframe} candles imply a ${isBullish ? "rising" : "falling"} long-range price channel from ${startClose.toFixed(2)} to ${endClose.toFixed(2)}, so the dominant technical structure should remain visible on the broader chart range.`,
    confidence: 0.58,
    timeframe,
    price_target: null,
    drawing_type: "channel",
    start_time: formatCandleTimeForPrompt(first.time),
    end_time: formatCandleTimeForPrompt(last.time),
    start_price: lowerStart,
    end_price: lowerEnd,
    secondary_start_price: upperStart,
    secondary_end_price: upperEnd,
  };
}

export function buildDeepDivePromptContext(input: DeepDiveInput): {
  prompt: string;
  triggerReport: TriggerReport | null;
} {
  const historicalSummariesByTimeframe = Object.fromEntries(
    DEEP_DIVE_TIMEFRAME_CONFIG.map(({ timeframe, maxRows }) => [
      timeframe,
      summarizeCandlesForPrompt(
        input.historicalDataByTimeframe?.[timeframe] ??
          (timeframe === "3M" ? input.historicalData : []),
        maxRows,
      ),
    ]),
  ) as Partial<Record<AnalysisTimeframe, string>>;
  const historicalSummary =
    historicalSummariesByTimeframe["3M"] ?? "No historical data available.";

  let chainSummary = "No options chain data available.";
  if (input.optionsChain) {
    chainSummary = buildRichOptionsChainSummary(
      input.optionsChain,
      input.currentPrice,
    );
  }

  return {
    prompt: buildDeepDivePrompt({
      ticker: input.ticker,
      whaleTradeJson: JSON.stringify(input.whaleTrade, null, 2),
      historicalDataSummary: historicalSummary,
      historicalDataSummariesByTimeframe: historicalSummariesByTimeframe,
      optionsChainSummary: chainSummary,
      currentPrice: input.currentPrice,
      correlatedEventJson: input.correlatedEvent
        ? JSON.stringify(input.correlatedEvent, null, 2)
        : undefined,
      newsContextJson: input.newsContext
        ? JSON.stringify(input.newsContext, null, 2)
        : undefined,
      macroContext: input.macroContext,
      optionsAnalytics: input.optionsAnalytics,
      computedIndicators: input.computedIndicators,
      shortInterest: input.shortInterest,
      cascadeContext: input.cascadeContext,
      signalHierarchy: input.signalHierarchy,
      triggerReport: input.triggerReport,
    }),
    triggerReport: input.triggerReport ?? null,
  };
}
