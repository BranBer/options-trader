import { z } from "zod";

// --- Raw article from any news source (pre-Gemini) ---
export const rawNewsArticleSchema = z.object({
  headline: z.string(),
  source: z.enum(["finnhub", "gdelt", "marketaux"]),
  url: z.string().url().optional(),
  publishedAt: z.string(),
  countryCode: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  summary: z.string().optional(),
  preTags: z
    .object({
      tickers: z.array(z.string()).optional(),
      sectors: z.array(z.string()).optional(),
    })
    .optional(),
});

export type RawNewsArticle = z.infer<typeof rawNewsArticleSchema>;

// --- Gemini classified article ---
export const classifiedArticleSchema = z.object({
  original_headline: z.string(),
  source: z.string(),
  url: z.string().optional(),
  published_at: z.string(),
  is_market_relevant: z.boolean(),
  impact_score: z.number().int().min(1).max(10),
  market_sentiment: z.enum(["bullish", "bearish", "neutral"]),
  affected_sectors: z.array(z.string()),
  affected_tickers: z.array(z.string()),
  event_type: z.enum([
    "geopolitical",
    "economic",
    "regulatory",
    "earnings",
    "supply_chain",
    "technology",
    "natural_disaster",
    "central_bank",
    "other",
  ]),
  country_code: z.string(),
  region: z.string(),
  one_line_summary: z.string(),
  reasoning: z.string(),
});

export type ClassifiedArticle = z.infer<typeof classifiedArticleSchema>;

// --- Full Gemini news classification response ---
export const newsClassificationSchema = z.object({
  articles: z.array(classifiedArticleSchema),
  processing_metadata: z.object({
    total_input: z.number().int(),
    total_relevant: z.number().int(),
    total_discarded: z.number().int(),
    processing_timestamp: z.string(),
  }),
});

export type NewsClassification = z.infer<typeof newsClassificationSchema>;

// --- DB row type (matches Drizzle schema) ---
export interface NewsEventRow {
  id: number;
  headline: string;
  source: string | null;
  url: string | null;
  publishedAt: string | null;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
  impactScore: number | null;
  sentiment: string | null;
  sectors: string | null; // JSON string
  tickers: string | null; // JSON string
  eventType: string | null;
  rawSummary: string | null;
  geminiAnalysis: string | null; // JSON string
  createdAt: string | null;
}
