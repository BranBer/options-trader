import { fetchWhaleAlerts } from "@/lib/services/whale-fetcher";
import { fetchMarketData, enrichWithIV } from "@/lib/services/market-fetcher";
import { db } from "@/lib/db/client";
import { whaleAlerts, marketSnapshots } from "@/lib/db/schema";

/**
 * Whale Pipeline: Fetch whale alerts → Enrich with market data → Store
 * Returns count of whale alerts stored.
 */
export async function runWhalePipeline(): Promise<number> {
  console.log("[WhalePipeline] Starting...");

  // Step 1: Fetch whale alerts
  const alerts = await fetchWhaleAlerts();
  if (alerts.length === 0) {
    console.log("[WhalePipeline] No whale alerts fetched");
    return 0;
  }

  // Step 2: Extract unique tickers and fetch market data
  const uniqueTickers = [...new Set(alerts.map((a) => a.ticker))];
  console.log(`[WhalePipeline] Enriching ${uniqueTickers.length} tickers with market data`);

  const marketData = await fetchMarketData(uniqueTickers);

  // Step 3: Enrich top tickers with IV data (limit to avoid rate limits)
  const topTickers = uniqueTickers.slice(0, 5); // IV enrichment for top 5 only
  const enrichedMarket = await Promise.all(
    marketData.map(async (snap) => {
      if (topTickers.includes(snap.ticker)) {
        return enrichWithIV(snap);
      }
      return snap;
    })
  );

  // Build a lookup map for quick enrichment
  const marketMap = new Map(enrichedMarket.map((m) => [m.ticker, m]));

  // Step 4: Store market snapshots
  for (const snap of enrichedMarket) {
    try {
      await db.insert(marketSnapshots).values({
        ticker: snap.ticker,
        price: snap.price,
        volume: snap.volume,
        iv: snap.iv ?? null,
        ivRank: snap.ivRank ?? null,
        dayChangePct: snap.dayChangePct,
      });
    } catch (error) {
      console.warn(`[WhalePipeline] Failed to insert market snapshot for ${snap.ticker}:`, error);
    }
  }

  // Step 5: Enrich and store whale alerts
  let stored = 0;
  for (const alert of alerts) {
    const market = marketMap.get(alert.ticker);
    try {
      await db.insert(whaleAlerts).values({
        ticker: alert.ticker,
        strike: alert.strike,
        expiry: alert.expiry,
        callPut: alert.callPut,
        premium: alert.premium,
        volume: alert.volume,
        openInterest: alert.openInterest,
        underlyingPrice: market?.price ?? alert.underlyingPrice ?? null,
        sentiment: alert.sentiment,
        source: alert.source,
        detectedAt: alert.detectedAt,
      });
      stored++;
    } catch (error) {
      console.warn(`[WhalePipeline] Failed to insert whale alert for ${alert.ticker}:`, error);
    }
  }

  console.log(`[WhalePipeline] Complete: ${stored} whale alerts stored, ${enrichedMarket.length} market snapshots`);
  return stored;
}
