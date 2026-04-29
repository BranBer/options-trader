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
} from "@/lib/services/llm-analyzer";
import {
  fetchVIX,
  fetchEarningsDate,
  getOrFetchShortInterest,
} from "@/lib/services/market-fetcher";
import { desc, gte, eq, and } from "drizzle-orm";
import * as progress from "@/lib/cron/pipeline-progress";
import { buildVIXContext } from "@/lib/utils/vix-regimes";
import { getEarningsProximity } from "@/lib/utils/earnings-proximity";
import { getFOMCProximity } from "@/lib/utils/fomc-calendar";
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
import { isTimeframeAwareDeepDiveOutput } from "@/lib/utils/deep-dive-freshness";
import {
  detectCascade,
  type NexusEarnings,
} from "@/lib/utils/cascade-detector";
import { NEXUS_COMPANIES } from "@/lib/data/nexus-companies";
import type { InsiderSentiment } from "@/types/insider";
import type { SectorRotationContext } from "@/lib/utils/sector-rotation";
import type {
  DeepDiveAnalysis,
  TradeRecommendation,
  DeepDiveSummary,
  RecommendationInput,
} from "@/types/analysis";
import {
  computeSignalScorecard,
  type ScorecardInput,
} from "@/lib/utils/signal-scorecard";
import { DEEP_DIVE_PIPELINE_VERSION } from "@/lib/cron/pipelines/pipeline-version";
import { buildTickerAnalysisContext } from "@/lib/services/ticker-context-builder";
import { buildRecommendationQueue } from "@/lib/services/recommendation-adapter";
import { buildRichOptionsChainSummary } from "@/lib/prompts/options-chain-summary";
import type { TickerAnalysisContext } from "@/types/ticker-context";
import type { AnalysisTimeframe } from "@/lib/utils/chart-timeframes";
import { getUpcomingCatalysts } from "@/lib/utils/economic-calendar";
import {
  getCachedNexusEarnings,
  getNexusEarningsAge,
} from "@/lib/services/nexus-earnings-cache";

const MIN_CORRELATION_CONFIDENCE = 0.5;
const RECOMMEND_CONCURRENCY = 2;
const DEEP_DIVE_CONCURRENCY = 2;

/** Story 39.8 — extract a concise DeepDiveSummary from a full DeepDiveAnalysis */
function extractDeepDiveSummary(dive: DeepDiveAnalysis): DeepDiveSummary {
  // Majority vote from technical_patterns[].type
  const types = dive.technical_patterns.map((p) => p.type);
  const bullish = types.filter((t) => t === "bullish").length;
  const bearish = types.filter((t) => t === "bearish").length;
  const overallSentiment: DeepDiveSummary["overallSentiment"] =
    bullish > bearish ? "bullish" : bearish > bullish ? "bearish" : "neutral";

  const keyPatterns = dive.technical_patterns.slice(0, 3).map((p) => ({
    name: p.name,
    signal: p.type as "bullish" | "bearish" | "neutral",
  }));

  const supportLevels = dive.support_resistance
    .filter((sr) => sr.type === "support")
    .map((sr) => sr.level);
  const resistanceLevels = dive.support_resistance
    .filter((sr) => sr.type === "resistance")
    .map((sr) => sr.level);

  const ivAssessment = dive.options_context.iv_interpretation ?? "";
  const thetaGreek = dive.options_context.greeks_breakdown?.find(
    (g) => g.greek === "theta",
  );
  const thetaAnalysis = thetaGreek
    ? `${thetaGreek.value}: ${thetaGreek.plain_english}`
    : dive.options_context.greeks_summary;

  return {
    overallSentiment,
    riskLevel: dive.risk_assessment.overall_risk,
    keyPatterns,
    supportLevels,
    resistanceLevels,
    ivAssessment,
    thetaAnalysis,
  };
}

// Progress step indices (must match scheduler.ts init order)
const STEP_CROSS_REF = 2;
const STEP_RECOMMENDATIONS = 3;
const STEP_DEEP_DIVES = 4;

// Story 17.2 — Reduced input limits for fallback
const REDUCED_NEWS_LIMIT = 10;
const REDUCED_WHALE_LIMIT = 15;

