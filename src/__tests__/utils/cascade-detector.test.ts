import { describe, it, expect } from "vitest";
import {
  detectCascade,
  normalizeEpsMagnitude,
  computeTimeFactor,
  computeEdgeCascadeStrength,
  type NexusEarnings,
} from "@/lib/utils/cascade-detector";
import { NEXUS_COMPANIES } from "@/lib/data/nexus-companies";

describe("normalizeEpsMagnitude", () => {
  it("maps small surprises to low impact", () => {
    expect(normalizeEpsMagnitude(0.5)).toBe(0.1);
    expect(normalizeEpsMagnitude(3)).toBe(0.3);
  });

  it("maps large surprises to high impact", () => {
    expect(normalizeEpsMagnitude(15)).toBe(0.8);
    expect(normalizeEpsMagnitude(25)).toBe(1.0);
  });
});

describe("computeTimeFactor", () => {
  it("returns 1.0 in immediate phase (0-4h)", () => {
    expect(computeTimeFactor(0)).toBe(1.0);
    expect(computeTimeFactor(2)).toBe(1.0);
    expect(computeTimeFactor(4)).toBe(1.0);
  });

  it("decays linearly from 4h to 72h", () => {
    const mid = computeTimeFactor(38); // midpoint of 4-72
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(1.0);
  });

  it("returns 0.2 at 72h boundary", () => {
    expect(computeTimeFactor(72)).toBeCloseTo(0.2, 1);
  });

  it("returns 0 after 72h", () => {
    expect(computeTimeFactor(73)).toBe(0);
    expect(computeTimeFactor(100)).toBe(0);
  });

  it("returns 0 for negative hours (not yet reported)", () => {
    expect(computeTimeFactor(-1)).toBe(0);
  });
});

describe("computeEdgeCascadeStrength", () => {
  it("computes hop-1 strength correctly", () => {
    // baseImpact=0.8, edgeWeight=0.9, hop=1, beat, timeFactor=1.0
    // = 0.8 * 0.9 * 0.5^0 * 1.0 * 1.0 = 0.72
    const result = computeEdgeCascadeStrength(0.8, 0.9, 1, false, 1.0);
    expect(result).toBeCloseTo(0.72, 2);
  });

  it("applies hop decay for hop-2", () => {
    // Same but hop=2: 0.8 * 0.9 * 0.5^1 * 1.0 = 0.36
    const result = computeEdgeCascadeStrength(0.8, 0.9, 2, false, 1.0);
    expect(result).toBeCloseTo(0.36, 2);
  });

  it("applies miss asymmetry (1.3x)", () => {
    const beat = computeEdgeCascadeStrength(0.5, 0.6, 1, false, 1.0);
    const miss = computeEdgeCascadeStrength(0.5, 0.6, 1, true, 1.0);
    expect(miss / beat).toBeCloseTo(1.3, 2);
  });

  it("applies time decay", () => {
    const full = computeEdgeCascadeStrength(0.8, 0.9, 1, false, 1.0);
    const half = computeEdgeCascadeStrength(0.8, 0.9, 1, false, 0.5);
    expect(half).toBeCloseTo(full * 0.5, 2);
  });

  it("clamps to 1.0 max", () => {
    // Large miss with high weight could exceed 1
    const result = computeEdgeCascadeStrength(1.0, 1.0, 1, true, 1.0);
    expect(result).toBeLessThanOrEqual(1.0);
  });
});

