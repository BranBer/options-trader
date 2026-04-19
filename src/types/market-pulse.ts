import { z } from "zod";

export const marketPulseTickerSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{1,5}$/));

export const marketPulseSubscriptionActionSchema = z.enum(["add", "remove"]);

export const marketPulseTrendSchema = z.enum(["uptrend", "downtrend", "range"]);

export const marketPulseBbPositionSchema = z.enum(["upper", "mid", "lower"]);

export const marketPulseSignificanceSchema = z.enum(["low", "medium", "high"]);

export const marketPulseTradabilitySchema = z.enum([
  "no_action",
  "watch",
  "actionable",
]);

export const marketPulseClassificationLevelSchema = z.enum([
  "candle",
  "sequence",
  "market_phase",
  "catalyst",
]);

export const marketPulseRunStatusSchema = z.enum([
  "running",
  "success",
  "partial",
  "error",
]);

export const marketPulseRunTriggerSchema = z.enum([
  "scheduled",
  "manual",
  "initial",
]);

export const marketPulseCandleCoreSchema = z.object({
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  session: z.enum(["pre", "regular", "post", "outside"]).optional(),
});

export const marketPulseIndicatorSchema = z.object({
  rsi: z.number(),
  bb_upper: z.number(),
  bb_lower: z.number(),
  bb_position: marketPulseBbPositionSchema,
  volume_vs_avg: z.number(),
});

export const marketPulseContextSchema = z.object({
  trend: marketPulseTrendSchema,
  key_levels: z.array(z.number()),
  timeframe: z.literal("15m"),
});

export const marketPulseCandleInputSchema = z.object({
  candle: marketPulseCandleCoreSchema,
  indicators: marketPulseIndicatorSchema,
  context: marketPulseContextSchema,
});

export const marketPulsePreparedCandleSchema = z.object({
  ticker: z.string(),
  candleTime: z.string(),
  payload: marketPulseCandleInputSchema,
});

export const marketPulseSubscriptionSchema = z.object({
  id: z.number().int(),
  ticker: z.string(),
  addedAt: z.string(),
  isActive: z.boolean(),
  createdAt: z.string().nullable(),
});

export const marketPulseClassificationStateSchema = z.object({
  control: z.enum(["buyers", "sellers", "neutral"]),
  control_strength: z.number().int().min(1).max(10),
  rejection_type: z.enum([
    "upper_rejection",
    "lower_rejection",
    "both_sides",
    "none",
  ]),
  rejection_strength: z.number().int().min(1).max(10),
  absorption_detected: z.boolean(),
  momentum_state: z.enum(["expanding", "weakening", "stable"]),
  structure_state: z.enum([
    "trend_continuation",
    "pullback",
    "consolidation",
    "reversal_attempt",
  ]),
  volatility_state: z.enum(["expansion", "compression"]),
});

export const marketPulseClassificationPayloadSchema = z.object({
  candle_time: z.string(),
  classification: marketPulseClassificationStateSchema,
  event: z.string(),
  significance: marketPulseSignificanceSchema,
  tradability: marketPulseTradabilitySchema,
  level: marketPulseClassificationLevelSchema.optional(),
});

export const marketPulseClassificationResponseSchema = z.object({
  classifications: z.array(marketPulseClassificationPayloadSchema),
});

