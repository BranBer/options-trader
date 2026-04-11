import { describe, it, expect } from "vitest";
import {
  INDICATOR_FAMILY_COLORS,
  INDICATOR_FAMILY_LABELS,
  resolvePatternColor,
} from "@/components/charts/primitives/PatternMarkerHelper";
import {
  comparePatternChronology,
  formatPatternChronologyLabel,
} from "@/lib/utils/pattern-chronology";
import {
  layoutTopBarPills,
  resolveMarkerCollisions,
} from "@/components/charts/primitives/CalloutAnnotationPrimitive";
import type {
  CalloutEntry,
  PillLayout,
} from "@/components/charts/primitives/CalloutAnnotationPrimitive";
import type { TechnicalPattern } from "@/types/analysis";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makePattern(
  overrides: Partial<TechnicalPattern> = {},
): TechnicalPattern {
  return {
    name: "Test Pattern",
    type: "bullish",
    description: "test",
    confidence: 0.8,
    timeframe: null,
    price_target: null,
    drawing_type: "marker",
    start_time: "1700000000",
    end_time: "1700000000",
    start_price: 100,
    end_price: 100,
    secondary_start_price: null,
    secondary_end_price: null,
    indicator: null,
    ...overrides,
  };
}

function makeCalloutItem(
  label: string,
  chartY: number,
  chartX = 200,
): { entry: CalloutEntry; chartX: number; chartY: number } {
  return {
    entry: {
      label,
      color: "rgb(34,197,94)",
      time: 1000 as unknown as import("lightweight-charts").Time,
      price: 100,
      direction: "bullish" as const,
      id: `pattern-${chartY}`,
    },
    chartX,
    chartY,
  };
}

/** Fixed-width text measurer for deterministic layout tests */
function stubMeasure(_text: string, _font: string): number {
  return _text.length * 6;
}

// ---------------------------------------------------------------------------
// INDICATOR_FAMILY_COLORS
// ---------------------------------------------------------------------------

describe("INDICATOR_FAMILY_COLORS", () => {
  const REQUIRED_FAMILIES = [
    "ema",
    "bollinger",
    "rsi",
    "macd",
    "volume",
  ] as const;

  it("defines all five required indicator families", () => {
    for (const fam of REQUIRED_FAMILIES) {
      expect(INDICATOR_FAMILY_COLORS).toHaveProperty(fam);
      expect(INDICATOR_FAMILY_COLORS[fam]).toBeTruthy();
    }
  });

  it("assigns distinct colors to each family", () => {
    const colors = REQUIRED_FAMILIES.map((f) => INDICATOR_FAMILY_COLORS[f]);
    const unique = new Set(colors);
    expect(unique.size).toBe(REQUIRED_FAMILIES.length);
  });
});

// ---------------------------------------------------------------------------
// INDICATOR_FAMILY_LABELS
// ---------------------------------------------------------------------------

describe("INDICATOR_FAMILY_LABELS", () => {
  it("has a label for every color family entry", () => {
    for (const key of Object.keys(INDICATOR_FAMILY_COLORS)) {
      expect(INDICATOR_FAMILY_LABELS).toHaveProperty(key);
    }
  });
});

// ---------------------------------------------------------------------------
// resolvePatternColor
// ---------------------------------------------------------------------------

describe("resolvePatternColor", () => {
  it("returns the indicator-family color for an EMA pattern", () => {
    const p = makePattern({ type: "bullish", indicator: "ema" });
    expect(resolvePatternColor(p)).toBe(INDICATOR_FAMILY_COLORS.ema);
  });

  it("returns the indicator-family color for a RSI pattern", () => {
    const p = makePattern({ type: "bearish", indicator: "rsi" });
    expect(resolvePatternColor(p)).toBe(INDICATOR_FAMILY_COLORS.rsi);
  });

  it("falls back to signal color for AI patterns (indicator: 'ai')", () => {
    const bullishAI = makePattern({ type: "bullish", indicator: "ai" });
    const bearishAI = makePattern({ type: "bearish", indicator: "ai" });
    expect(resolvePatternColor(bullishAI)).not.toBe(
      INDICATOR_FAMILY_COLORS.ema,
    );
    expect(resolvePatternColor(bearishAI)).not.toBe(
      INDICATOR_FAMILY_COLORS.rsi,
    );
  });

  it("falls back to signal color when indicator is null (Gemini pattern)", () => {
    const p = makePattern({ type: "bullish", indicator: null });
    const familyColors = Object.values(INDICATOR_FAMILY_COLORS);
    expect(familyColors).not.toContain(resolvePatternColor(p));
  });
});

