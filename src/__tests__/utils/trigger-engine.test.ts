import { describe, it, expect } from "vitest";
import {
  computeTriggerReport,
  formatTriggerReportForPrompt,
  type TriggerEngineInput,
  type TriggerReport,
} from "@/lib/utils/trigger-engine";
import type { LevelInteraction } from "@/lib/utils/level-interactions";
import type { SwingStructure, SwingPoint } from "@/lib/utils/swing-structure";
import type { IndicatorPatternReport } from "@/lib/utils/indicator-patterns";

// ---------- Factories ----------

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

function makeDailyReport(
  recentBullish: number = 0,
  recentBearish: number = 0,
  comboBullish: boolean = false,
): IndicatorPatternReport {
  const patterns = [];
  for (let i = 0; i < recentBullish; i++) {
    patterns.push({
      indicator: "ema" as const,
      name: `Bullish pattern ${i}`,
      patternId: `bp_${i}`,
      signal: "bullish" as const,
      confidence: 0.8,
      detectedAt: 58,
      description: "test",
      isRecent: true,
    });
  }
  for (let i = 0; i < recentBearish; i++) {
    patterns.push({
      indicator: "macd" as const,
      name: `Bearish pattern ${i}`,
      patternId: `brp_${i}`,
      signal: "bearish" as const,
      confidence: 0.8,
      detectedAt: 58,
      description: "test",
      isRecent: true,
    });
  }
  const combinations = comboBullish
    ? [
        {
          name: "Golden cross + volume",
          patternId: "combo_1",
          signal: "bullish" as const,
          confidence: 0.9,
          description: "test combo",
          constituentPatternIds: ["bp_0", "bp_1"],
          educationalNote: "",
        },
      ]
    : [];

  return {
    ticker: "AAPL",
    timeframe: "1D",
    patterns,
    combinations,
    aggregateSignal: {
      direction:
        recentBullish > recentBearish
          ? "bullish"
          : recentBearish > 0
            ? "bearish"
            : "neutral",
      strength: 0.6,
      summary: "daily",
    },
    computedAt: new Date().toISOString(),
  };
}

function makeInput(
  overrides: Partial<TriggerEngineInput> = {},
): TriggerEngineInput {
  return {
    ticker: "AAPL",
    interactions: [makeInteraction()],
    swingStructure: makeSwing("bullish"),
    dailyPatterns: makeDailyReport(2, 0, true),
    htfPatterns: [
      makeHTFReport("bullish", "1W"),
      makeHTFReport("bullish", "1M"),
      makeHTFReport("bullish", "3M"),
    ],
    ...overrides,
  };
}

// ==========================================================================
// Story 48.4 — Trigger Validation Cascade
// ==========================================================================

