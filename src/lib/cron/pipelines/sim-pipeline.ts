import { db } from "@/lib/db/client";
import { analyses, simTrades, whaleAlerts } from "@/lib/db/schema";
import { desc, gte, eq, and } from "drizzle-orm";
import { evaluateTradeForSim } from "@/lib/services/gemini-analyzer";
import {
  openPosition,
  evaluateOpenPositions,
  takePortfolioSnapshot,
  getOrCreatePortfolio,
  getOpenPositionsSummary,
} from "@/lib/services/sim-engine";
import { fetchMarketData } from "@/lib/services/market-fetcher";
import type { TradeRecommendation, DeepDiveAnalysis } from "@/types/analysis";
import * as progress from "@/lib/cron/pipeline-progress";

const MAX_OPEN_POSITIONS = 5;
const MIN_CONFIDENCE_FOR_SIM = 0.45;
const MIN_WHALE_QUALITY = 50;
const SIM_STEP_INDEX = 5;

/**
 * Sim Portfolio Pipeline:
 * 1. Evaluate open positions for exit (profit target / stop loss / time)
 * 2. Find new trade recommendations with high enough confidence
 * 3. Ask Gemini to evaluate each for the sim portfolio
 * 4. Open positions for accepted trades
 * 5. Take equity snapshot
 */
