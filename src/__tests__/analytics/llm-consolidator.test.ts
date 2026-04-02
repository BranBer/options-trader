import { describe, expect, it } from "vitest";
import { consolidateFeatures } from "@/lib/analytics/llm-consolidator";
import type { ConsolidatorInput } from "@/lib/analytics/llm-consolidator";

function createInput(
  overrides?: Partial<ConsolidatorInput>,
): ConsolidatorInput {
  return {
    ticker: "AAPL",
    detectedAt: "2026-04-01T12:00:00.000Z",
    direction: "bullish",
    qualityScore: 85,
    earnings: [{ ticker: "AAPL", date: "2026-05-15" }],
    insider: [{ ticker: "AAPL", transactionType: "buy" }],
    volatility: { ivPercentile: 55, regime: "normal" },
    sector: { momentum: 0.7, regime: "risk_on" },
    technicals: 0.75,
    ...overrides,
  };
}

describe("consolidateFeatures", () => {
  it("produces a valid output with all sources present", () => {
    const result = consolidateFeatures(createInput());

    expect(result.ticker).toBe("AAPL");
    expect(result.direction).toBe("bullish");
    expect(result.features.length).toBeGreaterThan(0);
    expect(result.readiness).toBe("ready");
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("includes source citations for each feature", () => {
    const result = consolidateFeatures(createInput());

    for (const feature of result.features) {
      expect(feature.source).toBeTruthy();
      expect(feature.citation).toBeTruthy();
      expect(feature.citation).toContain(feature.source);
    }
  });

  it("detects contradictions when technical alignment contradicts direction", () => {
    const result = consolidateFeatures(
      createInput({
        direction: "bullish",
        technicals: 0.2,
      }),
    );

    expect(result.contradictions.length).toBeGreaterThan(0);
    expect(result.contradictions[0]).toContain("contradicts");
  });

  it("detects contradictions when sector momentum contradicts direction", () => {
    const result = consolidateFeatures(
      createInput({
        direction: "bullish",
        sector: { momentum: 0.2, regime: "risk_off" },
      }),
    );

    expect(result.contradictions.length).toBeGreaterThan(0);
  });

  it("marks insufficient readiness when confidence is too low", () => {
    const result = consolidateFeatures(
      createInput({
        earnings: null,
        insider: null,
        volatility: null,
        sector: null,
        technicals: null,
      }),
    );

    expect(result.readiness).toBe("insufficient");
    expect(result.warnings).toContain(
      "Consolidated confidence too low — recommend no-trade",
    );
  });

  it("handles empty array source data gracefully", () => {
    const result = consolidateFeatures(
      createInput({
        earnings: [],
        insider: [],
      }),
    );

    expect(result.features.length).toBeGreaterThan(0);
  });
});