describe("Story 48.4 — Trigger Validation Cascade", () => {
  it("bullish reclaim + bullish structure + close-based = trigger with score ≥70", () => {
    const report = computeTriggerReport(makeInput());
    expect(report.primaryTrigger).not.toBeNull();
    expect(report.primaryTrigger!.classification).toBe("trigger");
    expect(report.primaryTrigger!.direction).toBe("bullish");
    expect(report.primaryTrigger!.score).toBeGreaterThanOrEqual(70);
  });

  it("same reclaim in bearish structure = weak_trigger with countertrend", () => {
    const report = computeTriggerReport(
      makeInput({ swingStructure: makeSwing("bearish") }),
    );
    expect(report.primaryTrigger).not.toBeNull();
    expect(report.primaryTrigger!.classification).toBe("weak_trigger");
    expect(report.primaryTrigger!.structureContext).toBe("bearish");
  });

  it("wick-only bounce with no follow-through = setup (gate 3 fails)", () => {
    const report = computeTriggerReport(
      makeInput({
        interactions: [
          makeInteraction({
            type: "bounce",
            wickOnly: true,
            confirmationCandle: null,
          }),
        ],
      }),
    );
    expect(report.primaryTrigger).not.toBeNull();
    expect(report.primaryTrigger!.classification).toBe("setup");
  });

  it("no level interaction = no_trigger", () => {
    const report = computeTriggerReport(makeInput({ interactions: [] }));
    expect(report.primaryTrigger).toBeNull();
    expect(report.overallAssessment).toBe("no_trigger");
  });

  it("test-only interaction = no_trigger", () => {
    const report = computeTriggerReport(
      makeInput({
        interactions: [makeInteraction({ type: "test" })],
      }),
    );
    expect(report.primaryTrigger!.classification).toBe("no_trigger");
  });

  it("bearish breakdown + bearish structure = trigger", () => {
    const report = computeTriggerReport(
      makeInput({
        interactions: [
          makeInteraction({
            type: "breakdown",
            levelLabel: "S/R 360 (3★)",
            level: 360,
            confluence: 3,
          }),
        ],
        swingStructure: makeSwing("bearish"),
        dailyPatterns: makeDailyReport(0, 2, false),
        htfPatterns: [
          makeHTFReport("bearish", "1W"),
          makeHTFReport("bearish", "1M"),
          makeHTFReport("bearish", "3M"),
        ],
      }),
    );
    expect(report.primaryTrigger!.classification).toBe("trigger");
    expect(report.primaryTrigger!.direction).toBe("bearish");
  });

  it("bullish trigger in consolidation structure passes gate 2 (not bearish)", () => {
    const report = computeTriggerReport(
      makeInput({ swingStructure: makeSwing("consolidation") }),
    );
    expect(report.primaryTrigger!.classification).toBe("trigger");
    expect(report.primaryTrigger!.structureContext).toBe("consolidation");
  });

  it("bullish trigger in transition structure passes gate 2", () => {
    const report = computeTriggerReport(
      makeInput({ swingStructure: makeSwing("transition") }),
    );
    expect(report.primaryTrigger!.classification).toBe("trigger");
  });

  it("sorts multiple triggers by score (highest first)", () => {
    const strong = makeInteraction({ confluence: 5, level: 345 });
    const weak = makeInteraction({
      confluence: 1,
      type: "rejection",
      level: 360,
      levelLabel: "S/R 360 (1★)",
    });
    const report = computeTriggerReport(
      makeInput({ interactions: [weak, strong] }),
    );
    expect(report.primaryTrigger!.score).toBeGreaterThanOrEqual(
      report.secondaryTriggers[0]?.score ?? 0,
    );
  });

  it("overall assessment is actionable_bullish for strong bullish trigger", () => {
    const report = computeTriggerReport(makeInput());
    expect(report.overallAssessment).toBe("actionable_bullish");
  });

  it("overall assessment is actionable_bearish for strong bearish trigger", () => {
    const report = computeTriggerReport(
      makeInput({
        interactions: [
          makeInteraction({
            type: "breakdown",
            confluence: 4,
          }),
        ],
        swingStructure: makeSwing("bearish"),
        dailyPatterns: makeDailyReport(0, 2, false),
        htfPatterns: [
          makeHTFReport("bearish", "1W"),
          makeHTFReport("bearish", "1M"),
          makeHTFReport("bearish", "3M"),
        ],
      }),
    );
    expect(report.overallAssessment).toBe("actionable_bearish");
  });

  it("conflicted assessment when opposing strong triggers exist", () => {
    const bullish = makeInteraction({
      type: "reclaim",
      confluence: 4,
      level: 345,
      levelLabel: "S/R 345 (4★)",
    });
    const bearish = makeInteraction({
      type: "breakdown",
      confluence: 4,
      level: 360,
      levelLabel: "S/R 360 (4★)",
    });
    // Neutral HTF + consolidation so neither side is suppressed
    const report = computeTriggerReport(
      makeInput({
        interactions: [bullish, bearish],
        swingStructure: makeSwing("consolidation"),
        dailyPatterns: makeDailyReport(1, 1, false),
        htfPatterns: [
          makeHTFReport("neutral", "1W"),
          makeHTFReport("neutral", "1M"),
        ],
      }),
    );
    expect(report.overallAssessment).toBe("conflicted");
  });

  it("setup_only when trigger is just a setup", () => {
    const report = computeTriggerReport(
      makeInput({
        interactions: [
          makeInteraction({
            type: "bounce",
            wickOnly: true,
            confirmationCandle: null,
          }),
        ],
      }),
    );
    expect(report.overallAssessment).toBe("setup_only");
  });

  it("preserves activeLevels and swingStructure in report", () => {
    const input = makeInput();
    const report = computeTriggerReport(input);
    expect(report.activeLevels).toBe(input.interactions);
    expect(report.swingStructure).toBe(input.swingStructure);
    expect(report.ticker).toBe("AAPL");
  });

  it("handles null dailyPatterns gracefully", () => {
    const report = computeTriggerReport(makeInput({ dailyPatterns: null }));
    expect(report.primaryTrigger).not.toBeNull();
    expect(report.primaryTrigger!.scoreBreakdown.patternSupport).toBe(0);
  });
});

