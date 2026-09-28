import { describe, expect, it, vi } from "vitest";
import type { DeskResponse, DeskRunSummary } from "@/types/desk";

const fixtureResponse: DeskResponse = {
  asOf: "2026-09-25",
  lastRun: {
    startedAt: "2026-09-25T20:35:00.000Z",
    completedAt: "2026-09-25T20:35:04.000Z",
    opened: 1,
    marked: 3,
    closed: 1,
    errors: [],
  },
  strategies: [
    {
      id: "earnings_iron_fly",
      label: "Earnings iron fly",
      thesis: "thesis",
      execution: "manual-level3",
      status: "paper",
      evidence: {
        summary: "summary",
        n: 671,
        meanAfterCosts: -0.011,
        ci95: [-0.063, 0.042],
        costModel: "2% half-spread per leg per side on daily closes",
        verdict: "verdict",
      },
      forward: { closed: 0, open: 0, meanRet: null, winRate: null, tStat: null, totalPnl: 0 },
      liveCriteria: { minClosedTrades: 60, minTStat: 2, rule: "rule" },
    },
  ],
  open: [],
  recentClosed: [],
  calibration: [],
  system: {
    llmPrimary: "claude",
    claudeModel: "sonnet",
    claudeCooldownUntil: null,
    lastClaudeError: null,
    jevConfigured: true,
    unusualWhalesConfigured: false,
  },
};

const mockBuildDeskResponse = vi.fn(async () => fixtureResponse);
vi.mock("@/lib/desk/desk-data", () => ({
  buildDeskResponse: () => mockBuildDeskResponse(),
}));

const mockRunDesk = vi.fn();
class MockDeskRunInProgressError extends Error {}
vi.mock("@/lib/desk/run-desk", () => ({
  runDesk: (...args: unknown[]) => mockRunDesk(...args),
  DeskRunInProgressError: MockDeskRunInProgressError,
}));

describe("GET /api/desk", () => {
  it("returns every DeskResponse key", async () => {
    const { GET } = await import("@/app/api/desk/route");
    const res = await GET();
    const json = await res.json();

    const expectedKeys: (keyof DeskResponse)[] = [
      "asOf",
      "lastRun",
      "strategies",
      "open",
      "recentClosed",
      "calibration",
      "system",
    ];
    for (const key of expectedKeys) {
      expect(json).toHaveProperty(key);
    }
    expect(json.system).toHaveProperty("llmPrimary");
    expect(json.system).toHaveProperty("claudeModel");
    expect(json.system).toHaveProperty("claudeCooldownUntil");
    expect(json.system).toHaveProperty("lastClaudeError");
    expect(json.system).toHaveProperty("jevConfigured");
    expect(json.system).toHaveProperty("unusualWhalesConfigured");
  });

  it("returns 500 with a message when the builder throws", async () => {
    mockBuildDeskResponse.mockRejectedValueOnce(new Error("boom"));
    const { GET } = await import("@/app/api/desk/route");
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("POST /api/desk/run", () => {
  it("returns the DeskRunSummary on success", async () => {
    const summary: DeskRunSummary = {
      startedAt: "2026-09-25T20:35:00.000Z",
      completedAt: "2026-09-25T20:35:04.000Z",
      opened: 2,
      marked: 5,
      closed: 1,
      errors: [],
    };
    mockRunDesk.mockResolvedValueOnce(summary);
    const { POST } = await import("@/app/api/desk/run/route");
    const res = await POST();
    const json = await res.json();
    expect(json).toEqual(summary);
  });

  it("returns 409 when a run is already in progress", async () => {
    mockRunDesk.mockRejectedValueOnce(new MockDeskRunInProgressError("busy"));
    const { POST } = await import("@/app/api/desk/run/route");
    const res = await POST();
    expect(res.status).toBe(409);
  });
});
