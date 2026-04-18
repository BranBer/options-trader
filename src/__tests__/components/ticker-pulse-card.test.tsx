/** @vitest-environment jsdom */

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import TickerPulseCard from "@/components/market-pulse/TickerPulseCard";

vi.mock("@/components/charts/PriceChart", () => ({
  default: ({
    triggerMarkers,
    onTriggerMarkerSelect,
  }: {
    triggerMarkers?: Array<{ id?: string; text: string }>;
    onTriggerMarkerSelect?: (markerId: string | null) => void;
  }) => (
    <div data-testid="price-chart">
      {triggerMarkers?.map((marker) => (
        <button
          key={marker.id ?? marker.text}
          type="button"
          onClick={() => onTriggerMarkerSelect?.(marker.id ?? null)}
        >
          marker {marker.text}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/components/market-pulse/NarrativePanel", () => ({
  default: () => <div data-testid="narrative-panel" />,
}));

vi.mock("@/components/market-pulse/RunHistory", () => ({
  default: () => <div data-testid="run-history" />,
}));

vi.mock("@/components/market-pulse/InspectorDrawer", () => ({
  default: () => null,
}));

function buildState(
  overrides?: Partial<Parameters<typeof TickerPulseCard>[0]["state"]>,
) {
  return {
    ticker: "AAPL",
    status: "success",
    lastRunId: "run-aapl-1",
    lastRunAt: "2026-04-18T12:00:00.000Z",
    nextRunAt: "2026-04-18T12:01:30.000Z",
    candles: [
      {
        time: 1_745_000_000,
        open: 100,
        high: 102,
        low: 99,
        close: 101,
        volume: 1000,
      },
    ],
    classifications: [
      {
        id: 1,
        candleTime: "2026-04-18T12:00:00.000Z",
        eventBlurb: "Buyers defended the opening dip.",
        significance: "medium",
        tradability: "watch",
        level: "candle",
        classification: { control: "buyers" },
      },
    ],
    correlations: [],
    narrative: null,
    ...overrides,
  };
}

describe("TickerPulseCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a live countdown to the next refresh cycle", () => {
    render(
      <TickerPulseCard
        state={buildState()}
        onRemove={vi.fn()}
        onRefresh={vi.fn()}
        removing={false}
        refreshing={false}
      />,
    );

    expect(screen.getByText("Next refresh in 01m 30s")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(screen.getByText("Next refresh in 01m 00s")).toBeTruthy();
  });

  it("surfaces the busy overlay and status copy while refreshing", () => {
    render(
      <TickerPulseCard
        state={buildState()}
        onRemove={vi.fn()}
        onRefresh={vi.fn()}
        removing={false}
        refreshing
      />,
    );

    expect(screen.getAllByText("Refresh in progress").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("Manual refresh queued for AAPL.")).toBeTruthy();
  });

  it("updates the focused event when a chart marker is selected", async () => {
    render(
      <TickerPulseCard
        state={buildState({
          classifications: [
            {
              id: 1,
              candleTime: "2026-04-18T12:00:00.000Z",
              eventBlurb: "Buyers defended the opening dip.",
              significance: "medium",
              tradability: "watch",
              level: "candle",
              classification: { control: "buyers" },
            },
            {
              id: 2,
              candleTime: "2026-04-18T12:15:00.000Z",
              eventBlurb: "Sellers pushed back into resistance.",
              significance: "high",
              tradability: "actionable",
              level: "candle",
              classification: { control: "sellers" },
            },
          ],
        })}
        onRemove={vi.fn()}
        onRefresh={vi.fn()}
        removing={false}
        refreshing={false}
      />,
    );

    const focusedEventPanel = screen
      .getByText("Focused Event")
      .closest("div")?.parentElement;

    expect(focusedEventPanel).toBeTruthy();
    expect(
      within(focusedEventPanel as HTMLElement).getByText(
        "Sellers pushed back into resistance.",
      ),
    ).toBeTruthy();

    act(() => {
      screen
        .getByRole("button", {
          name: "marker Buyers defended the opening dip.",
        })
        .click();
    });

    expect(
      within(focusedEventPanel as HTMLElement).getByText(
        "Buyers defended the opening dip.",
      ),
    ).toBeTruthy();
  });
});
