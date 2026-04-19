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
  type AnalysisTimeframe,
  type TechnicalPattern,
} from "@/types/analysis";
import {
  type NexusDriftAnalysis,
  nexusDriftAnalysisSchema,
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
} from "@/lib/prompts/trade-analyzer";
import {
  DEEP_DIVE_SYSTEM_INSTRUCTION,
  DEEP_DIVE_RESPONSE_SCHEMA,
} from "@/lib/prompts/deep-dive-analyzer";
import {
  NEXUS_DRIFT_SYSTEM_INSTRUCTION,
  NEXUS_DRIFT_RESPONSE_SCHEMA,
  buildNexusDriftPrompt,
} from "@/lib/prompts/cascade-drift-analyzer";
import type { TriggerReport } from "@/lib/utils/trigger-engine";
import type { CandleData } from "@/types/market";
import {
  callLlmWithRetry,
  getClassifyNewsModel,
  getTokenUsageStats,
  resetLlmClient,
} from "@/lib/services/llm-client";
import {
  buildRecommendationPromptContext,
  type RecommendationMarketData,
} from "@/lib/prompts/recommendation-context";
import {
  buildDeepDivePromptContext,
  createFallbackTimeframePattern,
  type DeepDiveInput,
} from "@/lib/prompts/deep-dive-context";

export interface ClassifyNewsConfig {
  systemInstruction?: string;
  responseSchema?: object;
  promptBuilder?: (articles: RawNewsArticle[]) => string;
  minImpact?: number;
}

// Backward-compatible test hook and token stats export.
export const _resetClient = resetLlmClient;
export { getTokenUsageStats };

// ============================================================
// Story 1.4 — News Classifier
// ============================================================

const MAX_ARTICLES_PER_BATCH = 20;

const DEFAULT_CLASSIFY_CONCURRENCY = 1;

function getClassifyConcurrency(): number {
  const raw = process.env.OPEN_ROUTER_NEWS_CONCURRENCY;
  const parsed = raw ? Number(raw) : DEFAULT_CLASSIFY_CONCURRENCY;
  if (!Number.isFinite(parsed)) return DEFAULT_CLASSIFY_CONCURRENCY;
  return Math.min(Math.max(Math.floor(parsed), 1), 3);
}

export async function classifyNews(
  articles: RawNewsArticle[],
  onBatchProgress?: (done: number, total: number) => void,
  config?: ClassifyNewsConfig,
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

  const concurrency = getClassifyConcurrency();
  const model = getClassifyNewsModel();
  const systemInstruction =
    config?.systemInstruction ?? NEWS_CLASSIFIER_SYSTEM_INSTRUCTION;
  const responseSchema =
    config?.responseSchema ?? NEWS_CLASSIFIER_RESPONSE_SCHEMA;
  const promptBuilder = config?.promptBuilder ?? buildNewsClassifierPrompt;
  const minImpact = config?.minImpact ?? 3;

  console.log(
    `[LLM] Classifying ${articles.length} articles in ${batches.length} batch(es), concurrency=${concurrency}, model=${model}`,
  );

  const allClassified: NewsClassification["articles"] = [];
  let totalInput = 0;
  let batchesDone = 0;

  // Normalise a raw LLM response before Zod validation to tolerate:
  //  - missing `processing_metadata` (truncated responses)
  //  - missing/invalid fields on individual articles (partial completion)
  const VALID_EVENT_TYPES = new Set([
    "geopolitical",
    "economic",
    "regulatory",
    "earnings",
    "supply_chain",
    "technology",
    "natural_disaster",
    "central_bank",
    "other",
    "ai_ml",
    "semiconductors",
    "cloud_saas",
    "cybersecurity",
    "fintech",
    "hardware",
    "open_source",
    "social_media",
    "regulatory_tech",
    "biotech_health_tech",
    "ev_cleantech",
    "other_tech",
  ]);

  function preprocessClassificationResponse(data: unknown): unknown {
    if (!data || typeof data !== "object") return data;
    const obj = data as Record<string, unknown>;

    // Repair articles array
    const rawArticles = Array.isArray(obj.articles) ? obj.articles : [];
    const articles = rawArticles.map((a: unknown) => {
      if (!a || typeof a !== "object") return a;
      const art = { ...(a as Record<string, unknown>) };
      if (!Array.isArray(art.affected_sectors)) art.affected_sectors = [];
      if (!Array.isArray(art.affected_tickers)) art.affected_tickers = [];
      if (!art.country_code || typeof art.country_code !== "string")
        art.country_code = "US";
      if (!art.region || typeof art.region !== "string") art.region = "Global";
      if (!art.one_line_summary || typeof art.one_line_summary !== "string")
        art.one_line_summary =
          typeof art.original_headline === "string"
            ? art.original_headline
            : "";
      if (!art.reasoning || typeof art.reasoning !== "string")
        art.reasoning = "";
      if (!art.event_type || !VALID_EVENT_TYPES.has(art.event_type as string))
        art.event_type = "other";
      return art;
    });

    // Repair missing processing_metadata
    const meta =
      obj.processing_metadata && typeof obj.processing_metadata === "object"
        ? obj.processing_metadata
        : {
            total_input: articles.length,
            total_relevant: articles.length,
            total_discarded: 0,
            processing_timestamp: new Date().toISOString(),
          };

    return { ...obj, articles, processing_metadata: meta };
  }

  // Process batches with limited concurrency
  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      chunk.map((batch) => {
        const prompt = promptBuilder(batch);
        return callLlmWithRetry(
          systemInstruction,
          prompt,
          responseSchema,
          newsClassificationSchema,
          {
            callType: "classifyNews",
            model,
            temperature: 0.1,
            maxOutputTokens: 16384,
            preprocessParsedJson: preprocessClassificationResponse,
          },
        );
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        allClassified.push(...result.value.articles);
        totalInput += result.value.processing_metadata.total_input;
      } else {
        console.error("[LLM] Batch classification failed:", result.reason);
      }
    }

    batchesDone += chunk.length;
    onBatchProgress?.(batchesDone, batches.length);
    console.log(
      `[LLM] Classification progress: ${batchesDone}/${batches.length} batches`,
    );
  }

  // Filter: only keep articles with impact_score >= 3
  const relevant = allClassified.filter(
    (a) => a.is_market_relevant && a.impact_score >= minImpact,
  );

  console.log(
    `[LLM] Classification complete: ${totalInput} input, ${relevant.length} relevant (impact >= ${minImpact})`,
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
  qualityScore?: number;
}

