/** @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import IndicatorPatternSummary from "@/components/charts/IndicatorPatternSummary";
import type { IndicatorPatternReport } from "@/lib/utils/indicator-patterns";

const report: IndicatorPatternReport = {
  ticker: "AAPL",
  timeframe: "3M",
  computedAt: "2026-04-06T10:00:00.000Z",
  aggregateSignal: {
    direction: "bullish",
    strength: 0.84,
    summary: "3 bullish / 1 bearish / 0 neutral — bullish bias (84% strength)",
  },
  combinations: [
    {
      name: "EMA Cross + Volume Breakout",
      patternId: "ema_cross_volume_breakout_bullish",
      signal: "bullish",
      confidence: 0.88,
      description: "trend confirmation",
      constituentPatternIds: ["ema_golden_cross", "volume_breakout_bullish"],
      educationalNote: "Volume confirmed the crossover.",
    },
  ],
  patterns: [
    {
      indicator: "ema",
      name: "EMA 9 / EMA 21 Golden Cross",
      patternId: "ema_golden_cross",
      signal: "bullish",
      confidence: 0.82,
      detectedAt: 28,
      detectedDate: "2026-01-29T00:00:00.000Z",
      description: "Fast EMA crossed above slow EMA",
      isRecent: true,
    },
    {
      indicator: "rsi",
      name: "RSI Oversold",
      patternId: "rsi_oversold",
      signal: "bullish",
      confidence: 0.76,
      detectedAt: 14,
      detectedDate: "2026-03-28T00:00:00.000Z",
      description: "RSI fell below 30",
      isRecent: true,
    },
  ],
};

describe("IndicatorPatternSummary", () => {
  it("renders aggregate, combination, and individual signal sections", () => {
    render(<IndicatorPatternSummary report={report} />);

    const header = screen.getByRole("heading", {
      name: "Technical Signal Summary",
    });

    expect(header).toBeTruthy();
    expect(
      within(header.parentElement as HTMLElement).getByText("bullish"),
    ).toBeTruthy();
    expect(screen.getByText("Combination Patterns")).toBeTruthy();
    expect(screen.getByText("Individual Patterns")).toBeTruthy();
    expect(screen.getByText("EMA Cross + Volume Breakout")).toBeTruthy();
    expect(screen.getByText("EMA 9 / EMA 21 Golden Cross")).toBeTruthy();
  });

  it("shows the empty state when no patterns are available", () => {
    render(
      <IndicatorPatternSummary
        report={{
          ...report,
          patterns: [],
          combinations: [],
        }}
      />,
    );

    expect(
      screen.getByText(
        "No clear computed indicator pattern cluster was detected for this chart yet.",
      ),
    ).toBeTruthy();
  });
});
