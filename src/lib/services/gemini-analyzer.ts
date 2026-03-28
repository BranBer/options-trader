import { GoogleGenerativeAI } from "@google/generative-ai";
import type { RawNewsArticle } from "@/types/news";
import {
  type NewsClassification,
  newsClassificationSchema,
} from "@/types/news";
import {
  type CrossReferenceAnalysis,
  crossReferenceAnalysisSchema,
} from "@/types/analysis";
import {
  type TradeRecommendation,
  tradeRecommendationSchema,
} from "@/types/analysis";
import {
  type DeepDiveAnalysis,
  deepDiveAnalysisSchema,
} from "@/types/analysis";
import type { Correlation } from "@/types/analysis";
import {
  NEWS_CLASSIFIER_SYSTEM_INSTRUCTION,
  NEWS_CLASSIFIER_RESPONSE_SCHEMA,
  buildNewsClassifierPrompt,
} from "@/lib/prompts/news-classifier";
import {
  CROSS_REFERENCE_SYSTEM_INSTRUCTION,
  CROSS_REFERENCE_RESPONSE_SCHEMA,
  buildCrossReferencePrompt,
} from "@/lib/prompts/cross-reference";
import {
  TRADE_ANALYZER_SYSTEM_INSTRUCTION,
  TRADE_ANALYZER_RESPONSE_SCHEMA,
  buildTradeAnalyzerPrompt,
} from "@/lib/prompts/trade-analyzer";
import {
  DEEP_DIVE_SYSTEM_INSTRUCTION,
  DEEP_DIVE_RESPONSE_SCHEMA,
  buildDeepDivePrompt,
} from "@/lib/prompts/deep-dive-analyzer";
import type { CandleData, OptionsChainSummary } from "@/types/market";

// --- Gemini Client Singleton ---

let genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

// --- Generic retry helper ---

async function callGeminiWithRetry<T>(
  modelName: string,
  systemInstruction: string,
  userPrompt: string,
  responseSchema: object,
  zodSchema: { parse: (data: unknown) => T },
  options: {
    temperature?: number;
    maxOutputTokens?: number;
    maxRetries?: number;
  } = {},
): Promise<T> {
  const { temperature = 0.1, maxOutputTokens = 8192, maxRetries = 3 } = options;
  const ai = getGenAI();
  const model = ai.getGenerativeModel({
    model: modelName,
    systemInstruction: systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema as never,
      temperature,
      maxOutputTokens,
    },
  });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await model.generateContent(userPrompt);
      const text = result.response.text();
      const parsed = JSON.parse(text);
      return zodSchema.parse(parsed);
    } catch (error) {
      console.error(
        `[Gemini] Attempt ${attempt + 1}/${maxRetries} failed:`,
        error instanceof Error ? error.message : error,
      );
      if (attempt === maxRetries - 1) throw error;
      // Exponential backoff: 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw new Error("Gemini call failed after retries");
}

// ============================================================
// Story 1.4 — News Classifier
// ============================================================

const MAX_ARTICLES_PER_BATCH = 20;

const CLASSIFY_CONCURRENCY = 2;

