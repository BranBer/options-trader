import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const newsEvents = sqliteTable("news_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  headline: text("headline").notNull(),
  source: text("source"),
  url: text("url"),
  publishedAt: text("published_at"),
  countryCode: text("country_code"),
  lat: real("lat"),
  lng: real("lng"),
  impactScore: integer("impact_score"),
  sentiment: text("sentiment"), // 'bullish' | 'bearish' | 'neutral'
  sectors: text("sectors"), // JSON array
  tickers: text("tickers"), // JSON array
  eventType: text("event_type"),
  rawSummary: text("raw_summary"),
  geminiAnalysis: text("gemini_analysis"), // full LLM output JSON
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const whaleAlerts = sqliteTable("whale_alerts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  strike: real("strike"),
  expiry: text("expiry"),
  callPut: text("call_put"), // 'C' | 'P'
  premium: real("premium"),
  volume: integer("volume"),
  openInterest: integer("open_interest"),
  underlyingPrice: real("underlying_price"),
  sentiment: text("sentiment"), // 'bullish' | 'bearish'
  source: text("source"),
  detectedAt: text("detected_at"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});

export const marketSnapshots = sqliteTable("market_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ticker: text("ticker").notNull(),
  price: real("price"),
  volume: integer("volume"),
  iv: real("iv"),
  ivRank: real("iv_rank"),
  dayChangePct: real("day_change_pct"),
  capturedAt: text("captured_at").default(sql`CURRENT_TIMESTAMP`),
});

export const analyses = sqliteTable("analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type"), // 'news_classification' | 'cross_reference' | 'trade_recommendation'
  inputRefs: text("input_refs"), // JSON: references to news_event ids, whale_alert ids
  output: text("output"), // full Gemini structured JSON
  confidence: real("confidence"),
  createdAt: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
