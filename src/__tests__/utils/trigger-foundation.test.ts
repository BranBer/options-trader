import { describe, it, expect } from "vitest";
import {
  detectSwings,
  classifyStructure,
  analyzeSwingStructure,
  type SwingPoint,
} from "@/lib/utils/swing-structure";
import {
  detectLevelInteraction,
  detectAllLevelInteractions,
  type KeyLevel,
} from "@/lib/utils/level-interactions";
import { analyzeValueAreaInteractions } from "@/lib/utils/value-area-interactions";
import type { Candle } from "@/lib/utils/technical-indicators";
import type { VolumeProfile } from "@/lib/utils/volume-profile";

// ---------- Candle factory ----------

/** Build a simple candle at a given index, with optional customization */
function c(
  index: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number = 1000,
): Candle {
  return {
    time: 1_700_000_000_000 + index * 86_400_000,
    open,
    high,
    low,
    close,
    volume,
  };
}

/**
 * Build a trending candle series: starts at `start`, ends at approximately
 * `start + count * step`. Returns candles with some natural noise added.
 */
function trendingCandles(
  start: number,
  step: number,
  count: number,
  startIndex: number = 0,
): Candle[] {
  const candles: Candle[] = [];
  let price = start;
  for (let i = 0; i < count; i++) {
    const noise = Math.sin(i * 1.7) * Math.abs(step) * 0.3;
    const o = price + noise * 0.5;
    const cl = price + step + noise * 0.5;
    const h = Math.max(o, cl) + Math.abs(step) * 0.3;
    const l = Math.min(o, cl) - Math.abs(step) * 0.3;
    candles.push(c(startIndex + i, o, h, l, cl));
    price = cl;
  }
  return candles;
}

// ==========================================================================
// Story 48.1 — Swing Structure Detection
// ==========================================================================

describe("Story 48.1 — detectSwings", () => {
  it("returns empty for insufficient data", () => {
    const candles = [c(0, 100, 102, 98, 101), c(1, 101, 103, 99, 102)];
    expect(detectSwings(candles)).toEqual([]);
  });

  it("detects a clear swing high", () => {
    // Pattern: rising, peak at index 5, then falling — with order=2
    const candles = [
      c(0, 100, 101, 99, 100),
      c(1, 100, 103, 99, 102),
      c(2, 102, 106, 101, 105),
      c(3, 105, 112, 104, 110),
      c(4, 110, 118, 109, 116), // peak approaches
      c(5, 116, 125, 115, 123), // swing high
      c(6, 123, 122, 112, 114),
      c(7, 114, 115, 105, 107),
      c(8, 107, 108, 98, 100),
    ];
    const swings = detectSwings(candles, 2, 0.1);
    const highs = swings.filter((s) => s.type === "high");
    expect(highs.length).toBeGreaterThanOrEqual(1);
    expect(highs.some((h) => h.index === 5)).toBe(true);
  });

  it("detects a clear swing low", () => {
    const candles = [
      c(0, 120, 121, 119, 120),
      c(1, 120, 119, 115, 116),
      c(2, 116, 115, 110, 111),
      c(3, 111, 110, 103, 105), // swing low
      c(4, 105, 108, 104, 107),
      c(5, 107, 113, 106, 112),
      c(6, 112, 118, 111, 117),
    ];
    const swings = detectSwings(candles, 2, 0.1);
    const lows = swings.filter((s) => s.type === "low");
    expect(lows.length).toBeGreaterThanOrEqual(1);
    expect(lows.some((l) => l.index === 3)).toBe(true);
  });

  it("filters out noise swings below ATR threshold", () => {
    // Flat market with minor wiggles — no meaningful swings
    const candles: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      const base = 100 + Math.sin(i * 0.5) * 0.3; // tiny oscillation
      candles.push(c(i, base, base + 0.1, base - 0.1, base));
    }
    const swings = detectSwings(candles, 3, 0.5);
    expect(swings.length).toBe(0);
  });
});

