import OpenAI from "openai";
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
import {
  SIM_TRADE_EVALUATOR_SYSTEM_INSTRUCTION,
  SIM_TRADE_EVALUATOR_RESPONSE_SCHEMA,
  buildSimTradeEvalPrompt,
} from "@/lib/prompts/sim-trade-evaluator";
import { type TradeDecision, tradeDecisionSchema } from "@/types/portfolio";
import type { CandleData, OptionsChainSummary } from "@/types/market";

// --- OpenRouter Client Singleton (OpenAI-compatible) ---

let client: OpenAI | null = null;

const DEFAULT_OPEN_ROUTER_MODEL = "qwen/qwen3.5-plus-02-15";

function isPreviewModel(model: string): boolean {
  return model.toLowerCase().includes("preview");
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as {
    code?: number | string;
    status?: number;
    message?: string;
    error?: { message?: string; metadata?: { raw?: string } };
  };

  const raw =
    `${maybeError.message ?? ""} ${maybeError.error?.message ?? ""} ${maybeError.error?.metadata?.raw ?? ""}`.toLowerCase();
  return (
    maybeError.code === 429 ||
    maybeError.code === "429" ||
    maybeError.status === 429 ||
    raw.includes("429") ||
    raw.includes("rate limit") ||
    raw.includes("provider returned error")
  );
}

function isPreviewRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as {
    code?: number | string;
    error?: { metadata?: { raw?: string } };
  };

  const raw = maybeError.error?.metadata?.raw?.toLowerCase() ?? "";
  return maybeError.code === 429 && raw.includes("preview");
}

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPEN_ROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPEN_ROUTER_API_KEY environment variable is required");
    }
    client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://options-dashboard.local",
        "X-Title": "Options Dashboard",
      },
    });
  }
  return client;
}

function getModel(): string {
  return process.env.OPEN_ROUTER_MODEL ?? DEFAULT_OPEN_ROUTER_MODEL;
}

function getStableModelOverride(
  override: string | undefined,
  label: string,
): string | null {
  if (!override) return null;
  if (!isPreviewModel(override)) {
    return override;
  }

  console.warn(
    `[LLM] Ignoring preview ${label} override (${override}) and using stable fallback ${DEFAULT_OPEN_ROUTER_MODEL}`,
  );
  return DEFAULT_OPEN_ROUTER_MODEL;
}

function getClassifyNewsModel(): string {
  const override = getStableModelOverride(
    process.env.OPEN_ROUTER_NEWS_MODEL,
    "news model",
  );
  if (override) return override;

  const defaultModel = getModel();
  return isPreviewModel(defaultModel)
    ? DEFAULT_OPEN_ROUTER_MODEL
    : defaultModel;
}

function getSimTradeEvalModel(): string {
  const override = getStableModelOverride(
    process.env.OPEN_ROUTER_SIM_TRADE_MODEL,
    "sim trade model",
  );
  if (override) return override;

  const defaultModel = getModel();
  if (isPreviewModel(defaultModel)) {
    return DEFAULT_OPEN_ROUTER_MODEL;
  }

  return defaultModel;
}

/** @internal Reset client singleton — for tests only */
export function _resetClient(): void {
  client = null;
}

// --- Token usage tracking (Story 17.4) ---

interface TokenUsageRecord {
  callType: string;
  outputTokens: number;
  maxOutputTokens: number;
  usagePct: number;
  timestamp: string;
}

const _tokenUsageLog: TokenUsageRecord[] = [];
const MAX_TOKEN_LOG_SIZE = 200;

