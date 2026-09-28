import { db } from "@/lib/db/client";
import { whaleAlerts, newsEvents } from "@/lib/db/schema";
import { and, gte } from "drizzle-orm";

/**
 * Ticker Universe — replaces hard-coded ticker lists with a ranked set
 * derived from EXISTING data (no new tables):
 *   (a) whale_alerts in the last 3 days, weighted by total premium
 *   (b) news_events in the last 24h with impact_score >= 4 (tickers JSON col)
 *   (c) upcoming earnings — SKIPPED: no cleanly-accessible service exposes
 *       "earnings in the next N days" for an arbitrary ticker universe.
 *       nexus-earnings-cache.ts only covers the fixed NEXUS_COMPANIES list
 *       and looks *backward* (already-reported earnings within 72h), and
 *       live-economic-calendar.ts / economic-calendar-fetcher.ts are macro
 *       calendars (FOMC/BLS/BEA/Census), not per-ticker earnings dates.
 *   (d) ["SPY","QQQ","IWM"] — last-resort fallback when everything else is empty.
 */

const TICKER_RE = /^[A-Z]{1,5}$/;
export const FALLBACK_TICKERS = ["SPY", "QQQ", "IWM"] as const;

const WHALE_LOOKBACK_DAYS = 3;
const NEWS_LOOKBACK_HOURS = 24;
const NEWS_MIN_IMPACT = 4;

function normalizeTicker(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const upper = raw.trim().toUpperCase();
  return TICKER_RE.test(upper) ? upper : null;
}

/**
 * Tickers from whale_alerts in the last `WHALE_LOOKBACK_DAYS` days, ranked by
 * aggregate premium (highest first). Ties/nulls are tolerated — a failed
 * query degrades to an empty list rather than throwing.
 */
async function getWhaleWeightedTickers(): Promise<string[]> {
  try {
    const sinceIso = new Date(
      Date.now() - WHALE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const rows = await db
      .select({
        ticker: whaleAlerts.ticker,
        premium: whaleAlerts.premium,
      })
      .from(whaleAlerts)
      .where(gte(whaleAlerts.detectedAt, sinceIso));

    const premiumByTicker = new Map<string, number>();
    for (const row of rows) {
      const ticker = normalizeTicker(row.ticker);
      if (!ticker) continue;
      const premium = typeof row.premium === "number" ? row.premium : 0;
      premiumByTicker.set(
        ticker,
        (premiumByTicker.get(ticker) ?? 0) + premium,
      );
    }

    return [...premiumByTicker.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([ticker]) => ticker);
  } catch (err) {
    console.warn("[ticker-universe] whale_alerts query failed:", err);
    return [];
  }
}

/**
 * Tickers mentioned in news_events over the last `NEWS_LOOKBACK_HOURS` hours
 * with impact_score >= NEWS_MIN_IMPACT. `tickers` is a JSON array column;
 * malformed JSON on a row is skipped rather than failing the whole query.
 */
async function getHighImpactNewsTickers(): Promise<string[]> {
  try {
    const sinceIso = new Date(
      Date.now() - NEWS_LOOKBACK_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const rows = await db
      .select({ tickers: newsEvents.tickers })
      .from(newsEvents)
      .where(
        and(
          gte(newsEvents.createdAt, sinceIso),
          gte(newsEvents.impactScore, NEWS_MIN_IMPACT),
        ),
      );

    const ordered: string[] = [];
    for (const row of rows) {
      if (!row.tickers) continue;
      try {
        const parsed = JSON.parse(row.tickers);
        if (Array.isArray(parsed)) {
          for (const t of parsed) ordered.push(t);
        }
      } catch {
        // Malformed JSON in this row — skip it, keep going.
        continue;
      }
    }
    return ordered;
  } catch (err) {
    console.warn("[ticker-universe] news_events query failed:", err);
    return [];
  }
}

export interface TickerUniverseOptions {
  /** Maximum number of tickers to return. Defaults to 25. */
  max?: number;
}

/**
 * Ranked ticker universe built from existing whale-alert and news-event data.
 * Never throws; falls back to a tiny static list only when every dynamic
 * source returns nothing.
 */
export async function getTickerUniverse(
  options: TickerUniverseOptions = {},
): Promise<string[]> {
  const max = options.max ?? 25;

  const [whaleTickers, newsTickers] = await Promise.all([
    getWhaleWeightedTickers(),
    getHighImpactNewsTickers(),
  ]);

  const seen = new Set<string>();
  const ranked: string[] = [];
  for (const raw of [...whaleTickers, ...newsTickers]) {
    const ticker = normalizeTicker(raw);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    ranked.push(ticker);
    if (ranked.length >= max) break;
  }

  if (ranked.length === 0) {
    console.warn(
      "[ticker-universe] No dynamic tickers found — falling back to static list",
    );
    return [...FALLBACK_TICKERS];
  }

  return ranked;
}