describe("Story 48.1 — classifyStructure", () => {
  it("classifies HH+HL sequence as bullish", () => {
    const swings: SwingPoint[] = [
      { type: "low", price: 100, time: 1, index: 0 },
      { type: "high", price: 110, time: 2, index: 1 },
      { type: "low", price: 105, time: 3, index: 2 }, // HL
      { type: "high", price: 115, time: 4, index: 3 }, // HH
      { type: "low", price: 108, time: 5, index: 4 }, // HL
      { type: "high", price: 120, time: 6, index: 5 }, // HH
    ];
    const result = classifyStructure(swings);
    expect(result.structure).toBe("bullish");
    expect(result.lastHigherLow).not.toBeNull();
  });

  it("classifies LH+LL sequence as bearish", () => {
    const swings: SwingPoint[] = [
      { type: "high", price: 120, time: 1, index: 0 },
      { type: "low", price: 110, time: 2, index: 1 },
      { type: "high", price: 115, time: 3, index: 2 }, // LH
      { type: "low", price: 105, time: 4, index: 3 }, // LL
      { type: "high", price: 110, time: 5, index: 4 }, // LH
      { type: "low", price: 100, time: 6, index: 5 }, // LL
    ];
    const result = classifyStructure(swings);
    expect(result.structure).toBe("bearish");
    expect(result.lastLowerHigh).not.toBeNull();
  });

  it("detects transition from bullish when first LH appears", () => {
    const swings: SwingPoint[] = [
      { type: "low", price: 100, time: 1, index: 0 },
      { type: "high", price: 110, time: 2, index: 1 },
      { type: "low", price: 105, time: 3, index: 2 }, // HL
      { type: "high", price: 120, time: 4, index: 3 }, // HH
      { type: "low", price: 112, time: 5, index: 4 }, // HL
      { type: "high", price: 118, time: 6, index: 5 }, // LH! break
    ];
    const result = classifyStructure(swings);
    expect(result.structure).toBe("transition");
    expect(result.structureShift).not.toBeNull();
    expect(result.structureShift!.from).toBe("bullish");
  });

  it("detects transition from bearish when first HL appears", () => {
    const swings: SwingPoint[] = [
      { type: "high", price: 120, time: 1, index: 0 },
      { type: "low", price: 110, time: 2, index: 1 },
      { type: "high", price: 115, time: 3, index: 2 }, // LH
      { type: "low", price: 100, time: 4, index: 3 }, // LL
      { type: "high", price: 108, time: 5, index: 4 }, // LH
      { type: "low", price: 103, time: 6, index: 5 }, // HL! break
    ];
    const result = classifyStructure(swings);
    expect(result.structure).toBe("transition");
    expect(result.structureShift).not.toBeNull();
    expect(result.structureShift!.from).toBe("bearish");
  });

  it("classifies mixed swings as consolidation", () => {
    const swings: SwingPoint[] = [
      { type: "low", price: 100, time: 1, index: 0 },
      { type: "high", price: 110, time: 2, index: 1 },
      { type: "low", price: 98, time: 3, index: 2 }, // LL
      { type: "high", price: 112, time: 4, index: 3 }, // HH
      { type: "low", price: 102, time: 5, index: 4 }, // HL
      { type: "high", price: 108, time: 6, index: 5 }, // LH
    ];
    const result = classifyStructure(swings);
    expect(["consolidation", "transition"]).toContain(result.structure);
  });

  it("returns consolidation for too few swings", () => {
    const swings: SwingPoint[] = [
      { type: "low", price: 100, time: 1, index: 0 },
      { type: "high", price: 110, time: 2, index: 1 },
    ];
    expect(classifyStructure(swings).structure).toBe("consolidation");
  });

  it("analyzeSwingStructure integrates detection + classification", () => {
    // Build an uptrend with clear pullbacks so Williams fractals can form
    // Pattern: rise 5, pull back 2, rise 5, pull back 2 ...
    const candles: Candle[] = [];
    let base = 100;
    let idx = 0;
    for (let wave = 0; wave < 6; wave++) {
      // Up leg
      for (let i = 0; i < 5; i++) {
        base += 3;
        candles.push(c(idx++, base - 1, base + 2, base - 2, base));
      }
      // Pullback leg
      for (let i = 0; i < 3; i++) {
        base -= 2;
        candles.push(c(idx++, base + 1, base + 2, base - 2, base));
      }
    }
    const result = analyzeSwingStructure(candles, 2);
    expect(result.swings.length).toBeGreaterThan(0);
    // Uptrend should be bullish or at least not bearish
    expect(result.structure).not.toBe("bearish");
  });
});

// ==========================================================================
// Story 48.2 — Level Interaction Detection
// ==========================================================================

