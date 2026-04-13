/**
 * Trigger Engine — Stories 48.4 + 48.5
 *
 * Implements the 3-gate trigger validation cascade and 0–100 scoring model.
 *
 * Gate 1: Level interaction exists (non-test)
 * Gate 2: Structure alignment (bullish trigger needs non-bearish structure, etc.)
 * Gate 3: Confirmation (close-based + follow-through or momentum)
 *
 * Scoring:
 *   Level Interaction Quality  0–40  (confluence, VPOC bonus, wick penalty)
 *   Structure Alignment        0–25
 *   Context Alignment (HTF)    0–20
 *   Pattern Support            0–15
 */

import type { LevelInteraction, InteractionType } from "./level-interactions";
import type { KeyLevel } from "./level-interactions";
import { detectAllLevelInteractions } from "./level-interactions";
import type { SwingStructure, StructureType } from "./swing-structure";
import { analyzeSwingStructure } from "./swing-structure";
import type {
  IndicatorPatternReport,
  IndicatorSignal,
} from "./indicator-patterns";
import type { AlgoSRLevel } from "./algo-sr";
import type { VolumeProfile } from "./volume-profile";
import { analyzeValueAreaInteractions } from "./value-area-interactions";
import type { Candle } from "./technical-indicators";

// ---------- Types ----------

export type TriggerDirection = "bullish" | "bearish" | "neutral";
export type TriggerClassification =
  | "trigger"
  | "weak_trigger"
  | "setup"
  | "no_trigger";
export type HTFAlignment = "aligned" | "countertrend" | "conflicted";
export type ConfirmationType =
  | "close_above"
  | "close_below"
  | "hold"
  | "follow_through"
  | "momentum_expansion"
  | "none";
export type TriggerConfidence = "high" | "moderate" | "low";

export interface ScoreBreakdown {
  levelInteraction: number; // 0–40
  structureAlignment: number; // 0–25
  contextAlignment: number; // 0–20
  patternSupport: number; // 0–15
}

export interface TriggerResult {
  direction: TriggerDirection;
  classification: TriggerClassification;
  score: number; // 0–100 composite
  scoreBreakdown: ScoreBreakdown;
  interaction: LevelInteraction | null;
  structureContext: StructureType;
  htfAlignment: HTFAlignment;
  confirmationType: ConfirmationType;
  confidence: TriggerConfidence;
  summary: string;
}

export type OverallAssessment =
  | "actionable_bullish"
  | "actionable_bearish"
  | "setup_only"
  | "no_trigger"
  | "conflicted";

export interface TriggerReport {
  ticker: string;
  computedAt: string;
  primaryTrigger: TriggerResult | null;
  secondaryTriggers: TriggerResult[];
  activeLevels: LevelInteraction[];
  swingStructure: SwingStructure;
  overallAssessment: OverallAssessment;
}

export interface TriggerEngineInput {
  ticker: string;
  interactions: LevelInteraction[];
  swingStructure: SwingStructure;
  dailyPatterns: IndicatorPatternReport | null;
  htfPatterns: IndicatorPatternReport[]; // 1W, 1M, etc.
}

// ---------- Helpers ----------

const BULLISH_TYPES = new Set<InteractionType>([
  "reclaim",
  "bounce",
  "acceptance_above",
]);
const BEARISH_TYPES = new Set<InteractionType>([
  "breakdown",
  "rejection",
  "acceptance_below",
]);

function interactionDirection(type: InteractionType): TriggerDirection {
  if (BULLISH_TYPES.has(type)) return "bullish";
  if (BEARISH_TYPES.has(type)) return "bearish";
  return "neutral";
}

// ---------- Gate 1: Level Interaction ----------

function gate1Passes(interaction: LevelInteraction): boolean {
  return interaction.type !== "test";
}

// ---------- Gate 2: Structure Alignment ----------

