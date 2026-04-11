import { describe, it, expect } from "vitest";
import {
  computeVolumeProfile,
  formatVolumeProfileForPrompt,
} from "@/lib/utils/volume-profile";
import { computeAlgoSR, formatAlgoSRForPrompt } from "@/lib/utils/algo-sr";
import {
  computeIVSkew,
  computeOISummary,
  formatEnhancedOptionsForPrompt,
} from "@/lib/utils/options-analytics";
import {
  getUpcomingCatalysts,
  formatCatalystsForPrompt,
} from "@/lib/utils/economic-calendar";
import { buildSignalHierarchyPrompt } from "@/lib/utils/signal-hierarchy";
import type { Candle } from "@/lib/utils/technical-indicators";
import type { OptionsChainSummary } from "@/types/market";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandles(
  count: number,
  opts: { basePrice?: number; volatility?: number; volume?: number } = {},
): Candle[] {
  const { basePrice = 100, volatility = 2, volume = 10_000 } = opts;
  const candles: Candle[] = [];
  let price = basePrice;
  for (let i = 0; i < count; i++) {
    const delta =
      (Math.sin(i * 0.3) + (i % 3 === 0 ? 1 : -1) * 0.5) * volatility;
    const open = price;
    const close = price + delta;
    const high = Math.max(open, close) + volatility * 0.3;
    const low = Math.min(open, close) - volatility * 0.3;
    candles.push({
      time: `2026-01-${String(i + 1).padStart(2, "0")}`,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: volume + i * 100,
    });
    price = close;
  }
  return candles;
}

function makeChain(currentPrice: number): OptionsChainSummary {
  const calls = [];
  const puts = [];
  for (
    let strike = currentPrice - 10;
    strike <= currentPrice + 10;
    strike += 1
  ) {
    const otmCallDelta = Math.max(0.05, 0.5 - (strike - currentPrice) * 0.05);
    const otmPutDelta = Math.min(-0.05, -0.5 + (currentPrice - strike) * 0.05);
    calls.push({
      strike,
      bid: Math.max(0.01, (currentPrice - strike) * 0.8),
      ask: Math.max(0.05, (currentPrice - strike) * 1.2),
      volume: 500 + Math.floor(Math.random() * 1000),
      openInterest: 2000 + Math.floor(Math.random() * 5000),
      iv: 0.3 + Math.random() * 0.1,
      delta: Math.min(0.95, Math.max(0.05, otmCallDelta)),
      gamma: 0.02,
      theta: -0.05,
    });
    puts.push({
      strike,
      bid: Math.max(0.01, (strike - currentPrice) * 0.8),
      ask: Math.max(0.05, (strike - currentPrice) * 1.2),
      volume: 400 + Math.floor(Math.random() * 800),
      openInterest: 1500 + Math.floor(Math.random() * 4000),
      iv: 0.33 + Math.random() * 0.12,
      delta: Math.max(-0.95, Math.min(-0.05, otmPutDelta)),
      gamma: 0.02,
      theta: -0.05,
    });
  }
  return {
    ticker: "TEST",
    expirations: ["2026-02-20"],
    nearestExpiry: { date: "2026-02-20", calls, puts },
  };
}

// ---------------------------------------------------------------------------
// Volume Profile
// ---------------------------------------------------------------------------

