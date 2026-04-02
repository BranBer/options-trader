/**
 * Data Source Registry
 *
 * Manages external data sources with throttling, caching, and fallback handling.
 * Sources are treated as enrichment layers — not critical path dependencies.
 */

export interface DataSourceConfig {
  name: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  requestsPerMinute: number;
  cacheMinutes: number;
  priority: "high" | "medium" | "low";
  categories: string[];
}

export interface SourceResponse<T> {
  data: T | null;
  source: string;
  timestamp: number;
  cached: boolean;
  confidence: number;
  error?: string;
}

export interface SourceRegistry {
  configs: Map<string, DataSourceConfig>;
  cache: Map<string, { data: unknown; expiresAt: number }>;
  requestLog: Map<string, number[]>;
}

const DEFAULT_CONFIGS: DataSourceConfig[] = [
  {
    name: "polygon",
    baseUrl: "https://api.massive.com",
    apiKeyEnvVar: "MASSIVE_API_KEY",
    requestsPerMinute: 5,
    cacheMinutes: 5,
    priority: "high",
    categories: ["options_flow", "greeks", "implied_volatility"],
  },
  {
    name: "unusual_whales",
    baseUrl: "https://api.unusualwhales.com",
    apiKeyEnvVar: "UNUSUAL_WHALES_API_KEY",
    requestsPerMinute: 60,
    cacheMinutes: 1,
    priority: "high",
    categories: ["options_flow", "whale_alerts"],
  },
  {
    name: "finnhub",
    baseUrl: "https://finnhub.io/api/v1",
    apiKeyEnvVar: "FINNHUB_API_KEY",
    requestsPerMinute: 30,
    cacheMinutes: 60,
    priority: "high",
    categories: ["earnings_calendar", "insider_filings", "fundamentals"],
  },
  {
    name: "alpha_vantage",
    baseUrl: "https://www.alphavantage.co/query",
    apiKeyEnvVar: "ALPHA_VANTAGE_API_KEY",
    requestsPerMinute: 5,
    cacheMinutes: 1440,
    priority: "medium",
    categories: ["fundamentals", "earnings", "economic_calendar"],
  },
  {
    name: "sec_edgar",
    baseUrl: "https://efts.sec.gov/LATEST/search-index",
    apiKeyEnvVar: "",
    requestsPerMinute: 10,
    cacheMinutes: 1440,
    priority: "medium",
    categories: ["insider_filings", "sec_filings"],
  },
  {
    name: "fmp",
    baseUrl: "https://financialmodelingprep.com/api/v3",
    apiKeyEnvVar: "FMP_API_KEY",
    requestsPerMinute: 30,
    cacheMinutes: 60,
    priority: "medium",
    categories: ["earnings_calendar", "fundamentals", "analyst_estimates"],
  },
];

export function createSourceRegistry(): SourceRegistry {
  const configs = new Map<string, DataSourceConfig>();
  for (const config of DEFAULT_CONFIGS) {
    configs.set(config.name, config);
  }
  return { configs, cache: new Map(), requestLog: new Map() };
}

export function isThrottled(
  registry: SourceRegistry,
  sourceName: string,
): boolean {
  const config = registry.configs.get(sourceName);
  if (!config) return true;

  const now = Date.now();
  const windowMs = 60_000;
  const timestamps = (registry.requestLog.get(sourceName) ?? []).filter(
    (ts) => now - ts < windowMs,
  );

  return timestamps.length >= config.requestsPerMinute;
}

export function recordRequest(
  registry: SourceRegistry,
  sourceName: string,
): void {
  const timestamps = registry.requestLog.get(sourceName) ?? [];
  timestamps.push(Date.now());
  registry.requestLog.set(sourceName, timestamps);
}

export function getCached<T>(registry: SourceRegistry, key: string): T | null {
  const entry = registry.cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    registry.cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(
  registry: SourceRegistry,
  key: string,
  data: T,
  ttlMinutes: number,
): void {
  registry.cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMinutes * 60_000,
  });
}

export function getAvailableSourcesForCategory(
  registry: SourceRegistry,
  category: string,
): DataSourceConfig[] {
  return Array.from(registry.configs.values())
    .filter((c) => c.categories.includes(category))
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
}
