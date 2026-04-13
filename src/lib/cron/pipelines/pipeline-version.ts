// Deep dive pipeline version — bump when the deep dive feature set changes.
// Deep dives with an older version are treated as stale by both the staleness
// check and the 4-hour dedup, so they get regenerated on the next scheduled run.
//
// Extracted to its own module to avoid heavy cross-imports (e.g. event-ticker-analyzer
// importing the full analysis-pipeline just for this constant).
export const DEEP_DIVE_PIPELINE_VERSION = 3; // v3 = fix dailyPatterns sourcing (1D candles, not 1H)
