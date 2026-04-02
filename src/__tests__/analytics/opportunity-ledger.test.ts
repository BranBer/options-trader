import { describe, expect, it } from "vitest";
import {
  buildOpportunityId,
  labelOpportunityOutcome,
  scoreOpportunityCandidate,
} from "@/lib/analytics/opportunity-ledger";

const candidate = {
  id: "temp",
  ticker: "AAPL",
  detectedAt: "2026-04-01T12:00:00.000Z",
  sentiment: "bullish" as const,
  strike: 200,
  expiry: "2026-05-15",
  premium: 150000,
  qualityScore: 82,
};

describe("opportunity-ledger", () => {
  it("builds a stable opportunity id", () => {
    expect(buildOpportunityId(candidate)).toBe(
      "AAPL|2026-04-01T12:00:00.000Z|200|2026-05-15",
    );
  });

  it("scores high-quality candidates higher", () => {
    const high = scoreOpportunityCandidate(candidate);
    const low = scoreOpportunityCandidate({
      ...candidate,
      qualityScore: 30,
      premium: 50_000,
      sentiment: "bullish",
    });

    expect(high).toBeGreaterThan(low);
  });

  it("labels captured opportunities when returns are positive", () => {
    const label = labelOpportunityOutcome({
      candidate,
      realizedReturnPct: 12,
      maxFavorableExcursionPct: 18,
      maxAdverseExcursionPct: -6,
    });

    expect(label.outcome).toBe("captured");
    expect(label.missReason).toBeNull();
  });

  it("labels missed opportunities with a reason", () => {
    const label = labelOpportunityOutcome({
      candidate,
      realizedReturnPct: -8,
      maxFavorableExcursionPct: 6,
      maxAdverseExcursionPct: -12,
      missReason: "entry_filter_rejected",
    });

    expect(label.outcome).toBe("missed");
    expect(label.missReason).toBe("entry_filter_rejected");
  });
});
