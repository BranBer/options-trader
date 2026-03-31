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
import {
  type TradeDecision,
  tradeDecisionSchema,
} from "@/types/portfolio";
import type { CandleData, OptionsChainSummary } from "@/types/market";

// --- OpenRouter Client Singleton (OpenAI-compatible) ---

let client: OpenAI | null = null;

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
  return process.env.OPEN_ROUTER_MODEL ?? "qwen/qwen3.5-9b";
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

// --- Extract JSON from potentially wrapped text ---

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  // Try to extract JSON object from text (prefer object over array)
  const objMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (objMatch) return objMatch[1];
  const arrMatch = trimmed.match(/(\[[\s\S]*\])/);
  if (arrMatch) return arrMatch[1];
  return trimmed;
}

// --- Coerce common LLM output issues in article objects ---

// Map common alternate field names the model uses to the expected schema names
const FIELD_ALIASES: Record<string, string> = {
  headline: "original_headline",
  title: "original_headline",
  sentiment: "market_sentiment",
  sectors: "affected_sectors",
  tickers: "affected_tickers",
  origin: "country_code",
  country: "country_code",
  location: "region",
  summary: "one_line_summary",
  explanation: "reasoning",
  type: "event_type",
  relevant: "is_market_relevant",
  market_relevant: "is_market_relevant",
  impact: "impact_score",
  score: "impact_score",
  date: "published_at",
  published: "published_at",
  timestamp: "published_at",
};

function coerceArticleFields(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  // Remap aliased field names to expected schema names
  for (const [key, value] of Object.entries(obj)) {
    const canonical = FIELD_ALIASES[key] ?? key;
    // Don't overwrite if canonical field already set from a previous key
    if (!(canonical in result)) {
      result[canonical] = value;
    }
  }

  // Clamp impact_score to valid range [1, 10]
  if (typeof result.impact_score === "number") {
    result.impact_score = Math.max(1, Math.min(10, Math.round(result.impact_score)));
  } else {
    result.impact_score = 3;
  }
  // Coerce string booleans
  if (typeof result.is_market_relevant === "string") {
    result.is_market_relevant = result.is_market_relevant.toLowerCase() === "true";
  }
  // Default is_market_relevant based on impact_score
  if (result.is_market_relevant === undefined && typeof result.impact_score === "number") {
    result.is_market_relevant = result.impact_score >= 3;
  }
  if (result.is_market_relevant === undefined) {
    result.is_market_relevant = true;
  }
  // Lowercase enum values
  if (typeof result.market_sentiment === "string") {
    result.market_sentiment = result.market_sentiment.toLowerCase();
  }
  if (typeof result.event_type === "string") {
    result.event_type = result.event_type.toLowerCase().replace(/[\s-]+/g, "_");
  }
  // Validate event_type is in the allowed enum, default to "other"
  const VALID_EVENT_TYPES = new Set([
    "geopolitical", "economic", "regulatory", "earnings", "supply_chain",
    "technology", "natural_disaster", "central_bank", "other",
  ]);
  if (!result.event_type || !VALID_EVENT_TYPES.has(result.event_type as string)) {
    result.event_type = "other";
  }
  // Validate market_sentiment enum
  const VALID_SENTIMENTS = new Set(["bullish", "bearish", "neutral"]);
  if (!result.market_sentiment || !VALID_SENTIMENTS.has(result.market_sentiment as string)) {
    result.market_sentiment = "neutral";
  }
  // Default empty arrays for required array fields
  if (!Array.isArray(result.affected_sectors)) result.affected_sectors = [];
  if (!Array.isArray(result.affected_tickers)) result.affected_tickers = [];
  // Default required strings
  if (!result.country_code) result.country_code = "US";
  if (!result.region) result.region = "Unknown";
  if (!result.source) result.source = "unknown";
  if (!result.published_at) result.published_at = new Date().toISOString();
  if (!result.one_line_summary && result.original_headline) {
    result.one_line_summary = result.original_headline as string;
  }
  if (!result.reasoning) result.reasoning = "No reasoning provided";

  return result;
}

