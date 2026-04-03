import type { LearningRecord } from "@/types/learning";

export interface ShadowPolicyFeatureWeight {
  key: string;
  label: string;
  description: string;
  support: number;
  avgReward: number;
  positiveRatePct: number;
  weight: number;
}

export interface ShadowPolicyCalibration {
  holdoutSize: number;
  accuracyPct: number;
  precisionPct: number;
  recallPct: number;
  positivePredictionRatePct: number;
  avgSelectedReward: number;
}

export interface ShadowPolicyModelArtifact {
  policyName: string;
  modelVersion: string;
  trainedAt: string;
  corpusSize: number;
  evaluatedRecordCount: number;
  threshold: number;
  bias: number;
  features: ShadowPolicyFeatureWeight[];
  calibration: ShadowPolicyCalibration;
}

export interface ShadowPolicyCandidate {
  ticker: string;
  qualityScore: number | null;
  recommendationConfidence: number | null;
  compositeConfidence: number | null;
  recommendationDirection: "bullish" | "bearish" | "neutral" | null;
  deepDiveRiskLevel: string | null;
  openPositionsCount: number;
  portfolioBalance: number;
  positionSizeDollars: number | null;
}

export interface ShadowPolicyDriver {
  label: string;
  contribution: number;
  impact: "positive" | "negative";
}

export interface ShadowPolicyDecision {
  policyName: string;
  modelVersion: string;
  recommendedAction: "enter" | "reject";
  score: number;
  confidence: number;
  expectedValue: number;
  reasonSummary: string;
  drivers: ShadowPolicyDriver[];
}

type FeatureDefinition = {
  key: string;
  label: string;
  description: string;
  isActiveRecord: (record: LearningRecord) => boolean;
  isActiveCandidate: (candidate: ShadowPolicyCandidate) => boolean;
};