function gate2Passes(
  direction: TriggerDirection,
  structure: StructureType,
): { passes: boolean; countertrend: boolean } {
  if (direction === "neutral") return { passes: true, countertrend: false };
  if (direction === "bullish" && structure === "bearish")
    return { passes: false, countertrend: true };
  if (direction === "bearish" && structure === "bullish")
    return { passes: false, countertrend: true };
  return { passes: true, countertrend: false };
}

// ---------- Gate 3: Confirmation ----------

function gate3Check(interaction: LevelInteraction): {
  passes: boolean;
  confirmationType: ConfirmationType;
} {
  if (interaction.wickOnly) return { passes: false, confirmationType: "none" };

  // Close-based confirmation
  const hasFollowThrough = interaction.confirmationCandle !== null;

  if (hasFollowThrough) {
    const dir = interactionDirection(interaction.type);
    if (dir === "bullish") {
      const held =
        interaction.confirmationCandle!.close > interaction.level * 0.997;
      if (held) return { passes: true, confirmationType: "follow_through" };
      return { passes: true, confirmationType: "close_above" };
    }
    if (dir === "bearish") {
      const held =
        interaction.confirmationCandle!.close < interaction.level * 1.003;
      if (held) return { passes: true, confirmationType: "follow_through" };
      return { passes: true, confirmationType: "close_below" };
    }
    return { passes: true, confirmationType: "hold" };
  }

  // Close-based without follow-through — passes but weaker
  const dir = interactionDirection(interaction.type);
  if (dir === "bullish")
    return { passes: true, confirmationType: "close_above" };
  if (dir === "bearish")
    return { passes: true, confirmationType: "close_below" };
  return { passes: true, confirmationType: "hold" };
}

// ---------- Scoring: Level Interaction Quality (0–40) ----------

function scoreLevelInteraction(interaction: LevelInteraction): number {
  const confluence = interaction.confluence ?? 1;
  // 1★=8, 2★=16, 3★=24, 4★=32, 5★=40
  let score = Math.min(confluence, 5) * 8;

  // Bonus for VPOC or value area levels
  const label = interaction.levelLabel.toLowerCase();
  if (label.includes("vpoc")) score = Math.min(score + 5, 40);
  else if (label.includes("vah") || label.includes("val"))
    score = Math.min(score + 3, 40);

  // Penalty for wick-only
  if (interaction.wickOnly) score = Math.max(score - 10, 0);

  return score;
}

// ---------- Scoring: Structure Alignment (0–25) ----------

function scoreStructureAlignment(
  direction: TriggerDirection,
  structure: StructureType,
): number {
  if (direction === "neutral") return 15;

  const aligned =
    (direction === "bullish" && structure === "bullish") ||
    (direction === "bearish" && structure === "bearish");
  if (aligned) return 25;

  if (structure === "consolidation") return 15;
  if (structure === "transition") return 12;

  // Countertrend (bullish trigger in bearish structure or vice versa)
  return 5;
}

// ---------- Scoring: Context Alignment / HTF (0–20) ----------

function scoreContextAlignment(
  direction: TriggerDirection,
  htfPatterns: IndicatorPatternReport[],
): { score: number; alignment: HTFAlignment } {
  if (htfPatterns.length === 0) return { score: 10, alignment: "conflicted" };

  let agree = 0;
  let oppose = 0;
  let neutral = 0;

  for (const report of htfPatterns) {
    const sig: IndicatorSignal = report.aggregateSignal.direction;
    if (sig === direction) agree++;
    else if (sig === "neutral") neutral++;
    else oppose++;
  }

  const total = htfPatterns.length;

  if (agree === total) return { score: 20, alignment: "aligned" };
  if (agree >= total * 0.67) return { score: 14, alignment: "aligned" };
  if (oppose >= total * 0.67) return { score: 3, alignment: "countertrend" };
  return { score: 8, alignment: "conflicted" };
}

// ---------- Scoring: Pattern Support (0–15) ----------

