import { db } from "@/lib/db/client";
import {
  analyses,
  marketSnapshots,
  simEvaluations,
  simTrades,
  whaleAlerts,
} from "@/lib/db/schema";
import { desc, gte, eq, and } from "drizzle-orm";
import { evaluateTradeForSim } from "@/lib/services/llm-analyzer";
import {
  openPosition,
  evaluateOpenPositions,
  takePortfolioSnapshot,
  getOrCreatePortfolio,
  getOpenPositionsSummary,
  validateTradeLegs,
} from "@/lib/services/sim-engine";
import { fetchMarketData } from "@/lib/services/market-fetcher";
import { fetchEarningsDate } from "@/lib/services/market-fetcher";
import { isMarketOpen } from "@/lib/utils/market-hours";
import { getEarningsProximity } from "@/lib/utils/earnings-proximity";
import { getSector, areCorrelated } from "@/lib/utils/sector-map";
import type { TradeRecommendation, DeepDiveAnalysis } from "@/types/analysis";
import type { TradeDecision } from "@/types/portfolio";
import * as progress from "@/lib/cron/pipeline-progress";

const MAX_OPEN_POSITIONS = 5;
const MIN_CONFIDENCE_FOR_SIM = 0.45;
const MIN_WHALE_QUALITY = 50;
const SIM_STEP_INDEX = 5;

// Story 20.1 — IV environment thresholds
const IV_RV_WARN_THRESHOLD = 0.15;
const IV_RV_REJECT_THRESHOLD = 0.25;
const IV_RV_CREDIT_WARN_THRESHOLD = -0.1;

// Story 20.2 — Earnings proximity thresholds
const EARNINGS_BLOCK_DAYS = 3;
const EARNINGS_WARN_DAYS = 7;

// Story 20.3 — Concentration limits
const MAX_POSITIONS_PER_SECTOR = 2;
const MAX_SAME_DIRECTION = 3;

/** Story 19.8 — Structured rejection record for observability */
export interface TradeRejection {
  ticker: string;
  reason: string;
  stage:
    | "market_hours"
    | "whale_quality"
    | "market_data"
    | "llm_eval"
    | "validation"
    | "iv_environment"
    | "earnings_proximity"
    | "concentration"
    | "position_open";
  timestamp: string;
}

/** Rejections from the latest pipeline run, exposed for API / tests */
let _lastRunRejections: TradeRejection[] = [];
export function getLastRunRejections(): TradeRejection[] {
  return _lastRunRejections;
}

// ============================================================
// Story 20.1 — IV Environment Fitness Check
// ============================================================

export interface IVCheckResult {
  allowed: boolean;
  reason?: string;
  warning?: string;
}

/**
 * Checks whether the IV environment is appropriate for the proposed strategy.
 * Debit strategies in high-IV → warn/reject. Credit strategies in low-IV → warn.
 */
export async function checkIVEnvironment(
  ticker: string,
  netPremium: number,
): Promise<IVCheckResult> {
  // Fetch the most recent market snapshot with IV-RV spread data
  const [snapshot] = await db
    .select({ ivRvSpread: marketSnapshots.ivRvSpread })
    .from(marketSnapshots)
    .where(eq(marketSnapshots.ticker, ticker))
    .orderBy(desc(marketSnapshots.capturedAt))
    .limit(1);

  const spread = snapshot?.ivRvSpread;
  if (spread == null) {
    return { allowed: true }; // No data — skip check
  }

  const isDebit = netPremium > 0;

  if (isDebit) {
    if (spread > IV_RV_REJECT_THRESHOLD) {
      return {
        allowed: false,
        reason: `Options extremely overpriced (IV-RV spread ${spread.toFixed(2)}) — debit strategy inadvisable`,
      };
    }
    if (spread > IV_RV_WARN_THRESHOLD) {
      return {
        allowed: true,
        warning: `IV CAUTION: ${ticker} debit strategy in high-IV environment (IV-RV spread: ${spread.toFixed(2)})`,
      };
    }
  } else {
    // Credit strategy
    if (spread < IV_RV_CREDIT_WARN_THRESHOLD) {
      return {
        allowed: true,
        warning: `IV CAUTION: ${ticker} credit strategy in low-IV environment (IV-RV spread: ${spread.toFixed(2)})`,
      };
    }
  }

  return { allowed: true };
}

