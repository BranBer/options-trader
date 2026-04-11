"use client";

import { useState, useCallback, useRef } from "react";
import type { DeepDiveAnalysis, TradeRecommendation } from "@/types/analysis";
import type { WhaleAlert } from "@/types/whale";
import type { ActiveCascadeEntry } from "@/app/api/analysis/active-cascades/route";
import type { CompositeConfidenceBreakdown } from "@/lib/utils/composite-confidence";
import type { ReportData } from "@/types/report";
import {
  fetchAllTimeframeCandles,
  fetchOptionsChainClient,
  aggregateReportData,
} from "@/lib/services/report-data-aggregator";
import { captureChartScreenshots } from "@/lib/services/chart-screenshot";
import { generateDeepDiveReport } from "@/lib/services/pdf-export";
import {
  downloadBlob,
  generateReportFilename,
} from "@/lib/services/download-helper";

export type ExportProgress =
  | "idle"
  | "aggregating"
  | "capturing-charts"
  | "generating-pdf"
  | "complete";

export interface ExportPdfInput {
  deepDive: DeepDiveAnalysis;
  recommendation: TradeRecommendation | null;
  confidenceBreakdown: CompositeConfidenceBreakdown | null;
  whaleAlert: WhaleAlert | null;
  cascadeContext: ActiveCascadeEntry[] | null;
}

export interface UseExportPdfReturn {
  exportPdf: (input: ExportPdfInput) => Promise<void>;
  isExporting: boolean;
  progress: ExportProgress;
  error: string | null;
}

/**
 * Hook that orchestrates the full PDF export pipeline:
 *   1. Aggregate report data (fetch candles for all 6 timeframes)
 *   2. Capture chart screenshots (sequential off-screen rendering)
 *   3. Generate PDF document
 *   4. Trigger browser download
 *
 * Returns progress state for UI feedback.
 */
export function useExportPdf(ticker: string): UseExportPdfReturn {
  const [progress, setProgress] = useState<ExportProgress>("idle");
  const [error, setError] = useState<string | null>(null);
  const exportingRef = useRef(false);

  const exportPdf = useCallback(
    async (input: ExportPdfInput) => {
      // Prevent concurrent exports
      if (exportingRef.current) return;
      exportingRef.current = true;
      setError(null);

      try {
        // Stage 1: Aggregate data (fetch candles + options chain in parallel)
        setProgress("aggregating");
        const [candlesByPeriod, optionsResult] = await Promise.all([
          fetchAllTimeframeCandles(ticker),
          fetchOptionsChainClient(ticker),
        ]);
        const reportData: ReportData = aggregateReportData({
          ticker,
          ...input,
          candlesByPeriod,
          optionsChain: optionsResult.chain,
          earningsDate: optionsResult.earningsDate,
        });

        // Stage 2: Capture chart screenshots
        setProgress("capturing-charts");
        const screenshots = await captureChartScreenshots(reportData);
        reportData.chartScreenshots = screenshots;

        // Stage 3: Generate PDF
        setProgress("generating-pdf");
        const blob = await generateDeepDiveReport(reportData);

        // Stage 4: Download
        const filename = generateReportFilename(ticker);
        downloadBlob(blob, filename);

        setProgress("complete");

        // Reset after brief display
        setTimeout(() => {
          setProgress("idle");
        }, 2_000);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "PDF export failed";
        setError(message);
        setProgress("idle");
      } finally {
        exportingRef.current = false;
      }
    },
    [ticker],
  );

  return {
    exportPdf,
    isExporting: progress !== "idle" && progress !== "complete",
    progress,
    error,
  };
}
