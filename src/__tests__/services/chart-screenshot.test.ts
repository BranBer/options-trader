import { describe, it, expect } from "vitest";
import {
  CHART_WIDTH,
  CHART_HEIGHT,
  PDF_INDICATOR_CONFIG,
} from "@/lib/services/chart-screenshot";
import type { CaptureProgress } from "@/lib/services/chart-screenshot";

/**
 * Story 44.6 — Chart Screenshot Capture Utility tests.
 *
 * Since lightweight-charts and DOM APIs aren't available in Node/jsdom,
 * these tests verify the module's exported constants, types, and
 * configuration. Integration testing with actual chart rendering is manual.
 */

describe("chart-screenshot constants", () => {
  it("exports correct chart dimensions for PDF", () => {
    expect(CHART_WIDTH).toBe(1200);
    expect(CHART_HEIGHT).toBe(600);
    // 2:1 aspect ratio
    expect(CHART_WIDTH / CHART_HEIGHT).toBe(2);
  });

  it("PDF_INDICATOR_CONFIG enables overlay indicators only", () => {
    expect(PDF_INDICATOR_CONFIG.ema9).toBe(true);
    expect(PDF_INDICATOR_CONFIG.ema21).toBe(true);
    expect(PDF_INDICATOR_CONFIG.bollinger).toBe(true);
    expect(PDF_INDICATOR_CONFIG.volumeMA).toBe(true);
    // RSI/MACD excluded — they need separate sub-panes
    expect(PDF_INDICATOR_CONFIG.rsi).toBe(false);
    expect(PDF_INDICATOR_CONFIG.macd).toBe(false);
  });

  it("exports captureChartScreenshots function", async () => {
    const mod = await import("@/lib/services/chart-screenshot");
    expect(typeof mod.captureChartScreenshots).toBe("function");
    expect(typeof mod.captureSingleChart).toBe("function");
  });

  it("exports container helper functions", async () => {
    const mod = await import("@/lib/services/chart-screenshot");
    expect(typeof mod.createOffscreenContainer).toBe("function");
    expect(typeof mod.removeOffscreenContainer).toBe("function");
  });

  it("CaptureProgress type shape is correct (compile-time)", () => {
    const progress: CaptureProgress = {
      current: 1,
      total: 6,
      currentTimeframe: "1D",
    };
    expect(progress.current).toBe(1);
    expect(progress.total).toBe(6);
    expect(progress.currentTimeframe).toBe("1D");
  });
});
