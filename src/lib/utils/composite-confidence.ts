import type { InsiderSentiment } from "@/types/insider";
import type { SectorRotationContext } from "@/lib/utils/sector-rotation";

export interface ConfidenceFactor {
  name: string;
  value: number; // 0-1 normalized
  weight: number;
  contribution: number; // value * weight (after redistribution)
  description: string;
}

export interface CompositeConfidenceBreakdown {
  composite: number; // 0-1 final confidence
  factors: ConfidenceFactor[];
}

interface CompositeInputs {
  /** AI model's raw correlation confidence (0-1) */
  geminiCorrelationConf: number;
  /** Whale quality score (0-100) from scoreWhaleQuality */
  whaleQualityScore?: number | null;
  /** Deep dive feedback delta already applied — original + adjustment */
  technicalAlignmentScore?: number | null;
  /** IV percentile (0-100) — real or heuristic */
  ivPercentile?: number | null;
  /** VIX level for regime scoring */
  vixLevel?: number | null;
  /** Earnings proximity risk ("high" | "moderate" | "low" | "none") */
  earningsRisk?: string | null;
  /** Insider sentiment for this ticker */
  insiderSentiment?: InsiderSentiment | null;
  /** Direction of the recommendation ("bullish" | "bearish" | "neutral") */
  direction?: string;
  /** Sector rotation context */
  sectorRotation?: SectorRotationContext | null;
  /** Ticker sector ETF ticker (e.g., "XLK" for tech stocks) — for sector alignment */
  tickerSector?: string | null;
}

/**
 * Factor weights — sum to 1.0.
 * If a factor is unavailable, its weight is redistributed proportionally.
 */
const FACTOR_WEIGHTS = {
  geminiCorrelationConf: 0.2, // AI Correlation
  whaleQualityScore: 0.15,
  technicalAlignment: 0.15,
  ivRegime: 0.1,
  vixRegime: 0.1,
  earningsRisk: 0.1,
  insiderAlignment: 0.1,
  sectorMomentum: 0.1,
} as const;

/**
 * Compute a multi-factor composite confidence score that synthesizes
 * all available signal sources into a single actionable number.
 *
 * Each factor is normalized to 0-1 (1 = most favorable for the thesis).
 * Missing factors have their weight redistributed proportionally.
 */
