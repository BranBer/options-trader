import type { RawNewsArticle } from "@/types/news";

// ============================================================
// Story 1.1 — Finnhub News Fetcher
// ============================================================

interface FinnhubNewsItem {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
}

export async function fetchFinnhubNews(): Promise<RawNewsArticle[]> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    console.warn("[Finnhub] No API key configured, skipping");
    return [];
  }

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/news?category=general&token=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(15000) },
    );

    if (!res.ok) {
      console.error(`[Finnhub] HTTP ${res.status}: ${res.statusText}`);
      return [];
    }

    const data: FinnhubNewsItem[] = await res.json();

    return data.map((item) => ({
      headline: item.headline,
      source: "finnhub" as const,
      url: item.url,
      publishedAt: new Date(item.datetime * 1000).toISOString(),
      summary: item.summary || undefined,
      preTags: item.related
        ? {
            tickers: item.related
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
          }
        : undefined,
    }));
  } catch (error) {
    console.error("[Finnhub] Fetch failed:", error);
    return [];
  }
}

// ============================================================
// Story 1.2 — GDELT Event Fetcher
// ============================================================

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  socialimage: string;
  domain: string;
  language: string;
  sourcecountry: string;
  tone: string; // comma-separated tone values
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

function summarizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const causeCode =
    typeof error === "object" && error !== null && "cause" in error
      ? (error as { cause?: { code?: string } }).cause?.code
      : undefined;
  return causeCode ? `${message} (code: ${causeCode})` : message;
}

// Static lookup: GDELT country codes → approximate center lat/lng
const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [39.8283, -98.5795],
  GB: [55.3781, -3.436],
  DE: [51.1657, 10.4515],
  FR: [46.2276, 2.2137],
  CN: [35.8617, 104.1954],
  JP: [36.2048, 138.2529],
  IN: [20.5937, 78.9629],
  RU: [61.524, 105.3188],
  BR: [-14.235, -51.9253],
  AU: [-25.2744, 133.7751],
  CA: [56.1304, -106.3468],
  SA: [23.8859, 45.0792],
  KR: [35.9078, 127.7669],
  TW: [23.6978, 120.9605],
  IL: [31.0461, 34.8516],
  UA: [48.3794, 31.1656],
  IR: [32.4279, 53.688],
  MX: [23.6345, -102.5528],
  ZA: [-30.5595, 22.9375],
  NG: [9.082, 8.6753],
  SG: [1.3521, 103.8198],
  CH: [46.8182, 8.2275],
  SE: [60.1282, 18.6435],
  NO: [60.472, 8.4689],
};

function gdeltCountryToCoords(countryCode: string): {
  lat?: number;
  lng?: number;
} {
  const code = countryCode?.toUpperCase().slice(0, 2);
  const coords = COUNTRY_COORDS[code];
  return coords ? { lat: coords[0], lng: coords[1] } : {};
}

