import YahooFinance from "yahoo-finance2";
import type { MarketSnapshot, OptionsChainSummary, CandleData } from "@/types/market";

// yahoo-finance2 v3 class API — types export `never` but methods exist at runtime
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new YahooFinance() as any;

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

    return {
      ticker,
      expirations,
      nearestExpiry: {
        date: expirations[0] ?? "",
        calls: mapContracts(nearest.calls),
        puts: mapContracts(nearest.puts),
      },
    };
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
        time: new Date(q.date).toISOString().split("T")[0],
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

// ---------- IV Rank helper ----------

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
  const ivRank = computeIVRank(avgIV);

  return { ...snapshot, iv: avgIV, ivRank };
}
