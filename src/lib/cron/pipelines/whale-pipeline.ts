import { fetchWhaleAlerts } from "@/lib/services/whale-fetcher";
import {
  fetchMarketData,
  enrichWithIV,
  fetchVIX,
  fetchSectorPerformance,
} from "@/lib/services/market-fetcher";
import { db } from "@/lib/db/client";
import { whaleAlerts, marketSnapshots } from "@/lib/db/schema";
import { scoreWhaleQuality } from "@/lib/utils/whale-quality";
import { classifyRotation } from "@/lib/utils/sector-rotation";
import type { SectorRotationContext } from "@/lib/utils/sector-rotation";

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
  console.log(
    `[WhalePipeline] Enriching ${uniqueTickers.length} tickers with market data`,
  );

  const marketData = await fetchMarketData(uniqueTickers);

  // Step 3: Enrich top tickers with IV data (limit to avoid rate limits)
  const topTickers = uniqueTickers.slice(0, 5); // IV enrichment for top 5 only
  const enrichedMarket = await Promise.all(
    marketData.map(async (snap) => {
      if (topTickers.includes(snap.ticker)) {
        return enrichWithIV(snap);
      }
      return snap;
    }),
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
        realizedVol: snap.realizedVol ?? null,
        ivRvSpread: snap.ivRvSpread ?? null,
        ivPercentileMethod: snap.ivPercentileMethod ?? null,
      });
    } catch (error) {
      console.warn(
        `[WhalePipeline] Failed to insert market snapshot for ${snap.ticker}:`,
        error,
      );
    }
  }

  // Step 4b: Store VIX snapshot for macro context
  const vixLevel = await fetchVIX();
  if (vixLevel != null) {
    try {
      await db.insert(marketSnapshots).values({
        ticker: "^VIX",
        price: vixLevel,
        volume: 0,
        iv: null,
        ivRank: null,
        dayChangePct: 0,
      });
    } catch {
      /* ignore duplicate */
    }
  }

  // Step 4c: Fetch sector ETF performance and store snapshots
  let sectorRotation: SectorRotationContext | null = null;
  try {
    const sectorPerf = await fetchSectorPerformance();
    if (sectorPerf.length > 0) {
      sectorRotation = classifyRotation(sectorPerf);
      for (const sp of sectorPerf) {
        try {
          await db.insert(marketSnapshots).values({
            ticker: sp.ticker,
            price: 0,
            volume: 0,
            iv: null,
            ivRank: null,
            dayChangePct: sp.dayChangePct,
          });
        } catch {
          /* ignore */
        }
      }
      console.log(
        `[WhalePipeline] Sector rotation: ${sectorRotation.regime} ` +
          `(leading: ${sectorRotation.leading.map((s) => s.ticker).join(", ")})`,
      );
    }
  } catch (err) {
    console.warn("[WhalePipeline] Sector fetch failed (non-critical):", err);
  }

  // Step 5: Enrich and store whale alerts
  let stored = 0;
  for (const alert of alerts) {
    const market = marketMap.get(alert.ticker);
    const quality = scoreWhaleQuality(alert, market?.price);
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
        qualityScore: quality,
      });
      stored++;
    } catch (error) {
      console.warn(
        `[WhalePipeline] Failed to insert whale alert for ${alert.ticker}:`,
        error,
      );
    }
  }

  console.log(
    `[WhalePipeline] Complete: ${stored} whale alerts stored, ${enrichedMarket.length} market snapshots`,
  );
  return stored;
}
