/**
 * Per-ticker progress store for Market Pulse runs.
 *
 * In-memory Map for fast sub-second polling, backed by DB columns
 * (current_stage, progress_pct) on market_pulse_runs so progress
 * survives server restarts.
 */

import { db } from "@/lib/db/client";
import { marketPulseRuns } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export type MarketPulseStageId =
  | "candles"
  | "classification"
  | "correlation"
  | "narrative";

export interface MarketPulseStageProgress {
  id: MarketPulseStageId;
  label: string;
  /** 0–1 fractional progress within this stage, or null if not yet started */
  progress: number | null;
  status: "pending" | "active" | "done" | "error";
}

export interface MarketPulseTickerProgress {
  ticker: string;
  runId: string;
  trigger: string;
  /** Overall 0–100 percent derived from stage weights */
  pct: number;
  stages: MarketPulseStageProgress[];
  startedAt: string;
  completedAt: string | null;
  /** true while the run is still in-flight */
  running: boolean;
}

// Stage weights must sum to 1
const STAGE_WEIGHTS: Record<MarketPulseStageId, number> = {
  candles: 0.05,
  classification: 0.6,
  correlation: 0.2,
  narrative: 0.15,
};

const STAGE_LABELS: Record<MarketPulseStageId, string> = {
  candles: "Fetching candles",
  classification: "Classifying candles",
  correlation: "Correlating catalysts",
  narrative: "Synthesizing narrative",
};

function computePct(stages: MarketPulseStageProgress[]): number {
  let total = 0;
  for (const stage of stages) {
    const weight = STAGE_WEIGHTS[stage.id];
    if (stage.status === "done") {
      total += weight;
    } else if (stage.status === "active" && stage.progress != null) {
      total += weight * stage.progress;
    }
  }
  return Math.round(Math.min(total, 1) * 100);
}

function makeStages(): MarketPulseStageProgress[] {
  return (
    ["candles", "classification", "correlation", "narrative"] as const
  ).map((id) => ({
    id,
    label: STAGE_LABELS[id],
    progress: null,
    status: "pending" as const,
  }));
}

type ProgressMap = Map<string, MarketPulseTickerProgress>;

const globalRef = globalThis as typeof globalThis & {
  __marketPulseProgress?: ProgressMap;
};

function getStore(): ProgressMap {
  if (!globalRef.__marketPulseProgress) {
    globalRef.__marketPulseProgress = new Map();
  }
  return globalRef.__marketPulseProgress;
}

export function initTickerProgress(
  ticker: string,
  runId: string,
  trigger: string,
): void {
  const stages = makeStages();
  getStore().set(ticker, {
    ticker,
    runId,
    trigger,
    pct: 0,
    stages,
    startedAt: new Date().toISOString(),
    completedAt: null,
    running: true,
  });
}

function mutate(
  ticker: string,
  fn: (entry: MarketPulseTickerProgress) => void,
): void {
  const store = getStore();
  const entry = store.get(ticker);
  if (!entry) return;
  fn(entry);
  entry.pct = computePct(entry.stages);
  store.set(ticker, entry);
  // Persist to DB — fire-and-forget to keep the hot path fast
  persistProgress(entry);
}

/** Write current_stage + progress_pct to the runs table (fire-and-forget). */
function persistProgress(entry: MarketPulseTickerProgress): void {
  const activeStage = entry.stages.find((s) => s.status === "active");
  const currentStage = activeStage?.id ?? null;
  db.update(marketPulseRuns)
    .set({ currentStage, progressPct: entry.pct })
    .where(
      and(
        eq(marketPulseRuns.runId, entry.runId),
        eq(marketPulseRuns.ticker, entry.ticker),
      ),
    )
    .catch(() => {
      /* best-effort — don't crash the pipeline */
    });
}

export function activateStage(
  ticker: string,
  stageId: MarketPulseStageId,
  progress = 0,
): void {
  mutate(ticker, (entry) => {
    for (const stage of entry.stages) {
      if (stage.id === stageId) {
        stage.status = "active";
        stage.progress = progress;
      }
    }
  });
}

export function updateStageProgress(
  ticker: string,
  stageId: MarketPulseStageId,
  progress: number,
): void {
  mutate(ticker, (entry) => {
    const stage = entry.stages.find((s) => s.id === stageId);
    if (stage && stage.status === "active") {
      stage.progress = Math.min(1, progress);
    }
  });
}

export function completeStage(
  ticker: string,
  stageId: MarketPulseStageId,
): void {
  mutate(ticker, (entry) => {
    const stage = entry.stages.find((s) => s.id === stageId);
    if (stage) {
      stage.status = "done";
      stage.progress = 1;
    }
  });
}

export function failStage(ticker: string, stageId: MarketPulseStageId): void {
  mutate(ticker, (entry) => {
    const stage = entry.stages.find((s) => s.id === stageId);
    if (stage) {
      stage.status = "error";
    }
  });
}

export function finishTickerProgress(ticker: string, failed = false): void {
  mutate(ticker, (entry) => {
    entry.running = false;
    entry.completedAt = new Date().toISOString();
    if (failed) {
      for (const stage of entry.stages) {
        if (stage.status === "active" || stage.status === "pending") {
          stage.status = "error";
        }
      }
    } else {
      // Ensure all stages are marked done
      for (const stage of entry.stages) {
        if (stage.status !== "error") {
          stage.status = "done";
          stage.progress = 1;
        }
      }
      entry.pct = 100;
    }
  });
}

export function getTickerProgress(
  ticker: string,
): MarketPulseTickerProgress | null {
  return getStore().get(ticker) ?? null;
}

export function getTickersProgress(
  tickers: string[],
): (MarketPulseTickerProgress | null)[] {
  return tickers.map((t) => getStore().get(t) ?? null);
}
