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
`);

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

export const db = drizzle(sqlite, { schema });
export { sqlite };