export function getTokenUsageStats(): {
  recentCalls: TokenUsageRecord[];
  byCallType: Record<
    string,
    { count: number; avgTokens: number; maxTokens: number; avgUsagePct: number }
  >;
} {
  const byCallType: Record<
    string,
    { count: number; totalTokens: number; maxTokens: number; totalPct: number }
  > = {};
  for (const r of _tokenUsageLog) {
    const entry = byCallType[r.callType] ?? {
      count: 0,
      totalTokens: 0,
      maxTokens: 0,
      totalPct: 0,
    };
    entry.count++;
    entry.totalTokens += r.outputTokens;
    entry.maxTokens = Math.max(entry.maxTokens, r.outputTokens);
    entry.totalPct += r.usagePct;
    byCallType[r.callType] = entry;
  }
  const summary: Record<
    string,
    { count: number; avgTokens: number; maxTokens: number; avgUsagePct: number }
  > = {};
  for (const [k, v] of Object.entries(byCallType)) {
    summary[k] = {
      count: v.count,
      avgTokens: Math.round(v.totalTokens / v.count),
      maxTokens: v.maxTokens,
      avgUsagePct: Math.round(v.totalPct / v.count),
    };
  }
  return { recentCalls: _tokenUsageLog.slice(-20), byCallType: summary };
}

// --- Extract JSON from model response text ---

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  // Try to find JSON object in fenced code block
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // Try to extract JSON object/array from prose
  const objMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (objMatch) return objMatch[1];
  const arrMatch = trimmed.match(/(\[[\s\S]*\])/);
  if (arrMatch) return arrMatch[1];
  return trimmed;
}

// --- Generic retry helper (OpenRouter json_object + schema-in-prompt) ---