// ============================================================
// Story 20.2 — Earnings Proximity Entry Block
// ============================================================

export interface EarningsCheckResult {
  allowed: boolean;
  reason?: string;
  warning?: string;
}

/**
 * Checks if earnings are imminent and the strategy is at risk of IV crush.
 * Debit strategies within 3 days of earnings → reject (unless catalyst exception).
 * Credit strategies → allow (they benefit from IV crush).
 */
export async function checkEarningsProximity(
  ticker: string,
  netPremium: number,
  deepDiveConfidence?: number,
): Promise<EarningsCheckResult> {
  let earningsDate: string | null = null;
  try {
    earningsDate = await fetchEarningsDate(ticker);
  } catch {
    return { allowed: true }; // Can't fetch → skip
  }

  const proximity = getEarningsProximity(earningsDate);

  if (proximity.daysToEarnings == null || proximity.daysToEarnings < 0) {
    return { allowed: true }; // No upcoming earnings or already passed
  }

  const isDebit = netPremium > 0;
  const days = proximity.daysToEarnings;

  // 7-day warning window (all strategies)
  let warning: string | undefined;
  if (days <= EARNINGS_WARN_DAYS) {
    warning = `Earnings proximity warning: ${ticker} reports in ${days} days`;
  }

  // 3-day block window (debit only)
  if (days <= EARNINGS_BLOCK_DAYS && isDebit) {
    // Exception: deep dive with high confidence explicitly factoring in earnings
    if (deepDiveConfidence != null && deepDiveConfidence > 0.7) {
      return {
        allowed: true,
        warning: `Earnings in ${days} days — allowed due to high confidence (${deepDiveConfidence.toFixed(2)}) catalyst override`,
      };
    }
    return {
      allowed: false,
      reason: `Earnings in ${days} days — debit strategy will likely lose to IV crush`,
    };
  }

  return { allowed: true, warning };
}

// ============================================================
// Story 20.3 — Position Concentration Guard
// ============================================================

export interface ConcentrationCheckResult {
  allowed: boolean;
  reason?: string;
  warnings: string[];
}

/**
 * Checks that opening a new position won't over-concentrate the portfolio
 * in a single sector or direction.
 */
export function checkConcentration(
  ticker: string,
  direction: string,
  openPositions: Array<{ ticker: string; direction: string }>,
): ConcentrationCheckResult {
  const warnings: string[] = [];
  const newSector = getSector(ticker);

  // Sector concentration check
  if (newSector !== "Unknown") {
    const sameSectorSameDirection = openPositions.filter(
      (p) => getSector(p.ticker) === newSector && p.direction === direction,
    );
    if (sameSectorSameDirection.length >= MAX_POSITIONS_PER_SECTOR) {
      return {
        allowed: false,
        reason: `Sector concentration: already hold ${sameSectorSameDirection.length} ${direction} positions in ${newSector}`,
        warnings,
      };
    }
  }

  // Correlation check (warning-only)
  for (const pos of openPositions) {
    if (areCorrelated(ticker, pos.ticker)) {
      warnings.push(
        `Correlation warning: ${ticker} is highly correlated with open position ${pos.ticker}`,
      );
    }
  }

  // Direction concentration check
  const sameDirectionCount = openPositions.filter(
    (p) => p.direction === direction,
  ).length;
  if (sameDirectionCount >= MAX_SAME_DIRECTION) {
    return {
      allowed: false,
      reason: `Directional concentration: already hold ${sameDirectionCount} ${direction} positions (max ${MAX_SAME_DIRECTION})`,
      warnings,
    };
  }

  // All-same-direction warning
  if (openPositions.length >= 2) {
    const directions = new Set(openPositions.map((p) => p.direction));
    if (directions.size === 1 && directions.has(direction)) {
      warnings.push(
        `All ${openPositions.length} open positions are ${direction} — adding another increases directional exposure`,
      );
    }
  }

  return { allowed: true, warnings };
}

