import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const newsEvents = sqliteTable(
  "news_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    headline: text("headline").notNull(),
    source: text("source"),
    url: text("url"),
    publishedAt: text("published_at"),
    countryCode: text("country_code"),
    lat: real("lat"),
    lng: real("lng"),
    impactScore: integer("impact_score"),
    sentiment: text("sentiment"), // 'bullish' | 'bearish' | 'neutral'
    sectors: text("sectors"), // JSON array
    tickers: text("tickers"), // JSON array
    eventType: text("event_type"),
    rawSummary: text("raw_summary"),
    geminiAnalysis: text("gemini_analysis"), // full LLM output JSON
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_news_events_url").on(table.url)],
);

export const whaleAlerts = sqliteTable(
  "whale_alerts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    strike: real("strike"),
    expiry: text("expiry"),
    callPut: text("call_put"), // 'C' | 'P'
    premium: real("premium"),
    volume: integer("volume"),
    openInterest: integer("open_interest"),
    underlyingPrice: real("underlying_price"),
    sentiment: text("sentiment"), // 'bullish' | 'bearish'
    source: text("source"),
    detectedAt: text("detected_at"),
    qualityScore: integer("quality_score"),
    // Epic 21 — Greeks & sentiment inference fields
    delta: real("delta"),
    gamma: real("gamma"),
    theta: real("theta"),
    vega: real("vega"),
    impliedVolatility: real("implied_volatility"),
    breakEvenPrice: real("break_even_price"),
    inferredSentiment: text("inferred_sentiment"), // 'strongly_bullish' | 'bullish' | 'neutral' | 'bearish' | 'strongly_bearish'
    sentimentConfidence: text("sentiment_confidence"), // 'high' | 'medium' | 'low'
    intentHint: text("intent_hint"), // 'speculative' | 'institutional' | 'hedge' | 'unknown'
    // Dedup: date-only key derived from detectedAt, set by pipeline
    dedupDate: text("dedup_date"), // 'YYYY-MM-DD' for composite unique constraint
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_whale_dedup").on(
      table.ticker,
      table.strike,
      table.expiry,
      table.callPut,
      table.dedupDate,
    ),
  ],
);

export const marketSnapshots = sqliteTable("market_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  price: real("price"),
  volume: integer("volume"),
  iv: real("iv"),
  ivRank: real("iv_rank"),
  dayChangePct: real("day_change_pct"),
  realizedVol: real("realized_vol"),
  ivRvSpread: real("iv_rv_spread"),
  ivPercentileMethod: text("iv_percentile_method"),
  capturedAt: text("captured_at").default(sql`CURRENT_TIMESTAMP`),
});

export const analyses = sqliteTable(
  "analyses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type"), // 'news_classification' | 'cross_reference' | 'trade_recommendation'
    inputRefs: text("input_refs"), // JSON: references to news_event ids, whale_alert ids
    output: text("output"), // full LLM structured JSON
    confidence: real("confidence"),
    confidenceBreakdown: text("confidence_breakdown"), // JSON CompositeConfidenceBreakdown
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_analyses_type_created").on(table.type, table.createdAt),
  ],
);

// ============================================================
// Epic 12 — Simulated Portfolio Tables
// ============================================================

import { DEFAULT_SIM_PORTFOLIO_BALANCE } from "@/lib/constants/portfolio";

export const simTrades = sqliteTable("sim_trades", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  optionSymbol: text("option_symbol"),
  strategyName: text("strategy_name").notNull(),
  direction: text("direction").notNull(), // 'bullish' | 'bearish' | 'neutral'
  legs: text("legs").notNull(), // JSON array of strategy legs
  entryPrice: real("entry_price").notNull(), // net premium paid/received
  entryDate: text("entry_date").notNull(),
  exitPrice: real("exit_price"),
  exitDate: text("exit_date"),
  quantity: integer("quantity").notNull().default(1),
  pnl: real("pnl"),
  pnlPct: real("pnl_pct"),
  status: text("status").notNull().default("open"), // 'open' | 'closed' | 'expired'
  exitReason: text("exit_reason"), // 'profit_target' | 'stop_loss' | 'time_exit' | 'expiry'
  geminiReasoning: text("gemini_reasoning"), // JSON TradeDecision
  profitTargetPct: real("profit_target_pct"),
  stopLossPct: real("stop_loss_pct"),
  timeExitDays: integer("time_exit_days"),
  sourceAnalysisId: integer("source_analysis_id"),
  sourceWhaleId: integer("source_whale_id"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const simPortfolio = sqliteTable("sim_portfolio", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  balance: real("balance").notNull().default(DEFAULT_SIM_PORTFOLIO_BALANCE),
  startingBalance: real("starting_balance")
    .notNull()
    .default(DEFAULT_SIM_PORTFOLIO_BALANCE),
  totalPnl: real("total_pnl").notNull().default(0),
  totalTrades: integer("total_trades").notNull().default(0),
  winningTrades: integer("winning_trades").notNull().default(0),
  losingTrades: integer("losing_trades").notNull().default(0),
  maxDrawdown: real("max_drawdown").notNull().default(0),
  bestTradePnl: real("best_trade_pnl").notNull().default(0),
  worstTradePnl: real("worst_trade_pnl").notNull().default(0),
  lastUpdated: text("last_updated").default(sql`CURRENT_TIMESTAMP`),
});

export const simPortfolioSnapshots = sqliteTable("sim_portfolio_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  balance: real("balance").notNull(),
  totalPnl: real("total_pnl").notNull(),
  openPositions: integer("open_positions").notNull().default(0),
  snapshotDate: text("snapshot_date").notNull(),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================
// Epic 20 — Gemini Decision Audit Trail (Story 20.4)
// ============================================================

export const simEvaluations = sqliteTable(
  "sim_evaluations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    shouldEnter: integer("should_enter", { mode: "boolean" }).notNull(),
    reasoning: text("reasoning"),
    strategyName: text("strategy_name"),
    legs: text("legs"), // JSON array of SimLeg
    positionSize: real("position_size"),
    netPremium: real("net_premium"),
    confidence: real("confidence"), // composite confidence from analysis
    whaleQualityScore: integer("whale_quality_score"),
    currentPrice: real("current_price"),
    portfolioBalance: real("portfolio_balance"),
    sourceAnalysisId: integer("source_analysis_id"),
    rejectionGate: text("rejection_gate"), // which gate rejected: 'iv_environment' | 'earnings_proximity' | 'concentration' | 'validation' | null
    rejectionReason: text("rejection_reason"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_sim_evaluations_ticker").on(table.ticker),
    index("idx_sim_evaluations_should_enter").on(table.shouldEnter),
  ],
);
