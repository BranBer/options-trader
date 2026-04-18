import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockCalendar, mockRecentReleases } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    insert: vi.fn(),
  },
  mockCalendar: {
    getCachedCalendar: vi.fn(),
  },
  mockRecentReleases: vi.fn(),
}));

const mockCallLlmWithRetry = vi.fn();

vi.mock("@/lib/db/client", () => ({ db: mockDb }));
vi.mock("@/lib/services/llm-client", () => ({
  callLlmWithRetry: (...args: unknown[]) => mockCallLlmWithRetry(...args),
  getTokenUsageSnapshot: () => ({}),
}));
vi.mock("@/lib/services/live-economic-calendar", () => ({
  getCachedCalendar: () => mockCalendar.getCachedCalendar(),
}));
vi.mock("@/lib/services/post-release-analyzer", () => ({
  getRecentReleaseSummary: () => mockRecentReleases(),
}));

import {
  correlateCatalysts,
  synthesizeNarrative,
} from "@/lib/services/market-pulse-engine";

function makeInsertChain() {
  return { values: vi.fn().mockResolvedValue(undefined) };
}

function makeSelectChain(result: unknown, withLimit = false) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() =>
        withLimit
          ? {
              orderBy: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue(result),
              })),
            }
          : result,
      ),
      orderBy: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(result) })),
    })),
  };
}

describe("market-pulse Sprint 3 services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.insert.mockImplementation(() => makeInsertChain());
    mockCalendar.getCachedCalendar.mockReturnValue([
      {
        date: "2026-04-17",
        name: "CPI",
        impact: "high",
        description: "Inflation print",
      },
    ]);
    mockRecentReleases.mockReturnValue({
      recentReleases: [],
      generatedAt: "2026-04-17T14:00:00.000Z",
    });
  });

  it("correlates classified events to recent catalysts and persists them", async () => {
    mockDb.select.mockImplementationOnce(() =>
      makeSelectChain(
        [
          {
            id: 11,
            headline: "Apple unveils major AI strategy",
            eventType: "technology",
            sentiment: "bullish",
            rawSummary: "AI catalyst",
            impactScore: 8,
            tickers: JSON.stringify(["AAPL"]),
            createdAt: "2026-04-17T13:55:00.000Z",
            publishedAt: "2026-04-17T13:50:00.000Z",
          },
        ],
        true,
      ),
    );

    mockCallLlmWithRetry.mockResolvedValueOnce({
      correlations: [
        {
          price_event: "Buyers defended the pullback and reclaimed control.",
          candle_time: "2026-04-17T14:00:00.000Z",
          external_event: {
            type: "news",
            headline: "Apple unveils major AI strategy",
            timestamp: "2026-04-17T13:55:00.000Z",
            sentiment: "bullish",
          },
          correlation_confidence: 0.84,
          reasoning:
            "The headline arrived minutes before the candle and aligns with bullish expansion.",
        },
      ],
    });

    const correlations = await correlateCatalysts({
      runId: "run-123",
      ticker: "AAPL",
      classifications: [
        {
          candle_time: "2026-04-17T14:00:00.000Z",
          classification: {
            control: "buyers",
            control_strength: 7,
            rejection_type: "lower_rejection",
            rejection_strength: 6,
            absorption_detected: false,
            momentum_state: "expanding",
            structure_state: "trend_continuation",
            volatility_state: "expansion",
          },
          event: "Buyers defended the pullback and reclaimed control.",
          significance: "medium",
          tradability: "watch",
        },
      ],
    });

    expect(correlations).toHaveLength(1);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const rows = mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(rows[0]).toMatchObject({
      runId: "run-123",
      externalEventId: 11,
      correlationConfidence: 0.84,
    });
  });

  it("builds a rolling narrative from prior context and persists structured output", async () => {
    mockDb.select.mockImplementationOnce(() =>
      makeSelectChain(
        [
          {
            runId: "prior-run",
            currentControl: "buyers",
            controlStrength: 6,
            marketPhase: "trend",
            expectedBehavior: "continuation",
            narrativeSummary: "Buyers were in control.",
            keyConflicts: JSON.stringify([]),
            confidenceInAssessment: 0.7,
            structuredOutput: JSON.stringify({
              current_control: "buyers",
              control_strength: 6,
              narrative_summary: "Buyers were in control.",
              market_phase: "trend",
              expected_behavior: "continuation",
              key_conflicts: [],
              confidence_in_assessment: 0.7,
            }),
            inputEventCount: 3,
            priorRunId: null,
            createdAt: "2026-04-17T13:45:00.000Z",
          },
        ],
        true,
      ),
    );

    mockCallLlmWithRetry.mockResolvedValueOnce({
      current_control: "neutral",
      control_strength: 5,
      narrative_summary:
        "Buyers lost some control as sellers pushed back, leaving the tape more contested than the prior run.",
      market_phase: "transition",
      expected_behavior: "range",
      key_conflicts: ["Momentum cooled after the initial buyer-led push."],
      confidence_in_assessment: 0.61,
    });

    const narrative = await synthesizeNarrative({
      runId: "run-456",
      ticker: "AAPL",
      classifications: [
        {
          candle_time: "2026-04-17T14:15:00.000Z",
          classification: {
            control: "buyers",
            control_strength: 6,
            rejection_type: "none",
            rejection_strength: 2,
            absorption_detected: false,
            momentum_state: "stable",
            structure_state: "pullback",
            volatility_state: "compression",
          },
          event: "Buyers held the close but with less urgency.",
          significance: "medium",
          tradability: "watch",
        },
      ],
      correlations: [],
    });

    expect(narrative).toMatchObject({
      current_control: "neutral",
      market_phase: "transition",
      expected_behavior: "range",
    });
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const persisted =
      mockDb.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(persisted).toMatchObject({
      runId: "run-456",
      priorRunId: "prior-run",
      marketPhase: "transition",
    });
  });
});
