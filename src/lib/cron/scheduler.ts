import cron from "node-cron";
import { fetchAllNews } from "@/lib/services/news-fetcher";
import { classifyAndStoreNews } from "@/lib/cron/pipelines/news-pipeline";
import { runWhalePipeline } from "@/lib/cron/pipelines/whale-pipeline";
import { runAnalysisPipeline } from "@/lib/cron/pipelines/analysis-pipeline";
import { runSimPipeline } from "@/lib/cron/pipelines/sim-pipeline";
import { runExitMonitor } from "@/lib/cron/exit-monitor";
import * as progress from "./pipeline-progress";

let lastRefreshAt: string | null = null;
let isRunning = false;

/**
 * Master pipeline — orchestrates all data ingestion + analysis.
 * Called every 30 minutes by cron and on-demand via /api/cron.
 */
export async function runPipeline(): Promise<{
  status: string;
  timestamp: string;
}> {
  if (isRunning) {
    console.log("[Pipeline] Already running, skipping...");
    return { status: "skipped", timestamp: lastRefreshAt ?? "never" };
  }

  isRunning = true;
  const startTime = new Date();
  console.log(`[Pipeline] Starting cycle at ${startTime.toISOString()}`);

  progress.init([
    "Fetching data",
    "Classifying articles",
    "Cross-referencing",
    "Generating recommendations",
    "Deep dive analysis",
    "Sim portfolio",
  ]);

  try {
    // Step 0: Fetch data (news + whale in parallel)
    progress.activate(0);
    const [rawArticles, whaleCount] = await Promise.all([
      fetchAllNews(),
      runWhalePipeline(),
    ]);
    progress.complete(0);
    console.log(
      `[Pipeline] Phase 1 fetch: ${rawArticles.length} articles, ${whaleCount} whale alerts`,
    );

    // Step 1: Classify news articles with Gemini
    progress.activate(1);
    const newsCount = await classifyAndStoreNews(rawArticles, (done, total) => {
      progress.updateDetail(1, `${done}/${total} batches`);
    });
    progress.complete(1);
    console.log(`[Pipeline] Phase 1 classify: ${newsCount} news events stored`);

    // Steps 2-4: Analysis (pipeline updates progress internally)
    const analysisCount = await runAnalysisPipeline();
    console.log(
      `[Pipeline] Phase 2 complete: ${analysisCount} analyses stored`,
    );

    // Step 5: Sim portfolio (evaluate exits + open new positions)
    const simActions = await runSimPipeline();
    console.log(`[Pipeline] Phase 3 sim: ${simActions} actions`);

    lastRefreshAt = new Date().toISOString();
    const elapsed = Date.now() - startTime.getTime();
    console.log(`[Pipeline] Cycle complete in ${elapsed}ms`);

    progress.finish();
    return { status: "ok", timestamp: lastRefreshAt };
  } catch (error) {
    console.error("[Pipeline] Cycle failed:", error);
    progress.finish();
    return { status: "error", timestamp: lastRefreshAt ?? "never" };
  } finally {
    isRunning = false;
  }
}

export function getLastRefreshAt(): string | null {
  return lastRefreshAt;
}

/**
 * Start the 30-minute cron job and 5-minute exit monitor.
 * Should be called once during server initialization.
 */
export function startScheduler() {
  console.log("[Scheduler] Starting 30-minute cron job...");

  cron.schedule("*/30 * * * *", async () => {
    console.log("[Scheduler] Cron trigger");
    await runPipeline();
  });

  // Exit monitor: configurable interval, defaults to 5 minutes
  const interval = parseInt(
    process.env.EXIT_MONITOR_INTERVAL_MINUTES ?? "5",
    10,
  );
  const enabled = process.env.EXIT_MONITOR_ENABLED !== "false";

  if (enabled) {
    console.log(`[Scheduler] Starting exit monitor (every ${interval}min)...`);
    cron.schedule(`*/${interval} * * * *`, async () => {
      await runExitMonitor();
    });
  } else {
    console.log(
      "[Scheduler] Exit monitor disabled via EXIT_MONITOR_ENABLED=false",
    );
  }

  // Run immediately on startup
  runPipeline().catch(console.error);
}
