import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { whaleAlerts, marketSnapshots } from "@/lib/db/schema";
import { desc, gte, eq, and } from "drizzle-orm";
import { computeMarketPulse } from "@/lib/utils/sentiment-inference";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const ticker = params.get("ticker");
  const minPremium = Number(params.get("minPremium")) || 0;
  const sentiment = params.get("sentiment"); // 'bullish' | 'bearish'
  const limit = Math.min(Number(params.get("limit")) || 50, 200);

  // Last 24 hours by default
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const conditions = [gte(whaleAlerts.detectedAt, since)];
  if (ticker) conditions.push(eq(whaleAlerts.ticker, ticker.toUpperCase()));
  if (minPremium > 0) conditions.push(gte(whaleAlerts.premium, minPremium));
  if (sentiment === "bullish" || sentiment === "bearish") {
    conditions.push(eq(whaleAlerts.sentiment, sentiment));
  }

  const alerts = await db
    .select()
    .from(whaleAlerts)
    .where(and(...conditions))
    .orderBy(desc(whaleAlerts.detectedAt))
    .limit(limit);

  // Fetch latest market snapshot for each unique ticker in results
  const uniqueTickers = [...new Set(alerts.map((a) => a.ticker))];
  const marketMap = new Map<
    string,
    { price: number | null; dayChangePct: number | null }
  >();
  for (const t of uniqueTickers) {
    const [snap] = await db
      .select()
      .from(marketSnapshots)
      .where(eq(marketSnapshots.ticker, t))
      .orderBy(desc(marketSnapshots.capturedAt))
      .limit(1);
    if (snap)
      marketMap.set(t, { price: snap.price, dayChangePct: snap.dayChangePct });
  }

  const enriched = alerts.map((a) => ({
    ...a,
    currentPrice: marketMap.get(a.ticker)?.price ?? a.underlyingPrice,
    dayChangePct: marketMap.get(a.ticker)?.dayChangePct ?? null,
  }));

  // Compute market pulse from all alerts in window (not just limited/filtered)
  const allAlerts = await db
    .select()
    .from(whaleAlerts)
    .where(gte(whaleAlerts.detectedAt, since));

  const pulse = computeMarketPulse(allAlerts);

  return NextResponse.json({ alerts: enriched, marketPulse: pulse });
}
