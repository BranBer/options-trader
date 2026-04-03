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
`);

export const db = drizzle(sqlite, { schema });
export { sqlite };
