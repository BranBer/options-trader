import { NextResponse } from "next/server";
import { getProgress } from "@/lib/cron/pipeline-progress";
import { getLastRefreshAt } from "@/lib/cron/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ...getProgress(),
    lastRefreshAt: getLastRefreshAt(),
  });
}
