/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TechnicalChart from "@/components/shared/TechnicalChart";

function toUnixSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

const intradayCandles = [
  {
    time: toUnixSeconds("2026-04-17T12:00:00.000Z"),
    open: 101,
    high: 108,
    low: 100,
    close: 107,
    volume: 800,
  },
  {
    time: toUnixSeconds("2026-04-17T13:00:00.000Z"),
    open: 107,
    high: 109,
    low: 101,
    close: 108,
    volume: 900,
  },
  {
    time: toUnixSeconds("2026-04-17T13:30:00.000Z"),
    open: 108,
    high: 109,
    low: 102,
    close: 106,
    volume: 1200,
  },
  {
    time: toUnixSeconds("2026-04-17T13:35:00.000Z"),
    open: 106,
    high: 107,
    low: 101,
    close: 104,
    volume: 1300,
  },
  {
    time: toUnixSeconds("2026-04-17T13:40:00.000Z"),
    open: 104,
    high: 106,
    low: 100,
    close: 103,
    volume: 1400,
  },
  {
    time: toUnixSeconds("2026-04-17T13:45:00.000Z"),
    open: 103,
    high: 105,
    low: 99,
    close: 102,
    volume: 1500,
  },
  {
    time: toUnixSeconds("2026-04-17T13:50:00.000Z"),
    open: 102,
    high: 104,
    low: 98,
    close: 101,
    volume: 1600,
  },
  {
    time: toUnixSeconds("2026-04-17T13:55:00.000Z"),
    open: 101,
    high: 103,
    low: 97,
    close: 100,
    volume: 1700,
  },
  {
    time: toUnixSeconds("2026-04-17T14:00:00.000Z"),
    open: 100,
    high: 102,
    low: 96,
    close: 101,
    volume: 1800,
  },
];

const dailyCandles = [
  {
    time: "2026-04-16",
    open: 102,
    high: 111,
    low: 95,
    close: 104,
    volume: 10000,
  },
  {
    time: "2026-04-17",
    open: 104,
    high: 109,
    low: 96,
    close: 101,
    volume: 12000,
  },
];

vi.mock("@/hooks/useApiData", () => ({
  useHistoricalData: (_ticker: string, period: string) => ({
    data: {
      candles: period === "1d" ? intradayCandles : dailyCandles,
    },
    isLoading: false,
  }),
}));

vi.mock("@/components/charts/PriceChart", () => ({
  default: () => <div data-testid="price-chart" />,
}));

vi.mock("@/components/charts/ChartLegend", () => ({
  default: () => <div data-testid="chart-legend" />,
}));

vi.mock("@/components/charts/IndicatorPatternSummary", () => ({
  default: () => <div data-testid="pattern-summary" />,
}));

vi.mock("@/components/charts/PatternLegendBar", () => ({
  default: () => <div data-testid="pattern-legend-bar" />,
}));

vi.mock("@/components/charts/IndicatorExplainers", () => ({
  IndicatorGuidePanel: () => <div data-testid="indicator-guide" />,
  InfoTooltip: () => <button type="button">?</button>,
}));

describe("TechnicalChart intraday education guide", () => {
  it("renders a plain-language guide for 1D intraday levels", () => {
    render(<TechnicalChart ticker="AAPL" timeframe="1d" height={300} />);

    expect(screen.getByText("Intraday Control")).toBeTruthy();
    expect(screen.getByText("What these 1D levels mean")).toBeTruthy();
    expect(screen.getByText("Opening Range High")).toBeTruthy();
    expect(screen.getByText("Premarket High")).toBeTruthy();
    expect(screen.getByText("Prior-Day Close")).toBeTruthy();
  });
});