export async function runSimPipeline(): Promise<number> {
  console.log("[SimPipeline] Starting...");
  progress.activate(SIM_STEP_INDEX, "evaluating positions");

  // Step 1: Check existing open positions for exit
  const closedCount = await evaluateOpenPositions();
  if (closedCount > 0) {
    console.log(`[SimPipeline] Closed ${closedCount} positions`);
  }

  // Step 2: Check how many open positions we have
  const openTrades = await db
    .select()
    .from(simTrades)
    .where(eq(simTrades.status, "open"));

  if (openTrades.length >= MAX_OPEN_POSITIONS) {
    console.log(
      `[SimPipeline] At max open positions (${openTrades.length}/${MAX_OPEN_POSITIONS}), skipping new entries`,
    );
    await takePortfolioSnapshot();
    progress.complete(SIM_STEP_INDEX);
    return closedCount;
  }

  // Step 3: Get recent trade recommendations (last 24h, confidence >= threshold)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const recentRecs = await db
    .select()
    .from(analyses)
    .where(
      and(
        gte(analyses.createdAt, since),
        eq(analyses.type, "trade_recommendation"),
        gte(analyses.confidence, MIN_CONFIDENCE_FOR_SIM),
      ),
    )
    .orderBy(desc(analyses.confidence))
    .limit(10);

  if (recentRecs.length === 0) {
    console.log("[SimPipeline] No recent recommendations to evaluate");
    await takePortfolioSnapshot();
    progress.complete(SIM_STEP_INDEX);
    return closedCount;
  }

  // Skip recommendations we've already evaluated (accepted or rejected)
  const evaluatedIds = await db
    .select({ sourceAnalysisId: simTrades.sourceAnalysisId })
    .from(simTrades)
    .where(gte(simTrades.createdAt, since));
  const evaluatedIdSet = new Set(evaluatedIds.map((r) => r.sourceAnalysisId));
  const unevaluatedRecs = recentRecs.filter((r) => !evaluatedIdSet.has(r.id));

  if (unevaluatedRecs.length < recentRecs.length) {
    console.log(
      `[SimPipeline] Dedup: ${recentRecs.length} recs → ${unevaluatedRecs.length} unevaluated`,
    );
  }

  if (unevaluatedRecs.length === 0) {
    console.log("[SimPipeline] All recent recommendations already evaluated");
    await takePortfolioSnapshot();
    progress.complete(SIM_STEP_INDEX);
    return closedCount;
  }

  // Step 4: Get deep dives for context
  const recentDeepDives = await db
    .select()
    .from(analyses)
    .where(and(gte(analyses.createdAt, since), eq(analyses.type, "deep_dive")))
    .orderBy(desc(analyses.createdAt));

  const deepDiveMap = new Map<string, DeepDiveAnalysis>();
  for (const dd of recentDeepDives) {
    try {
      const parsed = JSON.parse(dd.output ?? "{}") as DeepDiveAnalysis;
      if (parsed.ticker) deepDiveMap.set(parsed.ticker, parsed);
    } catch {
      /* skip invalid */
    }
  }

  // Step 5: Get portfolio state
  const portfolio = await getOrCreatePortfolio();
  const openPositionsSummary = getOpenPositionsSummary(openTrades);

  // Step 6: Find tickers we already have open — avoid duplicates
  const openTickers = new Set(openTrades.map((t) => t.ticker));

  // Step 7: Evaluate each recommendation
  let newPositions = 0;
  const slotsAvailable = MAX_OPEN_POSITIONS - openTrades.length;

  progress.updateDetail(
    SIM_STEP_INDEX,
    `evaluating ${unevaluatedRecs.length} candidates`,
  );

  for (const rec of unevaluatedRecs) {
    if (newPositions >= slotsAvailable) break;

    try {
      const recData = JSON.parse(rec.output ?? "{}") as TradeRecommendation;
      if (!recData.ticker) continue;

      // Skip tickers we already have open
      if (openTickers.has(recData.ticker)) {
        console.log(`[SimPipeline] Skipping ${recData.ticker}: already open`);
        continue;
      }

      // Find associated whale alert — require minimum quality score
      const whaleAlert = await db
        .select()
        .from(whaleAlerts)
        .where(
          and(
            eq(whaleAlerts.ticker, recData.ticker),
            gte(whaleAlerts.createdAt, since),
          ),
        )
        .orderBy(desc(whaleAlerts.createdAt))
        .limit(1);

      const quality = whaleAlert[0]?.qualityScore ?? 0;
      if (quality < MIN_WHALE_QUALITY) {
        console.log(
          `[SimPipeline] Skipping ${recData.ticker}: whale quality ${quality} < ${MIN_WHALE_QUALITY}`,
        );
        continue;
      }

      // Fetch current price
      const [marketData] = await fetchMarketData([recData.ticker]);
      if (!marketData || marketData.price === 0) continue;

      // Get deep dive context if available
      const deepDive = deepDiveMap.get(recData.ticker);

      // Ask Gemini to evaluate
      const decision = await evaluateTradeForSim({
        ticker: recData.ticker,
        currentPrice: marketData.price,
        recommendation: {
          thesis: recData.thesis,
          direction: recData.direction,
          confidence: recData.confidence,
          strategy: {
            name: recData.primary_strategy.name,
            legs: recData.primary_strategy.legs,
            max_loss: recData.primary_strategy.max_loss,
            max_profit: recData.primary_strategy.max_profit,
            risk_reward_ratio: recData.primary_strategy.risk_reward_ratio,
          },
          risk_factors: recData.risk_factors,
        },
        deepDive: deepDive
          ? {
              market_narrative: deepDive.market_narrative,
              risk_level: deepDive.risk_assessment.overall_risk,
              entry_exit: deepDive.entry_exit
                ? {
                    profit_target: deepDive.entry_exit.profit_target,
                    stop_loss: deepDive.entry_exit.stop_loss,
                    position_sizing: deepDive.entry_exit.position_sizing,
                  }
                : undefined,
            }
          : undefined,
        compositeConfidence: rec.confidence ?? undefined,
        whaleQualityScore: whaleAlert[0]?.qualityScore ?? undefined,
        portfolioBalance: portfolio.balance,
        openPositions: openPositionsSummary,
      });

      if (decision.should_enter) {
        const tradeId = await openPosition({
          ticker: recData.ticker,
          decision,
          sourceAnalysisId: rec.id,
          sourceWhaleId: whaleAlert[0]?.id,
        });

        if (tradeId != null) {
          newPositions++;
          openTickers.add(recData.ticker);
          progress.updateDetail(
            SIM_STEP_INDEX,
            `opened ${newPositions} new position(s)`,
          );
        }
      }
    } catch (err) {
      console.error("[SimPipeline] Error evaluating recommendation:", err);
    }
  }

  console.log(
    `[SimPipeline] Complete: ${closedCount} closed, ${newPositions} opened`,
  );

  // Step 8: Take equity snapshot
  await takePortfolioSnapshot();
  progress.complete(SIM_STEP_INDEX);

  return closedCount + newPositions;
}
