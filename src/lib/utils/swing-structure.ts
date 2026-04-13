/**
 * Swing Structure Detection — Story 48.1
 *
 * Computes swing highs/lows from 1D candles and classifies market structure
 * as bullish (HH+HL), bearish (LH+LL), consolidation, or transition.
 *
 * Pure computation — no external dependencies beyond the Candle type.
 */

import type { Candle } from "./technical-indicators";

// ---------- Types ----------

export interface SwingPoint {
  type: "high" | "low";
  price: number;
  time: number; // epoch ms (parsed from candle.time)
  index: number; // candle index
}

export type StructureType =
  | "bullish"
  | "bearish"
  | "consolidation"
  | "transition";

export interface SwingStructure {
  /** Swing points ordered chronologically */
  swings: SwingPoint[];
  /** Current market structure classification */
  structure: StructureType;
  /** If structure recently shifted, describes the transition */
  structureShift: {
    from: "bullish" | "bearish" | "consolidation";
    at: SwingPoint; // the swing that broke the prior structure
  } | null;
  /** Most recent higher low (bullish evidence) */
  lastHigherLow: SwingPoint | null;
  /** Most recent lower high (bearish evidence) */
  lastLowerHigh: SwingPoint | null;
}

// ---------- Helpers ----------

function candleTime(candle: Candle): number {
  return typeof candle.time === "number"
    ? candle.time
    : new Date(candle.time).getTime();
}

// ---------- Core ----------

/**
 * Detect swing highs and swing lows using a Williams-fractal approach.
 *
 * A swing high at index i: candle[i].high is strictly greater than
 * the high of the `order` candles on both sides.
 *
 * An ATR-based noise filter ensures only meaningful swings are kept.
 *
 * @param candles   1D OHLCV candles (minimum `2 * order + 1` required)
 * @param order     Number of bars on each side to confirm a swing (default 3)
 * @param atrMult   Minimum prominence as a multiple of ATR (default 0.25)
 */
export function detectSwings(
  candles: Candle[],
  order: number = 3,
  atrMult: number = 0.25,
): SwingPoint[] {
  const minLen = order * 2 + 1;
  if (candles.length < minLen) return [];

  // Compute ATR for noise filtering
  let atrSum = 0;
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
    atrSum += tr;
  }
  const atr = atrSum / (candles.length - 1);
  const minProm = atr * atrMult;

  const swings: SwingPoint[] = [];

  for (let i = order; i < candles.length - order; i++) {
    // --- Swing high ---
    let isHigh = true;
    for (let j = 1; j <= order; j++) {
      if (
        candles[i].high <= candles[i - j].high ||
        candles[i].high <= candles[i + j].high
      ) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) {
      const neighborMax = Math.max(
        ...Array.from({ length: order }, (_, j) =>
          Math.max(candles[i - j - 1].high, candles[i + j + 1].high),
        ),
      );
      if (candles[i].high - neighborMax >= minProm) {
        swings.push({
          type: "high",
          price: candles[i].high,
          time: candleTime(candles[i]),
          index: i,
        });
      }
    }

    // --- Swing low ---
    let isLow = true;
    for (let j = 1; j <= order; j++) {
      if (
        candles[i].low >= candles[i - j].low ||
        candles[i].low >= candles[i + j].low
      ) {
        isLow = false;
        break;
      }
    }
    if (isLow) {
      const neighborMin = Math.min(
        ...Array.from({ length: order }, (_, j) =>
          Math.min(candles[i - j - 1].low, candles[i + j + 1].low),
        ),
      );
      if (neighborMin - candles[i].low >= minProm) {
        swings.push({
          type: "low",
          price: candles[i].low,
          time: candleTime(candles[i]),
          index: i,
        });
      }
    }
  }

  // Sort chronologically (should already be, but ensure)
  swings.sort((a, b) => a.index - b.index);
  return swings;
}

/**
 * Classify market structure from an ordered list of swing points.
 *
 * Evaluates the last N swing highs and lows to determine if the market
 * is making higher-highs + higher-lows (bullish), lower-highs + lower-lows
 * (bearish), or neither (consolidation / transition).
 */
