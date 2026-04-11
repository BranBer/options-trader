import type {
  DeepDiveAnalysis,
  TechnicalPattern,
  TradeRecommendation,
} from "@/types/analysis";
import type { WhaleAlert } from "@/types/whale";
import type { ActiveCascadeEntry } from "@/app/api/analysis/active-cascades/route";
import type { Candle } from "@/lib/utils/technical-indicators";
import type {
  AnalysisTimeframe,
  ChartHistoryPeriod,
} from "@/lib/utils/chart-timeframes";
import type { CompositeConfidenceBreakdown } from "@/lib/utils/composite-confidence";

export interface TimeframeReportData {
  timeframe: AnalysisTimeframe;
  period: ChartHistoryPeriod;
  candles: Candle[];
  patterns: TechnicalPattern[];
  indicatorPatterns: TechnicalPattern[];
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
}
