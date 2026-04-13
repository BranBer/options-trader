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
  buildRichOptionsChainSummary,
} from "@/lib/services/llm-analyzer";
import {
  fetchMarketData,
  fetchOptionsChain,
  fetchHistoricalData,
  fetchVIX,
  fetchEarningsDate,
  fetchEpsSurprise,
  computeRealizedVol,
  getOrFetchShortInterest,
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
import { isTimeframeAwareDeepDiveOutput } from "@/lib/utils/deep-dive-freshness";
import { detectAllIndicatorPatterns } from "@/lib/utils/indicator-patterns";
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
} from "@/types/analysis";
import {
  computeSignalScorecard,
  type ScorecardInput,
} from "@/lib/utils/signal-scorecard";
import {
  buildTriggerReport,
  type TriggerReport,
} from "@/lib/utils/trigger-engine";
import { computeAlgoSR } from "@/lib/utils/algo-sr";
import { computeVolumeProfile } from "@/lib/utils/volume-profile";
import { DEEP_DIVE_PIPELINE_VERSION } from "@/lib/cron/pipelines/pipeline-version";

const MIN_CORRELATION_CONFIDENCE = 0.5;
const RECOMMEND_CONCURRENCY = 2;
const DEEP_DIVE_CONCURRENCY = 2;

function getWhaleRefMetadata(
  whales: Array<{ id: number; ticker: string; createdAt: string | null }>,
  ticker: string,
): { primaryWhaleId: number | null; whaleIds: number[] } {
  const matches = whales
    .filter((whale) => whale.ticker === ticker)
    .sort(
      (left, right) =>
        Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? ""),
    );

  return {
    primaryWhaleId: matches[0]?.id ?? null,
    whaleIds: matches.slice(0, 5).map((whale) => whale.id),
  };
}

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

/** Derive a simple whale direction string from a smart_money_signal value */
function smartMoneyToDirection(
  signal: string,
): "bullish" | "bearish" | "neutral" {
  if (signal.includes("bullish")) return "bullish";
  if (signal.includes("bearish")) return "bearish";
  return "neutral";
}

// Progress step indices (must match scheduler.ts init order)
const STEP_CROSS_REF = 2;
const STEP_RECOMMENDATIONS = 3;
const STEP_DEEP_DIVES = 4;

