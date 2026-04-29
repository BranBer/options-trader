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
    category: text("category").notNull().default("general"),
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
  (table) => [
    index("idx_news_events_url").on(table.url),
    index("idx_news_events_category_impact_created").on(
      table.category,
      table.impactScore,
      table.createdAt,
    ),
  ],
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
  avgVolume: integer("avg_volume"),
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

export const shortInterest = sqliteTable(
  "short_interest",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    sharesShort: real("shares_short"),
    shortRatio: real("short_ratio"), // days to cover
    shortPercentOfFloat: real("short_percent_of_float"), // 0-1
    squeezePressure: text("squeeze_pressure").notNull(), // 'extreme'|'high'|'moderate'|'low'
    dateShortInterest: text("date_short_interest"),
    fetchedAt: text("fetched_at").notNull(),
    // Epic 51 Sprint 1 — FINRA daily short volume (T+1 freshness signal)
    shortVolumePct: real("short_volume_pct"), // fraction of day's volume that was short (0-1)
    shortVolumeDate: text("short_volume_date"), // 'YYYY-MM-DD' of the FINRA reading
  },
  (table) => [uniqueIndex("idx_short_interest_ticker").on(table.ticker)],
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

export const marketPulseSubscriptions = sqliteTable(
  "market_pulse_subscriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    addedAt: text("added_at").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_market_pulse_subscriptions_ticker").on(table.ticker),
    index("idx_market_pulse_subscriptions_active_added").on(
      table.isActive,
      table.addedAt,
    ),
  ],
);

export const marketPulseRuns = sqliteTable(
  "market_pulse_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    ticker: text("ticker").notNull(),
    status: text("status").notNull().default("running"),
    trigger: text("trigger").notNull().default("manual"),
    candleWindow: text("candle_window").notNull(),
    llmTokensUsed: integer("llm_tokens_used"),
    durationMs: integer("duration_ms"),
    stages: text("stages"),
    /** Current pipeline stage name (candles | classification | correlation | narrative) */
    currentStage: text("current_stage"),
    /** 0–100 overall progress percentage */
    progressPct: integer("progress_pct").default(0),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_market_pulse_runs_run_id").on(table.runId),
    index("idx_market_pulse_runs_ticker_created").on(
      table.ticker,
      table.createdAt,
    ),
  ],
);

export const marketPulseClassifications = sqliteTable(
  "market_pulse_classifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    ticker: text("ticker").notNull(),
    candleTime: text("candle_time").notNull(),
    candleData: text("candle_data").notNull(),
    indicators: text("indicators").notNull(),
    classification: text("classification").notNull(),
    eventBlurb: text("event_blurb").notNull(),
    significance: text("significance").notNull(),
    tradability: text("tradability").notNull(),
    level: text("level").notNull().default("candle"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_market_pulse_classifications_run").on(table.runId),
    index("idx_market_pulse_classifications_ticker_time").on(
      table.ticker,
      table.candleTime,
    ),
  ],
);

export const marketPulseCorrelations = sqliteTable(
  "market_pulse_correlations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    ticker: text("ticker").notNull(),
    priceEvent: text("price_event").notNull(),
    candleTime: text("candle_time").notNull(),
    externalEventType: text("external_event_type").notNull(),
    externalEventId: integer("external_event_id"),
    externalEventSummary: text("external_event_summary").notNull(),
    externalEventPayload: text("external_event_payload"),
    sentiment: text("sentiment").notNull(),
    correlationConfidence: real("correlation_confidence").notNull(),
    reasoning: text("reasoning"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_market_pulse_correlations_run").on(table.runId),
    index("idx_market_pulse_correlations_ticker_created").on(
      table.ticker,
      table.createdAt,
    ),
  ],
);

export const marketPulseNarratives = sqliteTable(
  "market_pulse_narratives",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id").notNull(),
    ticker: text("ticker").notNull(),
    currentControl: text("current_control").notNull(),
    controlStrength: integer("control_strength").notNull(),
    marketPhase: text("market_phase").notNull(),
    expectedBehavior: text("expected_behavior").notNull(),
    narrativeSummary: text("narrative_summary").notNull(),
    keyConflicts: text("key_conflicts"),
    confidenceInAssessment: real("confidence_in_assessment"),
    structuredOutput: text("structured_output"),
    inputEventCount: integer("input_event_count").notNull(),
    priorRunId: text("prior_run_id"),
    createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_market_pulse_narratives_run_ticker").on(
      table.runId,
      table.ticker,
    ),
    index("idx_market_pulse_narratives_ticker_created").on(
      table.ticker,
      table.createdAt,
    ),
  ],
);

// Epic 51 Sprint 2 — FINRA short volume history
export const shortVolumeHistory = sqliteTable(
  "short_volume_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD
    shortVolumePct: real("short_volume_pct").notNull(),
    fetchedAt: text("fetched_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_short_volume_history_ticker_date").on(
      table.ticker,
      table.date,
    ),
    index("idx_short_volume_history_ticker").on(table.ticker),
  ],
);
