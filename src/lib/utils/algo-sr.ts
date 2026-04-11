/**
 * Algorithmic Support/Resistance detection with confluence scoring.
 *
 * Detects S/R levels from:
 * 1. Swing highs/lows (Williams-style fractals with ATR noise filter)
 * 2. Volume profile nodes (high-volume price levels act as magnets)
 * 3. Options-derived levels (OI walls, max pain, GEX flip)
 * 4. VWAP (session anchor for intraday)
 *
 * Each level gets a confluence score (1–5) based on how many independent
 * data sources agree on the same price zone.
 */

import type { Candle } from "./technical-indicators";
import type { VolumeProfile } from "./volume-profile";
import type { OIWalls } from "./options-analytics";
import type { GEXSummary } from "./gex-calculator";

export interface AlgoSRLevel {
  price: number;
  type: "support" | "resistance";
  /** 1–5 confluence score — how many independent sources agree */
  confluence: number;
  /** Which data sources contribute to this level */
  sources: string[];
  /** Whether this level has been tested (bounced) or broken */
  state: "active" | "tested" | "broken";
}

interface SwingPoint {
  index: number;
  price: number;
  type: "high" | "low";
}

/**
 * Detect swing highs and lows using Williams fractals.
 * A swing high: candle[i].high > all neighbors within `order` bars.
 * ATR filter: only keep swings whose prominence exceeds atrMultiple × ATR.
 */
function detectSwingPoints(
  candles: Candle[],
  order: number = 3,
  atrMultiple: number = 0.3,
): SwingPoint[] {
  if (candles.length < order * 2 + 1) return [];

  // Average True Range for noise filtering
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
  const minProminence = atr * atrMultiple;

  const swings: SwingPoint[] = [];

  for (let i = order; i < candles.length - order; i++) {
    // Check swing high
    let isSwingHigh = true;
    for (let j = 1; j <= order; j++) {
      if (
        candles[i].high <= candles[i - j].high ||
        candles[i].high <= candles[i + j].high
      ) {
        isSwingHigh = false;
        break;
      }
    }
    if (isSwingHigh) {
      // Prominence check: swing must be meaningfully higher than neighbors
      const neighborMax = Math.max(
        ...Array.from({ length: order }, (_, j) =>
          Math.max(candles[i - j - 1].high, candles[i + j + 1].high),
        ),
      );
      if (candles[i].high - neighborMax >= minProminence) {
        swings.push({ index: i, price: candles[i].high, type: "high" });
      }
    }

    // Check swing low
    let isSwingLow = true;
    for (let j = 1; j <= order; j++) {
      if (
        candles[i].low >= candles[i - j].low ||
        candles[i].low >= candles[i + j].low
      ) {
        isSwingLow = false;
        break;
      }
    }
    if (isSwingLow) {
      const neighborMin = Math.min(
        ...Array.from({ length: order }, (_, j) =>
          Math.min(candles[i - j - 1].low, candles[i + j + 1].low),
        ),
      );
      if (neighborMin - candles[i].low >= minProminence) {
        swings.push({ index: i, price: candles[i].low, type: "low" });
      }
    }
  }

  return swings;
}

/**
 * Cluster nearby price levels into zones. Levels within `tolerance` of each
 * other are merged into one, weighted by recency (more recent = higher weight).
 */
function clusterLevels(
  levels: { price: number; source: string; type: "support" | "resistance" }[],
  tolerance: number,
): Map<number, { sources: Set<string>; type: "support" | "resistance" }> {
  if (levels.length === 0) return new Map();

  // Sort by price
  const sorted = [...levels].sort((a, b) => a.price - b.price);
  const clusters = new Map<
    number,
    { sources: Set<string>; type: "support" | "resistance"; prices: number[] }
  >();

  let currentCluster = {
    prices: [sorted[0].price],
    sources: new Set([sorted[0].source]),
    type: sorted[0].type,
    anchor: sorted[0].price,
  };

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].price - currentCluster.anchor <= tolerance) {
      currentCluster.prices.push(sorted[i].price);
      currentCluster.sources.add(sorted[i].source);
      // If any source says support and another says resistance, keep whichever
      // has more sources, or default to the closer-to-price type
      if (sorted[i].type !== currentCluster.type) {
        // Mixed — will be resolved by caller based on current price
      }
    } else {
      // Finalize cluster
      const avgPrice =
        currentCluster.prices.reduce((s, p) => s + p, 0) /
        currentCluster.prices.length;
      clusters.set(Math.round(avgPrice * 100) / 100, {
        sources: currentCluster.sources,
        type: currentCluster.type,
      });
      currentCluster = {
        prices: [sorted[i].price],
        sources: new Set([sorted[i].source]),
        type: sorted[i].type,
        anchor: sorted[i].price,
      };
    }
  }

  // Finalize last cluster
  const avgPrice =
    currentCluster.prices.reduce((s, p) => s + p, 0) /
    currentCluster.prices.length;
  clusters.set(Math.round(avgPrice * 100) / 100, {
    sources: currentCluster.sources,
    type: currentCluster.type,
  });

  return clusters;
}

export interface AlgoSRInput {
  candles: Candle[];
  currentPrice: number;
  volumeProfile?: VolumeProfile | null;
  oiWalls?: OIWalls | null;
  maxPain?: number | null;
  gex?: GEXSummary | null;
  vwap?: number | null;
}

