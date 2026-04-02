/**
 * Bad Trade Postmortem Engine
 *
 * Wires the postmortem classifier to the pipeline, producing
 * avoidable-loss classifications for closed losing trades.
 */

import {
  classifyPostmortem,
  formatPostmortemSummary,
} from "./bad-trade-postmortem";
import type { PostmortemInput, PostmortemResult } from "./bad-trade-postmortem";

export interface PostmortemTradeInput {
  tradeId: number;
  ticker: string;
  direction: "bullish" | "bearish" | "neutral";
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  ivRegime?: "elevated" | "normal" | "low";
  ivRvSpread?: number;
  technicalAlignment?: number;
  earningsDays?: number | null;
  insiderSentiment?: "bullish" | "bearish" | "neutral";
  sectorMomentum?: number;
  compositeConfidence?: number;
}

export interface PostmortemEngineResult {
  results: PostmortemResult[];
  avoidableCount: number;
  unavoidableCount: number;
  summary: string;
}

export function runPostmortemEngine(
  trades: PostmortemTradeInput[],
): PostmortemEngineResult {
  const results: PostmortemResult[] = [];

  for (const trade of trades) {
    const input: PostmortemInput = {
      tradeId: trade.tradeId,
      ticker: trade.ticker,
      direction: trade.direction,
      entryDate: trade.entryDate,
      exitDate: trade.exitDate,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      pnl: trade.pnl,
      pnlPct: trade.pnlPct,
      ivRegime: trade.ivRegime,
      ivRvSpread: trade.ivRvSpread,
      technicalAlignment: trade.technicalAlignment,
      earningsDays: trade.earningsDays,
      insiderSentiment: trade.insiderSentiment,
      sectorMomentum: trade.sectorMomentum,
      compositeConfidence: trade.compositeConfidence,
    };

    results.push(classifyPostmortem(input));
  }

  const avoidableCount = results.filter((r) => r.isAvoidable).length;
  const unavoidableCount = results.filter(
    (r) => r.isLosingTrade && !r.isAvoidable,
  ).length;

  return {
    results,
    avoidableCount,
    unavoidableCount,
    summary: formatPostmortemSummary(results),
  };
}
