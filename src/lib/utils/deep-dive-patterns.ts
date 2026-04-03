import type { DeepDiveAnalysis, TechnicalPattern } from "@/types/analysis";
import {
  CHART_HISTORY_TO_ANALYSIS_TIMEFRAME,
  type ChartHistoryPeriod,
  type AnalysisTimeframe,
} from "@/lib/utils/chart-timeframes";

function withTimeframe(
  patterns: TechnicalPattern[] | undefined,
  timeframe: AnalysisTimeframe,
): TechnicalPattern[] {
  return (patterns ?? []).map((pattern) => ({
    ...pattern,
    timeframe: pattern.timeframe ?? timeframe,
  }));
}

export function getTechnicalPatternsForTimeframe(args: {
  technicalPatterns?: TechnicalPattern[];
  timeframePatterns?: DeepDiveAnalysis["timeframe_patterns"];
  period: ChartHistoryPeriod;
}): TechnicalPattern[] {
  const timeframe = CHART_HISTORY_TO_ANALYSIS_TIMEFRAME[args.period];
  const direct = args.timeframePatterns?.[timeframe];
  if (direct && direct.length > 0) {
    return withTimeframe(direct, timeframe);
  }

  const tagged = (args.technicalPatterns ?? []).filter(
    (pattern) => pattern.timeframe === timeframe,
  );
  if (tagged.length > 0) {
    return withTimeframe(tagged, timeframe);
  }

  const hasExplicitTimeframes = (args.technicalPatterns ?? []).some(
    (pattern) => pattern.timeframe != null,
  );
  if (hasExplicitTimeframes) {
    return [];
  }

  // Legacy deep dives only had a single shared pattern set built from 3M data.
  return timeframe === "3M" ? withTimeframe(args.technicalPatterns, "3M") : [];
}