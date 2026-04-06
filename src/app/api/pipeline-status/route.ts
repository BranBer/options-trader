import { NextResponse } from "next/server";
import {
  getProgress,
  getLastError,
  getStageResults,
} from "@/lib/cron/pipeline-progress";
import { getLastRefreshAt } from "@/lib/cron/scheduler";
import { getLatestPipelineRun } from "@/lib/cron/pipeline-run-store";
import { getExitMonitorStatus } from "@/lib/cron/exit-monitor";
import { getBudgetSummary } from "@/lib/utils/api-budget";
import { getLastRunRejections } from "@/lib/cron/pipelines/sim-pipeline";
import { getTokenUsageStats } from "@/lib/services/llm-analyzer";

export const dynamic = "force-dynamic";

export async function GET() {
  const progress = getProgress();
  const lastRefreshAt = getLastRefreshAt();
  const latestRun = getLatestPipelineRun();
  const recentPersistedRunWindowMs = 45 * 60 * 1000;
  const hasRecentPersistedRunningRun =
    latestRun?.status === "running" &&
    Number.isFinite(Date.parse(latestRun.startedAt)) &&
    Date.now() - Date.parse(latestRun.startedAt) <= recentPersistedRunWindowMs;
  const isRunning = progress.active || hasRecentPersistedRunningRun;
  const minutesSinceRefresh = lastRefreshAt
    ? Math.round((Date.now() - Date.parse(lastRefreshAt)) / 60000)
    : null;
  const isStale = minutesSinceRefresh != null ? minutesSinceRefresh > 30 : true;

  return NextResponse.json({
    ...progress,
    lastRefreshAt,
    lastError: getLastError(),
    stageResults: getStageResults(),
    exitMonitor: getExitMonitorStatus(),
    apiBudget: getBudgetSummary(),
    simRejections: getLastRunRejections(),
    tokenUsage: getTokenUsageStats(),
    persistedRun: latestRun,
    pipelineHealth: {
      isStale,
      minutesSinceRefresh,
      status: !lastRefreshAt
        ? "never_run"
        : isRunning
          ? "running"
          : isStale
            ? "stale"
            : "healthy",
    },
  });
}
