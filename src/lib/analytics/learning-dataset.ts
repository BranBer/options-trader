import { db } from "@/lib/db/client";
import {
  analyses,
  simEvaluations,
  simPortfolio,
  simTrades,
  whaleAlerts,
} from "@/lib/db/schema";
import { desc, inArray } from "drizzle-orm";
import {
  buildLearningRecords,
  type LearningRecordAnalysis,
  type LearningRecordEvaluation,
  type LearningRecordTrade,
} from "@/lib/analytics/learning-records";
import { DEFAULT_SIM_PORTFOLIO_BALANCE } from "@/lib/constants/portfolio";
import type { WhaleAlertRow } from "@/types/whale";

function parseJsonObject(
  value: string | null | undefined,
): Record<string, unknown> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function loadLearningDataset(limit: number) {
  const whaleRows = await db
    .select()
    .from(whaleAlerts)
    .orderBy(desc(whaleAlerts.id))
    .limit(limit);

  const tickers = [...new Set(whaleRows.map((row) => row.ticker))];

  const evaluationRows: LearningRecordEvaluation[] = tickers.length
    ? await db
        .select({
          id: simEvaluations.id,
          ticker: simEvaluations.ticker,
          shouldEnter: simEvaluations.shouldEnter,
          reasoning: simEvaluations.reasoning,
          strategyName: simEvaluations.strategyName,
          legs: simEvaluations.legs,
          positionSize: simEvaluations.positionSize,
          netPremium: simEvaluations.netPremium,
          confidence: simEvaluations.confidence,
          whaleQualityScore: simEvaluations.whaleQualityScore,
          portfolioBalance: simEvaluations.portfolioBalance,
          sourceAnalysisId: simEvaluations.sourceAnalysisId,
          rejectionGate: simEvaluations.rejectionGate,
          rejectionReason: simEvaluations.rejectionReason,
          createdAt: simEvaluations.createdAt,
        })
        .from(simEvaluations)
        .where(inArray(simEvaluations.ticker, tickers))
        .orderBy(desc(simEvaluations.createdAt))
        .limit(limit * 6)
    : [];

  const tradeRows: LearningRecordTrade[] = tickers.length
    ? (
        await db
          .select()
          .from(simTrades)
          .where(inArray(simTrades.ticker, tickers))
          .orderBy(desc(simTrades.createdAt))
          .limit(limit * 4)
      ).map((trade) => {
        let strike: number | undefined;
        let expiry: string | undefined;

        try {
          const legs = trade.legs ? JSON.parse(trade.legs) : [];
          const firstLeg = Array.isArray(legs) ? legs[0] : null;
          strike =
            typeof firstLeg?.strike === "number" ? firstLeg.strike : undefined;
          expiry =
            typeof firstLeg?.expiry === "string" ? firstLeg.expiry : undefined;
        } catch {
          strike = undefined;
          expiry = undefined;
        }

        return {
          id: trade.id,
          ticker: trade.ticker,
          strike,
          expiry,
          entryPrice: Number(trade.entryPrice),
          entryDate: trade.entryDate,
          exitPrice: trade.exitPrice != null ? Number(trade.exitPrice) : null,
          exitDate: trade.exitDate,
          pnl: trade.pnl != null ? Number(trade.pnl) : null,
          pnlPct: trade.pnlPct != null ? Number(trade.pnlPct) : null,
          status: (trade.status as "open" | "closed" | "expired") ?? "open",
          exitReason: trade.exitReason,
          direction: trade.direction,
          sourceWhaleId: trade.sourceWhaleId,
          sourceAnalysisId: trade.sourceAnalysisId,
        };
      })
    : [];

  const sourceAnalysisIds = [
    ...new Set(
      evaluationRows
        .map((evaluation) => evaluation.sourceAnalysisId)
        .filter((id): id is number => id != null)
        .concat(
          tradeRows
            .map((trade) => trade.sourceAnalysisId)
            .filter((id): id is number => id != null),
        ),
    ),
  ];

  const analysisRows: LearningRecordAnalysis[] = sourceAnalysisIds.length
    ? (
        await db
          .select({
            id: analyses.id,
            type: analyses.type,
            inputRefs: analyses.inputRefs,
            output: analyses.output,
            confidence: analyses.confidence,
            confidenceBreakdown: analyses.confidenceBreakdown,
            createdAt: analyses.createdAt,
          })
          .from(analyses)
          .where(inArray(analyses.id, sourceAnalysisIds))
      ).map((analysis) => ({
        id: analysis.id,
        type: analysis.type,
        inputRefs: parseJsonObject(analysis.inputRefs ?? undefined),
        output: analysis.output ? parseJsonObject(analysis.output) : null,
        confidence: analysis.confidence,
        confidenceBreakdown: analysis.confidenceBreakdown
          ? parseJsonObject(analysis.confidenceBreakdown)
          : null,
        createdAt: analysis.createdAt,
      }))
    : [];

  const [portfolio] = await db.select().from(simPortfolio).limit(1);

  const analysisRefMap = new Map<number, Record<string, unknown>>(
    analysisRows.map((row) => [row.id, row.inputRefs]),
  );

  const learningRecords = buildLearningRecords({
    whales: whaleRows as WhaleAlertRow[],
    evaluations: evaluationRows.map((evaluation) => {
      const refs = evaluation.sourceAnalysisId
        ? analysisRefMap.get(evaluation.sourceAnalysisId)
        : undefined;

      return {
        ...evaluation,
        primaryWhaleId:
          typeof refs?.primaryWhaleId === "number" ? refs.primaryWhaleId : null,
        whaleIds: Array.isArray(refs?.whaleIds)
          ? refs.whaleIds.filter((id): id is number => typeof id === "number")
          : [],
      };
    }),
    trades: tradeRows,
    analyses: analysisRows,
    startingBalance:
      portfolio?.startingBalance ?? DEFAULT_SIM_PORTFOLIO_BALANCE,
  });

  return {
    learningRecords,
    portfolio,
  };
}