// Story 17.2 — Reduced input limits for fallback
const REDUCED_NEWS_LIMIT = 10;
const REDUCED_WHALE_LIMIT = 15;

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

  // Step 0b: Nexus earnings monitor — check which nexus companies recently reported
  const recentNexusEarnings = new Map<string, NexusEarnings>();
  const CASCADE_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours
  for (const nexus of NEXUS_COMPANIES) {
    try {
      const earningsDate = await fetchEarningsDate(nexus.ticker);
      if (!earningsDate) continue;
      const reportedMs = new Date(earningsDate).getTime();
      const hoursSince = (Date.now() - reportedMs) / (1000 * 60 * 60);
      // Earnings date is in the past and within 72h = recently reported
      if (hoursSince >= 0 && hoursSince <= 72) {
        // Fetch real EPS surprise data (Story 43.7)
        const epsData = await fetchEpsSurprise(nexus.ticker);
        recentNexusEarnings.set(nexus.ticker, {
          reportedAt: earningsDate,
          epsSurprisePct: epsData?.epsSurprisePct ?? 0,
        });
        if (epsData) {
          console.log(
            `[AnalysisPipeline] ${nexus.ticker} EPS surprise: ${epsData.epsSurprisePct.toFixed(1)}% (actual=${epsData.epsActual}, est=${epsData.epsEstimate})`,
          );
        }
      }
    } catch {
      // Non-critical — skip this nexus company
    }
  }
  if (recentNexusEarnings.size > 0) {
    console.log(
      `[AnalysisPipeline] Cascade monitor: ${recentNexusEarnings.size} nexus companies reported recently: ${[...recentNexusEarnings.keys()].join(", ")}`,
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
  let recsGenerated = 0;

  progress.activate(
    STEP_RECOMMENDATIONS,
    highConfCorrelations.length > 0
      ? `0/${highConfCorrelations.length} tickers`
      : "whale signals",
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
          const [candles1W, candles1M, candles3M] = await Promise.all([
            fetchHistoricalData(ticker, "1wk"),
            fetchHistoricalData(ticker, "1mo"),
            fetchHistoricalData(ticker, "3mo"),
          ]);

          // Compute multi-timeframe indicator reports (Story 39.7)
          const indicatorReport = detectAllIndicatorPatterns(
            candles3M,
            ticker,
            "3M",
          );
          const indicatorReportsByTimeframe: Partial<
            Record<string, ReturnType<typeof detectAllIndicatorPatterns>>
          > = {
            "1W":
              candles1W.length > 0
                ? detectAllIndicatorPatterns(candles1W, ticker, "1W")
                : undefined,
            "1M":
              candles1M.length > 0
                ? detectAllIndicatorPatterns(candles1M, ticker, "1M")
                : undefined,
            "3M": indicatorReport,
          };
          // Remove empty timeframes
          for (const tf of Object.keys(
            indicatorReportsByTimeframe,
          ) as string[]) {
            if (!indicatorReportsByTimeframe[tf])
              delete indicatorReportsByTimeframe[tf];
          }

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
              realizedVol = computeRealizedVol(candles3M);
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

          // Fetch short interest (24h cached)
          const siData = await getOrFetchShortInterest(ticker).catch(
            () => null,
          );

          // Cascade detection for this ticker
          const cascadeCtx = detectCascade(
            ticker,
            NEXUS_COMPANIES,
            recentNexusEarnings,
          );

          // Story 39.8 — deep dive summary from previous cycle (if available)
          const priorDive = deepDiveMap.get(ticker);
          const deepDiveSummary = priorDive
            ? extractDeepDiveSummary(priorDive)
            : null;

          // Story 39.11 — compute signal scorecard
          let pcRatio: number | null = null;
          if (chain) {
            const totalCallVol = chain.nearestExpiry.calls.reduce(
              (s, c) => s + c.volume,
              0,
            );
            const totalPutVol = chain.nearestExpiry.puts.reduce(
              (s, c) => s + c.volume,
              0,
            );
            pcRatio = totalCallVol > 0 ? totalPutVol / totalCallVol : null;
          }
          // Story 48.6 — compute trigger report from 3M daily candles
          let triggerReport: TriggerReport | null = null;
          if (candles3M.length >= 10 && marketData) {
            const vp = computeVolumeProfile(candles3M);
            const algoSRLevels = computeAlgoSR({
              candles: candles3M,
              currentPrice: marketData.price,
              volumeProfile: vp,
              oiWalls: chain?.oiWalls ?? null,
              maxPain: chain?.maxPain ?? null,
              gex:
                (chain?.gex as
                  | import("@/lib/utils/gex-calculator").GEXSummary
                  | null) ?? null,
            });
            triggerReport = buildTriggerReport({
              ticker,
              candles: candles3M,
              algoSRLevels,
              volumeProfile: vp,
              dailyPatterns: indicatorReport ?? null, // 3M daily candle patterns
              htfPatterns: [
                indicatorReportsByTimeframe?.["1W"],
                indicatorReportsByTimeframe?.["1M"],
                indicatorReportsByTimeframe?.["3M"],
              ].filter((r): r is NonNullable<typeof r> => r != null),
            });
          }

          const scorecardInput: ScorecardInput = {
            whaleDirection: smartMoneyToDirection(
              correlation.smart_money_signal,
            ),
            whalePremium: correlation.whale_trade.premium,
            whaleOptionType: correlation.whale_trade.type,
            indicatorReportsByTimeframe,
            pcRatio,
            gexPositioning: chain?.gex?.dealerPositioning ?? null,
            shortInterest: siData,
            deepDiveSummary,
            triggerReport,
          };
          const scorecard = computeSignalScorecard(scorecardInput);

          const recommendation = await generateRecommendation(correlation, {
            price: marketData?.price ?? 0,
            ivRank: atmIV != null ? Math.round(atmIV * 100) : undefined,
            avgVolume: marketData?.volume ?? 0,
            todayVolume: marketData?.volume ?? 0,
            optionsChainSummary: chain
              ? buildRichOptionsChainSummary(chain, marketData?.price ?? 0)
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
            indicatorReport,
            indicatorReportsByTimeframe,
            whaleIntentHint:
              recentWhales.find((w) => w.ticker === ticker)?.intentHint ?? null,
            shortInterest: siData,
            cascadeContext: cascadeCtx,
            deepDiveSummary,
            scorecard,
            triggerReport,
          });
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
          const whaleRefMetadata = getWhaleRefMetadata(recentWhales, ticker);
          await db.insert(analyses).values({
            type: "trade_recommendation",
            inputRefs: JSON.stringify({
              correlationTicker: ticker,
              correlationConfidence: correlation.correlation_confidence,
              primaryWhaleId: whaleRefMetadata.primaryWhaleId,
              whaleIds: whaleRefMetadata.whaleIds,
              triggerReport,
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
        if (result.status === "fulfilled") {
          stored += result.value;
          recsGenerated += result.value;
        } else
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

  // Step 4b: Fallback — generate whale-signal-only recommendations if correlations were insufficient
  if (recsGenerated < MIN_RECOMMENDATIONS) {
    const remaining = MIN_RECOMMENDATIONS - recsGenerated;
    const recTickers = new Set(
      highConfCorrelations.map((c) => c.whale_trade.ticker),
    );

    // Sort whale alerts by premium descending, deduplicate by ticker, skip already-recommended
    const fallbackWhales: Array<{
      ticker: string;
      type: "call" | "put";
      premium: number;
      note: string;
    }> = [];
    const fbSeen = new Set<string>();
    for (const w of [...recentWhales].sort(
      (a, b) => (b.premium ?? 0) - (a.premium ?? 0),
    )) {
      if (fbSeen.has(w.ticker) || recTickers.has(w.ticker)) continue;
      fbSeen.add(w.ticker);
      fallbackWhales.push({
        ticker: w.ticker,
        type: w.callPut === "P" ? "put" : "call",
        premium: w.premium ?? 0,
        note: `${w.callPut === "P" ? "Put" : "Call"} $${((w.premium ?? 0) / 1e6).toFixed(1)}M premium`,
      });
      if (fallbackWhales.length >= remaining) break;
    }

    if (fallbackWhales.length > 0) {
      console.log(
        `[AnalysisPipeline] Generating ${fallbackWhales.length} whale-signal-only recommendations (fallback)`,
      );

      for (let i = 0; i < fallbackWhales.length; i += RECOMMEND_CONCURRENCY) {
        const chunk = fallbackWhales.slice(i, i + RECOMMEND_CONCURRENCY);
        const results = await Promise.allSettled(
          chunk.map(async (uncorr) => {
            const ticker = uncorr.ticker;
            // Find full whale alert details
            const whaleRow = recentWhales.find((w) => w.ticker === ticker);

            // Build a synthetic correlation for the recommendation prompt
            const syntheticCorrelation = {
              whale_trade: {
                ticker,
                strike: whaleRow?.strike ?? 0,
                expiry: whaleRow?.expiry ?? "",
                type: uncorr.type as "call" | "put",
                premium: uncorr.premium,
                volume: whaleRow?.volume ?? 0,
              },
              related_event: {
                headline: "No specific news catalyst — pure whale-signal trade",
                impact_score: 0,
                event_type: "whale_signal_only",
              },
              correlation_confidence: 0,
              alignment: "confirming" as const,
              thesis: uncorr.note,
              smart_money_signal: "bullish" as const,
            };

            const [marketData] = await fetchMarketData([ticker]);
            const chain = await fetchOptionsChain(ticker);
            const [candles1W, candles1M, candles3M] = await Promise.all([
              fetchHistoricalData(ticker, "1wk"),
              fetchHistoricalData(ticker, "1mo"),
              fetchHistoricalData(ticker, "3mo"),
            ]);

            let realizedVol: number | null = null;
            let ivRvSpread: number | null = null;
            let atmIV: number | null = null;
            const indicatorReport = detectAllIndicatorPatterns(
              candles3M,
              ticker,
              "3M",
            );
            const indicatorReportsByTimeframe: Partial<
              Record<string, ReturnType<typeof detectAllIndicatorPatterns>>
            > = {
              "1W":
                candles1W.length > 0
                  ? detectAllIndicatorPatterns(candles1W, ticker, "1W")
                  : undefined,
              "1M":
                candles1M.length > 0
                  ? detectAllIndicatorPatterns(candles1M, ticker, "1M")
                  : undefined,
              "3M": indicatorReport,
            };
            for (const tf of Object.keys(
              indicatorReportsByTimeframe,
            ) as string[]) {
              if (!indicatorReportsByTimeframe[tf])
                delete indicatorReportsByTimeframe[tf];
            }
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
                realizedVol = computeRealizedVol(candles3M);
                if (realizedVol != null && atmIV != null) {
                  ivRvSpread = atmIV - realizedVol;
                }
              }
            }

            const earningsDate = await fetchEarningsDate(ticker);
            const earningsCtx = getEarningsProximity(
              earningsDate,
              whaleRow?.expiry ?? "",
            );

            // Story 39.8/39.11 — deep dive context + scorecard for fallback recs
            const priorDiveFb = deepDiveMap.get(ticker);
            const deepDiveSummaryFb = priorDiveFb
              ? extractDeepDiveSummary(priorDiveFb)
              : null;
            let pcRatioFb: number | null = null;
            if (chain) {
              const tcv = chain.nearestExpiry.calls.reduce(
                (s, c) => s + c.volume,
                0,
              );
              const tpv = chain.nearestExpiry.puts.reduce(
                (s, c) => s + c.volume,
                0,
              );
              pcRatioFb = tcv > 0 ? tpv / tcv : null;
            }
            const fbSiData = await getOrFetchShortInterest(ticker).catch(
              () => null,
            );

            // Story 48.6 — trigger report for fallback recs
            let triggerReportFb: TriggerReport | null = null;
            if (candles3M.length >= 10 && marketData) {
              const vpFb = computeVolumeProfile(candles3M);
              const algoSRFb = computeAlgoSR({
                candles: candles3M,
                currentPrice: marketData.price,
                volumeProfile: vpFb,
                oiWalls: chain?.oiWalls ?? null,
                maxPain: chain?.maxPain ?? null,
                gex:
                  (chain?.gex as
                    | import("@/lib/utils/gex-calculator").GEXSummary
                    | null) ?? null,
              });
              triggerReportFb = buildTriggerReport({
                ticker,
                candles: candles3M,
                algoSRLevels: algoSRFb,
                volumeProfile: vpFb,
                dailyPatterns: indicatorReport ?? null, // 3M daily candle patterns
                htfPatterns: [
                  indicatorReportsByTimeframe?.["1W"],
                  indicatorReportsByTimeframe?.["1M"],
                  indicatorReportsByTimeframe?.["3M"],
                ].filter((r): r is NonNullable<typeof r> => r != null),
              });
            }

            const scorecardFb = computeSignalScorecard({
              whaleDirection: uncorr.type === "put" ? "bearish" : "bullish",
              whalePremium: uncorr.premium,
              whaleOptionType: uncorr.type,
              indicatorReportsByTimeframe,
              pcRatio: pcRatioFb,
              gexPositioning: chain?.gex?.dealerPositioning ?? null,
              shortInterest: fbSiData,
              deepDiveSummary: deepDiveSummaryFb,
              triggerReport: triggerReportFb,
            });

            const recommendation = await generateRecommendation(
              syntheticCorrelation,
              {
                price: marketData?.price ?? 0,
                ivRank: atmIV != null ? Math.round(atmIV * 100) : undefined,
                avgVolume: marketData?.volume ?? 0,
                todayVolume: marketData?.volume ?? 0,
                optionsChainSummary: chain
                  ? buildRichOptionsChainSummary(chain, marketData?.price ?? 0)
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
                indicatorReport,
                indicatorReportsByTimeframe,
                whaleIntentHint: whaleRow?.intentHint ?? null,
                cascadeContext: detectCascade(
                  ticker,
                  NEXUS_COMPANIES,
                  recentNexusEarnings,
                ),
                deepDiveSummary: deepDiveSummaryFb,
                scorecard: scorecardFb,
                triggerReport: triggerReportFb,
              },
            );

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

            await db.insert(analyses).values({
              type: "trade_recommendation",
              inputRefs: JSON.stringify({
                whaleSignalTicker: ticker,
                whaleSignalOnly: true,
                primaryWhaleId: whaleRow?.id ?? null,
                whaleIds: whaleRow?.id != null ? [whaleRow.id] : [],
              }),
              output: JSON.stringify(recommendation),
              confidence: recommendation.confidence,
            });

            console.log(
              `[AnalysisPipeline] Whale-signal recommendation for ${ticker}: ${recommendation.direction} ` +
                `(${recommendation.primary_strategy.name}, confidence: ${recommendation.confidence})`,
            );
            return 1;
          }),
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            stored += result.value;
            recsGenerated += result.value;
          } else
            console.error(
              "[AnalysisPipeline] Whale-signal recommendation failed:",
              result.reason,
            );
        }
        progress.updateDetail(
          STEP_RECOMMENDATIONS,
          `${recsGenerated} recs (${fallbackWhales.length} whale-signal)`,
        );
      }
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
          // Fetch historical data + options chain + current price
          const [
            historicalData1D,
            historicalData1W,
            historicalData1M,
            historicalData3M,
            historicalData6M,
            historicalData1Y,
            chain,
            [marketSnap],
          ] = await Promise.all([
            fetchHistoricalData(item.ticker, "1d"),
            fetchHistoricalData(item.ticker, "1wk"),
            fetchHistoricalData(item.ticker, "1mo"),
            fetchHistoricalData(item.ticker, "3mo"),
            fetchHistoricalData(item.ticker, "6mo"),
            fetchHistoricalData(item.ticker, "1y"),
            fetchOptionsChain(item.ticker),
            fetchMarketData([item.ticker]),
          ]);
          const historicalData = historicalData3M;

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
              shortInterest: await getOrFetchShortInterest(item.ticker).catch(
                () => null,
              ),
              cascadeContext: detectCascade(
                item.ticker,
                NEXUS_COMPANIES,
                recentNexusEarnings,
              ),
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