describe("Story 48.2 — detectLevelInteraction", () => {
  const support: KeyLevel = {
    price: 345,
    label: "S/R 345 (3★)",
    type: "support",
  };
  const resistance: KeyLevel = {
    price: 360,
    label: "S/R 360 (4★)",
    type: "resistance",
  };

  it("detects reclaim: closed below then above the level", () => {
    // Only 2 candles so acceptance (needs 3) doesn't intercept
    const candles: Candle[] = [
      c(0, 340, 342, 338, 340), // below
      c(1, 340, 348, 339, 347), // reclaimed above 345
    ];
    const int = detectLevelInteraction(candles, support);
    expect(int).not.toBeNull();
    expect(int!.type).toBe("reclaim");
    expect(int!.wickOnly).toBe(false);
  });

  it("detects rejection: wicked above but closed below", () => {
    const candles: Candle[] = [
      c(0, 340, 342, 338, 340), // below
      c(1, 340, 341, 338, 339), // below
      c(2, 339, 347, 338, 342), // wicked above 345 but closed below
    ];
    const int = detectLevelInteraction(candles, support);
    expect(int).not.toBeNull();
    expect(int!.type).toBe("rejection");
  });

  it("detects breakdown: was above, closed below", () => {
    // Only 2 candles so acceptance_below (needs 3) doesn't intercept
    const candles: Candle[] = [
      c(0, 365, 367, 363, 365), // above 360
      c(1, 365, 364, 355, 357), // broke below 360
    ];
    const int = detectLevelInteraction(candles, resistance);
    expect(int).not.toBeNull();
    expect(int!.type).toBe("breakdown");
    expect(int!.wickOnly).toBe(false);
  });

  it("detects bounce: wicked below but closed above", () => {
    const candles: Candle[] = [
      c(0, 365, 367, 363, 365), // above 360
      c(1, 365, 366, 362, 364), // above
      c(2, 364, 365, 358, 363), // wicked below 360 but closed above
    ];
    const int = detectLevelInteraction(candles, resistance);
    expect(int).not.toBeNull();
    expect(int!.type).toBe("bounce");
  });

  it("detects test: price is near level but unresolved", () => {
    const candles: Candle[] = [
      c(0, 343, 344, 342, 343),
      c(1, 343, 345, 342, 344),
      c(2, 344, 346, 343, 345.5), // very near 345
    ];
    const int = detectLevelInteraction(candles, support);
    expect(int).not.toBeNull();
    expect(int!.type).toBe("test");
  });

  it("detects acceptance_above: 2 consecutive closes above after crossing", () => {
    const candles: Candle[] = [
      c(0, 340, 342, 338, 341), // below 345
      c(1, 341, 348, 340, 347), // above 345
      c(2, 347, 350, 346, 349), // above 345 (2nd consecutive)
    ];
    const int = detectLevelInteraction(candles, support);
    expect(int).not.toBeNull();
    expect(int!.type).toBe("acceptance_above");
  });

  it("detects acceptance_below: 2 consecutive closes below after crossing", () => {
    const candles: Candle[] = [
      c(0, 365, 367, 363, 365), // above 360
      c(1, 365, 364, 355, 357), // below 360
      c(2, 357, 358, 354, 355), // below 360 (2nd consecutive)
    ];
    const int = detectLevelInteraction(candles, resistance);
    expect(int).not.toBeNull();
    expect(int!.type).toBe("acceptance_below");
  });

  it("returns null for no interaction when price is far from level", () => {
    const candles: Candle[] = [
      c(0, 400, 402, 398, 401),
      c(1, 401, 403, 399, 402),
      c(2, 402, 404, 400, 403),
    ];
    const int = detectLevelInteraction(candles, support);
    expect(int).toBeNull();
  });

  it("computes distance correctly", () => {
    const candles: Candle[] = [
      c(0, 340, 342, 338, 340),
      c(1, 340, 348, 340, 347),
      c(2, 347, 350, 346, 349), // closed at 349, level at 345
    ];
    const int = detectLevelInteraction(candles, support);
    expect(int).not.toBeNull();
    expect(int!.distance).toBeCloseTo(((349 - 345) / 345) * 100, 1);
  });

  it("detectAllLevelInteractions sorts by significance", () => {
    const levels: KeyLevel[] = [
      { price: 345, label: "S 345", type: "support" },
      { price: 360, label: "R 360", type: "resistance" },
    ];
    // Price reclaimed 345 and is now testing 360
    const candles: Candle[] = [
      c(0, 340, 342, 338, 340),
      c(1, 341, 348, 340, 347),
      c(2, 347, 350, 346, 349),
      c(3, 349, 361, 348, 359.5), // near 360
    ];
    const results = detectAllLevelInteractions(candles, levels);
    expect(results.length).toBeGreaterThanOrEqual(1);
    // Acceptance/reclaim should sort before test
    if (results.length > 1) {
      const typeOrder = {
        acceptance_above: 0,
        acceptance_below: 0,
        reclaim: 1,
        breakdown: 1,
        bounce: 2,
        rejection: 2,
        test: 3,
      };
      expect(typeOrder[results[0].type]).toBeLessThanOrEqual(
        typeOrder[results[1].type],
      );
    }
  });

  it("handles string timestamps", () => {
    const candles: Candle[] = [
      {
        time: "2026-04-10",
        open: 340,
        high: 342,
        low: 338,
        close: 340,
        volume: 1000,
      },
      {
        time: "2026-04-11",
        open: 340,
        high: 348,
        low: 340,
        close: 347,
        volume: 1000,
      },
      {
        time: "2026-04-12",
        open: 347,
        high: 350,
        low: 346,
        close: 349,
        volume: 1000,
      },
    ];
    const int = detectLevelInteraction(candles, support);
    expect(int).not.toBeNull();
    expect(int!.candle.time).toBeGreaterThan(0);
  });
});

