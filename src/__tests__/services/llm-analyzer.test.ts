import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { RawNewsArticle } from "@/types/news";
import { newsClassificationSchema } from "@/types/news";
import { crossReferenceAnalysisSchema } from "@/types/analysis";
import { tradeRecommendationSchema } from "@/types/analysis";
import { deepDiveAnalysisSchema } from "@/types/analysis";
import type { Correlation } from "@/types/analysis";

// ---------------------------------------------------------------------------
// Mock OpenAI SDK — intercept all API calls
// ---------------------------------------------------------------------------

const mockCreate = vi.fn();

vi.mock("openai", () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };
  }
  return { default: MockOpenAI };
});

// Must import AFTER mocks are set up
import {
  classifyNews,
  crossReferenceAnalysis,
  generateRecommendation,
  generateDeepDive,
  getTokenUsageStats,
} from "@/lib/services/llm-analyzer";
import * as volumeProfileModule from "@/lib/utils/volume-profile";
import * as algoSrModule from "@/lib/utils/algo-sr";
import * as optionsAnalyticsModule from "@/lib/utils/options-analytics";
import * as triggerEngineModule from "@/lib/utils/trigger-engine";

// ---------------------------------------------------------------------------
// Test fixtures — valid model responses matching each Zod schema
// ---------------------------------------------------------------------------

const VALID_CLASSIFICATION_RESPONSE = {
  articles: [
    {
      original_headline: "Fed raises rates by 25bps",
      source: "finnhub",
      url: "https://example.com/fed",
      published_at: "2026-03-31T10:00:00Z",
      is_market_relevant: true,
      impact_score: 8,
      market_sentiment: "bearish",
      affected_sectors: ["Financials", "Technology"],
      affected_tickers: ["SPY", "QQQ"],
      event_type: "central_bank",
      country_code: "US",
      region: "North America",
      one_line_summary:
        "Federal Reserve raises interest rates by 25 basis points",
      reasoning:
        "Rate hikes increase borrowing costs, negative for growth stocks",
    },
    {
      original_headline: "Local bakery wins award",
      source: "marketaux",
      published_at: "2026-03-31T09:00:00Z",
      is_market_relevant: false,
      impact_score: 1,
      market_sentiment: "neutral",
      affected_sectors: [],
      affected_tickers: [],
      event_type: "other",
      country_code: "US",
      region: "North America",
      one_line_summary: "Not market relevant",
      reasoning: "Local news with no market impact",
    },
  ],
  processing_metadata: {
    total_input: 2,
    total_relevant: 1,
    total_discarded: 1,
    processing_timestamp: "2026-03-31T10:00:00Z",
  },
};

const VALID_CROSS_REFERENCE_RESPONSE = {
  correlations: [
    {
      whale_trade: {
        ticker: "AAPL",
        strike: 200,
        expiry: "2026-04-18",
        type: "call",
        premium: 500000,
        volume: 5000,
      },
      related_event: {
        headline: "Fed raises rates by 25bps",
        impact_score: 8,
        event_type: "central_bank",
      },
      correlation_confidence: 0.75,
      alignment: "contrarian",
      thesis: "Whale betting AAPL will recover despite rate hike pressure",
      smart_money_signal: "bullish",
    },
  ],
  uncorrelated_whales: [
    {
      ticker: "TSLA",
      type: "put",
      premium: 300000,
      note: "Large put position with no clear news catalyst",
    },
  ],
  summary:
    "One high-confidence correlation found between AAPL whale activity and Fed rate decision.",
  analysis_metadata: {
    news_events_analyzed: 5,
    whale_trades_analyzed: 10,
    correlations_found: 1,
    timestamp: "2026-03-31T10:05:00Z",
  },
};

const VALID_RECOMMENDATION_RESPONSE = {
  ticker: "AAPL",
  thesis: "Contrarian long on AAPL post-rate hike with whale confirmation",
  direction: "bullish",
  confidence: 0.65,
  primary_strategy: {
    name: "Bull Call Spread",
    legs: [
      {
        action: "buy",
        type: "call",
        strike: 195,
        expiry: "2026-04-18",
        estimated_premium: 8.5,
      },
      {
        action: "sell",
        type: "call",
        strike: 205,
        expiry: "2026-04-18",
        estimated_premium: 3.2,
      },
    ],
    max_profit: "$4.70 per share ($470 per contract)",
    max_loss: "$5.30 per share ($530 per contract)",
    breakeven: "$200.30",
    risk_reward_ratio: "1:0.89",
  },
  market_context: {
    iv_assessment: "elevated",
    iv_strategy_note: "Elevated IV favors spreads over naked options",
    volume_assessment: "unusual_high",
    catalyst_date: "2026-04-02",
    days_to_catalyst: 2,
  },
  risk_factors: [
    "Rate-sensitive sector under pressure",
    "IV may collapse after rate decision settles",
  ],
  whale_alignment: {
    matches_whale: true,
    whale_position_size: "$500K in near-money calls",
    similarity_note: "Strategy aligns with whale's bullish call positioning",
  },
  disclaimer: "This is not financial advice. Paper trade only.",
};

