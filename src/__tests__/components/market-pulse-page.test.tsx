/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MarketPulsePage from "@/components/market-pulse/MarketPulsePage";

const mockSubscriptionMutate = vi.fn();
const mockRefreshMutate = vi.fn();

vi.mock("@/hooks/useMarketPulse", () => ({
  useMarketPulseState: () => ({
    data: {
      subscriptions: ["AAPL"],
      candidates: ["TSLA", "NVDA"],
      intervalMs: 900000,
      tickers: [
        {
          ticker: "AAPL",
          status: "success",
          lastRunId: "run-aapl-1",
          lastRunAt: "2026-04-18T12:00:00.000Z",
          nextRunAt: "2026-04-18T12:15:00.000Z",
          candles: [],
          classifications: [],
          correlations: [],
          narrative: null,
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
  useMarketPulseSubscriptionMutation: () => ({
    isPending: false,
    mutate: mockSubscriptionMutate,
  }),
  useMarketPulseRefreshMutation: () => ({
    isPending: false,
    variables: undefined,
    mutate: mockRefreshMutate,
  }),
}));

vi.mock("@/components/market-pulse/TickerPulseCard", () => ({
  default: ({
    state,
    onRefresh,
    onRemove,
  }: {
    state: { ticker: string };
    onRefresh: (ticker: string) => void;
    onRemove: (ticker: string) => void;
  }) => (
    <div>
      <p>{state.ticker}</p>
      <button type="button" onClick={() => onRefresh(state.ticker)}>
        refresh {state.ticker}
      </button>
      <button type="button" onClick={() => onRemove(state.ticker)}>
        remove {state.ticker}
      </button>
    </div>
  ),
}));

describe("MarketPulsePage", () => {
  beforeEach(() => {
    mockSubscriptionMutate.mockReset();
    mockRefreshMutate.mockReset();
  });

  it("shows success feedback when adding a ticker", async () => {
    const user = userEvent.setup();
    mockSubscriptionMutate.mockImplementation(
      (
        variables: { ticker: string; action: "add" | "remove" },
        options?: { onSuccess?: () => void },
      ) => {
        options?.onSuccess?.();
        return variables;
      },
    );

    render(<MarketPulsePage />);

    await user.click(screen.getByRole("button", { name: /tsla/i }));

    expect(mockSubscriptionMutate).toHaveBeenCalled();
    expect(
      screen.getByText("TSLA is now tracked in Market Pulse."),
    ).toBeTruthy();
  });

  it("shows queued refresh feedback when a ticker refresh starts", async () => {
    const user = userEvent.setup();
    mockRefreshMutate.mockImplementation(
      (variables: { ticker: string }, options?: { onSuccess?: () => void }) => {
        options?.onSuccess?.();
        return variables;
      },
    );

    render(<MarketPulsePage />);

    await user.click(screen.getByRole("button", { name: /refresh aapl/i }));

    expect(mockRefreshMutate).toHaveBeenCalled();
    expect(screen.getByText("Manual refresh queued for AAPL.")).toBeTruthy();
  });
});
