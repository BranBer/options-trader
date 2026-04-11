import { describe, it, expect } from "vitest";
import type { ReportData } from "@/types/report";
import type { DeepDiveAnalysis } from "@/types/analysis";

// ── Fixtures ───────────────────────────────────────────────────────────

const MINIMAL_DEEP_DIVE: DeepDiveAnalysis = {
  ticker: "AAPL",
  whale_trade_summary: "$1.2M AAPL 200C 05/16",
  market_narrative: "Apple trending higher.",
  technical_patterns: [],
  support_resistance: [
    { level: 190, type: "support", strength: "strong", note: "Major" },
  ],
  indicators: [
    { name: "RSI", value: "62", signal: "bullish", explanation: "Above 50." },
  ],
  options_context: {
    iv_percentile: "55",
    iv_interpretation: "Average IV.",
    put_call_ratio: "0.72",
    unusual_activity_note: "Heavy call buying.",
    greeks_summary: "Delta favors longs.",
    greeks_breakdown: [
      {
        greek: "delta",
        value: "+0.45",
        plain_english: "Moderate",
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
      interpretation: "Long gamma.",
    },
    iv_rv_spread: 5.2,
    iv_rv_interpretation: "Slightly elevated.",
  },
  entry_exit: {
    recommended_option_type: "Long Call",
    entry_price_range: { low: 5.5, high: 6.8 },
    strike_selection: "$200",
    expiry_guidance: "45 DTE",
    profit_target: "+40%",
    stop_loss: "-30%",
    position_sizing: "2% of portfolio",
    rationale: "Strong technicals.",
  },
  global_events_connection: "Trade talks driving sector.",
  risk_assessment: {
    overall_risk: "moderate",
    key_risks: ["Earnings vol"],
    max_recommended_allocation: "3%",
  },
  educational_notes: [{ term: "IV", explanation: "Implied volatility." }],
  disclaimer: "Not financial advice.",
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
    ...overrides,
  };
}

// ── pdf-export.ts tests ────────────────────────────────────────────────

describe("generateDeepDiveReport", () => {
  it("produces a valid PDF Blob", async () => {
    const { generateDeepDiveReport } =
      await import("@/lib/services/pdf-export");
    const data = makeReportData();
    const blob = await generateDeepDiveReport(data);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toBe("application/pdf");
  }, 30_000);

  it("produces valid PDF bytes (magic header)", async () => {
    const { generateDeepDiveReport } =
      await import("@/lib/services/pdf-export");
    const data = makeReportData();
    const blob = await generateDeepDiveReport(data);
    const buffer = Buffer.from(await blob.arrayBuffer());
    const header = buffer.subarray(0, 5).toString("ascii");
    expect(header).toBe("%PDF-");
  }, 30_000);
});

// ── download-helper.ts tests ───────────────────────────────────────────

describe("generateReportFilename", () => {
  it("generates correct filename format", async () => {
    const { generateReportFilename } =
      await import("@/lib/services/download-helper");
    const filename = generateReportFilename("AAPL", new Date(2026, 3, 10));
    expect(filename).toBe("DeepDive_AAPL_2026-04-10.pdf");
  });

  it("uppercases ticker", async () => {
    const { generateReportFilename } =
      await import("@/lib/services/download-helper");
    const filename = generateReportFilename("msft", new Date(2026, 0, 5));
    expect(filename).toBe("DeepDive_MSFT_2026-01-05.pdf");
  });

  it("zero-pads month and day", async () => {
    const { generateReportFilename } =
      await import("@/lib/services/download-helper");
    // Use explicit local date to avoid UTC→local timezone shift
    const filename = generateReportFilename("TSLA", new Date(2026, 2, 9));
    expect(filename).toBe("DeepDive_TSLA_2026-03-09.pdf");
  });
});

describe("downloadBlob", () => {
  it("exports downloadBlob function", async () => {
    const { downloadBlob } = await import("@/lib/services/download-helper");
    expect(typeof downloadBlob).toBe("function");
  });
});

// ── useExportPdf types test ────────────────────────────────────────────

describe("useExportPdf module exports", () => {
  it("exports useExportPdf function and progress type", async () => {
    const mod = await import("@/hooks/useExportPdf");
    expect(typeof mod.useExportPdf).toBe("function");
  });
});
