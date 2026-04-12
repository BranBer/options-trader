import { describe, it, expect } from "vitest";
import {
  computeSignalScorecard,
  formatScorecardForPrompt,
  type ScorecardInput,
} from "@/lib/utils/signal-scorecard";
import {
  buildTradeAnalyzerPrompt,
  TRADE_ANALYZER_SYSTEM_INSTRUCTION,
} from "@/lib/prompts/trade-analyzer";
import type { IndicatorPatternReport } from "@/lib/utils/indicator-patterns";
import type { ShortInterestData } from "@/lib/services/market-fetcher";

// ---------- Helpers ----------

function makeBearishReport(ticker: string, tf: string): IndicatorPatternReport {
  return {
    ticker,
    timeframe: tf,
    patterns: [
      { name: "MACD Bearish Crossover", signal: "bearish", confidence: 0.73 },
      { name: "RSI Overbought", signal: "bearish", confidence: 0.8 },
      { name: "EMA Death Cross", signal: "bearish", confidence: 0.71 },
    ],
    combinations: [],
    aggregateSignal: {
      direction: "bearish",
      strength: 0.75,
      summary: "bearish (75% strength)",
    },
    computedAt: new Date().toISOString(),
  };
}

function makeBullishReport(ticker: string, tf: string): IndicatorPatternReport {
  return {
    ticker,
    timeframe: tf,
    patterns: [
      { name: "EMA Bullish Alignment", signal: "bullish", confidence: 0.65 },
      { name: "MACD Bullish Crossover", signal: "bullish", confidence: 0.7 },
    ],
    combinations: [],
    aggregateSignal: {
      direction: "bullish",
      strength: 0.68,
      summary: "bullish (68% strength)",
    },
    computedAt: new Date().toISOString(),
  };
}

const highShortInterest: ShortInterestData = {
  ticker: "GME",
  sharesShort: 50_000_000,
  shortRatio: 4.2,
  shortPercentOfFloat: 0.18, // 18%
  dateShortInterest: new Date("2026-04-01"),
  squeezePressure: "high",
};

const syntheticCorrelation = {
  whale_trade: {
    ticker: "GME",
    strike: 340,
    expiry: "2026-05-16",
    type: "call" as const,
    premium: 2_100_000,
    volume: 5000,
  },
  related_event: {
    headline: "No catalyst",
    impact_score: 0,
    event_type: "whale_signal_only",
  },
  correlation_confidence: 0,
  alignment: "confirming" as const,
  thesis: "Whale call buy",
  smart_money_signal: "bullish" as const,
};

// ---------- Scorecard unit tests (Story 39.13 AC #1-5) ----------