export async function fetchGdeltEvents(): Promise<RawNewsArticle[]> {
  const query = encodeURIComponent(
    "market OR economy OR crisis OR war OR tariff OR sanctions OR trade deal",
  );
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&format=json&maxrecords=50&timespan=30min&sourcelang=english`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });

    if (!res.ok) {
      // GDELT sometimes returns HTML on errors
      const text = await res.text();
      if (text.includes("<html") || text.includes("<!DOCTYPE")) {
        console.warn("[GDELT] Received HTML error page, skipping");
        return [];
      }
      console.error(`[GDELT] HTTP ${res.status}`);
      return [];
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      console.warn("[GDELT] Non-JSON response, skipping");
      return [];
    }

    const data: GdeltResponse = await res.json();
    if (!data.articles || !Array.isArray(data.articles)) {
      return [];
    }

    return data.articles.map((article) => {
      const countryCode = article.sourcecountry?.toUpperCase().slice(0, 2);
      const coords = gdeltCountryToCoords(countryCode);

      return {
        headline: article.title,
        source: "gdelt" as const,
        url: article.url,
        publishedAt: parseGdeltDate(article.seendate),
        countryCode: countryCode || undefined,
        lat: coords.lat,
        lng: coords.lng,
      };
    });
  } catch (error) {
    console.warn(`[GDELT] Fetch failed: ${summarizeError(error)}`);
    return [];
  }
}

function parseGdeltDate(seendate: string): string {
  // GDELT dates: "20260326T120000Z" or similar
  try {
    if (seendate && seendate.length >= 8) {
      const year = seendate.slice(0, 4);
      const month = seendate.slice(4, 6);
      const day = seendate.slice(6, 8);
      const hour = seendate.slice(9, 11) || "00";
      const min = seendate.slice(11, 13) || "00";
      const sec = seendate.slice(13, 15) || "00";
      return new Date(
        `${year}-${month}-${day}T${hour}:${min}:${sec}Z`,
      ).toISOString();
    }
  } catch {
    // fall through
  }
  return new Date().toISOString();
}

// ============================================================
// Story 1.3 — Marketaux News Fetcher
// ============================================================

interface MarketauxArticle {
  uuid: string;
  title: string;
  description: string;
  url: string;
  image_url: string;
  published_at: string;
  source: string;
  entities: Array<{
    symbol: string;
    name: string;
    type: string; // "equity", "index", etc.
    industry: string;
    country: string;
    sentiment_score: number;
  }>;
}

interface MarketauxResponse {
  data?: MarketauxArticle[];
}

export async function fetchMarketauxNews(): Promise<RawNewsArticle[]> {
  const apiKey = process.env.MARKETAUX_API_KEY;
  if (!apiKey) {
    console.warn("[Marketaux] No API key configured, skipping");
    return [];
  }

  try {
    const res = await fetch(
      `https://api.marketaux.com/v1/news/all?filter_entities=true&language=en&api_token=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(15000) },
    );

    if (!res.ok) {
      console.error(`[Marketaux] HTTP ${res.status}: ${res.statusText}`);
      return [];
    }

    const data: MarketauxResponse = await res.json();
    if (!data.data || !Array.isArray(data.data)) {
      return [];
    }

    return data.data.map((article) => {
      const tickers = article.entities
        ?.filter((e) => e.type === "equity")
        .map((e) => e.symbol)
        .filter(Boolean);

      const industries = article.entities
        ?.map((e) => e.industry)
        .filter(Boolean);

      // Dedupe
      const uniqueTickers = [...new Set(tickers)];
      const uniqueSectors = [...new Set(industries)];

      return {
        headline: article.title,
        source: "marketaux" as const,
        url: article.url,
        publishedAt: article.published_at
          ? new Date(article.published_at).toISOString()
          : new Date().toISOString(),
        summary: article.description || undefined,
        preTags:
          uniqueTickers.length || uniqueSectors.length
            ? {
                tickers: uniqueTickers.length ? uniqueTickers : undefined,
                sectors: uniqueSectors.length ? uniqueSectors : undefined,
              }
            : undefined,
      };
    });
  } catch (error) {
    console.error("[Marketaux] Fetch failed:", error);
    return [];
  }
}

// ============================================================
// Aggregator — fetch all sources in parallel
// ============================================================

export async function fetchAllNews(): Promise<RawNewsArticle[]> {
  const results = await Promise.allSettled([
    fetchFinnhubNews(),
    fetchGdeltEvents(),
    fetchMarketauxNews(),
  ]);

  const articles: RawNewsArticle[] = [];
  const sourceNames = ["Finnhub", "GDELT", "Marketaux"];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      console.log(`[News] ${sourceNames[i]}: ${result.value.length} articles`);
      articles.push(...result.value);
    } else {
      console.warn(
        `[News] ${sourceNames[i]} failed: ${summarizeError(result.reason)}`,
      );
    }
  });

  // Deduplicate by URL
  const seen = new Set<string>();
  const deduped = articles.filter((a) => {
    if (!a.url) return true; // keep articles without URLs
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  console.log(
    `[News] Total: ${articles.length} fetched, ${deduped.length} after dedup`,
  );
  return deduped;
}
