export type ShortVolumeTrend = "accelerating" | "rising" | "flat" | "falling";

export interface ShortVolumeTrendResult {
  slope: number; // Δ% per day (as decimal, e.g. 0.02 = +2%/day)
  trend: ShortVolumeTrend;
}

export interface SqueezeScoreInput {
  ticker: string;
  /** SI% of float as decimal (e.g. 0.25 = 25%). Null if unavailable. */
  shortPercentOfFloat: number | null;
  /** Days-to-cover (short ratio). Null if unavailable. */
  shortRatio: number | null;
  /** Total estimated whale call/put premium in last 48 h (USD). Null if unavailable. */
  whalePremium48h: number | null;
  /** Ratio of today's volume vs. 20-day average volume. Null if unavailable. */
  volumeSpike: number | null;
  /** Fraction of today's volume that was short-side (FINRA daily). Null if unavailable. */
  shortVolumePct: number | null;
  /** Last 5 days of FINRA short volume history for trend computation. */
  shortVolumeHistory?: { date: string; shortVolumePct: number }[];
}

export interface SqueezeComponentScores {
  siPct: number; // max 35
  dtc: number; // max 25
  whalePremium: number; // max 20
  volumeSpike: number; // max 10
  shortVolumePct: number; // max 10 (includes trend bonus)
  shortVolumeTrend: ShortVolumeTrend | null;
}

export interface SqueezeScoreResult {
  ticker: string;
  totalScore: number; // 0–100
  components: SqueezeComponentScores;
  /** "extreme" >75, "high" >50, "moderate" >25, "low" otherwise */
  squeezeRisk: "extreme" | "high" | "moderate" | "low";
  /** ISO string of when the score was computed */
  computedAt: string;
}

export interface SqueezeRankingEntry extends SqueezeScoreResult {
  shortPercentOfFloat: number | null;
  shortRatio: number | null;
  shortVolumeDate: string | null;
  shortVolumeHistory: { date: string; shortVolumePct: number }[] | null;
}
