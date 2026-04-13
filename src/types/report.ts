import type {
  DeepDiveAnalysis,
  TechnicalPattern,
  TradeRecommendation,
} from "@/types/analysis";
import type { TriggerReport } from "@/lib/utils/trigger-engine";
import type { WhaleAlert } from "@/types/whale";
import type { ActiveCascadeEntry } from "@/app/api/analysis/active-cascades/route";
import type { Candle } from "@/lib/utils/technical-indicators";
import type {
  AnalysisTimeframe,
  ChartHistoryPeriod,
} from "@/lib/utils/chart-timeframes";
import type { CompositeConfidenceBreakdown } from "@/lib/utils/composite-confidence";
import type { VolumeProfile } from "@/lib/utils/volume-profile";
import type { AlgoSRLevel } from "@/lib/utils/algo-sr";
import type { IVSkew, OISummary } from "@/lib/utils/options-analytics";
import type { CatalystSummary } from "@/lib/utils/economic-calendar";

export interface TimeframeReportData {
  timeframe: AnalysisTimeframe;
  period: ChartHistoryPeriod;
  candles: Candle[];
  patterns: TechnicalPattern[];
  indicatorPatterns: TechnicalPattern[];
}

/** Epic 46 — enriched market structure data for PDF report */
export interface EnrichedMarketData {
  volumeProfile: VolumeProfile | null;
  algoSR: AlgoSRLevel[];
  ivSkew: IVSkew | null;
  oiSummary: OISummary | null;
  catalysts: CatalystSummary;
  currentPrice: number;
  /** Next earnings date (ISO string) from Yahoo Finance */
  earningsDate: string | null;
}

export interface ReportData {
  ticker: string;
  generatedAt: string;
  deepDive: DeepDiveAnalysis;
  recommendation: TradeRecommendation | null;
  confidenceBreakdown: CompositeConfidenceBreakdown | null;
  timeframes: TimeframeReportData[];
  cascadeContext: ActiveCascadeEntry[] | null;
  whaleAlert: WhaleAlert | null;
  /** Populated after chart screenshot capture; timeframe label → data URL */
  chartScreenshots: Record<string, string>;
  /** Epic 46 — enriched market structure data */
  enrichedData: EnrichedMarketData;
  /** Epic 48 — daily chart trigger assessment */
  triggerReport: TriggerReport | null;
}
