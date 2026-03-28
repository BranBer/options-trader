// ---------- System Instruction ----------

export const CROSS_REFERENCE_SYSTEM_INSTRUCTION = `You are a quantitative analyst specializing in options flow analysis and event-driven trading. You cross-reference unusual options activity ("whale trades") with recent macro/geopolitical events to identify potential correlations.

A correlation exists when:
- A whale takes a large options position in a ticker/sector that a recent event would logically impact
- The directionality matches (bullish event + whale buying calls, or bearish event + whale buying puts)
- The timing is suspicious (position opened near/after event, or shortly before if potential insider knowledge)

Rate correlation confidence from 0.0 to 1.0:
- 0.0-0.3: Weak/coincidental
- 0.3-0.6: Moderate — plausible connection
- 0.6-0.8: Strong — clear thematic alignment + timing
- 0.8-1.0: Very strong — near-certain event-driven positioning

Be skeptical. Most whale trades are NOT correlated with specific news events. Only flag genuine connections.

Higher whale quality scores (>70) indicate more conviction — weight these correlations more heavily. A high-quality whale trade (large premium, aggressive OTM strike, high volume/OI ratio) paired with a relevant news event is a stronger signal than a low-quality trade.

Always respond with the exact JSON schema provided.`;

// ---------- User Prompt Builder ----------

export function buildCrossReferencePrompt(
  newsEventsJson: string,
  whaleAlertsJson: string,
): string {
  return `Cross-reference the following whale options trades with recent market-relevant news events. Identify any correlations where a whale's position appears to be event-driven.

Recent News Events (last 24h, impact >= 5):
${newsEventsJson}

Current Whale Options Flow:
${whaleAlertsJson}`;
}

// ---------- Gemini Response Schema ----------

export const CROSS_REFERENCE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    correlations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          whale_trade: {
            type: "object",
            properties: {
              ticker: { type: "string" },
              strike: { type: "number" },
              expiry: { type: "string" },
              type: { type: "string", enum: ["call", "put"] },
              premium: { type: "number" },
              volume: { type: "integer" },
            },
            required: [
              "ticker",
              "strike",
              "expiry",
              "type",
              "premium",
              "volume",
            ],
          },
          related_event: {
            type: "object",
            properties: {
              headline: { type: "string" },
              impact_score: { type: "integer" },
              event_type: { type: "string" },
            },
            required: ["headline", "impact_score", "event_type"],
          },
          correlation_confidence: { type: "number" },
          alignment: {
            type: "string",
            enum: ["confirming", "contrarian", "hedging"],
          },
          thesis: { type: "string" },
          smart_money_signal: {
            type: "string",
            enum: [
              "strong_bullish",
              "bullish",
              "neutral",
              "bearish",
              "strong_bearish",
            ],
          },
        },
        required: [
          "whale_trade",
          "related_event",
          "correlation_confidence",
          "alignment",
          "thesis",
          "smart_money_signal",
        ],
      },
    },
    uncorrelated_whales: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          type: { type: "string", enum: ["call", "put"] },
          premium: { type: "number" },
          note: { type: "string" },
        },
        required: ["ticker", "type", "premium", "note"],
      },
    },
    summary: { type: "string" },
    analysis_metadata: {
      type: "object",
      properties: {
        news_events_analyzed: { type: "integer" },
        whale_trades_analyzed: { type: "integer" },
        correlations_found: { type: "integer" },
        timestamp: { type: "string" },
      },
      required: [
        "news_events_analyzed",
        "whale_trades_analyzed",
        "correlations_found",
        "timestamp",
      ],
    },
  },
  required: [
    "correlations",
    "uncorrelated_whales",
    "summary",
    "analysis_metadata",
  ],
};
