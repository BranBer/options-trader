import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockClassifyNews, mockAutoTriggerEventAnalysis } = vi.hoisted(
  () => ({
    mockDb: {
      select: vi.fn(),
      insert: vi.fn(),
    },
    mockClassifyNews: vi.fn(),
    mockAutoTriggerEventAnalysis: vi.fn(),
  }),
);

vi.mock("@/lib/db/client", () => ({ db: mockDb }));
vi.mock("@/lib/services/llm-analyzer", () => ({
  classifyNews: mockClassifyNews,
}));
vi.mock("@/lib/services/event-ticker-analyzer", () => ({
  autoTriggerEventAnalysis: mockAutoTriggerEventAnalysis,
}));
vi.mock("@/lib/services/news-fetcher", () => ({
  fetchAllNews: vi.fn(),
}));

import { classifyAndStoreNews } from "@/lib/cron/pipelines/news-pipeline";

function createExistingRows(result: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(result),
    })),
  };
}

function createInsertedLookup(result: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn().mockResolvedValue(result),
      })),
    })),
  };
}

describe("news-pipeline auto-trigger", () => {
  const previousEnv = process.env.EVENT_ANALYSIS_AUTO_TRIGGER;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select
      .mockImplementationOnce(() => createExistingRows([]))
      .mockImplementationOnce(() =>
        createInsertedLookup([
          {
            id: 77,
            headline: "Tariff pause supports semis",
            source: "marketaux",
            url: "https://example.com/article",
            publishedAt: "2026-04-06T12:00:00.000Z",
            countryCode: "US",
            lat: null,
            lng: null,
            impactScore: 9,
            sentiment: "bullish",
            sectors: JSON.stringify(["Technology"]),
            tickers: JSON.stringify(["NVDA", "AMD"]),
            eventType: "regulatory",
            rawSummary: "Policy eases pressure on semiconductor inputs.",
            geminiAnalysis: JSON.stringify({ reasoning: "test" }),
            createdAt: "2026-04-06T12:00:00.000Z",
          },
        ]),
      );
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mockClassifyNews.mockResolvedValue({
      articles: [
        {
          original_headline: "Tariff pause supports semis",
          source: "marketaux",
          url: "https://example.com/article",
          published_at: "2026-04-06T12:00:00.000Z",
          is_market_relevant: true,
          impact_score: 9,
          market_sentiment: "bullish",
          affected_sectors: ["Technology"],
          affected_tickers: ["NVDA", "AMD"],
          event_type: "regulatory",
          country_code: "US",
          region: "US",
          one_line_summary: "Policy eases pressure on semiconductor inputs.",
          reasoning: "test",
        },
      ],
    });
    mockAutoTriggerEventAnalysis.mockResolvedValue(1);
  });

  afterAll(() => {
    process.env.EVENT_ANALYSIS_AUTO_TRIGGER = previousEnv;
  });

  it("auto-triggers event analysis when enabled", async () => {
    process.env.EVENT_ANALYSIS_AUTO_TRIGGER = "true";

    await classifyAndStoreNews([
      {
        headline: "Tariff pause supports semis",
        source: "marketaux",
        url: "https://example.com/article",
        publishedAt: "2026-04-06T12:00:00.000Z",
      },
    ] as any);

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(mockDb.select).toHaveBeenCalledTimes(2);
    expect(mockDb.insert.mock.results[0].value.values).toHaveBeenCalledTimes(1);
    expect(mockDb.insert.mock.results[0].value.values).toHaveBeenCalledWith([
      expect.objectContaining({
        headline: "Tariff pause supports semis",
        url: "https://example.com/article",
      }),
    ]);
    expect(mockAutoTriggerEventAnalysis).toHaveBeenCalledOnce();
    expect(mockAutoTriggerEventAnalysis).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: 77,
          headline: "Tariff pause supports semis",
        }),
      ]),
      { minImpact: 8 },
    );
  });

  it("skips auto-trigger when disabled", async () => {
    process.env.EVENT_ANALYSIS_AUTO_TRIGGER = "false";
    mockAutoTriggerEventAnalysis.mockResolvedValue(0);

    await classifyAndStoreNews([
      {
        headline: "Tariff pause supports semis",
        source: "marketaux",
        url: "https://example.com/article",
        publishedAt: "2026-04-06T12:00:00.000Z",
      },
    ] as any);

    expect(mockAutoTriggerEventAnalysis).toHaveBeenCalledOnce();
  });

  it("stores classified articles in a single batch and re-queries once", async () => {
    await classifyAndStoreNews(
      [
        {
          headline: "Tariff pause supports semis",
          source: "marketaux",
          url: "https://example.com/article",
          publishedAt: "2026-04-06T12:00:00.000Z",
        },
      ] as any,
      undefined,
      { autoTriggerMinImpact: 9 },
    );

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(mockDb.select).toHaveBeenCalledTimes(2);
    expect(mockAutoTriggerEventAnalysis).toHaveBeenCalledWith(
      expect.any(Array),
      { minImpact: 9 },
    );
  });
});