const VALID_DEEP_DIVE_RESPONSE = {
  ticker: "AAPL",
  whale_trade_summary: "Large $500K call purchase at $200 strike, April expiry",
  market_narrative: "Post-rate hike recovery play on AAPL",
  technical_patterns: [
    {
      name: "Double Bottom",
      type: "bullish",
      description: "Price formed a double bottom near $190 support",
      confidence: 0.7,
      price_target: 210,
    },
  ],
  support_resistance: [
    {
      level: 190,
      type: "support",
      strength: "strong",
      note: "Prior consolidation zone",
    },
    {
      level: 210,
      type: "resistance",
      strength: "moderate",
      note: "52-week high area",
    },
  ],
  indicators: [
    {
      name: "RSI",
      value: "42",
      signal: "neutral",
      explanation: "Neither overbought nor oversold",
    },
    {
      name: "MACD",
      value: "Bullish crossover",
      signal: "bullish",
      explanation: "MACD crossed above signal line",
    },
  ],
  options_context: {
    iv_percentile: "72nd percentile",
    iv_interpretation: "IV is elevated relative to the past year",
    put_call_ratio: "0.85",
    unusual_activity_note: "Significant call buying at $200 strike",
    greeks_summary: "Delta-heavy position with moderate theta decay",
    greeks_breakdown: [
      {
        greek: "delta",
        value: "0.55",
        plain_english: "Position gains ~$55 per $1 move up",
        implication: "favorable",
      },
      {
        greek: "theta",
        value: "-0.12",
        plain_english: "Loses ~$12 per day to time decay",
        implication: "unfavorable",
      },
      {
        greek: "gamma",
        value: "0.03",
        plain_english: "Delta changes by 0.03 per $1 move",
        implication: "favorable",
      },
      {
        greek: "vega",
        value: "0.18",
        plain_english: "Position gains ~$18 per 1% IV increase",
        implication: "neutral",
      },
    ],
  },
  entry_exit: {
    recommended_option_type: "Call spread",
    entry_price_range: { low: 4.8, high: 5.5 },
    strike_selection: "$195/$205 strikes for defined risk",
    expiry_guidance:
      "April 18 — 18 DTE, sufficient time for thesis to play out",
    profit_target: "Take profit at 50% of max gain ($2.35)",
    stop_loss: "Close at 50% loss ($2.65)",
    position_sizing: "Risk no more than 2% of portfolio",
    rationale: "Defined-risk spread captures upside with limited downside",
  },
  global_events_connection:
    "Fed rate decision may create short-term volatility but historical pattern shows recovery within 2 weeks",
  risk_assessment: {
    overall_risk: "moderate",
    key_risks: [
      "Further rate hikes",
      "Earnings miss in April",
      "Broader market selloff",
    ],
    max_recommended_allocation: "2% of portfolio",
  },
  educational_notes: [
    {
      term: "Bull Call Spread",
      explanation:
        "A strategy that profits from a moderate price increase using two call options",
    },
    {
      term: "IV Percentile",
      explanation:
        "Shows where current implied volatility ranks relative to the past year",
    },
  ],
  disclaimer: "Educational analysis only. Not financial advice.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockLLMResponse(content: object, tokens = 500) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: { completion_tokens: tokens, total_tokens: tokens + 200 },
  });
}

function mockLLMResponseRaw(text: string, tokens = 500) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: text } }],
    usage: { completion_tokens: tokens, total_tokens: tokens + 200 },
  });
}

const SAMPLE_ARTICLES: RawNewsArticle[] = [
  {
    headline: "Fed raises rates by 25bps",
    source: "finnhub",
    publishedAt: "2026-03-31T10:00:00Z",
    summary: "The Federal Reserve raised interest rates by 25 basis points.",
  },
  {
    headline: "Local bakery wins award",
    source: "marketaux",
    publishedAt: "2026-03-31T09:00:00Z",
    summary: "A local bakery won a regional award.",
  },
];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPEN_ROUTER_API_KEY = "test-key-123";
  process.env.OPEN_ROUTER_MODEL = "test/model-v1";
});

afterEach(() => {
  delete process.env.OPEN_ROUTER_API_KEY;
  delete process.env.OPEN_ROUTER_MODEL;
  delete process.env.OPEN_ROUTER_NEWS_MODEL;
  delete process.env.OPEN_ROUTER_NEWS_CONCURRENCY;
});

// ============================================================
// Story 25.5a — callLLMWithRetry behavior
// ============================================================

