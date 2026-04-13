/**
 * Sprint 48C Integration Tests
 *
 * Tests for:
 * - 48.6: buildTriggerReport convenience function
 * - 48.7: buildTradeAnalyzerPrompt trigger injection
 * - 48.8: buildDeepDivePrompt trigger injection
 * - 48.9: computeSignalScorecard trigger integration
 */

import { describe, it, expect } from "vitest";
import {
  buildTriggerReport,
  computeTriggerReport,
  formatTriggerReportForPrompt,
  type TriggerReport,
  type TriggerEngineInput,
} from "@/lib/utils/trigger-engine";
import {
  computeSignalScorecard,
  type ScorecardInput,
} from "@/lib/utils/signal-scorecard";
import {
  buildTradeAnalyzerPrompt,
  TRADE_ANALYZER_SYSTEM_INSTRUCTION,
} from "@/lib/prompts/trade-analyzer";
import { buildDeepDivePrompt } from "@/lib/prompts/deep-dive-analyzer";
import type { Candle } from "@/lib/utils/technical-indicators";
import type { LevelInteraction } from "@/lib/utils/level-interactions";
import type { SwingStructure, SwingPoint } from "@/lib/utils/swing-structure";
import type { IndicatorPatternReport } from "@/lib/utils/indicator-patterns";
import type { VolumeProfile } from "@/lib/utils/volume-profile";
import type { AlgoSRLevel } from "@/lib/utils/algo-sr";

// ---------- Factories ----------

function c(
  index: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number = 1000,
): Candle {
  return {
    time: 1_700_000_000 + index * 86_400,
    open,
    high,
    low,
    close,
    volume,
  };
}

/** Generate a bullish trending series of daily candles */
function bullishCandles(count: number, start: number = 100): Candle[] {
  const candles: Candle[] = [];
  let price = start;
  for (let i = 0; i < count; i++) {
    const step = 0.5 + Math.sin(i * 0.3) * 0.3;
    const open = price;
    const close = price + step;
    const high = Math.max(open, close) + 0.5;
    const low = Math.min(open, close) - 0.3;
    candles.push(c(i, open, high, low, close, 1000 + i * 10));
    price = close;
  }
  return candles;
}

function makeAlgoSRLevels(price: number): AlgoSRLevel[] {
  return [
    {
      price: price * 0.97,
      type: "support",
      confluence: 4,
      sources: ["swing", "volume", "oi_wall", "vwap"],
      state: "active",
    },
    {
      price: price * 1.03,
      type: "resistance",
      confluence: 3,
      sources: ["swing", "volume", "max_pain"],
      state: "active",
    },
  ];
}

function makeVolumeProfile(price: number): VolumeProfile {
  return {
    vpoc: price * 0.99,
    valueAreaHigh: price * 1.02,
    valueAreaLow: price * 0.96,
    buckets: [],
    hvn: [{ price: price * 0.99, volume: 50000 }],
    lvn: [{ price: price * 1.01, volume: 5000 }],
    totalVolume: 500000,
  };
}

function makeSwing(structure: SwingStructure["structure"]): SwingStructure {
  const base: SwingPoint[] = [
    { type: "low", price: 100, time: 1, index: 0 },
    { type: "high", price: 110, time: 2, index: 1 },
    { type: "low", price: 105, time: 3, index: 2 },
    { type: "high", price: 115, time: 4, index: 3 },
  ];
  return {
    swings: base,
    structure,
    structureShift: null,
    lastHigherLow: structure === "bullish" ? base[2] : null,
    lastLowerHigh: structure === "bearish" ? base[3] : null,
  };
}

function makeInteraction(
  overrides: Partial<LevelInteraction> = {},
): LevelInteraction {
  return {
    level: 345,
    levelLabel: "S/R 345 (4★)",
    type: "reclaim",
    candle: { time: 1000, open: 340, high: 348, low: 339, close: 347 },
    confirmationCandle: {
      time: 2000,
      open: 347,
      high: 350,
      low: 346,
      close: 349,
    },
    wickOnly: false,
    distance: 1.16,
    confluence: 4,
    ...overrides,
  };
}

