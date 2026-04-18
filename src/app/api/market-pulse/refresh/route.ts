import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getTrackedTickers,
  isMarketPulseRunActive,
  MarketPulseSchedulerError,
  requestManualMarketPulseRefresh,
} from "@/lib/services/market-pulse-scheduler";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  ticker: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ticker = parsed.data.ticker.trim().toUpperCase();
  const tracked = await getTrackedTickers();
  if (!tracked.includes(ticker)) {
    return NextResponse.json(
      { error: `${ticker} is not currently subscribed to Market Pulse` },
      { status: 404 },
    );
  }

  if (await isMarketPulseRunActive(ticker)) {
    return NextResponse.json(
      { error: `A Market Pulse run is already active for ${ticker}` },
      { status: 409 },
    );
  }

  try {
    const result = requestManualMarketPulseRefresh(ticker);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MarketPulseSchedulerError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("[market-pulse/refresh] Failed:", error);
    return NextResponse.json(
      { error: "Failed to start Market Pulse refresh" },
      { status: 500 },
    );
  }
}
