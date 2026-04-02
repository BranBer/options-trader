/**
 * Opportunity Attribution Engine
 *
 * Replays whale alerts and trade history to produce a full attribution
 * breakdown: which alerts were captured, which were missed, and why.
 */

import type { WhaleAlert } from "@/types/whale";
import {
  buildOpportunityId,
  labelOpportunityOutcome,
} from "./opportunity-ledger";
import type {
  OpportunityCandidate,
  OpportunityLabel,
  OpportunityMissReason,
} from "./opportunity-ledger";

export interface TradeRecord {
  id: number;
  ticker: string;
  entryDate: string;
  exitDate: string | null;
  strike?: number;
  expiry?: string;
  entryPrice: number;
  exitPrice: number | null;
  pnl: number | null;
  pnlPct: number | null;
  status: "open" | "closed";
  sourceWhaleId?: number | null;
  sourceAnalysisId?: number | null;
}

export interface EvaluationRecord {
  ticker: string;
  shouldEnter: boolean;
  confidence: number | null;
  rejectionGate: string | null;
  rejectionReason: string | null;
  createdAt: string | null;
  sourceAnalysisId?: number | null;
  primaryWhaleId?: number | null;
  whaleIds?: number[];
}

export interface AttributionResult {
  captured: OpportunityLabel[];
  missed: OpportunityLabel[];
  rejected: OpportunityLabel[];
  captureRate: number;
  totalCandidates: number;
  summary: string;
}

function matchWhaleToTrade(
  whale: WhaleAlert,
  trades: TradeRecord[],
): TradeRecord | null {
  return (
    trades.find(
      (t) =>
        t.ticker === whale.ticker &&
        (t.strike == null || t.strike === whale.strike) &&
        (t.expiry == null || t.expiry === whale.expiry),
    ) ?? null
  );
}

function mapEvaluationToMissReason(
  evaluation: EvaluationRecord,
): OpportunityMissReason {
  const gate = evaluation.rejectionGate ?? "";
  const reason = evaluation.rejectionReason?.toLowerCase() ?? "";

  if (gate === "whale_quality") return "quality_too_low";
  if (gate === "market_data") return "missing_market_data";
  if (gate === "position_open") return "position_size_limit";
  if (gate === "concentration") return "portfolio_concentration";
  if (gate === "iv_environment" || gate === "earnings_proximity") {
    return "entry_filter_rejected";
  }
  if (gate === "validation") {
    if (
      reason.includes("today") ||
      reason.includes("trading day") ||
      reason.includes("theta risk")
    ) {
      return "0dte_rejected";
    }
    if (
      reason.includes("premium") ||
      reason.includes("balance") ||
      reason.includes("cost")
    ) {
      return "position_size_limit";
    }
    return "entry_filter_rejected";
  }
  if (gate === "llm_eval") return "confidence_too_low";

  return "analysis_not_completed";
}

function findRelevantEvaluation(
  whale: WhaleAlert,
  evaluations: EvaluationRecord[],
): EvaluationRecord | null {
  const tickerMatches = evaluations.filter((evaluation) => {
    if (evaluation.ticker !== whale.ticker || !evaluation.createdAt) {
      return false;
    }

    const evaluationTs = Date.parse(evaluation.createdAt);
    const whaleTs = Date.parse(whale.detectedAt);

    if (Number.isNaN(evaluationTs) || Number.isNaN(whaleTs)) {
      return true;
    }

    const earliestRelevantTs = whaleTs - 5 * 60 * 1000;
    const latestRelevantTs = whaleTs + 24 * 60 * 60 * 1000;
    return (
      evaluationTs >= earliestRelevantTs && evaluationTs <= latestRelevantTs
    );
  });

  if (tickerMatches.length === 0) return null;

  return tickerMatches.sort((left, right) => {
    const leftTs = Date.parse(left.createdAt ?? "");
    const rightTs = Date.parse(right.createdAt ?? "");
    const whaleTs = Date.parse(whale.detectedAt);

    if (
      Number.isNaN(leftTs) ||
      Number.isNaN(rightTs) ||
      Number.isNaN(whaleTs)
    ) {
      return 0;
    }

    return Math.abs(leftTs - whaleTs) - Math.abs(rightTs - whaleTs);
  })[0];
}