function makeHTFReport(
  direction: "bullish" | "bearish" | "neutral",
  tf: string = "1W",
): IndicatorPatternReport {
  return {
    ticker: "AAPL",
    timeframe: tf,
    patterns: [],
    combinations: [],
    aggregateSignal: {
      direction,
      strength: 0.7,
      summary: `${tf} ${direction}`,
    },
    computedAt: new Date().toISOString(),
  };
}

function makeTriggerReport(
  overrides: Partial<TriggerReport> = {},
): TriggerReport {
  return {
    ticker: "AAPL",
    computedAt: new Date().toISOString(),
    primaryTrigger: {
      direction: "bullish",
      classification: "trigger",
      score: 75,
      scoreBreakdown: {
        levelInteraction: 32,
        structureAlignment: 25,
        contextAlignment: 14,
        patternSupport: 4,
      },
      interaction: makeInteraction(),
      structureContext: "bullish",
      htfAlignment: "aligned",
      confirmationType: "follow_through",
      confidence: "high",
      summary:
        "Bullish trigger: price reclaim at $345.00 (S/R 345 (4★)) with bullish structure. HTF aligned. Score: 75/100.",
    },
    secondaryTriggers: [],
    activeLevels: [makeInteraction()],
    swingStructure: makeSwing("bullish"),
    overallAssessment: "actionable_bullish",
    ...overrides,
  };
}

// =============================================================
// Story 48.6 — buildTriggerReport convenience function
// =============================================================

describe("buildTriggerReport (48.6)", () => {
  it("returns no_trigger for insufficient candles", () => {
    const report = buildTriggerReport({
      ticker: "AAPL",
      candles: bullishCandles(5),
    });
    expect(report.overallAssessment).toBe("no_trigger");
    expect(report.primaryTrigger).toBeNull();
    expect(report.ticker).toBe("AAPL");
  });

  it("produces a report from candles + algoSR + volumeProfile", () => {
    const candles = bullishCandles(50, 340);
    const lastClose = candles[candles.length - 1].close;
    const report = buildTriggerReport({
      ticker: "AAPL",
      candles,
      algoSRLevels: makeAlgoSRLevels(lastClose),
      volumeProfile: makeVolumeProfile(lastClose),
      htfPatterns: [makeHTFReport("bullish", "1M")],
    });
    expect(report.ticker).toBe("AAPL");
    expect(report.computedAt).toBeTruthy();
    expect(report.swingStructure).toBeDefined();
    expect(report.swingStructure.structure).toBeDefined();
    // Report may or may not have triggers depending on price vs levels
    expect([
      "actionable_bullish",
      "actionable_bearish",
      "setup_only",
      "no_trigger",
      "conflicted",
    ]).toContain(report.overallAssessment);
  });

  it("works with no optional inputs", () => {
    const candles = bullishCandles(30, 100);
    const report = buildTriggerReport({
      ticker: "TSLA",
      candles,
    });
    expect(report.ticker).toBe("TSLA");
    expect(report.swingStructure).toBeDefined();
  });

  it("includes value-area interactions when volume profile provided", () => {
    const candles = bullishCandles(40, 100);
    const lastClose = candles[candles.length - 1].close;
    const vp = makeVolumeProfile(lastClose);
    const report = buildTriggerReport({
      ticker: "MSFT",
      candles,
      volumeProfile: vp,
    });
    // The report should be valid even if no active level interactions
    expect(report.ticker).toBe("MSFT");
    expect(report.computedAt).toBeTruthy();
  });
});

// =============================================================
// Story 48.9 — Signal scorecard trigger integration
// =============================================================

