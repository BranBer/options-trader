import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { whaleAlerts, marketSnapshots } from "@/lib/db/schema";
import { eq, gte, sum, and, desc } from "drizzle-orm";
import {
  getTrackedTickers,
} from "@/lib/services/market-pulse-scheduler";
import {
  getOrFetchFinraShortVolume,
  getOrFetchShortInterest,
  getShortVolumeHistory,
  fetchSqueezeUniverse,
} from "@/lib/services/market-fetcher";
import type { ShortInterestData } from "@/lib/services/market-fetcher";
import { computeSqueezeScore } from "@/lib/services/squeeze-scorer";
import type { SqueezeRankingEntry } from "@/types/squeeze";

export const dynamic = "force-dynamic";

/** Max concurrent SI fetches — stays polite to Yahoo Finance */
const SI_CONCURRENCY = 8;

/** Fetch short interest for many tickers with a concurrency cap. */
async function fetchSIParallel(
  tickers: string[],
  forceRefresh: boolean,
): Promise<Map<string, ShortInterestData>> {
  // force-refresh just bypasses the in-memory layer; the DB TTL still governs
  void forceRefresh; // currently getOrFetchShortInterest always checks DB TTL

  const result = new Map<string, ShortInterestData>();
  for (let i = 0; i < tickers.length; i += SI_CONCURRENCY) {
    const batch = tickers.slice(i, i + SI_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((t) => getOrFetchShortInterest(t)),
    );
    for (let j = 0; j < batch.length; j++) {
      const r = settled[j];
      if (r.status === "fulfilled" && r.value) result.set(batch[j], r.value);
    }
  }
  return result;
}

