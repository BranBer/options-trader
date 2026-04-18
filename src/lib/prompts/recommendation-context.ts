import type {
  Correlation,
  DeepDiveSummary,
  TradeRecommendation,
} from "@/types/analysis";
import type { IndicatorPatternReport } from "@/lib/utils/indicator-patterns";
import type { ShortInterestData } from "@/lib/services/market-fetcher";
import type { CascadeContext } from "@/lib/utils/cascade-detector";
import type { SignalScorecard } from "@/lib/utils/signal-scorecard";
import type { TriggerReport } from "@/lib/utils/trigger-engine";
import { buildTradeAnalyzerPrompt } from "@/lib/prompts/trade-analyzer";

export interface RecommendationMarketData {
  price: number;
  ivRank?: number;
  avgVolume: number;
  todayVolume: number;
  optionsChainSummary: string;
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
  sectorRotationContext?: string;
  indicatorReport?: IndicatorPatternReport;
  indicatorReportsByTimeframe?: Partial<Record<string, IndicatorPatternReport>>;
  whaleIntentHint?: string | null;
  shortInterest?: ShortInterestData | null;
  cascadeContext?: CascadeContext | null;
  deepDiveSummary?: DeepDiveSummary | null;
  scorecard?: SignalScorecard | null;
  triggerReport?: TriggerReport | null;
}

export function buildRecommendationPromptContext(
  correlation: Correlation,
  marketData: RecommendationMarketData,
): string {
  return buildTradeAnalyzerPrompt(
    JSON.stringify(correlation, null, 2),
    correlation.whale_trade.ticker,
    marketData.price,
    marketData.ivRank,
    marketData.avgVolume,
    marketData.todayVolume,
    marketData.optionsChainSummary,
    marketData.macroContext,
    marketData.optionsAnalytics,
    marketData.sectorRotationContext,
    marketData.indicatorReport,
    marketData.whaleIntentHint,
    marketData.indicatorReportsByTimeframe,
    marketData.shortInterest,
    marketData.cascadeContext,
    marketData.deepDiveSummary,
    marketData.scorecard,
    marketData.triggerReport,
  );
}

export type RecommendationResult = TradeRecommendation;
