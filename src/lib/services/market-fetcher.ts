import YahooFinance from "yahoo-finance2";
import type {
  MarketSnapshot,
  OptionsChainSummary,
  CandleData,
} from "@/types/market";
import { analyzeOptionsChain } from "@/lib/utils/options-analytics";
import { computeGEX } from "@/lib/utils/gex-calculator";
import {
  SECTOR_ETFS,
  type SectorPerformance,
} from "@/lib/utils/sector-rotation";

// yahoo-finance2 v3 class API — types export `never` but methods exist at runtime
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new YahooFinance() as any;

// ---------- VIX ----------

export async function fetchVIX(): Promise<number | null> {
  try {
    const q = await yf.quote("^VIX");
    const level = q?.regularMarketPrice ?? null;
    if (level != null) {
      console.log(`[market-fetcher] VIX: ${level}`);
    }
    return level;
  } catch (err) {
    console.error("[market-fetcher] VIX fetch failed:", err);
    return null;
  }
}

// ---------- Earnings date ----------

export async function fetchEarningsDate(
  ticker: string,
): Promise<string | null> {
  try {
    const q = await yf.quote(ticker);
    const ts = q?.earningsTimestamp ?? q?.earningsTimestampStart ?? null;
    if (ts == null) return null;
    const d = ts instanceof Date ? ts : new Date(ts * 1000);
    return d.toISOString();
  } catch (err) {
    console.error(`[market-fetcher] Earnings date failed for ${ticker}:`, err);
    return null;
  }
}

// ---------- Market quotes ----------

export async function fetchMarketData(
  tickers: string[],
): Promise<MarketSnapshot[]> {
  if (tickers.length === 0) return [];

  const snapshots: MarketSnapshot[] = [];

  for (const ticker of tickers) {
    try {
      const q = await yf.quote(ticker);
      if (q?.symbol) {
        snapshots.push({
          ticker: q.symbol,
          price: q.regularMarketPrice ?? 0,
          volume: q.regularMarketVolume ?? 0,
          dayChangePct: q.regularMarketChangePercent ?? 0,
        });
      }
    } catch (err) {
      console.error(`[market-fetcher] Quote failed for ${ticker}:`, err);
    }
  }

  console.log(
    `[market-fetcher] Fetched ${snapshots.length}/${tickers.length} market quotes`,
  );
  return snapshots;
}

// ---------- Options chain ----------

export async function fetchOptionsChain(
  ticker: string,
): Promise<OptionsChainSummary | null> {
  try {
    const chain = await yf.options(ticker);
    if (!chain?.options?.length) {
      console.warn(`[market-fetcher] No options data for ${ticker}`);
      return null;
    }

    const expirations =
      chain.expirationDates?.map((d: Date) => d.toISOString().split("T")[0]) ??
      [];
    const nearest = chain.options[0];

    const mapContracts = (contracts: any[]) =>
      contracts.map((c) => ({
        strike: c.strike,
        bid: c.bid ?? 0,
        ask: c.ask ?? 0,
        volume: c.volume ?? 0,
        openInterest: c.openInterest ?? 0,
        iv: c.impliedVolatility ?? 0,
        delta: undefined,
        gamma: undefined,
        theta: undefined,
      }));

    const baseSummary: OptionsChainSummary = {
      ticker,
      expirations,
      nearestExpiry: {
        date: expirations[0] ?? "",
        calls: mapContracts(nearest.calls),
        puts: mapContracts(nearest.puts),
      },
    };

    // Enrich with max pain and OI walls (needs a price estimate)
    const midCall = nearest.calls?.[Math.floor(nearest.calls.length / 2)];
    const priceEstimate = midCall?.strike ?? 0;
    if (priceEstimate > 0) {
      const analytics = analyzeOptionsChain(baseSummary, priceEstimate);
      baseSummary.maxPain = analytics.maxPain;
      baseSummary.oiWalls = analytics.oiWalls;
      baseSummary.gex = computeGEX(baseSummary, priceEstimate) ?? null;
    }

    return baseSummary;
  } catch (error) {
    console.error(
      `[market-fetcher] Options chain failed for ${ticker}:`,
      error,
    );
    return null;
  }
}

// ---------- Historical OHLCV data ----------

