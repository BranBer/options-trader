/** @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import TechnicalChart from "@/components/shared/TechnicalChart";

vi.mock("@/hooks/useApiData", () => ({
  useHistoricalData: () => ({
    data: {
      candles: [
        {
          time: "2026-04-01T00:00:00.000Z",
          open: 100,
          high: 102,
          low: 99,
          close: 101,
          volume: 1000,
        },
        {
          time: "2026-04-02T00:00:00.000Z",
          open: 101,
          high: 104,
          low: 100,
          close: 103,
          volume: 1800,
        },
        {
          time: "2026-04-03T00:00:00.000Z",
          open: 103,
          high: 106,
          low: 102,
          close: 105,
          volume: 2200,
        },
        {
          time: "2026-04-04T00:00:00.000Z",
          open: 105,
          high: 108,
          low: 104,
          close: 107,
          volume: 2600,
        },
        {
          time: "2026-04-05T00:00:00.000Z",
          open: 107,
          high: 110,
          low: 106,
          close: 109,
          volume: 3000,
        },
        {
          time: "2026-04-06T00:00:00.000Z",
          open: 109,
          high: 112,
          low: 108,
          close: 111,
          volume: 3500,
        },
        {
          time: "2026-04-07T00:00:00.000Z",
          open: 111,
          high: 114,
          low: 110,
          close: 113,
          volume: 3800,
        },
        {
          time: "2026-04-08T00:00:00.000Z",
          open: 113,
          high: 116,
          low: 112,
          close: 115,
          volume: 4200,
        },
        {
          time: "2026-04-09T00:00:00.000Z",
          open: 115,
          high: 118,
          low: 114,
          close: 117,
          volume: 4600,
        },
        {
          time: "2026-04-10T00:00:00.000Z",
          open: 117,
          high: 120,
          low: 116,
          close: 119,
          volume: 5000,
        },
        {
          time: "2026-04-11T00:00:00.000Z",
          open: 119,
          high: 122,
          low: 118,
          close: 121,
          volume: 5400,
        },
        {
          time: "2026-04-12T00:00:00.000Z",
          open: 121,
          high: 124,
          low: 120,
          close: 123,
          volume: 5800,
        },
      ],
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

vi.mock("@/components/charts/IndicatorExplainers", () => ({
  IndicatorGuidePanel: () => <div data-testid="indicator-guide" />,
  InfoTooltip: () => <button type="button">?</button>,
}));

describe("TechnicalChart indicator summary integration", () => {
  it("renders the indicator pattern summary below the chart", () => {
    render(<TechnicalChart ticker="AAPL" height={300} />);

    expect(screen.getByTestId("price-chart")).toBeTruthy();
    expect(screen.getByText("Technical Signal Summary")).toBeTruthy();
    expect(screen.getByTestId("indicator-guide")).toBeTruthy();
  });
});
