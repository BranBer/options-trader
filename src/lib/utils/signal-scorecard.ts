/**
 * Signal Scorecard — Story 39.11
 *
 * Pre-computes a structured summary of all available signals before the LLM
 * call so the model receives a clear, hard-to-ignore verdict.  The scorecard
 * is injected at the TOP of the recommendation prompt.
 */

import type { IndicatorPatternReport } from "@/lib/utils/indicator-patterns";
import type { ShortInterestData } from "@/lib/services/market-fetcher";
import type { DeepDiveSummary } from "@/types/analysis";

// ---------- Types ----------

export interface SignalScorecard {
  bullishSignals: string[];
  bearishSignals: string[];
  neutralSignals: string[];
  overallLean: "bullish" | "bearish" | "neutral" | "conflicted";
  conflictLevel: "none" | "minor" | "major" | "extreme";
  signalCounts: { bullish: number; bearish: number; neutral: number };
  dominantTimeframe: "1W" | "1M" | "3M" | "6M" | "1Y";
  suggestedExpiryRange: { min: number; max: number }; // calendar days
  shortCoveringRisk: "none" | "low" | "moderate" | "high";
}

export interface ScorecardInput {
  /** Inferred direction from whale smart_money_signal */
  whaleDirection: "bullish" | "bearish" | "neutral";
  /** Raw premium paid by whale (dollars) */
  whalePremium?: number;
  /** "call" | "put" */
  whaleOptionType?: string;
  /** Indicator pattern reports keyed by timeframe ("1W", "1M", "3M", …) */
  indicatorReportsByTimeframe?: Partial<Record<string, IndicatorPatternReport>>;
  /** Options put/call volume ratio — computed from nearestExpiry volume sums */
  pcRatio?: number | null;
  /** Dealer GEX positioning string */
  gexPositioning?: string | null;
  shortInterest?: ShortInterestData | null;
  deepDiveSummary?: DeepDiveSummary | null;
}

// ---------- Core computation ----------

export function computeSignalScorecard(input: ScorecardInput): SignalScorecard {
  const bullishSignals: string[] = [];
  const bearishSignals: string[] = [];
  const neutralSignals: string[] = [];

  // 1. Whale trade
  const premiumStr =
    input.whalePremium != null
      ? ` $${(input.whalePremium / 1e6).toFixed(1)}M premium`
      : "";
  if (input.whaleDirection === "bullish") {
    bullishSignals.push(
      `Whale: ${input.whaleOptionType === "put" ? "put-sell" : "call buy"}${premiumStr}`,
    );
  } else if (input.whaleDirection === "bearish") {
    bearishSignals.push(
      `Whale: ${input.whaleOptionType === "call" ? "call-sell" : "put buy"}${premiumStr}`,
    );
  } else {
    neutralSignals.push(`Whale: direction unclear${premiumStr}`);
  }

  // 2. Multi-timeframe indicator patterns
  const TF_ORDER = ["1W", "1M", "3M", "6M", "1Y"] as const;
  type SupportedTf = (typeof TF_ORDER)[number];
  let dominantTimeframe: SupportedTf = "3M";
  let strongestEdge = 0;

  for (const tf of TF_ORDER) {
    const report = input.indicatorReportsByTimeframe?.[tf];
    if (!report) continue;

    const bullish = report.patterns.filter(
      (p) => p.signal === "bullish",
    ).length;
    const bearish = report.patterns.filter(
      (p) => p.signal === "bearish",
    ).length;
    const total = bullish + bearish;
    if (total === 0) continue;

    const label =
      tf === "1W"
        ? "Short-term (1W)"
        : tf === "1M"
          ? "Medium-term (1M)"
          : tf === "3M"
            ? "Macro (3M)"
            : `${tf} patterns`;

    if (bullish > bearish) {
      bullishSignals.push(
        `${label} patterns: ${bullish} bullish, ${bearish} bearish`,
      );
    } else if (bearish > bullish) {
      bearishSignals.push(
        `${label} patterns: ${bearish} bearish, ${bullish} bullish`,
      );
    } else {
      neutralSignals.push(`${label} patterns: mixed (${bullish} each)`);
    }

    const edge = Math.abs(bullish - bearish);
    if (edge > strongestEdge) {
      strongestEdge = edge;
      dominantTimeframe = tf;
    }
  }

  // 3. Put/Call ratio
  if (input.pcRatio != null) {
    if (input.pcRatio < 0.7) {
      bullishSignals.push(
        `Put/Call ratio: ${input.pcRatio.toFixed(2)} (low put demand — bullish sentiment)`,
      );
    } else if (input.pcRatio > 1.3) {
      bearishSignals.push(
        `Put/Call ratio: ${input.pcRatio.toFixed(2)} (elevated put demand — bearish sentiment)`,
      );
    } else {
      neutralSignals.push(
        `Put/Call ratio: ${input.pcRatio.toFixed(2)} (neutral)`,
      );
    }
  }

  // 4. GEX positioning (contextual — affects strategy, not direction)
  if (input.gexPositioning === "long_gamma") {
    neutralSignals.push(
      "Dealer GEX: long gamma (rangebound — favors credit/neutral strategies)",
    );
  } else if (input.gexPositioning === "short_gamma") {
    neutralSignals.push(
      "Dealer GEX: short gamma (amplifies moves — favors directional debit)",
    );
  }

  // 5. Deep dive sentiment (highest weight after technicals)
  if (input.deepDiveSummary) {
    const { overallSentiment, riskLevel } = input.deepDiveSummary;
    const entry = `Deep dive: sentiment=${overallSentiment}, risk=${riskLevel}`;
    if (overallSentiment === "bullish") {
      bullishSignals.push(entry);
    } else if (overallSentiment === "bearish") {
      bearishSignals.push(entry);
    } else {
      neutralSignals.push(entry);
    }
  }

  // 6. Short covering risk
  let shortCoveringRisk: SignalScorecard["shortCoveringRisk"] = "none";
  if (input.shortInterest) {
    const pct = input.shortInterest.shortPercentOfFloat ?? 0;
    if (input.whaleDirection === "bullish" && pct > 0.1) {
      shortCoveringRisk = pct > 0.2 ? "high" : "moderate";
    } else if (pct > 0.05) {
      shortCoveringRisk = "low";
    }
  }

  // Aggregate counts
  const bCount = bullishSignals.length;
  const bearCount = bearishSignals.length;
  const nCount = neutralSignals.length;

  // Overall lean
  let overallLean: SignalScorecard["overallLean"];
  const diff = bCount - bearCount;
  const total = bCount + bearCount + nCount;

  if (total === 0) {
    overallLean = "neutral";
  } else if (Math.abs(diff) <= 1 && total >= 3) {
    overallLean = "conflicted";
  } else if (diff > 0) {
    overallLean = "bullish";
  } else if (diff < 0) {
    overallLean = "bearish";
  } else {
    overallLean = "neutral";
  }

  // Conflict level — whale disagrees with consensus?
  let conflictLevel: SignalScorecard["conflictLevel"] = "none";
  const whaleConflicts =
    (input.whaleDirection === "bullish" && bearCount > bCount) ||
    (input.whaleDirection === "bearish" && bCount > bearCount);

  if (whaleConflicts) {
    const divergence = Math.abs(diff);
    if (divergence >= 4) conflictLevel = "extreme";
    else if (divergence >= 2) conflictLevel = "major";
    else conflictLevel = "minor";
  }

  // Suggested expiry range based on dominant timeframe
  const expiryMap: Record<SupportedTf, { min: number; max: number }> = {
    "1W": { min: 7, max: 14 },
    "1M": { min: 14, max: 30 },
    "3M": { min: 30, max: 60 },
    "6M": { min: 60, max: 120 },
    "1Y": { min: 90, max: 180 },
  };
  const suggestedExpiryRange = expiryMap[dominantTimeframe];

  return {
    bullishSignals,
    bearishSignals,
    neutralSignals,
    overallLean,
    conflictLevel,
    signalCounts: { bullish: bCount, bearish: bearCount, neutral: nCount },
    dominantTimeframe,
    suggestedExpiryRange,
    shortCoveringRisk,
  };
}

