import { describe, it, expect } from "vitest";
import type { ReportData } from "@/types/report";
import type { DeepDiveAnalysis, TradeRecommendation } from "@/types/analysis";

// ── Shared fixture (full data, simulating the complete pipeline output) ──

const FULL_DEEP_DIVE: DeepDiveAnalysis = {
  ticker: "NVDA",
  whale_trade_summary: "$2.5M NVDA 950C 06/20 — institutional sweep",
  market_narrative:
    "NVIDIA continues to dominate AI chip demand. Recent earnings beat expectations.",
  technical_patterns: [
    {
      name: "Ascending Triangle",
      type: "bullish",
      description: "Higher lows converging on resistance at $940.",
      confidence: 0.82,
      price_target: 980,
    },
  ],
  support_resistance: [
    {
      level: 900,
      type: "support",
      strength: "strong",
      note: "Major demand zone",
    },
    { level: 960, type: "resistance", strength: "moderate", note: "Prior ATH" },
  ],
  indicators: [
    {
      name: "RSI (14)",
      value: "64.2",
      signal: "bullish",
      explanation: "Uptrend confirmed.",
    },
    {
      name: "MACD",
      value: "Bullish crossover",
      signal: "bullish",
      explanation: "Above signal line.",
    },
    {
      name: "EMA 9",
      value: "$932",
      signal: "bullish",
      explanation: "Price above EMA.",
    },
    {
      name: "Bollinger Bands",
      value: "Upper touch",
      signal: "neutral",
      explanation: "Near upper band.",
    },
  ],
  options_context: {
    iv_percentile: "72",
    iv_interpretation: "Elevated IV ahead of earnings.",
    put_call_ratio: "0.45",
    unusual_activity_note: "Heavy call buying at $950 and $1000 strikes.",
    greeks_summary: "Delta-heavy positioning favors continued upside.",
    greeks_breakdown: [
      {
        greek: "delta",
        value: "+0.62",
        plain_english: "Strong long exposure",
        implication: "favorable",
      },
      {
        greek: "gamma",
        value: "+0.03",
        plain_english: "Accelerating gains",
        implication: "favorable",
      },
      {
        greek: "theta",
        value: "-0.45",
        plain_english: "Moderate time decay",
        implication: "unfavorable",
      },
      {
        greek: "vega",
        value: "+0.28",
        plain_english: "Benefits from IV expansion",
        implication: "favorable",
      },
    ],
    max_pain: 920,
    oi_walls: {
      call_walls: [
        { strike: 950, oi: 25000 },
        { strike: 1000, oi: 40000 },
      ],
      put_walls: [
        { strike: 900, oi: 18000 },
        { strike: 880, oi: 22000 },
      ],
    },
    gex_summary: {
      net_gex: 1200000,
      dealer_positioning: "long_gamma",
      gex_flip_level: 915,
      interpretation:
        "Dealers long gamma — expect dampened moves near current levels.",
    },
    iv_rv_spread: 8.5,
    iv_rv_interpretation:
      "IV exceeds realized — consider selling premium strategies.",
  },
  entry_exit: {
    recommended_option_type: "Long Call",
    entry_price_range: { low: 18.5, high: 22.0 },
    strike_selection: "$950",
    expiry_guidance: "45-60 DTE",
    profit_target: "+50%",
    stop_loss: "-35%",
    position_sizing: "1.5% of portfolio",
    rationale:
      "Strong technicals + whale alignment + ascending triangle breakout potential.",
  },
  global_events_connection:
    "TSMC earnings beat boosts entire AI chip supply chain. Taiwan tensions remain low risk near-term.",
  risk_assessment: {
    overall_risk: "moderate",
    key_risks: [
      "Earnings volatility — report in 3 weeks",
      "Sector rotation out of tech",
      "Export restrictions on AI chips",
    ],
    max_recommended_allocation: "2%",
  },
  educational_notes: [
    {
      term: "Ascending Triangle",
      explanation:
        "A bullish pattern where price makes higher lows converging on a flat resistance level.",
    },
    {
      term: "GEX",
      explanation:
        "Gamma Exposure — measures how much dealers must hedge, affecting price stability.",
    },
    {
      term: "IV Percentile",
      explanation:
        "Current implied volatility relative to the past year. 72 = higher than 72% of days.",
    },
  ],
  disclaimer:
    "This analysis is for educational purposes only. Not financial advice. Always do your own research.",
  timeframe_patterns: {
    "1d": [
      {
        name: "Doji",
        type: "neutral",
        description: "Indecision candle.",
        confidence: 0.6,
      },
    ],
    "1wk": [
      {
        name: "Bull Flag",
        type: "bullish",
        description: "Continuation pattern.",
        confidence: 0.75,
        price_target: 960,
      },
    ],
  },
};