export function computeCompositeConfidence(
  inputs: CompositeInputs,
): CompositeConfidenceBreakdown {
  const rawFactors: Array<{
    name: string;
    key: keyof typeof FACTOR_WEIGHTS;
    value: number | null;
    description: string;
  }> = [];

  // Factor 1: Gemini correlation confidence (always available)
  rawFactors.push({
    name: "AI Correlation",
    key: "geminiCorrelationConf",
    value: inputs.geminiCorrelationConf,
    description: `Raw AI correlation confidence: ${(inputs.geminiCorrelationConf * 100).toFixed(0)}%`,
  });

  // Factor 2: Whale quality (0-100 → 0-1)
  if (inputs.whaleQualityScore != null) {
    const normalized = inputs.whaleQualityScore / 100;
    rawFactors.push({
      name: "Whale Quality",
      key: "whaleQualityScore",
      value: normalized,
      description: `Trade quality score: ${inputs.whaleQualityScore}/100`,
    });
  } else {
    rawFactors.push({
      name: "Whale Quality",
      key: "whaleQualityScore",
      value: null,
      description: "Not available",
    });
  }

  // Factor 3: Technical alignment (deep dive feedback confidence, already 0-1)
  if (inputs.technicalAlignmentScore != null) {
    rawFactors.push({
      name: "Technical Alignment",
      key: "technicalAlignment",
      value: inputs.technicalAlignmentScore,
      description: `Post-deep-dive adjusted confidence: ${(inputs.technicalAlignmentScore * 100).toFixed(0)}%`,
    });
  } else {
    rawFactors.push({
      name: "Technical Alignment",
      key: "technicalAlignment",
      value: null,
      description: "No deep dive feedback available",
    });
  }

  // Factor 4: IV regime (score based on whether IV percentile supports the strategy)
  // High IV favors selling premium, low IV favors buying — both valid thesis supports
  if (inputs.ivPercentile != null) {
    // Normalize: extreme IV (either high or low) = strong signal = higher score
    // Mid-range IV = weaker signal
    const distFromMid = Math.abs(inputs.ivPercentile - 50) / 50; // 0 at mid, 1 at extremes
    rawFactors.push({
      name: "IV Regime",
      key: "ivRegime",
      value: 0.4 + distFromMid * 0.6, // Range: 0.4 (mid) to 1.0 (extreme)
      description: `IV percentile: ${inputs.ivPercentile}% — ${inputs.ivPercentile > 70 ? "elevated (sell premium)" : inputs.ivPercentile < 30 ? "depressed (buy premium)" : "normal range"}`,
    });
  } else {
    rawFactors.push({
      name: "IV Regime",
      key: "ivRegime",
      value: null,
      description: "IV data not available",
    });
  }

  // Factor 5: VIX regime (lower VIX = calmer markets = higher base confidence)
  if (inputs.vixLevel != null) {
    let score: number;
    if (inputs.vixLevel < 15)
      score = 0.9; // Calm
    else if (inputs.vixLevel < 20)
      score = 0.7; // Normal
    else if (inputs.vixLevel < 30)
      score = 0.4; // Elevated
    else score = 0.2; // Crisis

    rawFactors.push({
      name: "VIX Regime",
      key: "vixRegime",
      value: score,
      description: `VIX: ${inputs.vixLevel.toFixed(1)} — ${inputs.vixLevel < 15 ? "calm" : inputs.vixLevel < 20 ? "normal" : inputs.vixLevel < 30 ? "elevated" : "crisis"}`,
    });
  } else {
    rawFactors.push({
      name: "VIX Regime",
      key: "vixRegime",
      value: null,
      description: "VIX data not available",
    });
  }

  // Factor 6: Earnings risk (penalty near earnings)
  if (inputs.earningsRisk != null && inputs.earningsRisk !== "none") {
    const score =
      inputs.earningsRisk === "high"
        ? 0.2
        : inputs.earningsRisk === "moderate"
          ? 0.5
          : 0.8; // low
    rawFactors.push({
      name: "Earnings Risk",
      key: "earningsRisk",
      value: score,
      description: `IV crush risk: ${inputs.earningsRisk}`,
    });
  } else {
    rawFactors.push({
      name: "Earnings Risk",
      key: "earningsRisk",
      value: inputs.earningsRisk === "none" ? 0.9 : null, // "none" = no earnings risk = favorable
      description:
        inputs.earningsRisk === "none"
          ? "No upcoming earnings — no IV crush risk"
          : "Earnings data not available",
    });
  }

  // Factor 7: Insider alignment
  if (inputs.insiderSentiment != null) {
    const ins = inputs.insiderSentiment;
    const dir = inputs.direction ?? "neutral";
    let score = 0.5; // neutral base

    if (
      (dir === "bullish" && ins.sentiment === "bullish") ||
      (dir === "bearish" && ins.sentiment === "bearish")
    ) {
      score = 0.85; // Confirming
    } else if (
      (dir === "bullish" && ins.sentiment === "bearish") ||
      (dir === "bearish" && ins.sentiment === "bullish")
    ) {
      score = 0.2; // Contradicting
    }

    rawFactors.push({
      name: "Insider Alignment",
      key: "insiderAlignment",
      value: score,
      description: `Insider sentiment: ${ins.sentiment} (${ins.buyCount} buys, ${ins.sellCount} sells) — ${score > 0.6 ? "confirms" : score < 0.4 ? "contradicts" : "neutral to"} ${dir} thesis`,
    });
  } else {
    rawFactors.push({
      name: "Insider Alignment",
      key: "insiderAlignment",
      value: null,
      description: "No insider data available",
    });
  }

  // Factor 8: Sector momentum alignment
  if (inputs.sectorRotation != null) {
    const rot = inputs.sectorRotation;
    const dir = inputs.direction ?? "neutral";
    let score = 0.5;

    if (rot.regime === "risk_on" && dir === "bullish") {
      score = 0.8;
    } else if (rot.regime === "risk_off" && dir === "bearish") {
      score = 0.8;
    } else if (rot.regime === "risk_on" && dir === "bearish") {
      score = 0.3;
    } else if (rot.regime === "risk_off" && dir === "bullish") {
      score = 0.3;
    }

    // Bonus if ticker's sector is in leading
    if (inputs.tickerSector) {
      const isLeading = rot.leading.some(
        (s) => s.ticker === inputs.tickerSector,
      );
      const isLagging = rot.lagging.some(
        (s) => s.ticker === inputs.tickerSector,
      );
      if (isLeading && dir === "bullish") score = Math.min(1, score + 0.1);
      if (isLagging && dir === "bearish") score = Math.min(1, score + 0.1);
      if (isLeading && dir === "bearish") score = Math.max(0, score - 0.1);
      if (isLagging && dir === "bullish") score = Math.max(0, score - 0.1);
    }

    rawFactors.push({
      name: "Sector Momentum",
      key: "sectorMomentum",
      value: score,
      description: `Sector rotation: ${rot.regime} — ${score > 0.6 ? "supports" : score < 0.4 ? "against" : "neutral to"} ${dir} thesis`,
    });
  } else {
    rawFactors.push({
      name: "Sector Momentum",
      key: "sectorMomentum",
      value: null,
      description: "Sector rotation data not available",
    });
  }

  // Compute weighted average with proportional redistribution of missing weights
  const available = rawFactors.filter((f) => f.value != null);
  const totalAvailableWeight = available.reduce(
    (sum, f) => sum + FACTOR_WEIGHTS[f.key],
    0,
  );

  if (totalAvailableWeight === 0 || available.length === 0) {
    return {
      composite: inputs.geminiCorrelationConf,
      factors: rawFactors.map((f) => ({
        name: f.name,
        value: f.value ?? 0,
        weight: FACTOR_WEIGHTS[f.key],
        contribution: 0,
        description: f.description,
      })),
    };
  }

  // Redistribute weights proportionally among available factors
  const redistributionFactor = 1.0 / totalAvailableWeight;

  let composite = 0;
  const factors: ConfidenceFactor[] = rawFactors.map((f) => {
    const baseWeight = FACTOR_WEIGHTS[f.key];
    if (f.value == null) {
      return {
        name: f.name,
        value: 0,
        weight: 0,
        contribution: 0,
        description: f.description,
      };
    }
    const adjustedWeight = baseWeight * redistributionFactor;
    const contribution = f.value * adjustedWeight;
    composite += contribution;
    return {
      name: f.name,
      value: f.value,
      weight: adjustedWeight,
      contribution,
      description: f.description,
    };
  });

  // Clamp to [0, 1]
  composite = Math.max(0, Math.min(1, composite));

  return { composite, factors };
}
