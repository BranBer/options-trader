import type { OptionsChainSummary } from "@/types/market";
import { bsGamma } from "@/lib/utils/black-scholes";

export interface GEXConcentration {
  strike: number;
  gex: number; // dollar GEX at this strike
}

export interface GEXSummary {
  /** Net GEX across all strikes (positive = dealers long gamma = mean-reversion; negative = dealers short gamma = trending) */
  netGEX: number;
  /** Strike where net GEX flips from positive to negative */
  gexFlipLevel: number | null;
  /** Top 3 strikes by absolute GEX magnitude */
  topConcentrations: GEXConcentration[];
  /** Human-readable positioning label */
  dealerPositioning: "long_gamma" | "short_gamma" | "neutral";
}

/**
 * Estimate Gamma Exposure (GEX) from an options chain.
 *
 * For each strike, GEX = gamma × OI × 100 × spotPrice.
 * Net GEX = Σ(call GEX) - Σ(put GEX).
 *   - Positive net GEX → dealers are long gamma → price tends to mean-revert (dampened moves)
 *   - Negative net GEX → dealers are short gamma → price tends to trend (amplified moves)
 *
 * @param chain - Options chain summary with calls/puts per strike
 * @param spotPrice - Current underlying price
 * @param riskFreeRate - Annual risk-free rate (default 0.05)
 * @returns GEX summary or null if insufficient data
 */
export function computeGEX(
  chain: OptionsChainSummary,
  spotPrice: number,
  riskFreeRate: number = 0.05,
): GEXSummary | null {
  if (spotPrice <= 0) return null;

  const calls = chain.nearestExpiry.calls;
  const puts = chain.nearestExpiry.puts;
  if (calls.length === 0 && puts.length === 0) return null;

  // Estimate time to expiry in years from the expiry date
  const expiryStr = chain.nearestExpiry.date;
  const expiryDate = new Date(expiryStr);
  const now = new Date();
  const T =
    Math.max(
      1,
      (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    ) / 365;

  // Per-strike GEX accumulation
  const strikeGEX = new Map<number, number>();

  // Call GEX (positive contribution — dealers are typically short calls, so they're long gamma)
  for (const c of calls) {
    if (c.openInterest <= 0 || c.iv <= 0) continue;
    const gamma = bsGamma(spotPrice, c.strike, T, c.iv, riskFreeRate);
    if (gamma == null) continue;
    const gex = gamma * c.openInterest * 100 * spotPrice;
    strikeGEX.set(c.strike, (strikeGEX.get(c.strike) ?? 0) + gex);
  }

  // Put GEX (negative contribution — dealers are typically short puts, so they're short gamma from puts)
  for (const p of puts) {
    if (p.openInterest <= 0 || p.iv <= 0) continue;
    const gamma = bsGamma(spotPrice, p.strike, T, p.iv, riskFreeRate);
    if (gamma == null) continue;
    const gex = gamma * p.openInterest * 100 * spotPrice;
    strikeGEX.set(p.strike, (strikeGEX.get(p.strike) ?? 0) - gex);
  }

  if (strikeGEX.size === 0) return null;

  // Net GEX
  let netGEX = 0;
  for (const gex of strikeGEX.values()) {
    netGEX += gex;
  }

  // GEX flip level: the strike where cumulative GEX transitions sign
  // Sort strikes ascending, accumulate, find the crossover
  const sortedStrikes = [...strikeGEX.entries()].sort((a, b) => a[0] - b[0]);
  let gexFlipLevel: number | null = null;
  let cumGEX = 0;
  for (let i = 0; i < sortedStrikes.length; i++) {
    const prevCum = cumGEX;
    cumGEX += sortedStrikes[i][1];
    // Detect sign change
    if (i > 0 && prevCum * cumGEX < 0) {
      // Interpolate between strikes
      const prevStrike = sortedStrikes[i - 1][0];
      const currStrike = sortedStrikes[i][0];
      const ratio = Math.abs(prevCum) / (Math.abs(prevCum) + Math.abs(cumGEX));
      gexFlipLevel = prevStrike + ratio * (currStrike - prevStrike);
      break;
    }
  }

  // Top 3 concentrations by absolute GEX
  const topConcentrations = [...strikeGEX.entries()]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([strike, gex]) => ({ strike, gex }));

  const dealerPositioning: GEXSummary["dealerPositioning"] =
    netGEX > 1_000_000
      ? "long_gamma"
      : netGEX < -1_000_000
        ? "short_gamma"
        : "neutral";

  return {
    netGEX: Math.round(netGEX),
    gexFlipLevel:
      gexFlipLevel != null ? Math.round(gexFlipLevel * 100) / 100 : null,
    topConcentrations,
    dealerPositioning,
  };
}
