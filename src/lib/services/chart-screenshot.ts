"use client";

import { useRef, useState, useEffect, useCallback, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { ReportData, TimeframeReportData } from "@/types/report";
import type {
  PriceChartHandle,
  IndicatorConfig,
} from "@/components/charts/PriceChart";

/** Dimensions optimized for PDF embedding at ~185 DPI on letter-size pages */
export const CHART_WIDTH = 1200;
export const CHART_HEIGHT = 600;

/** Timeout per chart render before giving up (ms) */
const RENDER_TIMEOUT_MS = 5_000;

/** Delay after mount to allow chart to fully render (ms) */
const SETTLE_DELAY_MS = 800;

/**
 * Default indicator configuration for PDF charts:
 * EMA 9/21, Bollinger Bands, Volume MA — all visible on the main pane.
 * RSI/MACD are excluded because they need separate sub-panes that would
 * shrink the chart height.
 */
export const PDF_INDICATOR_CONFIG: IndicatorConfig = {
  ema9: true,
  ema21: true,
  bollinger: true,
  volumeMA: true,
  rsi: false,
  macd: false,
};

export interface CaptureProgress {
  current: number;
  total: number;
  currentTimeframe: string;
}

/**
 * Create a hidden off-screen container for chart rendering.
 * The container must be in the DOM with non-zero dimensions for
 * lightweight-charts to render properly.
 */
export function createOffscreenContainer(): HTMLDivElement {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  container.style.width = `${CHART_WIDTH}px`;
  container.style.height = `${CHART_HEIGHT}px`;
  container.style.overflow = "hidden";
  document.body.appendChild(container);
  return container;
}

/**
 * Remove an off-screen container from the DOM.
 */
export function removeOffscreenContainer(container: HTMLDivElement): void {
  try {
    document.body.removeChild(container);
  } catch {
    // Already removed — safe to ignore
  }
}

/**
 * Wait for a specified number of milliseconds using requestAnimationFrame
 * and setTimeout to allow the chart engine to complete rendering.
 */
function waitForRender(ms: number): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, ms);
    });
  });
}

/**
 * Capture a single chart screenshot by dynamically importing PriceChart,
 * rendering it into a hidden container, and taking a screenshot via the
 * imperative handle.
 *
 * Returns a PNG data URL string, or null if capture fails/times out.
 */
export async function captureSingleChart(
  tfData: TimeframeReportData,
  reportData: ReportData,
): Promise<string | null> {
  if (!tfData.candles.length) return null;

  const container = createOffscreenContainer();
  let root: ReturnType<typeof createRoot> | null = null;

  try {
    // Dynamic import to avoid SSR issues — PriceChart uses browser APIs
    const { default: PriceChart } =
      await import("@/components/charts/PriceChart");

    const chartRef = { current: null as PriceChartHandle | null };

    // We use a small wrapper to capture the ref via callback
    const ChartWrapper = () => {
      const ref = useRef<PriceChartHandle>(null);

      useEffect(() => {
        chartRef.current = ref.current;
      });

      return createElement(PriceChart, {
        ref,
        candles: tfData.candles,
        supportResistance: reportData.deepDive.support_resistance,
        technicalPatterns: [...tfData.patterns, ...tfData.indicatorPatterns],
        showPatterns: true,
        highlightedPatternIndex: null,
        onHoveredPattern: undefined,
        height: CHART_HEIGHT,
        entryPrice: reportData.deepDive.entry_exit.entry_price_range.low,
        exitPrice: undefined,
        optionsContext: reportData.deepDive.options_context,
        indicators: PDF_INDICATOR_CONFIG,
      });
    };

    root = createRoot(container);
    root.render(createElement(ChartWrapper));

    // Wait for chart to settle
    await waitForRender(SETTLE_DELAY_MS);

    // Race against timeout
    const screenshot = await Promise.race([
      (async () => {
        // Try a few times in case the chart needs more time
        for (let attempt = 0; attempt < 3; attempt++) {
          const result = chartRef.current?.takeScreenshot() ?? null;
          if (result) return result;
          await waitForRender(300);
        }
        return null;
      })(),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), RENDER_TIMEOUT_MS),
      ),
    ]);

    return screenshot;
  } catch {
    return null;
  } finally {
    // Cleanup
    if (root) {
      root.unmount();
    }
    removeOffscreenContainer(container);
  }
}

/**
 * Capture chart screenshots for all timeframes in a ReportData object.
 * Renders charts sequentially to manage memory (~30MB peak per chart).
 *
 * @param reportData  The aggregated report data with candle data per timeframe
 * @param onProgress  Optional callback for progress updates
 * @returns Map of timeframe label → PNG data URL (or empty string for skipped timeframes)
 */
export async function captureChartScreenshots(
  reportData: ReportData,
  onProgress?: (progress: CaptureProgress) => void,
): Promise<Record<string, string>> {
  const screenshots: Record<string, string> = {};
  const total = reportData.timeframes.length;

  for (let i = 0; i < total; i++) {
    const tfData = reportData.timeframes[i];
    onProgress?.({
      current: i + 1,
      total,
      currentTimeframe: tfData.timeframe,
    });

    const dataUrl = await captureSingleChart(tfData, reportData);
    screenshots[tfData.timeframe] = dataUrl ?? "";
  }

  return screenshots;
}
