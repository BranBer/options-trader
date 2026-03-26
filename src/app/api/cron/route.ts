import { NextResponse } from "next/server";
import { runPipeline, getLastRefreshAt } from "@/lib/cron/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await runPipeline();
  return NextResponse.json(result);
}

export async function HEAD() {
  return NextResponse.json({ lastRefresh: getLastRefreshAt() });
}
