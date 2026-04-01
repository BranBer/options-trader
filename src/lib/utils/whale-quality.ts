import type { WhaleAlert } from "@/types/whale";

/**
 * Score a whale trade's quality/conviction from 0-100.
 *
 * Factors:
 *   Volume/OI ratio      (25.5%) — >1 suggests new position opening
 *   OTM aggressiveness   (21.25%) — further OTM = more conviction
 *   Premium size         (17%) — logarithmic: $100K=20, $500K=50, $1M+=80
 *   Expiry timing        (12.75%) — weeklies (<7 DTE) = unusual conviction
 *   Sweep likelihood     (8.5%) — high volume relative to typical size
 *   Technical alignment  (15%) — patterns confirming whale direction
 */
export function scoreWhaleQuality(
  alert: WhaleAlert,
  underlyingPrice?: number,
  technicalData?: {
    price: number;
    sma20: number | null;
    rsi: number | null;
    supportLevels: number[];
    resistanceLevels: number[];
  },
): number {
  const price = underlyingPrice ?? alert.underlyingPrice ?? 0;

  // 1. Volume/OI ratio (30%)
  let voiScore = 0;
  if (alert.openInterest > 0) {
    const ratio = alert.volume / alert.openInterest;
    // ratio > 1.0 = likely new positions; > 3.0 = very aggressive
    voiScore = Math.min(100, ratio * 50);
  } else if (alert.volume > 0) {
    // No existing OI but has volume — brand new strike, high signal
    voiScore = 90;
  }

  // 2. OTM aggressiveness (25%)
  let otmScore = 0;
  if (price > 0 && alert.strike > 0) {
    const otmPct =
      alert.callPut === "C"
        ? (alert.strike - price) / price
        : (price - alert.strike) / price;
    // otmPct > 0 means OTM; further OTM = higher score
    if (otmPct > 0) {
      // 5% OTM = 50, 10% = 75, 20%+ = 100
      otmScore = Math.min(100, otmPct * 500);
    } else {
      // ITM — lower signal (could be hedging)
      otmScore = Math.max(0, 20 + otmPct * 100);
    }
  }

  // 3. Premium size (20%) — logarithmic scale
  let premiumScore = 0;
  if (alert.premium > 0) {
    // log10($100K)=5, log10($500K)=5.7, log10($1M)=6, log10($10M)=7
    const logPrem = Math.log10(alert.premium);
    // Map log range [4.5, 7.5] → [0, 100]
    premiumScore = Math.max(0, Math.min(100, ((logPrem - 4.5) / 3) * 100));
  }

  // 4. Expiry timing (15%) — short DTE during non-earnings = conviction
  let expiryScore = 0;
  if (alert.expiry) {
    const dte = Math.max(
      0,
      (new Date(alert.expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    if (dte <= 7) {
      expiryScore = 90; // Weeklies — high conviction
    } else if (dte <= 14) {
      expiryScore = 60;
    } else if (dte <= 30) {
      expiryScore = 40;
    } else if (dte <= 60) {
      expiryScore = 25;
    } else {
      expiryScore = 10; // LEAPS — less unusual
    }
  }

  // 5. Sweep likelihood (10%) — high volume suggests multi-exchange sweep
  let sweepScore = 0;
  if (alert.volume > 0) {
    // If volume is very large (>1000 contracts), likely a sweep
    if (alert.volume >= 5000) sweepScore = 100;
    else if (alert.volume >= 2000) sweepScore = 75;
    else if (alert.volume >= 1000) sweepScore = 50;
    else if (alert.volume >= 500) sweepScore = 30;
    else sweepScore = 10;
  }

  // 6. Technical alignment (15%) — price action confirms whale direction
  let technicalScore = 50; // Neutral default
  if (technicalData) {
    let score = 0;
    let factors = 0;

    // Sub-factor 1: Price vs 20-day SMA (trend confirmation)
    if (technicalData.sma20 != null) {
      const isAboveSMA = technicalData.price > technicalData.sma20;
      if (
        (alert.sentiment === "bullish" && isAboveSMA) ||
        (alert.sentiment === "bearish" && !isAboveSMA)
      ) {
        score += 1.0; // Confirms direction
      } else if (
        (alert.sentiment === "bullish" && !isAboveSMA) ||
        (alert.sentiment === "bearish" && isAboveSMA)
      ) {
        score += 0.2; // Contradicts direction
      } else {
        score += 0.5; // Neutral
      }
      factors++;
    }

    // Sub-factor 2: RSI momentum alignment
    if (technicalData.rsi != null) {
      const rsi = technicalData.rsi;
      if (
        (alert.sentiment === "bullish" && rsi > 50 && rsi < 70) ||
        (alert.sentiment === "bearish" && rsi < 50 && rsi > 30)
      ) {
        score += 1.0; // Momentum confirms
      } else if (
        (alert.sentiment === "bullish" && rsi > 70) ||
        (alert.sentiment === "bearish" && rsi < 30)
      ) {
        score += 0.3; // Overbought/oversold — risky
      } else {
        score += 0.5; // Neutral
      }
      factors++;
    }

    // Sub-factor 3: Support/resistance proximity
    const allLevels = [
      ...technicalData.supportLevels,
      ...technicalData.resistanceLevels,
    ];
    if (allLevels.length > 0) {
      const nearKeyLevel = allLevels.some(
        (level) =>
          Math.abs(technicalData.price - level) / technicalData.price < 0.02,
      );
      score += nearKeyLevel ? 1.0 : 0.5;
      factors++;
    }

    technicalScore = factors > 0 ? (score / factors) * 100 : 50;
  }

  // Weighted composite (rebalanced for 6 factors)
  const composite =
    voiScore * 0.255 +
    otmScore * 0.2125 +
    premiumScore * 0.17 +
    expiryScore * 0.1275 +
    sweepScore * 0.085 +
    technicalScore * 0.15;

  return Math.round(Math.max(0, Math.min(100, composite)));
}

/**
 * Compute technical alignment score for a whale alert.
 * Returns 0-100 score based on how well technical indicators confirm the whale direction.
 */
export function computeTechnicalAlignmentScore(
  alert: WhaleAlert,
  technicalData: {
    price: number;
    sma20: number | null;
    rsi: number | null;
    supportLevels: number[];
    resistanceLevels: number[];
  },
): number {
  let score = 0;
  let factors = 0;

  // Trend confirmation: price vs 20-day SMA
  if (technicalData.sma20 != null) {
    const isAboveSMA = technicalData.price > technicalData.sma20;
    if (
      (alert.sentiment === "bullish" && isAboveSMA) ||
      (alert.sentiment === "bearish" && !isAboveSMA)
    ) {
      score += 1.0;
    } else {
      score += 0.2;
    }
    factors++;
  }

  // Momentum alignment: RSI
  if (technicalData.rsi != null) {
    if (
      (alert.sentiment === "bullish" && technicalData.rsi > 50) ||
      (alert.sentiment === "bearish" && technicalData.rsi < 50)
    ) {
      score += 1.0;
    } else {
      score += 0.3;
    }
    factors++;
  }

  // Support/resistance proximity
  const allLevels = [
    ...technicalData.supportLevels,
    ...technicalData.resistanceLevels,
  ];
  if (allLevels.length > 0) {
    const nearKeyLevel = allLevels.some(
      (level) =>
        Math.abs(technicalData.price - level) / technicalData.price < 0.02,
    );
    score += nearKeyLevel ? 1.0 : 0.5;
    factors++;
  }

  return factors > 0 ? Math.round((score / factors) * 100) : 50;
}
