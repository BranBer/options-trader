import { fetchAllNews } from "@/lib/services/news-fetcher";
import { classifyNews } from "@/lib/services/gemini-analyzer";
import { db } from "@/lib/db/client";
import { newsEvents } from "@/lib/db/schema";
import type { RawNewsArticle } from "@/types/news";

/**
 * Classify raw articles and store in DB.
 * Separated from fetching for progress tracking.
 */
export async function classifyAndStoreNews(
  rawArticles: RawNewsArticle[],
  onBatchProgress?: (done: number, total: number) => void,
): Promise<number> {
  if (rawArticles.length === 0) {
    console.log("[NewsPipeline] No articles to classify");
    return 0;
  }

  // Classify with Gemini
  const classification = await classifyNews(rawArticles, onBatchProgress);
  if (classification.articles.length === 0) {
    console.log("[NewsPipeline] No market-relevant articles found");
    return 0;
  }

  // Store classified articles in DB
  const rows = classification.articles.map((article) => ({
    headline: article.original_headline,
    source: article.source,
    url: article.url ?? null,
    publishedAt: article.published_at,
    countryCode: article.country_code,
    lat: null as number | null,
    lng: null as number | null,
    impactScore: article.impact_score,
    sentiment: article.market_sentiment,
    sectors: JSON.stringify(article.affected_sectors),
    tickers: JSON.stringify(article.affected_tickers),
    eventType: article.event_type,
    rawSummary: article.one_line_summary,
    geminiAnalysis: JSON.stringify({
      reasoning: article.reasoning,
      region: article.region,
    }),
  }));

  // Enrich lat/lng from original raw articles where available
  for (const row of rows) {
    const original = rawArticles.find(
      (raw) => raw.headline === row.headline || raw.url === row.url
    );
    if (original?.lat != null && original?.lng != null) {
      row.lat = original.lat;
      row.lng = original.lng;
    }
  }

  let stored = 0;
  for (const row of rows) {
    try {
      await db.insert(newsEvents).values(row);
      stored++;
    } catch (error) {
      console.warn(`[NewsPipeline] Failed to insert: ${row.headline}`, error);
    }
  }

  console.log(
    `[NewsPipeline] Classified & stored: ${rawArticles.length} fetched → ${classification.articles.length} classified → ${stored} stored`
  );
  return stored;
}

/**
 * News Pipeline: Fetch → Classify (Gemini) → Store
 * Returns count of new events stored.
 */
export async function runNewsPipeline(): Promise<number> {
  console.log("[NewsPipeline] Starting...");
  const rawArticles = await fetchAllNews();
  return classifyAndStoreNews(rawArticles);
}