async function callLLMWithRetry<T>(
  systemInstruction: string,
  userPrompt: string,
  responseSchema: object,
  zodSchema: { parse: (data: unknown) => T },
  options: {
    callType?: string;
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
    maxRetries?: number;
  } = {},
): Promise<T> {
  const {
    callType = "unknown",
    model: requestedModel,
    temperature = 0.1,
    maxOutputTokens = 8192,
    maxRetries = 3,
  } = options;

  const openai = getClient();
  let activeModel = requestedModel ?? getModel();

  // Inject the JSON schema into the system prompt so the model knows
  // the exact field names, types, and structure to produce.
  const schemaGuidance = `\n\nYou MUST respond with ONLY a valid JSON object matching this exact schema — no markdown, no commentary, no explanation:\n${JSON.stringify(responseSchema, null, 2)}`;
  const fullSystemPrompt = systemInstruction + schemaGuidance;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let rawText = "";
    try {
      // Build request params — only suppress reasoning for models that support it
      const params: Record<string, unknown> = {
        model: activeModel,
        messages: [
          { role: "system", content: fullSystemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature,
        max_tokens: maxOutputTokens,
      };

      // Qwen 3.5 needs reasoning suppressed to avoid wasting output tokens.
      // Newer models (3.6+) require reasoning and reject effort: "none".
      const modelLower = activeModel.toLowerCase();
      if (
        modelLower.includes("qwen3.5") ||
        modelLower.includes("qwen/qwen3.5")
      ) {
        params.reasoning = { effort: "none" };
      }

      const result = await openai.chat.completions.create(
        params as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming,
      );

      rawText = result.choices[0]?.message?.content ?? "";

      // Reject fully empty responses
      if (!rawText || rawText.trim().length === 0) {
        throw new Error("Empty response from model — retrying");
      }

      // Token usage from response metadata
      const outputTokens =
        result.usage?.completion_tokens ?? Math.round(rawText.length / 4);
      const totalTokens = result.usage?.total_tokens ?? 0;
      const usagePct = Math.round((outputTokens / maxOutputTokens) * 100);

      console.log(
        `[LLM] ${callType} response: ${outputTokens} tokens out, ${totalTokens} total (model: ${activeModel})`,
      );
      if (usagePct > 80) {
        console.warn(
          `[LLM] ⚠️ ${callType} used ${usagePct}% of token limit — consider increasing maxOutputTokens`,
        );
      }

      _tokenUsageLog.push({
        callType,
        outputTokens: Math.round(outputTokens),
        maxOutputTokens,
        usagePct,
        timestamp: new Date().toISOString(),
      });
      if (_tokenUsageLog.length > MAX_TOKEN_LOG_SIZE) {
        _tokenUsageLog.splice(0, _tokenUsageLog.length - MAX_TOKEN_LOG_SIZE);
      }

      const jsonText = extractJson(rawText);
      const parsed = JSON.parse(jsonText);
      return zodSchema.parse(parsed);
    } catch (error) {
      if (
        (callType === "simTradeEval" || callType === "classifyNews") &&
        isPreviewModel(activeModel) &&
        isPreviewRateLimitError(error)
      ) {
        console.warn(
          `[LLM] ${callType} preview model ${activeModel} was rate-limited; retrying with stable fallback ${DEFAULT_OPEN_ROUTER_MODEL}`,
        );
        activeModel = DEFAULT_OPEN_ROUTER_MODEL;
        continue;
      }

      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[LLM] ${callType} attempt ${attempt + 1}/${maxRetries} failed:`,
        errMsg.slice(0, 500),
      );
      if (isRateLimitError(error)) {
        console.warn(
          `[LLM] ${callType} appears rate-limited on model ${activeModel}; backing off before retry`,
        );
      }
      if (rawText) {
        console.error(`[LLM] Raw response preview: ${rawText.slice(0, 400)}`);
      }
      if (attempt === maxRetries - 1) throw error;
      const baseDelayMs = isRateLimitError(error) ? 5000 : 2000;
      await new Promise((r) =>
        setTimeout(r, baseDelayMs * Math.pow(2, attempt)),
      );
    }
  }
  throw new Error(`LLM ${callType} call failed after retries`);
}

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

  console.log(
    `[LLM] Classifying ${articles.length} articles in ${batches.length} batch(es), concurrency=${concurrency}, model=${model}`,
  );

  const allClassified: NewsClassification["articles"] = [];
  let totalInput = 0;
  let batchesDone = 0;

  // Process batches with limited concurrency
  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      chunk.map((batch) => {
        const prompt = buildNewsClassifierPrompt(batch);
        return callLLMWithRetry(
          NEWS_CLASSIFIER_SYSTEM_INSTRUCTION,
          prompt,
          NEWS_CLASSIFIER_RESPONSE_SCHEMA,
          newsClassificationSchema,
          {
            callType: "classifyNews",
            model,
            temperature: 0.1,
            maxOutputTokens: 8192,
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
    (a) => a.is_market_relevant && a.impact_score >= 3,
  );

  console.log(
    `[LLM] Classification complete: ${totalInput} input, ${relevant.length} relevant (impact >= 3)`,
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

  const result = await callLLMWithRetry(
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
  optionsAnalytics?: {
    maxPain?: number | null;
    oiWalls?: {
      callWalls: { strike: number; oi: number }[];
      putWalls: { strike: number; oi: number }[];
    } | null;
    ivRvSpread?: number | null;
    realizedVol?: number | null;
    gex?: {
      netGEX: number;
      gexFlipLevel: number | null;
      topConcentrations: { strike: number; gex: number }[];
      dealerPositioning: string;
    } | null;
  };
  sectorRotationContext?: string;
}

export async function generateRecommendation(
  correlation: Correlation,
  marketData: MarketDataForRecommendation,
): Promise<TradeRecommendation> {
  const ticker = correlation.whale_trade.ticker;

  console.log(`[LLM] Generating recommendation for ${ticker}`);

  const prompt = buildTradeAnalyzerPrompt(
    JSON.stringify(correlation, null, 2),
    ticker,
    marketData.price,
    marketData.ivRank,
    marketData.avgVolume,
    marketData.todayVolume,
    marketData.optionsChainSummary,
    marketData.macroContext,
    marketData.optionsAnalytics,
    marketData.sectorRotationContext,
  );

  const result = await callLLMWithRetry(
    TRADE_ANALYZER_SYSTEM_INSTRUCTION,
    prompt,
    TRADE_ANALYZER_RESPONSE_SCHEMA,
    tradeRecommendationSchema,
    {
      callType: "recommendation",
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
  );

  console.log(
    `[LLM] Recommendation for ${ticker}: ${result.direction} (confidence: ${result.confidence})`,
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
  historicalDataByTimeframe?: Partial<Record<AnalysisTimeframe, CandleData[]>>;
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
  optionsAnalytics?: {
    maxPain?: number | null;
    oiWalls?: {
      callWalls: { strike: number; oi: number }[];
      putWalls: { strike: number; oi: number }[];
    } | null;
    ivRvSpread?: number | null;
    realizedVol?: number | null;
    gex?: {
      netGEX: number;
      gexFlipLevel: number | null;
      topConcentrations: { strike: number; gex: number }[];
      dealerPositioning: string;
    } | null;
  };
}

const DEEP_DIVE_TIMEFRAME_CONFIG: Array<{
  timeframe: AnalysisTimeframe;
  maxRows: number;
}> = [
  { timeframe: "1W", maxRows: 36 },
  { timeframe: "1M", maxRows: 30 },
  { timeframe: "3M", maxRows: 45 },
  { timeframe: "6M", maxRows: 36 },
  { timeframe: "1Y", maxRows: 36 },
];

function formatCandleTimeForPrompt(value: CandleData["time"]): string {
  if (typeof value === "number") {
    return new Date(value * 1000).toISOString();
  }
  return value;
}

function summarizeCandlesForPrompt(candles: CandleData[], maxRows: number): string {
  if (candles.length === 0) {
    return "No historical data available.";
  }

  const sampled =
    candles.length <= maxRows
      ? candles
      : Array.from({ length: maxRows }, (_, idx) => {
          const position = Math.round((idx * (candles.length - 1)) / (maxRows - 1));
          return candles[position];
        });

  return (
    `Time | Open | High | Low | Close | Volume\n` +
    sampled
      .map(
        (c) =>
          `${formatCandleTimeForPrompt(c.time)} | ${c.open.toFixed(2)} | ${c.high.toFixed(2)} | ${c.low.toFixed(2)} | ${c.close.toFixed(2)} | ${c.volume}`,
      )
      .join("\n")
  );
}

function createFallbackTimeframePattern(args: {
  timeframe: Extract<AnalysisTimeframe, "6M" | "1Y">;
  candles: CandleData[];
}): TechnicalPattern | null {
  const { timeframe, candles } = args;
  if (candles.length < 2) {
    return null;
  }

  const first = candles[0];
  const last = candles[candles.length - 1];
  const startClose = first.close;
  const endClose = last.close;
  const changePct = startClose !== 0 ? (endClose - startClose) / startClose : 0;
  const minLow = candles.reduce((acc, candle) => Math.min(acc, candle.low), Number.POSITIVE_INFINITY);
  const maxHigh = candles.reduce((acc, candle) => Math.max(acc, candle.high), Number.NEGATIVE_INFINITY);

  if (!Number.isFinite(minLow) || !Number.isFinite(maxHigh)) {
    return null;
  }

  if (Math.abs(changePct) < 0.05) {
    return {
      name: timeframe === "1Y" ? "Primary Yearly Range" : "Primary Medium-Term Range",
      type: "neutral",
      description:
        timeframe === "1Y"
          ? "Price has remained in a broad yearly range, so the dominant long-horizon structure is a horizontal channel rather than a strong trend."
          : "Price has remained in a broad medium-term range over the selected window, so the dominant structure is a horizontal channel.",
      confidence: 0.55,
      timeframe,
      price_target: null,
      drawing_type: "channel",
      start_time: formatCandleTimeForPrompt(first.time),
      end_time: formatCandleTimeForPrompt(last.time),
      start_price: minLow,
      end_price: minLow,
      secondary_start_price: maxHigh,
      secondary_end_price: maxHigh,
    };
  }

  const isBullish = changePct > 0;
  const lowerStart = Math.min(first.open, first.close, first.low);
  const lowerEnd = Math.min(last.open, last.close, last.low);
  const upperStart = Math.max(first.open, first.close, first.high);
  const upperEnd = Math.max(last.open, last.close, last.high);

  return {
    name:
      timeframe === "1Y"
        ? isBullish
          ? "Primary Yearly Uptrend"
          : "Primary Yearly Downtrend"
        : isBullish
          ? "Primary Medium-Term Uptrend"
          : "Primary Medium-Term Downtrend",
    type: isBullish ? "bullish" : "bearish",
    description: `${timeframe} candles imply a ${isBullish ? "rising" : "falling"} long-range price channel from ${startClose.toFixed(2)} to ${endClose.toFixed(2)}, so the dominant technical structure should remain visible on the broader chart range.`,
    confidence: 0.58,
    timeframe,
    price_target: null,
    drawing_type: "channel",
    start_time: formatCandleTimeForPrompt(first.time),
    end_time: formatCandleTimeForPrompt(last.time),
    start_price: lowerStart,
    end_price: lowerEnd,
    secondary_start_price: upperStart,
    secondary_end_price: upperEnd,
  };
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

export async function generateDeepDive(
  input: DeepDiveInput,
): Promise<DeepDiveAnalysis> {
  const { ticker } = input;
  console.log(`[LLM] Generating deep dive for ${ticker}`);

  const historicalSummariesByTimeframe = Object.fromEntries(
    DEEP_DIVE_TIMEFRAME_CONFIG.map(({ timeframe, maxRows }) => [
      timeframe,
      summarizeCandlesForPrompt(
        input.historicalDataByTimeframe?.[timeframe] ??
          (timeframe === "3M" ? input.historicalData : []),
        maxRows,
      ),
    ]),
  ) as Partial<Record<AnalysisTimeframe, string>>;
  const historicalSummary =
    historicalSummariesByTimeframe["3M"] ?? "No historical data available.";

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
    historicalDataSummariesByTimeframe: historicalSummariesByTimeframe,
    optionsChainSummary: chainSummary,
    currentPrice: input.currentPrice,
    correlatedEventJson: input.correlatedEvent
      ? JSON.stringify(input.correlatedEvent, null, 2)
      : undefined,
    newsContextJson: input.newsContext
      ? JSON.stringify(input.newsContext, null, 2)
      : undefined,
    macroContext: input.macroContext,
    optionsAnalytics: input.optionsAnalytics,
  });

  const result = await callLLMWithRetry(
    DEEP_DIVE_SYSTEM_INSTRUCTION,
    prompt,
    DEEP_DIVE_RESPONSE_SCHEMA,
    deepDiveAnalysisSchema,
    {
      callType: "deepDive",
      temperature: 0.25,
      maxOutputTokens: 16384,
    },
  );
  const normalized = normalizeDeepDivePatterns(
    result,
    input.historicalDataByTimeframe,
  );

  console.log(
    `[LLM] Deep dive for ${ticker}: risk=${normalized.risk_assessment.overall_risk}, ` +
      `patterns=${normalized.technical_patterns.length}, S/R=${normalized.support_resistance.length}`,
  );

  return normalized;
}

// ============================================================
// Epic 12 — Sim Trade Evaluator
// ============================================================

interface SimTradeEvalInput {
  ticker: string;
  currentPrice: number;
  recommendation: {
    thesis: string;
    direction: string;
    confidence: number;
    strategy: {
      name: string;
      legs: Array<{
        action: string;
        type: string;
        strike: number;
        expiry: string;
        estimated_premium: number;
      }>;
      max_loss: string;
      max_profit: string;
      risk_reward_ratio: string;
    };
    risk_factors: string[];
  };
  deepDive?: {
    market_narrative: string;
    risk_level: string;
    entry_exit?: {
      profit_target: string;
      stop_loss: string;
      position_sizing: string;
    };
  };
  compositeConfidence?: number;
  whaleQualityScore?: number;
  portfolioBalance: number;
  openPositions: Array<{
    ticker: string;
    direction: string;
    entryPrice: number;
    currentPnlPct: number;
  }>;
}

export async function evaluateTradeForSim(
  input: SimTradeEvalInput,
): Promise<TradeDecision> {
  console.log(
    `[LLM] Evaluating ${input.ticker} for sim portfolio (balance: $${input.portfolioBalance.toFixed(2)})`,
  );

  const prompt = buildSimTradeEvalPrompt(input);

  const result = await callLLMWithRetry(
    SIM_TRADE_EVALUATOR_SYSTEM_INSTRUCTION,
    prompt,
    SIM_TRADE_EVALUATOR_RESPONSE_SCHEMA,
    tradeDecisionSchema,
    {
      callType: "simTradeEval",
      model: getSimTradeEvalModel(),
      temperature: 0.2,
      maxOutputTokens: 12288,
    },
  );

  console.log(
    `[LLM] Sim eval for ${input.ticker}: ${result.should_enter ? "ENTER" : "SKIP"} ` +
      `(size: $${result.position_size_dollars}, strategy: ${result.adjusted_entry.strategy_name})`,
  );

  return result;
}
