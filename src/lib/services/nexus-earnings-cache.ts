import { NEXUS_COMPANIES } from "@/lib/data/nexus-companies";
import {
  fetchEarningsDate,
  fetchEpsSurprise,
} from "@/lib/services/market-fetcher";
import type { NexusEarnings } from "@/lib/utils/cascade-detector";

const CASCADE_WINDOW_HOURS = 72;
const FETCH_CONCURRENCY = 3;

let cache: {
  data: Map<string, NexusEarnings>;
  refreshedAt: string;
} | null = null;
let refreshPromise: Promise<Map<string, NexusEarnings>> | null = null;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= items.length) {
          return;
        }
        results[currentIndex] = await worker(items[currentIndex]);
      }
    },
  );

  await Promise.all(workers);
  return results;
}

async function fetchRecentNexusEarnings(ticker: string): Promise<{
  ticker: string;
  earnings: NexusEarnings | null;
}> {
  try {
    const earningsDate = await fetchEarningsDate(ticker);
    if (!earningsDate) {
      return { ticker, earnings: null };
    }

    const reportedAtMs = new Date(earningsDate).getTime();
    const hoursSince = (Date.now() - reportedAtMs) / (1000 * 60 * 60);
    if (hoursSince < 0 || hoursSince > CASCADE_WINDOW_HOURS) {
      return { ticker, earnings: null };
    }

    const epsData = await fetchEpsSurprise(ticker).catch(() => null);
    return {
      ticker,
      earnings: {
        reportedAt: earningsDate,
        epsSurprisePct: epsData?.epsSurprisePct ?? 0,
      },
    };
  } catch {
    return { ticker, earnings: null };
  }
}

export async function refreshNexusEarnings(): Promise<
  Map<string, NexusEarnings>
> {
  if (refreshPromise) {
    return refreshPromise.then((data) => new Map(data));
  }

  refreshPromise = (async () => {
    const results = await mapWithConcurrency(
      NEXUS_COMPANIES,
      FETCH_CONCURRENCY,
      async (nexus) => fetchRecentNexusEarnings(nexus.ticker),
    );

    const data = new Map<string, NexusEarnings>();
    for (const result of results) {
      if (result.earnings) {
        data.set(result.ticker, result.earnings);
      }
    }

    cache = {
      data,
      refreshedAt: new Date().toISOString(),
    };

    console.log(
      `[NexusEarningsCache] Refreshed ${data.size} recent nexus earnings entries`,
    );

    return new Map(data);
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export function getCachedNexusEarnings(): Map<string, NexusEarnings> {
  return new Map(cache?.data ?? []);
}

export function getNexusEarningsAge(): number {
  if (!cache) {
    return Number.POSITIVE_INFINITY;
  }

  return Date.now() - Date.parse(cache.refreshedAt);
}