export async function classifyNews(
  articles: RawNewsArticle[],
  onBatchProgress?: (done: number, total: number) => void,
): Promise<NewsClassification> {
  if (articles.length === 0) {
    return {
      articles: [],
      processing_metadata: {
        total_input: 0,
        total_relevant: 0,
        total_discarded: 0,
        processing_timestamp: new Date().toISOString(),
      },
    };
  }

  // Batch articles to stay within token limits
  const batches: RawNewsArticle[][] = [];
  for (let i = 0; i < articles.length; i += MAX_ARTICLES_PER_BATCH) {
    batches.push(articles.slice(i, i + MAX_ARTICLES_PER_BATCH));
  }

  console.log(
    `[Gemini] Classifying ${articles.length} articles in ${batches.length} batch(es), concurrency=${CLASSIFY_CONCURRENCY}`,
  );

  const allClassified: NewsClassification["articles"] = [];
  let totalInput = 0;
  let batchesDone = 0;

  // Process batches with limited concurrency
  for (let i = 0; i < batches.length; i += CLASSIFY_CONCURRENCY) {
    const chunk = batches.slice(i, i + CLASSIFY_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map((batch) => {
        const prompt = buildNewsClassifierPrompt(batch);
        return callGeminiWithRetry(
          "gemini-3-flash-preview",
          NEWS_CLASSIFIER_SYSTEM_INSTRUCTION,
          prompt,
          NEWS_CLASSIFIER_RESPONSE_SCHEMA,
          newsClassificationSchema,
          { temperature: 0.1, maxOutputTokens: 8192 },
        );
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allClassified.push(...result.value.articles);
        totalInput += result.value.processing_metadata.total_input;
      } else {
        console.error("[Gemini] Batch classification failed:", result.reason);
      }
    }

    batchesDone += chunk.length;
    onBatchProgress?.(batchesDone, batches.length);
    console.log(
      `[Gemini] Classification progress: ${batchesDone}/${batches.length} batches`,
    );
  }

  // Filter: only keep articles with impact_score >= 3
  const relevant = allClassified.filter(
    (a) => a.is_market_relevant && a.impact_score >= 3,
  );

  console.log(
    `[Gemini] Classification complete: ${totalInput} input, ${relevant.length} relevant (impact >= 3)`,
  );

  return {
    articles: relevant,
    processing_metadata: {
      total_input: totalInput,
      total_relevant: relevant.length,
      total_discarded: totalInput - relevant.length,
      processing_timestamp: new Date().toISOString(),
    },
  };
}

// ============================================================
// Story 3.1 — Cross-Reference Correlator
// ============================================================

interface NewsEventForCorrelation {
  headline: string;
  impact_score: number;
  sentiment: string;
  event_type: string;
  affected_sectors: string[];
  affected_tickers: string[];
}

interface WhaleAlertForCorrelation {
  ticker: string;
  strike: number;
  expiry: string;
  callPut: string;
  premium: number;
  volume: number;
  openInterest: number;
  sentiment: string;
}

export async function crossReferenceAnalysis(
  newsEvents: NewsEventForCorrelation[],
  whaleAlerts: WhaleAlertForCorrelation[],
): Promise<CrossReferenceAnalysis> {
  if (newsEvents.length === 0 || whaleAlerts.length === 0) {
    console.log("[Gemini] Skipping cross-reference: insufficient data");
    return {
      correlations: [],
      uncorrelated_whales: [],
      summary: "Insufficient data for cross-reference analysis.",
      analysis_metadata: {
        news_events_analyzed: newsEvents.length,
        whale_trades_analyzed: whaleAlerts.length,
        correlations_found: 0,
        timestamp: new Date().toISOString(),
      },
    };
  }

  console.log(
    `[Gemini] Cross-referencing ${newsEvents.length} news events with ${whaleAlerts.length} whale alerts`,
  );

  const prompt = buildCrossReferencePrompt(
    JSON.stringify(newsEvents, null, 2),
    JSON.stringify(whaleAlerts, null, 2),
  );

  const result = await callGeminiWithRetry(
    "gemini-3-flash-preview",
    CROSS_REFERENCE_SYSTEM_INSTRUCTION,
    prompt,
    CROSS_REFERENCE_RESPONSE_SCHEMA,
    crossReferenceAnalysisSchema,
    { temperature: 0.2, maxOutputTokens: 8192 },
  );

  console.log(
    `[Gemini] Cross-reference complete: ${result.correlations.length} correlations found`,
  );

  return result;
}

// ============================================================
// Story 3.2 — Trade Recommendation Generator
// ============================================================

interface MarketDataForRecommendation {
  price: number;
  ivRank?: number;
  avgVolume: number;
  todayVolume: number;
  optionsChainSummary: string;
  macroContext?: {
    vixLevel?: number | null;
    vixRegime?: string;
    earningsDate?: string | null;
    ivCrushRisk?: string;
    fomcNextDate?: string;
    fomcIsDecisionWeek?: boolean;
  };
}

export async function generateRecommendation(
  correlation: Correlation,
  marketData: MarketDataForRecommendation,
): Promise<TradeRecommendation> {
  const ticker = correlation.whale_trade.ticker;

  console.log(`[Gemini] Generating recommendation for ${ticker}`);

  const prompt = buildTradeAnalyzerPrompt(
    JSON.stringify(correlation, null, 2),
    ticker,
    marketData.price,
    marketData.ivRank,
    marketData.avgVolume,
    marketData.todayVolume,
    marketData.optionsChainSummary,
    marketData.macroContext,
  );

  const result = await callGeminiWithRetry(
    "gemini-3-flash-preview",
    TRADE_ANALYZER_SYSTEM_INSTRUCTION,
    prompt,
    TRADE_ANALYZER_RESPONSE_SCHEMA,
    tradeRecommendationSchema,
    { temperature: 0.3, maxOutputTokens: 4096 },
  );

  console.log(
    `[Gemini] Recommendation for ${ticker}: ${result.direction} (confidence: ${result.confidence})`,
  );

  return result;
}

// ============================================================
// Story 5.1 — Deep Dive Analysis Generator
// ============================================================

interface DeepDiveInput {
  ticker: string;
  whaleTrade: {
    ticker: string;
    strike?: number;
    expiry?: string;
    callPut?: string;
    premium?: number;
    volume?: number;
    openInterest?: number;
    sentiment?: string;
  };
  historicalData: CandleData[];
  optionsChain: OptionsChainSummary | null;
  currentPrice: number;
  correlatedEvent?: {
    headline: string;
    impact_score: number;
    event_type: string;
  };
  newsContext?: Array<{ headline: string; sentiment: string }>;
  macroContext?: {
    vixLevel?: number | null;
    vixRegime?: string;
    earningsDate?: string | null;
    ivCrushRisk?: string;
    fomcNextDate?: string;
    fomcIsDecisionWeek?: boolean;
  };
}

export async function generateDeepDive(
  input: DeepDiveInput,
): Promise<DeepDiveAnalysis> {
  const { ticker } = input;
  console.log(`[Gemini] Generating deep dive for ${ticker}`);

  // Build historical summary (last N candles as compact table)
  const recentCandles = input.historicalData.slice(-60);
  const historicalSummary =
    recentCandles.length > 0
      ? `Date | Open | High | Low | Close | Volume\n` +
        recentCandles
          .map(
            (c) =>
              `${c.time} | ${c.open.toFixed(2)} | ${c.high.toFixed(2)} | ${c.low.toFixed(2)} | ${c.close.toFixed(2)} | ${c.volume}`,
          )
          .join("\n")
      : "No historical data available.";

  // Build options chain summary
  let chainSummary = "No options chain data available.";
  if (input.optionsChain) {
    const chain = input.optionsChain;
    const allCalls = chain.nearestExpiry.calls;
    const allPuts = chain.nearestExpiry.puts;
    const totalCallVol = allCalls.reduce((s, c) => s + c.volume, 0);
    const totalPutVol = allPuts.reduce((s, c) => s + c.volume, 0);
    const totalCallOI = allCalls.reduce((s, c) => s + c.openInterest, 0);
    const totalPutOI = allPuts.reduce((s, c) => s + c.openInterest, 0);
    const pcRatio =
      totalCallVol > 0 ? (totalPutVol / totalCallVol).toFixed(2) : "N/A";

    // ATM options (within 5% of price)
    const atmCalls = allCalls.filter(
      (c) =>
        Math.abs(c.strike - input.currentPrice) / input.currentPrice < 0.05,
    );
    const atmPuts = allPuts.filter(
      (c) =>
        Math.abs(c.strike - input.currentPrice) / input.currentPrice < 0.05,
    );
    const avgIV = [...atmCalls, ...atmPuts]
      .filter((c) => c.iv > 0)
      .reduce((s, c, _, a) => s + c.iv / a.length, 0);

    chainSummary = `Nearest expiry: ${chain.nearestExpiry.date}
Expirations available: ${chain.expirations.length}
Total call volume: ${totalCallVol} | Total put volume: ${totalPutVol}
Put/Call ratio: ${pcRatio}
Total call OI: ${totalCallOI} | Total put OI: ${totalPutOI}
ATM avg IV: ${(avgIV * 100).toFixed(1)}%
ATM calls: ${atmCalls.map((c) => `$${c.strike} (bid:${c.bid} ask:${c.ask} vol:${c.volume} OI:${c.openInterest} IV:${(c.iv * 100).toFixed(1)}%)`).join(", ") || "none"}
ATM puts: ${atmPuts.map((c) => `$${c.strike} (bid:${c.bid} ask:${c.ask} vol:${c.volume} OI:${c.openInterest} IV:${(c.iv * 100).toFixed(1)}%)`).join(", ") || "none"}`;
  }

  const prompt = buildDeepDivePrompt({
    ticker,
    whaleTradeJson: JSON.stringify(input.whaleTrade, null, 2),
    historicalDataSummary: historicalSummary,
    optionsChainSummary: chainSummary,
    currentPrice: input.currentPrice,
    correlatedEventJson: input.correlatedEvent
      ? JSON.stringify(input.correlatedEvent, null, 2)
      : undefined,
    newsContextJson: input.newsContext
      ? JSON.stringify(input.newsContext, null, 2)
      : undefined,
    macroContext: input.macroContext,
  });

  const result = await callGeminiWithRetry(
    "gemini-3-flash-preview",
    DEEP_DIVE_SYSTEM_INSTRUCTION,
    prompt,
    DEEP_DIVE_RESPONSE_SCHEMA,
    deepDiveAnalysisSchema,
    { temperature: 0.25, maxOutputTokens: 8192 },
  );

  console.log(
    `[Gemini] Deep dive for ${ticker}: risk=${result.risk_assessment.overall_risk}, ` +
      `patterns=${result.technical_patterns.length}, S/R=${result.support_resistance.length}`,
  );

  return result;
}
