/**
 * Volume Profile — computes volume distribution across price levels from OHLCV candles.
 *
 * For each candle, volume is uniformly distributed across the candle's high-low range
 * into fixed-width price buckets. Key outputs:
 * - VPOC (Volume Point of Control): price level with the highest traded volume
 * - Value Area High/Low: boundaries containing ~70% of total volume centered on VPOC
 * - High Volume Nodes (HVN): price levels with volume significantly above average
 * - Low Volume Nodes (LVN): price levels with volume significantly below average
 */

import type { Candle } from "./technical-indicators";

export interface VolumeProfileBucket {
  /** Lower boundary of the price bucket */
  priceLow: number;
  /** Upper boundary of the price bucket */
  priceHigh: number;
  /** Midpoint price for this bucket */
  price: number;
  /** Total volume distributed into this bucket */
  volume: number;
}

export interface VolumeNode {
  price: number;
  volume: number;
  type: "hvn" | "lvn";
}

export interface VolumeProfile {
  /** All price-level buckets with distributed volume */
  buckets: VolumeProfileBucket[];
  /** Volume Point of Control — price level with highest volume */
  vpoc: number;
  /** Value Area High — upper boundary of 70% volume concentration */
  valueAreaHigh: number;
  /** Value Area Low — lower boundary of 70% volume concentration */
  valueAreaLow: number;
  /** High Volume Nodes — levels with volume > 1.5× average */
  hvn: VolumeNode[];
  /** Low Volume Nodes — levels with volume < 0.5× average */
  lvn: VolumeNode[];
  /** Total volume across all buckets */
  totalVolume: number;
}

/**
 * Auto-compute bucket size based on price range and candle count.
 * Uses ATR-based sizing: roughly ATR / 4 for good granularity,
 * clamped to produce between 20–100 buckets.
 */
function autoBucketSize(candles: Candle[]): number {
  if (candles.length < 2) return 1;

  // Compute simple ATR (average true range)
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

  // Target bucket size = ATR / 4
  let bucketSize = atr / 4;

  // Clamp to produce 20–100 buckets across the price range
  const priceHigh = Math.max(...candles.map((c) => c.high));
  const priceLow = Math.min(...candles.map((c) => c.low));
  const range = priceHigh - priceLow;
  if (range <= 0) return 1;

  const maxBuckets = 100;
  const minBuckets = 20;

  if (range / bucketSize > maxBuckets) bucketSize = range / maxBuckets;
  if (range / bucketSize < minBuckets) bucketSize = range / minBuckets;

  // Round to clean numbers
  const magnitude = Math.pow(10, Math.floor(Math.log10(bucketSize)));
  return Math.max(magnitude, Math.round(bucketSize / magnitude) * magnitude);
}

/**
 * Build a volume profile from OHLCV candle data.
 *
 * Volume from each candle is uniformly distributed across all price buckets
 * that the candle's high-low range spans. This gives a fair approximation
 * of volume-at-price without tick-level data.
 *
 * @param candles OHLCV candle data
 * @param bucketSize Optional fixed bucket width in dollars. Auto-computed from ATR if omitted.
 */
