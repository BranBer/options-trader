import { describe, expect, it } from "vitest";
import { buildTriggerAnnotations } from "@/lib/utils/trigger-annotations";
import type { TriggerReport, TriggerResult } from "@/lib/utils/trigger-engine";
import type { LevelInteraction } from "@/lib/utils/level-interactions";
import type { SwingStructure } from "@/lib/utils/swing-structure";

function makeInteraction(
  type: LevelInteraction["type"],
  timeMs: number,
  level: number,
): LevelInteraction {
  return {
    level,
    levelLabel: `S/R ${level}`,
    type,
    candle: {
      time: timeMs,
      open: level - 1,
      high: level + 2,
      low: level - 2,
      close: level + 1,
    },
    confirmationCandle: null,
    wickOnly: false,
    distance: 0.4,
    confluence: 4,
  };
}

function makeTrigger(
  interaction: LevelInteraction,
  overrides: Partial<TriggerResult> = {},
): TriggerResult {
  return {
    direction: interaction.type === "rejection" ? "bearish" : "bullish",
    classification: "trigger",
    score: 72,
    scoreBreakdown: {
      levelInteraction: 32,
      structureAlignment: 20,
      contextAlignment: 12,
      patternSupport: 8,
    },
    interaction,
    structureContext: "bullish",
    htfAlignment: "aligned",
    confirmationType: "close_above",
    confidence: "high",
    summary: `${interaction.type} summary`,
    ...overrides,
  };
}

describe("buildTriggerAnnotations", () => {
  const swingStructure: SwingStructure = {
    swings: [],
    structure: "bullish",
    structureShift: null,
    lastHigherLow: null,
    lastLowerHigh: null,
  };

  it("returns a labeled annotation for the primary trigger", () => {
    const interaction = makeInteraction("bounce", 1_776_211_200_000, 205);
    const report: TriggerReport = {
      ticker: "AAPL",
      computedAt: new Date().toISOString(),
      primaryTrigger: makeTrigger(interaction),
      secondaryTriggers: [],
      activeLevels: [interaction],
      swingStructure,
      overallAssessment: "actionable_bullish",
    };

    const annotations = buildTriggerAnnotations(report);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].label).toBe("Bounce");
    expect(annotations[0].primary).toBe(true);
    expect(annotations[0].time).toBe(1_776_211_200);
  });

  it("preserves multiple same-day interactions without time dedupe", () => {
    const sameDayTime = 1_776_211_200_000;
    const reclaim = makeInteraction("reclaim", sameDayTime, 210);
    const bounce = makeInteraction("bounce", sameDayTime, 208);
    const report: TriggerReport = {
      ticker: "AAPL",
      computedAt: new Date().toISOString(),
      primaryTrigger: makeTrigger(reclaim),
      secondaryTriggers: [
        makeTrigger(bounce, {
          score: 61,
          summary: "bounce summary",
        }),
      ],
      activeLevels: [reclaim, bounce],
      swingStructure,
      overallAssessment: "actionable_bullish",
    };

    const annotations = buildTriggerAnnotations(report);
    expect(annotations).toHaveLength(2);
    expect(annotations.map((annotation) => annotation.label)).toEqual([
      "Reclaim",
      "Bounce",
    ]);
  });

  it("includes active interactions even when they are not in primary or secondary triggers", () => {
    const reclaim = makeInteraction("reclaim", 1_776_211_200_000, 210);
    const breakdown = makeInteraction("breakdown", 1_776_297_600_000, 202);
    const report: TriggerReport = {
      ticker: "AAPL",
      computedAt: new Date().toISOString(),
      primaryTrigger: makeTrigger(reclaim),
      secondaryTriggers: [],
      activeLevels: [reclaim, breakdown],
      swingStructure,
      overallAssessment: "actionable_bullish",
    };

    const annotations = buildTriggerAnnotations(report);
    expect(annotations).toHaveLength(2);
    expect(annotations[1].label).toBe("Breakdown");
    expect(annotations[1].classification).toBe("setup");
    expect(annotations[1].direction).toBe("bearish");
  });

  it("filters out test-only interactions", () => {
    const testInteraction = makeInteraction("test", 1_776_211_200_000, 205);
    const report: TriggerReport = {
      ticker: "AAPL",
      computedAt: new Date().toISOString(),
      primaryTrigger: null,
      secondaryTriggers: [],
      activeLevels: [testInteraction],
      swingStructure,
      overallAssessment: "setup_only",
    };

    expect(buildTriggerAnnotations(report)).toEqual([]);
  });
});