describe("detectCascade", () => {
  const now = new Date("2026-04-10T14:00:00Z");

  it("returns null when no earnings reported", () => {
    const result = detectCascade("NVDA", NEXUS_COMPANIES, new Map(), now);
    expect(result).toBeNull();
  });

  it("returns null when target has no connection to reporting nexus", () => {
    // ASML reports, but "RANDOM" is not a dependent of anyone
    const earnings = new Map<string, NexusEarnings>([
      ["ASML", { reportedAt: "2026-04-10T06:00:00Z", epsSurprisePct: 10 }],
    ]);
    const result = detectCascade("RANDOM", NEXUS_COMPANIES, earnings, now);
    expect(result).toBeNull();
  });

  it("detects 1-hop cascade: TSM → NVDA", () => {
    // TSM reported 2h ago with 15% beat
    const earnings = new Map<string, NexusEarnings>([
      ["TSM", { reportedAt: "2026-04-10T12:00:00Z", epsSurprisePct: 15 }],
    ]);

    const result = detectCascade("NVDA", NEXUS_COMPANIES, earnings, now);
    expect(result).not.toBeNull();
    expect(result!.signals).toHaveLength(1);
    expect(result!.signals[0].nexusTicker).toBe("TSM");
    expect(result!.edges).toHaveLength(1);
    expect(result!.edges[0].hop).toBe(1);
    expect(result!.edges[0].edgeWeight).toBe(0.8);
    expect(result!.cascadeDirection).toBe("bullish");
    expect(result!.cascadeStrength).toBeGreaterThan(0);

    // Verify math: baseImpact=0.8 (15% → 0.8), edgeWeight=0.8, hop=1, beat, timeFactor=1.0
    // = 0.8 * 0.8 * 1.0 * 1.0 = 0.64
    expect(result!.cascadeStrength).toBeCloseTo(0.64, 2);
  });

  it("detects 2-hop cascade: ASML → TSM → AAPL", () => {
    // ASML reported 10h ago with 8% beat
    const earnings = new Map<string, NexusEarnings>([
      ["ASML", { reportedAt: "2026-04-10T04:00:00Z", epsSurprisePct: 8 }],
    ]);

    const result = detectCascade("AAPL", NEXUS_COMPANIES, earnings, now);
    expect(result).not.toBeNull();
    expect(result!.edges[0].hop).toBe(2);
    // TSM has edgeWeight 0.7 from ASML, AAPL has edgeWeight 0.9 from TSM
    // combined = min(0.7, 0.9) = 0.7
    expect(result!.edges[0].edgeWeight).toBe(0.7);
    // cascade_strength at hop 2 with time decay
    expect(result!.cascadeStrength).toBeGreaterThan(0);
    expect(result!.cascadeStrength).toBeLessThan(0.5); // attenuated
  });

  it("detects bearish cascade (miss) with asymmetry", () => {
    // AAPL misses by -12%
    const earnings = new Map<string, NexusEarnings>([
      ["AAPL", { reportedAt: "2026-04-10T12:00:00Z", epsSurprisePct: -12 }],
    ]);

    const result = detectCascade("CRUS", NEXUS_COMPANIES, earnings, now);
    expect(result).not.toBeNull();
    expect(result!.cascadeDirection).toBe("bearish");
    // With miss asymmetry, strength should be > what a beat of same magnitude would produce
    const beatEarnings = new Map<string, NexusEarnings>([
      ["AAPL", { reportedAt: "2026-04-10T12:00:00Z", epsSurprisePct: 12 }],
    ]);
    const beatResult = detectCascade(
      "CRUS",
      NEXUS_COMPANIES,
      beatEarnings,
      now,
    );
    expect(result!.cascadeStrength).toBeGreaterThan(
      beatResult!.cascadeStrength,
    );
  });

  it("returns null when report is older than 72h", () => {
    const staleEarnings = new Map<string, NexusEarnings>([
      ["TSM", { reportedAt: "2026-04-07T00:00:00Z", epsSurprisePct: 15 }],
    ]);
    const result = detectCascade("NVDA", NEXUS_COMPANIES, staleEarnings, now);
    expect(result).toBeNull();
  });

  it("includes prompt section with formatted text", () => {
    const earnings = new Map<string, NexusEarnings>([
      ["TSM", { reportedAt: "2026-04-10T12:00:00Z", epsSurprisePct: 15 }],
    ]);
    const result = detectCascade("NVDA", NEXUS_COMPANIES, earnings, now);
    expect(result!.promptSection).toContain("TSMC");
    expect(result!.promptSection).toContain("TSM");
    expect(result!.promptSection).toContain("+15.0%");
    expect(result!.promptSection).toContain("IMMEDIATE");
  });

  it("handles multiple nexus companies reporting", () => {
    // Both TSM and NVDA reported
    const earnings = new Map<string, NexusEarnings>([
      ["TSM", { reportedAt: "2026-04-10T10:00:00Z", epsSurprisePct: 10 }],
      ["NVDA", { reportedAt: "2026-04-10T12:00:00Z", epsSurprisePct: 20 }],
    ]);

    // MSFT is a dependent of NVDA (direct) and also reachable from TSM via NVDA
    const result = detectCascade("MSFT", NEXUS_COMPANIES, earnings, now);
    expect(result).not.toBeNull();
    // Should have at least 1 edge (direct from NVDA)
    expect(result!.edges.length).toBeGreaterThanOrEqual(1);
  });
});
