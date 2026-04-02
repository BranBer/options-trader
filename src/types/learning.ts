import { z } from "zod";
import {
  exitReasonEnum,
  simLegSchema,
  simTradeStatusEnum,
} from "@/types/portfolio";

export const LEARNING_RECORD_SCHEMA_VERSION = "v1" as const;

export const learningLineageQualityEnum = z.enum([
  "explicit",
  "backfilled",
  "inferred",
  "incomplete",
]);
export type LearningLineageQuality = z.infer<typeof learningLineageQualityEnum>;

export const learningActionDecisionEnum = z.enum([
  "enter",
  "reject",
  "not_evaluated",
]);
export type LearningActionDecision = z.infer<typeof learningActionDecisionEnum>;

export const learningRewardStatusEnum = z.enum([
  "pending",
  "computed",
  "not_applicable",
]);
export type LearningRewardStatus = z.infer<typeof learningRewardStatusEnum>;

export const learningOutcomeEnum = z.enum([
  "entered",
  "rejected",
  "not_evaluated",
]);
export type LearningOutcome = z.infer<typeof learningOutcomeEnum>;

export const learningAlertStateSchema = z.object({
  alertId: z.number().int().nullable(),
  ticker: z.string(),
  detectedAt: z.string(),
  callPut: z.enum(["C", "P"]).nullable(),
  strike: z.number().nullable(),
  expiry: z.string().nullable(),
  premium: z.number().nullable(),
  volume: z.number().int().nullable(),
  openInterest: z.number().int().nullable(),
  underlyingPrice: z.number().nullable(),
  sentiment: z.string().nullable(),
  inferredSentiment: z.string().nullable(),
  sentimentConfidence: z.string().nullable(),
  intentHint: z.string().nullable(),
  qualityScore: z.number().int().nullable(),
  delta: z.number().nullable(),
  gamma: z.number().nullable(),
  theta: z.number().nullable(),
  vega: z.number().nullable(),
  impliedVolatility: z.number().nullable(),
  breakEvenPrice: z.number().nullable(),
});
export type LearningAlertState = z.infer<typeof learningAlertStateSchema>;

export const learningAnalysisStateSchema = z.object({
  sourceAnalysisId: z.number().int().nullable(),
  recommendationDirection: z.enum(["bullish", "bearish", "neutral"]).nullable(),
  recommendationConfidence: z.number().nullable(),
  compositeConfidence: z.number().nullable(),
  whaleQualityScore: z.number().int().nullable(),
  strategyName: z.string().nullable(),
  riskRewardRatio: z.string().nullable(),
  riskFactors: z.array(z.string()),
  deepDiveRiskLevel: z.string().nullable(),
  marketNarrative: z.string().nullable(),
});
export type LearningAnalysisState = z.infer<typeof learningAnalysisStateSchema>;

export const learningPortfolioStateSchema = z.object({
  portfolioBalance: z.number(),
  startingBalance: z.number().nullable(),
  openPositionsCount: z.number().int(),
  openTickers: z.array(z.string()),
  openDirectionCounts: z.object({
    bullish: z.number().int(),
    bearish: z.number().int(),
    neutral: z.number().int(),
  }),
});
export type LearningPortfolioState = z.infer<
  typeof learningPortfolioStateSchema
>;

export const learningActionSchema = z.object({
  decision: learningActionDecisionEnum,
  evaluationId: z.number().int().nullable(),
  decisionTimestamp: z.string().nullable(),
  shouldEnter: z.boolean().nullable(),
  reasoning: z.string().nullable(),
  rejectionGate: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  positionSizeDollars: z.number().nullable(),
  netPremium: z.number().nullable(),
  strategyName: z.string().nullable(),
  legs: z.array(simLegSchema).nullable(),
});
export type LearningAction = z.infer<typeof learningActionSchema>;

export const learningOutcomeSchema = z.object({
  finalOutcome: learningOutcomeEnum,
  tradeId: z.number().int().nullable(),
  tradeStatus: simTradeStatusEnum.nullable(),
  pnl: z.number().nullable(),
  pnlPct: z.number().nullable(),
  exitReason: exitReasonEnum.nullable(),
  holdingDays: z.number().nullable(),
  realizedAt: z.string().nullable(),
});
export type LearningOutcomeRecord = z.infer<typeof learningOutcomeSchema>;

export const learningRewardSchema = z.object({
  status: learningRewardStatusEnum,
  primaryReward: z.number().nullable(),
  realizedPnl: z.number().nullable(),
  realizedPnlPct: z.number().nullable(),
  drawdownPenalty: z.number().nullable(),
  opportunityCostPenalty: z.number().nullable(),
  notes: z.array(z.string()),
});
export type LearningReward = z.infer<typeof learningRewardSchema>;

export const learningMetadataSchema = z.object({
  recordId: z.string(),
  schemaVersion: z.literal(LEARNING_RECORD_SCHEMA_VERSION),
  generatedAt: z.string(),
  lineageQuality: learningLineageQualityEnum,
  sourceRefs: z.object({
    primaryWhaleId: z.number().int().nullable(),
    whaleIds: z.array(z.number().int()),
    sourceAnalysisId: z.number().int().nullable(),
    evaluationId: z.number().int().nullable(),
    tradeId: z.number().int().nullable(),
  }),
  completeness: z.object({
    hasAlert: z.boolean(),
    hasAnalysis: z.boolean(),
    hasEvaluation: z.boolean(),
    hasTrade: z.boolean(),
    hasReward: z.boolean(),
  }),
});
export type LearningMetadata = z.infer<typeof learningMetadataSchema>;

export const learningRecordSchema = z.object({
  state: z.object({
    alert: learningAlertStateSchema,
    analysis: learningAnalysisStateSchema,
    portfolio: learningPortfolioStateSchema,
  }),
  action: learningActionSchema,
  outcome: learningOutcomeSchema,
  reward: learningRewardSchema,
  metadata: learningMetadataSchema,
});
export type LearningRecord = z.infer<typeof learningRecordSchema>;

export const learningRecordSummarySchema = z.object({
  total: z.number().int(),
  byDecision: z.record(learningActionDecisionEnum, z.number().int()),
  byOutcome: z.record(learningOutcomeEnum, z.number().int()),
  byLineageQuality: z.record(learningLineageQualityEnum, z.number().int()),
  byRewardStatus: z.record(learningRewardStatusEnum, z.number().int()),
});
export type LearningRecordSummary = z.infer<typeof learningRecordSummarySchema>;

export const learningRecordsPayloadSchema = z.object({
  records: z.array(learningRecordSchema),
  summary: learningRecordSummarySchema,
  filters: z.object({
    lineageQuality: learningLineageQualityEnum.nullable(),
    limit: z.number().int(),
  }),
});
export type LearningRecordsPayload = z.infer<
  typeof learningRecordsPayloadSchema
>;

export const learningRecordsResponseSchema = z.object({
  learning: learningRecordsPayloadSchema,
});
export type LearningRecordsResponse = z.infer<
  typeof learningRecordsResponseSchema
>;
