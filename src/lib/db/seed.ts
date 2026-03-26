import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import * as schema from "./schema";

const DB_PATH = path.join(process.cwd(), "data", "dashboard.db");
const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite, { schema });

async function seed() {
  console.log("Seeding database...");

  // Seed news_events
  await db.insert(schema.newsEvents).values([
    {
      headline: "Federal Reserve Signals Potential Rate Cut in Q2",
      source: "finnhub",
      url: "https://example.com/fed-rate-cut",
      publishedAt: "2026-03-26T12:00:00Z",
      countryCode: "US",
      lat: 38.9072,
      lng: -77.0369,
      impactScore: 8,
      sentiment: "bullish",
      sectors: JSON.stringify(["Financials", "Real Estate"]),
      tickers: JSON.stringify(["JPM", "BAC", "XLF"]),
      eventType: "central_bank",
      rawSummary: "Fed officials hint at easing cycle beginning sooner than expected.",
      geminiAnalysis: JSON.stringify({ reasoning: "Rate cuts typically boost equities, especially rate-sensitive sectors." }),
    },
    {
      headline: "EU Imposes New Tariffs on Chinese EV Imports",
      source: "gdelt",
      url: "https://example.com/eu-tariffs",
      publishedAt: "2026-03-26T10:00:00Z",
      countryCode: "DE",
      lat: 52.52,
      lng: 13.405,
      impactScore: 6,
      sentiment: "bearish",
      sectors: JSON.stringify(["Consumer Discretionary", "Industrials"]),
      tickers: JSON.stringify(["NIO", "XPEV", "TSLA"]),
      eventType: "regulatory",
      rawSummary: "European Commission finalizes tariff package on Chinese electric vehicle imports.",
      geminiAnalysis: JSON.stringify({ reasoning: "Tariffs hurt Chinese EV exporters but may benefit domestic producers." }),
    },
    {
      headline: "Major Semiconductor Fab Fire Disrupts TSMC Production",
      source: "marketaux",
      url: "https://example.com/tsmc-fire",
      publishedAt: "2026-03-26T08:00:00Z",
      countryCode: "TW",
      lat: 25.033,
      lng: 121.5654,
      impactScore: 7,
      sentiment: "bearish",
      sectors: JSON.stringify(["Technology"]),
      tickers: JSON.stringify(["TSM", "NVDA", "AMD", "INTC"]),
      eventType: "supply_chain",
      rawSummary: "Fire at TSMC Fab 18 expected to reduce chip output for 2-3 months.",
      geminiAnalysis: JSON.stringify({ reasoning: "Supply constraints drive chip prices up, hurt downstream buyers." }),
    },
    {
      headline: "Saudi Arabia Announces Surprise Oil Production Cut",
      source: "finnhub",
      url: "https://example.com/saudi-oil-cut",
      publishedAt: "2026-03-26T06:00:00Z",
      countryCode: "SA",
      lat: 24.7136,
      lng: 46.6753,
      impactScore: 7,
      sentiment: "bearish",
      sectors: JSON.stringify(["Energy", "Transportation"]),
      tickers: JSON.stringify(["XOM", "CVX", "OXY", "USO"]),
      eventType: "geopolitical",
      rawSummary: "Saudi unilateral 1M barrel/day cut effective next month.",
      geminiAnalysis: JSON.stringify({ reasoning: "Supply shock will push crude higher, benefiting oil producers." }),
    },
    {
      headline: "Breakthrough mRNA Cancer Vaccine Shows 90% Efficacy",
      source: "marketaux",
      url: "https://example.com/mrna-vaccine",
      publishedAt: "2026-03-26T14:00:00Z",
      countryCode: "US",
      lat: 42.3601,
      lng: -71.0589,
      impactScore: 6,
      sentiment: "bullish",
      sectors: JSON.stringify(["Healthcare"]),
      tickers: JSON.stringify(["MRNA", "PFE", "BNTX"]),
      eventType: "technology",
      rawSummary: "Phase 3 clinical trial results exceed expectations for solid tumor vaccine.",
      geminiAnalysis: JSON.stringify({ reasoning: "Biotech catalyst — potential blockbuster drug." }),
    },
  ]);

  // Seed whale_alerts
  await db.insert(schema.whaleAlerts).values([
    {
      ticker: "NVDA",
      strike: 950,
      expiry: "2026-04-18",
      callPut: "C",
      premium: 2500000,
      volume: 5000,
      openInterest: 1200,
      underlyingPrice: 920.5,
      sentiment: "bullish",
      source: "unusual_whales",
      detectedAt: "2026-03-26T15:30:00Z",
    },
    {
      ticker: "SPY",
      strike: 510,
      expiry: "2026-04-04",
      callPut: "P",
      premium: 1800000,
      volume: 12000,
      openInterest: 3000,
      underlyingPrice: 525.3,
      sentiment: "bearish",
      source: "unusual_whales",
      detectedAt: "2026-03-26T14:45:00Z",
    },
    {
      ticker: "XOM",
      strike: 120,
      expiry: "2026-05-16",
      callPut: "C",
      premium: 950000,
      volume: 3500,
      openInterest: 800,
      underlyingPrice: 115.2,
      sentiment: "bullish",
      source: "unusual_whales",
      detectedAt: "2026-03-26T13:20:00Z",
    },
    {
      ticker: "TSM",
      strike: 160,
      expiry: "2026-04-18",
      callPut: "P",
      premium: 1200000,
      volume: 4200,
      openInterest: 600,
      underlyingPrice: 172.8,
      sentiment: "bearish",
      source: "unusual_whales",
      detectedAt: "2026-03-26T12:10:00Z",
    },
    {
      ticker: "MRNA",
      strike: 150,
      expiry: "2026-04-18",
      callPut: "C",
      premium: 800000,
      volume: 2800,
      openInterest: 500,
      underlyingPrice: 138.5,
      sentiment: "bullish",
      source: "unusual_whales",
      detectedAt: "2026-03-26T15:00:00Z",
    },
  ]);

  // Seed market_snapshots
  await db.insert(schema.marketSnapshots).values([
    { ticker: "NVDA", price: 920.5, volume: 45000000, iv: 0.52, ivRank: 65, dayChangePct: 2.3 },
    { ticker: "SPY", price: 525.3, volume: 78000000, iv: 0.18, ivRank: 42, dayChangePct: -0.5 },
    { ticker: "XOM", price: 115.2, volume: 12000000, iv: 0.31, ivRank: 55, dayChangePct: 1.8 },
    { ticker: "TSM", price: 172.8, volume: 8500000, iv: 0.45, ivRank: 72, dayChangePct: -3.1 },
    { ticker: "MRNA", price: 138.5, volume: 6200000, iv: 0.68, ivRank: 80, dayChangePct: 5.2 },
  ]);

  // Seed analyses
  await db.insert(schema.analyses).values([
    {
      type: "cross_reference",
      inputRefs: JSON.stringify({ newsEventIds: [3], whaleAlertIds: [4] }),
      output: JSON.stringify({
        correlation: {
          whale_trade: { ticker: "TSM", type: "put", premium: 1200000 },
          related_event: { headline: "Major Semiconductor Fab Fire Disrupts TSMC Production", impact_score: 7 },
          correlation_confidence: 0.82,
          thesis: "Whale bought TSM puts shortly after reports of TSMC fab fire — likely event-driven bearish bet on supply disruption.",
        },
      }),
      confidence: 0.82,
    },
    {
      type: "cross_reference",
      inputRefs: JSON.stringify({ newsEventIds: [4], whaleAlertIds: [3] }),
      output: JSON.stringify({
        correlation: {
          whale_trade: { ticker: "XOM", type: "call", premium: 950000 },
          related_event: { headline: "Saudi Arabia Announces Surprise Oil Production Cut", impact_score: 7 },
          correlation_confidence: 0.75,
          thesis: "XOM calls align with Saudi production cut — whale positioning for oil price surge benefiting US producers.",
        },
      }),
      confidence: 0.75,
    },
    {
      type: "trade_recommendation",
      inputRefs: JSON.stringify({ correlationId: 1 }),
      output: JSON.stringify({
        ticker: "TSM",
        direction: "bearish",
        confidence: 0.65,
        strategy: "Bear Put Spread",
        thesis: "TSMC fab disruption will pressure stock in near term. Defined-risk bearish position.",
        disclaimer: "AI-generated analysis for informational purposes only. Not financial advice.",
      }),
      confidence: 0.65,
    },
    {
      type: "trade_recommendation",
      inputRefs: JSON.stringify({ correlationId: 2 }),
      output: JSON.stringify({
        ticker: "XOM",
        direction: "bullish",
        confidence: 0.6,
        strategy: "Bull Call Spread",
        thesis: "Oil supply cut supports higher crude. XOM to benefit as top US producer.",
        disclaimer: "AI-generated analysis for informational purposes only. Not financial advice.",
      }),
      confidence: 0.6,
    },
    {
      type: "news_classification",
      inputRefs: JSON.stringify({ batchId: "2026-03-26T12:00:00Z" }),
      output: JSON.stringify({
        total_input: 50,
        total_relevant: 5,
        total_discarded: 45,
      }),
      confidence: null,
    },
  ]);

  console.log("Seeding complete! Inserted 5 rows in each table.");
  sqlite.close();
}

seed().catch(console.error);
