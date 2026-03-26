import YahooFinance from "yahoo-finance2";
import type { MarketSnapshot, OptionsChainSummary } from "@/types/market";

const yf = new YahooFinance();

// ---------- Market quotes ----------

export async function fetchMarketData(tickers: string[]): Promise<MarketSnapshot[]> {
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

  console.log(`[market-fetcher] Fetched ${snapshots.length}/${tickers.length} market quotes`);
  return snapshots;
}

// ---------- Options chain ----------

export async function fetchOptionsChain(ticker: string): Promise<OptionsChainSummary | null> {
  try {
    const chain = await yf.options(ticker);
    if (!chain?.options?.length) {
      console.warn(`[market-fetcher] No options data for ${ticker}`);
      return null;
    }

    const expirations = chain.expirationDates?.map((d) => d.toISOString().split("T")[0]) ?? [];
    const nearest = chain.options[0];

    const mapContracts = (contracts: typeof nearest.calls) =>
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
    console.error(`[market-fetcher] Options chain failed for ${ticker}:`, error);
    return null;
  }
}

// ---------- IV Rank helper ----------

/**
 * Compute IV rank: where current IV sits in the 52-week range (0–100).
 * Requires historical IV data — for now, uses a heuristic based on
 * the options chain average IV vs. typical ranges.
 */
export function computeIVRank(currentIV: number, low52w: number = 0.15, high52w: number = 0.80): number {
  if (high52w <= low52w) return 50;
  const rank = ((currentIV - low52w) / (high52w - low52w)) * 100;
  return Math.max(0, Math.min(100, Math.round(rank)));
}

/**
 * Enrich a market snapshot with IV data from the options chain.
 */
export async function enrichWithIV(snapshot: MarketSnapshot): Promise<MarketSnapshot> {
  const chain = await fetchOptionsChain(snapshot.ticker);
  if (!chain) return snapshot;

  // Average IV from nearest-expiry ATM options (within 5% of price)
  const allContracts = [...chain.nearestExpiry.calls, ...chain.nearestExpiry.puts];
  const atmContracts = allContracts.filter(
    (c) => Math.abs(c.strike - snapshot.price) / snapshot.price < 0.05 && c.iv > 0
  );

  if (atmContracts.length === 0) return snapshot;

  const avgIV = atmContracts.reduce((sum, c) => sum + c.iv, 0) / atmContracts.length;
  const ivRank = computeIVRank(avgIV);

  return { ...snapshot, iv: avgIV, ivRank };
}