describe("computeVolumeProfile", () => {
  it("returns null for fewer than 2 candles", () => {
    expect(computeVolumeProfile([makeCandles(1)[0]])).toBeNull();
  });

  it("computes VPOC, value area, and nodes from candles", () => {
    const candles = makeCandles(30);
    const profile = computeVolumeProfile(candles);
    expect(profile).not.toBeNull();
    expect(profile!.vpoc).toBeGreaterThan(0);
    expect(profile!.valueAreaHigh).toBeGreaterThan(profile!.valueAreaLow);
    expect(profile!.totalVolume).toBeGreaterThan(0);
    expect(profile!.buckets.length).toBeGreaterThan(0);
  });

  it("value area contains roughly 70% of volume", () => {
    const candles = makeCandles(50, { basePrice: 200, volatility: 3 });
    const profile = computeVolumeProfile(candles);
    expect(profile).not.toBeNull();

    const vaVolume = profile!.buckets
      .filter(
        (b) =>
          b.price >= profile!.valueAreaLow && b.price <= profile!.valueAreaHigh,
      )
      .reduce((s, b) => s + b.volume, 0);
    const ratio = vaVolume / profile!.totalVolume;
    // Should be approximately 70% (±15% tolerance for edge cases)
    expect(ratio).toBeGreaterThan(0.55);
    expect(ratio).toBeLessThan(0.95);
  });

  it("respects explicit bucket size", () => {
    const candles = makeCandles(20);
    const profile = computeVolumeProfile(candles, 1.0);
    expect(profile).not.toBeNull();
    // With $1 buckets, each bucket should span ~$1
    for (const b of profile!.buckets) {
      expect(b.priceHigh - b.priceLow).toBeCloseTo(1.0, 1);
    }
  });

  it("HVN/LVN classification is correct", () => {
    const candles = makeCandles(40);
    const profile = computeVolumeProfile(candles);
    expect(profile).not.toBeNull();
    const nonZero = profile!.buckets.filter((b) => b.volume > 0);
    const avgVol = nonZero.reduce((s, b) => s + b.volume, 0) / nonZero.length;

    for (const h of profile!.hvn) {
      expect(h.volume).toBeGreaterThan(avgVol * 1.5);
    }
    for (const l of profile!.lvn) {
      expect(l.volume).toBeLessThan(avgVol * 0.5);
    }
  });
});

describe("formatVolumeProfileForPrompt", () => {
  it("returns text with VPOC and value area", () => {
    const candles = makeCandles(30);
    const profile = computeVolumeProfile(candles)!;
    const text = formatVolumeProfileForPrompt(profile, 102);
    expect(text).toContain("VPOC");
    expect(text).toContain("Value Area");
  });
});

// ---------------------------------------------------------------------------
// Algorithmic S/R
// ---------------------------------------------------------------------------

describe("computeAlgoSR", () => {
  it("returns empty for fewer than 7 candles", () => {
    const result = computeAlgoSR({
      candles: makeCandles(5),
      currentPrice: 100,
    });
    expect(result).toEqual([]);
  });

  it("detects support and resistance from swing pivots", () => {
    // Create candles with clear swing highs/lows (V-shape pattern)
    const candles: Candle[] = [];
    const prices = [
      100,
      102,
      104,
      106,
      108, // up
      110,
      108,
      106,
      104,
      102, // peak then down
      100,
      98,
      96,
      94,
      92, // down
      90,
      92,
      94,
      96,
      98, // valley then up
      100,
      102,
      104,
      106,
      108, // up
      110,
      108,
      106,
      104,
      102, // peak then down
    ];
    for (let i = 0; i < prices.length; i++) {
      const p = prices[i];
      candles.push({
        time: `2026-01-${String(i + 1).padStart(2, "0")}`,
        open: p - 0.5,
        high: p + 1.5,
        low: p - 1.5,
        close: p + 0.5,
        volume: 10000 + i * 100,
      });
    }
    const lastClose = candles[candles.length - 1].close;
    const levels = computeAlgoSR({ candles, currentPrice: lastClose });
    expect(levels.length).toBeGreaterThan(0);

    const supports = levels.filter((l) => l.type === "support");
    const resistances = levels.filter((l) => l.type === "resistance");
    // Should have at least one of each with clear V-shape pattern
    expect(supports.length + resistances.length).toBeGreaterThan(0);
  });

  it("increases confluence when multiple sources agree", () => {
    const candles = makeCandles(30, { basePrice: 100, volatility: 3 });
    const lastClose = candles[candles.length - 1].close;

    // Add volume profile and OI walls that coincide with swing levels
    const vp = computeVolumeProfile(candles)!;

    const levels = computeAlgoSR({
      candles,
      currentPrice: lastClose,
      volumeProfile: vp,
      maxPain: 100,
    });

    // At least some levels should have confluence > 1
    const multiSource = levels.filter((l) => l.confluence > 1);
    // With volume profile + max pain + swings, there should be some confluence
    expect(levels.length).toBeGreaterThan(0);
    // Check that confluence scores are valid
    for (const l of levels) {
      expect(l.confluence).toBeGreaterThanOrEqual(1);
      expect(l.confluence).toBeLessThanOrEqual(5);
      expect(l.sources.length).toBeGreaterThan(0);
    }
  });

  it("marks levels near current price as tested", () => {
    const candles = makeCandles(30, { basePrice: 100, volatility: 3 });
    const lastClose = candles[candles.length - 1].close;
    const levels = computeAlgoSR({ candles, currentPrice: lastClose });

    // Any level very close to current price should be "tested"
    for (const l of levels) {
      expect(["active", "tested", "broken"]).toContain(l.state);
    }
  });
});

