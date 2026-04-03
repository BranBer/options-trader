import cron from "node-cron";
import { fetchAllNews } from "@/lib/services/news-fetcher";
import { classifyAndStoreNews } from "@/lib/cron/pipelines/news-pipeline";
import { runWhalePipeline } from "@/lib/cron/pipelines/whale-pipeline";
import { runAnalysisPipeline } from "@/lib/cron/pipelines/analysis-pipeline";
import { runSimPipeline } from "@/lib/cron/pipelines/sim-pipeline";
import { runExitMonitor } from "@/lib/cron/exit-monitor";
import * as progress from "./pipeline-progress";
import type { StageResults } from "./pipeline-progress";
import {
  getLastCompletedPipelineRefreshAt,
  recordPipelineRunCompletion,
  recordPipelineRunStart,
  type PipelineRunTrigger,
} from "./pipeline-run-store";

let lastRefreshAt: string | null = null;
let isRunning = false;

/**
 * Master pipeline — orchestrates all data ingestion + analysis.
 * Called every 30 minutes by cron and on-demand via /api/cron.
 *
 * Story 17.1: Each stage is wrapped in its own try/catch so that
 * a failure in analysis does not prevent the sim pipeline from running.
 */
export async function runPipeline(
  trigger: PipelineRunTrigger = "manual",
): Promise<{
  status: string;
  timestamp: string;
  stages: { fetch: string; classify: string; analysis: string; sim: string };
}> {
  if (isRunning) {
    console.log("[Pipeline] Already running, skipping...");
    return {
      status: "skipped",
      timestamp: lastRefreshAt ?? "never",
      stages: {
        fetch: "skipped",
        classify: "skipped",
        analysis: "skipped",
        sim: "skipped",
      },
    };
  }

  isRunning = true;
  const runId = recordPipelineRunStart(trigger);
  const startTime = new Date();
  console.log(`[Pipeline] Starting cycle at ${startTime.toISOString()}`);

  const stages = { fetch: "ok", classify: "ok", analysis: "ok", sim: "ok" };
  let hadError = false;

  progress.init([
    "Fetching data",
    "Classifying articles",
    "Cross-referencing",
    "Generating recommendations",
    "Deep dive analysis",
    "Sim portfolio",
  ]);

  // Clear previous error on new cycle start
  progress.clearLastError();

  let rawArticles: Awaited<ReturnType<typeof fetchAllNews>> = [];

  try {
    // Stage 1: Fetch data (news + whale in parallel)
    progress.activate(0);
    const [articles, whaleCount] = await Promise.all([
      fetchAllNews(),
      runWhalePipeline(),
    ]);
    rawArticles = articles;
    progress.complete(0);
    console.log(
      `[Pipeline] Phase 1 fetch: ${rawArticles.length} articles, ${whaleCount} whale alerts`,
    );
  } catch (error) {
    console.error("[Pipeline] Stage fetch failed:", error);
    stages.fetch = "error";
    hadError = true;
    progress.fail(0);
    progress.setLastError(
      "fetch",
      error instanceof Error ? error.message : "Data fetch failed",
    );
  }

  try {
    // Stage 2: Classify news articles with LLM
    progress.activate(1);
    const newsCount = await classifyAndStoreNews(rawArticles, (done, total) => {
      progress.updateDetail(1, `${done}/${total} batches`);
    });
    progress.complete(1);
    console.log(`[Pipeline] Phase 1 classify: ${newsCount} news events stored`);
  } catch (error) {
    console.error("[Pipeline] Stage classify failed:", error);
    stages.classify = "error";
    hadError = true;
    progress.fail(1);
    progress.setLastError(
      "classify",
      error instanceof Error ? error.message : "News classification failed",
    );
  }

  try {
    // Stage 3-5: Analysis (pipeline updates progress internally)
    const analysisCount = await runAnalysisPipeline();
    console.log(
      `[Pipeline] Phase 2 complete: ${analysisCount} analyses stored`,
    );
  } catch (error) {
    console.error("[Pipeline] Stage analysis failed:", error);
    stages.analysis = "error";
    hadError = true;
    // Mark analysis steps as error
    progress.fail(2);
    progress.fail(3);
    progress.fail(4);
    progress.setLastError(
      "analysis",
      error instanceof Error ? error.message : "Analysis pipeline failed",
    );
  }

  try {
    // Stage 6: Sim portfolio — ALWAYS runs even if analysis failed
    const simActions = await runSimPipeline();
    console.log(`[Pipeline] Phase 3 sim: ${simActions} actions`);
  } catch (error) {
    console.error("[Pipeline] Stage sim failed:", error);
    stages.sim = "error";
    hadError = true;
    progress.fail(5);
    progress.setLastError(
      "sim",
      error instanceof Error ? error.message : "Sim pipeline failed",
    );
  }

  lastRefreshAt = recordPipelineRunCompletion({
    runId,
    status: hadError ? "partial" : "ok",
    stages,
    errorMessage: progress.getProgress().lastError?.message ?? null,
  });
  const elapsed = Date.now() - startTime.getTime();
  console.log(
    `[Pipeline] Cycle complete in ${elapsed}ms (stages: ${JSON.stringify(stages)})`,
  );

  progress.setStageResults(stages as StageResults);

  if (hadError) {
    progress.finishWithError();
  } else {
    progress.clearLastError();
    progress.finish();
  }

  isRunning = false;
  return {
    status: hadError ? "partial" : "ok",
    timestamp: lastRefreshAt,
    stages,
  };
}

export function getLastRefreshAt(): string | null {
  return lastRefreshAt ?? getLastCompletedPipelineRefreshAt();
}

/**
 * Start the 10-minute cron job and 5-minute exit monitor.
 * Should be called once during server initialization.
 */
export function startScheduler() {
  console.log("[Scheduler] Starting 10-minute cron job...");

  cron.schedule("*/10 * * * *", async () => {
    console.log("[Scheduler] Cron trigger");
    await runPipeline("schedule");
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
  runPipeline("startup").catch(console.error);
}