// ==========================================================================
// Story 48.5 — Scoring Model
// ==========================================================================

describe("Story 48.5 — Scoring Model", () => {
  it("high-confluence reclaim with full alignment scores ≥75", () => {
    const report = computeTriggerReport(makeInput());
    expect(report.primaryTrigger!.score).toBeGreaterThanOrEqual(75);
  });

  it("low-confluence wick-only countertrend scores <40", () => {
    const report = computeTriggerReport(
      makeInput({
        interactions: [
          makeInteraction({
            confluence: 1,
            wickOnly: true,
            confirmationCandle: null,
            type: "bounce",
          }),
        ],
        swingStructure: makeSwing("bearish"),
        dailyPatterns: makeDailyReport(0, 0),
        htfPatterns: [
          makeHTFReport("bearish", "1W"),
          makeHTFReport("bearish", "1M"),
        ],
      }),
    );
    expect(report.primaryTrigger!.score).toBeLessThan(40);
  });

  it("score breakdown sums to total score", () => {
    const report = computeTriggerReport(makeInput());
    const bd = report.primaryTrigger!.scoreBreakdown;
    const total =
      bd.levelInteraction +
      bd.structureAlignment +
      bd.contextAlignment +
      bd.patternSupport;
    expect(report.primaryTrigger!.score).toBe(total);
  });

  it("level interaction score: 5★ = 40", () => {
    const report = computeTriggerReport(
      makeInput({
        interactions: [makeInteraction({ confluence: 5 })],
      }),
    );
    expect(report.primaryTrigger!.scoreBreakdown.levelInteraction).toBe(40);
  });

  it("level interaction score: 1★ = 8, minus 10 for wick-only = 0 (clamped)", () => {
    const report = computeTriggerReport(
      makeInput({
        interactions: [makeInteraction({ confluence: 1, wickOnly: true })],
      }),
    );
    // 1*8 = 8, minus 10 for wick = max(0, -2) = 0
    expect(
      report.primaryTrigger!.scoreBreakdown.levelInteraction,
    ).toBeLessThanOrEqual(0);
  });

  it("VPOC label gets +5 bonus", () => {
    const withVpoc = computeTriggerReport(
      makeInput({
        interactions: [makeInteraction({ confluence: 2, levelLabel: "VPOC" })],
      }),
    );
    const without = computeTriggerReport(
      makeInput({
        interactions: [
          makeInteraction({ confluence: 2, levelLabel: "S/R 345 (2★)" }),
        ],
      }),
    );
    expect(
      withVpoc.primaryTrigger!.scoreBreakdown.levelInteraction -
        without.primaryTrigger!.scoreBreakdown.levelInteraction,
    ).toBe(5);
  });

  it("structure: full alignment = 25, consolidation = 15, countertrend = 5", () => {
    const aligned = computeTriggerReport(
      makeInput({ swingStructure: makeSwing("bullish") }),
    );
    const consol = computeTriggerReport(
      makeInput({ swingStructure: makeSwing("consolidation") }),
    );
    const counter = computeTriggerReport(
      makeInput({ swingStructure: makeSwing("bearish") }),
    );

    expect(aligned.primaryTrigger!.scoreBreakdown.structureAlignment).toBe(25);
    expect(consol.primaryTrigger!.scoreBreakdown.structureAlignment).toBe(15);
    expect(counter.primaryTrigger!.scoreBreakdown.structureAlignment).toBe(5);
  });

  it("context: all HTF aligned = 20, all opposed = 3", () => {
    const aligned = computeTriggerReport(
      makeInput({
        htfPatterns: [
          makeHTFReport("bullish", "1W"),
          makeHTFReport("bullish", "1M"),
          makeHTFReport("bullish", "3M"),
        ],
      }),
    );
    const opposed = computeTriggerReport(
      makeInput({
        htfPatterns: [
          makeHTFReport("bearish", "1W"),
          makeHTFReport("bearish", "1M"),
          makeHTFReport("bearish", "3M"),
        ],
      }),
    );

    expect(aligned.primaryTrigger!.scoreBreakdown.contextAlignment).toBe(20);
    expect(opposed.primaryTrigger!.scoreBreakdown.contextAlignment).toBe(3);
  });

  it("pattern support: combo + recent = 15, single recent = 5, none = 0", () => {
    const combo = computeTriggerReport(
      makeInput({ dailyPatterns: makeDailyReport(2, 0, true) }),
    );
    const single = computeTriggerReport(
      makeInput({ dailyPatterns: makeDailyReport(1, 0, false) }),
    );
    const none = computeTriggerReport(
      makeInput({ dailyPatterns: makeDailyReport(0, 0, false) }),
    );

    expect(combo.primaryTrigger!.scoreBreakdown.patternSupport).toBe(15);
    expect(single.primaryTrigger!.scoreBreakdown.patternSupport).toBe(5);
    expect(none.primaryTrigger!.scoreBreakdown.patternSupport).toBe(0);
  });

  it("confidence: ≥70 = high, 55-69 = moderate, <55 = low", () => {
    const high = computeTriggerReport(makeInput());
    expect(high.primaryTrigger!.score).toBeGreaterThanOrEqual(70);
    expect(high.primaryTrigger!.confidence).toBe("high");

    const low = computeTriggerReport(
      makeInput({
        interactions: [
          makeInteraction({
            confluence: 1,
            wickOnly: true,
            confirmationCandle: null,
            type: "bounce",
          }),
        ],
        swingStructure: makeSwing("bearish"),
        dailyPatterns: null,
        htfPatterns: [makeHTFReport("bearish", "1W")],
      }),
    );
    expect(low.primaryTrigger!.score).toBeLessThan(55);
    expect(low.primaryTrigger!.confidence).toBe("low");
  });
});

