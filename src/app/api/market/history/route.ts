import { NextResponse, type NextRequest } from "next/server";
import { fetchHistoricalData } from "@/lib/services/market-fetcher";

const VALID_PERIODS = ["1d", "1wk", "1mo", "3mo", "6mo", "1y"];

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const ticker = params.get("ticker");
  const period = params.get("period") ?? "3mo";

  if (!ticker || !/^[A-Z]{1,5}$/i.test(ticker)) {
    return NextResponse.json(
      { error: "Invalid or missing ticker parameter" },
      { status: 400 },
    );
  }

  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json(
      { error: `Invalid period. Use one of: ${VALID_PERIODS.join(", ")}` },
      { status: 400 },
    );
  }

  const candles = await fetchHistoricalData(ticker.toUpperCase(), period);

  if (!candles.length) {
    return NextResponse.json(
      { error: `No historical data available for ${ticker.toUpperCase()}` },
      { status: 404 },
    );
  }

  return NextResponse.json({ ticker: ticker.toUpperCase(), period, candles });
}
