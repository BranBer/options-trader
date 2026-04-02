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
  scoreOpportunityCandidate,
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

export function runAttribution(
  whales: WhaleAlert[],
  trades: TradeRecord[],
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
      const qualityScore = whale.qualityScore ?? 0;
      let missReason: OpportunityMissReason = "unknown";

      if (qualityScore < 50) {
        missReason = "confidence_too_low";
      } else if (whale.premium < 100_000) {
        missReason = "position_size_limit";
      }

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
        (m) => `- ${m.ticker} ${m.sentiment} (${m.missReason ?? "unknown"})`,
      ),
  ]
    .filter(Boolean)
    .join("\n");

  return { captured, missed, rejected, captureRate, totalCandidates, summary };
}