export async function fetchHistoricalData(
  ticker: string,
  period: string = "3mo",
): Promise<CandleData[]> {
  try {
    // Map period to interval: short periods get intraday, longer get daily
    const interval = period === "1wk" ? "1h" : "1d";

    // Calculate period1 from period string
    const now = new Date();
    const periodMap: Record<string, number> = {
      "1wk": 7,
      "1mo": 30,
      "3mo": 90,
      "6mo": 180,
      "1y": 365,
    };
    const days = periodMap[period] ?? 90;
    const period1 = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const result = await yf.chart(ticker, {
      period1,
      period2: now,
      interval,
    });

    if (!result?.quotes?.length) {
      console.warn(`[market-fetcher] No historical data for ${ticker}`);
      return [];
    }

    const candles: CandleData[] = result.quotes
      .filter((q: any) => q.open != null && q.close != null)
      .map((q: any) => ({
        // Hourly candles need unix timestamp (seconds); daily use YYYY-MM-DD string
        time:
          interval === "1d"
            ? new Date(q.date).toISOString().split("T")[0]
            : Math.floor(new Date(q.date).getTime() / 1000),
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume ?? 0,
      }));

    console.log(
      `[market-fetcher] Fetched ${candles.length} candles for ${ticker} (${period})`,
    );
    return candles;
  } catch (error) {
    console.error(
      `[market-fetcher] Historical data failed for ${ticker}:`,
      error,
    );
    return [];
  }
}

// ---------- Sector Performance ----------

export async function fetchSectorPerformance(): Promise<SectorPerformance[]> {
  const results: SectorPerformance[] = [];

  for (const etf of SECTOR_ETFS) {
    try {
      const q = await yf.quote(etf.ticker);
      if (q?.symbol) {
        results.push({
          ticker: etf.ticker,
          name: etf.name,
          dayChangePct: q.regularMarketChangePercent ?? 0,
          cyclical: etf.cyclical,
        });
      }
    } catch (err) {
      console.warn(
        `[market-fetcher] Sector quote failed for ${etf.ticker}:`,
        err,
      );
    }
  }

  console.log(
    `[market-fetcher] Fetched ${results.length}/${SECTOR_ETFS.length} sector ETF quotes`,
  );
  return results;
}

// ---------- Realized Volatility ----------

/**
 * Compute annualized realized (historical) volatility from daily candles.
 * Uses the standard deviation of log returns × √252.
 * Returns null if insufficient data (< 20 candles).
 */
export function computeRealizedVol(
  candles: CandleData[],
  window: number = 20,
): number | null {
  if (candles.length < window + 1) return null;

  // Use the most recent `window` candles
  const recent = candles.slice(-(window + 1));
  const logReturns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1].close;
    const curr = recent[i].close;
    if (prev > 0 && curr > 0) {
      logReturns.push(Math.log(curr / prev));
    }
  }

  if (logReturns.length < window) return null;

  const mean = logReturns.reduce((s, r) => s + r, 0) / logReturns.length;
  const variance =
    logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) /
    (logReturns.length - 1);
  const dailyVol = Math.sqrt(variance);
  const annualizedVol = dailyVol * Math.sqrt(252);

  return annualizedVol;
}

// ---------- Real IV Percentile ----------

/**
 * Compute a real IV percentile by comparing current ATM IV against the
 * historical realized vol range over the past year.
 * Falls back to the heuristic if insufficient historical data.
 */
export async function computeRealIVPercentile(
  ticker: string,
  currentIV: number,
): Promise<{
  ivRank: number;
  realizedVol: number | null;
  method: "real" | "heuristic";
}> {
  try {
    const candles = await fetchHistoricalData(ticker, "1y");
    if (candles.length < 60) {
      // Insufficient data — fall back to heuristic
      console.warn(
        `[market-fetcher] Only ${candles.length} candles for ${ticker}, using heuristic IV rank`,
      );
      return {
        ivRank: computeIVRank(currentIV),
        realizedVol: null,
        method: "heuristic",
      };
    }

    // Compute rolling 20-day realized vol for each window across the year
    const rollingVols: number[] = [];
    for (let i = 20; i < candles.length; i++) {
      const windowCandles = candles.slice(i - 20, i + 1);
      const rv = computeRealizedVol(windowCandles, 20);
      if (rv != null) rollingVols.push(rv);
    }

    if (rollingVols.length === 0) {
      return {
        ivRank: computeIVRank(currentIV),
        realizedVol: null,
        method: "heuristic",
      };
    }

    // Current realized vol (most recent 20-day window)
    const currentRV = computeRealizedVol(candles, 20);

    // IV percentile: where current IV sits relative to the range of historical realized vols
    const minRV = Math.min(...rollingVols);
    const maxRV = Math.max(...rollingVols);
    const range = maxRV - minRV;

    let ivRank: number;
    if (range < 0.001) {
      // Nearly no range — use midpoint
      ivRank = 50;
    } else {
      ivRank = Math.round(((currentIV - minRV) / range) * 100);
      ivRank = Math.max(0, Math.min(100, ivRank));
    }

    return { ivRank, realizedVol: currentRV, method: "real" };
  } catch (err) {
    console.error(
      `[market-fetcher] Real IV percentile failed for ${ticker}:`,
      err,
    );
    return {
      ivRank: computeIVRank(currentIV),
      realizedVol: null,
      method: "heuristic",
    };
  }
}

