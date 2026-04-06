import { z } from "zod";
import { ANALYSIS_TIMEFRAMES } from "@/lib/utils/chart-timeframes";
import type { MarketSnapshot, OptionsChainSummary } from "@/types/market";
import type { WhaleAlertRow } from "@/types/whale";

// --- Cross-Reference Correlation ---
export const correlationSchema = z.object({
  whale_trade: z.object({
    ticker: z.string(),
    strike: z.number(),
    expiry: z.string(),
    type: z.enum(["call", "put"]),
    premium: z.number(),
    volume: z.number().int(),
  }),
  related_event: z.object({
    headline: z.string(),
    impact_score: z.number().int(),
    event_type: z.string(),
  }),
  correlation_confidence: z.number().min(0).max(1),
  alignment: z.enum(["confirming", "contrarian", "hedging"]),
  thesis: z.string(),
  smart_money_signal: z.enum([
    "strong_bullish",
    "bullish",
    "neutral",
    "bearish",
    "strong_bearish",
  ]),
});

export type Correlation = z.infer<typeof correlationSchema>;

export const uncorrelatedWhaleSchema = z.object({
  ticker: z.string(),
  type: z.enum(["call", "put"]),
  premium: z.number(),
  note: z.string(),
});

// --- Full Cross-Reference Analysis Response ---
export const crossReferenceAnalysisSchema = z.object({
  correlations: z.array(correlationSchema),
  uncorrelated_whales: z.array(uncorrelatedWhaleSchema),
  summary: z.string(),
  analysis_metadata: z.object({
    news_events_analyzed: z.number().int(),
    whale_trades_analyzed: z.number().int(),
    correlations_found: z.number().int(),
    timestamp: z.string(),
  }),
});

export type CrossReferenceAnalysis = z.infer<
  typeof crossReferenceAnalysisSchema
>;

// --- Trade Recommendation Strategy Leg ---
export const strategyLegSchema = z.object({
  action: z.enum(["buy", "sell"]),
  type: z.enum(["call", "put"]),
  strike: z.number(),
  expiry: z.string(),
  estimated_premium: z.number(),
});

// --- Full Trade Recommendation Response ---
export const tradeRecommendationSchema = z.object({
  ticker: z.string(),
  thesis: z.string(),
  direction: z.enum(["bullish", "bearish", "neutral"]),
  confidence: z.number().min(0).max(1),
  primary_strategy: z.object({
    name: z.string(),
    legs: z.array(strategyLegSchema),
    max_profit: z.string(),
    max_loss: z.string(),
    breakeven: z.string(),
    risk_reward_ratio: z.string(),
  }),
  market_context: z.object({
    iv_assessment: z.enum(["elevated", "normal", "depressed"]),
    iv_strategy_note: z.string(),
    volume_assessment: z.enum([
      "unusual_high",
      "above_average",
      "normal",
      "low",
    ]),
    catalyst_date: z.string().nullable().optional(),
    days_to_catalyst: z.number().int().nullable().optional(),
  }),
  risk_factors: z.array(z.string()),
  whale_alignment: z.object({
    matches_whale: z.boolean(),
    whale_position_size: z.string(),
    similarity_note: z.string(),
  }),
  disclaimer: z.string(),
});

export type TradeRecommendation = z.infer<typeof tradeRecommendationSchema>;

export const analysisTimeframeEnum = z.enum(ANALYSIS_TIMEFRAMES);
export type AnalysisTimeframe = z.infer<typeof analysisTimeframeEnum>;

// --- Deep Dive Technical Pattern ---
export const technicalPatternSchema = z.object({
  name: z.string(),
  type: z.enum(["bullish", "bearish", "neutral"]),
  description: z.string(),
  confidence: z.number().min(0).max(1),
  timeframe: analysisTimeframeEnum.nullable().optional(),
  price_target: z.number().nullable().optional(),
  // Chart overlay coordinates (nullable for backward compat with existing data)
  drawing_type: z
    .enum(["trendline", "channel", "spike_region", "marker", "none"])
    .nullable()
    .optional(),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  start_price: z.number().nullable().optional(),
  end_price: z.number().nullable().optional(),
  // For channels: secondary boundary prices
  secondary_start_price: z.number().nullable().optional(),
  secondary_end_price: z.number().nullable().optional(),
});

export type TechnicalPattern = z.infer<typeof technicalPatternSchema>;

// --- Support/Resistance Levels ---
export const supportResistanceSchema = z.object({
  level: z.number(),
  type: z.enum(["support", "resistance"]),
  strength: z.enum(["weak", "moderate", "strong"]),
  note: z.string(),
});

export type SupportResistance = z.infer<typeof supportResistanceSchema>;

