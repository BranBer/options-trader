/**
 * Black-Scholes helper functions for options analytics.
 * Used primarily for Gamma Exposure (GEX) calculation.
 */

/** Standard normal PDF: φ(x) = e^(-x²/2) / √(2π) */
export function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/** Standard normal CDF using Abramowitz & Stegun approximation (max error ~1.5e-7) */
export function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp((-absX * absX) / 2);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Black-Scholes gamma for a European option.
 *
 * Γ = φ(d1) / (S × σ × √T)
 *
 * @param S - Current stock price
 * @param K - Strike price
 * @param T - Time to expiry in years (must be > 0)
 * @param sigma - Implied volatility (annualized, as decimal e.g. 0.30)
 * @param r - Risk-free rate (annualized, as decimal e.g. 0.05)
 * @returns Gamma value, or null if inputs are invalid
 */
export function bsGamma(
  S: number,
  K: number,
  T: number,
  sigma: number,
  r: number = 0.05,
): number | null {
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) return null;

  const sqrtT = Math.sqrt(T);
  const d1 =
    (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);

  return normalPDF(d1) / (S * sigma * sqrtT);
}
