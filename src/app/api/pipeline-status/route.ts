import { NextResponse } from "next/server";
import {
  getProgress,
  getLastError,
  getStageResults,
} from "@/lib/cron/pipeline-progress";
import { getLastRefreshAt } from "@/lib/cron/scheduler";
import { getExitMonitorStatus } from "@/lib/cron/exit-monitor";
import { getBudgetSummary } from "@/lib/utils/api-budget";
import { getLastRunRejections } from "@/lib/cron/pipelines/sim-pipeline";
import { getTokenUsageStats } from "@/lib/services/llm-analyzer";

export const dynamic = "force-dynamic";

export async function GET() {
  const lastRefreshAt = getLastRefreshAt();
  const minutesSinceRefresh = lastRefreshAt
    ? Math.round((Date.now() - Date.parse(lastRefreshAt)) / 60000)
    : null;
  const isStale = minutesSinceRefresh != null ? minutesSinceRefresh > 30 : true;

  return NextResponse.json({
    ...getProgress(),
    lastRefreshAt,
    lastError: getLastError(),
    stageResults: getStageResults(),
    exitMonitor: getExitMonitorStatus(),
    apiBudget: getBudgetSummary(),
    simRejections: getLastRunRejections(),
    tokenUsage: getTokenUsageStats(),
    pipelineHealth: {
      isStale,
      minutesSinceRefresh,
      status: !lastRefreshAt
        ? "never_run"
        : getProgress().active
          ? "running"
          : isStale
            ? "stale"
            : "healthy",
    },
  });
}
