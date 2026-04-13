import { NextResponse, type NextRequest } from "next/server";
import {
  refreshTickerDeepDive,
  BudgetExceededError,
} from "@/lib/services/refresh-deep-dive";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** In-memory per-ticker cooldown to prevent spam (ticker → timestamp). */
const lastRefreshMap = new Map<string, number>();
const COOLDOWN_MS = 60_000; // 1 minute per ticker

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { ticker?: string };
    const ticker = body.ticker?.trim().toUpperCase();

    if (!ticker || ticker.length > 10) {
      return NextResponse.json(
        { error: "Invalid or missing ticker" },
        { status: 400 },
      );
    }

    // Per-ticker rate limit
    const lastRefresh = lastRefreshMap.get(ticker);
    if (lastRefresh && Date.now() - lastRefresh < COOLDOWN_MS) {
      const retryAfter = Math.ceil(
        (COOLDOWN_MS - (Date.now() - lastRefresh)) / 1000,
      );
      return NextResponse.json(
        {
          error: `Refresh for ${ticker} is on cooldown. Retry in ${retryAfter}s.`,
        },
        { status: 429 },
      );
    }

    lastRefreshMap.set(ticker, Date.now());

    const result = await refreshTickerDeepDive(ticker);

    return NextResponse.json({
      success: true,
      analysis: result.deepDive,
      triggerReport: result.triggerReport,
      createdAt: result.createdAt,
    });
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    console.error("[deep-dive/refresh] Failed:", error);
    return NextResponse.json(
      { error: "Deep dive refresh failed" },
      { status: 500 },
    );
  }
}
