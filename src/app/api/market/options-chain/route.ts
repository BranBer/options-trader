import { NextResponse, type NextRequest } from "next/server";
import {
  fetchOptionsChain,
  fetchEarningsDate,
} from "@/lib/services/market-fetcher";

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker")?.toUpperCase();
  if (!ticker) {
    return NextResponse.json(
      { error: "ticker query parameter is required" },
      { status: 400 },
    );
  }

  const [chain, earningsDate] = await Promise.all([
    fetchOptionsChain(ticker),
    fetchEarningsDate(ticker),
  ]);
  return NextResponse.json({ chain, earningsDate });
}