async function getOrBuildContext(
  cache: Map<string, TickerAnalysisContext>,
  ticker: string,
  timeframes: AnalysisTimeframe[],
): Promise<TickerAnalysisContext> {
  const context = await buildTickerAnalysisContext(ticker, {
    timeframes,
    existingContext: cache.get(ticker) ?? null,
  });
  cache.set(ticker, context);
  return context;
}

function computePutCallRatio(
  chain: TickerAnalysisContext["optionsChain"],
): number | null {
  if (!chain) return null;
  const totalCallVol = chain.nearestExpiry.calls.reduce(
    (sum, contract) => sum + contract.volume,
    0,
  );
  const totalPutVol = chain.nearestExpiry.puts.reduce(
    (sum, contract) => sum + contract.volume,
    0,
  );
  return totalCallVol > 0 ? totalPutVol / totalCallVol : null;
}

async function persistMarketSnapshot(
  ctx: TickerAnalysisContext,
): Promise<void> {
  const marketData = ctx.marketSnapshot;
  if (!marketData) return;

  try {
    await db.insert(marketSnapshots).values({
      ticker: marketData.ticker,
      price: marketData.price,
      volume: marketData.volume,
      avgVolume: marketData.avgVolume ?? null,
      iv: ctx.atmIV ?? marketData.iv ?? null,
      ivRank: marketData.ivRank ?? null,
      dayChangePct: marketData.dayChangePct,
      realizedVol: ctx.realizedVol,
      ivRvSpread: ctx.ivRvSpread,
    });
  } catch {
    /* ignore duplicate snapshot */
  }
}

