import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import ReportDocument from "@/components/report/ReportDocument";
import type { ReportData } from "@/types/report";
import type { DeepDiveAnalysis } from "@/types/analysis";
import {
  colors,
  getSignalStyle,
  getRiskStyle,
  formatReportDate,
} from "@/components/report/styles";

// ── Minimal fixture ────────────────────────────────────────────────────

const MINIMAL_DEEP_DIVE: DeepDiveAnalysis = {
  ticker: "AAPL",
  whale_trade_summary: "$1.2M AAPL 200C 05/16",
  market_narrative: "Apple is trending higher on strong earnings.",
  technical_patterns: [],
  support_resistance: [
    { level: 190, type: "support", strength: "strong", note: "Major support" },
  ],
  indicators: [
    {
      name: "RSI (14)",
      value: "62.3",
      signal: "bullish",
      explanation: "Above 50, confirming uptrend.",
    },
  ],
  options_context: {
    iv_percentile: "55",
    iv_interpretation: "Average IV environment.",
    put_call_ratio: "0.72",
    unusual_activity_note: "Heavy call buying at $200 strike.",
    greeks_summary: "Delta favors longs.",
    greeks_breakdown: [
      {
        greek: "delta",
        value: "+0.45",
        plain_english: "Moderate exposure",
        implication: "favorable",
      },
    ],
    max_pain: 195,
    oi_walls: {
      call_walls: [{ strike: 200, oi: 15000 }],
      put_walls: [{ strike: 185, oi: 12000 }],
    },
    gex_summary: {
      net_gex: 500000,
      dealer_positioning: "long_gamma",
      gex_flip_level: 192,
      interpretation: "Dealers are long gamma, damping moves.",
    },
    iv_rv_spread: 5.2,
    iv_rv_interpretation: "Slightly elevated vs realized.",
  },
  entry_exit: {
    recommended_option_type: "Long Call",
    entry_price_range: { low: 5.5, high: 6.8 },
    strike_selection: "$200",
    expiry_guidance: "45 DTE",
    profit_target: "+40%",
    stop_loss: "-30%",
    position_sizing: "2% of portfolio",
    rationale: "Strong technicals support thesis.",
  },
  global_events_connection: "Trade talks and AI investment driving sector.",
  risk_assessment: {
    overall_risk: "moderate",
    key_risks: ["Earnings volatility", "Broad market rotation"],
    max_recommended_allocation: "3%",
  },
  educational_notes: [
    {
      term: "IV",
      explanation: "Implied volatility measures expected movement.",
    },
    { term: "Delta", explanation: "Rate of change of option price vs stock." },
  ],
  disclaimer: "This is not financial advice. For educational purposes only.",
};

