import type { InsiderTransaction, InsiderSentiment } from "@/types/insider";

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const LOOKBACK_DAYS = 30;

/**
 * Fetch insider transactions for a ticker from Finnhub.
 * Filters to purchases (P) and sales (S) within the last 30 days.
 */
export async function fetchInsiderTransactions(
  ticker: string,
): Promise<InsiderTransaction[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    console.warn("[insider-fetcher] No Finnhub API key configured");
    return [];
  }

  try {
    const url = `${FINNHUB_BASE}/stock/insider-transactions?symbol=${encodeURIComponent(ticker)}&token=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (!res.ok) {
      console.error(
        `[insider-fetcher] Finnhub error for ${ticker}: ${res.status}`,
      );
      return [];
    }

    const json = await res.json();
    const raw: Array<Record<string, unknown>> = Array.isArray(json?.data)
      ? json.data
      : [];

    const cutoff = new Date(
      Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    return raw
      .filter((t) => {
        const code = String(t.transactionCode ?? "");
        const date = String(t.transactionDate ?? "");
        return (code === "P" || code === "S") && date >= cutoff;
      })
      .map((t) => ({
        name: String(t.name ?? "Unknown"),
        share: Number(t.share ?? 0),
        change: Number(t.change ?? 0),
        transactionDate: String(t.transactionDate ?? ""),
        transactionCode: String(t.transactionCode ?? ""),
        transactionPrice: Number(t.transactionPrice ?? 0),
        filingDate: String(t.filingDate ?? ""),
      }));
  } catch (error) {
    console.error(`[insider-fetcher] Failed for ${ticker}:`, error);
    return [];
  }
}

/**
 * Compute aggregated insider sentiment from transactions.
 */
export function computeInsiderSentiment(
  ticker: string,
  transactions: InsiderTransaction[],
): InsiderSentiment {
  let buyCount = 0;
  let buyValue = 0;
  let sellCount = 0;
  let sellValue = 0;

  for (const t of transactions) {
    const value = Math.abs(t.change) * t.transactionPrice;
    if (t.transactionCode === "P") {
      buyCount++;
      buyValue += value;
    } else if (t.transactionCode === "S") {
      sellCount++;
      sellValue += value;
    }
  }

  let sentiment: InsiderSentiment["sentiment"] = "neutral";
  if (buyValue > sellValue * 1.5) {
    sentiment = "bullish";
  } else if (sellValue > buyValue * 1.5) {
    sentiment = "bearish";
  }

  return {
    ticker,
    buyCount,
    buyValue,
    sellCount,
    sellValue,
    sentiment,
    periodDays: LOOKBACK_DAYS,
  };
}
