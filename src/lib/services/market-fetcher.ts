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
import { db } from "@/lib/db/client";
import {
  shortInterest as shortInterestTable,
  shortVolumeHistory,
} from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getTickerUniverse } from "@/lib/services/ticker-universe";

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

// ---------- EPS Surprise ----------

export interface EpsSurpriseData {
  epsActual: number;
  epsEstimate: number;
  epsSurprisePct: number; // e.g. 15.0 for 15% beat, -10.0 for 10% miss
  quarter: string; // e.g. "2025-03-31"
}

/**
 * Fetch EPS surprise data for the most recent earnings quarter using
 * yahoo-finance2 quoteSummary earningsHistory module.
 * Returns null if data is unavailable.
 */
export async function fetchEpsSurprise(
  ticker: string,
): Promise<EpsSurpriseData | null> {
  try {
    const result = await yf.quoteSummary(ticker, {
      modules: ["earningsHistory"],
    });
    const history = result?.earningsHistory?.history;
    if (!Array.isArray(history) || history.length === 0) return null;

    // Most recent quarter is last in the array
    const recent = history[history.length - 1];
    const actual =
      typeof recent.epsActual === "number"
        ? recent.epsActual
        : recent.epsActual?.raw;
    const estimate =
      typeof recent.epsEstimate === "number"
        ? recent.epsEstimate
        : recent.epsEstimate?.raw;

    if (typeof actual !== "number" || typeof estimate !== "number") return null;

    // Surprise % = ((actual - estimate) / |estimate|) * 100
    // Guard against zero estimate to avoid infinity
    const surprisePct =
      Math.abs(estimate) > 0.0001
        ? ((actual - estimate) / Math.abs(estimate)) * 100
        : actual > estimate
          ? 100
          : actual < estimate
            ? -100
            : 0;

    const quarter =
      recent.quarter instanceof Date
        ? recent.quarter.toISOString().split("T")[0]
        : typeof recent.quarter === "string"
          ? recent.quarter
          : "unknown";

    return {
      epsActual: actual,
      epsEstimate: estimate,
      epsSurprisePct: Math.round(surprisePct * 100) / 100,
      quarter,
    };
  } catch (err) {
    console.warn(
      `[market-fetcher] EPS surprise fetch failed for ${ticker}:`,
      err,
    );
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
          avgVolume: q.averageDailyVolume3Month ?? undefined,
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

const HIST_MAX_RETRIES = 3;
const HIST_BASE_DELAY_MS = 1500;

export async function fetchHistoricalData(
  ticker: string,
  period: string = "3mo",
): Promise<CandleData[]> {
  // Map period to interval: short periods get intraday, longer get daily
  const interval = period === "1d" ? "5m" : period === "1wk" ? "1h" : "1d";

  // Calculate period1 from period string
  const now = new Date();
  const periodMap: Record<string, number> = {
    "1d": 1,
    "1wk": 7,
    "1mo": 30,
    "3mo": 90,
    "6mo": 180,
    "1y": 365,
  };
  const days = periodMap[period] ?? 90;
  const period1 = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  for (let attempt = 1; attempt <= HIST_MAX_RETRIES; attempt++) {
    try {
      const result = await yf.chart(ticker, {
        period1,
        period2: now,
        interval,
        // Include pre-market + after-hours bars for intraday timeframes
        ...(interval !== "1d" && { includePrePost: true }),
      });

      if (!result?.quotes?.length) {
        console.warn(`[market-fetcher] No historical data for ${ticker}`);
        return [];
      }

      const candles: CandleData[] = result.quotes
        .filter((q: any) => q.open != null && q.close != null)
        .map((q: any) => ({
          // Intraday (5m/1h) candles need unix timestamp (seconds); daily use YYYY-MM-DD string
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
      const isTimeout =
        error instanceof TypeError &&
        (error as any).cause?.code === "UND_ERR_CONNECT_TIMEOUT";
      if (isTimeout && attempt < HIST_MAX_RETRIES) {
        const delay = HIST_BASE_DELAY_MS * 2 ** (attempt - 1);
        console.warn(
          `[market-fetcher] Historical data timeout for ${ticker}, retry ${attempt}/${HIST_MAX_RETRIES} in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      console.error(
        `[market-fetcher] Historical data failed for ${ticker}:`,
        error,
      );
      return [];
    }
  }
  return [];
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

const shortInterestMissCache = new Map<string, number>();

function isExpectedMissingShortInterestError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("quote not found for symbol") ||
    message.includes("no fundamentals data found for symbol")
  );
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
    if (isExpectedMissingShortInterestError(err)) {
      console.info(
        `[market-fetcher] Short interest unavailable for ${ticker}; suppressing retries temporarily.`,
      );
      return null;
    }
    console.warn(
      `[market-fetcher] Short interest fetch failed for ${ticker}:`,
      err,
    );
    return null;
  }
}

const SHORT_INTEREST_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SHORT_INTEREST_MISS_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Returns cached short interest data for a ticker if fresher than 24 hours,
 * otherwise fetches from Yahoo Finance, persists to DB, and returns the result.
 * Falls back to stale cache on fetch failure; returns null if nothing is available.
 */
export async function getOrFetchShortInterest(
  ticker: string,
): Promise<ShortInterestData | null> {
  const missExpiresAt = shortInterestMissCache.get(ticker);
  if (missExpiresAt && Date.now() < missExpiresAt) {
    return null;
  }

  const cached = await db
    .select()
    .from(shortInterestTable)
    .where(eq(shortInterestTable.ticker, ticker))
    .limit(1);

  const row = cached[0] ?? null;

  if (row) {
    const age = Date.now() - new Date(row.fetchedAt).getTime();
    if (age < SHORT_INTEREST_TTL_MS) {
      return {
        ticker: row.ticker,
        sharesShort: row.sharesShort,
        shortRatio: row.shortRatio,
        shortPercentOfFloat: row.shortPercentOfFloat,
        dateShortInterest: row.dateShortInterest
          ? new Date(row.dateShortInterest)
          : null,
        squeezePressure:
          row.squeezePressure as ShortInterestData["squeezePressure"],
      };
    }
  }

  const fresh = await fetchShortInterest(ticker);

  if (fresh) {
    shortInterestMissCache.delete(ticker);
    const fetchedAt = new Date().toISOString();
    await db
      .insert(shortInterestTable)
      .values({
        ticker: fresh.ticker,
        sharesShort: fresh.sharesShort,
        shortRatio: fresh.shortRatio,
        shortPercentOfFloat: fresh.shortPercentOfFloat,
        squeezePressure: fresh.squeezePressure,
        dateShortInterest: fresh.dateShortInterest
          ? fresh.dateShortInterest.toISOString()
          : null,
        fetchedAt,
      })
      .onConflictDoUpdate({
        target: shortInterestTable.ticker,
        set: {
          sharesShort: fresh.sharesShort,
          shortRatio: fresh.shortRatio,
          shortPercentOfFloat: fresh.shortPercentOfFloat,
          squeezePressure: fresh.squeezePressure,
          dateShortInterest: fresh.dateShortInterest
            ? fresh.dateShortInterest.toISOString()
            : null,
          fetchedAt,
        },
      });
    return fresh;
  }

  shortInterestMissCache.set(ticker, Date.now() + SHORT_INTEREST_MISS_TTL_MS);

  // Fetch failed — return stale cache if available
  if (row) {
    console.warn(
      `[market-fetcher] Using stale short interest cache for ${ticker}`,
    );
    return {
      ticker: row.ticker,
      sharesShort: row.sharesShort,
      shortRatio: row.shortRatio,
      shortPercentOfFloat: row.shortPercentOfFloat,
      dateShortInterest: row.dateShortInterest
        ? new Date(row.dateShortInterest)
        : null,
      squeezePressure:
        row.squeezePressure as ShortInterestData["squeezePressure"],
    };
  }

  return null;
}

// ---------- FINRA Daily Short Volume (Epic 51 Sprint 1) ----------

export interface FinraShortVolumeData {
  ticker: string;
  shortVolumePct: number; // 0-1, fraction of day's volume that was short-side
  shortVolumeDate: string; // YYYY-MM-DD
}

/**
 * Fetch daily short sale volume from FINRA's public CDN (no API key required).
 * FINRA publishes T+1 consolidated short volume data aggregating all major venues.
 *
 * URL pattern: https://cdn.finra.org/equity/short_sale/CNMSshvol{YYYYMMDD}.txt
 * Format (pipe-delimited): Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market
 *
 * Returns null on network failure or if the ticker is not found in the file.
 */
export async function fetchFinraShortVolume(
  ticker: string,
): Promise<FinraShortVolumeData | null> {
  // Build last 5 trading-day date strings (skip weekends)
  const candidates: string[] = [];
  const now = new Date();
  for (let offset = 1; offset <= 10 && candidates.length < 5; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() - offset);
    const day = d.getDay();
    if (day === 0 || day === 6) continue;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    candidates.push(`${yyyy}${mm}${dd}`);
  }

  let mostRecent: FinraShortVolumeData | null = null;

  for (const dateStr of candidates) {
    const isoDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;

    // Check if we already have this day in history
    const existing = await db
      .select()
      .from(shortVolumeHistory)
      .where(
        and(
          eq(shortVolumeHistory.ticker, ticker.toUpperCase()),
          eq(shortVolumeHistory.date, isoDate),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      if (!mostRecent) {
        mostRecent = {
          ticker,
          shortVolumePct: existing[0].shortVolumePct,
          shortVolumeDate: existing[0].date,
        };
      }
      continue;
    }

    const url = `https://cdn.finra.org/equity/short_sale/CNMSshvol${dateStr}.txt`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "options-dashboard/1.0" },
      });
      if (!res.ok) continue;

      const text = await res.text();
      const upperTicker = ticker.toUpperCase();

      let shortVol = 0;
      let totalVol = 0;

      for (const line of text.split("\n")) {
        const parts = line.trim().split("|");
        if (parts.length < 4) continue;
        if (parts[0].toUpperCase() !== upperTicker) continue;
        const sv = parseInt(parts[1], 10);
        const tv = parseInt(parts[3], 10);
        if (!isNaN(sv)) shortVol += sv;
        if (!isNaN(tv)) totalVol += tv;
      }

      if (totalVol === 0) continue;

      const pct = shortVol / totalVol;
      console.log(
        `[market-fetcher] FINRA short vol for ${ticker} on ${isoDate}: ${shortVol}/${totalVol} = ${(pct * 100).toFixed(1)}%`,
      );

      // Persist to history table (upsert on conflict)
      await db
        .insert(shortVolumeHistory)
        .values({
          ticker: upperTicker,
          date: isoDate,
          shortVolumePct: pct,
        })
        .onConflictDoNothing();

      if (!mostRecent) {
        mostRecent = { ticker, shortVolumePct: pct, shortVolumeDate: isoDate };
      }
    } catch (err) {
      console.warn(
        `[market-fetcher] FINRA short vol fetch failed for date ${dateStr}:`,
        err,
      );
    }
  }

  return mostRecent;
}

const SHORT_VOLUME_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (FINRA updates T+1)

/**
 * Returns cached FINRA short volume for a ticker if fresh, otherwise fetches
 * from FINRA CDN and persists to the short_interest row's new columns.
 * Returns null if the ticker has no short_interest row yet or FINRA fetch fails.
 */
export async function getOrFetchFinraShortVolume(
  ticker: string,
): Promise<FinraShortVolumeData | null> {
  const cached = await db
    .select()
    .from(shortInterestTable)
    .where(eq(shortInterestTable.ticker, ticker))
    .limit(1);

  const row = cached[0] ?? null;

  // Use cached FINRA data if it was fetched today
  if (row?.shortVolumeDate) {
    const today = new Date().toISOString().split("T")[0];
    if (row.shortVolumeDate === today && row.shortVolumePct != null) {
      return {
        ticker,
        shortVolumePct: row.shortVolumePct,
        shortVolumeDate: row.shortVolumeDate,
      };
    }
    // Also accept yesterday's data if fetched within TTL
    const age = Date.now() - new Date(row.fetchedAt).getTime();
    if (age < SHORT_VOLUME_TTL_MS && row.shortVolumePct != null) {
      return {
        ticker,
        shortVolumePct: row.shortVolumePct,
        shortVolumeDate: row.shortVolumeDate,
      };
    }
  }

  const fresh = await fetchFinraShortVolume(ticker);
  if (!fresh) return null;

  // Persist into existing short_interest row if it exists
  if (row) {
    await db
      .update(shortInterestTable)
      .set({
        shortVolumePct: fresh.shortVolumePct,
        shortVolumeDate: fresh.shortVolumeDate,
      })
      .where(eq(shortInterestTable.ticker, ticker));
  }

  return fresh;
}

/**
 * S51-1: Batch fetch short interest for all tracked tickers.
 * Calls getOrFetchShortInterest() for each and returns a map of
 * ticker → ShortInterestData. Tickers that fail are omitted from the map.
 */
export async function fetchAllTrackedSI(
  tickers: string[],
): Promise<Map<string, ShortInterestData>> {
  const result = new Map<string, ShortInterestData>();
  for (const ticker of tickers) {
    const si = await getOrFetchShortInterest(ticker);
    if (si) result.set(ticker, si);
  }
  console.log(
    `[market-fetcher] fetchAllTrackedSI: ${result.size}/${tickers.length} tickers resolved`,
  );
  return result;
}

/**
 * S51-20: Returns up to `days` rows of short volume history for a ticker,
 * ordered oldest-first (for trend computation).
 */
export async function getShortVolumeHistory(
  ticker: string,
  days: number = 5,
): Promise<{ date: string; shortVolumePct: number }[]> {
  const rows = await db
    .select({ date: shortVolumeHistory.date, shortVolumePct: shortVolumeHistory.shortVolumePct })
    .from(shortVolumeHistory)
    .where(eq(shortVolumeHistory.ticker, ticker.toUpperCase()))
    .orderBy(desc(shortVolumeHistory.date))
    .limit(days);

  // Return oldest-first for slope computation
  return rows.reverse();
}

// ---------- Squeeze Universe (Epic 51 expansion) ----------

interface SqueezeUniverseResult {
  /** Deduplicated tickers from screeners + seed list */
  tickers: string[];
  /** Volume data extracted from screener response (avoids extra DB round-trips) */
  volumeData: Map<string, { volume: number | null; avgVolume: number | null }>;
}

// 1-hour in-memory cache so we don't hit Yahoo screener on every request
let _squeezeUniverseCache: { result: SqueezeUniverseResult; expiresAt: number } | null = null;

/**
 * Returns a broad universe of squeeze candidates by combining:
 *  1. Yahoo Finance "most_shorted_stocks" screener (up to 100 tickers)
 *  2. Yahoo Finance "aggressive_small_caps" screener (up to 50 tickers)
 *  3. A curated seed list of perennially high-SI stocks
 *
 * Cached in-memory for 1 hour. Volume data (regularMarketVolume /
 * averageDailyVolume3Month) is extracted from the screener response and
 * returned alongside the ticker list so the caller can compute volume-spike
 * ratios without additional DB queries.
 */
export async function fetchSqueezeUniverse(): Promise<SqueezeUniverseResult> {
  if (_squeezeUniverseCache && Date.now() < _squeezeUniverseCache.expiresAt) {
    return _squeezeUniverseCache.result;
  }

  const tickerSet = new Set<string>();
  const volumeData = new Map<string, { volume: number | null; avgVolume: number | null }>();

  function absorb(quotes: Array<{ symbol?: string; quoteType?: string; regularMarketVolume?: number; averageDailyVolume3Month?: number }>) {
    for (const q of quotes) {
      if (!q.symbol || q.quoteType !== "EQUITY") continue;
      const sym = q.symbol.toUpperCase();
      tickerSet.add(sym);
      if (!volumeData.has(sym)) {
        volumeData.set(sym, {
          volume: q.regularMarketVolume ?? null,
          avgVolume: q.averageDailyVolume3Month ?? null,
        });
      }
    }
  }

  // Most-shorted (primary universe — sorted by SI% of float by Yahoo)
  try {
    const r = await (yf as any).screener({ scrIds: "most_shorted_stocks", count: 100 });
    absorb(r?.quotes ?? []);
    console.log(`[market-fetcher] most_shorted_stocks screener: ${r?.quotes?.length ?? 0} tickers`);
  } catch (err) {
    console.warn("[market-fetcher] most_shorted_stocks screener failed:", err);
  }

  // Aggressive small-caps — volatile float, high squeeze velocity potential
  try {
    const r = await (yf as any).screener({ scrIds: "aggressive_small_caps", count: 50 });
    absorb(r?.quotes ?? []);
    console.log(`[market-fetcher] aggressive_small_caps screener: ${r?.quotes?.length ?? 0} tickers`);
  } catch (err) {
    console.warn("[market-fetcher] aggressive_small_caps screener failed:", err);
  }

  // Dynamic candidates — the ticker universe (whale-alert / high-impact-news
  // derived, see ticker-universe.ts) adds names the Yahoo screeners miss.
  // UW does not document a Basic-tier market-wide short-interest screener
  // (only a per-ticker `/api/shorts/{ticker}/interest-float/v2`, see
  // docs/research/unusual-whales-api.md row #13), so it is not queried here.
  try {
    const universeTickers = await getTickerUniverse();
    for (const sym of universeTickers) {
      tickerSet.add(sym);
      if (!volumeData.has(sym)) volumeData.set(sym, { volume: null, avgVolume: null });
    }
  } catch (err) {
    console.warn("[market-fetcher] ticker-universe lookup failed:", err);
  }

  // Curated seed list — perennially high-SI names that may drop off Yahoo's
  // dynamic screener on quiet days but remain structurally squeeze-prone.
  // Used ONLY as a last-resort fallback when every dynamic source above
  // (screeners + ticker universe) came back empty.
  if (tickerSet.size === 0) {
    const SQUEEZE_SEEDS = [
      "GME", "AMC", "MSTR", "BYND", "UPST", "SOFI", "HOOD", "RIVN", "LCID",
      "CVNA", "SIRI", "HIMS", "IONQ", "RKLB", "BBAI", "SPCE",
      "CLOV", "WKHS", "OPEN", "OFED", "BBIG", "ATER", "CXAI", "FFIE",
      "SPGX", "BNED", "TPVG", "NEWT", "SHIP", "SNDL", "TLRY", "AFRM",
      "DKNG", "CHWY", "PLTR", "COIN", "SNAP", "RBLX", "UBER", "LYFT",
    ];
    for (const sym of SQUEEZE_SEEDS) {
      tickerSet.add(sym);
      if (!volumeData.has(sym)) volumeData.set(sym, { volume: null, avgVolume: null });
    }
  }

  const result: SqueezeUniverseResult = {
    tickers: Array.from(tickerSet),
    volumeData,
  };

  _squeezeUniverseCache = { result, expiresAt: Date.now() + 60 * 60 * 1000 };
  console.log(`[market-fetcher] squeeze universe: ${result.tickers.length} total tickers`);
  return result;
}
