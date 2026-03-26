import { z } from "zod";

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

export type CrossReferenceAnalysis = z.infer<typeof crossReferenceAnalysisSchema>;

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
    catalyst_date: z.string().nullable(),
    days_to_catalyst: z.number().int().nullable(),
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

// --- DB row type ---
export interface AnalysisRow {
  id: number;
  type: string | null;
  inputRefs: string | null; // JSON
  output: string | null; // JSON
  confidence: number | null;
  createdAt: string | null;
}