// --- Indicator Analysis ---
export const indicatorAnalysisSchema = z.object({
  name: z.string(),
  value: z.string(),
  signal: z.enum(["bullish", "bearish", "neutral"]),
  explanation: z.string(),
});

export type IndicatorAnalysis = z.infer<typeof indicatorAnalysisSchema>;

// --- Entry/Exit Strategy ---
export const entryExitStrategySchema = z.object({
  recommended_option_type: z.string(),
  entry_price_range: z.object({
    low: z.number(),
    high: z.number(),
  }),
  strike_selection: z.string(),
  expiry_guidance: z.string(),
  profit_target: z.string(),
  stop_loss: z.string(),
  position_sizing: z.string(),
  rationale: z.string(),
});

export type EntryExitStrategy = z.infer<typeof entryExitStrategySchema>;

export const timeframePatternMapSchema = z.object({
  "1W": z.array(technicalPatternSchema),
  "1M": z.array(technicalPatternSchema),
  "3M": z.array(technicalPatternSchema),
  "6M": z.array(technicalPatternSchema),
  "1Y": z.array(technicalPatternSchema),
});
export type TimeframePatternMap = z.infer<typeof timeframePatternMapSchema>;

// --- Full Deep Dive Analysis ---
export const deepDiveAnalysisSchema = z.object({
  ticker: z.string(),
  whale_trade_summary: z.string(),
  market_narrative: z.string(),
  technical_patterns: z.array(technicalPatternSchema),
  timeframe_patterns: timeframePatternMapSchema.optional(),
  support_resistance: z.array(supportResistanceSchema),
  indicators: z.array(indicatorAnalysisSchema),
  options_context: z.object({
    iv_percentile: z.string(),
    iv_interpretation: z.string(),
    put_call_ratio: z.string(),
    unusual_activity_note: z.string(),
    greeks_summary: z.string(),
    greeks_breakdown: z
      .array(
        z.object({
          greek: z.enum(["delta", "gamma", "theta", "vega", "rho"]),
          value: z.string(),
          plain_english: z.string(),
          implication: z.enum(["favorable", "neutral", "unfavorable"]),
        }),
      )
      .optional(),
    max_pain: z.number().nullable().optional(),
    oi_walls: z
      .object({
        call_walls: z.array(z.object({ strike: z.number(), oi: z.number() })),
        put_walls: z.array(z.object({ strike: z.number(), oi: z.number() })),
      })
      .nullable()
      .optional(),
    gex_summary: z
      .object({
        net_gex: z.number(),
        dealer_positioning: z.enum(["long_gamma", "short_gamma", "neutral"]),
        gex_flip_level: z.number().nullable().optional(),
        interpretation: z.string().optional(),
      })
      .nullable()
      .optional(),
    iv_rv_spread: z.number().nullable().optional(),
    iv_rv_interpretation: z.string().nullable().optional(),
  }),
  entry_exit: entryExitStrategySchema,
  global_events_connection: z.string(),
  risk_assessment: z.object({
    overall_risk: z.enum(["low", "moderate", "high", "very_high"]),
    key_risks: z.array(z.string()),
    max_recommended_allocation: z.string(),
  }),
  educational_notes: z.array(
    z.object({
      term: z.string(),
      explanation: z.string(),
    }),
  ),
  disclaimer: z.string(),
});

export type DeepDiveAnalysis = z.infer<typeof deepDiveAnalysisSchema>;

// --- Composite Confidence Breakdown ---
export type {
  CompositeConfidenceBreakdown,
  ConfidenceFactor,
} from "@/lib/utils/composite-confidence";

// --- DB row type ---
export interface AnalysisRow {
  id: number;
  type: string | null;
  source: string | null;
  inputRefs: string | null; // JSON
  output: string | null; // JSON
  confidence: number | null;
  confidenceBreakdown: string | null; // JSON CompositeConfidenceBreakdown
  createdAt: string | null;
}

export interface EventTickerAnalysisEventContext {
  headline: string;
  summary?: string;
  sentiment: "bullish" | "bearish" | "neutral";
  impactScore: number;
  eventType?: string;
  sectors?: string[];
}

export interface EventTickerWhaleMatch {
  hasWhaleActivity: boolean;
  alerts: WhaleAlertRow[];
  bestQualityScore: number | null;
}

export interface EventTickerAnalysis {
  ticker: string;
  eventId: number;
  eventContext: EventTickerAnalysisEventContext;
  marketSnapshot: (MarketSnapshot & { marketOpen: boolean }) | null;
  optionsSummary: OptionsChainSummary | null;
  deepDive: DeepDiveAnalysis;
  recommendation: TradeRecommendation;
  whaleMatch: EventTickerWhaleMatch;
  source: "event_ticker";
  createdAt?: string | null;
}

export interface EventTickerAnalysisSummary {
  eventId: number;
  headline: string;
  tickers: string[];
  createdAt: string | null;
}
