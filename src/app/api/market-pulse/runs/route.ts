import { desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { marketPulseRuns } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export type MarketPulseRunHistoryItem = {
  runId: string;
  ticker: string;
  status: string;
  trigger: string;
  llmTokensUsed: number | null;
  durationMs: number | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  stages: Record<string, unknown> | null;
};

export type MarketPulseRunsResponse = {
  runs: MarketPulseRunHistoryItem[];
};

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.trim().toUpperCase();
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "8");
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(20, Math.floor(limitRaw)))
    : 8;

  if (!ticker) {
    return NextResponse.json({ error: "ticker is required" }, { status: 400 });
  }

  const runs = await db
    .select({
      runId: marketPulseRuns.runId,
      ticker: marketPulseRuns.ticker,
      status: marketPulseRuns.status,
      trigger: marketPulseRuns.trigger,
      llmTokensUsed: marketPulseRuns.llmTokensUsed,
      durationMs: marketPulseRuns.durationMs,
      startedAt: marketPulseRuns.startedAt,
      completedAt: marketPulseRuns.completedAt,
      errorMessage: marketPulseRuns.errorMessage,
      stages: marketPulseRuns.stages,
    })
    .from(marketPulseRuns)
    .where(eq(marketPulseRuns.ticker, ticker))
    .orderBy(desc(marketPulseRuns.createdAt))
    .limit(limit);

  return NextResponse.json({
    runs: runs.map((run) => ({
      ...run,
      stages: run.stages
        ? (JSON.parse(run.stages) as Record<string, unknown>)
        : null,
    })),
  } satisfies MarketPulseRunsResponse);
}