describe("callLLMWithRetry — via classifyNews", () => {
  it("returns parsed result on first success", async () => {
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 800);
    const result = await classifyNews(SAMPLE_ARTICLES);

    // Should filter to only impact >= 3 articles
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].original_headline).toBe(
      "Fed raises rates by 25bps",
    );
    expect(result.processing_metadata.total_relevant).toBe(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("retries on API error and succeeds", async () => {
    mockCreate.mockRejectedValueOnce(new Error("500 Internal Server Error"));
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 800);

    const result = await classifyNews(SAMPLE_ARTICLES);
    expect(result.articles).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("retries on empty response", async () => {
    mockLLMResponseRaw("", 0);
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 800);

    const result = await classifyNews(SAMPLE_ARTICLES);
    expect(result.articles).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("retries on invalid JSON", async () => {
    mockLLMResponseRaw("This is not JSON at all, just prose text.", 100);
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 800);

    const result = await classifyNews(SAMPLE_ARTICLES);
    expect(result.articles).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("repairs trailing commas in LLM JSON output", async () => {
    // Simulate the exact defect: trailing commas before } and ]
    const jsonWithTrailingCommas = JSON.stringify(VALID_CLASSIFICATION_RESPONSE)
      .replace(/\}]/g, ",}]") // trailing comma in last object before ]
      .replace(/\}\}/g, ",}}"); // trailing comma before closing }
    mockLLMResponseRaw(jsonWithTrailingCommas, 800);

    const result = await classifyNews(SAMPLE_ARTICLES);
    expect(result.articles).toHaveLength(1);
    // Should succeed on first attempt — no retry needed
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("retries on Zod validation failure", async () => {
    // Return JSON but with wrong schema
    mockLLMResponse({ wrong_field: "bad data" }, 100);
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 800);

    const result = await classifyNews(SAMPLE_ARTICLES);
    expect(result.articles).toHaveLength(1);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("returns empty result when all retries fail", async () => {
    mockCreate.mockRejectedValue(new Error("Persistent failure"));

    // classifyNews uses Promise.allSettled — batch failures are caught,
    // not thrown. Returns empty classification instead.
    const result = await classifyNews(SAMPLE_ARTICLES);
    expect(result.articles).toHaveLength(0);
    expect(result.processing_metadata.total_relevant).toBe(0);
    expect(mockCreate).toHaveBeenCalledTimes(3); // default maxRetries = 3
  }, 15_000);

  it("returns empty result for empty input without calling LLM", async () => {
    const result = await classifyNews([]);
    expect(result.articles).toHaveLength(0);
    expect(result.processing_metadata.total_input).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("batches articles and merges results", async () => {
    // Create 25 articles to force 2 batches (MAX_ARTICLES_PER_BATCH = 20)
    const manyArticles: RawNewsArticle[] = Array.from(
      { length: 25 },
      (_, i) => ({
        headline: `Article ${i}`,
        source: "finnhub" as const,
        publishedAt: "2026-03-31T10:00:00Z",
      }),
    );

    const batch1Response = {
      articles: [
        {
          ...VALID_CLASSIFICATION_RESPONSE.articles[0],
          original_headline: "Batch 1 article",
        },
      ],
      processing_metadata: {
        total_input: 20,
        total_relevant: 1,
        total_discarded: 19,
        processing_timestamp: "2026-03-31T10:00:00Z",
      },
    };
    const batch2Response = {
      articles: [
        {
          ...VALID_CLASSIFICATION_RESPONSE.articles[0],
          original_headline: "Batch 2 article",
        },
      ],
      processing_metadata: {
        total_input: 5,
        total_relevant: 1,
        total_discarded: 4,
        processing_timestamp: "2026-03-31T10:00:00Z",
      },
    };

    mockLLMResponse(batch1Response, 500);
    mockLLMResponse(batch2Response, 300);

    const result = await classifyNews(manyArticles);
    expect(result.articles).toHaveLength(2);
    expect(result.articles[0].original_headline).toBe("Batch 1 article");
    expect(result.articles[1].original_headline).toBe("Batch 2 article");
  });

  it("injects schema guidance into system prompt", async () => {
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 800);
    await classifyNews(SAMPLE_ARTICLES);

    const callArgs = mockCreate.mock.calls[0][0];
    const systemMsg = callArgs.messages[0].content;
    expect(systemMsg).toContain(
      "You MUST respond with ONLY a valid JSON object",
    );
    expect(systemMsg).toContain('"original_headline"');
  });

  it("uses json_object response format", async () => {
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 800);
    await classifyNews(SAMPLE_ARTICLES);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.response_format).toEqual({ type: "json_object" });
  });

  it("suppresses reasoning for qwen3.5 models", async () => {
    process.env.OPEN_ROUTER_MODEL = "qwen/qwen3.5-9b";
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 800);
    await classifyNews(SAMPLE_ARTICLES);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.reasoning).toEqual({ effort: "none" });
  });

  it("falls back to the stable qwen3.5 model when the global model is preview-only", async () => {
    process.env.OPEN_ROUTER_MODEL = "qwen/qwen3.6-plus-preview:free";
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 800);
    await classifyNews(SAMPLE_ARTICLES);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("qwen/qwen3.5-plus-02-15");
    expect(callArgs.reasoning).toEqual({ effort: "none" });
  });

  it("uses a stable non-preview model for classifyNews when the global model is preview-only", async () => {
    process.env.OPEN_ROUTER_MODEL = "qwen/qwen3.6-plus-preview:free";
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 800);

    await classifyNews(SAMPLE_ARTICLES);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("qwen/qwen3.5-plus-02-15");
    expect(callArgs.reasoning).toEqual({ effort: "none" });
  });

  it("prefers OPEN_ROUTER_NEWS_MODEL when provided", async () => {
    process.env.OPEN_ROUTER_MODEL = "qwen/qwen3.6-plus-preview:free";
    process.env.OPEN_ROUTER_NEWS_MODEL = "openai/gpt-4.1-mini";
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 800);

    await classifyNews(SAMPLE_ARTICLES);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("openai/gpt-4.1-mini");
  });

  it("ignores a preview news model override and uses the stable fallback", async () => {
    process.env.OPEN_ROUTER_MODEL = "qwen/qwen3.6-plus-preview:free";
    process.env.OPEN_ROUTER_NEWS_MODEL = "qwen/qwen3.6-plus-preview:free";
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 800);

    await classifyNews(SAMPLE_ARTICLES);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe("qwen/qwen3.5-plus-02-15");
  });
});