// ============================================================
// Story 20.4 — Audit trail helper
// ============================================================

async function recordEvaluation(params: {
  ticker: string;
  decision: TradeDecision;
  confidence: number | null;
  whaleQualityScore: number | null;
  currentPrice: number;
  portfolioBalance: number;
  sourceAnalysisId: number | null;
  rejectionGate?: string;
  rejectionReason?: string;
}) {
  try {
    await db.insert(simEvaluations).values({
      ticker: params.ticker,
      shouldEnter: params.decision.should_enter,
      reasoning: params.decision.reasoning,
      strategyName: params.decision.should_enter
        ? params.decision.adjusted_entry.strategy_name
        : null,
      legs: params.decision.should_enter
        ? JSON.stringify(params.decision.adjusted_entry.legs)
        : null,
      positionSize: params.decision.position_size_dollars,
      netPremium: params.decision.should_enter
        ? params.decision.adjusted_entry.net_premium
        : null,
      confidence: params.confidence,
      whaleQualityScore: params.whaleQualityScore,
      currentPrice: params.currentPrice,
      portfolioBalance: params.portfolioBalance,
      sourceAnalysisId: params.sourceAnalysisId,
      rejectionGate: params.rejectionGate ?? null,
      rejectionReason: params.rejectionReason ?? null,
    });
  } catch (err) {
    console.error("[SimPipeline] Failed to record evaluation:", err);
  }
}

async function recordPipelineRejection(params: {
  ticker: string;
  confidence: number | null;
  whaleQualityScore: number | null;
  currentPrice: number;
  portfolioBalance: number;
  sourceAnalysisId: number | null;
  rejectionGate: string;
  rejectionReason: string;
}) {
  try {
    await db.insert(simEvaluations).values({
      ticker: params.ticker,
      shouldEnter: false,
      reasoning: params.rejectionReason,
      strategyName: null,
      legs: null,
      positionSize: null,
      netPremium: null,
      confidence: params.confidence,
      whaleQualityScore: params.whaleQualityScore,
      currentPrice: params.currentPrice,
      portfolioBalance: params.portfolioBalance,
      sourceAnalysisId: params.sourceAnalysisId,
      rejectionGate: params.rejectionGate,
      rejectionReason: params.rejectionReason,
    });
  } catch (err) {
    console.error("[SimPipeline] Failed to record pipeline rejection:", err);
  }
}

/**
 * Sim Portfolio Pipeline:
 * 1. Evaluate open positions for exit (profit target / stop loss / time)
 * 2. Find new trade recommendations with high enough confidence
 * 3. Ask LLM to evaluate each for the sim portfolio
 * 4. Open positions for accepted trades
 * 5. Take equity snapshot
 */
