import type {
  SqueezeScoreInput,
  SqueezeScoreResult,
  SqueezeComponentScores,
  ShortVolumeTrend,
  ShortVolumeTrendResult,
} from "@/types/squeeze";

/**
 * S51-2: Pure function that computes a composite short squeeze risk score.
 *
 * Scoring breakdown (100 pts total):
 *  - SI% of float     35 pts  — primary squeeze fuel indicator
 *  - Days to cover    25 pts  — measures severity of position unwind risk
 *  - Whale premium    20 pts  — institutional options activity proxy
 *  - Volume spike     10 pts  — intraday catalyst detection
 *  - FINRA short vol  10 pts  — near-real-time daily shorting activity (T+1)
 *
 * All inputs are optional — missing data scores 0 for that component,
 * so the scorer degrades gracefully.
 */
export function computeSqueezeScore(input: SqueezeScoreInput): SqueezeScoreResult {
  const trendResult =
    input.shortVolumeHistory && input.shortVolumeHistory.length >= 3
      ? computeShortVolumeTrend(input.shortVolumeHistory)
      : null;

  const components: SqueezeComponentScores = {
    siPct: scoreSiPct(input.shortPercentOfFloat),
    dtc: scoreDtc(input.shortRatio),
    whalePremium: scoreWhalePremium(input.whalePremium48h),
    volumeSpike: scoreVolumeSpike(input.volumeSpike),
    shortVolumePct: scoreShortVolumePct(input.shortVolumePct, trendResult?.trend ?? null),
    shortVolumeTrend: trendResult?.trend ?? null,
  };

  const total =
    components.siPct +
    components.dtc +
    components.whalePremium +
    components.volumeSpike +
    components.shortVolumePct;

  // Normalise to 0-100 (max raw = 100)
  const totalScore = Math.round(Math.min(100, Math.max(0, total)));

  let squeezeRisk: SqueezeScoreResult["squeezeRisk"];
  if (totalScore > 75) squeezeRisk = "extreme";
  else if (totalScore > 50) squeezeRisk = "high";
  else if (totalScore > 25) squeezeRisk = "moderate";
  else squeezeRisk = "low";

  return {
    ticker: input.ticker,
    totalScore,
    components,
    squeezeRisk,
    computedAt: new Date().toISOString(),
  };
}

// ---- Component scorers ----

/** SI% of float: max 35 pts */
function scoreSiPct(pct: number | null): number {
  if (pct == null) return 0;
  if (pct > 0.30) return 35;
  if (pct > 0.20) return 28;
  if (pct > 0.15) return 20;
  if (pct > 0.10) return 13;
  if (pct > 0.05) return 6;
  return 0;
}

/** Days to cover (DTC): max 25 pts */
function scoreDtc(dtc: number | null): number {
  if (dtc == null) return 0;
  if (dtc > 10) return 25;
  if (dtc > 7) return 20;
  if (dtc > 5) return 14;
  if (dtc > 3) return 8;
  if (dtc > 1.5) return 3;
  return 0;
}

/** Estimated whale call/put premium in last 48 h: max 20 pts */
function scoreWhalePremium(premium: number | null): number {
  if (premium == null) return 0;
  if (premium > 5_000_000) return 20;
  if (premium > 2_000_000) return 15;
  if (premium > 1_000_000) return 10;
  if (premium > 500_000) return 6;
  if (premium > 100_000) return 2;
  return 0;
}

/** Ratio of today's volume vs. 20-day average: max 10 pts */
function scoreVolumeSpike(ratio: number | null): number {
  if (ratio == null) return 0;
  if (ratio > 3.0) return 10;
  if (ratio > 2.0) return 7;
  if (ratio > 1.5) return 4;
  if (ratio > 1.2) return 2;
  return 0;
}

/** FINRA daily short volume fraction (0-1): max 10 pts (with trend bonus) */
function scoreShortVolumePct(pct: number | null, trend: ShortVolumeTrend | null): number {
  if (pct == null) return 0;
  let base = 0;
  if (pct > 0.55) base = 10;
  else if (pct > 0.45) base = 7;
  else if (pct > 0.35) base = 4;
  else if (pct > 0.25) base = 1;
  const bonus = trend === "accelerating" ? 8 : trend === "rising" ? 4 : 0;
  return Math.min(10, base + bonus);
}

/**
 * S51-21: Linear regression over short volume history to detect trend direction.
 * Slope is expressed as change in shortVolumePct per day.
 */
export function computeShortVolumeTrend(
  history: { date: string; shortVolumePct: number }[],
): ShortVolumeTrendResult {
  if (history.length < 2) return { slope: 0, trend: "flat" };

  const n = history.length;
  const xs = history.map((_, i) => i);
  const ys = history.map((h) => h.shortVolumePct);

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((s, x, i) => s + x * ys[i], 0);
  const sumX2 = xs.reduce((s, x) => s + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

  let trend: ShortVolumeTrend;
  if (slope > 0.02) trend = "accelerating";
  else if (slope > 0.005) trend = "rising";
  else if (slope < -0.005) trend = "falling";
  else trend = "flat";

  return { slope, trend };
}