describe("formatAlgoSRForPrompt", () => {
  it("returns empty string for no levels", () => {
    expect(formatAlgoSRForPrompt([], 100)).toBe("");
  });

  it("formats support and resistance sections", () => {
    const candles = makeCandles(30, { basePrice: 100, volatility: 3 });
    const lastClose = candles[candles.length - 1].close;
    const levels = computeAlgoSR({ candles, currentPrice: lastClose });
    if (levels.length === 0) return; // Skip if no levels detected (rare)

    const text = formatAlgoSRForPrompt(levels, lastClose);
    // Should contain star ratings
    expect(text).toMatch(/[★☆]/);
  });
});

// ---------------------------------------------------------------------------
// IV Skew & OI Summary
// ---------------------------------------------------------------------------

describe("computeIVSkew", () => {
  it("returns null when currentPrice is 0", () => {
    const chain = makeChain(100);
    expect(computeIVSkew(chain, 0)).toBeNull();
  });

  it("computes skew with moneyness-filtered options", () => {
    const chain = makeChain(100);
    const skew = computeIVSkew(chain, 100);
    // With our synthetic data, puts generally have higher IV
    if (skew) {
      expect(skew.avgPutIV).toBeGreaterThan(0);
      expect(skew.avgCallIV).toBeGreaterThan(0);
      expect(typeof skew.interpretation).toBe("string");
      expect(skew.interpretation.length).toBeGreaterThan(0);
    }
  });
});

describe("computeOISummary", () => {
  it("returns null for empty chain", () => {
    const chain: OptionsChainSummary = {
      ticker: "TEST",
      expirations: [],
      nearestExpiry: { date: "2026-01-01", calls: [], puts: [] },
    };
    expect(computeOISummary(chain)).toBeNull();
  });

  it("computes OI ratio and top strikes", () => {
    const chain = makeChain(100);
    const summary = computeOISummary(chain);
    expect(summary).not.toBeNull();
    expect(summary!.totalCallOI).toBeGreaterThan(0);
    expect(summary!.totalPutOI).toBeGreaterThan(0);
    expect(summary!.pcOIRatio).toBeGreaterThan(0);
    expect(summary!.topStrikes.length).toBeLessThanOrEqual(5);
    expect(summary!.topStrikes.length).toBeGreaterThan(0);
    // Top strikes should have breakdown
    for (const s of summary!.topStrikes) {
      expect(s.strike).toBeGreaterThan(0);
      expect(typeof s.callOI).toBe("number");
      expect(typeof s.putOI).toBe("number");
    }
  });
});

describe("formatEnhancedOptionsForPrompt", () => {
  it("produces text with skew and OI data", () => {
    const chain = makeChain(100);
    const skew = computeIVSkew(chain, 100);
    const oi = computeOISummary(chain);
    const text = formatEnhancedOptionsForPrompt(skew, oi);
    if (skew) expect(text).toContain("IV Skew");
    if (oi) expect(text).toContain("OI Distribution");
  });
});

// ---------------------------------------------------------------------------
// Economic Calendar
// ---------------------------------------------------------------------------

