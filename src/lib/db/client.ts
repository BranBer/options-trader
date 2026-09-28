import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import * as schema from "./schema";

const DB_PATH = path.join(process.cwd(), "data", "dashboard.db");

// Ensure the data directory exists
import fs from "fs";
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS pipeline_runs (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    trigger text NOT NULL DEFAULT 'manual',
    status text NOT NULL DEFAULT 'running',
    started_at text NOT NULL,
    completed_at text,
    stages text,
    error_message text,
    created_at text DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_pipeline_runs_completed ON pipeline_runs (completed_at);
  CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON pipeline_runs (status);
  CREATE TABLE IF NOT EXISTS policy_shadow_decisions (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    source_analysis_id integer,
    source_whale_id integer,
    ticker text NOT NULL,
    model_name text NOT NULL,
    model_version text NOT NULL,
    deployment_mode text NOT NULL DEFAULT 'shadow',
    recommended_action text NOT NULL,
    score real NOT NULL,
    confidence real NOT NULL,
    expected_value real,
    reason_summary text,
    drivers text,
    current_decision text NOT NULL,
    agreed_with_current integer NOT NULL DEFAULT 0,
    created_at text DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_policy_shadow_created ON policy_shadow_decisions (created_at);
  CREATE INDEX IF NOT EXISTS idx_policy_shadow_analysis ON policy_shadow_decisions (source_analysis_id);
  CREATE TABLE IF NOT EXISTS policy_shadow_feedback (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    shadow_decision_id integer NOT NULL,
    verdict text NOT NULL,
    notes text,
    created_at text DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_policy_shadow_feedback_decision ON policy_shadow_feedback (shadow_decision_id);
  CREATE TABLE IF NOT EXISTS short_interest (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    ticker text NOT NULL UNIQUE,
    shares_short real,
    short_ratio real,
    short_percent_of_float real,
    squeeze_pressure text NOT NULL,
    date_short_interest text,
    fetched_at text NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_short_interest_ticker ON short_interest (ticker);
  CREATE TABLE IF NOT EXISTS market_pulse_subscriptions (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    ticker text NOT NULL,
    added_at text NOT NULL,
    is_active integer NOT NULL DEFAULT 1,
    created_at text DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_market_pulse_subscriptions_ticker ON market_pulse_subscriptions (ticker);
  CREATE INDEX IF NOT EXISTS idx_market_pulse_subscriptions_active_added ON market_pulse_subscriptions (is_active, added_at);
  CREATE TABLE IF NOT EXISTS market_pulse_runs (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    run_id text NOT NULL,
    ticker text NOT NULL,
    status text NOT NULL DEFAULT 'running',
    trigger text NOT NULL DEFAULT 'manual',
    candle_window text NOT NULL,
    llm_tokens_used integer,
    duration_ms integer,
    stages text,
    started_at text NOT NULL,
    completed_at text,
    error_message text,
    created_at text DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_market_pulse_runs_run_id ON market_pulse_runs (run_id);
  CREATE INDEX IF NOT EXISTS idx_market_pulse_runs_ticker_created ON market_pulse_runs (ticker, created_at);
  CREATE TABLE IF NOT EXISTS market_pulse_classifications (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    run_id text NOT NULL,
    ticker text NOT NULL,
    candle_time text NOT NULL,
    candle_data text NOT NULL,
    indicators text NOT NULL,
    classification text NOT NULL,
    event_blurb text NOT NULL,
    significance text NOT NULL,
    tradability text NOT NULL,
    level text NOT NULL DEFAULT 'candle',
    created_at text DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_market_pulse_classifications_run ON market_pulse_classifications (run_id);
  CREATE INDEX IF NOT EXISTS idx_market_pulse_classifications_ticker_time ON market_pulse_classifications (ticker, candle_time);
  CREATE TABLE IF NOT EXISTS market_pulse_correlations (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    run_id text NOT NULL,
    ticker text NOT NULL,
    price_event text NOT NULL,
    candle_time text NOT NULL,
    external_event_type text NOT NULL,
    external_event_id integer,
    external_event_summary text NOT NULL,
    sentiment text NOT NULL,
    correlation_confidence real NOT NULL,
    external_event_payload text,
    reasoning text,
    created_at text DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_market_pulse_correlations_run ON market_pulse_correlations (run_id);
  CREATE INDEX IF NOT EXISTS idx_market_pulse_correlations_ticker_created ON market_pulse_correlations (ticker, created_at);
  CREATE TABLE IF NOT EXISTS market_pulse_narratives (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    run_id text NOT NULL,
    ticker text NOT NULL,
    current_control text NOT NULL,
    control_strength integer NOT NULL,
    market_phase text NOT NULL,
    expected_behavior text NOT NULL,
    narrative_summary text NOT NULL,
    key_conflicts text,
    confidence_in_assessment real,
    structured_output text,
    input_event_count integer NOT NULL,
    prior_run_id text,
    created_at text DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_market_pulse_narratives_run_ticker ON market_pulse_narratives (run_id, ticker);
  CREATE INDEX IF NOT EXISTS idx_market_pulse_narratives_ticker_created ON market_pulse_narratives (ticker, created_at);
  CREATE TABLE IF NOT EXISTS jev_judgments (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP,
    context_type text NOT NULL,
    context_ref text NOT NULL,
    ticker text NOT NULL,
    question_id text NOT NULL,
    question_type text NOT NULL,
    model text NOT NULL,
    answer text NOT NULL,
    state_hash text NOT NULL,
    horizon_days integer,
    outcome text,
    scored_at text
  );
  CREATE INDEX IF NOT EXISTS idx_jev_judgments_context_created ON jev_judgments (context_type, created_at);
  CREATE INDEX IF NOT EXISTS idx_jev_judgments_ticker_created ON jev_judgments (ticker, created_at);
  CREATE TABLE IF NOT EXISTS paper_trades (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    strategy text NOT NULL,
    ticker text NOT NULL,
    status text NOT NULL DEFAULT 'open',
    entry_date text NOT NULL,
    planned_exit text NOT NULL,
    exit_date text,
    exit_reason text,
    legs text NOT NULL,
    entry_value real NOT NULL,
    risk real NOT NULL,
    mark_value real,
    pnl real,
    ret real,
    context text NOT NULL DEFAULT '{}',
    created_at text DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_paper_trades_status ON paper_trades (status);
  CREATE INDEX IF NOT EXISTS idx_paper_trades_strategy ON paper_trades (strategy);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_trades_dedupe ON paper_trades (strategy, ticker, entry_date);
  CREATE TABLE IF NOT EXISTS desk_runs (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    started_at text NOT NULL,
    completed_at text,
    opened integer NOT NULL DEFAULT 0,
    marked integer NOT NULL DEFAULT 0,
    closed integer NOT NULL DEFAULT 0,
    errors text NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS hype_snapshots (
    id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    date text NOT NULL,
    ticker text NOT NULL,
    rank integer NOT NULL,
    mentions integer NOT NULL,
    mentions_24h_ago integer,
    rank_24h_ago integer,
    upvotes integer
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_hype_snapshots_date_ticker ON hype_snapshots (date, ticker);
`);

const newsEventColumns = sqlite
  .prepare("PRAGMA table_info(news_events)")
  .all() as Array<{ name: string }>;

if (newsEventColumns.some((column) => column.name === "category")) {
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_news_events_category_impact_created ON news_events (category, impact_score, created_at);",
  );
} else if (newsEventColumns.length > 0) {
  sqlite.exec(`
    ALTER TABLE news_events ADD COLUMN category text NOT NULL DEFAULT 'general';
    CREATE INDEX IF NOT EXISTS idx_news_events_category_impact_created ON news_events (category, impact_score, created_at);
  `);
}

const analysisColumns = sqlite
  .prepare("PRAGMA table_info(analyses)")
  .all() as Array<{ name: string }>;

if (analysisColumns.some((column) => column.name === "source")) {
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_analyses_source_created ON analyses (source, created_at);",
  );
} else if (analysisColumns.length > 0) {
  sqlite.exec(`
    ALTER TABLE analyses ADD COLUMN source text;
    CREATE INDEX IF NOT EXISTS idx_analyses_source_created ON analyses (source, created_at);
  `);
}

const marketPulseCorrelationColumns = sqlite
  .prepare("PRAGMA table_info(market_pulse_correlations)")
  .all() as Array<{ name: string }>;

const marketPulseRunColumns = sqlite
  .prepare("PRAGMA table_info(market_pulse_runs)")
  .all() as Array<{ name: string }>;

if (
  marketPulseRunColumns.length > 0 &&
  !marketPulseRunColumns.some((column) => column.name === "stages")
) {
  sqlite.exec("ALTER TABLE market_pulse_runs ADD COLUMN stages text;");
}

if (
  marketPulseCorrelationColumns.length > 0 &&
  !marketPulseCorrelationColumns.some(
    (column) => column.name === "external_event_payload",
  )
) {
  sqlite.exec(
    "ALTER TABLE market_pulse_correlations ADD COLUMN external_event_payload text;",
  );
}

if (
  marketPulseCorrelationColumns.length > 0 &&
  !marketPulseCorrelationColumns.some((column) => column.name === "reasoning")
) {
  sqlite.exec(
    "ALTER TABLE market_pulse_correlations ADD COLUMN reasoning text;",
  );
}

const marketPulseNarrativeColumns = sqlite
  .prepare("PRAGMA table_info(market_pulse_narratives)")
  .all() as Array<{ name: string }>;

if (
  marketPulseNarrativeColumns.length > 0 &&
  !marketPulseNarrativeColumns.some((column) => column.name === "key_conflicts")
) {
  sqlite.exec(
    "ALTER TABLE market_pulse_narratives ADD COLUMN key_conflicts text;",
  );
}

if (
  marketPulseNarrativeColumns.length > 0 &&
  !marketPulseNarrativeColumns.some(
    (column) => column.name === "confidence_in_assessment",
  )
) {
  sqlite.exec(
    "ALTER TABLE market_pulse_narratives ADD COLUMN confidence_in_assessment real;",
  );
}

if (
  marketPulseNarrativeColumns.length > 0 &&
  !marketPulseNarrativeColumns.some(
    (column) => column.name === "structured_output",
  )
) {
  sqlite.exec(
    "ALTER TABLE market_pulse_narratives ADD COLUMN structured_output text;",
  );
}

export const db = drizzle(sqlite, { schema });
export { sqlite };

// Epic 51 Sprint 1 — add short_volume_pct / short_volume_date to short_interest
const shortInterestColumns = sqlite
  .prepare("PRAGMA table_info(short_interest)")
  .all() as Array<{ name: string }>;

if (
  shortInterestColumns.length > 0 &&
  !shortInterestColumns.some((col) => col.name === "short_volume_pct")
) {
  sqlite.exec(
    "ALTER TABLE short_interest ADD COLUMN short_volume_pct real;",
  );
}

if (
  shortInterestColumns.length > 0 &&
  !shortInterestColumns.some((col) => col.name === "short_volume_date")
) {
  sqlite.exec(
    "ALTER TABLE short_interest ADD COLUMN short_volume_date text;",
  );
}

// Epic 51 Sprint 1 — add avg_volume to market_snapshots
const marketSnapshotColumns = sqlite
  .prepare("PRAGMA table_info(market_snapshots)")
  .all() as Array<{ name: string }>;

if (
  marketSnapshotColumns.length > 0 &&
  !marketSnapshotColumns.some((col) => col.name === "avg_volume")
) {
  sqlite.exec("ALTER TABLE market_snapshots ADD COLUMN avg_volume integer;");
}

// Epic 51 Sprint 2 — short_volume_history table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS short_volume_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    date TEXT NOT NULL,
    short_volume_pct REAL NOT NULL,
    fetched_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ticker, date)
  );
  CREATE INDEX IF NOT EXISTS idx_short_volume_history_ticker
    ON short_volume_history (ticker);
`);
