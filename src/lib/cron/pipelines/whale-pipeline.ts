import { fetchWhaleAlerts } from "@/lib/services/whale-fetcher";
import {
  fetchMarketData,
  enrichWithIV,
  fetchVIX,
  fetchSectorPerformance,
  getOrFetchShortInterest,
} from "@/lib/services/market-fetcher";
import { db } from "@/lib/db/client";
import {
  whaleAlerts,
  marketSnapshots,
  shortInterest as shortInterestTable,
} from "@/lib/db/schema";
import { gte, sql } from "drizzle-orm";
import { scoreWhaleQuality } from "@/lib/utils/whale-quality";
import type { ShortInterestData } from "@/lib/services/market-fetcher";
import { inferSentiment } from "@/lib/utils/sentiment-inference";
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

  // Step 3b: Fetch short interest for all unique tickers (24h cached)
  const siResults = await Promise.allSettled(
    uniqueTickers.map((ticker) => getOrFetchShortInterest(ticker)),
  );
  const siMap = new Map<string, ShortInterestData | null>();
  uniqueTickers.forEach((ticker, i) => {
    const result = siResults[i];
    siMap.set(ticker, result.status === "fulfilled" ? result.value : null);
  });
  const siHits = [...siMap.values()].filter(Boolean).length;
  console.log(
    `[WhalePipeline] Short interest: ${siHits}/${uniqueTickers.length} tickers fetched/cached`,
  );

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

  // Step 5: Enrich and store whale alerts (upsert — dedup by contract+date)
  let stored = 0;
  for (const alert of alerts) {
    const market = marketMap.get(alert.ticker);
    const si = siMap.get(alert.ticker) ?? null;
    const quality = scoreWhaleQuality(alert, market?.price, si);
    const sentimentResult = inferSentiment(alert, market?.price);
    const dedupDate = alert.detectedAt
      ? alert.detectedAt.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    try {
      await db
        .insert(whaleAlerts)
        .values({
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
          delta: alert.delta ?? null,
          gamma: alert.gamma ?? null,
          theta: alert.theta ?? null,
          vega: alert.vega ?? null,
          impliedVolatility: alert.impliedVolatility ?? null,
          breakEvenPrice: alert.breakEvenPrice ?? null,
          inferredSentiment: sentimentResult.inferred,
          sentimentConfidence: sentimentResult.confidence,
          intentHint: sentimentResult.intent,
          dedupDate,
        })
        .onConflictDoUpdate({
          target: [
            whaleAlerts.ticker,
            whaleAlerts.strike,
            whaleAlerts.expiry,
            whaleAlerts.callPut,
            whaleAlerts.dedupDate,
          ],
          set: {
            premium: sql`excluded.premium`,
            volume: sql`excluded.volume`,
            openInterest: sql`excluded.open_interest`,
            underlyingPrice: sql`excluded.underlying_price`,
            qualityScore: sql`excluded.quality_score`,
            detectedAt: sql`excluded.detected_at`,
            delta: sql`excluded.delta`,
            gamma: sql`excluded.gamma`,
            theta: sql`excluded.theta`,
            vega: sql`excluded.vega`,
            impliedVolatility: sql`excluded.implied_volatility`,
            breakEvenPrice: sql`excluded.break_even_price`,
            inferredSentiment: sql`excluded.inferred_sentiment`,
            sentimentConfidence: sql`excluded.sentiment_confidence`,
            intentHint: sql`excluded.intent_hint`,
          },
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

  // Step 6: Backfill SI for any tickers in the 24h window that are still missing
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentRows = await db
      .selectDistinct({ ticker: whaleAlerts.ticker })
      .from(whaleAlerts)
      .where(gte(whaleAlerts.detectedAt, since24h));
    const recentTickers = recentRows.map((r) => r.ticker);

    if (recentTickers.length > 0) {
      const cachedRows = await db
        .select({ ticker: shortInterestTable.ticker })
        .from(shortInterestTable);
      const cachedSet = new Set(cachedRows.map((r) => r.ticker));
      const missing = recentTickers.filter((t) => !cachedSet.has(t));

      if (missing.length > 0) {
        console.log(
          `[WhalePipeline] SI backfill: fetching ${missing.length} uncached tickers`,
        );
        await Promise.allSettled(
          missing.map((t) => getOrFetchShortInterest(t)),
        );
      }
    }
  } catch (err) {
    console.warn("[WhalePipeline] SI backfill failed (non-critical):", err);
  }

  return stored;
}
