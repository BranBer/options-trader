import { GoogleGenerativeAI } from "@google/generative-ai";
import type { RawNewsArticle } from "@/types/news";
import { type NewsClassification, newsClassificationSchema } from "@/types/news";
import { type CrossReferenceAnalysis, crossReferenceAnalysisSchema } from "@/types/analysis";
import { type TradeRecommendation, tradeRecommendationSchema } from "@/types/analysis";
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
  options: { temperature?: number; maxOutputTokens?: number; maxRetries?: number } = {}
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
        error instanceof Error ? error.message : error
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

export async function classifyNews(
  articles: RawNewsArticle[]
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
    `[Gemini] Classifying ${articles.length} articles in ${batches.length} batch(es)`
  );

  const allClassified: NewsClassification["articles"] = [];
  let totalInput = 0;
  let totalRelevant = 0;
  let totalDiscarded = 0;

  for (const batch of batches) {
    const prompt = buildNewsClassifierPrompt(batch);
    const result = await callGeminiWithRetry(
      "gemini-1.5-flash",
      NEWS_CLASSIFIER_SYSTEM_INSTRUCTION,
      prompt,
      NEWS_CLASSIFIER_RESPONSE_SCHEMA,
      newsClassificationSchema,
      { temperature: 0.1, maxOutputTokens: 8192 }
    );

    allClassified.push(...result.articles);
    totalInput += result.processing_metadata.total_input;
    totalRelevant += result.processing_metadata.total_relevant;
    totalDiscarded += result.processing_metadata.total_discarded;
  }

  // Filter: only keep articles with impact_score >= 3
  const relevant = allClassified.filter(
    (a) => a.is_market_relevant && a.impact_score >= 3
  );

  console.log(
    `[Gemini] Classification complete: ${totalInput} input, ${relevant.length} relevant (impact >= 3)`
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
  whaleAlerts: WhaleAlertForCorrelation[]
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
    `[Gemini] Cross-referencing ${newsEvents.length} news events with ${whaleAlerts.length} whale alerts`
  );

  const prompt = buildCrossReferencePrompt(
    JSON.stringify(newsEvents, null, 2),
    JSON.stringify(whaleAlerts, null, 2)
  );

  const result = await callGeminiWithRetry(
    "gemini-1.5-flash",
    CROSS_REFERENCE_SYSTEM_INSTRUCTION,
    prompt,
    CROSS_REFERENCE_RESPONSE_SCHEMA,
    crossReferenceAnalysisSchema,
    { temperature: 0.2, maxOutputTokens: 8192 }
  );

  console.log(
    `[Gemini] Cross-reference complete: ${result.correlations.length} correlations found`
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
}

export async function generateRecommendation(
  correlation: Correlation,
  marketData: MarketDataForRecommendation
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
    marketData.optionsChainSummary
  );

  const result = await callGeminiWithRetry(
    "gemini-1.5-flash",
    TRADE_ANALYZER_SYSTEM_INSTRUCTION,
    prompt,
    TRADE_ANALYZER_RESPONSE_SCHEMA,
    tradeRecommendationSchema,
    { temperature: 0.3, maxOutputTokens: 4096 }
  );

  console.log(
    `[Gemini] Recommendation for ${ticker}: ${result.direction} (confidence: ${result.confidence})`
  );

  return result;
}