// --- Extract articles array from various model response shapes ---

function extractArticlesArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  // Check known keys that contain the articles array
  for (const key of ["articles", "market_relevant_articles", "relevant_articles", "results", "data", "items"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  // Fall back: find first array-valued property
  for (const val of Object.values(obj)) {
    if (Array.isArray(val) && val.length > 0) return val;
  }
  return null;
}

// --- Per-schema normalizers for common LLM output issues ---

function normalizeNewsClassification(parsed: unknown): unknown {
  const articles = extractArticlesArray(parsed);
  if (!articles) return parsed;
  console.log(`[LLM] Normalizing news response: found ${articles.length} articles, coercing fields...`);
  const coerced = articles.map(coerceArticleFields);
  // If we already have the expected wrapper shape, just swap in coerced articles
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (obj.processing_metadata) {
      return { ...obj, articles: coerced };
    }
  }
  return {
    articles: coerced,
    processing_metadata: {
      total_input: coerced.length,
      total_relevant: coerced.length,
      total_discarded: 0,
      processing_timestamp: new Date().toISOString(),
    },
  };
}

function coerceCorrelationItem(item: unknown): unknown {
  if (typeof item !== "object" || item === null) return item;
  const obj = item as Record<string, unknown>;

  // Model sometimes nests ticker at top level instead of inside whale_trade
  const wt = (typeof obj.whale_trade === "object" && obj.whale_trade !== null)
    ? { ...(obj.whale_trade as Record<string, unknown>) }
    : {} as Record<string, unknown>;
  // Pull ticker from top-level if missing in whale_trade
  if (!wt.ticker && obj.ticker) wt.ticker = obj.ticker;
  if (!wt.ticker) wt.ticker = "UNKNOWN";
  // Coerce callPut: "C"/"P" → type: "call"/"put"
  if (!wt.type && wt.callPut) {
    const cp = String(wt.callPut).toUpperCase();
    wt.type = cp === "P" ? "put" : "call";
    delete wt.callPut;
  }
  if (!wt.type && obj.type) wt.type = obj.type;
  if (!wt.type) wt.type = "call";
  // Default numeric fields
  if (wt.strike == null) wt.strike = obj.strike ?? 0;
  if (wt.expiry == null) wt.expiry = obj.expiry ?? new Date().toISOString().split("T")[0];
  if (wt.premium == null) wt.premium = obj.premium ?? 0;
  if (wt.volume == null) wt.volume = obj.volume ?? 0;

  // Coerce related_event / news_event
  const re = (typeof obj.related_event === "object" && obj.related_event !== null)
    ? { ...(obj.related_event as Record<string, unknown>) }
    : (typeof obj.news_event === "object" && obj.news_event !== null)
      ? { ...(obj.news_event as Record<string, unknown>) }
      : {} as Record<string, unknown>;
  if (!re.headline) re.headline = obj.event ?? obj.headline ?? obj.news ?? "Unknown event";
  if (re.impact_score == null) re.impact_score = obj.impact_score ?? 5;
  if (!re.event_type) re.event_type = obj.event_type ?? "other";
  // Coerce sentiment field to event_type if misnamed
  if (re.sentiment && !re.event_type) re.event_type = "other";

  // Coerce alignment enum
  const VALID_ALIGNMENTS = new Set(["confirming", "contrarian", "hedging"]);
  let alignment = obj.alignment ?? "confirming";
  if (!VALID_ALIGNMENTS.has(String(alignment))) alignment = "confirming";

  // Coerce smart_money_signal enum
  const VALID_SIGNALS = new Set(["strong_bullish", "bullish", "neutral", "bearish", "strong_bearish"]);
  let signal = obj.smart_money_signal ?? "neutral";
  if (!VALID_SIGNALS.has(String(signal))) signal = "neutral";

  return {
    whale_trade: wt,
    related_event: re,
    correlation_confidence: obj.correlation_confidence ?? 0.5,
    alignment,
    thesis: obj.thesis ?? obj.notes ?? obj.reasoning ?? "No thesis provided",
    smart_money_signal: signal,
  };
}