export async function runSimPipeline(): Promise<number> {
  console.log("[SimPipeline] Starting...");
  progress.activate(SIM_STEP_INDEX, "evaluating positions");

  // Reset rejection log for this run (Story 19.8)
  _lastRunRejections = [];

  // Story 19.7 — Market hours guard
  const marketHours = isMarketOpen();
  if (!marketHours.isOpen && !marketHours.isExtendedHours) {
    console.log(
      `[SimPipeline] Market closed (${marketHours.reason}) — skipping new entries, evaluating exits only`,
    );
    const closedCount = await evaluateOpenPositions();
    await takePortfolioSnapshot();
    progress.complete(SIM_STEP_INDEX);
    return closedCount;
  }

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
  // Story 20.4 — also skip recommendations already logged in audit trail
  const auditedIds = await db
    .select({ sourceAnalysisId: simEvaluations.sourceAnalysisId })
    .from(simEvaluations)
    .where(gte(simEvaluations.createdAt, since));
  const evaluatedIdSet = new Set([
    ...evaluatedIds.map((r) => r.sourceAnalysisId),
    ...auditedIds.map((r) => r.sourceAnalysisId),
  ]);
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
        const rejectionReason = `Whale quality ${quality} < ${MIN_WHALE_QUALITY}`;
        console.log(
          `[SimPipeline] Skipping ${recData.ticker}: ${rejectionReason}`,
        );
        _lastRunRejections.push({
          ticker: recData.ticker,
          reason: rejectionReason,
          stage: "whale_quality",
          timestamp: new Date().toISOString(),
        });
        await recordPipelineRejection({
          ticker: recData.ticker,
          confidence: rec.confidence,
          whaleQualityScore: quality,
          currentPrice: 0,
          portfolioBalance: portfolio.balance,
          sourceAnalysisId: rec.id,
          rejectionGate: "whale_quality",
          rejectionReason,
        });
        continue;
      }

      // Fetch current price
      const [marketData] = await fetchMarketData([recData.ticker]);
      if (!marketData || marketData.price === 0) {
        const rejectionReason = "Market data unavailable at decision time";
        console.warn(
          `[SimPipeline] MARKET DATA REJECT: ${recData.ticker} — ${rejectionReason}`,
        );
        _lastRunRejections.push({
          ticker: recData.ticker,
          reason: rejectionReason,
          stage: "market_data",
          timestamp: new Date().toISOString(),
        });
        await recordPipelineRejection({
          ticker: recData.ticker,
          confidence: rec.confidence,
          whaleQualityScore: quality,
          currentPrice: 0,
          portfolioBalance: portfolio.balance,
          sourceAnalysisId: rec.id,
          rejectionGate: "market_data",
          rejectionReason,
        });
        continue;
      }

      // Get deep dive context if available
      const deepDive = deepDiveMap.get(recData.ticker);

      // Ask LLM to evaluate
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
        // Validate trade legs before opening
        const validation = validateTradeLegs(
          decision.adjusted_entry.legs,
          marketData.price,
          portfolio.balance,
          decision.adjusted_entry.strategy_name,
        );

        if (!validation.valid) {
          console.warn(
            `[SimPipeline] VALIDATION REJECT: ${recData.ticker} — ${validation.reason}`,
          );
          _lastRunRejections.push({
            ticker: recData.ticker,
            reason: validation.reason ?? "Unknown validation failure",
            stage: "validation",
            timestamp: new Date().toISOString(),
          });
          await recordEvaluation({
            ticker: recData.ticker,
            decision,
            confidence: rec.confidence,
            whaleQualityScore: quality,
            currentPrice: marketData.price,
            portfolioBalance: portfolio.balance,
            sourceAnalysisId: rec.id,
            rejectionGate: "validation",
            rejectionReason: validation.reason,
          });
          continue;
        }

        for (const w of validation.warnings) {
          console.warn(`[SimPipeline] Warning: ${recData.ticker} — ${w}`);
        }

        // Story 20.1 — IV Environment Fitness Check
        const ivCheck = await checkIVEnvironment(
          recData.ticker,
          decision.adjusted_entry.net_premium,
        );
        if (!ivCheck.allowed) {
          console.warn(
            `[SimPipeline] IV REJECT: ${recData.ticker} — ${ivCheck.reason}`,
          );
          _lastRunRejections.push({
            ticker: recData.ticker,
            reason: ivCheck.reason!,
            stage: "iv_environment",
            timestamp: new Date().toISOString(),
          });
          await recordEvaluation({
            ticker: recData.ticker,
            decision,
            confidence: rec.confidence,
            whaleQualityScore: quality,
            currentPrice: marketData.price,
            portfolioBalance: portfolio.balance,
            sourceAnalysisId: rec.id,
            rejectionGate: "iv_environment",
            rejectionReason: ivCheck.reason,
          });
          continue;
        }
        if (ivCheck.warning) {
          console.warn(`[SimPipeline] ${ivCheck.warning}`);
        }

        // Story 20.2 — Earnings Proximity Entry Block
        const earningsCheck = await checkEarningsProximity(
          recData.ticker,
          decision.adjusted_entry.net_premium,
          rec.confidence ?? undefined,
        );
        if (!earningsCheck.allowed) {
          console.warn(
            `[SimPipeline] EARNINGS REJECT: ${recData.ticker} — ${earningsCheck.reason}`,
          );
          _lastRunRejections.push({
            ticker: recData.ticker,
            reason: earningsCheck.reason!,
            stage: "earnings_proximity",
            timestamp: new Date().toISOString(),
          });
          await recordEvaluation({
            ticker: recData.ticker,
            decision,
            confidence: rec.confidence,
            whaleQualityScore: quality,
            currentPrice: marketData.price,
            portfolioBalance: portfolio.balance,
            sourceAnalysisId: rec.id,
            rejectionGate: "earnings_proximity",
            rejectionReason: earningsCheck.reason,
          });
          continue;
        }
        if (earningsCheck.warning) {
          console.warn(
            `[SimPipeline] Earnings: ${recData.ticker} — ${earningsCheck.warning}`,
          );
        }

        // Story 20.3 — Position Concentration Guard
        const concentrationCheck = checkConcentration(
          recData.ticker,
          recData.direction,
          openTrades.map((t) => ({
            ticker: t.ticker,
            direction: t.direction,
          })),
        );
        if (!concentrationCheck.allowed) {
          console.warn(
            `[SimPipeline] CONCENTRATION REJECT: ${recData.ticker} — ${concentrationCheck.reason}`,
          );
          _lastRunRejections.push({
            ticker: recData.ticker,
            reason: concentrationCheck.reason!,
            stage: "concentration",
            timestamp: new Date().toISOString(),
          });
          await recordEvaluation({
            ticker: recData.ticker,
            decision,
            confidence: rec.confidence,
            whaleQualityScore: quality,
            currentPrice: marketData.price,
            portfolioBalance: portfolio.balance,
            sourceAnalysisId: rec.id,
            rejectionGate: "concentration",
            rejectionReason: concentrationCheck.reason,
          });
          continue;
        }
        for (const w of concentrationCheck.warnings) {
          console.warn(`[SimPipeline] Concentration: ${recData.ticker} — ${w}`);
        }

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

          // Story 20.4 — Log accepted evaluation
          await recordEvaluation({
            ticker: recData.ticker,
            decision,
            confidence: rec.confidence,
            whaleQualityScore: quality,
            currentPrice: marketData.price,
            portfolioBalance: portfolio.balance,
            sourceAnalysisId: rec.id,
          });
        } else {
          const rejectionReason =
            "Trade could not be opened due to portfolio sizing or balance constraints";
          _lastRunRejections.push({
            ticker: recData.ticker,
            reason: rejectionReason,
            stage: "position_open",
            timestamp: new Date().toISOString(),
          });
          await recordPipelineRejection({
            ticker: recData.ticker,
            confidence: rec.confidence,
            whaleQualityScore: quality,
            currentPrice: marketData.price,
            portfolioBalance: portfolio.balance,
            sourceAnalysisId: rec.id,
            rejectionGate: "position_open",
            rejectionReason,
          });
        }
      } else {
        // Story 20.4 — Log LLM rejection
        await recordEvaluation({
          ticker: recData.ticker,
          decision,
          confidence: rec.confidence,
          whaleQualityScore: quality,
          currentPrice: marketData.price,
          portfolioBalance: portfolio.balance,
          sourceAnalysisId: rec.id,
          rejectionGate: "llm_eval",
          rejectionReason: decision.reasoning,
        });
      }
    } catch (err) {
      console.error("[SimPipeline] Error evaluating recommendation:", err);
    }
  }

  console.log(
    `[SimPipeline] Complete: ${closedCount} closed, ${newPositions} opened, ${_lastRunRejections.length} rejected`,
  );

  // Step 8: Take equity snapshot
  await takePortfolioSnapshot();
  progress.complete(SIM_STEP_INDEX);

  return closedCount + newPositions;
}
