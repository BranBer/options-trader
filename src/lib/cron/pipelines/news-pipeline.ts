import { fetchAllNews } from "@/lib/services/news-fetcher";
import { classifyNews } from "@/lib/services/llm-analyzer";
import { db } from "@/lib/db/client";
import { newsEvents } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { autoTriggerEventAnalysis } from "@/lib/services/event-ticker-analyzer";
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

  // Dedup: skip articles whose URL already exists in the DB
  const urls = rawArticles.map((a) => a.url).filter((u): u is string => !!u);
  const existingRows =
    urls.length > 0
      ? await db
          .select({ url: newsEvents.url })
          .from(newsEvents)
          .where(inArray(newsEvents.url, urls))
      : [];
  const existingUrls = new Set(existingRows.map((r) => r.url));
  const newArticles = rawArticles.filter(
    (a) => !a.url || !existingUrls.has(a.url),
  );

  if (newArticles.length < rawArticles.length) {
    console.log(
      `[NewsPipeline] Dedup: ${rawArticles.length} fetched → ${newArticles.length} new (${rawArticles.length - newArticles.length} already classified)`,
    );
  }

  if (newArticles.length === 0) {
    console.log(
      "[NewsPipeline] All articles already classified, skipping LLM call",
    );
    return 0;
  }

  // Classify with LLM (only new articles)
  const classification = await classifyNews(newArticles, onBatchProgress);
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
    const original = newArticles.find(
      (raw) => raw.headline === row.headline || raw.url === row.url,
    );
    if (original?.lat != null && original?.lng != null) {
      row.lat = original.lat;
      row.lng = original.lng;
    }
  }

  let stored = 0;
  const insertedEvents = [];
  for (const row of rows) {
    try {
      await db.insert(newsEvents).values(row);
      stored++;

      const [inserted] = await db
        .select()
        .from(newsEvents)
        .where(
          row.url
            ? eq(newsEvents.url, row.url)
            : eq(newsEvents.headline, row.headline),
        )
        .orderBy(desc(newsEvents.id))
        .limit(1);
      if (inserted) {
        insertedEvents.push(inserted);
      }
    } catch (error) {
      console.warn(`[NewsPipeline] Failed to insert: ${row.headline}`, error);
    }
  }

  if (insertedEvents.length > 0) {
    try {
      const triggered = await autoTriggerEventAnalysis(insertedEvents);
      if (triggered > 0) {
        console.log(
          `[NewsPipeline] Auto-triggered event-ticker analysis for ${triggered} event(s)`,
        );
      }
    } catch (error) {
      console.warn("[NewsPipeline] Event auto-trigger failed", error);
    }
  }

  console.log(
    `[NewsPipeline] Classified & stored: ${rawArticles.length} fetched → ${newArticles.length} new → ${classification.articles.length} classified → ${stored} stored`,
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
