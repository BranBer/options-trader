import { db } from "@/lib/db/client";
import { analyses, newsEvents, whaleAlerts } from "@/lib/db/schema";
import { and, desc, gte, eq } from "drizzle-orm";
import { generateDeepDive } from "@/lib/services/llm-analyzer";
import { fetchVIX, fetchEarningsDate } from "@/lib/services/market-fetcher";
import { buildVIXContext } from "@/lib/utils/vix-regimes";
import { getEarningsProximity } from "@/lib/utils/earnings-proximity";
import { getFOMCProximity } from "@/lib/utils/fomc-calendar";
import {
  getRemainingBudget,
  isOverBudget,
  recordApiCall,
} from "@/lib/utils/api-budget";
import { DEEP_DIVE_PIPELINE_VERSION } from "@/lib/cron/pipelines/pipeline-version";
import type { TriggerReport } from "@/lib/utils/trigger-engine";
import type { DeepDiveAnalysis } from "@/types/analysis";
import { buildTickerAnalysisContext } from "@/lib/services/ticker-context-builder";
import { getUpcomingCatalysts } from "@/lib/utils/economic-calendar";

const YAHOO_CALLS_PER_REFRESH = 9; // 8 per-ticker + 1 VIX

export interface RefreshResult {
  deepDive: DeepDiveAnalysis;
  triggerReport: TriggerReport | null;
  createdAt: string;
}

export async function refreshTickerDeepDive(
  ticker: string,
): Promise<RefreshResult> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker || normalizedTicker.length > 10) {
    throw new Error("Invalid ticker");
  }

  // Budget check upfront
  if (
    isOverBudget("yahoo") ||
    getRemainingBudget("yahoo") < YAHOO_CALLS_PER_REFRESH
  ) {
    throw new BudgetExceededError(
      `Yahoo API budget too low for refresh (need ${YAHOO_CALLS_PER_REFRESH}, have ${getRemainingBudget("yahoo")})`,
    );
  }

  // Step 1: Build macro context (VIX + FOMC)
  const vixLevel = await fetchVIX();
  const vixCtx = vixLevel != null ? buildVIXContext(vixLevel) : null;
  const fomcCtx = getFOMCProximity();
  const macroBase = {
    vixLevel: vixCtx?.level ?? null,
    vixRegime: vixCtx?.regime,
    fomcNextDate: fomcCtx.nextDate,
    fomcIsDecisionWeek: fomcCtx.isDecisionWeek,
  };

  // Step 2: Recent news context from DB (no API calls)
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentNews = await db
    .select()
    .from(newsEvents)
    .where(
      and(gte(newsEvents.createdAt, since24h), gte(newsEvents.impactScore, 5)),
    )
    .orderBy(desc(newsEvents.createdAt))
    .limit(20);
  const newsContext = recentNews.slice(0, 5).map((n) => ({
    headline: n.headline,
    sentiment: n.sentiment ?? "neutral",
  }));

  // Step 3: Look up latest whale alert for this ticker
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const recentWhaleAlerts = await db
    .select()
    .from(whaleAlerts)
    .where(
      and(
        eq(whaleAlerts.ticker, normalizedTicker),
        gte(whaleAlerts.detectedAt, since48h),
      ),
    )
    .orderBy(desc(whaleAlerts.qualityScore), desc(whaleAlerts.detectedAt))
    .limit(1);
  const primaryWhale = recentWhaleAlerts[0] ?? null;

  const whaleTrade = {
    ticker: normalizedTicker,
    strike: primaryWhale?.strike ?? undefined,
    expiry: primaryWhale?.expiry ?? undefined,
    callPut: primaryWhale?.callPut ?? "C",
    premium: primaryWhale?.premium ?? undefined,
    volume: primaryWhale?.volume ?? undefined,
    openInterest: primaryWhale?.openInterest ?? undefined,
    sentiment: primaryWhale?.sentiment ?? "neutral",
  };

  // Step 4: Fetch all per-ticker market data in parallel
  const [ctx, earningsDate] = await Promise.all([
    buildTickerAnalysisContext(normalizedTicker, {
      timeframes: ["1D", "1W", "1M", "3M", "6M", "1Y"],
    }),
    fetchEarningsDate(normalizedTicker),
  ]);
  recordApiCall("yahoo", YAHOO_CALLS_PER_REFRESH);

  const currentPrice = ctx.marketSnapshot?.price ?? 0;
  const chain = ctx.optionsChain;
  const historicalData1D = ctx.candlesByTimeframe["1D"] ?? [];
  const historicalData1W = ctx.candlesByTimeframe["1W"] ?? [];
  const historicalData1M = ctx.candlesByTimeframe["1M"] ?? [];
  const historicalData3M = ctx.candlesByTimeframe["3M"] ?? [];
  const historicalData6M = ctx.candlesByTimeframe["6M"] ?? [];
  const historicalData1Y = ctx.candlesByTimeframe["1Y"] ?? [];
  const historicalData = historicalData3M;

  const earningsContext = getEarningsProximity(
    earningsDate,
    primaryWhale?.expiry ?? undefined,
  );

  // Step 6: Generate deep dive + trigger report
  const { deepDive, triggerReport } = await generateDeepDive({
    ticker: normalizedTicker,
    whaleTrade,
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
    newsContext,
    macroContext: {
      ...macroBase,
      earningsDate: earningsContext.earningsDate,
      ivCrushRisk: earningsContext.ivCrushRisk,
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
    shortInterest: ctx.shortInterest,
    computedIndicators: ctx.indicatorsByTimeframe,
    cascadeContext: null,
    signalHierarchy: {
      currentPrice,
      earningsDate: earningsContext.earningsDate,
      volumeProfile: ctx.volumeProfile,
      algoSR: ctx.algoSR,
      ivSkew: ctx.ivSkew,
      oiSummary: ctx.oiSummary,
      catalysts: getUpcomingCatalysts(14),
    },
    triggerReport: ctx.triggerReport,
  });

  // Step 7: Persist to DB
  const createdAt = new Date().toISOString();
  await db.insert(analyses).values({
    type: "deep_dive",
    inputRefs: JSON.stringify({
      ticker: normalizedTicker,
      triggerReport: triggerReport ?? null,
      pipelineVersion: DEEP_DIVE_PIPELINE_VERSION,
      source: "manual_refresh",
    }),
    output: JSON.stringify(deepDive),
    confidence: null,
  });

  console.log(
    `[RefreshDeepDive] Refreshed ${normalizedTicker}: risk=${deepDive.risk_assessment?.overall_risk ?? "N/A"}`,
  );

  return { deepDive, triggerReport: triggerReport ?? null, createdAt };
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}
