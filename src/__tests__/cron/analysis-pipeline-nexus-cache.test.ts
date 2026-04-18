import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCachedNexusEarnings: vi.fn(),
  getNexusEarningsAge: vi.fn(),
  fetchVIX: vi.fn(),
  fetchEarningsDate: vi.fn(),
  fetchEpsSurprise: vi.fn(),
  fetchSectorPerformance: vi.fn(),
  getOrFetchShortInterest: vi.fn(),
  dbSelect: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: (...args: unknown[]) => mocks.dbSelect(...args),
    insert: vi.fn(),
  },
}));

vi.mock("@/lib/db/schema", () => ({
  newsEvents: { createdAt: "createdAt", impactScore: "impactScore" },
  whaleAlerts: { createdAt: "createdAt", detectedAt: "detectedAt" },
  marketSnapshots: {},
  analyses: {},
}));

vi.mock("@/lib/services/llm-analyzer", () => ({
  crossReferenceAnalysis: vi.fn(),
  generateRecommendation: vi.fn(),
  generateDeepDive: vi.fn(),
}));

vi.mock("@/lib/services/market-fetcher", () => ({
  fetchMarketData: vi.fn(),
  fetchVIX: (...args: unknown[]) => mocks.fetchVIX(...args),
  fetchEarningsDate: (...args: unknown[]) => mocks.fetchEarningsDate(...args),
  fetchEpsSurprise: (...args: unknown[]) => mocks.fetchEpsSurprise(...args),
  getOrFetchShortInterest: (...args: unknown[]) =>
    mocks.getOrFetchShortInterest(...args),
  fetchSectorPerformance: (...args: unknown[]) =>
    mocks.fetchSectorPerformance(...args),
}));

vi.mock("@/lib/utils/vix-regimes", () => ({
  buildVIXContext: vi.fn(() => ({ level: 18, regime: "low" })),
}));

vi.mock("@/lib/utils/fomc-calendar", () => ({
  getFOMCProximity: vi.fn(() => ({
    nextDate: "2026-04-28",
    isDecisionWeek: false,
  })),
}));

vi.mock("@/lib/services/insider-fetcher", () => ({
  fetchInsiderTransactions: vi.fn(),
  computeInsiderSentiment: vi.fn(),
}));

vi.mock("@/lib/utils/sector-rotation", () => ({
  classifyRotation: vi.fn(),
  buildSectorRotationPromptContext: vi.fn(),
}));

vi.mock("@/lib/utils/confidence-adjuster", () => ({
  computeConfidenceAdjustment: vi.fn(() => 0),
}));

vi.mock("@/lib/utils/composite-confidence", () => ({
  computeCompositeConfidence: vi.fn(() => 0.5),
}));

vi.mock("@/lib/utils/deep-dive-freshness", () => ({
  isTimeframeAwareDeepDiveOutput: vi.fn(() => false),
}));

vi.mock("@/lib/utils/signal-scorecard", () => ({
  computeSignalScorecard: vi.fn(() => null),
}));

vi.mock("@/lib/services/ticker-context-builder", () => ({
  buildTickerAnalysisContext: vi.fn(),
}));

vi.mock("@/lib/services/recommendation-adapter", () => ({
  buildRecommendationQueue: vi.fn(() => []),
}));

vi.mock("@/lib/prompts/options-chain-summary", () => ({
  buildRichOptionsChainSummary: vi.fn(() => "summary"),
}));

vi.mock("@/lib/utils/economic-calendar", () => ({
  getUpcomingCatalysts: vi.fn(() => []),
}));

vi.mock("@/lib/services/nexus-earnings-cache", () => ({
  getCachedNexusEarnings: (...args: unknown[]) =>
    mocks.getCachedNexusEarnings(...args),
  getNexusEarningsAge: (...args: unknown[]) =>
    mocks.getNexusEarningsAge(...args),
}));

function createSelectChain(result: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(result),
        })),
      })),
    })),
  };
}

describe("analysis pipeline nexus cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchVIX.mockResolvedValue(18);
    mocks.getCachedNexusEarnings.mockReturnValue(
      new Map([
        [
          "AAPL",
          { reportedAt: "2026-04-16T12:00:00.000Z", epsSurprisePct: 8.2 },
        ],
      ]),
    );
    mocks.getNexusEarningsAge.mockReturnValue(5 * 60 * 1000);
    mocks.dbSelect
      .mockImplementationOnce(() => createSelectChain([]))
      .mockImplementationOnce(() => createSelectChain([]));
  });

  it("uses cached nexus earnings and does not refresh them inline", async () => {
    const { runAnalysisPipeline } =
      await import("@/lib/cron/pipelines/analysis-pipeline");

    const stored = await runAnalysisPipeline();

    expect(stored).toBe(0);
    expect(mocks.getCachedNexusEarnings).toHaveBeenCalledTimes(1);
    expect(mocks.fetchEarningsDate).not.toHaveBeenCalled();
    expect(mocks.fetchEpsSurprise).not.toHaveBeenCalled();
  });
});
