import type { OptionsChainSummary } from "@/types/market";

export interface OIWall {
  strike: number;
  oi: number;
}

export interface OIWalls {
  callWalls: OIWall[]; // Resistance — top call OI above price
  putWalls: OIWall[]; // Support — top put OI below price
}

export interface OptionsAnalytics {
  maxPain: number | null;
  oiWalls: OIWalls | null;
}

/**
 * Compute max pain: the strike at which option holders lose the most money
 * (equivalently, the price where total payout to holders is minimized).
 * Stocks often gravitate toward max pain near expiration.
 */
export function computeMaxPain(chain: OptionsChainSummary): number | null {
  const calls = chain.nearestExpiry.calls;
  const puts = chain.nearestExpiry.puts;

  if (calls.length === 0 && puts.length === 0) return null;

  // Collect all unique strikes
  const strikes = new Set<number>();
  for (const c of calls) strikes.add(c.strike);
  for (const p of puts) strikes.add(p.strike);

  if (strikes.size === 0) return null;

  // Build OI lookup
  const callOI = new Map<number, number>();
  const putOI = new Map<number, number>();
  for (const c of calls)
    callOI.set(c.strike, (callOI.get(c.strike) ?? 0) + c.openInterest);
  for (const p of puts)
    putOI.set(p.strike, (putOI.get(p.strike) ?? 0) + p.openInterest);

  let minPain = Infinity;
  let maxPainStrike: number | null = null;

  for (const pinPrice of strikes) {
    let totalPain = 0;

    // Call holder pain: each call is worth max(0, pinPrice - strike) × OI × 100
    // We want total ITM value for call holders — this is what they lose if stock pins here
    for (const [strike, oi] of callOI) {
      if (pinPrice > strike) {
        totalPain += (pinPrice - strike) * oi * 100;
      }
    }

    // Put holder pain: each put is worth max(0, strike - pinPrice) × OI × 100
    for (const [strike, oi] of putOI) {
      if (pinPrice < strike) {
        totalPain += (strike - pinPrice) * oi * 100;
      }
    }

    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = pinPrice;
    }
  }

  return maxPainStrike;
}

/**
 * Find OI walls: top 3 call OI strikes above price (resistance)
 * and top 3 put OI strikes below price (support).
 * Large OI concentrations act as magnets or barriers due to market-maker hedging.
 */
export function findOIWalls(
  chain: OptionsChainSummary,
  currentPrice: number,
): OIWalls | null {
  const calls = chain.nearestExpiry.calls;
  const puts = chain.nearestExpiry.puts;

  if (calls.length === 0 && puts.length === 0) return null;

  // Call walls: strikes above current price, sorted by OI desc
  const callWalls = calls
    .filter((c) => c.strike > currentPrice && c.openInterest > 0)
    .sort((a, b) => b.openInterest - a.openInterest)
    .slice(0, 3)
    .map((c) => ({ strike: c.strike, oi: c.openInterest }));

  // Put walls: strikes below current price, sorted by OI desc
  const putWalls = puts
    .filter((p) => p.strike < currentPrice && p.openInterest > 0)
    .sort((a, b) => b.openInterest - a.openInterest)
    .slice(0, 3)
    .map((p) => ({ strike: p.strike, oi: p.openInterest }));

  return { callWalls, putWalls };
}

/**
 * Compute both max pain and OI walls from an options chain.
 */
export function analyzeOptionsChain(
  chain: OptionsChainSummary,
  currentPrice: number,
): OptionsAnalytics {
  return {
    maxPain: computeMaxPain(chain),
    oiWalls: findOIWalls(chain, currentPrice),
  };
}
