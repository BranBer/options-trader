export const CHART_HISTORY_PERIODS = ["1wk", "1mo", "3mo", "6mo", "1y"] as const;
export type ChartHistoryPeriod = (typeof CHART_HISTORY_PERIODS)[number];

export const ANALYSIS_TIMEFRAMES = ["1W", "1M", "3M", "6M", "1Y"] as const;
export type AnalysisTimeframe = (typeof ANALYSIS_TIMEFRAMES)[number];

export const CHART_HISTORY_TO_ANALYSIS_TIMEFRAME: Record<ChartHistoryPeriod, AnalysisTimeframe> = {
  "1wk": "1W",
  "1mo": "1M",
  "3mo": "3M",
  "6mo": "6M",
  "1y": "1Y",
};

export const ANALYSIS_TIMEFRAME_TO_CHART_HISTORY: Record<AnalysisTimeframe, ChartHistoryPeriod> = {
  "1W": "1wk",
  "1M": "1mo",
  "3M": "3mo",
  "6M": "6mo",
  "1Y": "1y",
};

export const CHART_HISTORY_LABELS: Record<ChartHistoryPeriod, string> = {
  "1wk": "1W",
  "1mo": "1M",
  "3mo": "3M",
  "6mo": "6M",
  "1y": "1Y",
};