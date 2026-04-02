/**
 * Bad Trade Postmortem Framework
 *
 * Classifies losing trades into avoidable and unavoidable categories
 * based on pre-trade signals that were available at entry time.
 */

export type AvoidableLossCategory =
  | "iv_crush_entry"
  | "wrong_direction"
  | "earnings_proximity"
  | "technical_contradiction"
  | "liquidity_mismatch"
  | "event_risk_ignored"
  | "market_regime_mismatch"
  | "unavoidable";

export interface PostmortemInput {
  tradeId: number;
  ticker: string;
  direction: "bullish" | "bearish" | "neutral";
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  // Pre-trade signals (what was known at entry time)
  ivRegime?: "elevated" | "normal" | "low";
  ivRvSpread?: number;
  technicalAlignment?: number;
  earningsDays?: number | null;
  insiderSentiment?: "bullish" | "bearish" | "neutral";
  sectorMomentum?: number;
  compositeConfidence?: number;
}

export interface PostmortemResult {
  tradeId: number;
  isLosingTrade: boolean;
  isAvoidable: boolean;
  avoidableCategory: AvoidableLossCategory | null;
  riskScore: number;
  explanation: string;
  preTradeWarnings: string[];
  preTradeOpportunities: string[];
}

function checkIvCrush(input: PostmortemInput): boolean {
  if (input.ivRegime !== "elevated") return false;
  if ((input.earningsDays ?? Infinity) <= 7) return true;
  if ((input.ivRvSpread ?? 0) > 0.2) return true;
  return false;
}

function checkWrongDirection(input: PostmortemInput): boolean {
  if (
    input.direction === "bullish" &&
    input.pnlPct < -5 &&
    input.technicalAlignment != null &&
    input.technicalAlignment < 0.4
  )
    return true;
  if (
    input.direction === "bearish" &&
    input.pnlPct < -5 &&
    input.technicalAlignment != null &&
    input.technicalAlignment > 0.6
  )
    return true;
  return false;
}

function checkEarningsProximity(input: PostmortemInput): boolean {
  return input.earningsDays != null && input.earningsDays <= 3;
}

function checkTechnicalContradiction(input: PostmortemInput): boolean {
  if (input.technicalAlignment == null) return false;
  if (input.direction === "bullish" && input.technicalAlignment < 0.3)
    return true;
  if (input.direction === "bearish" && input.technicalAlignment > 0.7)
    return true;
  return false;
}

function checkLiquidityMismatch(input: PostmortemInput): boolean {
  // Rough heuristic: if confidence was low AND loss was large, liquidity may have been a factor
  return (input.compositeConfidence ?? 0.5) < 0.4 && input.pnlPct < -10;
}

function checkEventRisk(input: PostmortemInput): boolean {
  return (input.earningsDays ?? Infinity) <= 7 && input.earningsDays != null;
}

function checkRegimeMismatch(input: PostmortemInput): boolean {
  if (input.sectorMomentum == null) return false;
  if (input.direction === "bullish" && input.sectorMomentum < 0.3) return true;
  if (input.direction === "bearish" && input.sectorMomentum > 0.7) return true;
  return false;
}

