import type { WhaleAlert } from "@/types/whale";

const WHALE_PREMIUM_THRESHOLD = 100_000; // $100K minimum

// ---------- Unusual Whales ----------

interface UWFlowItem {
  ticker_symbol: string;
  strike_price: number;
  expires_at: string;
  option_type: "call" | "put";
  premium: number;
  volume: number;
  open_interest: number;
  underlying_price?: number;
  sentiment?: "bullish" | "bearish";
  created_at: string;
}

export async function fetchUnusualWhales(): Promise<WhaleAlert[]> {
  const apiKey = process.env.UNUSUAL_WHALES_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    console.warn("[whale-fetcher] No Unusual Whales API key configured");
    return [];
  }

  try {
    const res = await fetch(
      "https://api.unusualwhales.com/api/option-trades/flow",
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!res.ok) {
      console.error(
        `[whale-fetcher] UW API error: ${res.status} ${res.statusText}`,
      );
      return [];
    }

    const json = await res.json();
    const items: UWFlowItem[] = Array.isArray(json.data) ? json.data : [];

    return items
      .filter((item) => item.premium >= WHALE_PREMIUM_THRESHOLD)
      .map((item) => ({
        ticker: item.ticker_symbol,
        strike: item.strike_price,
        expiry: item.expires_at,
        callPut: item.option_type === "call" ? ("C" as const) : ("P" as const),
        premium: item.premium,
        volume: item.volume,
        openInterest: item.open_interest,
        underlyingPrice: item.underlying_price,
        sentiment:
          item.sentiment ??
          (item.option_type === "call"
            ? ("bullish" as const)
            : ("bearish" as const)),
        source: "unusual_whales",
        detectedAt: item.created_at || new Date().toISOString(),
      }));
  } catch (error) {
    console.error("[whale-fetcher] UW fetch failed:", error);
    return [];
  }
}

// ---------- Massive (formerly Polygon.io) Options (fallback) ----------

interface PolygonOptionSnapshot {
  details: {
    ticker: string;
    strike_price: number;
    expiration_date: string;
    contract_type: "call" | "put";
  };
  day: {
    volume: number;
    open: number;
    close: number;
  };
  open_interest: number;
  underlying_asset: {
    ticker: string;
    price: number;
    change_to_break_even: number;
  };
  greeks?: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
  };
  implied_volatility?: number;
  break_even_price?: number;
}

/**
 * Fetch options snapshots from Polygon and detect unusual activity.
 * "Unusual" = day volume > 5x open interest (whale-like activity).
 */
export async function fetchPolygonOptions(
  tickers: string[] = [
    "SPY",
    "QQQ",
    "AAPL",
    "NVDA",
    "TSLA",
    "AMZN",
    "MSFT",
    "META",
    "GOOGL",
    "AMD",
  ],
): Promise<WhaleAlert[]> {
  const apiKey = process.env.MASSIVE_API_KEY ?? process.env.POLYGON_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    console.warn("[whale-fetcher] No Massive API key configured");
    return [];
  }

  const alerts: WhaleAlert[] = [];
  const statusCounts: Record<number, number> = {};
  const failedTickers: string[] = [];
  const networkFailures: string[] = [];

  for (const ticker of tickers) {
    try {
      const res = await fetch(
        `https://api.massive.com/v3/snapshot/options/${ticker}?limit=50&apiKey=${encodeURIComponent(apiKey)}`,
        { signal: AbortSignal.timeout(10_000) },
      );

      if (!res.ok) {
        if (res.status === 429) {
          console.warn("[whale-fetcher] Massive rate limited, pausing...");
          await new Promise((r) => setTimeout(r, 12_000));
          continue;
        }
        statusCounts[res.status] = (statusCounts[res.status] ?? 0) + 1;
        failedTickers.push(ticker);
        continue;
      }

      const json = await res.json();
      const results: PolygonOptionSnapshot[] = json.results ?? [];

      for (const snap of results) {
        const vol = snap.day?.volume ?? 0;
        const oi = snap.open_interest ?? 0;
        // Unusual activity: volume > 5x OI, or very large volume with any OI
        const isUnusual = (oi > 0 && vol > 5 * oi) || vol > 10_000;
        if (!isUnusual) continue;

        const estPremium = vol * (snap.day?.close ?? 1) * 100; // rough premium = vol * price * 100 shares
        if (estPremium < WHALE_PREMIUM_THRESHOLD) continue;

        alerts.push({
          ticker: snap.underlying_asset?.ticker ?? ticker,
          strike: snap.details.strike_price,
          expiry: snap.details.expiration_date,
          callPut: snap.details.contract_type === "call" ? "C" : "P",
          premium: estPremium,
          volume: vol,
          openInterest: oi,
          underlyingPrice: snap.underlying_asset?.price,
          sentiment:
            snap.details.contract_type === "call" ? "bullish" : "bearish",
          source: "polygon",
          detectedAt: new Date().toISOString(),
          delta: snap.greeks?.delta,
          gamma: snap.greeks?.gamma,
          theta: snap.greeks?.theta,
          vega: snap.greeks?.vega,
          impliedVolatility: snap.implied_volatility,
          breakEvenPrice: snap.break_even_price,
        });
      }

      // Massive free tier: 5 calls/min — small delay between tickers
      await new Promise((r) => setTimeout(r, 1_200));
    } catch {
      networkFailures.push(ticker);
    }
  }

  if ((statusCounts[403] ?? 0) > 0) {
    console.warn(
      `[whale-fetcher] Massive returned 403 for ${statusCounts[403]}/${tickers.length} tickers (${failedTickers.join(", ")}). Check MASSIVE_API_KEY permissions/plan.`,
    );
  }

  Object.entries(statusCounts)
    .filter(([status]) => status !== "403")
    .forEach(([status, count]) => {
      console.warn(
        `[whale-fetcher] Massive HTTP ${status} for ${count} ticker(s)`,
      );
    });

  if (networkFailures.length > 0) {
    console.warn(
      `[whale-fetcher] Massive network failures for ${networkFailures.length} ticker(s): ${networkFailures.join(", ")}`,
    );
  }

  return alerts;
}

// ---------- Unified fetcher ----------

export async function fetchWhaleAlerts(): Promise<WhaleAlert[]> {
  const source = process.env.WHALE_SOURCE ?? "unusual_whales";
  console.log(`[whale-fetcher] Using source: ${source}`);

  let alerts: WhaleAlert[];
  if (source === "polygon") {
    alerts = await fetchPolygonOptions();
  } else {
    alerts = await fetchUnusualWhales();
  }

  console.log(
    `[whale-fetcher] Fetched ${alerts.length} whale alerts (premium >= $${WHALE_PREMIUM_THRESHOLD.toLocaleString()})`,
  );
  return alerts;
}