describe("generateDeepDive precomputed context reuse", () => {
  it("uses precomputed signal hierarchy and trigger report without recomputing analytics", async () => {
    const volumeProfileSpy = vi.spyOn(
      volumeProfileModule,
      "computeVolumeProfile",
    );
    const algoSRSpy = vi.spyOn(algoSrModule, "computeAlgoSR");
    const ivSkewSpy = vi.spyOn(optionsAnalyticsModule, "computeIVSkew");
    const oiSummarySpy = vi.spyOn(optionsAnalyticsModule, "computeOISummary");
    const triggerReportSpy = vi.spyOn(
      triggerEngineModule,
      "buildTriggerReport",
    );

    mockLLMResponse(VALID_DEEP_DIVE_RESPONSE, 1200);

    const { deepDive, triggerReport } = await generateDeepDive({
      ticker: "AAPL",
      whaleTrade: {
        ticker: "AAPL",
        strike: 200,
        expiry: "2026-04-18",
        callPut: "C",
        premium: 500000,
        volume: 1000,
      },
      historicalData: [
        {
          time: "2026-04-01",
          open: 195,
          high: 201,
          low: 194,
          close: 200,
          volume: 1000,
        },
      ],
      historicalDataByTimeframe: {
        "1D": [],
        "1W": [],
        "1M": [],
        "3M": [
          {
            time: "2026-04-01",
            open: 195,
            high: 201,
            low: 194,
            close: 200,
            volume: 1000,
          },
        ],
        "6M": [],
        "1Y": [],
      },
      optionsChain: {
        ticker: "AAPL",
        expirations: ["2026-04-18"],
        nearestExpiry: {
          date: "2026-04-18",
          calls: [],
          puts: [],
        },
      },
      currentPrice: 200,
      signalHierarchy: {
        currentPrice: 200,
        volumeProfile: {
          vpoc: 200,
          valueAreaHigh: 202,
          valueAreaLow: 198,
          buckets: [],
          hvn: [],
          lvn: [],
          totalVolume: 1000,
        },
        algoSR: [],
        ivSkew: {
          putCallSkew: 0.01,
          avgPutIV: 0.3,
          avgCallIV: 0.29,
          interpretation: "Neutral skew",
        },
        oiSummary: {
          totalCallOI: 100,
          totalPutOI: 80,
          pcOIRatio: 0.8,
          topStrikes: [],
        },
      },
      triggerReport: {
        ticker: "AAPL",
        computedAt: "2026-04-17T00:00:00.000Z",
        primaryTrigger: null,
        secondaryTriggers: [],
        activeLevels: [],
        swingStructure: {
          swings: [],
          structure: "consolidation",
          structureShift: null,
          lastHigherLow: null,
          lastLowerHigh: null,
        },
        overallAssessment: "no_trigger",
      },
    });

    expect(deepDive.ticker).toBe("AAPL");
    expect(triggerReport?.ticker).toBe("AAPL");
    expect(volumeProfileSpy).not.toHaveBeenCalled();
    expect(algoSRSpy).not.toHaveBeenCalled();
    expect(ivSkewSpy).not.toHaveBeenCalled();
    expect(oiSummarySpy).not.toHaveBeenCalled();
    expect(triggerReportSpy).not.toHaveBeenCalled();
  });
});

// ============================================================
// Story 25.5b — extractJson resilience
// ============================================================