function normalizeCrossReference(parsed: unknown): unknown {
  // If model returns an object with correlations array, coerce each item
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.correlations)) {
      console.log(`[LLM] Normalizing cross-reference: coercing ${obj.correlations.length} correlation items...`);
      return {
        ...obj,
        correlations: obj.correlations.map(coerceCorrelationItem),
        uncorrelated_whales: Array.isArray(obj.uncorrelated_whales) ? obj.uncorrelated_whales : [],
        summary: obj.summary ?? "Auto-normalized from model response",
        analysis_metadata: obj.analysis_metadata ?? {
          news_events_analyzed: 0,
          whale_trades_analyzed: obj.correlations.length,
          correlations_found: obj.correlations.length,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }
  // Model sometimes returns a flat array of correlation-like objects
  const arr = Array.isArray(parsed) ? parsed : null;
  if (!arr) return parsed;
  console.log(`[LLM] Normalizing cross-reference: wrapping ${arr.length} correlation items...`);
  return {
    correlations: arr.map(coerceCorrelationItem),
    uncorrelated_whales: [],
    summary: "Auto-normalized from array response",
    analysis_metadata: {
      news_events_analyzed: 0,
      whale_trades_analyzed: arr.length,
      correlations_found: arr.length,
      timestamp: new Date().toISOString(),
    },
  };
}

function normalizeRecommendation(parsed: unknown, ticker: string): unknown {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return parsed;
  let obj = parsed as Record<string, unknown>;

  // Model often wraps everything in trade_thesis or recommendation
  for (const wrapperKey of ["trade_thesis", "recommendation", "trade_recommendation", "strategy"]) {
    if (typeof obj[wrapperKey] === "object" && obj[wrapperKey] !== null) {
      console.log(`[LLM] Unwrapping recommendation from '${wrapperKey}'`);
      obj = { ...obj, ...(obj[wrapperKey] as Record<string, unknown>) };
      break;
    }
  }

  // Inject ticker from context if missing; model uses underlying_asset, underlying, etc.
  if (!obj.ticker) obj.ticker = obj.underlying_asset ?? obj.underlying ?? obj.symbol ?? ticker;

  // Coerce direction enum: model uses directional_bias, direction, etc.
  const rawDirection = String(obj.direction ?? obj.directional_bias ?? "neutral").toLowerCase();
  if (rawDirection.includes("bull") || rawDirection.includes("long")) obj.direction = "bullish";
  else if (rawDirection.includes("bear") || rawDirection.includes("short")) obj.direction = "bearish";
  else obj.direction = "neutral";

  // Coerce thesis from rationale or other fields
  if (!obj.thesis) {
    obj.thesis = obj.rationale ?? obj.reasoning ?? obj.summary ?? "No thesis provided";
  }

  // Coerce confidence to number in [0,1]; default to 0.5 if missing
  if (typeof obj.confidence === "string") {
    obj.confidence = parseFloat(obj.confidence) || 0.5;
  }
  if (typeof obj.confidence === "number" && obj.confidence > 1) {
    obj.confidence = obj.confidence / 100; // e.g., 75 → 0.75
  }
  if (obj.confidence == null || typeof obj.confidence !== "number") {
    obj.confidence = 0.5;
  }

  // Ensure primary_strategy exists
  if (!obj.primary_strategy || typeof obj.primary_strategy !== "object") {
    // Try to build from strategy_name and legs
    obj.primary_strategy = {
      name: obj.strategy_name ?? obj.strategy_type ?? "Unknown",
      legs: Array.isArray(obj.legs) ? obj.legs : [],
      max_profit: obj.max_profit ?? "Unknown",
      max_loss: obj.max_loss ?? "Unknown",
      breakeven: obj.breakeven ?? "Unknown",
      risk_reward_ratio: obj.risk_reward_ratio ?? "Unknown",
    };
  }
  const ps = obj.primary_strategy as Record<string, unknown>;
  if (!ps.name) ps.name = ps.strategy_name ?? ps.strategy_type ?? "Unknown";
  if (!Array.isArray(ps.legs)) ps.legs = [];
  // Coerce each leg
  ps.legs = (ps.legs as unknown[]).map((leg: unknown) => {
    if (typeof leg !== "object" || leg === null) return leg;
    const l = leg as Record<string, unknown>;
    // action: buy/sell
    if (typeof l.action === "string") l.action = l.action.toLowerCase();
    if (!l.action || (l.action !== "buy" && l.action !== "sell")) l.action = "buy";
    // type: call/put
    if (typeof l.type === "string") l.type = l.type.toLowerCase();
    if (!l.type || (l.type !== "call" && l.type !== "put")) l.type = "call";
    if (l.estimated_premium == null) l.estimated_premium = l.premium ?? 0;
    if (l.strike == null) l.strike = 0;
    if (!l.expiry) l.expiry = new Date().toISOString().split("T")[0];
    return l;
  });
  if (!ps.max_profit) ps.max_profit = "Unknown";
  if (!ps.max_loss) ps.max_loss = "Unknown";
  if (!ps.breakeven) ps.breakeven = "Unknown";
  if (!ps.risk_reward_ratio) ps.risk_reward_ratio = "Unknown";

  // Ensure market_context
  if (!obj.market_context || typeof obj.market_context !== "object") {
    obj.market_context = {};
  }
  const mc = obj.market_context as Record<string, unknown>;
  const VALID_IV = new Set(["elevated", "normal", "depressed"]);
  if (!mc.iv_assessment || !VALID_IV.has(String(mc.iv_assessment))) mc.iv_assessment = "normal";
  if (!mc.iv_strategy_note) mc.iv_strategy_note = "N/A";
  const VALID_VOL = new Set(["unusual_high", "above_average", "normal", "low"]);
  if (!mc.volume_assessment || !VALID_VOL.has(String(mc.volume_assessment))) mc.volume_assessment = "normal";
  if (mc.catalyst_date === undefined) mc.catalyst_date = null;
  if (mc.days_to_catalyst === undefined) mc.days_to_catalyst = null;

  // Ensure risk_factors array
  if (!Array.isArray(obj.risk_factors)) obj.risk_factors = [];

  // Ensure whale_alignment
  if (!obj.whale_alignment || typeof obj.whale_alignment !== "object") {
    obj.whale_alignment = {
      matches_whale: true,
      whale_position_size: "Unknown",
      similarity_note: "Auto-normalized",
    };
  }

  // Ensure disclaimer
  if (!obj.disclaimer) obj.disclaimer = "This is an AI-generated analysis for educational purposes only. Not financial advice.";

  return obj;
}

// --- Deep Dive normalizer ---
function normalizeDeepDive(parsed: unknown, ticker: string): unknown {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return parsed;
  let obj = parsed as Record<string, unknown>;

  // Model wraps everything in { "analysis": { ... } } — unwrap
  for (const wrapperKey of ["analysis", "deep_dive", "deep_dive_analysis", "result"]) {
    if (typeof obj[wrapperKey] === "object" && obj[wrapperKey] !== null && !Array.isArray(obj[wrapperKey])) {
      console.log(`[LLM] Unwrapping deep dive from '${wrapperKey}'`);
      obj = { ...obj, ...(obj[wrapperKey] as Record<string, unknown>) };
      delete obj[wrapperKey];
      break;
    }
  }

  // Inject ticker if missing
  if (!obj.ticker) obj.ticker = ticker;

  // Model may use executive_summary instead of whale_trade_summary
  if (!obj.whale_trade_summary) {
    obj.whale_trade_summary = obj.executive_summary ?? obj.summary ?? "No summary available";
  }
  if (!obj.market_narrative) {
    obj.market_narrative = obj.narrative ?? obj.market_analysis ?? "No narrative available";
  }
  if (!obj.global_events_connection) {
    obj.global_events_connection = obj.global_events ?? obj.macro_connection ?? "No global events analysis available";
  }

  // Ensure arrays exist
  if (!Array.isArray(obj.technical_patterns)) obj.technical_patterns = [];
  if (!Array.isArray(obj.support_resistance)) obj.support_resistance = [];
  if (!Array.isArray(obj.indicators)) obj.indicators = [];
  if (!Array.isArray(obj.educational_notes)) obj.educational_notes = [];

  // Coerce technical_patterns items
  obj.technical_patterns = (obj.technical_patterns as unknown[]).map((p: unknown) => {
    if (typeof p !== "object" || p === null) return p;
    const pat = p as Record<string, unknown>;
    if (!pat.name) pat.name = pat.pattern ?? "Unknown";
    const rawType = String(pat.type ?? "neutral").toLowerCase();
    if (!["bullish", "bearish", "neutral"].includes(rawType)) pat.type = "neutral";
    else pat.type = rawType;
    if (!pat.description) pat.description = "N/A";
    if (typeof pat.confidence !== "number") pat.confidence = 0.5;
    if ((pat.confidence as number) > 1) pat.confidence = (pat.confidence as number) / 100;
    if (pat.price_target === undefined) pat.price_target = null;
    return pat;
  });

  // Coerce indicators items
  obj.indicators = (obj.indicators as unknown[]).map((ind: unknown) => {
    if (typeof ind !== "object" || ind === null) return ind;
    const i = ind as Record<string, unknown>;
    if (!i.name) i.name = "Unknown";
    if (i.value == null) i.value = "N/A";
    if (typeof i.value !== "string") i.value = String(i.value);
    const rawSignal = String(i.signal ?? "neutral").toLowerCase();
    if (!["bullish", "bearish", "neutral"].includes(rawSignal)) i.signal = "neutral";
    else i.signal = rawSignal;
    if (!i.explanation) i.explanation = "N/A";
    return i;
  });

  // Coerce support_resistance items
  obj.support_resistance = (obj.support_resistance as unknown[]).map((sr: unknown) => {
    if (typeof sr !== "object" || sr === null) return sr;
    const s = sr as Record<string, unknown>;
    if (typeof s.level !== "number") s.level = parseFloat(String(s.level ?? s.price ?? 0)) || 0;
    const rawSrType = String(s.type ?? "support").toLowerCase();
    if (!["support", "resistance"].includes(rawSrType)) s.type = "support";
    else s.type = rawSrType;
    const rawStrength = String(s.strength ?? "moderate").toLowerCase();
    if (!["weak", "moderate", "strong"].includes(rawStrength)) s.strength = "moderate";
    else s.strength = rawStrength;
    if (!s.note) s.note = s.description ?? s.reason ?? "N/A";
    return s;
  });

  // Ensure options_context object
  if (!obj.options_context || typeof obj.options_context !== "object") {
    obj.options_context = {};
  }
  const oc = obj.options_context as Record<string, unknown>;
  if (!oc.iv_percentile) oc.iv_percentile = oc.iv_rank ?? "N/A";
  if (typeof oc.iv_percentile !== "string") oc.iv_percentile = String(oc.iv_percentile);
  if (!oc.iv_interpretation) oc.iv_interpretation = "N/A";
  if (!oc.put_call_ratio) oc.put_call_ratio = "N/A";
  if (typeof oc.put_call_ratio !== "string") oc.put_call_ratio = String(oc.put_call_ratio);
  if (!oc.unusual_activity_note) oc.unusual_activity_note = oc.unusual_activity ?? "N/A";
  if (!oc.greeks_summary) oc.greeks_summary = "N/A";

  // Ensure entry_exit object
  if (!obj.entry_exit || typeof obj.entry_exit !== "object") {
    obj.entry_exit = {};
  }
  const ee = obj.entry_exit as Record<string, unknown>;
  if (!ee.recommended_option_type) ee.recommended_option_type = ee.option_type ?? "N/A";
  if (!ee.entry_price_range || typeof ee.entry_price_range !== "object") {
    ee.entry_price_range = { low: 0, high: 0 };
  }
  if (!ee.strike_selection) ee.strike_selection = "N/A";
  if (!ee.expiry_guidance) ee.expiry_guidance = ee.expiry ?? "N/A";
  if (!ee.profit_target) ee.profit_target = "N/A";
  if (!ee.stop_loss) ee.stop_loss = "N/A";
  if (!ee.position_sizing) ee.position_sizing = "N/A";
  if (!ee.rationale) ee.rationale = ee.reasoning ?? "N/A";

  // Ensure risk_assessment object
  if (!obj.risk_assessment || typeof obj.risk_assessment !== "object") {
    obj.risk_assessment = {};
  }
  const ra = obj.risk_assessment as Record<string, unknown>;
  const rawRisk = String(ra.overall_risk ?? ra.risk_level ?? "moderate").toLowerCase().replace(/[^a-z_]/g, "_");
  const VALID_RISK = new Set(["low", "moderate", "high", "very_high"]);
  if (!VALID_RISK.has(rawRisk)) {
    ra.overall_risk = rawRisk.includes("very") || rawRisk.includes("extreme") ? "very_high" : 
                      rawRisk.includes("high") ? "high" : 
                      rawRisk.includes("low") ? "low" : "moderate";
  } else {
    ra.overall_risk = rawRisk;
  }
  if (!Array.isArray(ra.key_risks)) ra.key_risks = [];
  if (!ra.max_recommended_allocation) ra.max_recommended_allocation = ra.position_sizing ?? "5% of portfolio";

  // Ensure educational_notes
  obj.educational_notes = (obj.educational_notes as unknown[]).map((note: unknown) => {
    if (typeof note !== "object" || note === null) return { term: "N/A", explanation: "N/A" };
    const n = note as Record<string, unknown>;
    if (!n.term) n.term = n.concept ?? n.title ?? "N/A";
    if (!n.explanation) n.explanation = n.description ?? n.definition ?? "N/A";
    return n;
  });

  // Ensure disclaimer
  if (!obj.disclaimer) obj.disclaimer = "This is an AI-generated analysis for educational purposes only. Not financial advice.";

  return obj;
}

// --- Sim Trade Eval normalizer ---
function normalizeSimTradeEval(parsed: unknown): unknown {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return parsed;
  let obj = parsed as Record<string, unknown>;

  // Model may wrap in { "evaluation": {...} } or { "trade_evaluation": {...} }
  for (const wrapperKey of ["evaluation", "trade_evaluation", "result"]) {
    if (typeof obj[wrapperKey] === "object" && obj[wrapperKey] !== null && !Array.isArray(obj[wrapperKey])) {
      console.log(`[LLM] Unwrapping sim trade eval from '${wrapperKey}'`);
      obj = { ...obj, ...(obj[wrapperKey] as Record<string, unknown>) };
      delete obj[wrapperKey];
      break;
    }
  }

  // Map "decision" field to should_enter boolean
  if (obj.should_enter === undefined && obj.decision !== undefined) {
    const decision = String(obj.decision).toUpperCase();
    obj.should_enter = decision === "ACCEPT" || decision === "ENTER" || decision === "YES" || decision === "APPROVE";
    console.log(`[LLM] Mapped decision='${obj.decision}' → should_enter=${obj.should_enter}`);
  }
  if (typeof obj.should_enter !== "boolean") {
    obj.should_enter = false;
  }

  // Ensure reasoning
  if (!obj.reasoning) obj.reasoning = obj.rationale ?? obj.explanation ?? "No reasoning provided";

  // Ensure position_size_dollars
  if (typeof obj.position_size_dollars !== "number") {
    obj.position_size_dollars = obj.should_enter ? (typeof obj.position_size === "number" ? obj.position_size : 100) : 0;
  }

  // Ensure adjusted_entry object with defaults for rejections
  if (!obj.adjusted_entry || typeof obj.adjusted_entry !== "object") {
    obj.adjusted_entry = {
      strategy_name: obj.strategy_name ?? obj.strategy ?? "None",
      legs: [],
      net_premium: 0,
    };
  }
  const ae = obj.adjusted_entry as Record<string, unknown>;
  if (!ae.strategy_name) ae.strategy_name = ae.name ?? "None";
  if (!Array.isArray(ae.legs)) ae.legs = [];
  if (typeof ae.net_premium !== "number") ae.net_premium = 0;
  // Coerce legs
  ae.legs = (ae.legs as unknown[]).map((leg: unknown) => {
    if (typeof leg !== "object" || leg === null) return leg;
    const l = leg as Record<string, unknown>;
    if (typeof l.action === "string") l.action = l.action.toLowerCase();
    if (!l.action || (l.action !== "buy" && l.action !== "sell")) l.action = "buy";
    if (typeof l.type === "string") l.type = l.type.toLowerCase();
    if (!l.type || (l.type !== "call" && l.type !== "put")) l.type = "call";
    if (typeof l.strike !== "number") l.strike = parseFloat(String(l.strike ?? 0)) || 0;
    if (!l.expiry) l.expiry = new Date().toISOString().split("T")[0];
    if (typeof l.premium !== "number") l.premium = parseFloat(String(l.premium ?? 0)) || 0;
    if (typeof l.quantity !== "number") l.quantity = parseInt(String(l.quantity ?? 1)) || 1;
    return l;
  });

  // Ensure exit_plan with defaults
  if (!obj.exit_plan || typeof obj.exit_plan !== "object") {
    obj.exit_plan = {
      profit_target_pct: 50,
      stop_loss_pct: 30,
      time_exit_days: 30,
    };
  }
  const ep = obj.exit_plan as Record<string, unknown>;
  if (typeof ep.profit_target_pct !== "number") ep.profit_target_pct = parseFloat(String(ep.profit_target_pct ?? ep.profit_target ?? 50)) || 50;
  if (typeof ep.stop_loss_pct !== "number") ep.stop_loss_pct = parseFloat(String(ep.stop_loss_pct ?? ep.stop_loss ?? 30)) || 30;
  if (typeof ep.time_exit_days !== "number") ep.time_exit_days = parseInt(String(ep.time_exit_days ?? ep.time_exit ?? 30)) || 30;

  // Ensure risk_notes array
  if (!Array.isArray(obj.risk_notes)) {
    obj.risk_notes = Array.isArray(obj.risks) ? obj.risks : [];
  }

  // Ensure educational_summary
  if (!obj.educational_summary) {
    obj.educational_summary = obj.educational_note ?? obj.summary ?? "Trade evaluation completed.";
  }

  return obj;
}

// --- Generic retry helper (OpenRouter / OpenAI-compatible) ---

async function callLLMWithRetry<T>(
  systemInstruction: string,
  userPrompt: string,
  _responseSchema: object,
  zodSchema: { parse: (data: unknown) => T },
  options: {
    callType?: string;
    temperature?: number;
    maxOutputTokens?: number;
    maxRetries?: number;
    normalizer?: (parsed: unknown) => unknown;
  } = {},
): Promise<T> {
  const {
    callType = "unknown",
    temperature = 0.1,
    maxOutputTokens = 8192,
    maxRetries = 3,
  } = options;

  const openai = getClient();
  const model = getModel();

  // Inject the expected JSON schema into the system prompt so the model
  // knows exactly what fields to produce (critical for OpenRouter / OpenAI-compatible
  // APIs that only support response_format: json_object without schema enforcement).
  const schemaGuidance = `\n\nYou MUST respond with a single JSON object matching this exact schema (no markdown, no commentary, no extra keys):\n${JSON.stringify(_responseSchema, null, 2)}`;
  const fullSystemInstruction = systemInstruction + schemaGuidance;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let rawText = "";
    try {
      // Use a generous token limit to avoid reasoning tokens filling the budget.
      // Qwen 3.5 generates thinking tokens by default; if reasoning: { effort: "none" }
      // isn't honored by all providers, the thinking can consume the entire limit.
      const result = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system" as const, content: fullSystemInstruction },
          { role: "user" as const, content: userPrompt },
        ],
        response_format: { type: "json_object" as const },
        temperature,
        max_tokens: Math.max(maxOutputTokens, 16384),
        reasoning: { effort: "none" },
      } as OpenAI.ChatCompletionCreateParamsNonStreaming);

      rawText = result.choices[0]?.message?.content ?? "";

      // Detect garbage output from reasoning overflow (all ! or starts valid then degrades)
      const exclamCount = (rawText.match(/!/g) || []).length;
      if (rawText.length > 50 && exclamCount / rawText.length > 0.5) {
        throw new Error("Reasoning overflow detected — response is mostly garbage tokens, retrying");
      }

      // Token usage from response metadata
      const outputTokens = result.usage?.completion_tokens ?? Math.round(rawText.length / 4);
      const totalTokens = result.usage?.total_tokens ?? 0;
      const usagePct = Math.round((outputTokens / maxOutputTokens) * 100);

      console.log(
        `[LLM] ${callType} response: ${outputTokens} tokens out, ${totalTokens} total (model: ${model})`,
      );
      if (usagePct > 80) {
        console.warn(
          `[LLM] ⚠️ ${callType} response used ${usagePct}% of token limit — consider increasing maxOutputTokens`,
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

      let parsed = JSON.parse(extractJson(rawText));
      if (options.normalizer) {
        parsed = options.normalizer(parsed);
      }
      return zodSchema.parse(parsed);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[LLM] ${callType} attempt ${attempt + 1}/${maxRetries} failed:`,
        errMsg.slice(0, 500),
      );
      if (rawText) {
        console.error(`[LLM] Raw response preview: ${rawText.slice(0, 400)}`);
      }
      if (attempt === maxRetries - 1) throw error;
      // Exponential backoff: 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw new Error(`LLM ${callType} call failed after retries`);
}

// ============================================================
// Story 1.4 — News Classifier
// ============================================================

const MAX_ARTICLES_PER_BATCH = 20;

const CLASSIFY_CONCURRENCY = 3;

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
    `[LLM] Classifying ${articles.length} articles in ${batches.length} batch(es), concurrency=${CLASSIFY_CONCURRENCY}`,
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
        return callLLMWithRetry(
          NEWS_CLASSIFIER_SYSTEM_INSTRUCTION,
          prompt,
          NEWS_CLASSIFIER_RESPONSE_SCHEMA,
          newsClassificationSchema,
          { callType: "classifyNews", temperature: 0.1, maxOutputTokens: 8192, normalizer: normalizeNewsClassification },
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
    { callType: "crossReference", temperature: 0.2, maxOutputTokens: 16384, normalizer: normalizeCrossReference },
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
      normalizer: (parsed) => normalizeRecommendation(parsed, ticker),
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

export async function generateDeepDive(
  input: DeepDiveInput,
): Promise<DeepDiveAnalysis> {
  const { ticker } = input;
  console.log(`[LLM] Generating deep dive for ${ticker}`);

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
    optionsAnalytics: input.optionsAnalytics,
  });

  const result = await callLLMWithRetry(
    DEEP_DIVE_SYSTEM_INSTRUCTION,
    prompt,
    DEEP_DIVE_RESPONSE_SCHEMA,
    deepDiveAnalysisSchema,
    { callType: "deepDive", temperature: 0.25, maxOutputTokens: 16384, normalizer: (p) => normalizeDeepDive(p, ticker) },
  );

  console.log(
    `[LLM] Deep dive for ${ticker}: risk=${result.risk_assessment.overall_risk}, ` +
      `patterns=${result.technical_patterns.length}, S/R=${result.support_resistance.length}`,
  );

  return result;
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
    { callType: "simTradeEval", temperature: 0.2, maxOutputTokens: 4096, normalizer: normalizeSimTradeEval },
  );

  console.log(
    `[LLM] Sim eval for ${input.ticker}: ${result.should_enter ? "ENTER" : "SKIP"} ` +
      `(size: $${result.position_size_dollars}, strategy: ${result.adjusted_entry.strategy_name})`,
  );

  return result;
}
