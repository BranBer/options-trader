import type { RawNewsArticle } from "@/types/news";

export const NEWS_CLASSIFIER_SYSTEM_INSTRUCTION = `You are a senior financial analyst and geopolitical risk assessor. You analyze news headlines and summaries to determine their potential impact on US equity and options markets.

Your job:
1. Determine if a news article is market-relevant (wars, crises, policy changes, trade deals, earnings surprises, regulatory actions, supply chain disruptions, natural disasters, technological breakthroughs, central bank decisions).
2. Score the potential market impact from 1-10.
3. Classify the sentiment as bullish, bearish, or neutral for the overall market.
4. Identify the GICS sectors most likely affected.
5. Suggest specific tickers most exposed to this event.
6. Estimate the geographic origin of the event.

Be conservative with impact scores. Reserve 8-10 for events that would move major indices (rate decisions, wars, major policy shifts). Most news is 1-4.

Always respond with the exact JSON schema provided. Do not include any text outside the JSON.`;

export function buildNewsClassifierPrompt(articles: RawNewsArticle[]): string {
  const articlesJson = articles.map((a) => ({
    headline: a.headline,
    source: a.source,
    url: a.url ?? "",
    published_at: a.publishedAt,
    summary: a.summary ?? "",
    country_code: a.countryCode ?? "",
    pre_tagged_tickers: a.preTags?.tickers ?? [],
    pre_tagged_sectors: a.preTags?.sectors ?? [],
  }));

  return `Analyze the following ${articles.length} news articles for market impact. Return only market-relevant articles (impact_score >= 3). Discard noise.

Articles:
${JSON.stringify(articlesJson, null, 2)}`;
}

/**
 * Gemini response schema for structured JSON output.
 * This is passed to generationConfig.responseSchema.
 */
export const NEWS_CLASSIFIER_RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    articles: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          original_headline: { type: "string" as const },
          source: { type: "string" as const },
          url: { type: "string" as const },
          published_at: { type: "string" as const },
          is_market_relevant: { type: "boolean" as const },
          impact_score: { type: "integer" as const },
          market_sentiment: {
            type: "string" as const,
            enum: ["bullish", "bearish", "neutral"],
          },
          affected_sectors: {
            type: "array" as const,
            items: { type: "string" as const },
          },
          affected_tickers: {
            type: "array" as const,
            items: { type: "string" as const },
          },
          event_type: {
            type: "string" as const,
            enum: [
              "geopolitical",
              "economic",
              "regulatory",
              "earnings",
              "supply_chain",
              "technology",
              "natural_disaster",
              "central_bank",
              "other",
              "ai_ml",
              "semiconductors",
              "cloud_saas",
              "cybersecurity",
              "fintech",
              "hardware",
              "open_source",
              "social_media",
              "regulatory_tech",
              "biotech_health_tech",
              "ev_cleantech",
              "other_tech",
            ],
          },
          country_code: { type: "string" as const },
          region: { type: "string" as const },
          one_line_summary: { type: "string" as const },
          reasoning: { type: "string" as const },
        },
        required: [
          "original_headline",
          "source",
          "published_at",
          "is_market_relevant",
          "impact_score",
          "market_sentiment",
          "affected_sectors",
          "affected_tickers",
          "event_type",
          "country_code",
          "region",
          "one_line_summary",
          "reasoning",
        ],
      },
    },
    processing_metadata: {
      type: "object" as const,
      properties: {
        total_input: { type: "integer" as const },
        total_relevant: { type: "integer" as const },
        total_discarded: { type: "integer" as const },
        processing_timestamp: { type: "string" as const },
      },
      required: [
        "total_input",
        "total_relevant",
        "total_discarded",
        "processing_timestamp",
      ],
    },
  },
  required: ["articles", "processing_metadata"],
};