// ---------------------------------------------------------------------------
// formatPatternChronologyLabel
// ---------------------------------------------------------------------------

describe("formatPatternChronologyLabel", () => {
  it("formats intraday 1D timestamps as concise market time", () => {
    expect(formatPatternChronologyLabel("2026-03-10T14:35:00Z", "1d")).toBe(
      "10:35a",
    );
  });

  it("formats 10-digit Unix-seconds timestamps as time for 1D", () => {
    // 1773153300 = 2026-03-10T14:35:00Z — same instant as the ISO test above
    expect(formatPatternChronologyLabel("1773153300", "1d")).toBe("10:35a");
  });

  it("formats 1W timestamps with weekday and time for chronology", () => {
    expect(formatPatternChronologyLabel("2026-03-10T14:35:00Z", "1wk")).toBe(
      "Tue 10:35a",
    );
  });

  it("formats medium-range timestamps as month and day", () => {
    expect(formatPatternChronologyLabel("2026-03-10", "3mo")).toBe("Mar 10");
  });

  it("formats 1Y timestamps with month, day, and short year", () => {
    expect(formatPatternChronologyLabel("2026-03-10", "1y")).toBe("Mar 10 '26");
  });
});

describe("comparePatternChronology", () => {
  it("sorts patterns by detected time ascending", () => {
    const patterns = [
      makePattern({ name: "Late", end_time: "2026-03-12" }),
      makePattern({ name: "Early", end_time: "2026-03-10" }),
      makePattern({ name: "Mid", end_time: "2026-03-11" }),
    ];

    const sorted = [...patterns].sort(comparePatternChronology);

    expect(sorted.map((pattern) => pattern.name)).toEqual([
      "Early",
      "Mid",
      "Late",
    ]);
  });
});

// ---------------------------------------------------------------------------
// layoutTopBarPills (horizontal pill wrapping for top-bar legend)
// ---------------------------------------------------------------------------

describe("layoutTopBarPills", () => {
  it("returns pills with sequential 1-based order numbers", () => {
    const items = [
      makeCalloutItem("A", 100),
      makeCalloutItem("B", 200),
      makeCalloutItem("C", 300),
    ];
    const result = layoutTopBarPills(items, 800, stubMeasure);
    expect(result.map((p) => p.order)).toEqual([1, 2, 3]);
  });

  it("preserves entry and chart coordinates in output", () => {
    const items = [makeCalloutItem("Test", 150, 400)];
    const result = layoutTopBarPills(items, 800, stubMeasure);
    expect(result).toHaveLength(1);
    expect(result[0].entry.label).toBe("Test");
    expect(result[0].chartX).toBe(400);
    expect(result[0].chartY).toBe(150);
  });

  it("wraps pills to a new row when chart width is exceeded", () => {
    // Create wide pills in a narrow chart to force wrapping
    const items = [
      makeCalloutItem("LongPatternNameAlpha", 100),
      makeCalloutItem("LongPatternNameBravo", 200),
    ];
    const result = layoutTopBarPills(items, 200, stubMeasure);
    // Second pill should be on a different row (higher pillY)
    expect(result[1].pillY).toBeGreaterThan(result[0].pillY);
  });

  it("keeps all pills on one row when chart is wide enough", () => {
    const items = [
      makeCalloutItem("A", 100),
      makeCalloutItem("B", 200),
      makeCalloutItem("C", 300),
    ];
    const result = layoutTopBarPills(items, 2000, stubMeasure);
    const rows = new Set(result.map((p) => p.pillY));
    expect(rows.size).toBe(1);
  });

  it("handles empty input gracefully", () => {
    const result = layoutTopBarPills([], 800, stubMeasure);
    expect(result).toEqual([]);
  });

  it("assigns increasing pillX within the same row", () => {
    const items = [
      makeCalloutItem("A", 100),
      makeCalloutItem("B", 200),
      makeCalloutItem("C", 300),
    ];
    const result = layoutTopBarPills(items, 2000, stubMeasure);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].pillX).toBeGreaterThan(result[i - 1].pillX);
    }
  });
});

// ---------------------------------------------------------------------------
// resolveMarkerCollisions (spine stacking for overlapping markers)
// ---------------------------------------------------------------------------

/** Helper to build a PillLayout from chart coords */
function makePill(order: number, chartX: number, chartY: number): PillLayout {
  return {
    entry: {
      label: `Pattern ${order}`,
      color: "rgb(34,197,94)",
      time: 1000 as unknown as import("lightweight-charts").Time,
      price: 100,
      direction: "bullish" as const,
      id: `pattern-${order}`,
    },
    order,
    pillX: 0,
    pillY: 0,
    pillW: 100,
    chartX,
    chartY,
  };
}

