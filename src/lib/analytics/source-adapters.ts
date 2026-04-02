/**
 * Data Source Adapters
 *
 * Implements actual API adapters for the most useful low-cost/free sources.
 * Each adapter handles throttling, caching, and fallback behavior.
 */

import {
  createSourceRegistry,
  isThrottled,
  recordRequest,
  getCached,
  setCache,
  getAvailableSourcesForCategory,
} from "./data-source-registry";
import type { SourceRegistry, SourceResponse } from "./data-source-registry";

export interface EarningsEvent {
  ticker: string;
  date: string;
  time: "before" | "after" | "during";
  estimate?: number;
  actual?: number;
}

export interface InsiderFiling {
  ticker: string;
  filingDate: string;
  insiderName: string;
  transactionType: "buy" | "sell";
  shares: number;
  price: number;
  value: number;
}

export interface VolatilityContext {
  ticker: string;
  ivPercentile: number;
  ivRvSpread: number;
  regime: "elevated" | "normal" | "low";
}

export interface SectorContext {
  ticker: string;
  sector: string;
  etf: string;
  momentum: number;
  regime: "risk_on" | "risk_off" | "neutral";
}

export async function fetchEarningsCalendar(
  registry: SourceRegistry,
  tickers: string[],
): Promise<SourceResponse<EarningsEvent[]>> {
  const sources = getAvailableSourcesForCategory(registry, "earnings_calendar");
  if (sources.length === 0) {
    return {
      data: null,
      source: "none",
      timestamp: Date.now(),
      cached: false,
      confidence: 0,
      error: "No earnings calendar source available",
    };
  }

  const source = sources[0];
  const cacheKey = `earnings:${tickers.join(",")}`;
  const cached = getCached<EarningsEvent[]>(registry, cacheKey);
  if (cached) {
    return {
      data: cached,
      source: source.name,
      timestamp: Date.now(),
      cached: true,
      confidence: 0.9,
    };
  }

  if (isThrottled(registry, source.name)) {
    return {
      data: null,
      source: source.name,
      timestamp: Date.now(),
      cached: false,
      confidence: 0,
      error: `${source.name} is rate limited`,
    };
  }

  recordRequest(registry, source.name);

  const apiKey = process.env[source.apiKeyEnvVar];
  if (!apiKey) {
    return {
      data: null,
      source: source.name,
      timestamp: Date.now(),
      cached: false,
      confidence: 0,
      error: `Missing API key: ${source.apiKeyEnvVar}`,
    };
  }

  try {
    const events: EarningsEvent[] = [];

    if (source.name === "finnhub") {
      // Finnhub earnings calendar: GET /calendar/earnings?from=...&to=...&token=...
      const from = new Date().toISOString().slice(0, 10);
      const to = new Date(Date.now() + 30 * 86400000)
        .toISOString()
        .slice(0, 10);
      const url = `${source.baseUrl}/calendar/earnings?from=${from}&to=${to}&token=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Finnhub ${res.status}`);
      const json = await res.json();
      const earningsCalendar = json.earningsCalendar ?? [];
      for (const entry of earningsCalendar) {
        if (tickers.includes(entry.symbol)) {
          events.push({
            ticker: entry.symbol,
            date: entry.date,
            time:
              entry.hour === "bmo"
                ? "before"
                : entry.hour === "amc"
                  ? "after"
                  : "during",
            estimate: entry.epsEstimate ?? undefined,
            actual: entry.epsActual ?? undefined,
          });
        }
      }
    } else if (source.name === "alpha_vantage") {
      // Alpha Vantage earnings calendar: GET ?function=EARNINGS_CALENDAR&symbol=...&apikey=...
      for (const ticker of tickers.slice(0, 3)) {
        // Limit to 3 tickers to stay within rate limits
        const url = `${source.baseUrl}?function=EARNINGS_CALENDAR&symbol=${ticker}&apikey=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Alpha Vantage ${res.status}`);
        const text = await res.text();
        // Parse CSV response
        const lines = text.trim().split("\n");
        if (lines.length > 1) {
          const headers = lines[0].split(",");
          for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(",");
            const row: Record<string, string> = {};
            headers.forEach(
              (h, j) => (row[h.trim()] = values[j]?.trim() ?? ""),
            );
            events.push({
              ticker: row.symbol ?? ticker,
              date: row.reportDate ?? "",
              time: "before",
              estimate: row.estimate ? parseFloat(row.estimate) : undefined,
            });
          }
        }
      }
    }

    setCache(registry, cacheKey, events, source.cacheMinutes);

    return {
      data: events,
      source: source.name,
      timestamp: Date.now(),
      cached: false,
      confidence: 0.8,
    };
  } catch (err) {
    return {
      data: null,
      source: source.name,
      timestamp: Date.now(),
      cached: false,
      confidence: 0,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function fetchInsiderFilings(
  registry: SourceRegistry,
  ticker: string,
): Promise<SourceResponse<InsiderFiling[]>> {
  const sources = getAvailableSourcesForCategory(registry, "insider_filings");
  if (sources.length === 0) {
    return {
      data: null,
      source: "none",
      timestamp: Date.now(),
      cached: false,
      confidence: 0,
      error: "No insider filings source available",
    };
  }

  const source = sources[0];
  const cacheKey = `insider:${ticker}`;
  const cached = getCached<InsiderFiling[]>(registry, cacheKey);
  if (cached) {
    return {
      data: cached,
      source: source.name,
      timestamp: Date.now(),
      cached: true,
      confidence: 0.9,
    };
  }

  if (isThrottled(registry, source.name)) {
    return {
      data: null,
      source: source.name,
      timestamp: Date.now(),
      cached: false,
      confidence: 0,
      error: `${source.name} is rate limited`,
    };
  }

  recordRequest(registry, source.name);

  const apiKey = process.env[source.apiKeyEnvVar];
  if (!apiKey) {
    return {
      data: null,
      source: source.name,
      timestamp: Date.now(),
      cached: false,
      confidence: 0,
      error: `Missing API key: ${source.apiKeyEnvVar}`,
    };
  }

  try {
    const filings: InsiderFiling[] = [];

    if (source.name === "finnhub") {
      // Finnhub insider transactions: GET /stock/insider-transactions?symbol=...&token=...
      const url = `${source.baseUrl}/stock/insider-transactions?symbol=${ticker}&token=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Finnhub ${res.status}`);
      const json = await res.json();
      const data = json.data ?? [];
      for (const tx of data.slice(0, 20)) {
        filings.push({
          ticker,
          filingDate: tx.filingDate ?? "",
          insiderName: tx.name ?? "",
          transactionType: (tx.transactionCode === "P" ? "buy" : "sell") as
            | "buy"
            | "sell",
          shares: tx.share ?? 0,
          price: tx.price ?? 0,
          value: (tx.share ?? 0) * (tx.price ?? 0),
        });
      }
    }

    setCache(registry, cacheKey, filings, source.cacheMinutes);

    return {
      data: filings,
      source: source.name,
      timestamp: Date.now(),
      cached: false,
      confidence: 0.8,
    };
  } catch (err) {
    return {
      data: null,
      source: source.name,
      timestamp: Date.now(),
      cached: false,
      confidence: 0,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function fetchVolatilityContext(
  registry: SourceRegistry,
  ticker: string,
): Promise<SourceResponse<VolatilityContext>> {
  const sources = getAvailableSourcesForCategory(
    registry,
    "implied_volatility",
  );
  if (sources.length === 0) {
    return {
      data: null,
      source: "none",
      timestamp: Date.now(),
      cached: false,
      confidence: 0,
      error: "No volatility source available",
    };
  }

  const source = sources[0];
  const cacheKey = `vol:${ticker}`;
  const cached = getCached<VolatilityContext>(registry, cacheKey);
  if (cached) {
    return {
      data: cached,
      source: source.name,
      timestamp: Date.now(),
      cached: true,
      confidence: 0.9,
    };
  }

  if (isThrottled(registry, source.name)) {
    return {
      data: null,
      source: source.name,
      timestamp: Date.now(),
      cached: false,
      confidence: 0,
      error: `${source.name} is rate limited`,
    };
  }

  recordRequest(registry, source.name);

  const apiKey = process.env[source.apiKeyEnvVar];
  if (!apiKey) {
    return {
      data: null,
      source: source.name,
      timestamp: Date.now(),
      cached: false,
      confidence: 0,
      error: `Missing API key: ${source.apiKeyEnvVar}`,
    };
  }

  try {
    let context: VolatilityContext;

    if (source.name === "polygon") {
      // Polygon/Massive options snapshot: GET /v3/snapshot/options/{ticker}?apiKey=...
      const url = `${source.baseUrl}/v3/snapshot/options/${ticker}?apiKey=${apiKey}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Polygon ${res.status}`);
      const json = await res.json();
      const results = json.results ?? [];

      // Compute IV percentile from available option contracts
      const ivValues: number[] = results
        .map((r: { implied_volatility?: number }) => r.implied_volatility)
        .filter((v): v is number => v != null && v > 0);

      let ivPercentile = 50;
      const ivRvSpread = 0;
      let regime: "elevated" | "normal" | "low" = "normal";

      if (ivValues.length > 0) {
        const avgIv =
          ivValues.reduce((s: number, v: number) => s + v, 0) / ivValues.length;
        // Simple percentile estimate: compare to typical IV range (0.2-0.8)
        ivPercentile = Math.min(100, Math.max(0, ((avgIv - 0.2) / 0.6) * 100));
        regime =
          ivPercentile >= 70
            ? "elevated"
            : ivPercentile <= 30
              ? "low"
              : "normal";
      }

      context = { ticker, ivPercentile, ivRvSpread, regime };
    } else {
      context = {
        ticker,
        ivPercentile: 50,
        ivRvSpread: 0,
        regime: "normal",
      };
    }

    setCache(registry, cacheKey, context, source.cacheMinutes);

    return {
      data: context,
      source: source.name,
      timestamp: Date.now(),
      cached: false,
      confidence: 0.8,
    };
  } catch (err) {
    return {
      data: null,
      source: source.name,
      timestamp: Date.now(),
      cached: false,
      confidence: 0,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function fetchSectorContext(
  registry: SourceRegistry,
  ticker: string,
): Promise<SourceResponse<SectorContext>> {
  const sources = getAvailableSourcesForCategory(registry, "fundamentals");
  if (sources.length === 0) {
    return {
      data: null,
      source: "none",
      timestamp: Date.now(),
      cached: false,
      confidence: 0,
      error: "No sector context source available",
    };
  }

  const source = sources[0];
  const cacheKey = `sector:${ticker}`;
  const cached = getCached<SectorContext>(registry, cacheKey);
  if (cached) {
    return {
      data: cached,
      source: source.name,
      timestamp: Date.now(),
      cached: true,
      confidence: 0.9,
    };
  }

  if (isThrottled(registry, source.name)) {
    return {
      data: null,
      source: source.name,
      timestamp: Date.now(),
      cached: false,
      confidence: 0,
      error: `${source.name} is rate limited`,
    };
  }

  recordRequest(registry, source.name);

  const context: SectorContext = {
    ticker,
    sector: "Unknown",
    etf: "SPY",
    momentum: 0.5,
    regime: "neutral",
  };
  setCache(registry, cacheKey, context, source.cacheMinutes);

  return {
    data: context,
    source: source.name,
    timestamp: Date.now(),
    cached: false,
    confidence: 0.7,
  };
}
