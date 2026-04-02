/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DiagnosticsSection } from "@/components/portfolio/PortfolioPage";
import type { PortfolioDiagnosticsResponse } from "@/types/analytics";

const replaceMock = vi.fn();

const navigationState = vi.hoisted(() => ({
  searchParams: new URLSearchParams("tab=diagnostics"),
}));

const diagnosticsState = vi.hoisted(() => ({
  query: {
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => "/portfolio",
  useSearchParams: () => navigationState.searchParams,
}));

vi.mock("@/hooks/useApiData", () => ({
  usePortfolio: () => ({ data: undefined, isLoading: false }),
  usePortfolioTrades: () => ({ data: undefined, isLoading: false }),
  useEquityCurve: () => ({ data: undefined, isLoading: false }),
  usePortfolioTrade: () => ({ data: undefined, isLoading: false }),
  useDeepDive: () => ({ data: undefined, isLoading: false }),
  useInfinitePortfolioDiagnostics: () => diagnosticsState.query,
}));

vi.mock("@/components/shared/ConfidenceBreakdownPanel", () => ({
  ConfidenceBreakdownPanel: () => null,
}));

vi.mock("@/components/shared/TechnicalChart", () => ({
  default: () => null,
}));

vi.mock("@/components/charts/OptionsStatsPanel", () => ({
  default: () => null,
}));

vi.mock("@/components/shared/LineChart", () => ({
  default: () => null,
}));

vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

function createDiagnosticsResponse(overrides?: {
  traces?: PortfolioDiagnosticsResponse["diagnostics"]["traces"];
  status?: PortfolioDiagnosticsResponse["diagnostics"]["pipelineHealth"]["status"];
  minutesSinceRefresh?: number | null;
  summary?: PortfolioDiagnosticsResponse["diagnostics"]["summary"];
}): PortfolioDiagnosticsResponse {
  return {
    diagnostics: {
      traces: overrides?.traces ?? [
        {
          alertId: 101,
          ticker: "NVDA",
          detectedAt: "2026-04-02T14:00:00.000Z",
          qualityScore: 82,
          finalOutcome: "rejected",
          reasonCluster: "missing_market_data",
          primaryReason: "Missing market data for options chain",
          sourceRefs: {
            primaryWhaleId: 101,
            whaleIds: [101],
            sourceAnalysisId: 900,
            tradeId: null,
          },
          stageEvents: [
            {
              stage: "detection",
              status: "completed",
              timestamp: "2026-04-02T14:00:00.000Z",
              reason: null,
            },
            {
              stage: "validation",
              status: "blocked",
              timestamp: "2026-04-02T14:03:00.000Z",
              reason: "Missing market data for options chain",
            },
          ],
        },
        {
          alertId: 102,
          ticker: "AAPL",
          detectedAt: "2026-04-02T15:00:00.000Z",
          qualityScore: 77,
          finalOutcome: "entered",
          reasonCluster: null,
          primaryReason: null,
          sourceRefs: {
            primaryWhaleId: 102,
            whaleIds: [102],
            sourceAnalysisId: 901,
            tradeId: 700,
          },
          stageEvents: [
            {
              stage: "trade_execution",
              status: "completed",
              timestamp: "2026-04-02T15:03:00.000Z",
              reason: "trade opened",
            },
          ],
        },
      ],
      summary: {
        total: overrides?.summary?.total ?? overrides?.traces?.length ?? 2,
        byOutcome: overrides?.summary?.byOutcome ?? {
          entered: 1,
          rejected: 1,
          not_evaluated: 0,
        },
        topReasons: overrides?.summary?.topReasons ?? [
          {
            reason: "Missing market data for options chain",
            count: 1,
          },
        ],
        dropOffByStage: overrides?.summary?.dropOffByStage ?? {
          detection: 0,
          analysis: 0,
          evaluation: 0,
          validation: 1,
          entry: 0,
          trade_execution: 0,
        },
      },
      pipelineHealth: {
        lastRefreshAt: "2026-04-02T15:10:00.000Z",
        minutesSinceRefresh: overrides?.minutesSinceRefresh ?? 4,
        isStale: (overrides?.status ?? "healthy") !== "healthy",
        status: overrides?.status ?? "healthy",
      },
      pageInfo: {
        limit: 8,
        nextCursor: null,
        hasMore: false,
      },
      filters: {
        ticker: null,
        outcome: null,
        reasonCluster: null,
        minQuality: null,
        startDate: null,
        endDate: null,
      },
    },
  };
}

describe("DiagnosticsSection UI", () => {
  beforeEach(() => {
    replaceMock.mockReset();
    navigationState.searchParams = new URLSearchParams("tab=diagnostics");
    diagnosticsState.query = {
      data: {
        pages: [createDiagnosticsResponse()],
        pageParams: [null],
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };
  });

  it("pins and unpins traces for side-by-side comparison", async () => {
    const user = userEvent.setup();
    render(<DiagnosticsSection />);

    expect(
      screen.getByText(
        "Pin alerts from the trace list below to compare decisions side by side.",
      ),
    ).toBeTruthy();

    await user.click(screen.getAllByRole("button", { name: "Pin" })[0]);

    expect(
      screen.getByText("1 of 3 traces pinned for comparison."),
    ).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Unpin" }).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("NVDA").length).toBeGreaterThan(0);

    await user.click(screen.getAllByRole("button", { name: "Unpin" })[0]);

    expect(
      screen.getByText(
        "Pin alerts from the trace list below to compare decisions side by side.",
      ),
    ).toBeTruthy();
  });

  it("supports compact compare mode when multiple traces are pinned", async () => {
    const user = userEvent.setup();
    render(<DiagnosticsSection />);

    await user.click(screen.getAllByRole("button", { name: "Pin" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Pin" })[0]);
    await user.click(screen.getByRole("button", { name: "Compact compare" }));

    expect(screen.getAllByText("Stage overview").length).toBeGreaterThan(0);
  });

  it("shows reset actions when filters produce an empty diagnostics window", async () => {
    const user = userEvent.setup();
    navigationState.searchParams = new URLSearchParams(
      "tab=diagnostics&outcome=rejected&reasonCluster=missing_market_data",
    );
    diagnosticsState.query = {
      data: {
        pages: [
          createDiagnosticsResponse({
            traces: [],
          }),
        ],
        pageParams: [null],
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };

    render(<DiagnosticsSection />);

    expect(
      screen.getByText("No alert traces match the current filters."),
    ).toBeTruthy();
    const showAllRecent = screen.getByRole("button", {
      name: "Show All Recent",
    });
    expect(showAllRecent).toBeTruthy();

    await user.click(showAllRecent);

    expect(replaceMock).toHaveBeenCalledWith("/portfolio?tab=diagnostics", {
      scroll: false,
    });
  });

  it("shows active filter chips and removes an individual filter from the diagnostics window", async () => {
    const user = userEvent.setup();
    navigationState.searchParams = new URLSearchParams(
      "tab=diagnostics&ticker=NVDA&outcome=rejected&minQuality=70",
    );

    render(<DiagnosticsSection />);

    expect(screen.getByText("Active diagnostics window")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ticker: NVDA" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Outcome: Rejected" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Ticker: NVDA" }));

    expect(replaceMock).toHaveBeenCalledWith(
      "/portfolio?tab=diagnostics&outcome=rejected&minQuality=70",
      { scroll: false },
    );
  });

  it("applies quick filters from failure clusters and top reasons", async () => {
    const user = userEvent.setup();
    render(<DiagnosticsSection />);

    const failureClusterButton = screen
      .getAllByRole("button")
      .find(
        (button) =>
          button.textContent?.includes("Missing Market Data") &&
          button.textContent?.includes("Apply"),
      );

    expect(failureClusterButton).toBeTruthy();

    await user.click(failureClusterButton!);

    expect(replaceMock).toHaveBeenCalledWith(
      "/portfolio?tab=diagnostics&reasonCluster=missing_market_data&outcome=rejected",
      { scroll: false },
    );

    replaceMock.mockReset();

    const topReasonButton = screen
      .getAllByRole("button")
      .find(
        (button) =>
          button.textContent?.includes(
            "Missing market data for options chain",
          ) && button.textContent?.includes("Filter"),
      );

    expect(topReasonButton).toBeTruthy();

    await user.click(topReasonButton!);

    expect(replaceMock).toHaveBeenCalledWith(
      "/portfolio?tab=diagnostics&reasonCluster=missing_market_data&outcome=rejected",
      { scroll: false },
    );
  });

  it("surfaces a direct pipeline-gap CTA when the diagnostics window is stale", async () => {
    const user = userEvent.setup();
    diagnosticsState.query = {
      data: {
        pages: [
          createDiagnosticsResponse({
            traces: [
              {
                alertId: 201,
                ticker: "SPY",
                detectedAt: "2026-04-02T14:00:00.000Z",
                qualityScore: 80,
                finalOutcome: "not_evaluated",
                reasonCluster: "pipeline_gap",
                primaryReason: "pipeline stale before alert could be evaluated",
                sourceRefs: {
                  primaryWhaleId: 201,
                  whaleIds: [201],
                  sourceAnalysisId: null,
                  tradeId: null,
                },
                stageEvents: [
                  {
                    stage: "analysis",
                    status: "missing",
                    timestamp: null,
                    reason: "pipeline stale before alert could be evaluated",
                  },
                ],
              },
            ],
            status: "stale",
            minutesSinceRefresh: 61,
            summary: {
              total: 1,
              byOutcome: {
                entered: 0,
                rejected: 0,
                not_evaluated: 1,
              },
              topReasons: [
                {
                  reason: "pipeline stale before alert could be evaluated",
                  count: 1,
                },
              ],
              dropOffByStage: {
                detection: 0,
                analysis: 1,
                evaluation: 0,
                validation: 0,
                entry: 0,
                trade_execution: 0,
              },
            },
          }),
        ],
        pageParams: [null],
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    };

    render(<DiagnosticsSection />);

    expect(
      screen.getByText("Pipeline freshness may be masking unevaluated alerts."),
    ).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Investigate Pipeline Gaps" }),
    );

    expect(replaceMock).toHaveBeenCalledWith(
      "/portfolio?tab=diagnostics&outcome=not_evaluated&reasonCluster=pipeline_gap",
      { scroll: false },
    );
  });
});