describe("extractJson — response parsing resilience", () => {
  it("handles JSON inside markdown code fences", async () => {
    const fenced =
      "Here is the analysis:\n```json\n" +
      JSON.stringify(VALID_CLASSIFICATION_RESPONSE) +
      "\n```\nDone.";
    mockLLMResponseRaw(fenced, 800);

    const result = await classifyNews(SAMPLE_ARTICLES);
    expect(result.articles).toHaveLength(1);
  });

  it("extracts JSON object from prose wrapper", async () => {
    const prose =
      "Based on my analysis, here is the result: " +
      JSON.stringify(VALID_CLASSIFICATION_RESPONSE) +
      " That concludes my review.";
    mockLLMResponseRaw(prose, 800);

    const result = await classifyNews(SAMPLE_ARTICLES);
    expect(result.articles).toHaveLength(1);
  });

  it("handles response with leading whitespace/newlines", async () => {
    const padded = "\n\n  " + JSON.stringify(VALID_CLASSIFICATION_RESPONSE);
    mockLLMResponseRaw(padded, 800);

    const result = await classifyNews(SAMPLE_ARTICLES);
    expect(result.articles).toHaveLength(1);
  });
});

// ============================================================
// Story 25.5c — Schema validation (Zod parse) for all 5 schemas
// ============================================================

describe("Zod schema validation — newsClassificationSchema", () => {
  it("accepts valid classification response", () => {
    expect(() =>
      newsClassificationSchema.parse(VALID_CLASSIFICATION_RESPONSE),
    ).not.toThrow();
  });

  it("rejects missing required field (articles)", () => {
    const { articles, ...rest } = VALID_CLASSIFICATION_RESPONSE;
    void articles;
    expect(() => newsClassificationSchema.parse(rest)).toThrow();
  });

  it("rejects invalid enum for market_sentiment", () => {
    const bad = structuredClone(VALID_CLASSIFICATION_RESPONSE);
    bad.articles[0].market_sentiment = "very_bullish" as "bullish";
    expect(() => newsClassificationSchema.parse(bad)).toThrow();
  });

  it("rejects impact_score outside range", () => {
    const bad = structuredClone(VALID_CLASSIFICATION_RESPONSE);
    bad.articles[0].impact_score = 15;
    expect(() => newsClassificationSchema.parse(bad)).toThrow();
  });
});

describe("Zod schema validation — crossReferenceAnalysisSchema", () => {
  it("accepts valid cross-reference response", () => {
    expect(() =>
      crossReferenceAnalysisSchema.parse(VALID_CROSS_REFERENCE_RESPONSE),
    ).not.toThrow();
  });

  it("accepts empty correlations array", () => {
    const empty = {
      ...VALID_CROSS_REFERENCE_RESPONSE,
      correlations: [],
      analysis_metadata: {
        ...VALID_CROSS_REFERENCE_RESPONSE.analysis_metadata,
        correlations_found: 0,
      },
    };
    expect(() => crossReferenceAnalysisSchema.parse(empty)).not.toThrow();
  });

  it("rejects correlation_confidence > 1", () => {
    const bad = structuredClone(VALID_CROSS_REFERENCE_RESPONSE);
    bad.correlations[0].correlation_confidence = 1.5;
    expect(() => crossReferenceAnalysisSchema.parse(bad)).toThrow();
  });

  it("rejects invalid alignment enum", () => {
    const bad = structuredClone(VALID_CROSS_REFERENCE_RESPONSE);
    (bad.correlations[0] as Record<string, unknown>).alignment = "aggressive";
    expect(() => crossReferenceAnalysisSchema.parse(bad)).toThrow();
  });
});

describe("Zod schema validation — tradeRecommendationSchema", () => {
  it("accepts valid recommendation response", () => {
    expect(() =>
      tradeRecommendationSchema.parse(VALID_RECOMMENDATION_RESPONSE),
    ).not.toThrow();
  });

  it("rejects missing primary_strategy", () => {
    const { primary_strategy, ...rest } = VALID_RECOMMENDATION_RESPONSE;
    void primary_strategy;
    expect(() => tradeRecommendationSchema.parse(rest)).toThrow();
  });

  it("rejects invalid direction enum", () => {
    const bad = { ...VALID_RECOMMENDATION_RESPONSE, direction: "sideways" };
    expect(() => tradeRecommendationSchema.parse(bad)).toThrow();
  });

  it("accepts nullable catalyst_date", () => {
    type NullableCatalystRecommendation = Omit<
      typeof VALID_RECOMMENDATION_RESPONSE,
      "market_context"
    > & {
      market_context: Omit<
        typeof VALID_RECOMMENDATION_RESPONSE.market_context,
        "catalyst_date" | "days_to_catalyst"
      > & {
        catalyst_date: string | null;
        days_to_catalyst: number | null;
      };
    };
    const nullCatalyst = structuredClone(
      VALID_RECOMMENDATION_RESPONSE,
    ) as NullableCatalystRecommendation;
    nullCatalyst.market_context.catalyst_date = null;
    nullCatalyst.market_context.days_to_catalyst = null;
    expect(() => tradeRecommendationSchema.parse(nullCatalyst)).not.toThrow();
  });
});