export function classifyStructure(swings: SwingPoint[]): SwingStructure {
  const empty: SwingStructure = {
    swings,
    structure: "consolidation",
    structureShift: null,
    lastHigherLow: null,
    lastLowerHigh: null,
  };

  if (swings.length < 4) return empty;

  // Separate swings into highs and lows
  const highs = swings.filter((s) => s.type === "high");
  const lows = swings.filter((s) => s.type === "low");

  if (highs.length < 2 || lows.length < 2) return empty;

  // Evaluate the most recent pairs
  let hhCount = 0; // higher-high transitions
  let lhCount = 0; // lower-high transitions
  let hlCount = 0; // higher-low transitions
  let llCount = 0; // lower-low transitions

  // Track the specific swing points for shift detection
  let lastHigherLow: SwingPoint | null = null;
  let lastLowerHigh: SwingPoint | null = null;
  let firstLH: SwingPoint | null = null; // first lower-high in sequence (potential bearish shift)
  let firstHL: SwingPoint | null = null; // first higher-low in sequence (potential bullish shift)

  for (let i = 1; i < highs.length; i++) {
    if (highs[i].price > highs[i - 1].price) {
      hhCount++;
    } else if (highs[i].price < highs[i - 1].price) {
      lhCount++;
      lastLowerHigh = highs[i];
      if (!firstLH) firstLH = highs[i];
    }
  }

  for (let i = 1; i < lows.length; i++) {
    if (lows[i].price > lows[i - 1].price) {
      hlCount++;
      lastHigherLow = lows[i];
      if (!firstHL) firstHL = lows[i];
    } else if (lows[i].price < lows[i - 1].price) {
      llCount++;
    }
  }

  // Determine primary structure
  const bullishScore = hhCount + hlCount;
  const bearishScore = lhCount + llCount;
  const total = bullishScore + bearishScore;

  let structure: StructureType;
  let structureShift: SwingStructure["structureShift"] = null;

  if (total === 0) {
    structure = "consolidation";
  } else if (bullishScore >= bearishScore * 2) {
    // Strongly bullish — but check if the most recent swing broke the pattern
    const lastHigh = highs[highs.length - 1];
    const prevHigh = highs[highs.length - 2];
    if (lastHigh.price < prevHigh.price) {
      // Most recent high is lower — potential transition
      structure = "transition";
      structureShift = { from: "bullish", at: lastHigh };
    } else {
      structure = "bullish";
    }
  } else if (bearishScore >= bullishScore * 2) {
    // Strongly bearish — but check for transition
    const lastLow = lows[lows.length - 1];
    const prevLow = lows[lows.length - 2];
    if (lastLow.price > prevLow.price) {
      structure = "transition";
      structureShift = { from: "bearish", at: lastLow };
    } else {
      structure = "bearish";
    }
  } else if (bullishScore > bearishScore) {
    // Lean bullish but not dominant — check recent swings for shift
    if (
      lhCount > 0 &&
      highs[highs.length - 1].price < highs[highs.length - 2].price
    ) {
      structure = "transition";
      structureShift = { from: "bullish", at: highs[highs.length - 1] };
    } else {
      structure = "bullish";
    }
  } else if (bearishScore > bullishScore) {
    if (
      hlCount > 0 &&
      lows[lows.length - 1].price > lows[lows.length - 2].price
    ) {
      structure = "transition";
      structureShift = { from: "bearish", at: lows[lows.length - 1] };
    } else {
      structure = "bearish";
    }
  } else {
    // Equal — consolidation or transition depending on recency
    structure = "consolidation";
  }

  return {
    swings,
    structure,
    structureShift,
    lastHigherLow,
    lastLowerHigh,
  };
}

/**
 * Full swing structure analysis: detect swings then classify.
 *
 * @param candles  1D OHLCV candles (60+ recommended for meaningful structure)
 * @param order    Fractal order for swing detection (default 3)
 */
export function analyzeSwingStructure(
  candles: Candle[],
  order: number = 3,
): SwingStructure {
  const swings = detectSwings(candles, order);
  return classifyStructure(swings);
}