// ---------- Prompt formatter ----------

export function formatScorecardForPrompt(
  scorecard: SignalScorecard,
  whaleDirection: "bullish" | "bearish" | "neutral",
): string {
  const {
    bullishSignals,
    bearishSignals,
    overallLean,
    conflictLevel,
    shortCoveringRisk,
  } = scorecard;

  const leanLabel = overallLean.toUpperCase();
  const totalB = scorecard.signalCounts.bullish;
  const totalBear = scorecard.signalCounts.bearish;
  const tally =
    overallLean === "conflicted"
      ? `${totalBear} bearish vs ${totalB} bullish — deeply split`
      : overallLean === "bullish"
        ? `${totalB} bullish vs ${totalBear} bearish signals`
        : overallLean === "bearish"
          ? `${totalBear} bearish vs ${totalB} bullish signals`
          : "signals evenly split";

  const conflictNote =
    conflictLevel !== "none"
      ? `\nConflict Level: ${conflictLevel.toUpperCase()} — whale direction (${whaleDirection}) contradicts ${overallLean === "conflicted" ? "split" : overallLean} technical consensus`
      : `\nConflict Level: NONE — whale and technicals are aligned`;

  const scNote =
    shortCoveringRisk !== "none"
      ? `\nShort Covering Risk: ${shortCoveringRisk.toUpperCase()}${
          shortCoveringRisk === "high" || shortCoveringRisk === "moderate"
            ? ` — high short float + whale buying calls may be short covering, NOT bullish conviction`
            : ""
        }`
      : "";

  const tfNote = `\nDominant Signal Timeframe: ${scorecard.dominantTimeframe} → suggested expiry: ${scorecard.suggestedExpiryRange.min}–${scorecard.suggestedExpiryRange.max} days`;

  const bearLines =
    bearishSignals.length > 0
      ? `\n\nBearish Signals:\n${bearishSignals.map((s) => `- ${s}`).join("\n")}`
      : "";
  const bullLines =
    bullishSignals.length > 0
      ? `\n\nBullish Signals:\n${bullishSignals.map((s) => `- ${s}`).join("\n")}`
      : "";
  const neutralLines =
    scorecard.neutralSignals.length > 0
      ? `\n\nNeutral/Contextual Signals:\n${scorecard.neutralSignals.map((s) => `- ${s}`).join("\n")}`
      : "";

  const mandate =
    conflictLevel === "major" || conflictLevel === "extreme"
      ? `\n\n⚠️ YOUR RECOMMENDATION MUST REFLECT THIS SCORECARD. If you recommend ${whaleDirection} despite a ${overallLean} scorecard, you MUST provide compelling counter-evidence in your thesis.`
      : conflictLevel === "minor"
        ? `\nNote: Minor conflict detected. Address the disagreement between whale and technical signals in your thesis.`
        : "";

  return `=== PRE-COMPUTED SIGNAL SCORECARD ===
Overall Lean: ${leanLabel} (${tally})${conflictNote}${scNote}${tfNote}${bearLines}${bullLines}${neutralLines}${mandate}
===`;
}