describe("Zod schema validation — deepDiveAnalysisSchema", () => {
  it("accepts valid deep dive response", () => {
    expect(() =>
      deepDiveAnalysisSchema.parse(VALID_DEEP_DIVE_RESPONSE),
    ).not.toThrow();
  });

  it("accepts optional nullable fields as null", () => {
    type NullableDeepDiveResponse = Omit<
      typeof VALID_DEEP_DIVE_RESPONSE,
      "technical_patterns" | "options_context"
    > & {
      technical_patterns: Array<
        Omit<
          (typeof VALID_DEEP_DIVE_RESPONSE.technical_patterns)[number],
          "price_target"
        > & { price_target: number | null }
      >;
      options_context: Omit<
        typeof VALID_DEEP_DIVE_RESPONSE.options_context,
        "max_pain" | "oi_walls" | "gex_summary" | "iv_rv_spread"
      > & {
        max_pain: number | null;
        oi_walls: null;
        gex_summary: null;
        iv_rv_spread: null;
      };
    };
    const withNulls = structuredClone(
      VALID_DEEP_DIVE_RESPONSE,
    ) as NullableDeepDiveResponse;
    withNulls.technical_patterns[0].price_target = null;
    withNulls.options_context.max_pain = null;
    withNulls.options_context.oi_walls = null;
    withNulls.options_context.gex_summary = null;
    withNulls.options_context.iv_rv_spread = null;
    expect(() => deepDiveAnalysisSchema.parse(withNulls)).not.toThrow();
  });

  it("accepts optional nullable fields as undefined (omitted)", () => {
    const withoutOptional = structuredClone(VALID_DEEP_DIVE_RESPONSE);
    delete (withoutOptional.technical_patterns[0] as Record<string, unknown>)
      .price_target;
    delete (withoutOptional.options_context as Record<string, unknown>)
      .max_pain;
    delete (withoutOptional.options_context as Record<string, unknown>)
      .greeks_breakdown;
    expect(() => deepDiveAnalysisSchema.parse(withoutOptional)).not.toThrow();
  });

  it("rejects invalid overall_risk enum", () => {
    const bad = structuredClone(VALID_DEEP_DIVE_RESPONSE);
    (bad.risk_assessment as Record<string, unknown>).overall_risk = "extreme";
    expect(() => deepDiveAnalysisSchema.parse(bad)).toThrow();
  });
});

// ============================================================
// Story 25.5d — crossReferenceAnalysis behavior
// ============================================================

