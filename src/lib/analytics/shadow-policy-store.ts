import { db } from "@/lib/db/client";
import { policyShadowDecisions, policyShadowFeedback } from "@/lib/db/schema";
import { desc, inArray } from "drizzle-orm";
import type {
  ShadowPolicyDecision,
  ShadowPolicyDecisionRecord,
  ShadowPolicyFeedbackVerdict,
  ShadowPolicyReviewSummary,
} from "@/types/analytics";

function parseDrivers(value: string | null | undefined) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function recordShadowPolicyDecision(params: {
  sourceAnalysisId: number | null;
  sourceWhaleId: number | null;
  ticker: string;
  currentDecision: "enter" | "reject";
  shadowDecision: ShadowPolicyDecision;
}) {
  await db.insert(policyShadowDecisions).values({
    sourceAnalysisId: params.sourceAnalysisId,
    sourceWhaleId: params.sourceWhaleId,
    ticker: params.ticker,
    modelName: params.shadowDecision.policyName,
    modelVersion: params.shadowDecision.modelVersion,
    deploymentMode: "shadow",
    recommendedAction: params.shadowDecision.recommendedAction,
    score: params.shadowDecision.score,
    confidence: params.shadowDecision.confidence,
    expectedValue: params.shadowDecision.expectedValue,
    reasonSummary: params.shadowDecision.reasonSummary,
    drivers: JSON.stringify(params.shadowDecision.drivers),
    currentDecision: params.currentDecision,
    agreedWithCurrent:
      params.shadowDecision.recommendedAction === params.currentDecision,
  });
}

export async function recordShadowPolicyFeedback(params: {
  shadowDecisionId: number;
  verdict: ShadowPolicyFeedbackVerdict;
  notes?: string | null;
}) {
  await db.insert(policyShadowFeedback).values({
    shadowDecisionId: params.shadowDecisionId,
    verdict: params.verdict,
    notes: params.notes ?? null,
  });
}

export async function getRecentShadowPolicyReview(limit: number): Promise<{
  decisions: ShadowPolicyDecisionRecord[];
  summary: ShadowPolicyReviewSummary;
}> {
  const decisionRows = await db
    .select()
    .from(policyShadowDecisions)
    .orderBy(desc(policyShadowDecisions.createdAt))
    .limit(limit);

  const feedbackRows = decisionRows.length
    ? await db
        .select()
        .from(policyShadowFeedback)
        .where(
          inArray(
            policyShadowFeedback.shadowDecisionId,
            decisionRows.map((row) => row.id),
          ),
        )
        .orderBy(desc(policyShadowFeedback.createdAt))
    : [];

  const latestFeedbackByDecision = new Map<
    number,
    (typeof feedbackRows)[number]
  >();
  for (const feedback of feedbackRows) {
    if (!latestFeedbackByDecision.has(feedback.shadowDecisionId)) {
      latestFeedbackByDecision.set(feedback.shadowDecisionId, feedback);
    }
  }

  const decisions: ShadowPolicyDecisionRecord[] = decisionRows.map((row) => {
    const feedback = latestFeedbackByDecision.get(row.id);
    return {
      id: row.id,
      ticker: row.ticker,
      sourceAnalysisId: row.sourceAnalysisId,
      sourceWhaleId: row.sourceWhaleId,
      modelName: row.modelName,
      modelVersion: row.modelVersion,
      deploymentMode: row.deploymentMode,
      recommendedAction: row.recommendedAction as "enter" | "reject",
      score: row.score,
      confidence: row.confidence,
      expectedValue: row.expectedValue,
      reasonSummary: row.reasonSummary,
      drivers: parseDrivers(row.drivers),
      currentDecision: row.currentDecision as "enter" | "reject",
      agreedWithCurrent: Boolean(row.agreedWithCurrent),
      createdAt: row.createdAt,
      feedback: feedback
        ? {
            id: feedback.id,
            verdict: feedback.verdict as ShadowPolicyFeedbackVerdict,
            notes: feedback.notes,
            createdAt: feedback.createdAt,
          }
        : null,
    };
  });

  return {
    decisions,
    summary: summarizeShadowPolicyReview(decisions),
  };
}

export function summarizeShadowPolicyReview(
  decisions: ShadowPolicyDecisionRecord[],
): ShadowPolicyReviewSummary {
  const feedbackItems = decisions.filter(
    (decision) => decision.feedback != null,
  );
  const usefulCount = feedbackItems.filter(
    (decision) => decision.feedback?.verdict === "useful",
  ).length;
  const misleadingCount = feedbackItems.filter(
    (decision) => decision.feedback?.verdict === "misleading",
  ).length;
  const needsReviewCount = feedbackItems.filter(
    (decision) => decision.feedback?.verdict === "needs_review",
  ).length;
  const agreeCount = decisions.filter(
    (decision) => decision.agreedWithCurrent,
  ).length;

  return {
    totalLoggedDecisions: decisions.length,
    recommendEnterCount: decisions.filter(
      (decision) => decision.recommendedAction === "enter",
    ).length,
    disagreeCount: decisions.length - agreeCount,
    agreementRatePct:
      decisions.length > 0
        ? Number(((agreeCount / decisions.length) * 100).toFixed(2))
        : 0,
    feedbackCount: feedbackItems.length,
    usefulCount,
    misleadingCount,
    needsReviewCount,
    lastLoggedAt: decisions[0]?.createdAt ?? null,
  };
}