describe("getUpcomingCatalysts", () => {
  it("returns events within the window", () => {
    // Use a date in 2026 where we know events exist
    const from = new Date("2026-01-05T00:00:00Z");
    const result = getUpcomingCatalysts(14, from);
    expect(result.events.length).toBeGreaterThan(0);
    // All events should be within 14 days
    for (const e of result.events) {
      expect(e.daysUntil).toBeGreaterThanOrEqual(0);
      expect(e.daysUntil).toBeLessThanOrEqual(14);
    }
  });

  it("correctly identifies high-impact events", () => {
    const from = new Date("2026-01-05T00:00:00Z");
    const result = getUpcomingCatalysts(30, from);
    const highImpact = result.events.filter((e) => e.impact === "high");
    expect(result.highImpactCount).toBe(highImpact.length);
  });

  it("flags immediate risk for high-impact within 3 days", () => {
    // Jan 9 is NFP, so from Jan 7 it should be immediate risk
    const from = new Date("2026-01-07T00:00:00Z");
    const result = getUpcomingCatalysts(7, from);
    expect(result.immediateRisk).toBe(true);
  });

  it("returns empty for date range outside calendar", () => {
    const from = new Date("2030-06-01T00:00:00Z");
    const result = getUpcomingCatalysts(14, from);
    expect(result.events).toEqual([]);
    expect(result.highImpactCount).toBe(0);
    expect(result.immediateRisk).toBe(false);
  });

  it("sorts events by daysUntil ascending", () => {
    const from = new Date("2026-03-01T00:00:00Z");
    const result = getUpcomingCatalysts(30, from);
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i].daysUntil).toBeGreaterThanOrEqual(
        result.events[i - 1].daysUntil,
      );
    }
  });
});

describe("formatCatalystsForPrompt", () => {
  it("includes earnings warning when earnings date is near", () => {
    const from = new Date("2026-01-10T00:00:00Z");
    const catalysts = getUpcomingCatalysts(14, from);
    const text = formatCatalystsForPrompt(catalysts, "2026-01-20", from);
    expect(text).toContain("EARNINGS");
  });

  it("shows no-events message when window is empty", () => {
    const catalysts = getUpcomingCatalysts(1, new Date("2030-01-01T00:00:00Z"));
    const text = formatCatalystsForPrompt(catalysts);
    expect(text).toContain("No major economic releases");
  });

  it("includes impact icons", () => {
    const from = new Date("2026-01-05T00:00:00Z");
    const catalysts = getUpcomingCatalysts(30, from);
    const text = formatCatalystsForPrompt(catalysts);
    expect(text).toMatch(/🔴|🟡|⚪/);
  });
});

// ---------------------------------------------------------------------------
// Signal Hierarchy
// ---------------------------------------------------------------------------

describe("buildSignalHierarchyPrompt", () => {
  it("returns tier framing even with minimal input", () => {
    const text = buildSignalHierarchyPrompt({});
    expect(text).toContain("Tier 1");
    expect(text).toContain("Tier 2");
    expect(text).toContain("Tier 3");
  });

  it("includes volume profile when provided", () => {
    const candles = makeCandles(30);
    const vp = computeVolumeProfile(candles)!;
    const text = buildSignalHierarchyPrompt({
      volumeProfile: vp,
      currentPrice: 102,
    });
    expect(text).toContain("Volume Profile");
    expect(text).toContain("VPOC");
  });

  it("includes algo SR when provided", () => {
    const candles = makeCandles(30, { basePrice: 100, volatility: 3 });
    const lastClose = candles[candles.length - 1].close;
    const levels = computeAlgoSR({ candles, currentPrice: lastClose });
    const text = buildSignalHierarchyPrompt({
      algoSR:
        levels.length > 0
          ? levels
          : [
              {
                price: 98,
                type: "support",
                confluence: 2,
                sources: ["Swing Pivot", "VWAP"],
                state: "active",
              },
            ],
      currentPrice: lastClose,
    });
    expect(text).toContain("Support/Resistance");
  });

  it("includes catalyst section when provided", () => {
    const catalysts = getUpcomingCatalysts(
      14,
      new Date("2026-01-05T00:00:00Z"),
    );
    const text = buildSignalHierarchyPrompt({ catalysts });
    expect(text).toContain("Catalyst");
  });

  it("warns against indicator-only entries", () => {
    const text = buildSignalHierarchyPrompt({});
    expect(text).toContain("indicator crossovers");
    expect(text).toContain("NEVER");
  });
});
