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
  return NextResponse.json({
    ...getProgress(),
    lastRefreshAt: getLastRefreshAt(),
    lastError: getLastError(),
    stageResults: getStageResults(),
    exitMonitor: getExitMonitorStatus(),
    apiBudget: getBudgetSummary(),
    simRejections: getLastRunRejections(),
    tokenUsage: getTokenUsageStats(),
  });
}