export function computeVolumeProfile(
  candles: Candle[],
  bucketSize?: number,
): VolumeProfile | null {
  if (candles.length < 2) return null;

  const priceHigh = Math.max(...candles.map((c) => c.high));
  const priceLow = Math.min(...candles.map((c) => c.low));
  const range = priceHigh - priceLow;
  if (range <= 0) return null;

  const size = bucketSize ?? autoBucketSize(candles);
  if (size <= 0) return null;

  // Create buckets
  const bucketCount = Math.ceil(range / size);
  const buckets: VolumeProfileBucket[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const lo = priceLow + i * size;
    const hi = lo + size;
    buckets.push({
      priceLow: Math.round(lo * 100) / 100,
      priceHigh: Math.round(hi * 100) / 100,
      price: Math.round(((lo + hi) / 2) * 100) / 100,
      volume: 0,
    });
  }

  // Distribute candle volume across overlapping buckets
  let totalVolume = 0;
  for (const candle of candles) {
    const candleRange = candle.high - candle.low;
    if (candleRange <= 0 || candle.volume <= 0) continue;

    totalVolume += candle.volume;

    for (const bucket of buckets) {
      // Overlap between candle range and bucket range
      const overlapLow = Math.max(candle.low, bucket.priceLow);
      const overlapHigh = Math.min(candle.high, bucket.priceHigh);
      if (overlapLow >= overlapHigh) continue;

      const overlapFraction = (overlapHigh - overlapLow) / candleRange;
      bucket.volume += candle.volume * overlapFraction;
    }
  }

  if (totalVolume === 0) return null;

  // Round volumes
  for (const b of buckets) {
    b.volume = Math.round(b.volume);
  }

  // VPOC — bucket with highest volume
  let vpocBucket = buckets[0];
  for (const b of buckets) {
    if (b.volume > vpocBucket.volume) vpocBucket = b;
  }
  const vpoc = vpocBucket.price;

  // Value Area — expand out from VPOC bucket until 70% of volume is captured
  const valueAreaTarget = totalVolume * 0.7;
  const vpocIdx = buckets.indexOf(vpocBucket);
  let vaVolume = vpocBucket.volume;
  let vaLow = vpocIdx;
  let vaHigh = vpocIdx;

  while (
    vaVolume < valueAreaTarget &&
    (vaLow > 0 || vaHigh < buckets.length - 1)
  ) {
    const belowVol = vaLow > 0 ? buckets[vaLow - 1].volume : -1;
    const aboveVol =
      vaHigh < buckets.length - 1 ? buckets[vaHigh + 1].volume : -1;

    if (belowVol >= aboveVol && belowVol >= 0) {
      vaLow--;
      vaVolume += buckets[vaLow].volume;
    } else if (aboveVol >= 0) {
      vaHigh++;
      vaVolume += buckets[vaHigh].volume;
    } else {
      break;
    }
  }

  const valueAreaLow = buckets[vaLow].priceLow;
  const valueAreaHigh = buckets[vaHigh].priceHigh;

  // High/Low Volume Nodes — threshold based on average bucket volume
  const nonZeroBuckets = buckets.filter((b) => b.volume > 0);
  const avgVolume =
    nonZeroBuckets.length > 0
      ? nonZeroBuckets.reduce((s, b) => s + b.volume, 0) / nonZeroBuckets.length
      : 0;

  const hvn: VolumeNode[] = [];
  const lvn: VolumeNode[] = [];

  for (const b of buckets) {
    if (b.volume > avgVolume * 1.5) {
      hvn.push({ price: b.price, volume: Math.round(b.volume), type: "hvn" });
    } else if (b.volume > 0 && b.volume < avgVolume * 0.5) {
      lvn.push({ price: b.price, volume: Math.round(b.volume), type: "lvn" });
    }
  }

  // Sort HVN by volume descending, LVN by volume ascending
  hvn.sort((a, b) => b.volume - a.volume);
  lvn.sort((a, b) => a.volume - b.volume);

  return {
    buckets,
    vpoc,
    valueAreaHigh: Math.round(valueAreaHigh * 100) / 100,
    valueAreaLow: Math.round(valueAreaLow * 100) / 100,
    hvn,
    lvn,
    totalVolume: Math.round(totalVolume),
  };
}

/**
 * Format volume profile data into a concise text summary for LLM consumption.
 */
export function formatVolumeProfileForPrompt(
  profile: VolumeProfile,
  currentPrice: number,
): string {
  const lines: string[] = [];

  const vpocRelation =
    currentPrice > profile.vpoc
      ? `$${(currentPrice - profile.vpoc).toFixed(2)} above`
      : currentPrice < profile.vpoc
        ? `$${(profile.vpoc - currentPrice).toFixed(2)} below`
        : "at";

  lines.push(
    `- VPOC (Volume Point of Control): $${profile.vpoc.toFixed(2)} — price level with highest traded volume. Current price is ${vpocRelation} VPOC.`,
  );
  lines.push(
    `- Value Area: $${profile.valueAreaLow.toFixed(2)} – $${profile.valueAreaHigh.toFixed(2)} — range containing ~70% of traded volume. ${
      currentPrice >= profile.valueAreaLow &&
      currentPrice <= profile.valueAreaHigh
        ? "Price is INSIDE the value area (fair value zone)."
        : currentPrice > profile.valueAreaHigh
          ? "Price is ABOVE value area (potential overextension or breakout)."
          : "Price is BELOW value area (potential undervaluation or breakdown)."
    }`,
  );

  if (profile.hvn.length > 0) {
    const top = profile.hvn.slice(0, 5);
    lines.push(
      `- High Volume Nodes (strong S/R): ${top.map((n) => `$${n.price.toFixed(2)}`).join(", ")} — price tends to consolidate at these levels`,
    );
  }

  if (profile.lvn.length > 0) {
    const top = profile.lvn.slice(0, 5);
    lines.push(
      `- Low Volume Nodes (fast-move zones): ${top.map((n) => `$${n.price.toFixed(2)}`).join(", ")} — price tends to move through these levels quickly`,
    );
  }

  return lines.join("\n");
}
