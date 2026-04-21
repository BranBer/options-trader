import type {
  MarketPulseClassificationPayload,
  MarketPulseCorrelationPayload,
  MarketPulseNarrativePayload,
} from "@/types/market-pulse";
import { marketPulseNarrativeResponseSchema } from "@/types/market-pulse";
import { loadMarketPulseAsset } from "@/lib/prompts/market-pulse-asset-loader";

const narrativeSynthInstruction = loadMarketPulseAsset(
  "candle_narrative_synth.txt",
);

export const MARKET_PULSE_SYNTHESIZER_SYSTEM_INSTRUCTION = `${narrativeSynthInstruction}

Additional rules:
- You are synthesizing an evolving intraday narrative, not restating every event.
- If prior narrative is provided, explicitly reflect what changed since that prior state.
- When signals conflict, prefer neutral control or transition phase over forced certainty.
- If high-confidence catalyst correlations exist, mention them as context, not as absolute proof.
- Keep the output grounded in the structured event inputs.
- Keep narrative_summary under 120 words. Be direct and concise.`;

export const MARKET_PULSE_SYNTHESIZER_RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    current_control: {
      type: "string" as const,
      enum: ["buyers", "sellers", "neutral"],
    },
    control_strength: { type: "integer" as const },
    narrative_summary: { type: "string" as const },
    market_phase: {
      type: "string" as const,
      enum: ["trend", "consolidation", "transition"],
    },
    expected_behavior: {
      type: "string" as const,
      enum: ["continuation", "range", "reversal_risk"],
    },
    key_conflicts: {
      type: "array" as const,
      items: { type: "string" as const },
    },
    confidence_in_assessment: { type: "number" as const },
  },
  required: [
    "current_control",
    "control_strength",
    "narrative_summary",
    "market_phase",
    "expected_behavior",
  ],
};

export function buildSynthesizerPrompt(
  events: MarketPulseClassificationPayload[],
  priorNarrative: MarketPulseNarrativePayload | null,
  correlations: MarketPulseCorrelationPayload[],
): string {
  const eventPayload = events.map((event) => ({
    candle_time: event.candle_time,
    event: event.event,
    level: event.level ?? "candle",
    control: event.classification.control,
    control_strength: event.classification.control_strength,
    structure_state: event.classification.structure_state,
    significance: event.significance,
  }));

  const correlationPayload = correlations.map((correlation) => ({
    candle_time: correlation.candle_time,
    headline: correlation.external_event.headline ?? null,
    type: correlation.external_event.type,
    sentiment: correlation.external_event.sentiment,
    confidence: correlation.correlation_confidence,
    reasoning: correlation.reasoning ?? null,
  }));

  return `Synthesize the current market narrative from the following event sequence.

Prior narrative:
${JSON.stringify(priorNarrative, null, 2)}

New event sequence:
${JSON.stringify(eventPayload, null, 2)}

Catalyst correlations:
${JSON.stringify(correlationPayload, null, 2)}

Summarize the evolution of control, identify whether the market is trending, consolidating, or transitioning, and explain what changed since the prior narrative.`;
}

export { marketPulseNarrativeResponseSchema as marketPulseSynthesizerZodSchema };
