/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeskPage } from "@/components/desk/DeskPage";
import type { DeskResponse } from "@/types/desk";

const mockRunMutate = vi.fn();
let mockRunState: {
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  error: Error | null;
  data: { opened: number; marked: number; closed: number; errors: string[] } | undefined;
};

let mockDeskData: DeskResponse | undefined;
let mockIsLoading = false;
let mockIsError = false;
const mockRefetch = vi.fn();

vi.mock("@/hooks/useApiData", () => ({
  useDeskData: () => ({
    data: mockDeskData,
    isLoading: mockIsLoading,
    isError: mockIsError,
    refetch: mockRefetch,
  }),
  useRunDesk: () => ({
    mutate: mockRunMutate,
    ...mockRunState,
  }),
}));

const fixture: DeskResponse = {
  asOf: "2026-09-27T12:00:00.000Z",
  lastRun: {
    startedAt: "2026-09-27T11:00:00.000Z",
    completedAt: "2026-09-27T11:02:00.000Z",
    opened: 2,
    marked: 5,
    closed: 1,
    errors: [],
  },
  strategies: [
    {
      id: "earnings_iron_fly",
      label: "Earnings iron fly",
      thesis: "Sell the overpriced pre-earnings volatility risk premium.",
      execution: "manual-level3",
      status: "paper",
      evidence: {
        summary: "Iron fly wings at 1.25x implied move.",
        n: 1679,
        meanAfterCosts: -0.011,
        ci95: [-0.03, 0.01],
        costModel: "h=2%",
        verdict: "Regime-dependent, not yet reliable.",
      },
      forward: { closed: 12, open: 3, meanRet: 0.02, winRate: 0.58, tStat: 0.4, totalPnl: 340 },
      liveCriteria: {
        minClosedTrades: 60,
        minTStat: 2.0,
        rule: "Needs 60 closed trades and |t| >= 2.0 before going live.",
      },
    },
    {
      id: "cheap_vol_straddle",
      label: "Cheap vol straddle",
      thesis: "Buy straddles when IV is cheap vs realized vol.",
      execution: "agent",
      status: "live-eligible",
      evidence: {
        summary: "Top decile HV20/IV straddles.",
        n: 104,
        meanAfterCosts: 0.034,
        ci95: [-0.01, 0.08],
        costModel: "h=2%",
        verdict: "Directionally consistent with theory.",
      },
      forward: { closed: 65, open: 1, meanRet: 0.03, winRate: 0.6, tStat: 2.4, totalPnl: 900 },
      liveCriteria: {
        minClosedTrades: 60,
        minTStat: 2.0,
        rule: "Needs 60 closed trades and |t| >= 2.0 before going live.",
      },
    },
    {
      id: "whale_follow",
      label: "Whale follow",
      thesis: "Copy stored whale alerts.",
      execution: "agent",
      status: "research",
      evidence: {
        summary: "Copies 10 mega-cap whale alerts.",
        n: 1302,
        meanAfterCosts: 0.002,
        ci95: [-0.02, 0.03],
        costModel: "h=2.5%",
        verdict: "No information beyond beta.",
      },
      forward: { closed: 0, open: 0, meanRet: null, winRate: null, tStat: null, totalPnl: 0 },
      liveCriteria: {
        minClosedTrades: 60,
        minTStat: 2.0,
        rule: "Needs 60 closed trades and |t| >= 2.0 before going live.",
      },
    },
  ],
  open: [
    {
      id: 1,
      strategy: "cheap_vol_straddle",
      ticker: "NVDA",
      status: "open",
      entryDate: "2026-09-20",
      plannedExit: "2026-10-02",
      exitDate: null,
      exitReason: null,
      legs: [
        { occ: "O:NVDA261002C00215000", side: 1, qty: 1, cp: "C", strike: 215, expiry: "2026-10-02", entryPrice: 5.2, lastPrice: 6.1 },
        { occ: "O:NVDA261002P00215000", side: 1, qty: 1, cp: "P", strike: 215, expiry: "2026-10-02", entryPrice: 4.8, lastPrice: 4.0 },
      ],
      entryValue: 10.0,
      risk: 10.0,
      markValue: 10.1,
      pnl: 0.1,
      ret: 0.01,
      context: { impliedMove: 0.06, note: "Cheap vol entry" },
    },
  ],
  recentClosed: [
    {
      id: 2,
      strategy: "earnings_iron_fly",
      ticker: "TSLA",
      status: "closed",
      entryDate: "2026-09-10",
      plannedExit: "2026-09-15",
      exitDate: "2026-09-15",
      exitReason: "take-profit",
      legs: [
        { occ: "O:TSLA260915C00230000", side: -1, qty: 1, cp: "C", strike: 230, expiry: "2026-09-15", entryPrice: 3.0, lastPrice: 0 },
        { occ: "O:TSLA260915C00215000", side: 1, qty: 1, cp: "C", strike: 215, expiry: "2026-09-15", entryPrice: 8.0, lastPrice: 0 },
      ],
      entryValue: -5.0,
      risk: 5.0,
      markValue: 0,
      pnl: 1.25,
      ret: 0.25,
      context: {
        eventDate: "2026-09-16",
        eventTiming: "AMC",
        jev: [{ question: "Is this iron fly mispriced?", answer: "Yes, wings too wide", p: 0.7 }],
      },
    },
  ],
  calibration: [],
  system: {
    llmPrimary: "claude",
    claudeModel: "claude-sonnet-5",
    claudeCooldownUntil: "2026-09-27T14:00:00.000Z",
    lastClaudeError: "usage-limit reached",
    jevConfigured: true,
    unusualWhalesConfigured: false,
  },
};

