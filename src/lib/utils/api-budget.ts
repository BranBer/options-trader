/**
 * API call budget tracker — prevents exceeding daily rate limits.
 * Tracks calls per provider per UTC day and enforces configurable budgets.
 */

interface DailyUsage {
  date: string; // YYYY-MM-DD UTC
  count: number;
}

const usage = new Map<string, DailyUsage>();

// Default daily budgets per provider
const DEFAULT_BUDGETS: Record<string, number> = {
  yahoo: 1800, // Conservative limit for free tier (~2,000 actual)
  finnhub: 250,
  polygon: 4,
  marketaux: 80,
  gemini: 1400,
};

function getUTCDate(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Record one API call for a provider.
 */
export function recordApiCall(provider: string, count: number = 1): void {
  const today = getUTCDate();
  const current = usage.get(provider);

  if (current && current.date === today) {
    current.count += count;
  } else {
    usage.set(provider, { date: today, count });
  }
}

/**
 * Get how many calls have been made today for a provider.
 */
export function getUsage(provider: string): number {
  const today = getUTCDate();
  const current = usage.get(provider);
  if (current && current.date === today) return current.count;
  return 0;
}

/**
 * Get the daily budget for a provider.
 */
export function getBudget(provider: string): number {
  return DEFAULT_BUDGETS[provider] ?? 1000;
}

/**
 * Check if the provider has exceeded its daily budget.
 */
export function isOverBudget(provider: string): boolean {
  return getUsage(provider) >= getBudget(provider);
}

/**
 * Get remaining calls available for a provider today.
 */
export function getRemainingBudget(provider: string): number {
  return Math.max(0, getBudget(provider) - getUsage(provider));
}

/**
 * Get a summary of all providers' usage for status reporting.
 */
export function getBudgetSummary(): Record<
  string,
  { used: number; budget: number; pct: number }
> {
  const today = getUTCDate();
  const summary: Record<string, { used: number; budget: number; pct: number }> =
    {};

  for (const [provider, budget] of Object.entries(DEFAULT_BUDGETS)) {
    const current = usage.get(provider);
    const used = current && current.date === today ? current.count : 0;
    summary[provider] = {
      used,
      budget,
      pct: Math.round((used / budget) * 100),
    };
  }

  return summary;
}
