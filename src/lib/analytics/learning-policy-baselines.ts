import type { LearningRecord } from "@/types/learning";

export interface LearningPolicyBaselineMetrics {
  selectedCount: number;
  acceptanceRatePct: number;
  computedRewardCount: number;
  avgPrimaryReward: number;
  totalPrimaryReward: number;
  positiveRewardRatePct: number;
  terminalTradeCount: number;
  winRatePct: number;
  avgEnteredPnlPct: number;
}

export interface LearningPolicyBaselineResult {
  name: string;
  description: string;
  metrics: LearningPolicyBaselineMetrics;
}

export interface LearningPolicyBaselineEvaluation {
  corpusSize: number;
  evaluatedRecordCount: number;
  current: LearningPolicyBaselineResult;
  baselines: LearningPolicyBaselineResult[];
  bestBaseline: LearningPolicyBaselineResult | null;
  comparison: {
    currentVsBestBaseline: {
      avgPrimaryRewardDiff: number;
      totalPrimaryRewardDiff: number;
      winRateDiffPct: number;
    } | null;
  };
}

interface PolicyConfig {
  name: string;
  description: string;
  shouldSelect: (record: LearningRecord) => boolean;
}

function round(value: number) {
  return Number(value.toFixed(4));
}

function buildMetrics(
  records: LearningRecord[],
  corpusSize: number,
): LearningPolicyBaselineMetrics {
  const selectedCount = records.length;
  const computedRewards = records.filter(
    (record) => record.reward.status === "computed",
  );
  const terminalTrades = records.filter(
    (record) =>
      record.outcome.finalOutcome === "entered" &&
      record.outcome.tradeStatus != null &&
      record.outcome.tradeStatus !== "open" &&
      record.outcome.pnlPct != null,
  );
  const totalPrimaryReward = computedRewards.reduce(
    (sum, record) => sum + (record.reward.primaryReward ?? 0),
    0,
  );

  return {
    selectedCount,
    acceptanceRatePct:
      corpusSize > 0 ? round((selectedCount / corpusSize) * 100) : 0,
    computedRewardCount: computedRewards.length,
    avgPrimaryReward:
      computedRewards.length > 0
        ? round(totalPrimaryReward / computedRewards.length)
        : 0,
    totalPrimaryReward: round(totalPrimaryReward),
    positiveRewardRatePct:
      computedRewards.length > 0
        ? round(
            (computedRewards.filter(
              (record) => (record.reward.primaryReward ?? 0) > 0,
            ).length /
              computedRewards.length) *
              100,
          )
        : 0,
    terminalTradeCount: terminalTrades.length,
    winRatePct:
      terminalTrades.length > 0
        ? round(
            (terminalTrades.filter((record) => (record.outcome.pnl ?? 0) > 0)
              .length /
              terminalTrades.length) *
              100,
          )
        : 0,
    avgEnteredPnlPct:
      terminalTrades.length > 0
        ? round(
            terminalTrades.reduce(
              (sum, record) => sum + (record.outcome.pnlPct ?? 0),
              0,
            ) / terminalTrades.length,
          )
        : 0,
  };
}

const POLICY_BASELINES: PolicyConfig[] = [
  {
    name: "Quality And Confidence Gate",
    description:
      "Selects alerts with whale quality >= 70 and recommendation or composite confidence >= 0.6.",
    shouldSelect: (record) => {
      const quality =
        record.state.analysis.whaleQualityScore ??
        record.state.alert.qualityScore ??
        0;
      const confidence = Math.max(
        record.state.analysis.recommendationConfidence ?? 0,
        record.state.analysis.compositeConfidence ?? 0,
      );
      return quality >= 70 && confidence >= 0.6;
    },
  },
  {
    name: "Risk-Aware Directional Filter",
    description:
      "Selects directional alerts with moderate-or-better deep-dive risk and non-neutral recommendation direction.",
    shouldSelect: (record) => {
      const direction = record.state.analysis.recommendationDirection;
      const riskLevel = (
        record.state.analysis.deepDiveRiskLevel ?? ""
      ).toLowerCase();
      return (
        direction != null &&
        direction !== "neutral" &&
        riskLevel !== "high" &&
        riskLevel !== "very_high"
      );
    },
  },
  {
    name: "Capital Preservation Filter",
    description:
      "Only selects higher-quality alerts when the portfolio is not already crowded and the position size stays conservative.",
    shouldSelect: (record) => {
      const quality =
        record.state.analysis.whaleQualityScore ??
        record.state.alert.qualityScore ??
        0;
      const openPositions = record.state.portfolio.openPositionsCount;
      const balance = record.state.portfolio.portfolioBalance;
      const positionSize = record.action.positionSizeDollars ?? 0;
      const utilization = balance > 0 ? positionSize / balance : 0;

      return quality >= 65 && openPositions <= 2 && utilization <= 0.08;
    },
  },
];

export function runLearningPolicyBaselineEvaluation(
  records: LearningRecord[],
): LearningPolicyBaselineEvaluation {
  const eligibleRecords = records.filter(
    (record) => record.reward.status === "computed",
  );
  const currentSelection = eligibleRecords.filter(
    (record) => record.action.decision === "enter",
  );

  const current: LearningPolicyBaselineResult = {
    name: "Current Policy",
    description:
      "Represents the alerts the current rule and LLM stack actually chose to enter.",
    metrics: buildMetrics(currentSelection, eligibleRecords.length),
  };

  const baselines = POLICY_BASELINES.map((baseline) => ({
    name: baseline.name,
    description: baseline.description,
    metrics: buildMetrics(
      eligibleRecords.filter((record) => baseline.shouldSelect(record)),
      eligibleRecords.length,
    ),
  }));

  const bestBaseline =
    baselines.length > 0
      ? baselines.reduce((best, candidate) =>
          candidate.metrics.avgPrimaryReward > best.metrics.avgPrimaryReward
            ? candidate
            : best,
        )
      : null;

  return {
    corpusSize: records.length,
    evaluatedRecordCount: eligibleRecords.length,
    current,
    baselines,
    bestBaseline,
    comparison: {
      currentVsBestBaseline: bestBaseline
        ? {
            avgPrimaryRewardDiff: round(
              current.metrics.avgPrimaryReward -
                bestBaseline.metrics.avgPrimaryReward,
            ),
            totalPrimaryRewardDiff: round(
              current.metrics.totalPrimaryReward -
                bestBaseline.metrics.totalPrimaryReward,
            ),
            winRateDiffPct: round(
              current.metrics.winRatePct - bestBaseline.metrics.winRatePct,
            ),
          }
        : null,
    },
  };
}