export async function crossReferenceAnalysis(
  newsEvents: NewsEventForCorrelation[],
  whaleAlerts: WhaleAlertForCorrelation[],
  insiderContextJson?: string,
  sectorRotationContext?: string,
): Promise<CrossReferenceAnalysis> {
  if (newsEvents.length === 0 || whaleAlerts.length === 0) {
    console.log("[LLM] Skipping cross-reference: insufficient data");
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
    `[LLM] Cross-referencing ${newsEvents.length} news events with ${whaleAlerts.length} whale alerts`,
  );

  const prompt = buildCrossReferencePrompt(
    JSON.stringify(newsEvents, null, 2),
    JSON.stringify(whaleAlerts, null, 2),
    insiderContextJson,
    sectorRotationContext,
  );

  const result = await callLlmWithRetry(
    CROSS_REFERENCE_SYSTEM_INSTRUCTION,
    prompt,
    CROSS_REFERENCE_RESPONSE_SCHEMA,
    crossReferenceAnalysisSchema,
    {
      callType: "crossReference",
      temperature: 0.2,
      maxOutputTokens: 16384,
    },
  );

  console.log(
    `[LLM] Cross-reference complete: ${result.correlations.length} correlations found`,
  );

  return result;
}

// ============================================================
// Story 3.2 — Trade Recommendation Generator
// ============================================================

export async function generateRecommendation(
  correlation: Correlation,
  marketData: RecommendationMarketData,
  options?: { signal?: AbortSignal },
): Promise<TradeRecommendation> {
  const ticker = correlation.whale_trade.ticker;

  console.log(`[LLM] Generating recommendation for ${ticker}`);

  const prompt = buildRecommendationPromptContext(correlation, marketData);

  const result = await callLlmWithRetry(
    TRADE_ANALYZER_SYSTEM_INSTRUCTION,
    prompt,
    TRADE_ANALYZER_RESPONSE_SCHEMA,
    tradeRecommendationSchema,
    {
      callType: "recommendation",
      temperature: 0.3,
      maxOutputTokens: 8192,
      signal: options?.signal,
    },
  );

  console.log(
    `[LLM] Recommendation for ${ticker}: ${result.direction} (confidence: ${result.confidence})`,
  );

  return result;
}

