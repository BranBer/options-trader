import { describe, expect, it } from "vitest";
import { buildRecommendationPromptContext } from "@/lib/prompts/recommendation-context";

describe("recommendation-context", () => {
  it("builds recommendation prompts from precomputed market context", () => {
    const prompt = buildRecommendationPromptContext(
      {
        whale_trade: {
          ticker: "AAPL",
          strike: 200,
          expiry: "2026-05-16",
          type: "call",
          premium: 500000,
          volume: 1200,
        },
        related_event: {
          headline: "Supply chain demand improves",
          impact_score: 8,
          event_type: "supply_chain",
        },
        correlation_confidence: 0.72,
        alignment: "confirming",
        thesis: "Bullish supply chain follow-through",
        smart_money_signal: "bullish",
      },
      {
        price: 198,
        ivRank: 44,
        avgVolume: 1000000,
        todayVolume: 1200000,
        optionsChainSummary: "Nearest expiry: 2026-05-16",
        deepDiveSummary: {
          overallSentiment: "bullish",
          riskLevel: "moderate",
          keyPatterns: [],
          supportLevels: [190],
          resistanceLevels: [205],
          ivAssessment: "normal",
          thetaAnalysis: "modest",
        },
      },
    );

    expect(prompt).toContain("Whale Trade Signal");
    expect(prompt).toContain("Current Price: $198");
    expect(prompt).toContain("Pre-computed Deep Dive Summary");
  });
});