async function processRecommendationItems(args: {
  items: RecommendationInput[];
  contextCache: Map<string, TickerAnalysisContext>;
  deepDiveMap: Map<string, DeepDiveAnalysis>;
  insiderSentimentMap: Map<string, InsiderSentiment>;
  macroBase: {
    vixLevel: number | null;
    vixRegime?: string;
    fomcNextDate?: string;
    fomcIsDecisionWeek?: boolean;
  };
  sectorRotationPrompt?: string;
  recentNexusEarnings: Map<string, NexusEarnings>;
  onProgress: (done: number, total: number) => void;
}): Promise<number> {
  let generated = 0;
  let done = 0;

  for (
    let index = 0;
    index < args.items.length;
    index += RECOMMEND_CONCURRENCY
  ) {
    const chunk = args.items.slice(index, index + RECOMMEND_CONCURRENCY);
    const results = await Promise.allSettled(
      chunk.map(async (item) => {
        const ticker = item.ticker;
        const ctx = await getOrBuildContext(args.contextCache, ticker, [
          "1W",
          "1M",
          "3M",
        ]);
        const marketData = ctx.marketSnapshot;
        if (!marketData) {
          console.warn(
            `[AnalysisPipeline] No market snapshot for ${ticker}, skipping recommendation`,
          );
          return 0;
        }

        const chain = ctx.optionsChain;
        const indicatorReport = ctx.indicatorsByTimeframe["3M"];
        const indicatorReportsByTimeframe = ctx.indicatorsByTimeframe;
        const earningsDate = await fetchEarningsDate(ticker);
        const earningsCtx = getEarningsProximity(
          earningsDate,
          item.expiryForEarningsContext,
        );
        const cascadeContext = detectCascade(
          ticker,
          NEXUS_COMPANIES,
          args.recentNexusEarnings,
        );
        const priorDive = args.deepDiveMap.get(ticker);
        const deepDiveSummary = priorDive
          ? extractDeepDiveSummary(priorDive)
          : null;
        const triggerReport = ctx.triggerReport;
        const scorecardInput: ScorecardInput = {
          whaleDirection: item.whaleDirection,
          whalePremium: item.correlation.whale_trade.premium,
          whaleOptionType: item.correlation.whale_trade.type,
          indicatorReportsByTimeframe,
          pcRatio: computePutCallRatio(chain),
          gexPositioning: chain?.gex?.dealerPositioning ?? null,
          shortInterest: ctx.shortInterest,
          deepDiveSummary,
          triggerReport,
        };
        const scorecard = computeSignalScorecard(scorecardInput);

        const recommendation = await generateRecommendation(item.correlation, {
          price: marketData.price ?? 0,
          ivRank: ctx.atmIV != null ? Math.round(ctx.atmIV * 100) : undefined,
          avgVolume: marketData.volume ?? 0,
          todayVolume: marketData.volume ?? 0,
          optionsChainSummary: chain
            ? buildRichOptionsChainSummary(chain, marketData.price ?? 0)
            : "No options chain data available",
          macroContext: {
            ...args.macroBase,
            earningsDate: earningsCtx.earningsDate,
            ivCrushRisk: earningsCtx.ivCrushRisk,
          },
          optionsAnalytics: chain
            ? {
                maxPain: chain.maxPain ?? null,
                oiWalls: chain.oiWalls ?? null,
                ivRvSpread: ctx.ivRvSpread,
                realizedVol: ctx.realizedVol,
                gex: chain.gex ?? null,
              }
            : undefined,
          sectorRotationContext: args.sectorRotationPrompt,
          indicatorReport,
          indicatorReportsByTimeframe,
          whaleIntentHint: item.whaleIntentHint,
          shortInterest: ctx.shortInterest,
          cascadeContext,
          deepDiveSummary,
          scorecard,
          triggerReport,
          insiderSentiment: args.insiderSentimentMap.get(ticker) ?? null,
        });

        await persistMarketSnapshot(ctx);
        await db.insert(analyses).values({
          type: "trade_recommendation",
          inputRefs: JSON.stringify({
            ...item.inputRefs,
            triggerReport,
          }),
          output: JSON.stringify(recommendation),
          confidence: recommendation.confidence,
        });

        console.log(
          `[AnalysisPipeline] ${item.source === "whale_signal" ? "Whale-signal recommendation" : "Recommendation"} for ${ticker}: ${recommendation.direction} ` +
            `(${recommendation.primary_strategy.name}, confidence: ${recommendation.confidence})`,
        );
        return 1;
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        generated += result.value;
      } else {
        console.error(
          "[AnalysisPipeline] Recommendation failed:",
          result.reason,
        );
      }
    }

    done += chunk.length;
    args.onProgress(done, args.items.length);
  }

  return generated;
}

/**
 * Story 17.2 — Cross-reference with fallback: if the full call fails after
 * retries, attempt a reduced-input call (fewer news/whales, no optional context).
 */
async function crossReferenceWithFallback(
  news: Parameters<typeof crossReferenceAnalysis>[0],
  whales: Parameters<typeof crossReferenceAnalysis>[1],
  insiderContextJson?: string,
  sectorRotationPrompt?: string,
): Promise<Awaited<ReturnType<typeof crossReferenceAnalysis>>> {
  try {
    return await crossReferenceAnalysis(
      news,
      whales,
      insiderContextJson,
      sectorRotationPrompt,
    );
  } catch {
    console.warn(
      "[AnalysisPipeline] Cross-reference failed with full input, retrying with reduced set",
    );

    // Reduced input: top news by impact, top whales by quality, no optional context
    const reducedNews = [...news]
      .sort((a, b) => b.impact_score - a.impact_score)
      .slice(0, REDUCED_NEWS_LIMIT);
    const reducedWhales = [...whales]
      .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))
      .slice(0, REDUCED_WHALE_LIMIT);

    try {
      const result = await crossReferenceAnalysis(
        reducedNews,
        reducedWhales,
        undefined, // Strip insider context
        undefined, // Strip sector rotation context
      );
      console.log(
        `[AnalysisPipeline] Reduced cross-reference succeeded: ${reducedNews.length} news, ${reducedWhales.length} whales → ${result.correlations.length} correlations`,
      );
      return result;
    } catch (reducedError) {
      console.error(
        "[AnalysisPipeline] Cross-reference failed with reduced input too:",
        reducedError instanceof Error ? reducedError.message : reducedError,
      );
      // Return empty result so pipeline can continue with prior-cycle data
      return {
        correlations: [],
        uncorrelated_whales: [],
        summary: "Cross-reference failed with both full and reduced input.",
        analysis_metadata: {
          news_events_analyzed: 0,
          whale_trades_analyzed: 0,
          correlations_found: 0,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }
}

// Story 17.5 — Track last *successful* pipeline completion, not just cross_reference insertion.
// This prevents a partial run (cross_reference stored but later stages crash) from
// making the staleness check skip re-processing on the next cycle.
let _lastSuccessfulCompletionAt: string | null = null;

/**
 * Analysis Pipeline: Cross-reference → Recommend → Store
 * Runs AFTER news and whale pipelines complete.
 * Returns count of analyses stored.
 */
export async function runAnalysisPipeline(options?: {
  force?: boolean;
}): Promise<number> {
  console.log("[AnalysisPipeline] Starting...");
  const contextCache = new Map<string, TickerAnalysisContext>();

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

  // Step 0b: Nexus earnings monitor — reuse cache populated outside the hot cycle.
  const recentNexusEarnings = getCachedNexusEarnings();
  if (recentNexusEarnings.size > 0) {
    const cacheAgeMinutes = Math.round(getNexusEarningsAge() / (1000 * 60));
    console.log(
      `[AnalysisPipeline] Cascade monitor: ${recentNexusEarnings.size} nexus companies reported recently (${cacheAgeMinutes}m old): ${[...recentNexusEarnings.keys()].join(", ")}`,
    );
  }

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

  // Story 17.5 — Staleness check: use last successful completion timestamp
  // instead of querying the cross_reference row (which may exist from a failed cycle)
  if (_lastSuccessfulCompletionAt && !options?.force) {
    const newestNewsTime = recentNews[0]?.createdAt ?? "";
    const newestWhaleTime = recentWhales[0]?.createdAt ?? "";

    if (
      newestNewsTime <= _lastSuccessfulCompletionAt &&
      newestWhaleTime <= _lastSuccessfulCompletionAt
    ) {
      // Before skipping, check if any recent deep dives need a version upgrade
      const oneDayAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString();
      const recentDivesForVersion = await db
        .select({ inputRefs: analyses.inputRefs })
        .from(analyses)
        .where(
          and(
            gte(analyses.createdAt, oneDayAgo),
            eq(analyses.type, "deep_dive"),
          ),
        );
      const needsUpgrade = recentDivesForVersion.some((d) => {
        try {
          const refs = JSON.parse(d.inputRefs ?? "{}");
          return (refs.pipelineVersion ?? 0) < DEEP_DIVE_PIPELINE_VERSION;
        } catch {
          return true;
        }
      });

      if (!needsUpgrade) {
        console.log(
          `[AnalysisPipeline] No new data since last successful run (${_lastSuccessfulCompletionAt}) — skipping LLM calls`,
        );
        progress.complete(STEP_CROSS_REF);
        progress.complete(STEP_RECOMMENDATIONS);
        progress.complete(STEP_DEEP_DIVES);
        return 0;
      }
      console.log(
        `[AnalysisPipeline] No new data, but ${
          recentDivesForVersion.filter((d) => {
            try {
              return (
                (JSON.parse(d.inputRefs ?? "{}").pipelineVersion ?? 0) <
                DEEP_DIVE_PIPELINE_VERSION
              );
            } catch {
              return true;
            }
          }).length
        } deep dive(s) need upgrade to v${DEEP_DIVE_PIPELINE_VERSION} — continuing pipeline`,
      );
    }
  }

  // Step 3: Cross-reference with LLM
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

  const crossRef = await crossReferenceWithFallback(
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

  // Story 39.8 — build a map of the most recent deep dive per ticker so recommendation
  // prompts receive deep-dive context.  Deep dives from previous pipeline cycles (up to 4h
  // old) feed into this cycle's recommendations; within a single run the deep dive still
  // runs AFTER recommendations (Step 5), so the map carries forward from prior cycles.
  const recentDiveRows = await db
    .select({ output: analyses.output })
    .from(analyses)
    .where(
      and(
        gte(
          analyses.createdAt,
          new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        ),
        eq(analyses.type, "deep_dive"),
      ),
    )
    .orderBy(desc(analyses.createdAt));

  const deepDiveMap = new Map<string, DeepDiveAnalysis>();
  for (const row of recentDiveRows) {
    try {
      const parsed = JSON.parse(row.output ?? "{}") as DeepDiveAnalysis;
      if (parsed.ticker && !deepDiveMap.has(parsed.ticker)) {
        deepDiveMap.set(parsed.ticker, parsed);
      }
    } catch {
      /* skip */
    }
  }
  if (deepDiveMap.size > 0) {
    console.log(
      `[AnalysisPipeline] Deep dive context loaded for ${deepDiveMap.size} tickers: ${[...deepDiveMap.keys()].join(", ")}`,
    );
  }

  // Step 4: Generate recommendations for high-confidence correlations
  const highConfCorrelations = crossRef.correlations.filter(
    (c) => c.correlation_confidence >= MIN_CORRELATION_CONFIDENCE,
  );

  const MIN_RECOMMENDATIONS = 3;
  const recommendationItems = buildRecommendationQueue({
    correlations: highConfCorrelations,
    recentWhales,
    minRecommendations: MIN_RECOMMENDATIONS,
  });

  progress.activate(
    STEP_RECOMMENDATIONS,
    recommendationItems.length > 0
      ? `0/${recommendationItems.length} tickers`
      : "none",
  );

  if (recommendationItems.length > 0) {
    console.log(
      `[AnalysisPipeline] Generating ${recommendationItems.length} recommendations (${highConfCorrelations.length} correlation-backed, ${recommendationItems.filter((item) => item.source === "whale_signal").length} whale-signal fallback)`,
    );
    const recsGenerated = await processRecommendationItems({
      items: recommendationItems,
      contextCache,
      deepDiveMap,
      insiderSentimentMap,
      macroBase,
      sectorRotationPrompt,
      recentNexusEarnings,
      onProgress: (done, total) => {
        progress.updateDetail(STEP_RECOMMENDATIONS, `${done}/${total} tickers`);
      },
    });
    stored += recsGenerated;
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

  // Fill remaining slots with uncorrelated whales from LLM output
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

  // Fill remaining slots from top whale alerts by premium (covers tickers the LLM may have omitted)
  const whalesByPremium = [...recentWhales]
    .filter((w) => (w.premium ?? 0) > 0)
    .sort((a, b) => (b.premium ?? 0) - (a.premium ?? 0));
  for (const w of whalesByPremium) {
    if (seenTickers.has(w.ticker) || deepDiveQueue.length >= MAX_DEEP_DIVES)
      continue;
    seenTickers.add(w.ticker);
    deepDiveQueue.push({
      ticker: w.ticker,
      whaleTrade: {
        ticker: w.ticker,
        strike: w.strike ?? 0,
        expiry: w.expiry ?? "",
        callPut: w.callPut ?? "C",
        premium: w.premium ?? 0,
        volume: w.volume ?? 0,
        openInterest: w.openInterest ?? 0,
        sentiment: w.sentiment ?? "neutral",
      },
    });
  }

  // Deep dive dedup: skip tickers that already have a deep dive from the last 4 hours
  if (deepDiveQueue.length > 0 && !options?.force) {
    const fourHoursAgo = new Date(
      Date.now() - 4 * 60 * 60 * 1000,
    ).toISOString();
    const recentDives = await db
      .select({ output: analyses.output, inputRefs: analyses.inputRefs })
      .from(analyses)
      .where(
        and(
          gte(analyses.createdAt, fourHoursAgo),
          eq(analyses.type, "deep_dive"),
        ),
      );
    const recentDiveTickers = new Set<string>();
    let staleRecentDiveCount = 0;
    for (const dd of recentDives) {
      try {
        const parsed = JSON.parse(dd.output ?? "{}");
        if (!parsed.ticker) {
          continue;
        }
        const refs = JSON.parse(dd.inputRefs ?? "{}");
        const currentVersion =
          (refs.pipelineVersion ?? 0) >= DEEP_DIVE_PIPELINE_VERSION;
        if (isTimeframeAwareDeepDiveOutput(dd.output) && currentVersion) {
          recentDiveTickers.add(parsed.ticker);
        } else {
          staleRecentDiveCount += 1;
        }
      } catch {
        /* skip */
      }
    }
    const beforeCount = deepDiveQueue.length;
    const filtered = deepDiveQueue.filter(
      (d) => !recentDiveTickers.has(d.ticker),
    );
    if (filtered.length < beforeCount) {
      console.log(
        `[AnalysisPipeline] Deep dive dedup: ${beforeCount} → ${filtered.length} (${beforeCount - filtered.length} already analyzed within 4h)`,
      );
      deepDiveQueue.length = 0;
      deepDiveQueue.push(...filtered);
    }
    if (staleRecentDiveCount > 0) {
      console.log(
        `[AnalysisPipeline] Deep dive dedup ignored ${staleRecentDiveCount} stale recent deep dive(s) without timeframe-aware patterns`,
      );
    }
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
          const [ctx, earningsDate] = await Promise.all([
            getOrBuildContext(contextCache, item.ticker, [
              "1D",
              "1W",
              "1M",
              "3M",
              "6M",
              "1Y",
            ]),
            fetchEarningsDate(item.ticker),
          ]);
          const historicalData1D = ctx.candlesByTimeframe["1D"] ?? [];
          const historicalData1W = ctx.candlesByTimeframe["1W"] ?? [];
          const historicalData1M = ctx.candlesByTimeframe["1M"] ?? [];
          const historicalData3M = ctx.candlesByTimeframe["3M"] ?? [];
          const historicalData6M = ctx.candlesByTimeframe["6M"] ?? [];
          const historicalData1Y = ctx.candlesByTimeframe["1Y"] ?? [];
          const historicalData = historicalData3M;
          const chain = ctx.optionsChain;
          const earningsCtx = getEarningsProximity(
            earningsDate,
            item.whaleTrade.expiry,
          );
          const currentPrice = ctx.marketSnapshot?.price ?? 0;
          if (currentPrice === 0) {
            console.warn(
              `[AnalysisPipeline] No price data for ${item.ticker}, skipping deep dive`,
            );
            return 0;
          }

          const { deepDive, triggerReport: ddTriggerReport } =
            await generateDeepDive({
              ticker: item.ticker,
              whaleTrade: item.whaleTrade,
              historicalData,
              historicalDataByTimeframe: {
                "1D": historicalData1D,
                "1W": historicalData1W,
                "1M": historicalData1M,
                "3M": historicalData3M,
                "6M": historicalData6M,
                "1Y": historicalData1Y,
              },
              optionsChain: chain,
              currentPrice,
              correlatedEvent: item.correlatedEvent,
              newsContext,
              macroContext: {
                ...macroBase,
                earningsDate: earningsCtx.earningsDate,
                ivCrushRisk: earningsCtx.ivCrushRisk,
              },
              optionsAnalytics: chain
                ? {
                    maxPain: chain.maxPain ?? null,
                    oiWalls: chain.oiWalls ?? null,
                    ivRvSpread: ctx.ivRvSpread,
                    realizedVol: ctx.realizedVol,
                    gex: chain.gex ?? null,
                  }
                : undefined,
              computedIndicators: ctx.indicatorsByTimeframe,
              shortInterest: ctx.shortInterest,
              cascadeContext: detectCascade(
                item.ticker,
                NEXUS_COMPANIES,
                recentNexusEarnings,
              ),
              signalHierarchy: {
                currentPrice,
                earningsDate: earningsCtx.earningsDate,
                volumeProfile: ctx.volumeProfile,
                algoSR: ctx.algoSR,
                ivSkew: ctx.ivSkew,
                oiSummary: ctx.oiSummary,
                catalysts: getUpcomingCatalysts(14),
              },
              triggerReport: ctx.triggerReport,
            });

          await db.insert(analyses).values({
            type: "deep_dive",
            inputRefs: JSON.stringify({
              ticker: item.ticker,
              triggerReport: ddTriggerReport,
              pipelineVersion: DEEP_DIVE_PIPELINE_VERSION,
            }),
            output: JSON.stringify(deepDive),
            confidence: null,
          });

          // Story 39.8 — update in-memory map so any subsequent same-cycle
          // logic (composite confidence, etc.) can reference it.
          deepDiveMap.set(item.ticker, deepDive);

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

  // Step 6: Compute composite confidence for each recommendation
  // (Story 39.8 — confidence feedback loop removed; deep dive now informs recs directly)
  if (deepDiveQueue.length > 0) {
    console.log("[AnalysisPipeline] Computing composite confidence scores...");

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
        const ticker = (refs.correlationTicker ??
          refs.whaleSignalTicker ??
          refs.ticker) as string | undefined;
        if (!ticker) continue; // skip rows with no resolvable ticker
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
          whaleIntentHint: whaleRow?.intentHint ?? null,
          shortInterestPctOfFloat: await getOrFetchShortInterest(ticker)
            .then((si) => si?.shortPercentOfFloat ?? null)
            .catch(() => null),
          cascadeStrength:
            detectCascade(ticker, NEXUS_COMPANIES, recentNexusEarnings)
              ?.cascadeStrength ?? null,
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

  // Story 17.5 — Mark successful completion so staleness check uses this timestamp
  _lastSuccessfulCompletionAt = new Date().toISOString();

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