function normalizeDeepDivePatterns(
  result: DeepDiveAnalysis,
  historicalDataByTimeframe?: Partial<Record<AnalysisTimeframe, CandleData[]>>,
): DeepDiveAnalysis {
  const timeframePatterns = result.timeframe_patterns
    ? {
        "1W": result.timeframe_patterns["1W"] ?? [],
        "1M": result.timeframe_patterns["1M"] ?? [],
        "3M": result.timeframe_patterns["3M"] ?? [],
        "6M": result.timeframe_patterns["6M"] ?? [],
        "1Y": result.timeframe_patterns["1Y"] ?? [],
      }
    : {
        "1W": [],
        "1M": [],
        "3M": result.technical_patterns.map((pattern) => ({
          ...pattern,
          timeframe: pattern.timeframe ?? "3M",
        })),
        "6M": [],
        "1Y": [],
      };

  for (const timeframe of ["6M", "1Y"] as const) {
    if (timeframePatterns[timeframe].length === 0) {
      const fallback = createFallbackTimeframePattern({
        timeframe,
        candles: historicalDataByTimeframe?.[timeframe] ?? [],
      });
      if (fallback) {
        timeframePatterns[timeframe] = [fallback];
      }
    }
  }

  const taggedTimeframePatterns = {
    "1W": timeframePatterns["1W"].map((pattern) => ({
      ...pattern,
      timeframe: pattern.timeframe ?? "1W",
    })),
    "1M": timeframePatterns["1M"].map((pattern) => ({
      ...pattern,
      timeframe: pattern.timeframe ?? "1M",
    })),
    "3M": timeframePatterns["3M"].map((pattern) => ({
      ...pattern,
      timeframe: pattern.timeframe ?? "3M",
    })),
    "6M": timeframePatterns["6M"].map((pattern) => ({
      ...pattern,
      timeframe: pattern.timeframe ?? "6M",
    })),
    "1Y": timeframePatterns["1Y"].map((pattern) => ({
      ...pattern,
      timeframe: pattern.timeframe ?? "1Y",
    })),
  };

  const aggregatePatterns = new Map<string, TechnicalPattern>();
  const addPattern = (pattern: TechnicalPattern) => {
    const key = [
      pattern.timeframe ?? "",
      pattern.name,
      pattern.type,
      pattern.start_time ?? "",
      pattern.end_time ?? "",
      pattern.start_price ?? "",
      pattern.end_price ?? "",
    ].join("|");
    aggregatePatterns.set(key, pattern);
  };

  for (const pattern of result.technical_patterns) {
    addPattern({
      ...pattern,
      timeframe: pattern.timeframe ?? "3M",
    });
  }
  for (const patterns of Object.values(taggedTimeframePatterns)) {
    for (const pattern of patterns) {
      addPattern(pattern);
    }
  }

  return {
    ...result,
    technical_patterns: [...aggregatePatterns.values()],
    timeframe_patterns: taggedTimeframePatterns,
  };
}

function normalizeSupportResistanceStrength(
  value: unknown,
): "weak" | "moderate" | "strong" {
  if (typeof value !== "string") {
    return "moderate";
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (["weak", "minor", "light", "soft", "low"].includes(normalized)) {
    return "weak";
  }

  if (
    [
      "strong",
      "major",
      "key",
      "significant",
      "high",
      "very_strong",
      "critical",
    ].includes(normalized)
  ) {
    return "strong";
  }

  return "moderate";
}

function sanitizeDeepDiveResponse(data: unknown): unknown {
  if (!data || typeof data !== "object") {
    return data;
  }

  const candidate = structuredClone(data) as Record<string, unknown>;
  if (!Array.isArray(candidate.support_resistance)) {
    return candidate;
  }

  candidate.support_resistance = candidate.support_resistance.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }

    const level = { ...(entry as Record<string, unknown>) };
    level.strength = normalizeSupportResistanceStrength(level.strength);
    return level;
  });

  return candidate;
}

export async function generateDeepDive(
  input: DeepDiveInput,
  options?: { signal?: AbortSignal },
): Promise<{
  deepDive: DeepDiveAnalysis;
  triggerReport: TriggerReport | null;
}> {
  const { ticker } = input;
  console.log(`[LLM] Generating deep dive for ${ticker}`);
  const { prompt, triggerReport } = buildDeepDivePromptContext(input);

  const result = await callLlmWithRetry(
    DEEP_DIVE_SYSTEM_INSTRUCTION,
    prompt,
    DEEP_DIVE_RESPONSE_SCHEMA,
    deepDiveAnalysisSchema,
    {
      callType: "deepDive",
      temperature: 0.25,
      maxOutputTokens: 16384,
      preprocessParsedJson: sanitizeDeepDiveResponse,
      signal: options?.signal,
    },
  );
  const normalized = normalizeDeepDivePatterns(
    result,
    input.historicalDataByTimeframe,
  );

  console.log(
    `[LLM] Deep dive for ${ticker}: risk=${normalized.risk_assessment.overall_risk}, ` +
      `patterns=${normalized.technical_patterns.length}, S/R=${normalized.support_resistance.length}, ` +
      `triggerAssessment=${triggerReport?.overallAssessment ?? "null"} (profileCandles=${(input.historicalDataByTimeframe?.["3M"] ?? input.historicalData).length})`,
  );

  return { deepDive: normalized, triggerReport };
}

// ============================================================
// Epic 43 — Nexus Drift Analysis
// ============================================================

import type { NexusCompany } from "@/lib/data/nexus-companies";

export async function analyzeNexusDrift(
  nexusCompanies: NexusCompany[],
  recentNewsContext: string,
): Promise<NexusDriftAnalysis> {
  console.log(
    `[LLM] Analyzing nexus drift for ${nexusCompanies.length} companies`,
  );

  const prompt = buildNexusDriftPrompt(nexusCompanies, recentNewsContext);

  const result = await callLlmWithRetry(
    NEXUS_DRIFT_SYSTEM_INSTRUCTION,
    prompt,
    NEXUS_DRIFT_RESPONSE_SCHEMA,
    nexusDriftAnalysisSchema,
    {
      callType: "nexusDrift",
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
  );

  console.log(
    `[LLM] Nexus drift: ${result.overall_assessment} — ${result.removals.length} removals, ${result.additions.length} additions, ${result.risk_alerts.length} alerts`,
  );

  return result;
}