function classifyMissReason(
  whale: WhaleAlert,
  evaluations: EvaluationRecord[],
): OpportunityMissReason {
  const qualityScore = whale.qualityScore ?? 0;
  if (qualityScore < 50) {
    return "quality_too_low";
  }

  const evaluation = findRelevantEvaluation(whale, evaluations);
  if (evaluation) {
    return mapEvaluationToMissReason(evaluation);
  }

  if (evaluations.length === 0) {
    return "pipeline_not_run";
  }

  return "analysis_not_completed";
}

export function runAttribution(
  whales: WhaleAlert[],
  trades: TradeRecord[],
  evaluations: EvaluationRecord[] = [],
): AttributionResult {
  const captured: OpportunityLabel[] = [];
  const missed: OpportunityLabel[] = [];
  const rejected: OpportunityLabel[] = [];

  const closedTrades = trades.filter((t) => t.status === "closed");
  const openTrades = trades.filter((t) => t.status === "open");

  for (const whale of whales) {
    const candidate: OpportunityCandidate = {
      id: buildOpportunityId({
        id: "",
        ticker: whale.ticker,
        detectedAt: whale.detectedAt,
        sentiment: whale.sentiment,
        strike: whale.strike,
        expiry: whale.expiry,
        premium: whale.premium,
        qualityScore: whale.qualityScore,
      }),
      ticker: whale.ticker,
      detectedAt: whale.detectedAt,
      sentiment: whale.sentiment,
      strike: whale.strike,
      expiry: whale.expiry,
      premium: whale.premium,
      qualityScore: whale.qualityScore,
    };

    const matchedTrade = matchWhaleToTrade(whale, closedTrades);
    const openTrade = matchWhaleToTrade(whale, openTrades);

    if (matchedTrade) {
      const realizedReturnPct = matchedTrade.pnlPct ?? 0;
      captured.push(
        labelOpportunityOutcome({
          candidate,
          realizedReturnPct,
          maxFavorableExcursionPct: realizedReturnPct,
          maxAdverseExcursionPct: realizedReturnPct < 0 ? realizedReturnPct : 0,
        }),
      );
    } else if (openTrade) {
      // Open trade — don't count as missed or captured yet
      continue;
    } else {
      // Alert was not traded — classify as missed
      const missReason = classifyMissReason(whale, evaluations);

      missed.push(
        labelOpportunityOutcome({
          candidate,
          realizedReturnPct: 0,
          maxFavorableExcursionPct: 0,
          maxAdverseExcursionPct: 0,
          missReason,
        }),
      );
    }
  }

  const totalCandidates = whales.length;
  const captureRate =
    totalCandidates > 0 ? (captured.length / totalCandidates) * 100 : 0;

  const summary = [
    `## Attribution Summary`,
    ``,
    `Total whale alerts: ${totalCandidates}`,
    `Captured: ${captured.length}`,
    `Missed: ${missed.length}`,
    `Capture rate: ${captureRate.toFixed(1)}%`,
    ``,
    captured.length > 0 ? `### Captured Opportunities` : "",
    ...captured.map(
      (c) =>
        `- ${c.ticker} ${c.sentiment} ${c.premium >= 100_000 ? "$" + (c.premium / 1000).toFixed(0) + "K" : ""} → ${c.realizedReturnPct.toFixed(1)}%`,
    ),
    "",
    missed.length > 0 ? `### Missed Opportunities` : "",
    ...missed
      .filter((m) => (m.qualityScore ?? 0) >= 60)
      .map(
        (m) =>
          `- ${m.ticker} ${m.sentiment} (${m.missReason ?? "not_classified"})`,
      ),
  ]
    .filter(Boolean)
    .join("\n");

  return { captured, missed, rejected, captureRate, totalCandidates, summary };
}