const FULL_RECOMMENDATION: TradeRecommendation = {
  ticker: "NVDA",
  thesis:
    "AI demand cycle remains strong; NVDA positioned for breakout above $950.",
  direction: "bullish",
  confidence: 0.81,
  primary_strategy: {
    name: "Bull Call Spread",
    legs: [
      {
        action: "buy",
        type: "call",
        strike: 950,
        expiry: "2026-06-20",
        estimated_premium: 20.5,
      },
      {
        action: "sell",
        type: "call",
        strike: 1000,
        expiry: "2026-06-20",
        estimated_premium: 8.0,
      },
    ],
    max_profit: "$3,750",
    max_loss: "$1,250",
    breakeven: "$962.50",
    risk_reward_ratio: "3.0:1",
  },
  market_context: {
    iv_assessment: "elevated",
    iv_strategy_note: "Elevated IV makes spreads preferable to naked longs.",
    volume_assessment: "unusual_high",
  },
  risk_factors: [
    "Earnings in 3 weeks",
    "TSMC guidance risk",
    "Sector rotation",
  ],
  whale_alignment: {
    matches_whale: true,
    whale_position_size: "$2.5M",
    similarity_note:
      "Directionally aligned — whale targeting same strike range.",
  },
  disclaimer: "Not financial advice.",
};

function makeFullReportData(): ReportData {
  return {
    ticker: "NVDA",
    generatedAt: new Date().toISOString(),
    deepDive: FULL_DEEP_DIVE,
    recommendation: FULL_RECOMMENDATION,
    confidenceBreakdown: {
      composite: 0.76,
      factors: [
        {
          name: "AI Correlation",
          value: 0.85,
          weight: 0.16,
          contribution: 0.136,
          description: "Very strong",
        },
        {
          name: "Whale Quality",
          value: 0.72,
          weight: 0.13,
          contribution: 0.094,
          description: "Good",
        },
        {
          name: "Technical Alignment",
          value: 0.78,
          weight: 0.13,
          contribution: 0.101,
          description: "Strong",
        },
        {
          name: "Cascade Strength",
          value: 0.65,
          weight: 0.08,
          contribution: 0.052,
          description: "Active TSMC cascade",
        },
        {
          name: "IV Regime",
          value: 0.55,
          weight: 0.08,
          contribution: 0.044,
          description: "Elevated",
        },
        {
          name: "VIX Regime",
          value: 0.62,
          weight: 0.08,
          contribution: 0.05,
          description: "Moderate",
        },
        {
          name: "Earnings Risk",
          value: 0.4,
          weight: 0.09,
          contribution: 0.036,
          description: "Upcoming",
        },
        {
          name: "Insider Alignment",
          value: 0.5,
          weight: 0.08,
          contribution: 0.04,
          description: "Neutral",
        },
      ],
    },
    timeframes: [
      {
        timeframe: "1D",
        period: "1d",
        candles: [],
        patterns: [],
        indicatorPatterns: [],
      },
      {
        timeframe: "1W",
        period: "1wk",
        candles: [],
        patterns: [
          {
            name: "Bull Flag",
            type: "bullish",
            description: "Continuation.",
            confidence: 0.75,
            price_target: 960,
          },
        ],
        indicatorPatterns: [],
      },
      {
        timeframe: "1M",
        period: "1mo",
        candles: [],
        patterns: [],
        indicatorPatterns: [],
      },
      {
        timeframe: "3M",
        period: "3mo",
        candles: [],
        patterns: [
          {
            name: "Ascending Triangle",
            type: "bullish",
            description: "Converging on $940.",
            confidence: 0.82,
            price_target: 980,
          },
        ],
        indicatorPatterns: [],
      },
      {
        timeframe: "6M",
        period: "6mo",
        candles: [],
        patterns: [],
        indicatorPatterns: [],
      },
      {
        timeframe: "1Y",
        period: "1y",
        candles: [],
        patterns: [],
        indicatorPatterns: [],
      },
    ],
    cascadeContext: [
      {
        nexusTicker: "TSMC",
        nexusName: "Taiwan Semiconductor",
        sector: "Technology",
        reportedAt: "2026-04-09T14:00:00Z",
        hoursSinceReport: 22,
        epsSurprisePct: 8.2,
        direction: "bullish",
        dependentCount: 8,
      },
    ],
    whaleAlert: null,
    chartScreenshots: {},
    enrichedData: {
      volumeProfile: null,
      algoSR: [],
      ivSkew: null,
      oiSummary: null,
      catalysts: { events: [], highImpactCount: 0, immediateRisk: false },
      currentPrice: 0,
      earningsDate: null,
    },
  };
}

