/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import RunHistory from "@/components/market-pulse/RunHistory";

vi.mock("@/hooks/useMarketPulse", () => ({
  useMarketPulseRuns: () => ({
    isLoading: false,
    error: null,
    data: {
      runs: [
        {
          runId: "run-aapl-2",
          ticker: "AAPL",
          status: "partial",
          trigger: "manual",
          llmTokensUsed: 160,
          durationMs: 4200,
          startedAt: "2026-04-18T12:15:00.000Z",
          completedAt: "2026-04-18T12:15:04.200Z",
          errorMessage: "narrative: timeout",
          stages: {
            candleCount: 8,
            stages: {
              classification: {
                itemCount: 9,
                distribution: { buyers: 5, sellers: 2, neutral: 1 },
              },
              correlation: {
                itemCount: 2,
                averageConfidence: 0.84,
              },
              narrative: {
                changedFromPrior: true,
              },
            },
          },
        },
      ],
    },
  }),
}));

describe("RunHistory", () => {
  it("renders telemetry summaries for recent runs", () => {
    render(<RunHistory ticker="AAPL" onInspectRun={vi.fn()} />);

    expect(screen.getByText("8 candles")).toBeTruthy();
    expect(screen.getByText("9 classified")).toBeTruthy();
    expect(screen.getByText("B 5 / S 2 / N 1")).toBeTruthy();
    expect(screen.getByText("2 correlations @ 84%")).toBeTruthy();
    expect(screen.getByText("Narrative changed")).toBeTruthy();
  });

  it("calls onInspectRun for the selected run", async () => {
    const user = userEvent.setup();
    const onInspectRun = vi.fn();

    render(<RunHistory ticker="AAPL" onInspectRun={onInspectRun} />);

    await user.click(screen.getByRole("button", { name: "Inspect Run" }));

    expect(onInspectRun).toHaveBeenCalledWith("run-aapl-2");
  });
});