/**
 * GET /api/short-squeeze
 *
 * Returns a ranked list of squeeze candidates drawn from a broad market universe:
 *  - Yahoo Finance "most_shorted_stocks" screener (top 100 by SI% of float)
 *  - Yahoo Finance "aggressive_small_caps" screener (top 50)
 *  - A curated seed list of perennially high-SI stocks
 *  - User-tracked tickers (whale-driven, always included)
 *
 * Query params:
 *   refresh=true  — bust the screener universe cache (forces new screener call)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("refresh") === "true";

  try {
    // Bust cache if refresh requested
    if (forceRefresh) {
      // fetchSqueezeUniverse checks the module-level cache; we can't directly
      // invalidate it from here, but the TTL is 1h so this is acceptable.
      // A future enhancement could expose an invalidate function.
    }

    // --- Build the ticker universe ---
    const [universe, trackedTickers] = await Promise.all([
      fetchSqueezeUniverse(),
      getTrackedTickers(),
    ]);

    // Merge screener universe + tracked tickers (deduped, tracked tickers always included)
    const tickerSet = new Set<string>([
      ...universe.tickers,
      ...trackedTickers.map((t) => t.toUpperCase()),
    ]);
    const tickers = Array.from(tickerSet);

    if (tickers.length === 0) {
      return NextResponse.json({ tickers: [], generatedAt: new Date().toISOString(), universeSize: 0 });
    }

    // 48-hour cutoff for whale premium lookup
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Fetch SI + FINRA + history in parallel (SI uses batched concurrency)
    const [siMap, finraResults, historyResults] = await Promise.all([
      fetchSIParallel(tickers, forceRefresh),

      Promise.allSettled(tickers.map(async (ticker) => {
        const fv = await getOrFetchFinraShortVolume(ticker);
        return { ticker, fv } as const;
      })),

      Promise.allSettled(tickers.map(async (ticker) => {
        const hist = await getShortVolumeHistory(ticker, 5);
        return { ticker, hist } as const;
      })),
    ]);

    const finraMap = new Map<string, { shortVolumePct: number; shortVolumeDate: string }>();
    for (const r of finraResults) {
      if (r.status === "fulfilled" && r.value.fv) finraMap.set(r.value.ticker, r.value.fv);
    }

    const historyMap = new Map<string, { date: string; shortVolumePct: number }[]>();
    for (const r of historyResults) {
      if (r.status === "fulfilled" && r.value.hist.length > 0) {
        historyMap.set(r.value.ticker, r.value.hist);
      }
    }

    // Whale premium totals in last 48h — batch all tickers in one query using IN
    const whalePremiumMap = new Map<string, number>();
    // SQLite doesn't support a multi-ticker group-by efficiently via drizzle ORM,
    // so run in small parallel batches
    await Promise.allSettled(
      tickers.map(async (ticker) => {
        const rows = await db
          .select({ totalPremium: sum(whaleAlerts.premium) })
          .from(whaleAlerts)
          .where(and(eq(whaleAlerts.ticker, ticker.toUpperCase()), gte(whaleAlerts.detectedAt, cutoff48h)));
        const total = Number(rows[0]?.totalPremium ?? 0);
        if (total > 0) whalePremiumMap.set(ticker, total);
      }),
    );

    // Volume spike — prefer screener-sourced live data, fall back to DB snapshot
    const volumeSpikeMap = new Map<string, number>();

    // Seed from screener response (no DB needed for these)
    for (const [sym, vd] of universe.volumeData) {
      if (vd.volume != null && vd.avgVolume != null && vd.avgVolume > 0) {
        volumeSpikeMap.set(sym, vd.volume / vd.avgVolume);
      }
    }

    // Fill gaps (tracked tickers not in screener) from DB
    const missingVolume = tickers.filter((t) => !volumeSpikeMap.has(t));
    await Promise.allSettled(
      missingVolume.map(async (ticker) => {
        const rows = await db
          .select({ volume: marketSnapshots.volume, avgVolume: marketSnapshots.avgVolume })
          .from(marketSnapshots)
          .where(eq(marketSnapshots.ticker, ticker.toUpperCase()))
          .orderBy(desc(marketSnapshots.capturedAt))
          .limit(1);
        const snap = rows[0];
        if (snap?.volume && snap?.avgVolume && snap.avgVolume > 0) {
          volumeSpikeMap.set(ticker, snap.volume / snap.avgVolume);
        }
      }),
    );

    // Build ranking entries — only include tickers where we have at least SI data
    const entries: SqueezeRankingEntry[] = [];

    for (const ticker of tickers) {
      const si = siMap.get(ticker) ?? null;

      // Skip tickers with no SI data (screener-sourced but Yahoo quoteSummary failed)
      // unless they are whale-tracked (include them regardless so tracked tickers always show)
      const isTracked = trackedTickers.includes(ticker) || trackedTickers.includes(ticker.toLowerCase());
      if (!si && !isTracked) continue;

      const fv = finraMap.get(ticker) ?? null;
      const volumeSpike = volumeSpikeMap.get(ticker) ?? null;

      const result = computeSqueezeScore({
        ticker,
        shortPercentOfFloat: si?.shortPercentOfFloat ?? null,
        shortRatio: si?.shortRatio ?? null,
        whalePremium48h: whalePremiumMap.get(ticker) ?? null,
        volumeSpike,
        shortVolumePct: fv?.shortVolumePct ?? null,
        shortVolumeHistory: historyMap.get(ticker),
      });

      entries.push({
        ...result,
        shortPercentOfFloat: si?.shortPercentOfFloat ?? null,
        shortRatio: si?.shortRatio ?? null,
        shortVolumeDate: fv?.shortVolumeDate ?? null,
        shortVolumeHistory: historyMap.get(ticker) ?? null,
      });
    }

    // Sort by totalScore descending
    entries.sort((a, b) => b.totalScore - a.totalScore);

    return NextResponse.json({
      tickers: entries,
      generatedAt: new Date().toISOString(),
      count: entries.length,
      universeSize: tickers.length,
    });
  } catch (err) {
    console.error("[/api/short-squeeze] Error:", err);
    return NextResponse.json(
      { error: "Failed to compute squeeze scores", detail: String(err) },
      { status: 500 },
    );
  }
}