// ==========================================================================
// Prompt Formatting
// ==========================================================================

describe("formatTriggerReportForPrompt", () => {
  it("returns null when no trigger", () => {
    const report = computeTriggerReport(makeInput({ interactions: [] }));
    expect(formatTriggerReportForPrompt(report)).toBeNull();
  });

  it("includes primary trigger details", () => {
    const report = computeTriggerReport(makeInput());
    const text = formatTriggerReportForPrompt(report)!;
    expect(text).toContain("1-DAY CHART TRIGGER ASSESSMENT");
    expect(text).toContain("BULLISH");
    expect(text).toContain("345");
    expect(text).toContain("S/R 345");
  });

  it("includes MANDATE for score ≥55", () => {
    const report = computeTriggerReport(makeInput());
    const text = formatTriggerReportForPrompt(report)!;
    expect(text).toContain("MANDATE");
  });

  it("includes score breakdown", () => {
    const report = computeTriggerReport(makeInput());
    const text = formatTriggerReportForPrompt(report)!;
    expect(text).toContain("/40");
    expect(text).toContain("/25");
    expect(text).toContain("/20");
    expect(text).toContain("/15");
  });

  it("includes swing structure summary", () => {
    const report = computeTriggerReport(makeInput());
    const text = formatTriggerReportForPrompt(report)!;
    expect(text).toContain("Swing Structure");
  });
});