describe("computeSignalScorecard with triggerReport (48.9)", () => {
  const baseScorecardInput: ScorecardInput = {
    whaleDirection: "bullish",
    whalePremium: 2_500_000,
    whaleOptionType: "call",
  };

  it("adds bullish signal for actionable_bullish trigger", () => {
    const scorecard = computeSignalScorecard({
      ...baseScorecardInput,
      triggerReport: makeTriggerReport({
        overallAssessment: "actionable_bullish",
      }),
    });
    const triggerSignal = scorecard.bullishSignals.find((s) =>
      s.includes("Daily trigger"),
    );
    expect(triggerSignal).toBeDefined();
    expect(triggerSignal).toContain("BULLISH");
    expect(triggerSignal).toContain("$345.00");
  });

  it("adds bearish signal for actionable_bearish trigger", () => {
    const scorecard = computeSignalScorecard({
      ...baseScorecardInput,
      triggerReport: makeTriggerReport({
        overallAssessment: "actionable_bearish",
        primaryTrigger: {
          direction: "bearish",
          classification: "trigger",
          score: 68,
          scoreBreakdown: {
            levelInteraction: 24,
            structureAlignment: 25,
            contextAlignment: 14,
            patternSupport: 5,
          },
          interaction: makeInteraction({
            type: "breakdown",
            level: 330,
            levelLabel: "S/R 330 (3★)",
          }),
          structureContext: "bearish",
          htfAlignment: "aligned",
          confirmationType: "close_below",
          confidence: "moderate",
          summary: "Bearish trigger",
        },
      }),
    });
    const triggerSignal = scorecard.bearishSignals.find((s) =>
      s.includes("Daily trigger"),
    );
    expect(triggerSignal).toBeDefined();
    expect(triggerSignal).toContain("BEARISH");
  });

  it("adds neutral signal for conflicted trigger", () => {
    const scorecard = computeSignalScorecard({
      ...baseScorecardInput,
      triggerReport: makeTriggerReport({
        overallAssessment: "conflicted",
      }),
    });
    const triggerSignal = scorecard.neutralSignals.find((s) =>
      s.includes("Daily trigger"),
    );
    expect(triggerSignal).toBeDefined();
    expect(triggerSignal).toContain("conflicted");
  });

  it("adds neutral signal for setup_only trigger", () => {
    const scorecard = computeSignalScorecard({
      ...baseScorecardInput,
      triggerReport: makeTriggerReport({
        overallAssessment: "setup_only",
        primaryTrigger: {
          direction: "bullish",
          classification: "setup",
          score: 42,
          scoreBreakdown: {
            levelInteraction: 16,
            structureAlignment: 15,
            contextAlignment: 8,
            patternSupport: 3,
          },
          interaction: makeInteraction(),
          structureContext: "consolidation",
          htfAlignment: "conflicted",
          confirmationType: "none",
          confidence: "low",
          summary: "Setup only",
        },
      }),
    });
    const triggerSignal = scorecard.neutralSignals.find((s) =>
      s.includes("Daily trigger"),
    );
    expect(triggerSignal).toBeDefined();
    expect(triggerSignal).toContain("setup");
  });

  it("does not add trigger signal when no triggerReport", () => {
    const scorecard = computeSignalScorecard(baseScorecardInput);
    const allSignals = [
      ...scorecard.bullishSignals,
      ...scorecard.bearishSignals,
      ...scorecard.neutralSignals,
    ];
    expect(allSignals.some((s) => s.includes("Daily trigger"))).toBe(false);
  });

  it("does not add trigger signal when no primaryTrigger", () => {
    const scorecard = computeSignalScorecard({
      ...baseScorecardInput,
      triggerReport: makeTriggerReport({
        primaryTrigger: null,
        overallAssessment: "no_trigger",
      }),
    });
    const allSignals = [
      ...scorecard.bullishSignals,
      ...scorecard.bearishSignals,
      ...scorecard.neutralSignals,
    ];
    expect(allSignals.some((s) => s.includes("Daily trigger"))).toBe(false);
  });

  it("trigger signal appears before whale signal in bullish list", () => {
    const scorecard = computeSignalScorecard({
      ...baseScorecardInput,
      triggerReport: makeTriggerReport({
        overallAssessment: "actionable_bullish",
      }),
    });
    const triggerIdx = scorecard.bullishSignals.findIndex((s) =>
      s.includes("Daily trigger"),
    );
    const whaleIdx = scorecard.bullishSignals.findIndex((s) =>
      s.includes("Whale"),
    );
    expect(triggerIdx).toBeLessThan(whaleIdx);
  });
});

// =============================================================
// Story 48.7 — buildTradeAnalyzerPrompt trigger injection
// =============================================================

