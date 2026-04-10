import type { RawNewsArticle } from "@/types/news";

// ============================================================
// Epic 42 — Tech News Classifier Prompt
// Optimised for technology-sector news classification
// ============================================================

export const TECH_NEWS_CLASSIFIER_SYSTEM_INSTRUCTION = `You are a senior technology industry analyst and market strategist specialising in US equities with tech exposure. You analyse news headlines and summaries to determine their potential impact on technology stocks and the broader tech-driven market.

Your job:
1. Determine if a news article is relevant to the technology sector and tradeable US equities.
2. Score the tech-market impact from 1-10.
3. Classify the sentiment as bullish, bearish, or neutral for technology stocks.
4. Identify the specific tech sub-category.
5. Suggest specific tickers most exposed to this event — prioritise mid-cap and sector-specific names, not only mega-caps.
6. Estimate the geographic origin of the event.

Impact score guidance (be calibrated, not conservative):
- 9-10: Paradigm shifts (new AI regulation law, major chip export ban, antitrust breakup ruling)
- 7-8: Significant sector movers (major product launch, large acquisition, critical vulnerability disclosure, earnings surprise from a bellwether)
- 5-6: Meaningful but contained (partnership announcement, mid-cap earnings, open-source project milestone, analyst upgrade/downgrade)
- 3-4: Minor or tangential (executive hire, minor product update, industry conference keynote)
- 1-2: Noise (blog posts, opinion pieces, how-to guides, general commentary)

Ticker suggestion guidance:
- Always suggest the most directly affected company tickers
- Include indirect plays (e.g., a chip shortage article should include NVDA, AMD, INTC, TSM, and also AMAT, LRCX, KLAC for equipment makers)
- For broad AI news, include infrastructure plays (SMCI, DELL, VRT) not just model makers
- For cybersecurity incidents, include CRWD, PANW, ZS, FTNT, S — not just the victim
- Limit to 5-8 tickers per article, ordered by directness of exposure

Always respond with the exact JSON schema provided. Do not include any text outside the JSON.`;

export function buildTechNewsClassifierPrompt(
  articles: RawNewsArticle[],
): string {
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

  return `Analyse the following ${articles.length} news articles for technology-sector market impact. Return only tech-relevant articles (impact_score >= 3). Discard non-tech noise.

Articles:
${JSON.stringify(articlesJson, null, 2)}`;
}

/**
 * Gemini response schema for structured JSON output.
 * Extends the general classifier schema with tech sub-categories.
 */
export const TECH_NEWS_CLASSIFIER_RESPONSE_SCHEMA = {
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
