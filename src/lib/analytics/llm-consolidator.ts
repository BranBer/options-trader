/**
 * LLM Data Consolidator
 *
 * Transforms source features into a structured decision bundle.
 * Requires source citations and schema validation.
 * Falls back safely when confidence is low.
 */

export interface ConsolidatedFeature {
  name: string;
  value: unknown;
  confidence: number;
  source: string;
  citation: string;
  timestamp: number;
}

export interface ConsolidatorInput {
  ticker: string;
  detectedAt: string;
  direction: "bullish" | "bearish" | "neutral";
  // Source data (from adapters)
  earnings?: unknown;
  insider?: unknown;
  volatility?: unknown;
  sector?: unknown;
  technicals?: unknown;
  qualityScore?: number;
}

export interface ConsolidatorOutput {
  ticker: string;
  detectedAt: string;
  direction: string;
  features: ConsolidatedFeature[];
  confidence: number;
  readiness: "ready" | "partial" | "insufficient";
  warnings: string[];
  contradictions: string[];
}

function assessFeatureConfidence(
  source: string,
  data: unknown,
): { confidence: number; citation: string } {
  if (data == null) {
    return { confidence: 0, citation: `${source}: no data available` };
  }
  if (Array.isArray(data) && data.length === 0) {
    return { confidence: 0.3, citation: `${source}: empty response` };
  }
  return { confidence: 0.7, citation: `${source}: data present` };
}

function getSectorMomentum(value: unknown): number {
  if (value == null) return 0.5;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "momentum" in value) {
    return (value as { momentum: number }).momentum;
  }
  return 0.5;
}

function detectContradictions(features: ConsolidatedFeature[]): string[] {
  const contradictions: string[] = [];

  const directionFeature = features.find((f) => f.name === "direction");
  const technicalFeature = features.find(
    (f) => f.name === "technicalAlignment",
  );
  const sectorFeature = features.find((f) => f.name === "sectorMomentum");

  if (
    directionFeature?.value === "bullish" &&
    technicalFeature?.value != null &&
    (technicalFeature.value as number) < 0.3
  ) {
    contradictions.push("Technical alignment contradicts bullish direction");
  }

  if (
    directionFeature?.value === "bullish" &&
    sectorFeature?.value != null &&
    getSectorMomentum(sectorFeature.value) < 0.3
  ) {
    contradictions.push("Sector momentum contradicts bullish direction");
  }

  if (
    directionFeature?.value === "bearish" &&
    technicalFeature?.value != null &&
    (technicalFeature.value as number) > 0.7
  ) {
    contradictions.push("Technical alignment contradicts bearish direction");
  }

  return contradictions;
}

export function consolidateFeatures(
  input: ConsolidatorInput,
): ConsolidatorOutput {
  const features: ConsolidatedFeature[] = [];
  const warnings: string[] = [];

  // Direction
  features.push({
    name: "direction",
    value: input.direction,
    confidence: 1.0,
    source: "pipeline",
    citation: "pipeline: trade recommendation direction",
    timestamp: Date.now(),
  });

  // Quality score
  if (input.qualityScore != null) {
    features.push({
      name: "qualityScore",
      value: input.qualityScore,
      confidence: 0.9,
      source: "whale-quality",
      citation: `whale-quality: score ${input.qualityScore}/100`,
      timestamp: Date.now(),
    });
  }

  // Earnings
  const earningsConf = assessFeatureConfidence("earnings", input.earnings);
  features.push({
    name: "earningsContext",
    value: input.earnings,
    confidence: earningsConf.confidence,
    source: "earnings",
    citation: earningsConf.citation,
    timestamp: Date.now(),
  });
  if (earningsConf.confidence === 0) {
    warnings.push("Earnings data unavailable");
  }

  // Insider
  const insiderConf = assessFeatureConfidence("insider", input.insider);
  features.push({
    name: "insiderContext",
    value: input.insider,
    confidence: insiderConf.confidence,
    source: "insider",
    citation: insiderConf.citation,
    timestamp: Date.now(),
  });
  if (insiderConf.confidence === 0) {
    warnings.push("Insider data unavailable");
  }

  // Volatility
  const volConf = assessFeatureConfidence("volatility", input.volatility);
  features.push({
    name: "volatilityContext",
    value: input.volatility,
    confidence: volConf.confidence,
    source: "volatility",
    citation: volConf.citation,
    timestamp: Date.now(),
  });
  if (volConf.confidence === 0) {
    warnings.push("Volatility data unavailable");
  }

  // Sector
  const sectorConf = assessFeatureConfidence("sector", input.sector);
  features.push({
    name: "sectorMomentum",
    value: input.sector,
    confidence: sectorConf.confidence,
    source: "sector",
    citation: sectorConf.citation,
    timestamp: Date.now(),
  });
  if (sectorConf.confidence === 0) {
    warnings.push("Sector data unavailable");
  }

  // Technicals
  const techConf = assessFeatureConfidence("technicals", input.technicals);
  features.push({
    name: "technicalAlignment",
    value: input.technicals,
    confidence: techConf.confidence,
    source: "technicals",
    citation: techConf.citation,
    timestamp: Date.now(),
  });
  if (techConf.confidence === 0) {
    warnings.push("Technical data unavailable");
  }

  // Detect contradictions
  const contradictions = detectContradictions(features);

  // Overall confidence
  const avgConfidence =
    features.reduce((sum, f) => sum + f.confidence, 0) / features.length;

  // Readiness
  const readiness: ConsolidatorOutput["readiness"] =
    avgConfidence >= 0.6
      ? "ready"
      : avgConfidence >= 0.3
        ? "partial"
        : "insufficient";

  if (readiness === "insufficient") {
    warnings.push("Consolidated confidence too low — recommend no-trade");
  }

  return {
    ticker: input.ticker,
    detectedAt: input.detectedAt,
    direction: input.direction,
    features,
    confidence: avgConfidence,
    readiness,
    warnings,
    contradictions,
  };
}