function round(value: number) {
  return Number(value.toFixed(4));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getReward(record: LearningRecord) {
  return record.reward.primaryReward ?? 0;
}

function isPositiveReward(record: LearningRecord) {
  return (record.reward.primaryReward ?? 0) > 0;
}

function candidateConfidence(candidate: ShadowPolicyCandidate) {
  return Math.max(
    candidate.recommendationConfidence ?? 0,
    candidate.compositeConfidence ?? 0,
  );
}

const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  {
    key: "quality_high",
    label: "High whale quality",
    description: "Whale quality score >= 70.",
    isActiveRecord: (record) =>
      (record.state.analysis.whaleQualityScore ??
        record.state.alert.qualityScore ??
        0) >= 70,
    isActiveCandidate: (candidate) => (candidate.qualityScore ?? 0) >= 70,
  },
  {
    key: "quality_low",
    label: "Low whale quality",
    description: "Whale quality score below 60.",
    isActiveRecord: (record) =>
      (record.state.analysis.whaleQualityScore ??
        record.state.alert.qualityScore ??
        0) < 60,
    isActiveCandidate: (candidate) => (candidate.qualityScore ?? 0) < 60,
  },
  {
    key: "confidence_high",
    label: "High recommendation confidence",
    description: "Recommendation or composite confidence >= 0.6.",
    isActiveRecord: (record) =>
      Math.max(
        record.state.analysis.recommendationConfidence ?? 0,
        record.state.analysis.compositeConfidence ?? 0,
      ) >= 0.6,
    isActiveCandidate: (candidate) => candidateConfidence(candidate) >= 0.6,
  },
  {
    key: "confidence_low",
    label: "Low recommendation confidence",
    description: "Recommendation and composite confidence below 0.5.",
    isActiveRecord: (record) =>
      Math.max(
        record.state.analysis.recommendationConfidence ?? 0,
        record.state.analysis.compositeConfidence ?? 0,
      ) < 0.5,
    isActiveCandidate: (candidate) => candidateConfidence(candidate) < 0.5,
  },
  {
    key: "directional_conviction",
    label: "Directional conviction",
    description:
      "Recommendation direction is bullish or bearish instead of neutral.",
    isActiveRecord: (record) =>
      record.state.analysis.recommendationDirection != null &&
      record.state.analysis.recommendationDirection !== "neutral",
    isActiveCandidate: (candidate) =>
      candidate.recommendationDirection != null &&
      candidate.recommendationDirection !== "neutral",
  },
  {
    key: "neutral_direction",
    label: "Neutral direction",
    description: "Recommendation direction is neutral or missing.",
    isActiveRecord: (record) =>
      record.state.analysis.recommendationDirection == null ||
      record.state.analysis.recommendationDirection === "neutral",
    isActiveCandidate: (candidate) =>
      candidate.recommendationDirection == null ||
      candidate.recommendationDirection === "neutral",
  },
  {
    key: "risk_not_high",
    label: "Risk below high",
    description: "Deep-dive risk level is not high or very high.",
    isActiveRecord: (record) => {
      const riskLevel = (
        record.state.analysis.deepDiveRiskLevel ?? ""
      ).toLowerCase();
      return riskLevel !== "high" && riskLevel !== "very_high";
    },
    isActiveCandidate: (candidate) => {
      const riskLevel = (candidate.deepDiveRiskLevel ?? "").toLowerCase();
      return riskLevel !== "high" && riskLevel !== "very_high";
    },
  },
  {
    key: "risk_high",
    label: "High risk setup",
    description: "Deep-dive risk level is high or very high.",
    isActiveRecord: (record) => {
      const riskLevel = (
        record.state.analysis.deepDiveRiskLevel ?? ""
      ).toLowerCase();
      return riskLevel === "high" || riskLevel === "very_high";
    },
    isActiveCandidate: (candidate) => {
      const riskLevel = (candidate.deepDiveRiskLevel ?? "").toLowerCase();
      return riskLevel === "high" || riskLevel === "very_high";
    },
  },
  {
    key: "portfolio_capacity",
    label: "Portfolio capacity available",
    description: "Open positions count <= 2.",
    isActiveRecord: (record) => record.state.portfolio.openPositionsCount <= 2,
    isActiveCandidate: (candidate) => candidate.openPositionsCount <= 2,
  },
  {
    key: "portfolio_constrained",
    label: "Portfolio already constrained",
    description: "Open positions count greater than 2.",
    isActiveRecord: (record) => record.state.portfolio.openPositionsCount > 2,
    isActiveCandidate: (candidate) => candidate.openPositionsCount > 2,
  },
  {
    key: "modest_position_sizing",
    label: "Modest position sizing",
    description: "Requested position uses <= 8% of portfolio balance.",
    isActiveRecord: (record) => {
      const balance = record.state.portfolio.portfolioBalance;
      const position = record.action.positionSizeDollars ?? 0;
      return balance > 0 ? position / balance <= 0.08 : false;
    },
    isActiveCandidate: (candidate) => {
      const position = candidate.positionSizeDollars ?? 0;
      return candidate.portfolioBalance > 0
        ? position / candidate.portfolioBalance <= 0.08
        : false;
    },
  },
  {
    key: "oversized_position",
    label: "Oversized position request",
    description: "Requested position uses more than 10% of portfolio balance.",
    isActiveRecord: (record) => {
      const balance = record.state.portfolio.portfolioBalance;
      const position = record.action.positionSizeDollars ?? 0;
      return balance > 0 ? position / balance > 0.1 : false;
    },
    isActiveCandidate: (candidate) => {
      const position = candidate.positionSizeDollars ?? 0;
      return candidate.portfolioBalance > 0
        ? position / candidate.portfolioBalance > 0.1
        : false;
    },
  },
];

