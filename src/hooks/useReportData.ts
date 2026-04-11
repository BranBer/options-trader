"use client";

import { useQuery } from "@tanstack/react-query";
import type { DeepDiveAnalysis, TradeRecommendation } from "@/types/analysis";
import type { WhaleAlert } from "@/types/whale";
import type { ActiveCascadeEntry } from "@/app/api/analysis/active-cascades/route";
import type { CompositeConfidenceBreakdown } from "@/lib/utils/composite-confidence";
import type { ReportData } from "@/types/report";
import {
  fetchAllTimeframeCandles,
  aggregateReportData,
} from "@/lib/services/report-data-aggregator";

export interface UseReportDataInput {
  ticker: string;
  deepDive: DeepDiveAnalysis;
  recommendation: TradeRecommendation | null;
  confidenceBreakdown: CompositeConfidenceBreakdown | null;
  whaleAlert: WhaleAlert | null;
  cascadeContext: ActiveCascadeEntry[] | null;
}

/**
 * Aggregates all data needed for the PDF report into a single ReportData object.
 * Fetches candle data for all 6 timeframes and builds per-timeframe pattern data.
 *
 * @param input  Pre-fetched data from the analysis page
 * @param enabled  Set to true to trigger aggregation (manual trigger pattern)
 */
export function useReportData(
  input: UseReportDataInput | null,
  enabled: boolean,
) {
  return useQuery<ReportData>({
    queryKey: ["reportData", input?.ticker],
    queryFn: async () => {
      if (!input) throw new Error("Report input not provided");

      const candlesByPeriod = await fetchAllTimeframeCandles(input.ticker);

      return aggregateReportData({
        ...input,
        candlesByPeriod,
      });
    },
    enabled: enabled && !!input?.ticker,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