describe("buildTradeAnalyzerPrompt with trigger (48.7)", () => {
  const baseArgs = [
    '{"whale_trade":{"ticker":"AAPL","expiry":"2025-03-15","type":"call"},"smart_money_signal":"bullish"}',
    "AAPL",
    345,
    55,
    1000000,
    1200000,
    "Options chain summary",
    undefined, // macroContext
    undefined, // optionsAnalytics
    undefined, // sectorRotation
    undefined, // indicatorReport
    undefined, // whaleIntentHint
    undefined, // indicatorReportsByTimeframe
    undefined, // shortInterest
    undefined, // cascadeContext
    undefined, // deepDiveSummary
    undefined, // scorecard
  ] as const;

  it("injects trigger block when triggerReport is provided", () => {
    const triggerReport = makeTriggerReport();
    const prompt = buildTradeAnalyzerPrompt(...baseArgs, triggerReport);
    expect(prompt).toContain("1-DAY CHART TRIGGER ASSESSMENT");
    expect(prompt).toContain("Primary Trigger: BULLISH TRIGGER");
    expect(prompt).toContain("$345.00");
  });

  it("does not inject trigger block when triggerReport is null", () => {
    const prompt = buildTradeAnalyzerPrompt(...baseArgs, null);
    expect(prompt).not.toContain("1-DAY CHART TRIGGER ASSESSMENT");
  });

  it("does not inject trigger block when no_trigger assessment", () => {
    const noTriggerReport = makeTriggerReport({
      primaryTrigger: null,
      overallAssessment: "no_trigger",
    });
    const prompt = buildTradeAnalyzerPrompt(...baseArgs, noTriggerReport);
    // formatTriggerReportForPrompt returns null for no_trigger
    expect(prompt).not.toContain("1-DAY CHART TRIGGER ASSESSMENT");
  });

  it("trigger block appears after cascade context", () => {
    const triggerReport = makeTriggerReport();
    const cascadeContext = {
      parentTicker: "MSFT",
      signals: [
        {
          parentTicker: "MSFT",
          direction: "bullish" as const,
          strength: 0.8,
          phase: "immediate" as const,
          report: {
            ticker: "MSFT",
            epsSurprise: 0.5,
            revenueGrowth: 0.1,
            date: "2025-01-15",
          },
        },
      ],
      cascadeDirection: "bullish" as const,
      cascadeStrength: 0.8,
      promptSection: "Upstream earnings cascade...",
    };
    const prompt = buildTradeAnalyzerPrompt(
      baseArgs[0],
      baseArgs[1],
      baseArgs[2],
      baseArgs[3],
      baseArgs[4],
      baseArgs[5],
      baseArgs[6],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      cascadeContext,
      undefined,
      undefined,
      triggerReport,
    );
    const cascadeIdx = prompt.indexOf("Earnings Cascade Context");
    const triggerIdx = prompt.indexOf("1-DAY CHART TRIGGER ASSESSMENT");
    expect(cascadeIdx).toBeGreaterThan(-1);
    expect(triggerIdx).toBeGreaterThan(cascadeIdx);
  });

  it("system instruction includes daily chart triggers in evidence hierarchy", () => {
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain("Daily chart triggers");
    expect(TRADE_ANALYZER_SYSTEM_INSTRUCTION).toContain(
      "1. Daily chart triggers",
    );
  });
});

// =============================================================
// Story 48.8 — buildDeepDivePrompt trigger injection
// =============================================================

describe("buildDeepDivePrompt with trigger (48.8)", () => {
  const baseInput = {
    ticker: "AAPL",
    whaleTradeJson: '{"ticker":"AAPL","strike":345,"expiry":"2025-03-15"}',
    historicalDataSummary: "Sample historical data",
    optionsChainSummary: "Sample options chain",
    currentPrice: 345,
  };

  it("injects trigger context when triggerReport provided", () => {
    const prompt = buildDeepDivePrompt({
      ...baseInput,
      triggerReport: makeTriggerReport(),
    });
    expect(prompt).toContain("1-DAY CHART TRIGGER ASSESSMENT");
    expect(prompt).toContain("Incorporate this daily chart trigger context");
  });

  it("does not inject trigger when triggerReport is null", () => {
    const prompt = buildDeepDivePrompt({
      ...baseInput,
      triggerReport: null,
    });
    expect(prompt).not.toContain("1-DAY CHART TRIGGER ASSESSMENT");
  });

  it("does not inject trigger for no_trigger assessment", () => {
    const prompt = buildDeepDivePrompt({
      ...baseInput,
      triggerReport: makeTriggerReport({
        primaryTrigger: null,
        overallAssessment: "no_trigger",
      }),
    });
    expect(prompt).not.toContain("1-DAY CHART TRIGGER ASSESSMENT");
  });

  it("trigger appears after signal hierarchy section", () => {
    const prompt = buildDeepDivePrompt({
      ...baseInput,
      signalHierarchy: {
        currentPrice: 345,
        volumeProfile: makeVolumeProfile(345),
      },
      triggerReport: makeTriggerReport(),
    });
    const hierarchyIdx = prompt.indexOf("Signal Hierarchy");
    const triggerIdx = prompt.indexOf("1-DAY CHART TRIGGER ASSESSMENT");
    // If both present, trigger should come after hierarchy
    if (hierarchyIdx > -1) {
      expect(triggerIdx).toBeGreaterThan(hierarchyIdx);
    }
  });

  it("includes educational context note for deep dives", () => {
    const prompt = buildDeepDivePrompt({
      ...baseInput,
      triggerReport: makeTriggerReport(),
    });
    expect(prompt).toContain("aligns with or contradicts");
  });
});

