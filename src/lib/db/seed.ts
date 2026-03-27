import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import * as schema from "./schema";

const DB_PATH = path.join(process.cwd(), "data", "dashboard.db");
const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite, { schema });

async function seed() {
  console.log("Seeding database...");

  // Clear existing data first
  await db.delete(schema.analyses);
  await db.delete(schema.marketSnapshots);
  await db.delete(schema.whaleAlerts);
  await db.delete(schema.newsEvents);
  console.log("Cleared existing data.");

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
      rawSummary:
        "Fed officials hint at easing cycle beginning sooner than expected.",
      geminiAnalysis: JSON.stringify({
        reasoning:
          "Rate cuts typically boost equities, especially rate-sensitive sectors.",
      }),
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
      rawSummary:
        "European Commission finalizes tariff package on Chinese electric vehicle imports.",
      geminiAnalysis: JSON.stringify({
        reasoning:
          "Tariffs hurt Chinese EV exporters but may benefit domestic producers.",
      }),
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
      rawSummary:
        "Fire at TSMC Fab 18 expected to reduce chip output for 2-3 months.",
      geminiAnalysis: JSON.stringify({
        reasoning:
          "Supply constraints drive chip prices up, hurt downstream buyers.",
      }),
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
      geminiAnalysis: JSON.stringify({
        reasoning:
          "Supply shock will push crude higher, benefiting oil producers.",
      }),
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
      rawSummary:
        "Phase 3 clinical trial results exceed expectations for solid tumor vaccine.",
      geminiAnalysis: JSON.stringify({
        reasoning: "Biotech catalyst — potential blockbuster drug.",
      }),
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
    {
      ticker: "NVDA",
      price: 920.5,
      volume: 45000000,
      iv: 0.52,
      ivRank: 65,
      dayChangePct: 2.3,
    },
    {
      ticker: "SPY",
      price: 525.3,
      volume: 78000000,
      iv: 0.18,
      ivRank: 42,
      dayChangePct: -0.5,
    },
    {
      ticker: "XOM",
      price: 115.2,
      volume: 12000000,
      iv: 0.31,
      ivRank: 55,
      dayChangePct: 1.8,
    },
    {
      ticker: "TSM",
      price: 172.8,
      volume: 8500000,
      iv: 0.45,
      ivRank: 72,
      dayChangePct: -3.1,
    },
    {
      ticker: "MRNA",
      price: 138.5,
      volume: 6200000,
      iv: 0.68,
      ivRank: 80,
      dayChangePct: 5.2,
    },
  ]);

  // Seed analyses
  await db.insert(schema.analyses).values([
    {
      type: "cross_reference",
      inputRefs: JSON.stringify({
        newsEventIds: [3, 5],
        whaleAlertIds: [4, 5],
      }),
      output: JSON.stringify({
        correlations: [
          {
            whale_trade: {
              ticker: "TSM",
              strike: 160,
              expiry: "2026-04-18",
              type: "put",
              premium: 1200000,
              volume: 4000,
            },
            related_event: {
              headline: "Major Semiconductor Fab Fire Disrupts TSMC Production",
              impact_score: 7,
              event_type: "supply_disruption",
            },
            correlation_confidence: 0.82,
            alignment: "confirming",
            thesis:
              "Whale bought TSM puts shortly after reports of TSMC fab fire — likely event-driven bearish bet on supply disruption.",
            smart_money_signal: "bearish",
          },
        ],
        uncorrelated_whales: [
          {
            ticker: "MRNA",
            type: "call",
            premium: 800000,
            note: "No correlated news event found",
          },
        ],
        summary:
          "Strong correlation between TSMC disruption news and bearish whale activity on TSM. One whale trade (MRNA) had no matching catalyst.",
        analysis_metadata: {
          news_events_analyzed: 5,
          whale_trades_analyzed: 5,
          correlations_found: 1,
          timestamp: new Date().toISOString(),
        },
      }),
      confidence: 0.82,
    },
    {
      type: "cross_reference",
      inputRefs: JSON.stringify({
        newsEventIds: [4, 1],
        whaleAlertIds: [3, 1],
      }),
      output: JSON.stringify({
        correlations: [
          {
            whale_trade: {
              ticker: "XOM",
              strike: 120,
              expiry: "2026-05-16",
              type: "call",
              premium: 950000,
              volume: 4000,
            },
            related_event: {
              headline: "Saudi Arabia Announces Surprise Oil Production Cut",
              impact_score: 7,
              event_type: "commodity_shock",
            },
            correlation_confidence: 0.75,
            alignment: "confirming",
            thesis:
              "XOM calls align with Saudi production cut — whale positioning for oil price surge benefiting US producers.",
            smart_money_signal: "bullish",
          },
          {
            whale_trade: {
              ticker: "NVDA",
              strike: 950,
              expiry: "2026-04-18",
              type: "call",
              premium: 2500000,
              volume: 5000,
            },
            related_event: {
              headline: "Federal Reserve Signals Potential Rate Cut in Q2",
              impact_score: 8,
              event_type: "monetary_policy",
            },
            correlation_confidence: 0.68,
            alignment: "confirming",
            thesis:
              "NVDA call sweep coincides with dovish Fed signals — lower rates boost growth/tech valuations.",
            smart_money_signal: "strong_bullish",
          },
        ],
        uncorrelated_whales: [],
        summary:
          "Multiple high-confidence correlations detected. Oil sector and tech showing aligned whale-news signals.",
        analysis_metadata: {
          news_events_analyzed: 5,
          whale_trades_analyzed: 5,
          correlations_found: 2,
          timestamp: new Date().toISOString(),
        },
      }),
      confidence: 0.75,
    },
    {
      type: "trade_recommendation",
      inputRefs: JSON.stringify({ correlationId: 1 }),
      output: JSON.stringify({
        ticker: "TSM",
        thesis:
          "TSMC fab disruption will pressure stock in near term. Defined-risk bearish position via put spread limits downside to premium paid.",
        direction: "bearish",
        confidence: 0.65,
        primary_strategy: {
          name: "Bear Put Spread",
          legs: [
            {
              action: "buy",
              type: "put",
              strike: 165,
              expiry: "2026-04-18",
              estimated_premium: 6.8,
            },
            {
              action: "sell",
              type: "put",
              strike: 155,
              expiry: "2026-04-18",
              estimated_premium: 3.2,
            },
          ],
          max_profit: "$640 per spread",
          max_loss: "$360 per spread",
          breakeven: "$161.40",
          risk_reward_ratio: "1:1.78",
        },
        market_context: {
          iv_assessment: "elevated",
          iv_strategy_note:
            "IV is elevated due to fab fire news — spread strategy helps offset high vol premium.",
          volume_assessment: "unusual_high",
          catalyst_date: "2026-04-05",
          days_to_catalyst: 10,
        },
        risk_factors: [
          "TSMC may quickly restore production, reversing bearish thesis",
          "Broader tech rally could support TSM despite supply disruption",
          "Elevated IV means higher spread cost",
        ],
        whale_alignment: {
          matches_whale: true,
          similarity_note: "Aligns with $1.2M put sweep at $160 strike",
        },
        disclaimer:
          "AI-generated analysis for informational purposes only. Not financial advice.",
      }),
      confidence: 0.65,
    },
    {
      type: "trade_recommendation",
      inputRefs: JSON.stringify({ correlationId: 2 }),
      output: JSON.stringify({
        ticker: "XOM",
        thesis:
          "Oil supply cut supports higher crude. XOM to benefit as top US producer with strong FCF yield.",
        direction: "bullish",
        confidence: 0.6,
        primary_strategy: {
          name: "Bull Call Spread",
          legs: [
            {
              action: "buy",
              type: "call",
              strike: 118,
              expiry: "2026-05-16",
              estimated_premium: 5.4,
            },
            {
              action: "sell",
              type: "call",
              strike: 128,
              expiry: "2026-05-16",
              estimated_premium: 2.1,
            },
          ],
          max_profit: "$670 per spread",
          max_loss: "$330 per spread",
          breakeven: "$121.30",
          risk_reward_ratio: "1:2.03",
        },
        market_context: {
          iv_assessment: "normal",
          iv_strategy_note:
            "IV near historical average — fair pricing for directional spreads.",
          volume_assessment: "above_average",
          catalyst_date: null,
          days_to_catalyst: null,
        },
        risk_factors: [
          "OPEC members may not comply with production cuts",
          "US production could increase to offset supply reduction",
          "Recession fears could suppress oil demand",
        ],
        whale_alignment: {
          matches_whale: true,
          similarity_note: "Aligns with $950K call sweep at $120 strike",
        },
        disclaimer:
          "AI-generated analysis for informational purposes only. Not financial advice.",
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
