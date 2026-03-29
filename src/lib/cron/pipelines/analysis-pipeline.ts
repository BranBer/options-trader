import { db } from "@/lib/db/client";
import {
  newsEvents,
  whaleAlerts,
  marketSnapshots,
  analyses,
} from "@/lib/db/schema";
import {
  crossReferenceAnalysis,
  generateRecommendation,
  generateDeepDive,
} from "@/lib/services/gemini-analyzer";
import {
  fetchMarketData,
  fetchOptionsChain,
  fetchHistoricalData,
  fetchVIX,
  fetchEarningsDate,
  computeRealizedVol,
} from "@/lib/services/market-fetcher";
import { desc, gte, eq, and } from "drizzle-orm";
import * as progress from "@/lib/cron/pipeline-progress";
import { buildVIXContext } from "@/lib/utils/vix-regimes";
import { getEarningsProximity } from "@/lib/utils/earnings-proximity";
import { getFOMCProximity } from "@/lib/utils/fomc-calendar";
import { computeConfidenceAdjustment } from "@/lib/utils/confidence-adjuster";
import {
  fetchInsiderTransactions,
  computeInsiderSentiment,
} from "@/lib/services/insider-fetcher";
import {
  classifyRotation,
  buildSectorRotationPromptContext,
} from "@/lib/utils/sector-rotation";
import { fetchSectorPerformance } from "@/lib/services/market-fetcher";
import { computeCompositeConfidence } from "@/lib/utils/composite-confidence";
import type { InsiderSentiment } from "@/types/insider";
import type { SectorRotationContext } from "@/lib/utils/sector-rotation";
import type { DeepDiveAnalysis, TradeRecommendation } from "@/types/analysis";

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

  // Step 0: Fetch macro context (VIX + FOMC) — used by recommendations + deep dives
  const vixLevel = await fetchVIX();
  const vixCtx = vixLevel != null ? buildVIXContext(vixLevel) : null;
  const fomcCtx = getFOMCProximity();
  const macroBase = {
    vixLevel: vixCtx?.level ?? null,
    vixRegime: vixCtx?.regime,
    fomcNextDate: fomcCtx.nextDate,
    fomcIsDecisionWeek: fomcCtx.isDecisionWeek,
  };
  console.log(
    `[AnalysisPipeline] Macro context: VIX=${vixCtx?.level?.toFixed(2) ?? "N/A"} (${vixCtx?.regime ?? "N/A"}), ` +
      `FOMC next=${fomcCtx.nextDate} (decision week: ${fomcCtx.isDecisionWeek})`,
  );

  // Step 1: Fetch recent high-impact news (last 24h, impact >= 5)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const recentNews = await db
    .select()
    .from(newsEvents)
    .where(
      and(gte(newsEvents.createdAt, since), gte(newsEvents.impactScore, 5)),
    )
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
      `[AnalysisPipeline] Insufficient data: ${recentNews.length} news, ${recentWhales.length} whales — skipping`,
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
    qualityScore: w.qualityScore ?? undefined,
  }));

  // Fetch insider transactions for unique whale tickers (top 10 to respect rate limits)
  const uniqueWhaleTickers = [
    ...new Set(recentWhales.map((w) => w.ticker)),
  ].slice(0, 10);
  let insiderContextJson: string | undefined;
  const insiderSentimentMap = new Map<string, InsiderSentiment>();
  try {
    const insiderResults = await Promise.all(
      uniqueWhaleTickers.map(async (ticker) => {
        const txns = await fetchInsiderTransactions(ticker);
        if (txns.length === 0) return null;
        return computeInsiderSentiment(ticker, txns);
      }),
    );
    const insiderData = insiderResults.filter(Boolean);
    if (insiderData.length > 0) {
      for (const s of insiderData) {
        if (s) insiderSentimentMap.set(s.ticker, s);
      }
      insiderContextJson = JSON.stringify(insiderData, null, 2);
      console.log(
        `[AnalysisPipeline] Insider data fetched for ${insiderData.length} tickers`,
      );
    }
  } catch (err) {
    console.warn(
      "[AnalysisPipeline] Insider fetch failed (non-critical):",
      err,
    );
  }

  // Fetch sector rotation context for cross-reference
  let sectorRotationPrompt: string | undefined;
  let sectorRotationCtx: SectorRotationContext | null = null;
  try {
    const sectorPerf = await fetchSectorPerformance();
    if (sectorPerf.length > 0) {
      sectorRotationCtx = classifyRotation(sectorPerf);
      sectorRotationPrompt =
        buildSectorRotationPromptContext(sectorRotationCtx);
      console.log(
        `[AnalysisPipeline] Sector rotation: ${sectorRotationCtx.regime}`,
      );
    }
  } catch (err) {
    console.warn(
      "[AnalysisPipeline] Sector rotation fetch failed (non-critical):",
      err,
    );
  }

  const crossRef = await crossReferenceAnalysis(
    newsForCorrelation,
    whalesForCorrelation,
    insiderContextJson,
    sectorRotationPrompt,
  );

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
      confidence:
        crossRef.correlations.length > 0
          ? crossRef.correlations.reduce(
              (sum, c) => sum + c.correlation_confidence,
              0,
            ) / crossRef.correlations.length
          : 0,
    });
    stored++;
  } catch (error) {
    console.error("[AnalysisPipeline] Failed to store cross-reference:", error);
  }

  console.log(
    `[AnalysisPipeline] Cross-reference: ${crossRef.correlations.length} correlations, ` +
      `${crossRef.uncorrelated_whales.length} uncorrelated whales`,
  );
  progress.complete(STEP_CROSS_REF);

  // Step 4: Generate recommendations for high-confidence correlations
  const highConfCorrelations = crossRef.correlations.filter(
    (c) => c.correlation_confidence >= MIN_CORRELATION_CONFIDENCE,
  );

  progress.activate(
    STEP_RECOMMENDATIONS,
    highConfCorrelations.length > 0
      ? `0/${highConfCorrelations.length} tickers`
      : "skipped",
  );

  if (highConfCorrelations.length > 0) {
    console.log(
      `[AnalysisPipeline] Generating recommendations for ${highConfCorrelations.length} high-confidence correlations`,
    );

    let recsDone = 0;
    for (
      let i = 0;
      i < highConfCorrelations.length;
      i += RECOMMEND_CONCURRENCY
    ) {
      const chunk = highConfCorrelations.slice(i, i + RECOMMEND_CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map(async (correlation) => {
          const ticker = correlation.whale_trade.ticker;

          // Fetch fresh market data for the ticker
          const [marketData] = await fetchMarketData([ticker]);
          const chain = await fetchOptionsChain(ticker);

          // Compute IV-RV spread for options pricing context
          let realizedVol: number | null = null;
          let ivRvSpread: number | null = null;
          let atmIV: number | null = null;
          if (chain && marketData) {
            const allContracts = [
              ...chain.nearestExpiry.calls,
              ...chain.nearestExpiry.puts,
            ];
            const atmContracts = allContracts.filter(
              (c) =>
                Math.abs(c.strike - marketData.price) / marketData.price <
                  0.05 && c.iv > 0,
            );
            if (atmContracts.length > 0) {
              atmIV =
                atmContracts.reduce((s, c) => s + c.iv, 0) /
                atmContracts.length;
              const candles = await fetchHistoricalData(ticker, "3mo");
              realizedVol = computeRealizedVol(candles);
              if (realizedVol != null && atmIV != null) {
                ivRvSpread = atmIV - realizedVol;
              }
            }
          }

          // Fetch earnings date for IV crush risk context
          const earningsDate = await fetchEarningsDate(ticker);
          const earningsCtx = getEarningsProximity(
            earningsDate,
            correlation.whale_trade.expiry,
          );

          const recommendation = await generateRecommendation(correlation, {
            price: marketData?.price ?? 0,
            ivRank: undefined,
            avgVolume: marketData?.volume ?? 0,
            todayVolume: marketData?.volume ?? 0,
            optionsChainSummary: chain
              ? `${chain.expirations.length} expirations, nearest: ${chain.nearestExpiry.date} (${chain.nearestExpiry.calls.length} calls, ${chain.nearestExpiry.puts.length} puts)`
              : "No options chain data available",
            macroContext: {
              ...macroBase,
              earningsDate: earningsCtx.earningsDate,
              ivCrushRisk: earningsCtx.ivCrushRisk,
            },
            optionsAnalytics: chain
              ? {
                  maxPain: chain.maxPain ?? null,
                  oiWalls: chain.oiWalls ?? null,
                  ivRvSpread,
                  realizedVol,
                  gex: chain.gex ?? null,
                }
              : undefined,
            sectorRotationContext: sectorRotationPrompt,
          });

          // Store latest market snapshot
          if (marketData) {
            try {
              await db.insert(marketSnapshots).values({
                ticker: marketData.ticker,
                price: marketData.price,
                volume: marketData.volume,
                iv: atmIV ?? marketData.iv ?? null,
                ivRank: marketData.ivRank ?? null,
                dayChangePct: marketData.dayChangePct,
                realizedVol,
                ivRvSpread,
              });
            } catch {
              /* ignore duplicate snapshot */
            }
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
              `(${recommendation.primary_strategy.name}, confidence: ${recommendation.confidence})`,
          );
          return 1;
        }),
      );

      for (const result of results) {
        if (result.status === "fulfilled") stored += result.value;
        else
          console.error(
            "[AnalysisPipeline] Recommendation failed:",
            result.reason,
          );
      }
      recsDone += chunk.length;
      progress.updateDetail(
        STEP_RECOMMENDATIONS,
        `${recsDone}/${highConfCorrelations.length} tickers`,
      );
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
    correlatedEvent?: {
      headline: string;
      impact_score: number;
      event_type: string;
    };
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
    if (seenTickers.has(u.ticker) || deepDiveQueue.length >= MAX_DEEP_DIVES)
      continue;
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
            console.warn(
              `[AnalysisPipeline] No price data for ${item.ticker}, skipping deep dive`,
            );
            return 0;
          }

          // Compute IV-RV spread for deep dive options context
          let ddRealizedVol: number | null = null;
          let ddIvRvSpread: number | null = null;
          if (chain && currentPrice > 0) {
            const allC = [
              ...chain.nearestExpiry.calls,
              ...chain.nearestExpiry.puts,
            ];
            const atm = allC.filter(
              (c) =>
                Math.abs(c.strike - currentPrice) / currentPrice < 0.05 &&
                c.iv > 0,
            );
            if (atm.length > 0) {
              const avgIV = atm.reduce((s, c) => s + c.iv, 0) / atm.length;
              ddRealizedVol = computeRealizedVol(historicalData);
              if (ddRealizedVol != null) {
                ddIvRvSpread = avgIV - ddRealizedVol;
              }
            }
          }

          const deepDive = await generateDeepDive({
            ticker: item.ticker,
            whaleTrade: item.whaleTrade,
            historicalData,
            optionsChain: chain,
            currentPrice,
            correlatedEvent: item.correlatedEvent,
            newsContext,
            macroContext: macroBase,
            optionsAnalytics: chain
              ? {
                  maxPain: chain.maxPain ?? null,
                  oiWalls: chain.oiWalls ?? null,
                  ivRvSpread: ddIvRvSpread,
                  realizedVol: ddRealizedVol,
                  gex: chain.gex ?? null,
                }
              : undefined,
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
        else
          console.error("[AnalysisPipeline] Deep dive failed:", result.reason);
      }
      divesDone += chunk.length;
      progress.updateDetail(
        STEP_DEEP_DIVES,
        `${divesDone}/${deepDiveQueue.length} tickers`,
      );
    }
  }
  progress.complete(STEP_DEEP_DIVES);

  // Step 6: Confidence feedback loop — adjust recommendation confidence using deep dive results
  if (deepDiveQueue.length > 0) {
    console.log("[AnalysisPipeline] Running confidence feedback loop...");

    // Fetch the deep dives and recommendations we just stored (current cycle)
    const recentDeepDives = await db
      .select()
      .from(analyses)
      .where(
        and(gte(analyses.createdAt, since), eq(analyses.type, "deep_dive")),
      )
      .orderBy(desc(analyses.createdAt));

    const recentRecs = await db
      .select()
      .from(analyses)
      .where(
        and(
          gte(analyses.createdAt, since),
          eq(analyses.type, "trade_recommendation"),
        ),
      )
      .orderBy(desc(analyses.createdAt));

    for (const diveRow of recentDeepDives) {
      try {
        const diveOutput = JSON.parse(
          diveRow.output ?? "{}",
        ) as DeepDiveAnalysis;
        const diveTicker = diveOutput.ticker;
        if (!diveTicker) continue;

        // Find matching recommendation by ticker
        const matchingRec = recentRecs.find((r) => {
          const refs = JSON.parse(r.inputRefs ?? "{}");
          return refs.correlationTicker === diveTicker;
        });
        if (!matchingRec) continue;

        const recOutput = JSON.parse(
          matchingRec.output ?? "{}",
        ) as TradeRecommendation;
        const adjustment = computeConfidenceAdjustment(diveOutput, recOutput);

        if (adjustment.delta !== 0) {
          await db
            .update(analyses)
            .set({ confidence: adjustment.adjusted })
            .where(eq(analyses.id, matchingRec.id));

          console.log(
            `[AnalysisPipeline] Confidence adjusted: ${diveTicker} ` +
              `${adjustment.original.toFixed(2)} → ${adjustment.adjusted.toFixed(2)} ` +
              `(${adjustment.delta > 0 ? "+" : ""}${adjustment.delta.toFixed(3)} from deep dive feedback)`,
          );
        }
      } catch {
        // Non-critical — skip any parsing errors
      }
    }

    // Step 7: Compute composite confidence for each recommendation
    console.log("[AnalysisPipeline] Computing composite confidence scores...");

    // Re-fetch recommendations (confidence may have been updated by feedback loop)
    const updatedRecs = await db
      .select()
      .from(analyses)
      .where(
        and(
          gte(analyses.createdAt, since),
          eq(analyses.type, "trade_recommendation"),
        ),
      )
      .orderBy(desc(analyses.createdAt));

    for (const recRow of updatedRecs) {
      try {
        const refs = JSON.parse(recRow.inputRefs ?? "{}");
        const ticker = refs.correlationTicker as string;
        const correlationConf = (refs.correlationConfidence as number) ?? 0.5;
        const recOutput = JSON.parse(
          recRow.output ?? "{}",
        ) as TradeRecommendation;

        // Gather whale quality score from DB
        const whaleRow = recentWhales.find((w) => w.ticker === ticker);
        const whaleQuality = whaleRow?.qualityScore ?? null;

        // Gather IV percentile from market snapshot
        const snapRow = await db
          .select()
          .from(marketSnapshots)
          .where(eq(marketSnapshots.ticker, ticker))
          .orderBy(desc(marketSnapshots.capturedAt))
          .limit(1);
        const ivPercentile = snapRow[0]?.ivRank ?? null;

        // Parse earnings risk from recommendation output
        const earningsRisk =
          recOutput.market_context?.catalyst_date != null
            ? recOutput.market_context.days_to_catalyst != null &&
              recOutput.market_context.days_to_catalyst <= 3
              ? "high"
              : recOutput.market_context.days_to_catalyst != null &&
                  recOutput.market_context.days_to_catalyst <= 14
                ? "moderate"
                : "low"
            : "none";

        const composite = computeCompositeConfidence({
          geminiCorrelationConf: correlationConf,
          whaleQualityScore: whaleQuality,
          technicalAlignmentScore: recRow.confidence,
          ivPercentile,
          vixLevel: macroBase.vixLevel,
          earningsRisk,
          insiderSentiment: insiderSentimentMap.get(ticker) ?? null,
          direction: recOutput.direction,
          sectorRotation: sectorRotationCtx,
        });

        await db
          .update(analyses)
          .set({
            confidence: composite.composite,
            confidenceBreakdown: JSON.stringify(composite),
          })
          .where(eq(analyses.id, recRow.id));

        console.log(
          `[AnalysisPipeline] Composite confidence for ${ticker}: ${composite.composite.toFixed(3)} ` +
            `(${composite.factors.filter((f) => f.weight > 0).length} factors)`,
        );
      } catch {
        // Non-critical
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