// ==========================================================================
// Story 48.3 — Value Area Interaction Detection
// ==========================================================================

describe("Story 48.3 — analyzeValueAreaInteractions", () => {
  const mockProfile: VolumeProfile = {
    buckets: [],
    vpoc: 350,
    valueAreaHigh: 355,
    valueAreaLow: 345,
    hvn: [],
    lvn: [],
    totalVolume: 1_000_000,
  };

  it("labels context as inside_value when price is within VA", () => {
    const candles: Candle[] = [
      c(0, 349, 351, 348, 350),
      c(1, 350, 352, 349, 351),
      c(2, 351, 353, 350, 352),
    ];
    const result = analyzeValueAreaInteractions(candles, mockProfile);
    expect(result.context).toBe("inside_value");
  });

  it("labels context as above_value when price is above VAH", () => {
    const candles: Candle[] = [
      c(0, 356, 358, 355, 357),
      c(1, 357, 359, 356, 358),
      c(2, 358, 360, 357, 359),
    ];
    const result = analyzeValueAreaInteractions(candles, mockProfile);
    expect(result.context).toBe("above_value");
  });

  it("labels context as below_value when price is below VAL", () => {
    const candles: Candle[] = [
      c(0, 342, 344, 341, 343),
      c(1, 343, 344, 341, 342),
      c(2, 342, 343, 340, 341),
    ];
    const result = analyzeValueAreaInteractions(candles, mockProfile);
    expect(result.context).toBe("below_value");
  });

  it("detects value area re-entry", () => {
    // Was inside → went above VAH → came back inside
    const candles: Candle[] = [
      c(0, 348, 352, 347, 351), // inside
      c(1, 351, 358, 350, 357), // above VAH (355)
      c(2, 357, 358, 349, 352), // back inside
    ];
    const result = analyzeValueAreaInteractions(candles, mockProfile);
    expect(result.reEntry).toBe(true);
  });

  it("detects failed breakout (exit + immediate re-entry)", () => {
    // Inside → outside → back inside = failed breakout
    const candles: Candle[] = [
      c(0, 349, 352, 348, 351), // inside
      c(1, 351, 358, 350, 357), // above VAH
      c(2, 357, 358, 349, 352), // back inside
    ];
    const result = analyzeValueAreaInteractions(candles, mockProfile);
    expect(result.failedBreakout).toBe(true);
  });

  it("detects VPOC magnet when converging toward VPOC", () => {
    // VPOC at 350, price converging from 360 area
    const candles: Candle[] = [
      c(0, 358, 360, 357, 359), // far from VPOC
      c(1, 359, 360, 354, 356), // closer
      c(2, 356, 357, 351, 353), // even closer
    ];
    const result = analyzeValueAreaInteractions(candles, mockProfile);
    expect(result.vpocMagnet).toBe(true);
  });

  it("does NOT flag VPOC magnet when already at VPOC", () => {
    const candles: Candle[] = [
      c(0, 349, 351, 348, 350),
      c(1, 350, 352, 349, 351),
      c(2, 351, 352, 349, 350),
    ];
    const result = analyzeValueAreaInteractions(candles, mockProfile);
    expect(result.vpocMagnet).toBe(false);
  });

  it("detects VPOC acceptance when 3 candles close within 0.5%", () => {
    // VPOC at 350, 0.5% = 1.75 tolerance
    const candles: Candle[] = [
      c(0, 349, 351, 348, 350.5),
      c(1, 350.5, 352, 349, 349.8),
      c(2, 349.8, 351, 349, 350.2),
    ];
    const result = analyzeValueAreaInteractions(candles, mockProfile);
    expect(result.vpocAcceptance).toBe(true);
  });

  it("does NOT flag VPOC acceptance when closes drift away", () => {
    const candles: Candle[] = [
      c(0, 349, 351, 348, 350),
      c(1, 350, 354, 349, 353), // too far from VPOC (>0.5%)
      c(2, 353, 356, 352, 355),
    ];
    const result = analyzeValueAreaInteractions(candles, mockProfile);
    expect(result.vpocAcceptance).toBe(false);
  });
});
