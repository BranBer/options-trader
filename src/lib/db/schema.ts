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
    source: text("source"), // 'whale_pipeline' | 'event_ticker'
    inputRefs: text("input_refs"), // JSON: references to news_event ids, whale_alert ids
    output: text("output"), // full LLM structured JSON
    confidence: real("confidence"),
    confidenceBreakdown: text("confidence_breakdown"), // JSON CompositeConfidenceBreakdown
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_analyses_type_created").on(table.type, table.createdAt),
    index("idx_analyses_source_created").on(table.source, table.createdAt),
  ],
);

export const pipelineRuns = sqliteTable(
  "pipeline_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    trigger: text("trigger").notNull().default("manual"),
    status: text("status").notNull().default("running"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    stages: text("stages"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_pipeline_runs_completed").on(table.completedAt),
    index("idx_pipeline_runs_status").on(table.status),
  ],
);