describe("resolveMarkerCollisions", () => {
  it("returns empty arrays for empty input", () => {
    const { markers, spines } = resolveMarkerCollisions([]);
    expect(markers).toEqual([]);
    expect(spines).toEqual([]);
  });

  it("leaves isolated markers at their original positions", () => {
    const pills = [makePill(1, 100, 100), makePill(2, 300, 300)];
    const { markers, spines } = resolveMarkerCollisions(pills);
    expect(spines).toHaveLength(0);
    expect(markers[0].markerX).toBe(100);
    expect(markers[0].markerY).toBe(100);
    expect(markers[0].inCluster).toBe(false);
    expect(markers[1].markerX).toBe(300);
    expect(markers[1].markerY).toBe(300);
    expect(markers[1].inCluster).toBe(false);
  });

  it("fans overlapping markers vertically and creates a spine", () => {
    // Two markers at the exact same position → must collide
    const pills = [makePill(1, 200, 200), makePill(2, 200, 200)];
    const { markers, spines } = resolveMarkerCollisions(pills);
    expect(spines).toHaveLength(1);
    expect(markers[0].inCluster).toBe(true);
    expect(markers[1].inCluster).toBe(true);
    // They should be vertically separated
    expect(markers[0].markerY).not.toBe(markers[1].markerY);
    expect(
      Math.abs(markers[0].markerY - markers[1].markerY),
    ).toBeGreaterThanOrEqual(16);
  });

  it("centers the spine fan around the cluster centroid", () => {
    const pills = [
      makePill(1, 200, 200),
      makePill(2, 200, 200),
      makePill(3, 200, 200),
    ];
    const { markers } = resolveMarkerCollisions(pills);
    // Centroid Y=200, markers should be distributed symmetrically
    const avgY = markers.reduce((s, m) => s + m.markerY, 0) / markers.length;
    expect(avgY).toBeCloseTo(200, 0);
  });

  it("preserves order numbers in output", () => {
    const pills = [makePill(1, 200, 200), makePill(2, 200, 200)];
    const { markers } = resolveMarkerCollisions(pills);
    expect(markers[0].order).toBe(1);
    expect(markers[1].order).toBe(2);
  });

  it("does not cluster markers just outside collision distance", () => {
    // MARKER_RADIUS=7, COLLISION_DISTANCE=21. Place them far apart (50px).
    const pills = [makePill(1, 100, 100), makePill(2, 150, 100)];
    const { markers, spines } = resolveMarkerCollisions(pills);
    expect(spines).toHaveLength(0);
    expect(markers[0].inCluster).toBe(false);
    expect(markers[1].inCluster).toBe(false);
  });

  it("handles mixed clusters and isolated markers", () => {
    const pills = [
      makePill(1, 200, 200), // cluster A
      makePill(2, 200, 200), // cluster A
      makePill(3, 500, 100), // isolated
    ];
    const { markers, spines } = resolveMarkerCollisions(pills);
    expect(spines).toHaveLength(1);
    expect(markers[0].inCluster).toBe(true);
    expect(markers[1].inCluster).toBe(true);
    expect(markers[2].inCluster).toBe(false);
    expect(markers[2].markerX).toBe(500);
    expect(markers[2].markerY).toBe(100);
  });

  it("clamps spine markers within chart bounds when cluster is large", () => {
    // 10 markers at the same spot in a 200px chart — must not overflow
    const pills = Array.from({ length: 10 }, (_, i) =>
      makePill(i + 1, 200, 100),
    );
    const chartHeight = 200;
    const { markers, spines } = resolveMarkerCollisions(pills, chartHeight);
    expect(spines).toHaveLength(1);
    for (const m of markers) {
      expect(m.markerY).toBeGreaterThanOrEqual(0);
      expect(m.markerY).toBeLessThanOrEqual(chartHeight);
    }
    // Spacing should be compressed but still ordered
    for (let i = 1; i < markers.length; i++) {
      expect(markers[i].markerY).toBeGreaterThanOrEqual(markers[i - 1].markerY);
    }
  });

  it("compresses spacing rather than clipping when many collisions", () => {
    const pills = Array.from({ length: 20 }, (_, i) =>
      makePill(i + 1, 300, 150),
    );
    const chartHeight = 600;
    const { markers } = resolveMarkerCollisions(pills, chartHeight);
    // All markers visible and ordered
    for (let i = 0; i < markers.length; i++) {
      expect(markers[i].markerY).toBeGreaterThanOrEqual(0);
      expect(markers[i].markerY).toBeLessThanOrEqual(chartHeight);
    }
  });
});
