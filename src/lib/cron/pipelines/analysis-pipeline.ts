import { db } from "@/lib/db/client";
import { newsEvents, whaleAlerts, marketSnapshots, analyses } from "@/lib/db/schema";
import { crossReferenceAnalysis, generateRecommendation, generateDeepDive } from "@/lib/services/gemini-analyzer";
import { fetchMarketData, fetchOptionsChain, fetchHistoricalData } from "@/lib/services/market-fetcher";
import { desc, gte, and } from "drizzle-orm";
import * as progress from "@/lib/cron/pipeline-progress";

const MIN_CORRELATION_CONFIDENCE = 0.5;
const RECOMMEND_CONCURRENCY = 2;
const DEEP_DIVE_CONCURRENCY = 2;

// Progress step indices (must match scheduler.ts init order)
const STEP_CROSS_REF = 2;
const STEP_RECOMMENDATIONS = 3;
const STEP_DEEP_DIVES = 4;

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
    progress.complete(STEP_CROSS_REF);
    progress.complete(STEP_RECOMMENDATIONS);
    progress.complete(STEP_DEEP_DIVES);
    return 0;
  }

  // Step 3: Cross-reference with Gemini
  progress.activate(STEP_CROSS_REF);
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
  progress.complete(STEP_CROSS_REF);

  // Step 4: Generate recommendations for high-confidence correlations
  const highConfCorrelations = crossRef.correlations.filter(
    (c) => c.correlation_confidence >= MIN_CORRELATION_CONFIDENCE
  );

  progress.activate(STEP_RECOMMENDATIONS, highConfCorrelations.length > 0
    ? `0/${highConfCorrelations.length} tickers`
    : "skipped");

  if (highConfCorrelations.length > 0) {
    console.log(
      `[AnalysisPipeline] Generating recommendations for ${highConfCorrelations.length} high-confidence correlations`
    );

    let recsDone = 0;
    for (let i = 0; i < highConfCorrelations.length; i += RECOMMEND_CONCURRENCY) {
      const chunk = highConfCorrelations.slice(i, i + RECOMMEND_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(async (correlation) => {
          const ticker = correlation.whale_trade.ticker;

          // Fetch fresh market data for the ticker
          const [marketData] = await fetchMarketData([ticker]);
          const chain = await fetchOptionsChain(ticker);

          const recommendation = await generateRecommendation(correlation, {
            price: marketData?.price ?? 0,
            ivRank: undefined,
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

          console.log(
            `[AnalysisPipeline] Recommendation for ${ticker}: ${recommendation.direction} ` +
            `(${recommendation.primary_strategy.name}, confidence: ${recommendation.confidence})`
          );
          return 1;
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled") stored += result.value;
        else console.error("[AnalysisPipeline] Recommendation failed:", result.reason);
      }
      recsDone += chunk.length;
      progress.updateDetail(STEP_RECOMMENDATIONS, `${recsDone}/${highConfCorrelations.length} tickers`);
    }
  }
  progress.complete(STEP_RECOMMENDATIONS);

  // Step 5: Generate deep dives for unique whale tickers (max 5 per cycle)
  const MAX_DEEP_DIVES = 5;

  // Collect unique tickers: correlated first (by confidence desc), then uncorrelated (by premium desc)
  const seenTickers = new Set<string>();
  const deepDiveQueue: Array<{
    ticker: string;
    whaleTrade: {
      ticker: string;
      strike?: number;
      expiry?: string;
      callPut?: string;
      premium?: number;
      volume?: number;
      openInterest?: number;
      sentiment?: string;
    };
    correlatedEvent?: { headline: string; impact_score: number; event_type: string };
  }> = [];

  // Add correlated tickers first (sorted by confidence desc)
  for (const correlation of [...highConfCorrelations].sort(
    (a, b) => b.correlation_confidence - a.correlation_confidence,
  )) {
    const t = correlation.whale_trade.ticker;
    if (seenTickers.has(t) || deepDiveQueue.length >= MAX_DEEP_DIVES) continue;
    seenTickers.add(t);
    deepDiveQueue.push({
      ticker: t,
      whaleTrade: {
        ticker: correlation.whale_trade.ticker,
        strike: correlation.whale_trade.strike,
        expiry: correlation.whale_trade.expiry,
        callPut: correlation.whale_trade.type === "call" ? "C" : "P",
        premium: correlation.whale_trade.premium,
        volume: correlation.whale_trade.volume,
      },
      correlatedEvent: correlation.related_event,
    });
  }

  // Fill remaining slots with uncorrelated whales
  for (const u of crossRef.uncorrelated_whales ?? []) {
    if (seenTickers.has(u.ticker) || deepDiveQueue.length >= MAX_DEEP_DIVES) continue;
    seenTickers.add(u.ticker);
    // Find matching whale alert for full trade details
    const whaleRow = recentWhales.find((w) => w.ticker === u.ticker);
    deepDiveQueue.push({
      ticker: u.ticker,
      whaleTrade: {
        ticker: u.ticker,
        callPut: u.type === "call" ? "C" : "P",
        premium: u.premium,
        strike: whaleRow?.strike ?? 0,
        expiry: whaleRow?.expiry ?? "",
        volume: whaleRow?.volume ?? 0,
        openInterest: whaleRow?.openInterest ?? 0,
        sentiment: whaleRow?.sentiment ?? "neutral",
      },
    });
  }

  if (deepDiveQueue.length > 0) {
    console.log(
      `[AnalysisPipeline] Generating deep dives for ${deepDiveQueue.length} tickers: ${deepDiveQueue.map((d) => d.ticker).join(", ")}`,
    );
    progress.activate(STEP_DEEP_DIVES, `0/${deepDiveQueue.length} tickers`);

    // Gather recent news context for deep dives
    const newsContext = recentNews.slice(0, 5).map((n) => ({
      headline: n.headline,
      sentiment: n.sentiment ?? "neutral",
    }));

    let divesDone = 0;
    for (let i = 0; i < deepDiveQueue.length; i += DEEP_DIVE_CONCURRENCY) {
      const chunk = deepDiveQueue.slice(i, i + DEEP_DIVE_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(async (item) => {
          // Fetch historical data + options chain + current price
          const [historicalData, chain, [marketSnap]] = await Promise.all([
            fetchHistoricalData(item.ticker, "3mo"),
            fetchOptionsChain(item.ticker),
            fetchMarketData([item.ticker]),
          ]);

          const currentPrice = marketSnap?.price ?? 0;
          if (currentPrice === 0) {
            console.warn(`[AnalysisPipeline] No price data for ${item.ticker}, skipping deep dive`);
            return 0;
          }

          const deepDive = await generateDeepDive({
            ticker: item.ticker,
            whaleTrade: item.whaleTrade,
            historicalData,
            optionsChain: chain,
            currentPrice,
            correlatedEvent: item.correlatedEvent,
            newsContext,
          });

          await db.insert(analyses).values({
            type: "deep_dive",
            inputRefs: JSON.stringify({ ticker: item.ticker }),
            output: JSON.stringify(deepDive),
            confidence: null,
          });

          console.log(
            `[AnalysisPipeline] Deep dive for ${item.ticker}: risk=${deepDive.risk_assessment.overall_risk}`,
          );
          return 1;
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled") stored += result.value;
        else console.error("[AnalysisPipeline] Deep dive failed:", result.reason);
      }
      divesDone += chunk.length;
      progress.updateDetail(STEP_DEEP_DIVES, `${divesDone}/${deepDiveQueue.length} tickers`);
    }
  }
  progress.complete(STEP_DEEP_DIVES);

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