function scoreRecord(
  record: LearningRecord,
  bias: number,
  features: ShadowPolicyFeatureWeight[],
) {
  return round(
    bias +
      features.reduce(
        (sum, feature) =>
          sum +
          (FEATURE_DEFINITIONS.find(
            (definition) => definition.key === feature.key,
          )?.isActiveRecord(record)
            ? feature.weight
            : 0),
        0,
      ),
  );
}

function buildCalibration(
  holdout: LearningRecord[],
  threshold: number,
  bias: number,
  features: ShadowPolicyFeatureWeight[],
): ShadowPolicyCalibration {
  if (holdout.length === 0) {
    return {
      holdoutSize: 0,
      accuracyPct: 0,
      precisionPct: 0,
      recallPct: 0,
      positivePredictionRatePct: 0,
      avgSelectedReward: 0,
    };
  }

  const predictions = holdout.map((record) => {
    const score = scoreRecord(record, bias, features);
    return {
      predictedPositive: score >= threshold,
      actualPositive: isPositiveReward(record),
      reward: getReward(record),
    };
  });

  const tp = predictions.filter(
    (entry) => entry.predictedPositive && entry.actualPositive,
  ).length;
  const tn = predictions.filter(
    (entry) => !entry.predictedPositive && !entry.actualPositive,
  ).length;
  const fp = predictions.filter(
    (entry) => entry.predictedPositive && !entry.actualPositive,
  ).length;
  const fn = predictions.filter(
    (entry) => !entry.predictedPositive && entry.actualPositive,
  ).length;
  const selectedRewards = predictions
    .filter((entry) => entry.predictedPositive)
    .map((entry) => entry.reward);

  return {
    holdoutSize: holdout.length,
    accuracyPct: round(((tp + tn) / holdout.length) * 100),
    precisionPct: round((tp / Math.max(tp + fp, 1)) * 100),
    recallPct: round((tp / Math.max(tp + fn, 1)) * 100),
    positivePredictionRatePct: round(
      (selectedRewards.length / holdout.length) * 100,
    ),
    avgSelectedReward:
      selectedRewards.length > 0
        ? round(
            selectedRewards.reduce((sum, reward) => sum + reward, 0) /
              selectedRewards.length,
          )
        : 0,
  };
}

export function fitShadowPolicyModel(
  records: LearningRecord[],
): ShadowPolicyModelArtifact {
  const evaluatedRecords = records.filter(
    (record) => record.reward.status === "computed",
  );
  const splitIndex = Math.max(1, Math.floor(evaluatedRecords.length * 0.7));
  const training = evaluatedRecords.slice(0, splitIndex);
  const holdout = evaluatedRecords.slice(splitIndex);
  const overallMeanReward =
    training.length > 0
      ? training.reduce((sum, record) => sum + getReward(record), 0) /
        training.length
      : 0;

  const features = FEATURE_DEFINITIONS.map((definition) => {
    const activeRecords = training.filter(definition.isActiveRecord);
    const avgReward =
      activeRecords.length > 0
        ? activeRecords.reduce((sum, record) => sum + getReward(record), 0) /
          activeRecords.length
        : 0;
    const positiveRatePct =
      activeRecords.length > 0
        ? (activeRecords.filter(isPositiveReward).length /
            activeRecords.length) *
          100
        : 0;
    const supportFactor = clamp(
      activeRecords.length / Math.max(training.length * 0.35, 1),
      0,
      1,
    );

    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      support: activeRecords.length,
      avgReward: round(avgReward),
      positiveRatePct: round(positiveRatePct),
      weight: round((avgReward - overallMeanReward) * supportFactor),
    };
  });

  const bias = round(overallMeanReward);
  const scoredTraining = training.map((record) => ({
    score: scoreRecord(record, bias, features),
    positive: isPositiveReward(record),
  }));
  const positiveScores = scoredTraining
    .filter((entry) => entry.positive)
    .map((entry) => entry.score);
  const negativeScores = scoredTraining
    .filter((entry) => !entry.positive)
    .map((entry) => entry.score);
  const threshold = round(
    positiveScores.length > 0 && negativeScores.length > 0
      ? (positiveScores.reduce((sum, value) => sum + value, 0) /
          positiveScores.length +
          negativeScores.reduce((sum, value) => sum + value, 0) /
            negativeScores.length) /
          2
      : bias,
  );

  return {
    policyName: "Empirical Reward Shadow Policy",
    modelVersion: "v1",
    trainedAt: new Date().toISOString(),
    corpusSize: records.length,
    evaluatedRecordCount: evaluatedRecords.length,
    threshold,
    bias,
    features,
    calibration: buildCalibration(holdout, threshold, bias, features),
  };
}

