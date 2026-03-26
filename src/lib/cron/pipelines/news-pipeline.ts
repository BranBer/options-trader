import { fetchAllNews } from "@/lib/services/news-fetcher";
import { classifyNews } from "@/lib/services/gemini-analyzer";
import { db } from "@/lib/db/client";
import { newsEvents } from "@/lib/db/schema";

/**
 * News Pipeline: Fetch → Classify (Gemini) → Store
 * Returns count of new events stored.
 */
export async function runNewsPipeline(): Promise<number> {
  console.log("[NewsPipeline] Starting...");

  // Step 1: Fetch from all sources in parallel
  const rawArticles = await fetchAllNews();
  if (rawArticles.length === 0) {
    console.log("[NewsPipeline] No articles fetched, skipping classification");
    return 0;
  }

  // Step 2: Classify with Gemini
  const classification = await classifyNews(rawArticles);
  if (classification.articles.length === 0) {
    console.log("[NewsPipeline] No market-relevant articles found");
    return 0;
  }

  // Step 3: Store classified articles in DB
  const rows = classification.articles.map((article) => ({
    headline: article.original_headline,
    source: article.source,
    url: article.url ?? null,
    publishedAt: article.published_at,
    countryCode: article.country_code,
    lat: null as number | null, // Will be enriched from GDELT data or geocoding
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

  // Enrich lat/lng from original raw articles where available (GDELT provides these)
  for (const row of rows) {
    const original = rawArticles.find(
      (raw) => raw.headline === row.headline || raw.url === row.url
    );
    if (original?.lat != null && original?.lng != null) {
      row.lat = original.lat;
      row.lng = original.lng;
    }
  }

  // Batch insert
  let stored = 0;
  for (const row of rows) {
    try {
      await db.insert(newsEvents).values(row);
      stored++;
    } catch (error) {
      // Skip duplicates or other insert errors
      console.warn(`[NewsPipeline] Failed to insert: ${row.headline}`, error);
    }
  }

  console.log(
    `[NewsPipeline] Complete: ${rawArticles.length} fetched → ${classification.articles.length} classified → ${stored} stored`
  );
  return stored;
}
