import { z } from "zod";

// ApeWisdom counts Reddit mentions (r/wallstreetbets and other stock subs), keyless and free, but the API only
// serves the current snapshot with a 24h-ago delta — any history has to come from our own daily snapshots.
const APEWISDOM_URL = "https://apewisdom.io/api/v1.0/filter/all-stocks/page/";

const rowSchema = z
  .object({
    rank: z.coerce.number(),
    ticker: z.string(),
    mentions: z.coerce.number(),
    upvotes: z.coerce.number().nullish(),
    rank_24h_ago: z.coerce.number().nullish(),
    mentions_24h_ago: z.coerce.number().nullish(),
  })
  .passthrough();

export interface HypeRow {
  ticker: string;
  rank: number;
  mentions: number;
  mentions24hAgo: number | null;
  rank24hAgo: number | null;
  upvotes: number | null;
}

/** Top Reddit-mentioned stocks right now. Never throws; returns what it could read. */
export async function fetchRedditHype(pages = 2): Promise<HypeRow[]> {
  const rows: HypeRow[] = [];
  for (let page = 1; page <= pages; page++) {
    try {
      const res = await fetch(`${APEWISDOM_URL}${page}`, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) break;
      const json = await res.json();
      for (const raw of Array.isArray(json?.results) ? json.results : []) {
        const parsed = rowSchema.safeParse(raw);
        // Only symbols and counts are kept: names arrive HTML-escaped and are third-party text.
        if (!parsed.success || !/^[A-Z]{1,5}$/.test(parsed.data.ticker)) continue;
        const r = parsed.data;
        rows.push({
          ticker: r.ticker,
          rank: r.rank,
          mentions: r.mentions,
          mentions24hAgo: r.mentions_24h_ago ?? null,
          rank24hAgo: r.rank_24h_ago ?? null,
          upvotes: r.upvotes ?? null,
        });
      }
    } catch (err) {
      console.warn("[hype-fetcher] ApeWisdom page", page, "failed:", err instanceof Error ? err.message : err);
      break;
    }
  }
  return rows;
}