export const marketPulseCorrelationPayloadSchema = z.object({
  price_event: z.string(),
  candle_time: z.string(),
  external_event: z.object({
    type: z.enum(["news", "macro", "earnings"]),
    headline: z.string().optional(),
    timestamp: z.string(),
    sentiment: z.enum(["bullish", "bearish", "neutral"]),
  }),
  correlation_confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

export const marketPulseCorrelationResponseSchema = z.object({
  correlations: z.array(marketPulseCorrelationPayloadSchema),
});

export const marketPulseNarrativePayloadSchema = z.object({
  current_control: z.enum(["buyers", "sellers", "neutral"]),
  control_strength: z.number().int().min(1).max(10),
  narrative_summary: z.string(),
  market_phase: z.enum(["trend", "consolidation", "transition"]),
  expected_behavior: z.enum(["continuation", "range", "reversal_risk"]),
  key_conflicts: z.array(z.string()).optional(),
  confidence_in_assessment: z.number().min(0).max(1).optional(),
});

export const marketPulseNarrativeResponseSchema =
  marketPulseNarrativePayloadSchema;

export const marketPulseRunRowSchema = z.object({
  id: z.number().int(),
  runId: z.string(),
  ticker: z.string(),
  status: marketPulseRunStatusSchema,
  trigger: marketPulseRunTriggerSchema,
  candleWindow: z.string(),
  llmTokensUsed: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  stages: z.string().nullable().optional(),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.string().nullable(),
});

export const marketPulseClassificationRowSchema = z.object({
  id: z.number().int(),
  runId: z.string(),
  ticker: z.string(),
  candleTime: z.string(),
  candleData: z.string(),
  indicators: z.string(),
  classification: z.string(),
  eventBlurb: z.string(),
  significance: marketPulseSignificanceSchema,
  tradability: marketPulseTradabilitySchema,
  level: marketPulseClassificationLevelSchema.or(z.literal("candle")),
  createdAt: z.string().nullable(),
});

export const marketPulseCorrelationRowSchema = z.object({
  id: z.number().int(),
  runId: z.string(),
  ticker: z.string(),
  priceEvent: z.string(),
  candleTime: z.string(),
  externalEventType: z.string(),
  externalEventId: z.number().int().nullable(),
  externalEventSummary: z.string(),
  externalEventPayload: z.string().nullable(),
  sentiment: z.string(),
  correlationConfidence: z.number(),
  reasoning: z.string().nullable(),
  createdAt: z.string().nullable(),
});

export const marketPulseNarrativeRowSchema = z.object({
  id: z.number().int(),
  runId: z.string(),
  ticker: z.string(),
  currentControl: z.string(),
  controlStrength: z.number().int(),
  marketPhase: z.string(),
  expectedBehavior: z.string(),
  narrativeSummary: z.string(),
  keyConflicts: z.string().nullable(),
  confidenceInAssessment: z.number().nullable(),
  structuredOutput: z.string().nullable(),
  inputEventCount: z.number().int(),
  priorRunId: z.string().nullable(),
  createdAt: z.string().nullable(),
});

export type MarketPulseTicker = z.infer<typeof marketPulseTickerSchema>;
export type MarketPulseSubscriptionAction = z.infer<
  typeof marketPulseSubscriptionActionSchema
>;
export type MarketPulseTrend = z.infer<typeof marketPulseTrendSchema>;
export type MarketPulseBbPosition = z.infer<typeof marketPulseBbPositionSchema>;
export type MarketPulseCandleInput = z.infer<
  typeof marketPulseCandleInputSchema
>;
export type MarketPulsePreparedCandle = z.infer<
  typeof marketPulsePreparedCandleSchema
>;
export type MarketPulseSubscription = z.infer<
  typeof marketPulseSubscriptionSchema
>;
export type MarketPulseClassificationPayload = z.infer<
  typeof marketPulseClassificationPayloadSchema
>;
export type MarketPulseClassificationResponse = z.infer<
  typeof marketPulseClassificationResponseSchema
>;
export type MarketPulseCorrelationPayload = z.infer<
  typeof marketPulseCorrelationPayloadSchema
>;
export type MarketPulseCorrelationResponse = z.infer<
  typeof marketPulseCorrelationResponseSchema
>;
export type MarketPulseNarrativePayload = z.infer<
  typeof marketPulseNarrativePayloadSchema
>;
export type MarketPulseNarrativeResponse = z.infer<
  typeof marketPulseNarrativeResponseSchema
>;
export type MarketPulseRunRow = z.infer<typeof marketPulseRunRowSchema>;
export type MarketPulseClassificationRow = z.infer<
  typeof marketPulseClassificationRowSchema
>;
export type MarketPulseCorrelationRow = z.infer<
  typeof marketPulseCorrelationRowSchema
>;
export type MarketPulseNarrativeRow = z.infer<
  typeof marketPulseNarrativeRowSchema
>;