// ---------- IV Rank helper (heuristic fallback) ----------

/**
 * Compute IV rank: where current IV sits in the 52-week range (0–100).
 * Requires historical IV data — for now, uses a heuristic based on
 * the options chain average IV vs. typical ranges.
 */
export function computeIVRank(
  currentIV: number,
  low52w: number = 0.15,
  high52w: number = 0.8,
): number {
  if (high52w <= low52w) return 50;
  const rank = ((currentIV - low52w) / (high52w - low52w)) * 100;
  return Math.max(0, Math.min(100, Math.round(rank)));
}

/**
 * Enrich a market snapshot with IV data from the options chain.
 * Uses real IV percentile computation when enough historical data is available.
 */
export async function enrichWithIV(
  snapshot: MarketSnapshot,
): Promise<MarketSnapshot> {
  const chain = await fetchOptionsChain(snapshot.ticker);
  if (!chain) return snapshot;

  // Average IV from nearest-expiry ATM options (within 5% of price)
  const allContracts = [
    ...chain.nearestExpiry.calls,
    ...chain.nearestExpiry.puts,
  ];
  const atmContracts = allContracts.filter(
    (c) =>
      Math.abs(c.strike - snapshot.price) / snapshot.price < 0.05 && c.iv > 0,
  );

  if (atmContracts.length === 0) return snapshot;

  const avgIV =
    atmContracts.reduce((sum, c) => sum + c.iv, 0) / atmContracts.length;

  // Use real IV percentile with historical realized vol
  const { ivRank, realizedVol, method } = await computeRealIVPercentile(
    snapshot.ticker,
    avgIV,
  );

  const ivRvSpread = realizedVol != null ? avgIV - realizedVol : undefined;

  return {
    ...snapshot,
    iv: avgIV,
    ivRank,
    realizedVol: realizedVol ?? undefined,
    ivRvSpread,
    ivPercentileMethod: method,
  };
}

// ---------- Re-exports for pipeline context ----------
// (kept at bottom so barrel imports work cleanly)
export type { VIXContext } from "@/lib/utils/vix-regimes";
export type { EarningsProximity } from "@/lib/utils/earnings-proximity";

// ---------- Short Interest (Story 39.3) ----------

export interface ShortInterestData {
  ticker: string;
  sharesShort: number | null;
  shortRatio: number | null; // days to cover
  shortPercentOfFloat: number | null; // 0-1
  dateShortInterest: Date | null;
  squeezePressure: "extreme" | "high" | "moderate" | "low";
}

/**
 * Fetch short interest data for a ticker using yahoo-finance2 defaultKeyStatistics.
 * Returns null if the data is unavailable or the fetch fails.
 */
export async function fetchShortInterest(
  ticker: string,
): Promise<ShortInterestData | null> {
  try {
    const result = await (yf as any).quoteSummary(ticker, {
      modules: ["defaultKeyStatistics"],
    });
    const s = result?.defaultKeyStatistics;
    if (!s) return null;

    const shortPct: number | null =
      typeof s.shortPercentOfFloat === "number" ? s.shortPercentOfFloat : null;

    let squeezePressure: ShortInterestData["squeezePressure"] = "low";
    if (shortPct != null) {
      if (shortPct > 0.2) squeezePressure = "extreme";
      else if (shortPct > 0.1) squeezePressure = "high";
      else if (shortPct > 0.05) squeezePressure = "moderate";
    }

    return {
      ticker,
      sharesShort: typeof s.sharesShort === "number" ? s.sharesShort : null,
      shortRatio: typeof s.shortRatio === "number" ? s.shortRatio : null,
      shortPercentOfFloat: shortPct,
      dateShortInterest:
        s.dateShortInterest instanceof Date ? s.dateShortInterest : null,
      squeezePressure,
    };
  } catch (err) {
    console.warn(
      `[market-fetcher] Short interest fetch failed for ${ticker}:`,
      err,
    );
    return null;
  }
}
