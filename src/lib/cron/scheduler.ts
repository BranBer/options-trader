import cron from "node-cron";
import { fetchAllNews } from "@/lib/services/news-fetcher";
import { fetchAllTechNews } from "@/lib/services/tech-news-fetcher";
import {
  classifyAndStoreNews,
  runTechNewsPipeline,
} from "@/lib/cron/pipelines/news-pipeline";
import { runWhalePipeline } from "@/lib/cron/pipelines/whale-pipeline";
import { runAnalysisPipeline } from "@/lib/cron/pipelines/analysis-pipeline";
import * as progress from "./pipeline-progress";
import type { StageResults } from "./pipeline-progress";
import {
  getLastCompletedPipelineRefreshAt,
  recordPipelineRunCompletion,
  recordPipelineRunStart,
  type PipelineRunTrigger,
} from "./pipeline-run-store";
import { refreshCalendarCache } from "@/lib/services/live-economic-calendar";
import { refreshNexusEarnings } from "@/lib/services/nexus-earnings-cache";
import { scoreMaturedJudgments } from "@/lib/services/jev-judgments";
import { runDesk } from "@/lib/desk/run-desk";

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
  stages: { fetch: string; classify: string; analysis: string };
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
      },
    };
  }

  isRunning = true;
  const runId = recordPipelineRunStart(trigger);
  const startTime = new Date();
  console.log(`[Pipeline] Starting cycle at ${startTime.toISOString()}`);

  const stages = { fetch: "ok", classify: "ok", analysis: "ok" };
  let hadError = false;

  progress.init([
    "Fetching data",
    "Classifying articles",
    "Cross-referencing",
    "Generating recommendations",
    "Deep dive analysis",
  ]);

  // Clear previous error on new cycle start
  progress.clearLastError();

  let rawArticles: Awaited<ReturnType<typeof fetchAllNews>> = [];
  let rawTechArticles: Awaited<ReturnType<typeof fetchAllTechNews>> = [];

  try {
    // Stage 1: Fetch data (news + whale in parallel)
    progress.activate(0);
    const [articles, techArticles, whaleCount] = await Promise.all([
      fetchAllNews(),
      fetchAllTechNews(),
      runWhalePipeline(),
    ]);
    rawArticles = articles;
    rawTechArticles = techArticles;
    progress.complete(0);
    console.log(
      `[Pipeline] Phase 1 fetch: ${rawArticles.length} general articles, ${rawTechArticles.length} tech articles, ${whaleCount} whale alerts`,
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
    const techNewsCount = await runTechNewsPipelineFromRaw(rawTechArticles);
    progress.complete(1);
    console.log(
      `[Pipeline] Phase 1 classify: ${newsCount} general news events stored, ${techNewsCount} tech news events stored`,
    );
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
    const analysisCount = await runAnalysisPipeline(
      trigger === "manual" ? { force: true } : undefined,
    );
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
 * Start the 10-minute cron job.
 * Should be called once during server initialization.
 */
export function startScheduler() {
  console.log("[Scheduler] Starting 10-minute cron job...");

  cron.schedule("*/10 * * * *", async () => {
    console.log("[Scheduler] Cron trigger");
    await runPipeline("schedule");
  });

  // Refresh economic calendar daily at 00:05 ET (05:05 UTC)
  // This ensures dates are live before the markets open each day.
  cron.schedule("5 5 * * *", async () => {
    console.log("[Scheduler] Daily calendar refresh");
    await refreshCalendarCache().catch((err) =>
      console.error("[Scheduler] Calendar refresh failed:", err),
    );
  });

  // Refresh nexus earnings every 2 hours so cascade context stays warm
  // without blocking the hot analysis cycle.
  cron.schedule("15 */2 * * *", async () => {
    console.log("[Scheduler] Nexus earnings refresh");
    await refreshNexusEarnings().catch((err) =>
      console.error("[Scheduler] Nexus earnings refresh failed:", err),
    );
  });

  // Story S4 — score matured Jev judgments once daily at 05:30 UTC
  // (after the calendar refresh, off the hot 10-minute cycle).
  cron.schedule("30 5 * * *", async () => {
    console.log("[Scheduler] Daily Jev judgment scoring");
    await scoreMaturedJudgments().catch((err) =>
      console.error("[Scheduler] Jev judgment scoring failed:", err),
    );
  });

  // Story S6 — run the paper-trading desk once daily, weekdays at 16:35 ET
  // (after the close, before the after-hours cutoff used for asOf resolution).
  cron.schedule(
    "35 16 * * 1-5",
    async () => {
      console.log("[Scheduler] Daily desk run");
      await runDesk().catch((err) =>
        console.error("[Scheduler] Desk run failed:", err),
      );
    },
    { timezone: "America/New_York" },
  );

  // Cold-start: warm the calendar cache immediately so callers have live data
  // as soon as the first pipeline run or API call occurs.
  refreshCalendarCache().catch((err) =>
    console.error("[Scheduler] Cold-start calendar refresh failed:", err),
  );
  refreshNexusEarnings().catch((err) =>
    console.error("[Scheduler] Cold-start nexus earnings refresh failed:", err),
  );

  // Run immediately on startup
  runPipeline("startup").catch(console.error);
}

async function runTechNewsPipelineFromRaw(
  rawArticles: Awaited<ReturnType<typeof fetchAllTechNews>>,
): Promise<number> {
  if (rawArticles.length === 0) return 0;
  const {
    TECH_NEWS_CLASSIFIER_RESPONSE_SCHEMA,
    TECH_NEWS_CLASSIFIER_SYSTEM_INSTRUCTION,
    buildTechNewsClassifierPrompt,
  } = await import("@/lib/prompts/tech-news-classifier");

  return classifyAndStoreNews(rawArticles, undefined, {
    category: "tech",
    autoTriggerMinImpact: 7,
    classifierConfig: {
      systemInstruction: TECH_NEWS_CLASSIFIER_SYSTEM_INSTRUCTION,
      responseSchema: TECH_NEWS_CLASSIFIER_RESPONSE_SCHEMA,
      promptBuilder: buildTechNewsClassifierPrompt,
      minImpact: 3,
    },
  });
}
