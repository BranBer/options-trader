import type { WhaleAlert } from "@/types/whale";
import type { TradeRecord, EvaluationRecord } from "./attribution-engine";

interface CorrelationWhale extends WhaleAlert {
  id?: number;
}

export interface AlertCorrelation {
  ticker: string;
  detectedAt: string;
  qualityScore: number | null | undefined;
  evaluatedAt: string | null;
  shouldEnter: boolean | null;
  rejectionGate: string | null;
  rejectionReason: string | null;
  tradeId: number | null;
  tradeStatus: TradeRecord["status"] | null;
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function findNearestEvaluation(
  whale: CorrelationWhale,
  evaluations: EvaluationRecord[],
): EvaluationRecord | null {
  if (whale.id != null) {
    const exact = evaluations.find(
      (evaluation) =>
        evaluation.primaryWhaleId === whale.id ||
        evaluation.whaleIds?.includes(whale.id) === true,
    );
    if (exact) return exact;
  }

  const whaleTs = parseTimestamp(whale.detectedAt);
  const tickerMatches = evaluations.filter((evaluation) => {
    if (evaluation.ticker !== whale.ticker) return false;
    const evalTs = parseTimestamp(evaluation.createdAt);
    if (whaleTs == null || evalTs == null) return true;

    const earliest = whaleTs - 5 * 60 * 1000;
    const latest = whaleTs + 24 * 60 * 60 * 1000;
    return evalTs >= earliest && evalTs <= latest;
  });

  if (tickerMatches.length === 0) return null;

  if (whaleTs == null) return tickerMatches[0];

  return tickerMatches.sort((left, right) => {
    const leftTs = parseTimestamp(left.createdAt) ?? whaleTs;
    const rightTs = parseTimestamp(right.createdAt) ?? whaleTs;
    return Math.abs(leftTs - whaleTs) - Math.abs(rightTs - whaleTs);
  })[0];
}

function findMatchedTrade(
  whale: CorrelationWhale,
  trades: TradeRecord[],
): TradeRecord | null {
  if (whale.id != null) {
    const exact = trades.find((trade) => trade.sourceWhaleId === whale.id);
    if (exact) return exact;
  }

  return (
    trades.find(
      (trade) =>
        trade.ticker === whale.ticker &&
        (trade.strike == null || trade.strike === whale.strike) &&
        (trade.expiry == null || trade.expiry === whale.expiry),
    ) ?? null
  );
}

export function buildAlertCorrelations(args: {
  whales: CorrelationWhale[];
  evaluations: EvaluationRecord[];
  trades: TradeRecord[];
  limit?: number;
}): AlertCorrelation[] {
  const { whales, evaluations, trades, limit = 10 } = args;

  return [...whales]
    .sort((left, right) => (right.qualityScore ?? 0) - (left.qualityScore ?? 0))
    .slice(0, limit)
    .map((whale) => {
      const evaluation = findNearestEvaluation(whale, evaluations);
      const trade = findMatchedTrade(whale, trades);

      return {
        ticker: whale.ticker,
        detectedAt: whale.detectedAt,
        qualityScore: whale.qualityScore,
        evaluatedAt: evaluation?.createdAt ?? null,
        shouldEnter: evaluation?.shouldEnter ?? null,
        rejectionGate: evaluation?.rejectionGate ?? null,
        rejectionReason: evaluation?.rejectionReason ?? null,
        tradeId: trade?.id ?? null,
        tradeStatus: trade?.status ?? null,
      };
    });
}
