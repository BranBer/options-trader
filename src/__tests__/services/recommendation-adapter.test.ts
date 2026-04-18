import { describe, expect, it } from "vitest";
import {
  buildCorrelationRecommendationInput,
  buildRecommendationQueue,
  buildWhaleSignalRecommendationInput,
} from "@/lib/services/recommendation-adapter";

const recentWhales = [
  {
    id: 1,
    ticker: "AAPL",
    strike: 200,
    expiry: "2026-05-16",
    callPut: "C",
    premium: 2_500_000,
    volume: 1200,
    openInterest: 3400,
    underlyingPrice: 198,
    sentiment: "bullish",
    source: "uw",
    detectedAt: "2026-04-17T10:00:00.000Z",
    qualityScore: 91,
    createdAt: "2026-04-17T10:00:00.000Z",
    intentHint: "institutional",
  },
  {
    id: 2,
    ticker: "TSLA",
    strike: 220,
    expiry: "2026-05-16",
    callPut: "P",
    premium: 3_000_000,
    volume: 950,
    openInterest: 2600,
    underlyingPrice: 230,
    sentiment: "bearish",
    source: "uw",
    detectedAt: "2026-04-17T09:00:00.000Z",
    qualityScore: 88,
    createdAt: "2026-04-17T09:00:00.000Z",
    intentHint: "hedge",
  },
  {
    id: 3,
    ticker: "NVDA",
    strike: 900,
    expiry: "2026-05-16",
    callPut: "C",
    premium: 1_800_000,
    volume: 780,
    openInterest: 1900,
    underlyingPrice: 880,
    sentiment: "bullish",
    source: "uw",
    detectedAt: "2026-04-17T08:00:00.000Z",
    qualityScore: 84,
    createdAt: "2026-04-17T08:00:00.000Z",
    intentHint: "speculative",
  },
] as const;

describe("recommendation-adapter", () => {
  it("builds correlation-backed recommendation input with whale metadata", () => {
    const input = buildCorrelationRecommendationInput(
      {
        whale_trade: {
          ticker: "AAPL",
          strike: 200,
          expiry: "2026-05-16",
          type: "call",
          premium: 2_500_000,
          volume: 1200,
        },
        related_event: {
          headline: "Apple supplier demand rises",
          impact_score: 8,
          event_type: "supply_chain",
        },
        correlation_confidence: 0.82,
        alignment: "confirming",
        thesis: "Bullish supply chain confirmation",
        smart_money_signal: "strong_bullish",
      },
      [...recentWhales],
    );

    expect(input.source).toBe("correlation");
    expect(input.ticker).toBe("AAPL");
    expect(input.whaleDirection).toBe("bullish");
    expect(input.whaleIntentHint).toBe("institutional");
    expect(input.inputRefs).toMatchObject({
      correlationTicker: "AAPL",
      correlationConfidence: 0.82,
      primaryWhaleId: 1,
      whaleIds: [1],
    });
  });

  it("builds whale-signal recommendation input without correlated event context", () => {
    const input = buildWhaleSignalRecommendationInput({ ...recentWhales[1] });

    expect(input.source).toBe("whale_signal");
    expect(input.ticker).toBe("TSLA");
    expect(input.whaleDirection).toBe("bearish");
    expect(input.correlation.related_event.event_type).toBe(
      "whale_signal_only",
    );
    expect(input.correlation.related_event.impact_score).toBe(0);
    expect(input.inputRefs).toMatchObject({
      whaleSignalTicker: "TSLA",
      whaleSignalOnly: true,
      primaryWhaleId: 2,
      whaleIds: [2],
    });
  });

  it("builds a deduped queue with whale-signal backfill up to the minimum target", () => {
    const queue = buildRecommendationQueue({
      correlations: [
        {
          whale_trade: {
            ticker: "AAPL",
            strike: 200,
            expiry: "2026-05-16",
            type: "call",
            premium: 2_500_000,
            volume: 1200,
          },
          related_event: {
            headline: "Apple supplier demand rises",
            impact_score: 8,
            event_type: "supply_chain",
          },
          correlation_confidence: 0.82,
          alignment: "confirming",
          thesis: "Bullish supply chain confirmation",
          smart_money_signal: "strong_bullish",
        },
      ],
      recentWhales: [...recentWhales],
      minRecommendations: 3,
    });

    expect(queue).toHaveLength(3);
    expect(queue[0].source).toBe("correlation");
    expect(queue.slice(1).every((item) => item.source === "whale_signal")).toBe(
      true,
    );
    expect(queue.map((item) => item.ticker)).toEqual(["AAPL", "TSLA", "NVDA"]);
  });
});