describe("Story 39.13 — computeSignalScorecard", () => {
  it("detects major conflict when whale is bullish but all patterns are bearish", () => {
    const input: ScorecardInput = {
      whaleDirection: "bullish",
      whalePremium: 2_100_000,
      whaleOptionType: "call",
      indicatorReportsByTimeframe: {
        "1W": makeBearishReport("GME", "1W"),
        "1M": makeBearishReport("GME", "1M"),
        "3M": makeBearishReport("GME", "3M"),
      },
      pcRatio: 1.4, // elevated — bearish
      shortInterest: highShortInterest,
    };

    const scorecard = computeSignalScorecard(input);

    // Overall lean should be bearish (whale is one bullish signal, everything else bearish)
    expect(scorecard.overallLean).toBe("bearish");

    // Conflict level must be major or extreme (whale bullish vs bearish consensus)
    expect(["major", "extreme"]).toContain(scorecard.conflictLevel);

    // Short covering risk must be at least moderate (18% float + whale buying calls)
    expect(["moderate", "high"]).toContain(scorecard.shortCoveringRisk);

    // Bearish signals must outnumber bullish
    expect(scorecard.signalCounts.bearish).toBeGreaterThan(
      scorecard.signalCounts.bullish,
    );
  });

  it("correctly counts signals across timeframes", () => {
    const input: ScorecardInput = {
      whaleDirection: "bullish",
      indicatorReportsByTimeframe: {
        "1W": makeBearishReport("AAPL", "1W"), // 1 bearish entry (whole report)
        "1M": makeBullishReport("AAPL", "1M"), // 1 bullish entry (whole report)
      },
    };
    const scorecard = computeSignalScorecard(input);

    // Whale adds 1 bullish entry; 1M report adds 1 bullish entry → 2 bullish
    // 1W bearish report adds 1 bearish entry → 1 bearish
    // (Implementation aggregates per-report, not per-pattern)
    expect(scorecard.signalCounts.bullish).toBeGreaterThanOrEqual(2);
    expect(scorecard.signalCounts.bearish).toBeGreaterThanOrEqual(1);
  });

  it("returns at most 'low' shortCoveringRisk when whale is bearish with high short float", () => {
    const input: ScorecardInput = {
      whaleDirection: "bearish", // whale puts, not covering
      shortInterest: highShortInterest,
    };
    const scorecard = computeSignalScorecard(input);
    // High float (18%) → 'low' risk flag even without whale calls (informational only)
    // Must NOT be 'moderate' or 'high' (those require whale is bullish)
    expect(["none", "low"]).toContain(scorecard.shortCoveringRisk);
    expect(scorecard.shortCoveringRisk).not.toBe("moderate");
    expect(scorecard.shortCoveringRisk).not.toBe("high");
  });

  it("returns none conflict when whale aligns with technicals", () => {
    const input: ScorecardInput = {
      whaleDirection: "bearish",
      indicatorReportsByTimeframe: {
        "1M": makeBearishReport("TSLA", "1M"),
        "3M": makeBearishReport("TSLA", "3M"),
      },
    };
    const scorecard = computeSignalScorecard(input);
    expect(scorecard.conflictLevel).toBe("none");
    expect(scorecard.overallLean).toBe("bearish");
  });

  it("maps dominant timeframe to correct expiry range", () => {
    const input1W: ScorecardInput = {
      whaleDirection: "neutral",
      indicatorReportsByTimeframe: {
        "1W": makeBearishReport("X", "1W"),
      },
    };
    const sc1W = computeSignalScorecard(input1W);
    expect(sc1W.dominantTimeframe).toBe("1W");
    expect(sc1W.suggestedExpiryRange).toEqual({ min: 7, max: 14 });

    const input3M: ScorecardInput = {
      whaleDirection: "neutral",
      indicatorReportsByTimeframe: {
        "3M": makeBearishReport("X", "3M"),
      },
    };
    const sc3M = computeSignalScorecard(input3M);
    expect(sc3M.dominantTimeframe).toBe("3M");
    expect(sc3M.suggestedExpiryRange).toEqual({ min: 30, max: 60 });
  });
});

// ---------- Prompt injection tests (Story 39.13 AC — scorecard in prompt) ----------

