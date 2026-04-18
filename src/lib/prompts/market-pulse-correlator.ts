import type {
  MarketPulseClassificationPayload,
  MarketPulseCorrelationPayload,
} from "@/types/market-pulse";
import type { EconomicEvent } from "@/lib/utils/economic-calendar";
import type { NewsEventRow } from "@/types/news";
import { marketPulseCorrelationResponseSchema } from "@/types/market-pulse";
import { loadMarketPulseAsset } from "@/lib/prompts/market-pulse-asset-loader";

const correlationSchemaContract = loadMarketPulseAsset(
  "candle_event_correlation_layer_schema.txt",
);

export const MARKET_PULSE_CORRELATOR_SYSTEM_INSTRUCTION = `You are a market catalyst correlator.

Your job is to map structured price-action events to plausible external catalysts without forcing a match.

Rules:
- Only correlate an external event when the timestamp, sentiment, and event description plausibly align with the price event.
- Prefer no correlation over weak correlation.
- If correlation confidence is below 0.3, still include it only if the alignment is directionally relevant and note the weakness in reasoning.
- Use the provided candle_time from the price event exactly.
- Output short reasoning that explains the timestamp and directional alignment.

Schema reference:
${correlationSchemaContract}`;

export const MARKET_PULSE_CORRELATOR_RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    correlations: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          price_event: { type: "string" as const },
          candle_time: { type: "string" as const },
          external_event: {
            type: "object" as const,
            properties: {
              type: {
                type: "string" as const,
                enum: ["news", "macro", "earnings"],
              },
              headline: { type: "string" as const },
              timestamp: { type: "string" as const },
              sentiment: {
                type: "string" as const,
                enum: ["bullish", "bearish", "neutral"],
              },
            },
            required: ["type", "timestamp", "sentiment"],
          },
          correlation_confidence: { type: "number" as const },
          reasoning: { type: "string" as const },
        },
        required: [
          "price_event",
          "candle_time",
          "external_event",
          "correlation_confidence",
        ],
      },
    },
  },
  required: ["correlations"],
};

function normalizeNewsEvent(event: NewsEventRow) {
  return {
    id: event.id,
    type: event.eventType === "earnings" ? "earnings" : "news",
    headline: event.headline,
    timestamp: event.createdAt ?? event.publishedAt ?? "",
    sentiment:
      event.sentiment === "bullish" ||
      event.sentiment === "bearish" ||
      event.sentiment === "neutral"
        ? event.sentiment
        : "neutral",
    impactScore: event.impactScore ?? 0,
    summary: event.rawSummary ?? null,
  };
}

function normalizeMacroEvent(event: EconomicEvent) {
  return {
    type: "macro",
    headline: event.name,
    timestamp: `${event.date}T00:00:00.000Z`,
    sentiment: "neutral",
    impact: event.impact,
    description: event.description,
  };
}

export function buildCorrelatorPrompt(
  classifications: MarketPulseClassificationPayload[],
  newsEvents: NewsEventRow[],
  macroEvents: EconomicEvent[],
): string {
  const events = classifications.map((classification) => ({
    candle_time: classification.candle_time,
    price_event: classification.event,
    control: classification.classification.control,
    structure_state: classification.classification.structure_state,
    significance: classification.significance,
  }));

  return `Correlate the following price events with possible catalysts.

Price events:
${JSON.stringify(events, null, 2)}

News catalysts:
${JSON.stringify(newsEvents.map(normalizeNewsEvent), null, 2)}

Macro catalysts:
${JSON.stringify(macroEvents.map(normalizeMacroEvent), null, 2)}

Return only plausible correlations. If there are no plausible matches, return an empty correlations array.`;
}

export { marketPulseCorrelationResponseSchema as marketPulseCorrelatorZodSchema };
