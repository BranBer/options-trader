import type { WhaleAlert } from "@/types/whale";

/**
 * Score a whale trade's quality/conviction from 0-100.
 *
 * Factors:
 *   Volume/OI ratio   (30%) — >1 suggests new position opening
 *   OTM aggressiveness (25%) — further OTM = more conviction
 *   Premium size       (20%) — logarithmic: $100K=20, $500K=50, $1M+=80
 *   Expiry timing      (15%) — weeklies (<7 DTE) = unusual conviction
 *   Sweep likelihood   (10%) — high volume relative to typical size
 */
export function scoreWhaleQuality(
  alert: WhaleAlert,
  underlyingPrice?: number,
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

  // Weighted composite
  const composite =
    voiScore * 0.3 +
    otmScore * 0.25 +
    premiumScore * 0.2 +
    expiryScore * 0.15 +
    sweepScore * 0.1;

  return Math.round(Math.max(0, Math.min(100, composite)));
}
