import type { DeepDiveAnalysis, TradeRecommendation } from "@/types/analysis";

export interface ConfidenceAdjustment {
  original: number;
  adjusted: number;
  delta: number;
  factors: Array<{ name: string; delta: number; reason: string }>;
}

/**
 * Compute a confidence adjustment based on deep dive analysis.
 * Returns a delta between -0.3 and +0.2 that should be added to the original confidence.
 */
export function computeConfidenceAdjustment(
  deepDive: DeepDiveAnalysis,
  recommendation: TradeRecommendation,
): ConfidenceAdjustment {
  const factors: ConfidenceAdjustment["factors"] = [];
  let totalDelta = 0;

  const direction = recommendation.direction; // "bullish" | "bearish" | "neutral"

  // Factor 1: Technical pattern alignment (+0.1 if confirming, -0.1 if contradicting)
  const patterns = deepDive.technical_patterns;
  if (patterns.length > 0) {
    const avgPatternConf =
      patterns.reduce((s, p) => s + p.confidence, 0) / patterns.length;
    const confirmingPatterns = patterns.filter((p) => p.type === direction);
    const contradictingPatterns = patterns.filter(
      (p) =>
        (direction === "bullish" && p.type === "bearish") ||
        (direction === "bearish" && p.type === "bullish"),
    );

    if (
      confirmingPatterns.length > contradictingPatterns.length &&
      avgPatternConf > 0.5
    ) {
      const d = 0.1;
      factors.push({
        name: "technical_alignment",
        delta: d,
        reason: `${confirmingPatterns.length}/${patterns.length} patterns confirm ${direction} thesis (avg conf: ${avgPatternConf.toFixed(2)})`,
      });
      totalDelta += d;
    } else if (contradictingPatterns.length > confirmingPatterns.length) {
      const d = -0.1;
      factors.push({
        name: "technical_alignment",
        delta: d,
        reason: `${contradictingPatterns.length}/${patterns.length} patterns contradict ${direction} thesis`,
      });
      totalDelta += d;
    }
  }

  // Factor 2: Support/resistance proximity (+0.1 if near support on bullish, near resistance on bearish)
  const srLevels = deepDive.support_resistance;
  const strongLevels = srLevels.filter((l) => l.strength === "strong");
  if (strongLevels.length > 0) {
    const supports = strongLevels.filter((l) => l.type === "support");
    const resistances = strongLevels.filter((l) => l.type === "resistance");

    if (direction === "bullish" && supports.length > 0) {
      const d = 0.1;
      factors.push({
        name: "sr_proximity",
        delta: d,
        reason: `${supports.length} strong support level(s) backing bullish thesis`,
      });
      totalDelta += d;
    } else if (direction === "bearish" && resistances.length > 0) {
      const d = 0.1;
      factors.push({
        name: "sr_proximity",
        delta: d,
        reason: `${resistances.length} strong resistance level(s) backing bearish thesis`,
      });
      totalDelta += d;
    }
  }

  // Factor 3: Risk assessment penalty (-0.15 for high/very_high risk)
  const riskLevel = deepDive.risk_assessment.overall_risk;
  if (riskLevel === "very_high") {
    const d = -0.15;
    factors.push({
      name: "risk_level",
      delta: d,
      reason: "Deep dive assessed very high overall risk",
    });
    totalDelta += d;
  } else if (riskLevel === "high") {
    const d = -0.1;
    factors.push({
      name: "risk_level",
      delta: d,
      reason: "Deep dive assessed high overall risk",
    });
    totalDelta += d;
  }

  // Factor 4: IV interpretation contradiction (-0.1 if strategy mismatches IV regime)
  const ivInterp = deepDive.options_context.iv_interpretation.toLowerCase();
  const ivAssessment = recommendation.market_context.iv_assessment;
  const isBuyingPremium =
    recommendation.primary_strategy.name.toLowerCase().includes("long") ||
    recommendation.primary_strategy.name.toLowerCase().includes("debit");
  const isSellingPremium =
    recommendation.primary_strategy.name.toLowerCase().includes("credit") ||
    recommendation.primary_strategy.name.toLowerCase().includes("iron") ||
    recommendation.primary_strategy.name.toLowerCase().includes("short");

  if (ivAssessment === "elevated" && isBuyingPremium) {
    const d = -0.1;
    factors.push({
      name: "iv_strategy_mismatch",
      delta: d,
      reason: "Buying premium when IV is elevated — paying inflated prices",
    });
    totalDelta += d;
  } else if (ivAssessment === "depressed" && isSellingPremium) {
    const d = -0.05;
    factors.push({
      name: "iv_strategy_mismatch",
      delta: d,
      reason: "Selling premium when IV is depressed — limited credit potential",
    });
    totalDelta += d;
  }

  // Clamp total delta
  totalDelta = Math.max(-0.3, Math.min(0.2, totalDelta));

  const original = recommendation.confidence;
  const adjusted = Math.max(0, Math.min(1, original + totalDelta));

  return {
    original,
    adjusted,
    delta: Math.round((adjusted - original) * 1000) / 1000,
    factors,
  };
}
