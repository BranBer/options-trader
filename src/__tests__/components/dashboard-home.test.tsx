/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import DashboardHome from "@/components/dashboard/DashboardHome";

const hooksState = vi.hoisted(() => ({
  newsData: {
    events: [
      {
        id: 1,
        headline: "Fed signals steady rates",
        impactScore: 8,
        sentiment: "neutral",
        countryCode: "US",
        publishedAt: "2026-04-02T15:00:00.000Z",
      },
    ],
  },
  whaleData: {
    alerts: [
      {
        id: 101,
        ticker: "NVDA",
        strike: 120,
        callPut: "C",
        expiry: "2026-04-19",
        premium: 250000,
        sentiment: "bullish",
        detectedAt: "2026-04-02T15:05:00.000Z",
      },
    ],
  },
  analysisData: {
    analyses: [
      {
        id: 900,
        type: "trade_recommendation",
        output: {
          ticker: "NVDA",
          summary: "Momentum and flow remain aligned.",
        },
        confidence: 0.82,
        createdAt: "2026-04-02T15:10:00.000Z",
      },
    ],
  },
}));

vi.mock("@/hooks/useApiData", () => ({
  useNews: () => ({ data: hooksState.newsData, isLoading: false }),
  useWhaleAlerts: () => ({ data: hooksState.whaleData, isLoading: false }),
  useAnalyses: () => ({ data: hooksState.analysisData, isLoading: false }),
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("DashboardHome navigation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders pipeline health status and navigation links when pipeline is healthy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          pipelineHealth: {
            isStale: false,
            minutesSinceRefresh: 4,
            status: "healthy",
          },
        }),
      }),
    );

    render(<DashboardHome />);

    await waitFor(() => {
      expect(screen.getByText("healthy")).toBeTruthy();
    });

    expect(
      screen.getByRole("link", { name: "View Analysis" }).getAttribute("href"),
    ).toBe("/analysis");
    expect(
      screen
        .getByRole("link", { name: "View Whale Alerts" })
        .getAttribute("href"),
    ).toBe("/whale-alerts");
  });

  it("renders stale pipeline status badge", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          pipelineHealth: {
            isStale: true,
            minutesSinceRefresh: 61,
            status: "stale",
          },
        }),
      }),
    );

    render(<DashboardHome />);

    await waitFor(() => {
      expect(screen.getByText("stale")).toBeTruthy();
    });
  });
});