export function classifyPostmortem(input: PostmortemInput): PostmortemResult {
  const isLosingTrade = input.pnl < 0;
  const warnings: string[] = [];
  const opportunities: string[] = [];

  if (!isLosingTrade) {
    return {
      tradeId: input.tradeId,
      isLosingTrade: false,
      isAvoidable: false,
      avoidableCategory: null,
      riskScore: 0,
      explanation: "Trade was profitable — no postmortem needed.",
      preTradeWarnings: warnings,
      preTradeOpportunities: opportunities,
    };
  }

  // Check each avoidable condition (priority order: most specific wins)
  let avoidableCategory: AvoidableLossCategory = "unavoidable";
  let riskScore = 0;

  if (checkIvCrush(input)) {
    avoidableCategory = "iv_crush_entry";
    riskScore += 40;
    warnings.push(
      "Entered with elevated IV near earnings — IV crush risk high",
    );
  } else if (checkWrongDirection(input)) {
    avoidableCategory = "wrong_direction";
    riskScore += 50;
    warnings.push("Technical alignment contradicts trade direction");
  } else if (checkTechnicalContradiction(input)) {
    avoidableCategory = "technical_contradiction";
    riskScore += 30;
    warnings.push("Technical patterns strongly contradict trade thesis");
  } else if (checkEarningsProximity(input)) {
    avoidableCategory = "earnings_proximity";
    riskScore += 35;
    warnings.push(`Trade entered ${input.earningsDays} days before earnings`);
  } else if (checkEventRisk(input)) {
    avoidableCategory = "event_risk_ignored";
    riskScore += 35;
    warnings.push("Earnings event risk not adequately priced into decision");
  } else if (checkLiquidityMismatch(input)) {
    avoidableCategory = "liquidity_mismatch";
    riskScore += 25;
    warnings.push(
      "Low pre-trade confidence with large loss suggests liquidity issues",
    );
  } else if (checkRegimeMismatch(input)) {
    avoidableCategory = "market_regime_mismatch";
    riskScore += 20;
    warnings.push("Sector momentum contradicts trade direction");
  }

  // Check for missed opportunities on the other side
  if (
    input.direction === "bullish" &&
    input.sectorMomentum != null &&
    input.sectorMomentum > 0.7
  ) {
    opportunities.push(
      "Sector momentum strongly bullish — could have held longer",
    );
  }
  if (
    input.direction === "bearish" &&
    input.sectorMomentum != null &&
    input.sectorMomentum < 0.3
  ) {
    opportunities.push(
      "Sector momentum strongly bearish — could have held longer",
    );
  }

  const isAvoidable = avoidableCategory !== "unavoidable";
  riskScore = Math.min(100, riskScore);

  const categoryLabels: Record<AvoidableLossCategory, string> = {
    iv_crush_entry: "IV Crush Entry",
    wrong_direction: "Wrong Direction",
    earnings_proximity: "Earnings Proximity",
    technical_contradiction: "Technical Contradiction",
    liquidity_mismatch: "Liquidity Mismatch",
    event_risk_ignored: "Event Risk Ignored",
    market_regime_mismatch: "Market Regime Mismatch",
    unavoidable: "Unavoidable",
  };

  const explanation = isAvoidable
    ? `This loss was likely avoidable. Category: ${categoryLabels[avoidableCategory]}. Risk score: ${riskScore}/100. The following pre-trade signals suggested caution: ${warnings.join("; ")}.`
    : `This loss appears unavoidable given the information available at entry time. Risk score: ${riskScore}/100.`;

  return {
    tradeId: input.tradeId,
    isLosingTrade: true,
    isAvoidable,
    avoidableCategory: isAvoidable ? avoidableCategory : null,
    riskScore,
    explanation,
    preTradeWarnings: warnings,
    preTradeOpportunities: opportunities,
  };
}

export function formatPostmortemSummary(results: PostmortemResult[]): string {
  const totalTrades = results.length;
  const losingTrades = results.filter((r) => r.isLosingTrade).length;
  const avoidableLosses = results.filter((r) => r.isAvoidable).length;
  const unavoidableLosses = losingTrades - avoidableLosses;

  const categoryCounts: Record<string, number> = {};
  for (const r of results) {
    if (r.avoidableCategory) {
      categoryCounts[r.avoidableCategory] =
        (categoryCounts[r.avoidableCategory] ?? 0) + 1;
    }
  }

  const lines = [
    `## Postmortem Summary`,
    ``,
    `Total losing trades: ${losingTrades}/${totalTrades}`,
    `Avoidable losses: ${avoidableLosses}`,
    `Unavoidable losses: ${unavoidableLosses}`,
    ``,
    `### Avoidable Loss Categories`,
    ``,
  ];

  for (const [category, count] of Object.entries(categoryCounts).sort(
    (a, b) => b[1] - a[1],
  )) {
    lines.push(`- ${category.replace(/_/g, " ")}: ${count}`);
  }

  return lines.join("\n");
}