describe("crossReferenceAnalysis", () => {
  it("returns empty result for empty news", async () => {
    const result = await crossReferenceAnalysis(
      [],
      [
        {
          ticker: "AAPL",
          strike: 200,
          expiry: "2026-04-18",
          callPut: "C",
          premium: 500000,
          volume: 5000,
          openInterest: 10000,
          sentiment: "bullish",
        },
      ],
    );
    expect(result.correlations).toHaveLength(0);
    expect(result.summary).toContain("Insufficient");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns empty result for empty whales", async () => {
    const result = await crossReferenceAnalysis(
      [
        {
          headline: "Test",
          impact_score: 5,
          sentiment: "bullish",
          event_type: "earnings",
          affected_sectors: [],
          affected_tickers: [],
        },
      ],
      [],
    );
    expect(result.correlations).toHaveLength(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("calls LLM and returns parsed result", async () => {
    mockLLMResponse(VALID_CROSS_REFERENCE_RESPONSE, 600);

    const result = await crossReferenceAnalysis(
      [
        {
          headline: "Fed raises rates",
          impact_score: 8,
          sentiment: "bearish",
          event_type: "central_bank",
          affected_sectors: ["Financials"],
          affected_tickers: ["SPY"],
        },
      ],
      [
        {
          ticker: "AAPL",
          strike: 200,
          expiry: "2026-04-18",
          callPut: "C",
          premium: 500000,
          volume: 5000,
          openInterest: 10000,
          sentiment: "bullish",
        },
      ],
    );

    expect(result.correlations).toHaveLength(1);
    expect(result.correlations[0].whale_trade.ticker).toBe("AAPL");
    expect(result.summary).toBeTruthy();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// Story 25.5e — generateRecommendation behavior
// ============================================================

describe("generateRecommendation", () => {
  const mockCorrelation = VALID_CROSS_REFERENCE_RESPONSE
    .correlations[0] as Correlation;
  const mockMarketData = {
    price: 195,
    ivRank: 72,
    avgVolume: 50000000,
    todayVolume: 75000000,
    optionsChainSummary: "ATM IV: 35%, P/C ratio: 0.85",
  };

  it("calls LLM and returns parsed recommendation", async () => {
    mockLLMResponse(VALID_RECOMMENDATION_RESPONSE, 1200);

    const result = await generateRecommendation(
      mockCorrelation,
      mockMarketData,
    );
    expect(result.ticker).toBe("AAPL");
    expect(result.direction).toBe("bullish");
    expect(result.primary_strategy.legs).toHaveLength(2);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("includes indicator signal context when provided", async () => {
    mockLLMResponse(VALID_RECOMMENDATION_RESPONSE, 1200);

    await generateRecommendation(mockCorrelation, {
      ...mockMarketData,
      indicatorReport: {
        ticker: "AAPL",
        timeframe: "3M",
        patterns: [
          {
            indicator: "ema",
            name: "EMA 9 / EMA 21 Golden Cross",
            patternId: "ema_golden_cross",
            signal: "bullish",
            confidence: 0.82,
            detectedAt: 28,
            detectedDate: "2026-01-29T00:00:00.000Z",
            description: "Fast EMA crossed above slow EMA",
            isRecent: true,
          },
        ],
        combinations: [
          {
            name: "EMA Cross + Volume Breakout",
            patternId: "ema_cross_volume_breakout_bullish",
            signal: "bullish",
            confidence: 0.88,
            description: "Volume confirmed the crossover",
            constituentPatternIds: [
              "ema_golden_cross",
              "volume_breakout_bullish",
            ],
            educationalNote: "Trend change confirmed by participation.",
          },
        ],
        aggregateSignal: {
          direction: "bullish",
          strength: 0.84,
          summary:
            "1 bullish / 0 bearish / 0 neutral — bullish bias (84% strength)",
        },
        computedAt: "2026-04-06T10:00:00.000Z",
      },
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const userPrompt = callArgs.messages[1].content;
    expect(userPrompt).toContain("Technical Indicator Signals");
    expect(userPrompt).toContain("EMA 9 / EMA 21 Golden Cross");
    expect(userPrompt).toContain("EMA Cross + Volume Breakout");
  });
});

// ============================================================
// Story 25.5f — generateDeepDive behavior
// ============================================================

describe("generateDeepDive", () => {
  const mockInput = {
    ticker: "AAPL",
    whaleTrade: {
      ticker: "AAPL",
      strike: 200,
      expiry: "2026-04-18",
      callPut: "C",
      premium: 500000,
    },
    historicalData: [
      {
        time: "2026-03-28",
        open: 193,
        high: 196,
        low: 192,
        close: 195,
        volume: 50000000,
      },
      {
        time: "2026-03-31",
        open: 195,
        high: 197,
        low: 194,
        close: 196,
        volume: 55000000,
      },
    ],
    optionsChain: null,
    currentPrice: 196,
  };

  it("calls LLM and returns parsed deep dive", async () => {
    mockLLMResponse(VALID_DEEP_DIVE_RESPONSE, 3000);

    const { deepDive: result } = await generateDeepDive(mockInput);
    expect(result.ticker).toBe("AAPL");
    expect(result.technical_patterns).toHaveLength(1);
    expect(result.support_resistance).toHaveLength(2);
    expect(result.indicators).toHaveLength(2);
    expect(result.risk_assessment.overall_risk).toBe("moderate");
    expect(result.timeframe_patterns?.["3M"]).toHaveLength(1);
    expect(result.technical_patterns[0].timeframe).toBe("3M");
  });

  it("includes computed indicator analysis when provided", async () => {
    mockLLMResponse(VALID_DEEP_DIVE_RESPONSE, 3000);

    await generateDeepDive({
      ...mockInput,
      computedIndicators: {
        "3M": {
          ticker: "AAPL",
          timeframe: "3M",
          patterns: [
            {
              indicator: "rsi",
              name: "RSI Oversold",
              patternId: "rsi_oversold",
              signal: "bullish",
              confidence: 0.76,
              detectedAt: 14,
              detectedDate: "2026-03-28T00:00:00.000Z",
              description: "RSI fell below 30",
              isRecent: true,
            },
          ],
          combinations: [
            {
              name: "RSI Divergence + Lower Band Touch",
              patternId: "rsi_divergence_bb_touch_bullish",
              signal: "bullish",
              confidence: 0.88,
              description: "Momentum and volatility converged",
              constituentPatternIds: [
                "rsi_oversold",
                "bb_mean_reversion_bullish",
              ],
              educationalNote:
                "Oversold momentum and lower-band touch can support a bounce.",
            },
          ],
          aggregateSignal: {
            direction: "bullish",
            strength: 0.81,
            summary:
              "1 bullish / 0 bearish / 0 neutral — bullish bias (81% strength)",
          },
          computedAt: "2026-04-06T10:00:00.000Z",
        },
      },
    });

    const callArgs = mockCreate.mock.calls[0][0];
    const userPrompt = callArgs.messages[1].content;
    expect(userPrompt).toContain("Pre-Computed Technical Indicator Analysis");
    expect(userPrompt).toContain("RSI Oversold");
    expect(userPrompt).toContain("RSI Divergence + Lower Band Touch");
  });

  it("normalizes support/resistance strength labels when the model drifts off enum", async () => {
    mockLLMResponse(
      {
        ...VALID_DEEP_DIVE_RESPONSE,
        support_resistance: [
          ...VALID_DEEP_DIVE_RESPONSE.support_resistance,
          {
            level: 205,
            type: "resistance",
            strength: "major",
            note: "Repeated rejection near prior breakout area",
          },
        ],
      },
      3000,
    );

    const { deepDive: result } = await generateDeepDive(mockInput);

    expect(result.support_resistance[2].strength).toBe("strong");
  });

  it("normalizes timeframe-specific deep dive patterns into the aggregate field", async () => {
    mockLLMResponse(
      {
        ...VALID_DEEP_DIVE_RESPONSE,
        technical_patterns: [],
        timeframe_patterns: {
          "1W": [
            {
              ...VALID_DEEP_DIVE_RESPONSE.technical_patterns[0],
              name: "V-Shape Recovery",
              timeframe: "1W",
            },
          ],
          "1M": [
            {
              ...VALID_DEEP_DIVE_RESPONSE.technical_patterns[0],
              name: "Descending Channel",
              timeframe: "1M",
            },
          ],
          "3M": [],
          "6M": [],
          "1Y": [],
        },
      },
      3200,
    );

    const { deepDive: result } = await generateDeepDive({
      ...mockInput,
      historicalDataByTimeframe: {
        "1W": mockInput.historicalData,
        "1M": mockInput.historicalData,
        "3M": mockInput.historicalData,
        "6M": mockInput.historicalData,
        "1Y": mockInput.historicalData,
      },
    });

    expect(result.timeframe_patterns?.["1W"]).toHaveLength(1);
    expect(result.timeframe_patterns?.["1M"]).toHaveLength(1);
    expect(result.technical_patterns.map((pattern) => pattern.name)).toEqual(
      expect.arrayContaining(["V-Shape Recovery", "Descending Channel"]),
    );
  });

  it("backfills 6M and 1Y patterns when the model omits broad-horizon structures", async () => {
    mockLLMResponse(
      {
        ...VALID_DEEP_DIVE_RESPONSE,
        technical_patterns: [],
        timeframe_patterns: {
          "1W": [
            {
              ...VALID_DEEP_DIVE_RESPONSE.technical_patterns[0],
              name: "Weekly Recovery",
              timeframe: "1W",
            },
          ],
          "1M": [
            {
              ...VALID_DEEP_DIVE_RESPONSE.technical_patterns[0],
              name: "Monthly Base",
              timeframe: "1M",
            },
          ],
          "3M": [
            {
              ...VALID_DEEP_DIVE_RESPONSE.technical_patterns[0],
              name: "Quarterly Breakout",
              timeframe: "3M",
            },
          ],
          "6M": [],
          "1Y": [],
        },
      },
      3200,
    );

    const longRangeCandles = [
      {
        time: "2025-05-01",
        open: 160,
        high: 164,
        low: 156,
        close: 162,
        volume: 1000000,
      },
      {
        time: "2025-07-01",
        open: 168,
        high: 173,
        low: 166,
        close: 171,
        volume: 1100000,
      },
      {
        time: "2025-09-01",
        open: 176,
        high: 181,
        low: 174,
        close: 179,
        volume: 1050000,
      },
      {
        time: "2025-11-03",
        open: 182,
        high: 188,
        low: 180,
        close: 186,
        volume: 1200000,
      },
      {
        time: "2026-01-05",
        open: 188,
        high: 193,
        low: 184,
        close: 191,
        volume: 1150000,
      },
      {
        time: "2026-03-31",
        open: 194,
        high: 198,
        low: 191,
        close: 196,
        volume: 1300000,
      },
    ];

    const { deepDive: result } = await generateDeepDive({
      ...mockInput,
      historicalDataByTimeframe: {
        "1W": mockInput.historicalData,
        "1M": mockInput.historicalData,
        "3M": mockInput.historicalData,
        "6M": longRangeCandles,
        "1Y": longRangeCandles,
      },
    });

    expect(result.timeframe_patterns?.["6M"]).toHaveLength(1);
    expect(result.timeframe_patterns?.["1Y"]).toHaveLength(1);
    expect(result.timeframe_patterns?.["6M"]?.[0].timeframe).toBe("6M");
    expect(result.timeframe_patterns?.["1Y"]?.[0].timeframe).toBe("1Y");
    expect(
      result.technical_patterns.map((pattern) => pattern.timeframe),
    ).toEqual(expect.arrayContaining(["6M", "1Y"]));
  });
});

// ============================================================
// Story 25.5h — Token usage tracking
// ============================================================

describe("getTokenUsageStats", () => {
  it("tracks token usage across calls", async () => {
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 800);
    await classifyNews(SAMPLE_ARTICLES);

    const stats = getTokenUsageStats();
    expect(stats.recentCalls.length).toBeGreaterThanOrEqual(1);

    const lastCall = stats.recentCalls[stats.recentCalls.length - 1];
    expect(lastCall.callType).toBe("classifyNews");
    expect(lastCall.outputTokens).toBe(800);
  });

  it("aggregates stats by call type", async () => {
    // Two classification calls
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 600);
    await classifyNews(SAMPLE_ARTICLES);
    mockLLMResponse(VALID_CLASSIFICATION_RESPONSE, 800);
    await classifyNews(SAMPLE_ARTICLES);

    const stats = getTokenUsageStats();
    const classifyStats = stats.byCallType["classifyNews"];
    expect(classifyStats).toBeDefined();
    expect(classifyStats.count).toBeGreaterThanOrEqual(2);
  });
});