function scorePatternSupport(
  direction: TriggerDirection,
  dailyPatterns: IndicatorPatternReport | null,
): number {
  if (!dailyPatterns) return 0;

  // Count recent patterns aligned with trigger direction
  const recentAligned = dailyPatterns.patterns.filter(
    (p) => p.isRecent && p.signal === direction,
  );

  // Combination patterns at level are high value
  const combosAligned = dailyPatterns.combinations.filter(
    (c) => c.signal === direction,
  );

  if (combosAligned.length > 0 && recentAligned.length > 0) return 15;
  if (recentAligned.length >= 2) return 10;
  if (recentAligned.length === 1) return 5;
  return 0;
}

// ---------- Classification ----------

function classify(
  gate1: boolean,
  gate2: { passes: boolean; countertrend: boolean },
  gate3: { passes: boolean },
): TriggerClassification {
  if (!gate1) return "no_trigger";
  if (gate1 && gate2.passes && gate3.passes) return "trigger";
  if (gate1 && gate2.countertrend && gate3.passes) return "weak_trigger";
  if (gate1 && gate2.passes && !gate3.passes) return "setup";
  if (gate1 && !gate2.passes && gate3.passes) return "weak_trigger";
  return "setup";
}

function confidenceFromScore(score: number): TriggerConfidence {
  if (score >= 70) return "high";
  if (score >= 55) return "moderate";
  return "low";
}

// ---------- Summary ----------

function buildSummary(
  direction: TriggerDirection,
  classification: TriggerClassification,
  interaction: LevelInteraction,
  structure: StructureType,
  htfAlignment: HTFAlignment,
  confirmationType: ConfirmationType,
  score: number,
): string {
  const dirLabel = direction.charAt(0).toUpperCase() + direction.slice(1);
  const classLabel = classification.replace("_", " ");
  const typeLabel = interaction.type.replace("_", " ");
  const level = `$${interaction.level.toFixed(2)}`;
  const label = interaction.levelLabel;

  const confirm =
    confirmationType === "none"
      ? "no confirmation yet"
      : confirmationType.replace("_", " ");

  return `${dirLabel} ${classLabel}: price ${typeLabel} at ${level} (${label}) with ${structure} structure. HTF ${htfAlignment}. Confirmation: ${confirm}. Score: ${score}/100.`;
}

// ---------- Core: Evaluate Single Interaction ----------

function evaluateTrigger(
  interaction: LevelInteraction,
  swingStructure: SwingStructure,
  dailyPatterns: IndicatorPatternReport | null,
  htfPatterns: IndicatorPatternReport[],
): TriggerResult {
  const direction = interactionDirection(interaction.type);
  const g1 = gate1Passes(interaction);
  const g2 = gate2Passes(direction, swingStructure.structure);
  const g3 = gate3Check(interaction);

  const classification = classify(g1, g2, g3);

  const levelScore = scoreLevelInteraction(interaction);
  const structScore = scoreStructureAlignment(
    direction,
    swingStructure.structure,
  );
  const { score: ctxScore, alignment: htfAlignment } = scoreContextAlignment(
    direction,
    htfPatterns,
  );
  const patternScore = scorePatternSupport(direction, dailyPatterns);

  const score = levelScore + structScore + ctxScore + patternScore;
  const confidence = confidenceFromScore(score);

  return {
    direction,
    classification,
    score,
    scoreBreakdown: {
      levelInteraction: levelScore,
      structureAlignment: structScore,
      contextAlignment: ctxScore,
      patternSupport: patternScore,
    },
    interaction,
    structureContext: swingStructure.structure,
    htfAlignment,
    confirmationType: g3.confirmationType,
    confidence,
    summary: buildSummary(
      direction,
      classification,
      interaction,
      swingStructure.structure,
      htfAlignment,
      g3.confirmationType,
      score,
    ),
  };
}

// ---------- Core: Compute Full Trigger Report ----------

