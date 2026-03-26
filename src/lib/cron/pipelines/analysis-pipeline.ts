import { db } from "@/lib/db/client";
import { newsEvents, whaleAlerts, marketSnapshots, analyses } from "@/lib/db/schema";
import { crossReferenceAnalysis, generateRecommendation } from "@/lib/services/gemini-analyzer";
import { fetchMarketData, fetchOptionsChain } from "@/lib/services/market-fetcher";
import { desc, gte, and } from "drizzle-orm";

const MIN_CORRELATION_CONFIDENCE = 0.5;

/**
 * Analysis Pipeline: Cross-reference → Recommend → Store
 * Runs AFTER news and whale pipelines complete.
 * Returns count of analyses stored.
 */
export async function runAnalysisPipeline(): Promise<number> {
  console.log("[AnalysisPipeline] Starting...");

  // Step 1: Fetch recent high-impact news (last 24h, impact >= 5)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const recentNews = await db
    .select()
    .from(newsEvents)
    .where(and(gte(newsEvents.createdAt, since), gte(newsEvents.impactScore, 5)))
    .orderBy(desc(newsEvents.createdAt))
    .limit(20);

  // Step 2: Fetch recent whale alerts
  const recentWhales = await db
    .select()
    .from(whaleAlerts)
    .where(gte(whaleAlerts.createdAt, since))
    .orderBy(desc(whaleAlerts.detectedAt))
    .limit(30);

  if (recentNews.length === 0 || recentWhales.length === 0) {
    console.log(
      `[AnalysisPipeline] Insufficient data: ${recentNews.length} news, ${recentWhales.length} whales — skipping`
    );
    return 0;
  }

  // Step 3: Cross-reference with Gemini
  const newsForCorrelation = recentNews.map((n) => ({
    headline: n.headline,
    impact_score: n.impactScore ?? 0,
    sentiment: n.sentiment ?? "neutral",
    event_type: n.eventType ?? "other",
    affected_sectors: safeParseJsonArray(n.sectors),
    affected_tickers: safeParseJsonArray(n.tickers),
  }));

  const whalesForCorrelation = recentWhales.map((w) => ({
    ticker: w.ticker,
    strike: w.strike ?? 0,
    expiry: w.expiry ?? "",
    callPut: w.callPut ?? "C",
    premium: w.premium ?? 0,
    volume: w.volume ?? 0,
    openInterest: w.openInterest ?? 0,
    sentiment: w.sentiment ?? "neutral",
  }));

  const crossRef = await crossReferenceAnalysis(newsForCorrelation, whalesForCorrelation);

  // Store cross-reference analysis
  let stored = 0;
  try {
    await db.insert(analyses).values({
      type: "cross_reference",
      inputRefs: JSON.stringify({
        newsIds: recentNews.map((n) => n.id),
        whaleIds: recentWhales.map((w) => w.id),
      }),
      output: JSON.stringify(crossRef),
      confidence: crossRef.correlations.length > 0
        ? crossRef.correlations.reduce((sum, c) => sum + c.correlation_confidence, 0) / crossRef.correlations.length
        : 0,
    });
    stored++;
  } catch (error) {
    console.error("[AnalysisPipeline] Failed to store cross-reference:", error);
  }

  console.log(
    `[AnalysisPipeline] Cross-reference: ${crossRef.correlations.length} correlations, ` +
    `${crossRef.uncorrelated_whales.length} uncorrelated whales`
  );

  // Step 4: Generate recommendations for high-confidence correlations
  const highConfCorrelations = crossRef.correlations.filter(
    (c) => c.correlation_confidence >= MIN_CORRELATION_CONFIDENCE
  );

  if (highConfCorrelations.length > 0) {
    console.log(
      `[AnalysisPipeline] Generating recommendations for ${highConfCorrelations.length} high-confidence correlations`
    );

    for (const correlation of highConfCorrelations) {
      try {
        const ticker = correlation.whale_trade.ticker;

        // Fetch fresh market data for the ticker
        const [marketData] = await fetchMarketData([ticker]);
        const chain = await fetchOptionsChain(ticker);

        const recommendation = await generateRecommendation(correlation, {
          price: marketData?.price ?? 0,
          ivRank: undefined, // Would need enrichWithIV, but keeping simple
          avgVolume: marketData?.volume ?? 0,
          todayVolume: marketData?.volume ?? 0,
          optionsChainSummary: chain
            ? `${chain.expirations.length} expirations, nearest: ${chain.nearestExpiry.date} (${chain.nearestExpiry.calls.length} calls, ${chain.nearestExpiry.puts.length} puts)`
            : "No options chain data available",
        });

        // Store latest market snapshot
        if (marketData) {
          try {
            await db.insert(marketSnapshots).values({
              ticker: marketData.ticker,
              price: marketData.price,
              volume: marketData.volume,
              iv: marketData.iv ?? null,
              ivRank: marketData.ivRank ?? null,
              dayChangePct: marketData.dayChangePct,
            });
          } catch { /* ignore duplicate snapshot */ }
        }

        // Store recommendation
        await db.insert(analyses).values({
          type: "trade_recommendation",
          inputRefs: JSON.stringify({
            correlationTicker: ticker,
            correlationConfidence: correlation.correlation_confidence,
          }),
          output: JSON.stringify(recommendation),
          confidence: recommendation.confidence,
        });
        stored++;

        console.log(
          `[AnalysisPipeline] Recommendation for ${ticker}: ${recommendation.direction} ` +
          `(${recommendation.primary_strategy.name}, confidence: ${recommendation.confidence})`
        );
      } catch (error) {
        console.error(
          `[AnalysisPipeline] Recommendation failed for ${correlation.whale_trade.ticker}:`,
          error
        );
      }
    }
  }

  console.log(`[AnalysisPipeline] Complete: ${stored} analyses stored`);
  return stored;
}

function safeParseJsonArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
