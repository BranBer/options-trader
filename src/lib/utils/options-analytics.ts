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

// ---------------------------------------------------------------------------
// IV Skew & OI Summary
// ---------------------------------------------------------------------------

export interface IVSkew {
  /** Put skew: avg OTM put IV − avg OTM call IV. Positive = fear pricing. */
  putCallSkew: number;
  /** Average IV of OTM puts (delta < −0.15, > −0.40) */
  avgPutIV: number;
  /** Average IV of OTM calls (delta > 0.15, < 0.40) */
  avgCallIV: number;
  /** Human-readable interpretation */
  interpretation: string;
}

/**
 * Compute put-call IV skew from the nearest expiry options.
 * Compares average IV of OTM puts vs OTM calls to gauge directional fear/greed.
 * Uses moneyness (strike / currentPrice) to identify OTM options since Yahoo
 * Finance does not provide greeks.
 *
 * OTM calls: 3–15% above current price (moneyness 1.03–1.15)
 * OTM puts:  3–15% below current price (moneyness 0.85–0.97)
 */
export function computeIVSkew(
  chain: OptionsChainSummary,
  currentPrice: number,
): IVSkew | null {
  if (currentPrice <= 0) return null;

  const calls = chain.nearestExpiry.calls.filter((c) => {
    const moneyness = c.strike / currentPrice;
    return c.iv > 0 && moneyness > 1.03 && moneyness < 1.15;
  });
  const puts = chain.nearestExpiry.puts.filter((p) => {
    const moneyness = p.strike / currentPrice;
    return p.iv > 0 && moneyness > 0.85 && moneyness < 0.97;
  });

  if (calls.length === 0 || puts.length === 0) return null;

  const avgCallIV = calls.reduce((s, c) => s + c.iv, 0) / calls.length;
  const avgPutIV = puts.reduce((s, p) => s + p.iv, 0) / puts.length;
  const putCallSkew = avgPutIV - avgCallIV;

  let interpretation: string;
  if (putCallSkew > 0.05) {
    interpretation =
      "Significant put skew — market is pricing elevated downside risk. Protective put demand is high.";
  } else if (putCallSkew > 0.02) {
    interpretation =
      "Moderate put skew — slight fear premium on downside protection, typical for most equities.";
  } else if (putCallSkew < -0.02) {
    interpretation =
      "Call skew — upside options are priced higher than downside. Unusual; may indicate speculative call buying or takeover premium.";
  } else {
    interpretation =
      "Neutral skew — puts and calls are similarly priced. No strong directional fear or greed signal from options.";
  }

  return {
    putCallSkew: Math.round(putCallSkew * 10000) / 10000,
    avgPutIV: Math.round(avgPutIV * 10000) / 10000,
    avgCallIV: Math.round(avgCallIV * 10000) / 10000,
    interpretation,
  };
}

export interface OISummary {
  /** Total call OI */
  totalCallOI: number;
  /** Total put OI */
  totalPutOI: number;
  /** Put/call OI ratio (higher = more protective positioning) */
  pcOIRatio: number;
  /** Top 5 strikes by total OI with call/put breakdown */
  topStrikes: {
    strike: number;
    callOI: number;
    putOI: number;
    netOI: number;
  }[];
}

/**
 * Compute an OI summary showing the full strike-level distribution.
 */
export function computeOISummary(chain: OptionsChainSummary): OISummary | null {
  const calls = chain.nearestExpiry.calls;
  const puts = chain.nearestExpiry.puts;
  if (calls.length === 0 && puts.length === 0) return null;

  const totalCallOI = calls.reduce((s, c) => s + c.openInterest, 0);
  const totalPutOI = puts.reduce((s, p) => s + p.openInterest, 0);

  // Build per-strike map
  const strikeMap = new Map<number, { callOI: number; putOI: number }>();
  for (const c of calls) {
    const entry = strikeMap.get(c.strike) ?? { callOI: 0, putOI: 0 };
    entry.callOI += c.openInterest;
    strikeMap.set(c.strike, entry);
  }
  for (const p of puts) {
    const entry = strikeMap.get(p.strike) ?? { callOI: 0, putOI: 0 };
    entry.putOI += p.openInterest;
    strikeMap.set(p.strike, entry);
  }

  const topStrikes = [...strikeMap.entries()]
    .map(([strike, { callOI, putOI }]) => ({
      strike,
      callOI,
      putOI,
      netOI: callOI - putOI,
    }))
    .sort((a, b) => b.callOI + b.putOI - (a.callOI + a.putOI))
    .slice(0, 5);

  return {
    totalCallOI,
    totalPutOI,
    pcOIRatio:
      totalCallOI > 0 ? Math.round((totalPutOI / totalCallOI) * 100) / 100 : 0,
    topStrikes,
  };
}

/**
 * Format enhanced options analytics for LLM prompt injection.
 */
export function formatEnhancedOptionsForPrompt(
  skew: IVSkew | null,
  oiSummary: OISummary | null,
  currentPrice: number,
): string {
  const lines: string[] = [];

  if (skew) {
    const skewPct = (skew.putCallSkew * 100).toFixed(1);
    lines.push(
      `- IV Skew: Put IV ${(skew.avgPutIV * 100).toFixed(1)}% vs Call IV ${(skew.avgCallIV * 100).toFixed(1)}% (skew: ${skewPct} vol points)`,
    );
    lines.push(`  ${skew.interpretation}`);
  }

  if (oiSummary) {
    lines.push(
      `- OI Distribution: ${oiSummary.totalCallOI.toLocaleString()} total call OI / ${oiSummary.totalPutOI.toLocaleString()} total put OI (P/C OI ratio: ${oiSummary.pcOIRatio})`,
    );
    if (oiSummary.topStrikes.length > 0) {
      lines.push("- Top OI Strikes (nearest expiry):");
      for (const s of oiSummary.topStrikes) {
        const relation =
          s.strike > currentPrice
            ? "above"
            : s.strike < currentPrice
              ? "below"
              : "at";
        lines.push(
          `  $${s.strike} (${relation} price) — Call OI: ${s.callOI.toLocaleString()}, Put OI: ${s.putOI.toLocaleString()}, Net: ${s.netOI > 0 ? "+" : ""}${s.netOI.toLocaleString()} (${s.netOI > 0 ? "call-heavy = resistance" : "put-heavy = support"})`,
        );
      }
    }
  }

  return lines.join("\n");
}