function assessOverall(
  primary: TriggerResult | null,
  secondary: TriggerResult[],
): OverallAssessment {
  if (!primary || primary.classification === "no_trigger") return "no_trigger";

  const hasBullishTrigger =
    primary.direction === "bullish" &&
    (primary.classification === "trigger" ||
      primary.classification === "weak_trigger");
  const hasBearishTrigger =
    primary.direction === "bearish" &&
    (primary.classification === "trigger" ||
      primary.classification === "weak_trigger");

  // Check for conflicting strong triggers
  const opposingStrong = secondary.find(
    (t) =>
      t.direction !== primary.direction &&
      t.direction !== "neutral" &&
      (t.classification === "trigger" || t.classification === "weak_trigger") &&
      t.score >= 55,
  );

  if (opposingStrong && hasBullishTrigger) return "conflicted";
  if (opposingStrong && hasBearishTrigger) return "conflicted";

  if (hasBullishTrigger && primary.score >= 55) return "actionable_bullish";
  if (hasBearishTrigger && primary.score >= 55) return "actionable_bearish";

  if (primary.classification === "setup") return "setup_only";
  return "setup_only";
}

/**
 * Run the trigger validation cascade and scoring model against all
 * detected level interactions.
 *
 * Returns a TriggerReport with the highest-scoring primary trigger,
 * secondary triggers, and an overall assessment.
 */
export function computeTriggerReport(input: TriggerEngineInput): TriggerReport {
  const { ticker, interactions, swingStructure, dailyPatterns, htfPatterns } =
    input;

  if (interactions.length === 0) {
    return {
      ticker,
      computedAt: new Date().toISOString(),
      primaryTrigger: null,
      secondaryTriggers: [],
      activeLevels: interactions,
      swingStructure,
      overallAssessment: "no_trigger",
    };
  }

  // Evaluate every interaction
  const results = interactions.map((int) =>
    evaluateTrigger(int, swingStructure, dailyPatterns, htfPatterns),
  );

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  const primary = results[0] ?? null;
  const secondary = results.slice(1);

  return {
    ticker,
    computedAt: new Date().toISOString(),
    primaryTrigger: primary,
    secondaryTriggers: secondary,
    activeLevels: interactions,
    swingStructure,
    overallAssessment: assessOverall(primary, secondary),
  };
}

// ---------- Prompt Formatting ----------

/**
 * Format a TriggerReport as a structured text block for the recommendation prompt.
 */
