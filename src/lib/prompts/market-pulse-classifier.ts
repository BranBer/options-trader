import {
  marketPulseClassificationResponseSchema,
  type MarketPulsePreparedCandle,
} from "@/types/market-pulse";
import { loadMarketPulseAsset } from "@/lib/prompts/market-pulse-asset-loader";

const candleEngineInstruction = loadMarketPulseAsset("candle_engine.txt");
const candleSchemaContract = loadMarketPulseAsset("candle_schema.txt");
const wickNarrativeReference = loadMarketPulseAsset(
  "candle_wick_narrative_original.txt",
);

export const MARKET_PULSE_CLASSIFIER_SYSTEM_INSTRUCTION = `${candleEngineInstruction}

Interpretation Reference:
${wickNarrativeReference}

Additional constraints:
- Return one classification object for every input candle.
- Copy each candle_time exactly from the input.
- When evidence conflicts, prefer neutral control and consolidation structure over forced directional certainty.
- Do not let a single candle override an established multi-candle sequence without repeated confirmation.`;

export const MARKET_PULSE_CLASSIFIER_RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    classifications: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          candle_time: { type: "string" as const },
          classification: {
            type: "object" as const,
            properties: {
              control: {
                type: "string" as const,
                enum: ["buyers", "sellers", "neutral"],
              },
              control_strength: { type: "integer" as const },
              rejection_type: {
                type: "string" as const,
                enum: [
                  "upper_rejection",
                  "lower_rejection",
                  "both_sides",
                  "none",
                ],
              },
              rejection_strength: { type: "integer" as const },
              absorption_detected: { type: "boolean" as const },
              momentum_state: {
                type: "string" as const,
                enum: ["expanding", "weakening", "stable"],
              },
              structure_state: {
                type: "string" as const,
                enum: [
                  "trend_continuation",
                  "pullback",
                  "consolidation",
                  "reversal_attempt",
                ],
              },
              volatility_state: {
                type: "string" as const,
                enum: ["expansion", "compression"],
              },
            },
            required: [
              "control",
              "control_strength",
              "rejection_type",
              "rejection_strength",
              "absorption_detected",
              "momentum_state",
              "structure_state",
              "volatility_state",
            ],
          },
          event: { type: "string" as const },
          significance: {
            type: "string" as const,
            enum: ["low", "medium", "high"],
          },
          tradability: {
            type: "string" as const,
            enum: ["no_action", "watch", "actionable"],
          },
        },
        required: [
          "candle_time",
          "classification",
          "event",
          "significance",
          "tradability",
        ],
      },
    },
  },
  required: ["classifications"],
};

export function buildClassifierPrompt(
  candles: MarketPulsePreparedCandle[],
): string {
  const payload = candles.map((candle) => ({
    candle_time: candle.candleTime,
    ...candle.payload,
  }));

  return `Classify the following ${candles.length} market-structure candle inputs.

Structured candle contract reference:
${candleSchemaContract}

Input candles:
${JSON.stringify(payload, null, 2)}

Return one classification object per input candle in the same order and copy candle_time exactly.`;
}

export { marketPulseClassificationResponseSchema as marketPulseClassifierZodSchema };