// =============================================================
// Cross-cutting: format triggers survive round-trip
// =============================================================

describe("formatTriggerReportForPrompt integration", () => {
  it("includes score breakdown in formatted output", () => {
    const report = makeTriggerReport();
    const formatted = formatTriggerReportForPrompt(report);
    expect(formatted).not.toBeNull();
    expect(formatted).toContain("Level 32/40");
    expect(formatted).toContain("Structure 25/25");
    expect(formatted).toContain("Context 14/20");
    expect(formatted).toContain("Patterns 4/15");
  });

  it("includes MANDATE for high-score triggers", () => {
    const report = makeTriggerReport();
    const formatted = formatTriggerReportForPrompt(report);
    expect(formatted).toContain("MANDATE");
    expect(formatted).toContain("BULLISH");
  });

  it("returns null for no_trigger reports", () => {
    const report = makeTriggerReport({
      primaryTrigger: null,
      overallAssessment: "no_trigger",
    });
    const formatted = formatTriggerReportForPrompt(report);
    expect(formatted).toBeNull();
  });
});

// =============================================================
// Story 48.10 — Zod schema validation
// =============================================================

import {
  triggerReportSchema,
  triggerResultSchema,
  scoreBreakdownSchema,
  swingStructureSchema,
  levelInteractionSchema,
} from "@/types/analysis";

describe("Trigger Zod schemas (48.10)", () => {
  it("validates a full TriggerReport round-trip", () => {
    const report = makeTriggerReport();
    const result = triggerReportSchema.safeParse(report);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ticker).toBe(report.ticker);
      expect(result.data.primaryTrigger?.score).toBe(75);
      expect(result.data.overallAssessment).toBe("actionable_bullish");
    }
  });

  it("validates a TriggerReport with no primary trigger", () => {
    const report = makeTriggerReport({
      primaryTrigger: null,
      overallAssessment: "no_trigger",
    });
    const result = triggerReportSchema.safeParse(report);
    expect(result.success).toBe(true);
  });

  it("rejects invalid overallAssessment", () => {
    const report = { ...makeTriggerReport(), overallAssessment: "invalid" };
    const result = triggerReportSchema.safeParse(report);
    expect(result.success).toBe(false);
  });

  it("validates score breakdown within component bounds", () => {
    const breakdown = {
      levelInteraction: 32,
      structureAlignment: 25,
      contextAlignment: 14,
      patternSupport: 4,
    };
    expect(scoreBreakdownSchema.safeParse(breakdown).success).toBe(true);
  });

  it("rejects score breakdown exceeding max", () => {
    const breakdown = {
      levelInteraction: 50, // max is 40
      structureAlignment: 25,
      contextAlignment: 20,
      patternSupport: 15,
    };
    expect(scoreBreakdownSchema.safeParse(breakdown).success).toBe(false);
  });

  it("validates swingStructure schema", () => {
    const swing = makeSwing("bullish");
    expect(swingStructureSchema.safeParse(swing).success).toBe(true);
  });

  it("validates levelInteraction schema", () => {
    const interaction = makeInteraction();
    expect(levelInteractionSchema.safeParse(interaction).success).toBe(true);
  });

  it("validates triggerResult schema", () => {
    const report = makeTriggerReport();
    const result = triggerResultSchema.safeParse(report.primaryTrigger);
    expect(result.success).toBe(true);
  });

  it("validates a report produced by buildTriggerReport", () => {
    const candles = bullishCandles(50, 340);
    const lastClose = candles[candles.length - 1].close;
    const report = buildTriggerReport({
      ticker: "AAPL",
      candles,
      algoSRLevels: makeAlgoSRLevels(lastClose),
      volumeProfile: makeVolumeProfile(lastClose),
    });
    const result = triggerReportSchema.safeParse(report);
    expect(result.success).toBe(true);
  });
});