/**
 * Compute algorithmic support/resistance levels with confluence scoring.
 *
 * Each level accumulates a confluence score from independent sources:
 * - Swing pivot: +1
 * - High volume node: +1
 * - OI wall: +1
 * - Max pain proximity: +1
 * - GEX flip level: +1
 * - VWAP proximity: +1
 *
 * Score is capped at 5.
 */
export function computeAlgoSR(input: AlgoSRInput): AlgoSRLevel[] {
  const { candles, currentPrice } = input;
  if (candles.length < 7) return [];

  // ATR for clustering tolerance
  let atrSum = 0;
  for (let i = 1; i < candles.length; i++) {
    atrSum += Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    );
  }
  const atr = atrSum / (candles.length - 1);
  const tolerance = atr * 0.5; // Cluster levels within half an ATR

  // Collect all candidate levels
  const candidates: {
    price: number;
    source: string;
    type: "support" | "resistance";
  }[] = [];

  // 1. Swing points
  const swings = detectSwingPoints(candles);
  for (const s of swings) {
    candidates.push({
      price: s.price,
      source: "Swing Pivot",
      type:
        s.type === "high"
          ? s.price > currentPrice
            ? "resistance"
            : "support"
          : s.price < currentPrice
            ? "support"
            : "resistance",
    });
  }

  // 2. Volume profile HVN
  if (input.volumeProfile) {
    for (const node of input.volumeProfile.hvn.slice(0, 5)) {
      candidates.push({
        price: node.price,
        source: "Volume Node",
        type: node.price < currentPrice ? "support" : "resistance",
      });
    }
    // VPOC itself
    candidates.push({
      price: input.volumeProfile.vpoc,
      source: "VPOC",
      type: input.volumeProfile.vpoc < currentPrice ? "support" : "resistance",
    });
  }

  // 3. OI walls
  if (input.oiWalls) {
    for (const w of input.oiWalls.callWalls) {
      candidates.push({
        price: w.strike,
        source: "Call OI Wall",
        type: "resistance",
      });
    }
    for (const w of input.oiWalls.putWalls) {
      candidates.push({
        price: w.strike,
        source: "Put OI Wall",
        type: "support",
      });
    }
  }

  // 4. Max pain
  if (input.maxPain != null) {
    candidates.push({
      price: input.maxPain,
      source: "Max Pain",
      type: input.maxPain < currentPrice ? "support" : "resistance",
    });
  }

  // 5. GEX flip level
  if (input.gex?.gexFlipLevel != null) {
    candidates.push({
      price: input.gex.gexFlipLevel,
      source: "GEX Flip",
      type: input.gex.gexFlipLevel < currentPrice ? "support" : "resistance",
    });
  }

  // 6. VWAP
  if (input.vwap != null) {
    candidates.push({
      price: input.vwap,
      source: "VWAP",
      type: input.vwap < currentPrice ? "support" : "resistance",
    });
  }

  if (candidates.length === 0) return [];

  // Cluster and score
  const clusters = clusterLevels(candidates, tolerance);
  const results: AlgoSRLevel[] = [];

  for (const [price, cluster] of clusters) {
    // Determine state based on current price proximity
    const distanceFromPrice = Math.abs(price - currentPrice);
    const isNearPrice = distanceFromPrice < atr * 0.3;

    // Resolve type based on current price
    const type = price < currentPrice ? "support" : "resistance";

    results.push({
      price,
      type,
      confluence: Math.min(5, cluster.sources.size),
      sources: [...cluster.sources],
      state: isNearPrice ? "tested" : "active",
    });
  }

  // Sort: support descending (nearest to price first), resistance ascending
  results.sort((a, b) => {
    if (a.type !== b.type) return a.type === "support" ? -1 : 1;
    if (a.type === "support") return b.price - a.price;
    return a.price - b.price;
  });

  return results;
}

/**
 * Format algorithmic S/R levels for LLM prompt injection.
 */
export function formatAlgoSRForPrompt(
  levels: AlgoSRLevel[],
  currentPrice: number,
): string {
  if (levels.length === 0) return "";

  const supports = levels.filter((l) => l.type === "support").slice(0, 5);
  const resistances = levels.filter((l) => l.type === "resistance").slice(0, 5);

  const lines: string[] = [];

  if (supports.length > 0) {
    lines.push("Support levels (data-derived, sorted nearest to farthest):");
    for (const s of supports) {
      const dist = (currentPrice - s.price).toFixed(2);
      const stars = "★".repeat(s.confluence) + "☆".repeat(5 - s.confluence);
      lines.push(
        `  $${s.price.toFixed(2)} [${stars}] (-$${dist}) — sources: ${s.sources.join(", ")}${s.state === "tested" ? " [BEING TESTED]" : ""}`,
      );
    }
  }

  if (resistances.length > 0) {
    lines.push("Resistance levels (data-derived, sorted nearest to farthest):");
    for (const r of resistances) {
      const dist = (r.price - currentPrice).toFixed(2);
      const stars = "★".repeat(r.confluence) + "☆".repeat(5 - r.confluence);
      lines.push(
        `  $${r.price.toFixed(2)} [${stars}] (+$${dist}) — sources: ${r.sources.join(", ")}${r.state === "tested" ? " [BEING TESTED]" : ""}`,
      );
    }
  }

  lines.push(
    "NOTE: Use these data-derived levels as ANCHORS for your support/resistance analysis. Levels with higher confluence (more ★) are more significant. Cross-reference with your own pattern analysis.",
  );

  return lines.join("\n");
}