export function formatTriggerReportForPrompt(
  report: TriggerReport,
): string | null {
  if (!report.primaryTrigger || report.overallAssessment === "no_trigger") {
    return null;
  }

  const primary = report.primaryTrigger;
  const lines: string[] = [
    "=== 1-DAY CHART TRIGGER ASSESSMENT ===",
    `Primary Trigger: ${primary.direction.toUpperCase()} ${primary.classification.toUpperCase().replace("_", " ")} (score: ${primary.score}/100)`,
  ];

  if (primary.interaction) {
    lines.push(
      `  Level: Price ${primary.interaction.type.replace("_", " ")} at $${primary.interaction.level.toFixed(2)} (${primary.interaction.levelLabel})`,
    );
  }
  lines.push(`  Structure: ${capitalize(primary.structureContext)}`);
  lines.push(`  Confirmation: ${primary.confirmationType.replace(/_/g, " ")}`);
  lines.push(`  HTF Context: ${primary.htfAlignment.toUpperCase()}`);
  lines.push(
    `  Score Breakdown: Level ${primary.scoreBreakdown.levelInteraction}/40, Structure ${primary.scoreBreakdown.structureAlignment}/25, Context ${primary.scoreBreakdown.contextAlignment}/20, Patterns ${primary.scoreBreakdown.patternSupport}/15`,
  );

  // Secondary triggers
  for (const t of report.secondaryTriggers.slice(0, 2)) {
    if (t.classification !== "no_trigger" && t.interaction) {
      lines.push(
        `\nSecondary: ${capitalize(t.direction)} ${t.classification.replace("_", " ")} at $${t.interaction.level.toFixed(2)} (${t.interaction.levelLabel}) — score ${t.score}`,
      );
    }
  }

  // Swing structure summary
  const sw = report.swingStructure;
  const swParts = [`Swing Structure: ${capitalize(sw.structure)}`];
  if (sw.lastHigherLow)
    swParts.push(`last HL $${sw.lastHigherLow.price.toFixed(2)}`);
  if (sw.lastLowerHigh)
    swParts.push(`last LH $${sw.lastLowerHigh.price.toFixed(2)}`);
  lines.push(`\n${swParts.join(" — ")}`);

  // Mandate for strong triggers
  if (primary.score >= 55) {
    lines.push(
      `\nMANDATE: The primary trigger is ${primary.direction.toUpperCase()} with score ${primary.score}. Your recommendation MUST incorporate this trigger assessment. If you disagree, explain why in the thesis.`,
    );
  }

  lines.push("===");
  return lines.join("\n");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- Convenience: Build Trigger Report from Raw Data ----------

export interface BuildTriggerInput {
  ticker: string;
  /** Daily candles (e.g. 3M of daily bars) */
  candles: Candle[];
  /** Pre-computed algo S/R levels (will be converted to KeyLevel[]) */
  algoSRLevels?: AlgoSRLevel[];
  /** Pre-computed volume profile (used for value-area interactions) */
  volumeProfile?: VolumeProfile | null;
  /** Daily timeframe indicator pattern report */
  dailyPatterns?: IndicatorPatternReport | null;
  /** Higher-timeframe indicator pattern reports (1W, 1M, etc.) */
  htfPatterns?: IndicatorPatternReport[];
}

/**
 * Convenience function that orchestrates the full trigger detection pipeline:
 * swing detection → level interactions → value area interactions → trigger engine.
 *
 * Accepts pre-computed algo-SR and volume profile (when available from
 * generateDeepDive) or works without them (recommendation path).
 */
export function buildTriggerReport(input: BuildTriggerInput): TriggerReport {
  const {
    ticker,
    candles,
    algoSRLevels = [],
    volumeProfile = null,
    dailyPatterns = null,
    htfPatterns = [],
  } = input;

  if (candles.length < 10) {
    return {
      ticker,
      computedAt: new Date().toISOString(),
      primaryTrigger: null,
      secondaryTriggers: [],
      activeLevels: [],
      swingStructure: {
        structure: "consolidation",
        structureShift: null,
        swings: [],
        lastHigherLow: null,
        lastLowerHigh: null,
      },
      overallAssessment: "no_trigger",
    };
  }

  // 1. Swing structure from daily candles
  const swingStructure = analyzeSwingStructure(candles);

  // 2. Convert algo-SR levels to KeyLevel[]
  const keyLevels: KeyLevel[] = algoSRLevels.map((sr) => ({
    price: sr.price,
    label: `S/R ${sr.price.toFixed(2)} (${sr.confluence}★)`,
    type: sr.type,
    confluence: sr.confluence,
  }));

  // 3. Detect interactions with S/R levels
  const srInteractions = detectAllLevelInteractions(candles, keyLevels);

  // 4. Value area interactions (if volume profile available)
  let vaInteractions: LevelInteraction[] = [];
  if (volumeProfile) {
    const va = analyzeValueAreaInteractions(candles, volumeProfile);
    vaInteractions = va.interactions;
  }

  // 5. Merge — deduplicate by picking the higher-confluence interaction for nearby levels
  const allInteractions = [...srInteractions, ...vaInteractions];

  // 6. Run trigger engine
  return computeTriggerReport({
    ticker,
    interactions: allInteractions,
    swingStructure,
    dailyPatterns,
    htfPatterns,
  });
}