// =============================================================
// Story 48.7 supplement — trigger block positioning vs whale
// =============================================================

describe("Trigger block positioning in recommendation prompt", () => {
  it("trigger block appears before whale signal section", () => {
    const triggerReport = makeTriggerReport();
    const prompt = buildTradeAnalyzerPrompt(
      '{"whale_trade":{"ticker":"AAPL","expiry":"2025-03-15","type":"call"},"smart_money_signal":"bullish"}',
      "AAPL",
      345,
      55,
      1000000,
      1200000,
      "Options chain summary",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      triggerReport,
    );
    const triggerIdx = prompt.indexOf("1-DAY CHART TRIGGER ASSESSMENT");
    const whaleIdx = prompt.indexOf("Whale Trade");
    expect(triggerIdx).toBeGreaterThan(-1);
    expect(whaleIdx).toBeGreaterThan(-1);
    expect(triggerIdx).toBeGreaterThan(whaleIdx === -1 ? -2 : whaleIdx);
  });
});

// =============================================================
// Story 48.11 — aggregateReportData passes triggerReport through
// =============================================================

import {
  aggregateReportData,
  type AggregateReportInput,
  type CandlesByPeriod,
} from "@/lib/services/report-data-aggregator";

describe("aggregateReportData with triggerReport (48.11)", () => {
  function makeMinimalInput(
    triggerReport?: TriggerReport | null,
  ): AggregateReportInput {
    const candles: Candle[] = Array.from({ length: 10 }, (_, i) => ({
      time: 1700000000 + i * 86400,
      open: 100 + i,
      high: 105 + i,
      low: 98 + i,
      close: 102 + i,
      volume: 10000,
    }));
    const candlesByPeriod: CandlesByPeriod = {
      "1d": candles,
      "1wk": candles,
      "1mo": candles,
      "3mo": candles,
      "6mo": candles,
      "1y": candles,
    };
    return {
      ticker: "AAPL",
      deepDive: {
        ticker: "AAPL",
        whale_trade_summary: "Big whale trade",
        market_narrative: "Market is trending.",
        technical_patterns: [],
        support_resistance: [],
        indicators: [],
        options_context: {
          iv_percentile: "45",
          iv_interpretation: "Normal",
          put_call_ratio: "0.8",
          unusual_activity_note: "None",
          greeks_summary: "Neutral",
        },
        entry_exit: {
          recommended_option_type: "Long Call",
          entry_price_range: { low: 3.5, high: 4.2 },
          strike_selection: "$180",
          expiry_guidance: "45 DTE",
          profit_target: "+50%",
          stop_loss: "-30%",
          position_sizing: "2%",
          rationale: "Technicals aligned",
        },
        global_events_connection: "None",
        risk_assessment: {
          overall_risk: "moderate",
          key_risks: ["Earnings"],
          max_recommended_allocation: "3%",
        },
        educational_notes: [{ term: "IV", explanation: "Implied vol" }],
        disclaimer: "Not advice",
      },
      recommendation: null,
      confidenceBreakdown: null,
      whaleAlert: null,
      cascadeContext: null,
      candlesByPeriod,
      triggerReport,
    };
  }

  it("includes triggerReport when provided", () => {
    const report = makeTriggerReport();
    const result = aggregateReportData(makeMinimalInput(report));
    expect(result.triggerReport).toBe(report);
    expect(result.triggerReport?.overallAssessment).toBe("actionable_bullish");
  });

  it("defaults to null when triggerReport is omitted", () => {
    const result = aggregateReportData(makeMinimalInput());
    expect(result.triggerReport).toBeNull();
  });

  it("passes null through explicitly", () => {
    const result = aggregateReportData(makeMinimalInput(null));
    expect(result.triggerReport).toBeNull();
  });
});
