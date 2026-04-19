import type { RawNewsArticle } from "@/types/news";

interface HackerNewsHit {
  author: string;
  created_at: string;
  num_comments?: number;
  points?: number;
  title?: string;
  url?: string;
}

interface HackerNewsResponse {
  hits?: HackerNewsHit[];
}

interface NewsApiArticle {
  source?: {
    id?: string | null;
    name?: string | null;
  };
  title?: string;
  description?: string;
  url?: string;
  publishedAt?: string;
}

interface NewsApiResponse {
  articles?: NewsApiArticle[];
}

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  sourcecountry: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [39.8283, -98.5795],
  GB: [55.3781, -3.436],
  DE: [51.1657, 10.4515],
  FR: [46.2276, 2.2137],
  CN: [35.8617, 104.1954],
  JP: [36.2048, 138.2529],
  IN: [20.5937, 78.9629],
  KR: [35.9078, 127.7669],
  TW: [23.6978, 120.9605],
  SG: [1.3521, 103.8198],
  NL: [52.1326, 5.2913],
  IE: [53.1424, -7.6921],
  IL: [31.0461, 34.8516],
  CA: [56.1304, -106.3468],
};

const COMPANY_GEO_HINTS: Array<{
  match: RegExp;
  countryCode: string;
  lat: number;
  lng: number;
}> = [
  {
    match: /\bapple\b|\biphone\b|\bmac\b/i,
    countryCode: "US",
    lat: 37.3349,
    lng: -122.009,
  },
  {
    match: /\bgoogle\b|\balphabet\b|\bandroid\b/i,
    countryCode: "US",
    lat: 37.422,
    lng: -122.0841,
  },
  {
    match: /\bmicrosoft\b|\bazure\b|\bopenai\b/i,
    countryCode: "US",
    lat: 47.6424,
    lng: -122.136,
  },
  {
    match: /\bmeta\b|\bfacebook\b|\binstagram\b/i,
    countryCode: "US",
    lat: 37.4847,
    lng: -122.1484,
  },
  { match: /\bnvidia\b/i, countryCode: "US", lat: 37.3688, lng: -121.9609 },
  {
    match: /\bamazon\b|\baws\b/i,
    countryCode: "US",
    lat: 47.6229,
    lng: -122.3367,
  },
  { match: /\btesla\b/i, countryCode: "US", lat: 30.2226, lng: -97.6186 },
  { match: /\btsmc\b/i, countryCode: "TW", lat: 24.8138, lng: 120.9675 },
  { match: /\bsamsung\b/i, countryCode: "KR", lat: 37.2636, lng: 127.0286 },
  { match: /\banthropic\b/i, countryCode: "US", lat: 37.7749, lng: -122.4194 },
  { match: /\bintel\b/i, countryCode: "US", lat: 37.3875, lng: -121.9636 },
  { match: /\bamd\b/i, countryCode: "US", lat: 37.3875, lng: -121.9636 },
  { match: /\bspotify\b/i, countryCode: "SE", lat: 59.3293, lng: 18.0686 },
];

function summarizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const causeCode =
    typeof error === "object" && error !== null && "cause" in error
      ? (error as { cause?: { code?: string } }).cause?.code
      : undefined;
  return causeCode ? `${message} (code: ${causeCode})` : message;
}

function parseGdeltDate(seendate: string): string {
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
    // Ignore parse failures and fall back.
  }
  return new Date().toISOString();
}

function gdeltCountryToCoords(countryCode: string): {
  lat?: number;
  lng?: number;
} {
  const code = countryCode.toUpperCase().slice(0, 2);
  const coords = COUNTRY_COORDS[code];
  return coords ? { lat: coords[0], lng: coords[1] } : {};
}

function inferGeoFromTechText(text: string): {
  countryCode?: string;
  lat?: number;
  lng?: number;
} {
  for (const hint of COMPANY_GEO_HINTS) {
    if (hint.match.test(text)) {
      return {
        countryCode: hint.countryCode,
        lat: hint.lat,
        lng: hint.lng,
      };
    }
  }

  return {
    countryCode: "US",
    lat: 37.7749,
    lng: -122.4194,
  };
}

export async function fetchHackerNewsTechStories(): Promise<RawNewsArticle[]> {
  try {
    const res = await fetch(
      "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30",
      { signal: AbortSignal.timeout(15000) },
    );

    if (!res.ok) {
      console.error(
        `[TechNews:HackerNews] HTTP ${res.status}: ${res.statusText}`,
      );
      return [];
    }

    const data: HackerNewsResponse = await res.json();
    const hits = Array.isArray(data.hits) ? data.hits : [];

    return hits
      .filter((hit) => hit.title && hit.url)
      .map((hit) => {
        const geo = inferGeoFromTechText(hit.title ?? "");
        return {
          headline: hit.title ?? "",
          source: "hackernews" as const,
          url: hit.url,
          publishedAt: hit.created_at ?? new Date().toISOString(),
          summary:
            hit.points != null || hit.num_comments != null
              ? `HN front page story with ${hit.points ?? 0} points and ${hit.num_comments ?? 0} comments.`
              : undefined,
          countryCode: geo.countryCode,
          lat: geo.lat,
          lng: geo.lng,
        };
      });
  } catch (error) {
    console.warn(
      `[TechNews:HackerNews] Fetch failed: ${summarizeError(error)}`,
    );
    return [];
  }
}

