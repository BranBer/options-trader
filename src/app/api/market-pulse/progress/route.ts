import { NextResponse, type NextRequest } from "next/server";
import { getTickersProgress } from "@/lib/services/market-pulse-progress";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rawTickers = request.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = rawTickers
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    return NextResponse.json({ progress: [] });
  }

  const progress = getTickersProgress(tickers);
  return NextResponse.json({ progress });
}
