import { NextResponse } from "next/server";
import { getProgress } from "@/lib/cron/pipeline-progress";
import { getLastRefreshAt } from "@/lib/cron/scheduler";
import { getExitMonitorStatus } from "@/lib/cron/exit-monitor";
import { getBudgetSummary } from "@/lib/utils/api-budget";
import { getLastRunRejections } from "@/lib/cron/pipelines/sim-pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ...getProgress(),
    lastRefreshAt: getLastRefreshAt(),
    exitMonitor: getExitMonitorStatus(),
    apiBudget: getBudgetSummary(),
    simRejections: getLastRunRejections(),
  });
}