export function evaluateShadowPolicyCandidate(
  candidate: ShadowPolicyCandidate,
  model: ShadowPolicyModelArtifact,
): ShadowPolicyDecision {
  const activeFeatures = FEATURE_DEFINITIONS.map((definition) => ({
    definition,
    feature: model.features.find((feature) => feature.key === definition.key),
  }))
    .filter(
      (
        entry,
      ): entry is {
        definition: FeatureDefinition;
        feature: ShadowPolicyFeatureWeight;
      } =>
        entry.feature != null && entry.definition.isActiveCandidate(candidate),
    )
    .map((entry) => ({
      label: entry.feature.label,
      contribution: entry.feature.weight,
      impact:
        entry.feature.weight >= 0
          ? ("positive" as const)
          : ("negative" as const),
    }))
    .sort(
      (left, right) =>
        Math.abs(right.contribution) - Math.abs(left.contribution),
    );

  const baseScore = round(
    model.bias +
      activeFeatures.reduce((sum, feature) => sum + feature.contribution, 0),
  );
  const riskLevel = (candidate.deepDiveRiskLevel ?? "").toLowerCase();
  const hasHighRisk = riskLevel === "high" || riskLevel === "very_high";
  const hasPortfolioConstraint = candidate.openPositionsCount > 2;
  const hasLowConviction =
    candidateConfidence(candidate) < 0.5 ||
    candidate.recommendationDirection == null ||
    candidate.recommendationDirection === "neutral";
  const positionSizeRatio =
    candidate.portfolioBalance > 0
      ? (candidate.positionSizeDollars ?? 0) / candidate.portfolioBalance
      : 0;
  const hasOversizedPosition = positionSizeRatio > 0.1;
  const guardrailPenalty = round(
    (hasHighRisk ? 0.2 : 0) +
      (hasPortfolioConstraint ? 0.15 : 0) +
      (hasLowConviction ? 0.15 : 0) +
      (hasOversizedPosition ? 0.1 : 0),
  );
  const score = round(baseScore - guardrailPenalty);
  const confidence = round(
    clamp(
      0.5 +
        Math.abs(score - model.threshold) /
          Math.max(
            model.features.reduce(
              (sum, feature) => sum + Math.abs(feature.weight),
              Math.abs(model.bias) + 0.2,
            ),
            0.4,
          ),
      0.5,
      0.95,
    ),
  );
  const recommendedAction =
    score >= model.threshold &&
    !hasHighRisk &&
    !hasPortfolioConstraint &&
    !hasOversizedPosition &&
    !hasLowConviction
      ? "enter"
      : "reject";
  const topDrivers = activeFeatures.slice(0, 4);
  const reasonSummary =
    topDrivers.length > 0
      ? `${recommendedAction === "enter" ? "Enter" : "Reject"} because ${topDrivers
          .map((driver) => driver.label.toLowerCase())
          .join(", ")}.`
      : `${recommendedAction === "enter" ? "Enter" : "Reject"} because the empirical score ${
          score >= model.threshold ? "cleared" : "fell below"
        } the learned threshold.`;

  return {
    policyName: model.policyName,
    modelVersion: model.modelVersion,
    recommendedAction,
    score,
    confidence,
    expectedValue: score,
    reasonSummary,
    drivers: topDrivers,
  };
}