function makeReportData(overrides?: Partial<ReportData>): ReportData {
  return {
    ticker: "AAPL",
    generatedAt: "2026-04-10T12:00:00Z",
    deepDive: MINIMAL_DEEP_DIVE,
    recommendation: null,
    confidenceBreakdown: null,
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
        patterns: [],
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
        patterns: [],
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
    cascadeContext: null,
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
    triggerReport: null,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("ReportDocument PDF rendering", () => {
  it("renders a valid PDF buffer with minimal data", async () => {
    const data = makeReportData();
    const buffer = await renderToBuffer(
      createElement(ReportDocument, { data }),
    );
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    // PDF magic bytes: %PDF-
    const header = buffer.subarray(0, 5).toString("ascii");
    expect(header).toBe("%PDF-");
  }, 30_000);

  it("renders with full data including cascade and recommendation", async () => {
    const data = makeReportData({
      recommendation: {
        ticker: "AAPL",
        thesis: "Bull thesis on AI",
        direction: "bullish",
        confidence: 0.78,
        primary_strategy: {
          name: "Bull Call Spread",
          legs: [
            {
              action: "buy",
              type: "call",
              strike: 200,
              expiry: "2026-05-16",
              estimated_premium: 6.5,
            },
            {
              action: "sell",
              type: "call",
              strike: 210,
              expiry: "2026-05-16",
              estimated_premium: 3.2,
            },
          ],
          max_profit: "$670",
          max_loss: "$330",
          breakeven: "$203.30",
          risk_reward_ratio: "2.03:1",
        },
        market_context: {
          iv_assessment: "normal",
          iv_strategy_note: "Normal IV favors spreads.",
          volume_assessment: "above_average",
        },
        risk_factors: ["Earnings in 2 weeks", "Fed meeting"],
        whale_alignment: {
          matches_whale: true,
          whale_position_size: "$1.2M",
          similarity_note: "Directionally aligned with whale flow.",
        },
        disclaimer: "Not financial advice.",
      },
      confidenceBreakdown: {
        composite: 0.72,
        factors: [
          {
            name: "AI Correlation",
            value: 0.82,
            weight: 0.16,
            contribution: 0.131,
            description: "Strong",
          },
          {
            name: "Whale Quality",
            value: 0.68,
            weight: 0.13,
            contribution: 0.088,
            description: "Good",
          },
        ],
      },
      cascadeContext: [
        {
          nexusTicker: "TSMC",
          nexusName: "Taiwan Semi",
          sector: "Technology",
          reportedAt: "2026-04-09T14:00:00Z",
          hoursSinceReport: 22,
          epsSurprisePct: 8.2,
          direction: "bullish",
          dependentCount: 5,
        },
      ],
    });

    const buffer = await renderToBuffer(
      createElement(ReportDocument, { data }),
    );
    expect(buffer.length).toBeGreaterThan(5000);
    const header = buffer.subarray(0, 5).toString("ascii");
    expect(header).toBe("%PDF-");
  }, 30_000);

  it("renders with patterns on chart pages", async () => {
    const data = makeReportData({
      timeframes: [
        {
          timeframe: "1D",
          period: "1d",
          candles: [],
          patterns: [
            {
              name: "Bull Flag",
              type: "bullish",
              description: "Flag pattern",
              confidence: 0.82,
              price_target: 205,
              timeframe: "1D",
              drawing_type: "marker",
              start_time: null,
              end_time: null,
              start_price: null,
              end_price: null,
              secondary_start_price: null,
              secondary_end_price: null,
            },
          ],
          indicatorPatterns: [],
        },
        {
          timeframe: "1W",
          period: "1wk",
          candles: [],
          patterns: [],
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
          patterns: [],
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
    });

    const buffer = await renderToBuffer(
      createElement(ReportDocument, { data }),
    );
    expect(buffer.length).toBeGreaterThan(1000);
  }, 30_000);

  it("handles empty educational_notes gracefully", async () => {
    const deepDive = { ...MINIMAL_DEEP_DIVE, educational_notes: [] };
    const data = makeReportData({ deepDive });
    const buffer = await renderToBuffer(
      createElement(ReportDocument, { data }),
    );
    expect(buffer.length).toBeGreaterThan(1000);
  }, 30_000);
});

describe("style utilities", () => {
  it("getSignalStyle returns correct colors", () => {
    const bull = getSignalStyle("bullish");
    expect(bull.color).toBe(colors.accentGreen);
    const bear = getSignalStyle("bearish");
    expect(bear.color).toBe(colors.accentRed);
    const neut = getSignalStyle("neutral");
    expect(neut.color).toBe(colors.textMuted);
  });

  it("getRiskStyle maps risk levels", () => {
    expect(getRiskStyle("low").color).toBe(colors.accentGreen);
    expect(getRiskStyle("moderate").color).toBe(colors.accentAmber);
    expect(getRiskStyle("high").color).toBe(colors.accentRed);
    expect(getRiskStyle("very_high").color).toBe(colors.accentRed);
  });

  it("formatReportDate formats ISO to readable date", () => {
    const result = formatReportDate("2026-04-10T12:00:00Z");
    expect(result).toContain("April");
    expect(result).toContain("2026");
    expect(result).toContain("10");
  });
});
