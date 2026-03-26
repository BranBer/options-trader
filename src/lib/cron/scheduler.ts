import cron from "node-cron";
import { runNewsPipeline } from "@/lib/cron/pipelines/news-pipeline";
import { runWhalePipeline } from "@/lib/cron/pipelines/whale-pipeline";
import { runAnalysisPipeline } from "@/lib/cron/pipelines/analysis-pipeline";

let lastRefreshAt: string | null = null;
let isRunning = false;

/**
 * Master pipeline — orchestrates all data ingestion + analysis.
 * Called every 30 minutes by cron and on-demand via /api/cron.
 */
export async function runPipeline(): Promise<{ status: string; timestamp: string }> {
  if (isRunning) {
    console.log("[Pipeline] Already running, skipping...");
    return { status: "skipped", timestamp: lastRefreshAt ?? "never" };
  }

  isRunning = true;
  const startTime = new Date();
  console.log(`[Pipeline] Starting cycle at ${startTime.toISOString()}`);

  try {
    // Phase 1: Data ingestion (parallel)
    const [newsCount, whaleCount] = await Promise.all([
      runNewsPipeline(),
      runWhalePipeline(),
    ]);
    console.log(`[Pipeline] Phase 1 complete: ${newsCount} news events, ${whaleCount} whale alerts stored`);

    // Phase 2: Analysis (sequential, depends on Phase 1)
    const analysisCount = await runAnalysisPipeline();
    console.log(`[Pipeline] Phase 2 complete: ${analysisCount} analyses stored`);

    lastRefreshAt = new Date().toISOString();
    const elapsed = Date.now() - startTime.getTime();
    console.log(`[Pipeline] Cycle complete in ${elapsed}ms`);

    return { status: "ok", timestamp: lastRefreshAt };
  } catch (error) {
    console.error("[Pipeline] Cycle failed:", error);
    return { status: "error", timestamp: lastRefreshAt ?? "never" };
  } finally {
    isRunning = false;
  }
}

export function getLastRefreshAt(): string | null {
  return lastRefreshAt;
}

/**
 * Start the 30-minute cron job.
 * Should be called once during server initialization.
 */
export function startScheduler() {
  console.log("[Scheduler] Starting 30-minute cron job...");

  cron.schedule("*/30 * * * *", async () => {
    console.log("[Scheduler] Cron trigger");
    await runPipeline();
  });

  // Run immediately on startup
  runPipeline().catch(console.error);
}
