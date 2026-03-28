export type VIXRegime = "low" | "normal" | "elevated" | "high";

export interface VIXContext {
  level: number;
  regime: VIXRegime;
  label: string;
}

const THRESHOLDS = {
  low: 15,
  normal: 20,
  elevated: 30,
} as const;

export function getVIXRegime(vix: number): VIXRegime {
  if (vix < THRESHOLDS.low) return "low";
  if (vix < THRESHOLDS.normal) return "normal";
  if (vix < THRESHOLDS.elevated) return "elevated";
  return "high";
}

const LABELS: Record<VIXRegime, string> = {
  low: "Low volatility — calm markets, premium is cheap, favor buying options",
  normal: "Normal volatility — standard conditions",
  elevated:
    "Elevated volatility — caution, tighten position sizing, favor defined-risk spreads",
  high: "High volatility (crisis) — extreme caution, only defined-risk strategies, widen stop-losses",
};

export function buildVIXContext(vix: number): VIXContext {
  const regime = getVIXRegime(vix);
  return { level: vix, regime, label: LABELS[regime] };
}