describe("Story 39.13 — scorecard injected into recommendation prompt", () => {
  it("includes the scorecard block at the top of the prompt when conflict is major", () => {
    const input: ScorecardInput = {
      whaleDirection: "bullish",
      whalePremium: 2_100_000,
      whaleOptionType: "call",
      indicatorReportsByTimeframe: {
        "1W": makeBearishReport("GME", "1W"),
        "1M": makeBearishReport("GME", "1M"),
      },
      pcRatio: 1.4,
      shortInterest: highShortInterest,
    };
    const scorecard = computeSignalScorecard(input);

    const prompt = buildTradeAnalyzerPrompt(
      JSON.stringify(syntheticCorrelation),
      "GME",
      180,
      35,
      1_000_000,
      1_200_000,
      "No options chain data available",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      scorecard,
    );

    // Scorecard block must appear before the whale trade signal
    expect(prompt).toContain("=== PRE-COMPUTED SIGNAL SCORECARD ===");
    expect(prompt).toContain("BEARISH");
    expect(prompt).toContain("MAJOR");
    expect(prompt).toContain("YOUR RECOMMENDATION MUST REFLECT THIS SCORECARD");
    // Scorecard must appear before whale trade signal
    const scorecardIdx = prompt.indexOf(
      "=== PRE-COMPUTED SIGNAL SCORECARD ===",
    );
    const whaleIdx = prompt.indexOf("Whale Trade Signal:");
    expect(scorecardIdx).toBeLessThan(whaleIdx);
  });

  it("includes short covering risk warning in prompt when applicable", () => {
    const input: ScorecardInput = {
      whaleDirection: "bullish",
      whaleOptionType: "call",
      indicatorReportsByTimeframe: {
        "1W": makeBearishReport("GME", "1W"),
      },
      shortInterest: highShortInterest,
    };
    const scorecard = computeSignalScorecard(input);
    const formatted = formatScorecardForPrompt(scorecard, "bullish");

    expect(formatted).toContain("Short Covering Risk:");
    expect(formatted).toMatch(/HIGH|MODERATE/);
  });

  it("does not inject scorecard block when scorecard is null", () => {
    const prompt = buildTradeAnalyzerPrompt(
      JSON.stringify(syntheticCorrelation),
      "GME",
      180,
      35,
      1_000_000,
      1_200_000,
      "No options chain data available",
    );

    expect(prompt).not.toContain("=== PRE-COMPUTED SIGNAL SCORECARD ===");
    expect(prompt).toContain("Whale Trade Signal:");
  });

  it("includes deep dive summary block when provided", () => {
    const deepDiveSummary = {
      overallSentiment: "bearish" as const,
      riskLevel: "high" as const,
      keyPatterns: [
        { name: "MACD Bearish", signal: "bearish" as const },
        { name: "RSI Overbought", signal: "bearish" as const },
      ],
      supportLevels: [165, 170],
      resistanceLevels: [185, 190],
      ivAssessment: "IV elevated at 45% — expensive for debit strategies",
      thetaAnalysis: "-0.15/day: moderate time decay",
    };

    const prompt = buildTradeAnalyzerPrompt(
      JSON.stringify(syntheticCorrelation),
      "GME",
      180,
      45,
      1_000_000,
      1_200_000,
      "No options chain data available",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      deepDiveSummary,
    );

    expect(prompt).toContain("Pre-computed Deep Dive Summary");
    expect(prompt).toContain("BEARISH");
    expect(prompt).toContain("HIGH");
    expect(prompt).toContain("$165");
    // Deep dive block must appear before whale trade signal
    const ddIdx = prompt.indexOf("Pre-computed Deep Dive Summary");
    const whaleIdx = prompt.indexOf("Whale Trade Signal:");
    expect(ddIdx).toBeLessThan(whaleIdx);
  });
});

// ---------- System instruction tests (Story 39.10) ----------

describe("Story 39.10 — System instruction rules", () => {
  it("includes Evidence Hierarchy rule", () => {
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain("EVIDENCE HIERARCHY");
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain("evidence hierarchy");
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain(
      "Whale trade direction",
    );
  });

  it("includes Whale Skepticism rule", () => {
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain("WHALE SKEPTICISM");
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain("Short covering");
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain("Multi-leg strategies");
  });

  it("includes Conflicting Signals rule", () => {
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain("CONFLICTING SIGNALS");
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain("OPPOSITE direction");
  });

  it("includes No Trade / stand aside rule", () => {
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain("NO TRADE SIGNAL");
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain("stand aside");
  });

  it("includes updated Expiry Selection rule referencing signal timeframe", () => {
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain("EXPIRY SELECTION");
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain(
      "DOMINANT SIGNAL TIMEFRAME",
    );
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain("REFERENCE POINT");
  });
});
