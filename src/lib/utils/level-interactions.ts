/**
 * Level Interaction Detection — Story 48.2
 *
 * Evaluates how the most recent candles interact with key price levels
 * (S/R from algo-sr, VPOC, value area boundaries, EMA 9/21).
 *
 * Detects: reclaim, rejection, breakdown, bounce, test, acceptance.
 * Distinguishes wick-only touches from close-based interactions.
 */

import type { Candle } from "./technical-indicators";

// ---------- Types ----------

export type InteractionType =
  | "reclaim"
  | "rejection"
  | "breakdown"
  | "bounce"
  | "test"
  | "acceptance_above"
  | "acceptance_below";

export interface KeyLevel {
  price: number;
  label: string; // e.g. "S/R 345.50 (4★)", "VPOC", "VAH", "EMA21"
  type: "support" | "resistance" | "neutral"; // neutral for VPOC, EMAs
  confluence?: number; // 1–5 from algo-sr, optional for non-SR levels
}

interface CandleSummary {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LevelInteraction {
  level: number;
  levelLabel: string;
  type: InteractionType;
  /** The candle that triggered the interaction */
  candle: CandleSummary;
  /** Follow-through candle if available */
  confirmationCandle: CandleSummary | null;
  /** True if level was only touched by wick, not close */
  wickOnly: boolean;
  /** Distance from current price to level (%) — positive = above, negative = below */
  distance: number;
  /** Confluence score from algo-sr (1–5), undefined for non-SR levels */
  confluence?: number;
}

// ---------- Helpers ----------

function toSummary(c: Candle): CandleSummary {
  return {
    time: typeof c.time === "number" ? c.time : new Date(c.time).getTime(),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

/** Tolerance zone around a level — within this band counts as "at the level" */
function levelTolerance(level: number): number {
  return level * 0.003; // 0.3%
}

function isNear(price: number, level: number, tol: number): boolean {
  return Math.abs(price - level) <= tol;
}

// ---------- Core ----------

/**
 * Detect how recent candles interact with a single key level.
 *
 * Evaluates the last `lookback` candles for discrete interaction events.
 * Returns the most significant interaction found, or null.
 */
export function detectLevelInteraction(
  candles: Candle[],
  level: KeyLevel,
  lookback: number = 5,
): LevelInteraction | null {
  if (candles.length < 2) return null;

  const recent = candles.slice(-Math.min(lookback + 1, candles.length));
  if (recent.length < 2) return null;

  const tol = levelTolerance(level.price);
  const lp = level.price;
  const currentPrice = recent[recent.length - 1].close;
  const distance = ((currentPrice - lp) / lp) * 100;

  const makeResult = (
    type: InteractionType,
    candle: CandleSummary,
    confirmationCandle: CandleSummary | null,
    wickOnly: boolean,
  ): LevelInteraction => ({
    level: lp,
    levelLabel: level.label,
    type,
    candle,
    confirmationCandle,
    wickOnly,
    distance,
    ...(level.confluence != null ? { confluence: level.confluence } : {}),
  });

  // Check for acceptance first (2+ consecutive closes on same side)
  const acceptance = detectAcceptance(recent, lp, tol);
  if (acceptance) {
    return makeResult(
      acceptance,
      toSummary(recent[recent.length - 1]),
      recent.length >= 2 ? toSummary(recent[recent.length - 2]) : null,
      false,
    );
  }

  // Scan from the most recent candle backward for interaction events
  for (let i = recent.length - 1; i >= 1; i--) {
    const curr = recent[i];
    const prev = recent[i - 1];
    const next = i < recent.length - 1 ? recent[i + 1] : null;

    // --- Reclaim: was below, now closed above ---
    if (prev.close < lp - tol && curr.close > lp + tol) {
      const held = next ? next.close > lp - tol : null;
      // Only count as reclaim if next candle held (or it's the most recent candle)
      if (held !== false) {
        return makeResult(
          "reclaim",
          toSummary(curr),
          next ? toSummary(next) : null,
          false,
        );
      }
    }

    // --- Breakdown: was above, now closed below ---
    if (prev.close > lp + tol && curr.close < lp - tol) {
      const held = next ? next.close < lp + tol : null;
      if (held !== false) {
        return makeResult(
          "breakdown",
          toSummary(curr),
          next ? toSummary(next) : null,
          false,
        );
      }
    }

    // --- Rejection: approached from below, wicked above, closed below ---
    if (
      prev.close < lp - tol &&
      curr.high >= lp - tol &&
      curr.close < lp - tol
    ) {
      return makeResult(
        "rejection",
        toSummary(curr),
        next ? toSummary(next) : null,
        curr.high > lp && curr.close < lp,
      );
    }

    // --- Bounce: approached from above, wicked below, closed above ---
    if (
      prev.close > lp + tol &&
      curr.low <= lp + tol &&
      curr.close > lp + tol
    ) {
      return makeResult(
        "bounce",
        toSummary(curr),
        next ? toSummary(next) : null,
        curr.low < lp && curr.close > lp,
      );
    }
  }

  // --- Test: current price is near the level but no resolved interaction ---
  const last = recent[recent.length - 1];
  if (
    isNear(last.close, lp, tol) ||
    (last.low <= lp + tol && last.high >= lp - tol)
  ) {
    return makeResult(
      "test",
      toSummary(last),
      null,
      !isNear(last.close, lp, tol),
    );
  }

  return null;
}

/**
 * Check for acceptance: 2+ consecutive closes on the same side of a level.
 */
function detectAcceptance(
  candles: Candle[],
  level: number,
  tol: number,
): "acceptance_above" | "acceptance_below" | null {
  if (candles.length < 3) return null;

  // Check last 3 candles — need at least 2 consecutive closes
  const last3 = candles.slice(-3);
  const prevPrev = last3[0];
  const prev = last3[1];
  const curr = last3[2];

  // Acceptance above: prior candle was below/near level, then 2 consecutive closes above
  if (
    prevPrev.close < level + tol &&
    prev.close > level + tol &&
    curr.close > level + tol
  ) {
    return "acceptance_above";
  }

  // Acceptance below: prior candle was above/near level, then 2 consecutive closes below
  if (
    prevPrev.close > level - tol &&
    prev.close < level - tol &&
    curr.close < level - tol
  ) {
    return "acceptance_below";
  }

  return null;
}

/**
 * Detect interactions for multiple key levels against the same candle array.
 * Returns all non-null interactions, sorted by significance (acceptance > reclaim/breakdown > others).
 */
export function detectAllLevelInteractions(
  candles: Candle[],
  levels: KeyLevel[],
  lookback: number = 5,
): LevelInteraction[] {
  const interactions: LevelInteraction[] = [];

  for (const level of levels) {
    const interaction = detectLevelInteraction(candles, level, lookback);
    if (interaction) {
      interactions.push(interaction);
    }
  }

  // Sort by significance: acceptance > reclaim/breakdown > bounce/rejection > test
  const typeOrder: Record<InteractionType, number> = {
    acceptance_above: 0,
    acceptance_below: 0,
    reclaim: 1,
    breakdown: 1,
    bounce: 2,
    rejection: 2,
    test: 3,
  };

  interactions.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
  return interactions;
}
