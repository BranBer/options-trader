import { fetchAllNews } from "@/lib/services/news-fetcher";
import {
  classifyNews,
  type ClassifyNewsConfig,
} from "@/lib/services/llm-analyzer";
import { db } from "@/lib/db/client";
import { newsEvents } from "@/lib/db/schema";
import { desc, inArray, or } from "drizzle-orm";
import { autoTriggerEventAnalysis } from "@/lib/services/event-ticker-analyzer";
import type { RawNewsArticle } from "@/types/news";
import { fetchAllTechNews } from "@/lib/services/tech-news-fetcher";
import {
  TECH_NEWS_CLASSIFIER_RESPONSE_SCHEMA,
  TECH_NEWS_CLASSIFIER_SYSTEM_INSTRUCTION,
  buildTechNewsClassifierPrompt,
} from "@/lib/prompts/tech-news-classifier";
import {
  getJudgedContextRefs,
  judgeNewsForTicker,
} from "@/lib/services/jev-judgments";

// Story S4 — cap Jev work per cycle so it never noticeably slows the pipeline.
const JEV_MAX_PAIRS_PER_CYCLE = 15;
const JEV_MIN_IMPACT_SCORE = 4;

interface ClassifyAndStoreNewsOptions {
  category?: "general" | "tech";
  classifierConfig?: ClassifyNewsConfig;
  autoTriggerMinImpact?: number;
}

async function getInsertedNewsEvents(
  rows: Array<{ headline: string; url: string | null }>,
) {
  const urls = rows.map((row) => row.url).filter((url): url is string => !!url);
  const headlines = rows.filter((row) => !row.url).map((row) => row.headline);

  if (urls.length > 0 && headlines.length > 0) {
    return db
      .select()
      .from(newsEvents)
      .where(
        or(
          inArray(newsEvents.url, urls),
          inArray(newsEvents.headline, headlines),
        ),
      )
      .orderBy(desc(newsEvents.id));
  }

  if (urls.length > 0) {
    return db
      .select()
      .from(newsEvents)
      .where(inArray(newsEvents.url, urls))
      .orderBy(desc(newsEvents.id));
  }

  if (headlines.length > 0) {
    return db
      .select()
      .from(newsEvents)
      .where(inArray(newsEvents.headline, headlines))
      .orderBy(desc(newsEvents.id));
  }

  return [];
}

/**
 * Story S4 — judge up to JEV_MAX_PAIRS_PER_CYCLE (news row, ticker) pairs
 * per cycle: rows with impact_score >= JEV_MIN_IMPACT_SCORE and a non-empty
 * tickers array, skipping pairs already judged (same context_ref+ticker).
 */
async function judgeInsertedNewsForJev(
  insertedEvents: Awaited<ReturnType<typeof getInsertedNewsEvents>>,
): Promise<number> {
  const candidates: Array<{
    row: (typeof insertedEvents)[number];
    ticker: string;
  }> = [];

  for (const row of insertedEvents) {
    if ((row.impactScore ?? 0) < JEV_MIN_IMPACT_SCORE) continue;

    let tickers: unknown;
    try {
      tickers = JSON.parse(row.tickers ?? "[]");
    } catch {
      continue;
    }
    if (!Array.isArray(tickers) || tickers.length === 0) continue;

    for (const ticker of tickers) {
      if (typeof ticker === "string" && ticker.trim()) {
        candidates.push({ row, ticker: ticker.trim().toUpperCase() });
      }
    }
  }

  if (candidates.length === 0) return 0;

  const judgedPairs = await getJudgedContextRefs(
    "news",
    candidates.map((c) => String(c.row.id)),
  );

  let judged = 0;
  for (const candidate of candidates) {
    if (judged >= JEV_MAX_PAIRS_PER_CYCLE) break;
    const key = `${candidate.row.id}:${candidate.ticker}`;
    if (judgedPairs.has(key)) continue;

    const count = await judgeNewsForTicker(
      {
        id: candidate.row.id,
        headline: candidate.row.headline,
        rawSummary: candidate.row.rawSummary,
        source: candidate.row.source,
        publishedAt: candidate.row.publishedAt,
      },
      candidate.ticker,
    );
    if (count > 0) judged++;
  }

  return judged;
}

/**
 * Classify raw articles and store in DB.
 * Separated from fetching for progress tracking.
 */
export async function classifyAndStoreNews(
  rawArticles: RawNewsArticle[],
  onBatchProgress?: (done: number, total: number) => void,
  options?: ClassifyAndStoreNewsOptions,
): Promise<number> {
  const category = options?.category ?? "general";

  if (rawArticles.length === 0) {
    console.log(`[NewsPipeline:${category}] No articles to classify`);
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
      `[NewsPipeline:${category}] Dedup: ${rawArticles.length} fetched → ${newArticles.length} new (${rawArticles.length - newArticles.length} already classified)`,
    );
  }

  if (newArticles.length === 0) {
    console.log(
      `[NewsPipeline:${category}] All articles already classified, skipping LLM call`,
    );
    return 0;
  }

  // Classify with LLM (only new articles)
  const classification = await classifyNews(
    newArticles,
    onBatchProgress,
    options?.classifierConfig,
  );
  if (classification.articles.length === 0) {
    console.log(`[NewsPipeline:${category}] No market-relevant articles found`);
    return 0;
  }

  // Store classified articles in DB
  const rows = classification.articles.map((article) => ({
    headline: article.original_headline,
    category,
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
  let insertedEvents: Awaited<ReturnType<typeof getInsertedNewsEvents>> = [];
  try {
    await db.insert(newsEvents).values(rows);
    stored = rows.length;
    insertedEvents = await getInsertedNewsEvents(rows);
  } catch (error) {
    console.warn(
      `[NewsPipeline:${category}] Batch insert failed for ${rows.length} article(s)`,
      error,
    );
  }

  if (insertedEvents.length > 0) {
    try {
      const triggered = await autoTriggerEventAnalysis(insertedEvents, {
        minImpact: options?.autoTriggerMinImpact ?? 8,
      });
      if (triggered > 0) {
        console.log(
          `[NewsPipeline:${category}] Auto-triggered event-ticker analysis for ${triggered} event(s)`,
        );
      }
    } catch (error) {
      console.warn(
        `[NewsPipeline:${category}] Event auto-trigger failed`,
        error,
      );
    }

    try {
      const judged = await judgeInsertedNewsForJev(insertedEvents);
      if (judged > 0) {
        console.log(
          `[NewsPipeline:${category}] Jev judged ${judged} (news, ticker) pair(s)`,
        );
      }
    } catch (error) {
      console.warn(
        `[NewsPipeline:${category}] Jev judging failed (non-critical)`,
        error,
      );
    }
  }

  console.log(
    `[NewsPipeline:${category}] Classified & stored: ${rawArticles.length} fetched → ${newArticles.length} new → ${classification.articles.length} classified → ${stored} stored`,
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

export async function runTechNewsPipeline(): Promise<number> {
  console.log("[TechNewsPipeline] Starting...");
  const rawArticles = await fetchAllTechNews();
  return classifyAndStoreNews(rawArticles, undefined, {
    category: "tech",
    autoTriggerMinImpact: 7,
    classifierConfig: {
      systemInstruction: TECH_NEWS_CLASSIFIER_SYSTEM_INSTRUCTION,
      responseSchema: TECH_NEWS_CLASSIFIER_RESPONSE_SCHEMA,
      promptBuilder: buildTechNewsClassifierPrompt,
      minImpact: 3,
    },
  });
}
