import { NextResponse } from "next/server";
import { runPipeline, getLastRefreshAt } from "@/lib/cron/scheduler";
import { getProgress } from "@/lib/cron/pipeline-progress";

export const dynamic = "force-dynamic";

export async function GET() {
  const current = getProgress();
  if (current.active) {
    return NextResponse.json({ status: "already_running" });
  }
  // Fire-and-forget: start pipeline without blocking the response
  runPipeline().catch(console.error);
  return NextResponse.json({
    status: "started",
    timestamp: new Date().toISOString(),
  });
}

export async function HEAD() {
  return NextResponse.json({ lastRefresh: getLastRefreshAt() });
}