describe("DeskPage", () => {
  beforeEach(() => {
    mockRunMutate.mockReset();
    mockRefetch.mockReset();
    mockDeskData = fixture;
    mockIsLoading = false;
    mockIsError = false;
    mockRunState = {
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      data: undefined,
    };
  });

  it("shows the no-live-eligible verdict text when nothing has passed", () => {
    const noLive: DeskResponse = {
      ...fixture,
      strategies: fixture.strategies.map((s) => ({ ...s, status: "paper" as const })),
    };
    mockDeskData = noLive;
    render(<DeskPage />);
    expect(
      screen.getByText(/No strategy has passed its forward test yet/),
    ).toBeTruthy();
    expect(screen.getByText(/docs\/research\/backtest-findings\.md/)).toBeTruthy();
  });

  it("renders execution and status as text, not just colour", () => {
    render(<DeskPage />);
    expect(screen.getAllByText("Agent can place").length).toBeGreaterThan(0);
    expect(screen.getByText("Needs Level 3 multi-leg")).toBeTruthy();
    expect(screen.getByText("Live-eligible")).toBeTruthy();
    expect(screen.getByText("Research")).toBeTruthy();
  });

  it("marks control strategies", () => {
    render(<DeskPage />);
    expect(
      screen.getByText("Control: kept to measure the old approach"),
    ).toBeTruthy();
  });

  it("formats a debit trade and a credit trade distinctly with signed P&L", () => {
    render(<DeskPage />);
    expect(screen.getByText(/Debit \$1,000\.00/)).toBeTruthy();
    expect(screen.getByText(/Credit \$500\.00/)).toBeTruthy();
    expect(screen.getByText(/\$10\.00/)).toBeTruthy();
    expect(screen.getByText(/\$125\.00/)).toBeTruthy();
  });

  it("shows the Jev evidence-reading caption, never a probability-of-profit claim", () => {
    render(<DeskPage />);
    expect(
      screen.getByText("evidence reading, not a probability of profit"),
    ).toBeTruthy();
  });

  it("shows the calibration empty state", () => {
    render(<DeskPage />);
    expect(
      screen.getByText(
        "No Jev judgments have matured yet — each needs 5 trading days after it's logged.",
      ),
    ).toBeTruthy();
  });

  it("shows non-empty calibration rows when present", () => {
    mockDeskData = {
      ...fixture,
      calibration: [
        {
          contextType: "news",
          questionId: "direction",
          n: 42,
          hitRate: 0.61,
          brier: { jev: 0.21, baseline: 0.25 },
        },
      ],
    };
    render(<DeskPage />);
    expect(screen.getByText("news")).toBeTruthy();
    expect(screen.getByText("61.0%")).toBeTruthy();
  });

  it("shows the Claude cooldown and last error in system status", () => {
    render(<DeskPage />);
    expect(screen.getByText(/Cooldown: until/)).toBeTruthy();
    expect(screen.getByText(/usage-limit reached/)).toBeTruthy();
    expect(
      screen.getByText(/Add UNUSUAL_WHALES_API_KEY/),
    ).toBeTruthy();
  });

  it("shows a loading skeleton", () => {
    mockIsLoading = true;
    render(<DeskPage />);
    expect(screen.getByText("Loading the desk…")).toBeTruthy();
  });

  it("shows an error state with a retry button that refetches", async () => {
    const user = userEvent.setup();
    mockIsError = true;
    mockDeskData = undefined;
    render(<DeskPage />);
    const alert = screen.getByRole("alert");
    expect(alert).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it("calls the run mutation and announces the result", async () => {
    const user = userEvent.setup();
    render(<DeskPage />);
    await user.click(screen.getByRole("button", { name: /run now/i }));
    expect(mockRunMutate).toHaveBeenCalled();
  });

  it("announces a run in progress while pending", () => {
    mockRunState = { isPending: true, isError: false, isSuccess: false, error: null, data: undefined };
    render(<DeskPage />);
    expect(screen.getByText("Running now…")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /run now/i }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("announces the 409 conflict case as a run already in progress", () => {
    mockRunState = {
      isPending: false,
      isError: true,
      isSuccess: false,
      error: new Error("A run is already in progress"),
      data: undefined,
    };
    render(<DeskPage />);
    expect(screen.getByText("A run is already in progress")).toBeTruthy();
  });

  it("announces a successful run result", () => {
    mockRunState = {
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
      data: { opened: 2, marked: 5, closed: 1, errors: [] },
    };
    render(<DeskPage />);
    expect(
      screen.getByText("Run complete: 2 opened, 5 marked, 1 closed."),
    ).toBeTruthy();
  });
});

describe("formatContextLines", () => {
  it("renders implied move, VIX and Reddit hype when present, nothing when absent", async () => {
    const { formatContextLines } = await import("@/components/desk/desk-format");
    expect(
      formatContextLines({ impliedMove: 0.06, vix: 23.44, hype: { rank: 12, mentions: 340, mentions24hAgo: 120 } }),
    ).toEqual(["Implied move ±6.0%", "VIX 23.4", "Reddit #12 · 340 mentions (+183% in 24h)"]);
    expect(formatContextLines({ hype: { rank: 3, mentions: 30, mentions24hAgo: null } })).toEqual(["Reddit #3 · 30 mentions"]);
    expect(formatContextLines({})).toEqual([]);
  });
});

describe("desk formatting of dates and marks", () => {
  it("shows the trading date itself, not the evening before", async () => {
    const { formatSessionDate } = await import("@/components/desk/desk-format");
    expect(formatSessionDate("2026-09-25")).toBe("Sep 25, 2026");
  });

  it("labels a credit position's mark as the cost to close", async () => {
    const { formatMark } = await import("@/components/desk/desk-format");
    expect(formatMark(-1.4176)).toBe("$141.76 to close");
    expect(formatMark(2.5)).toBe("$250.00 value");
    expect(formatMark(null)).toBe("—");
  });
});