// ── E2E Smoke Tests ────────────────────────────────────────────────────

describe("PDF Export — E2E Smoke", () => {
  it("full pipeline: generateDeepDiveReport produces valid PDF from rich data", async () => {
    const { generateDeepDiveReport } =
      await import("@/lib/services/pdf-export");

    const data = makeFullReportData();
    const blob = await generateDeepDiveReport(data);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(5000);
    expect(blob.type).toBe("application/pdf");

    // Verify PDF magic bytes
    const buffer = Buffer.from(await blob.arrayBuffer());
    const header = buffer.subarray(0, 5).toString("ascii");
    expect(header).toBe("%PDF-");
  }, 30_000);

  it("PDF includes expected section markers in stream", async () => {
    const { generateDeepDiveReport } =
      await import("@/lib/services/pdf-export");

    const data = makeFullReportData();
    const blob = await generateDeepDiveReport(data);
    const buffer = Buffer.from(await blob.arrayBuffer());
    const content = buffer.toString("latin1");

    // PDF text is encoded in streams, but key strings should appear
    // Check for the ticker symbol in the output
    expect(content).toContain("NVDA");
  }, 30_000);

  it("handles minimal data (no patterns, no cascade, no recommendation)", async () => {
    const { generateDeepDiveReport } =
      await import("@/lib/services/pdf-export");

    const data = makeFullReportData();
    data.recommendation = null;
    data.confidenceBreakdown = null;
    data.cascadeContext = null;
    data.timeframes = data.timeframes.map((tf) => ({
      ...tf,
      patterns: [],
      indicatorPatterns: [],
    }));

    const blob = await generateDeepDiveReport(data);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(1000);

    const buffer = Buffer.from(await blob.arrayBuffer());
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  }, 30_000);

  it("download-helper generates correct filename", async () => {
    const { generateReportFilename } =
      await import("@/lib/services/download-helper");

    const filename = generateReportFilename("NVDA", new Date(2026, 3, 10));
    expect(filename).toBe("DeepDive_NVDA_2026-04-10.pdf");
  });

  it("export hook module is importable and returns expected shape", async () => {
    const mod = await import("@/hooks/useExportPdf");
    expect(typeof mod.useExportPdf).toBe("function");
  });
});
