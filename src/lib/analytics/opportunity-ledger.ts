import type { WhaleAlert } from "@/types/whale";

export type OpportunityOutcome = "captured" | "missed" | "rejected";

export type OpportunityMissReason =
  | "confidence_too_low"
  | "quality_too_low"
  | "position_size_limit"
  | "entry_filter_rejected"
  | "outside_trade_window"
  | "0dte_rejected"
  | "portfolio_concentration"
  | "pipeline_not_run"
  | "missing_market_data"
  | "analysis_not_completed";

export interface OpportunityCandidate {
  id: string;
  ticker: string;
  detectedAt: string;
  sentiment: WhaleAlert["sentiment"];
  strike: number;
  expiry: string;
  premium: number;
  qualityScore?: number | null;
}

export interface OpportunityLabel extends OpportunityCandidate {
  outcome: OpportunityOutcome;
  missReason?: OpportunityMissReason | null;
  realizedReturnPct: number;
  maxFavorableExcursionPct: number;
  maxAdverseExcursionPct: number;
}

export function buildOpportunityId(candidate: OpportunityCandidate): string {
  return [
    candidate.ticker,
    candidate.detectedAt,
    candidate.strike,
    candidate.expiry,
  ].join("|");
}

export function scoreOpportunityCandidate(
  candidate: OpportunityCandidate,
): number {
  let score = 0.5;
  if ((candidate.qualityScore ?? 0) >= 70) score += 0.2;
  if (candidate.premium >= 100_000) score += 0.1;
  if (candidate.sentiment === "bullish" || candidate.sentiment === "bearish")
    score += 0.1;
  return Math.max(0, Math.min(1, score));
}

export function labelOpportunityOutcome(args: {
  candidate: OpportunityCandidate;
  realizedReturnPct: number;
  maxFavorableExcursionPct: number;
  maxAdverseExcursionPct: number;
  missReason?: OpportunityMissReason | null;
}): OpportunityLabel {
  const outcome: OpportunityOutcome =
    args.realizedReturnPct > 0
      ? "captured"
      : args.missReason
        ? "missed"
        : "rejected";

  return {
    ...args.candidate,
    id: buildOpportunityId(args.candidate),
    outcome,
    missReason: args.missReason ?? null,
    realizedReturnPct: args.realizedReturnPct,
    maxFavorableExcursionPct: args.maxFavorableExcursionPct,
    maxAdverseExcursionPct: args.maxAdverseExcursionPct,
  };
}
