/**
 * Value Area Interaction Detection — Story 48.3
 *
 * Detects dynamic price interactions with the volume profile's value area
 * (VAH, VAL, VPOC). Extends the base level-interaction detection with
 * value-area-specific events: re-entry, failed breakout, VPOC magnet,
 * VPOC acceptance.
 */

import type { Candle } from "./technical-indicators";
import type { VolumeProfile } from "./volume-profile";
import type { LevelInteraction, KeyLevel } from "./level-interactions";
import { detectAllLevelInteractions } from "./level-interactions";

// ---------- Types ----------

export type ValueAreaContext = "inside_value" | "above_value" | "below_value";

export interface ValueAreaInteraction extends LevelInteraction {
  /** Current price position relative to the value area */
  context: ValueAreaContext;
}

export interface ValueAreaAssessment {
  /** Current price position relative to value area */
  context: ValueAreaContext;
  /** All detected interactions with VAH, VAL, and VPOC */
  interactions: ValueAreaInteraction[];
  /** True if price exited and re-entered the value area within lookback */
  reEntry: boolean;
  /** True if price exited, failed, and returned (failed breakout) */
  failedBreakout: boolean;
  /** True if price is rotating back toward VPOC from extremes */
  vpocMagnet: boolean;
  /** True if price has been within 0.5% of VPOC for 3+ candles */
  vpocAcceptance: boolean;
}

// ---------- Helpers ----------

function getContext(close: number, vah: number, val: number): ValueAreaContext {
  if (close > vah) return "above_value";
  if (close < val) return "below_value";
  return "inside_value";
}

// ---------- Core ----------

/**
 * Analyze price interaction with the value area.
 *
 * @param candles   1D OHLCV candles (10+ recommended)
 * @param profile   Volume profile with VPOC, VAH, VAL
 * @param lookback  Number of recent candles to evaluate (default 5)
 */
export function analyzeValueAreaInteractions(
  candles: Candle[],
  profile: VolumeProfile,
  lookback: number = 5,
): ValueAreaAssessment {
  const { vpoc, valueAreaHigh: vah, valueAreaLow: val } = profile;

  // Build key levels for the base interaction detector
  const levels: KeyLevel[] = [
    { price: vah, label: "VAH", type: "resistance" },
    { price: val, label: "VAL", type: "support" },
    { price: vpoc, label: "VPOC", type: "neutral" },
  ];

  // Detect base-level interactions
  const baseInteractions = detectAllLevelInteractions(
    candles,
    levels,
    lookback,
  );

  // Add value-area context to each interaction
  const currentClose = candles[candles.length - 1]?.close ?? 0;
  const context = getContext(currentClose, vah, val);

  const interactions: ValueAreaInteraction[] = baseInteractions.map((int) => ({
    ...int,
    context,
  }));

  // --- Value area re-entry detection ---
  const recent = candles.slice(-Math.min(lookback + 1, candles.length));
  let reEntry = false;
  let failedBreakout = false;

  for (let i = 1; i < recent.length; i++) {
    const prevClose = recent[i - 1].close;
    const currClose = recent[i].close;
    const prevCtx = getContext(prevClose, vah, val);
    const currCtx = getContext(currClose, vah, val);

    // Re-entry: was outside, now inside
    if (prevCtx !== "inside_value" && currCtx === "inside_value") {
      reEntry = true;

      // Failed breakout: went outside then immediately came back
      if (i >= 2) {
        const prevPrevClose = recent[i - 2].close;
        const prevPrevCtx = getContext(prevPrevClose, vah, val);
        if (prevPrevCtx === "inside_value") {
          failedBreakout = true;
        }
      }
    }
  }

  // --- VPOC magnet: price is outside VPOC but rotating back toward it ---
  let vpocMagnet = false;
  if (recent.length >= 3) {
    const last = recent[recent.length - 1];
    const mid = recent[recent.length - 2];
    const first = recent[recent.length - 3];

    const distNow = Math.abs(last.close - vpoc);
    const distMid = Math.abs(mid.close - vpoc);
    const distFirst = Math.abs(first.close - vpoc);

    // Converging toward VPOC from outside the value area
    if (
      distNow < distMid &&
      distMid < distFirst &&
      distFirst > (vah - val) * 0.3
    ) {
      vpocMagnet = true;
    }
  }

  // --- VPOC acceptance: price within 0.5% of VPOC for 3+ candles ---
  let vpocAcceptance = false;
  if (recent.length >= 3) {
    const vpocTol = vpoc * 0.005;
    const last3 = recent.slice(-3);
    vpocAcceptance = last3.every((c) => Math.abs(c.close - vpoc) <= vpocTol);
  }

  return {
    context,
    interactions,
    reEntry,
    failedBreakout,
    vpocMagnet,
    vpocAcceptance,
  };
}