export async function fetchNewsApiTechNews(): Promise<RawNewsArticle[]> {
  const apiKey = process.env.NEWSAPI_API_KEY;
  if (!apiKey) {
    console.warn("[TechNews:NewsAPI] No API key configured, skipping");
    return [];
  }

  try {
    const res = await fetch(
      `https://newsapi.org/v2/top-headlines?category=technology&country=us&pageSize=50&apiKey=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(15000) },
    );

    if (!res.ok) {
      console.error(`[TechNews:NewsAPI] HTTP ${res.status}: ${res.statusText}`);
      return [];
    }

    const data: NewsApiResponse = await res.json();
    const articles = Array.isArray(data.articles) ? data.articles : [];

    return articles
      .filter((article) => article.title && article.url)
      .map((article) => {
        const text = `${article.title ?? ""} ${article.description ?? ""}`;
        const geo = inferGeoFromTechText(text);
        return {
          headline: article.title ?? "",
          source: "newsapi" as const,
          url: article.url,
          publishedAt: article.publishedAt ?? new Date().toISOString(),
          summary: article.description ?? undefined,
          countryCode: geo.countryCode,
          lat: geo.lat,
          lng: geo.lng,
        };
      });
  } catch (error) {
    console.warn(`[TechNews:NewsAPI] Fetch failed: ${summarizeError(error)}`);
    return [];
  }
}

// GDELT free API has a strict rate limit — only poll once every 15 minutes.
let gdeltLastFetchAt = 0;
const GDELT_MIN_INTERVAL_MS = 15 * 60 * 1000;

export async function fetchGdeltTechEvents(): Promise<RawNewsArticle[]> {
  const now = Date.now();
  if (now - gdeltLastFetchAt < GDELT_MIN_INTERVAL_MS) {
    const waitSec = Math.ceil((GDELT_MIN_INTERVAL_MS - (now - gdeltLastFetchAt)) / 1000);
    console.log(`[TechNews:GDELT] Skipping — rate-limit cooldown (${waitSec}s remaining)`);
    return [];
  }

  const query = encodeURIComponent(
    '"artificial intelligence" OR semiconductor OR cybersecurity OR "cloud computing" OR Apple OR Google OR Microsoft OR NVIDIA OR Tesla OR AWS OR "chip shortage" OR "data breach" OR "AI regulation" OR "open source"',
  );
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=artlist&format=json&maxrecords=50&timespan=30min&sourcelang=english`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) {
        // Don't reset the timer — back off for an extra 15 min on top of current cooldown
        gdeltLastFetchAt = Date.now();
        console.warn("[TechNews:GDELT] Rate-limited (429); backing off 15 min");
        return [];
      }
      if (text.includes("<html") || text.includes("<!DOCTYPE")) {
        console.warn("[TechNews:GDELT] Received HTML error page, skipping");
        return [];
      }
      console.error(`[TechNews:GDELT] HTTP ${res.status}`);
      return [];
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      console.warn("[TechNews:GDELT] Non-JSON response, skipping");
      return [];
    }

    const data: GdeltResponse = await res.json();
    const articles = Array.isArray(data.articles) ? data.articles : [];

    // Stamp success time only after a valid response
    gdeltLastFetchAt = Date.now();

    return articles.map((article) => {
      const countryCode =
        article.sourcecountry?.toUpperCase().slice(0, 2) || "US";
      const coords = gdeltCountryToCoords(countryCode);
      return {
        headline: article.title,
        source: "gdelt" as const,
        url: article.url,
        publishedAt: parseGdeltDate(article.seendate),
        countryCode,
        lat: coords.lat,
        lng: coords.lng,
      };
    });
  } catch (error) {
    console.warn(`[TechNews:GDELT] Fetch failed: ${summarizeError(error)}`);
    return [];
  }
}

export async function fetchAllTechNews(): Promise<RawNewsArticle[]> {
  const results = await Promise.allSettled([
    fetchHackerNewsTechStories(),
    fetchNewsApiTechNews(),
    fetchGdeltTechEvents(),
  ]);

  const articles: RawNewsArticle[] = [];
  const sourceNames = ["HackerNews", "NewsAPI", "GDELT"];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      console.log(
        `[TechNews] ${sourceNames[index]}: ${result.value.length} articles`,
      );
      articles.push(...result.value);
    } else {
      console.warn(
        `[TechNews] ${sourceNames[index]} failed: ${summarizeError(result.reason)}`,
      );
    }
  });

  const seen = new Set<string>();
  return articles.filter((article) => {
    if (!article.url) return true;
    if (seen.has(article.url)) return false;
    seen.add(article.url);
    return true;
  });
}
