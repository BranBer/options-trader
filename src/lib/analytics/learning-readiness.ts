import type { LearningLineageQuality, LearningRecord } from "@/types/learning";

export type LearningReadinessStatus =
  | "not_ready"
  | "limited_offline_tuning"
  | "ready_for_shadow_learning";

export interface LearningReadinessScorecard {
  status: LearningReadinessStatus;
  score: number;
  summary: string;
  blockers: string[];
  metrics: {
    totalRecords: number;
    whaleSignalCount: number;
    eventTickerSignalCount: number;
    correlationSignalCount: number;
    enterCount: number;
    rejectCount: number;
    notEvaluatedCount: number;
    computedRewardCount: number;
    pendingRewardCount: number;
    terminalTradeCount: number;
    explicitLineageCount: number;
    backfilledLineageCount: number;
    inferredLineageCount: number;
    incompleteLineageCount: number;
    computedRewardCoveragePct: number;
    lineageCoveragePct: number;
    incompleteLineagePct: number;
    decisionBalanceRatio: number;
  };
  thresholds: {
    minRecordsForLimited: number;
    minRecordsForShadow: number;
    minComputedRewardCoveragePctForLimited: number;
    minComputedRewardCoveragePctForShadow: number;
    minLineageCoveragePctForLimited: number;
    minLineageCoveragePctForShadow: number;
  };
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function countByLineage(
  records: LearningRecord[],
  lineageQuality: LearningLineageQuality,
) {
  return records.filter(
    (record) => record.metadata.lineageQuality === lineageQuality,
  ).length;
}

export function buildLearningReadinessScorecard(
  records: LearningRecord[],
): LearningReadinessScorecard {
  const totalRecords = records.length;
  const whaleSignalCount = records.filter(
    (record) => record.state.alert.signalSource === "whale",
  ).length;
  const eventTickerSignalCount = records.filter(
    (record) => record.state.alert.signalSource === "event_ticker",
  ).length;
  const correlationSignalCount = records.filter(
    (record) => record.state.alert.signalSource === "correlation",
  ).length;
  const enterCount = records.filter(
    (record) => record.action.decision === "enter",
  ).length;
  const rejectCount = records.filter(
    (record) => record.action.decision === "reject",
  ).length;
  const notEvaluatedCount = records.filter(
    (record) => record.action.decision === "not_evaluated",
  ).length;
  const computedRewardCount = records.filter(
    (record) => record.reward.status === "computed",
  ).length;
  const pendingRewardCount = records.filter(
    (record) => record.reward.status === "pending",
  ).length;
  const terminalTradeCount = records.filter(
    (record) =>
      record.outcome.finalOutcome === "entered" &&
      record.outcome.tradeStatus != null &&
      record.outcome.tradeStatus !== "open",
  ).length;

  const explicitLineageCount = countByLineage(records, "explicit");
  const backfilledLineageCount = countByLineage(records, "backfilled");
  const inferredLineageCount = countByLineage(records, "inferred");
  const incompleteLineageCount = countByLineage(records, "incomplete");
  const lineageCoveragePct = ratio(
    explicitLineageCount + backfilledLineageCount,
    totalRecords,
  );
  const incompleteLineagePct = ratio(incompleteLineageCount, totalRecords);
  const computedRewardCoveragePct = ratio(computedRewardCount, totalRecords);
  const decisionBalanceRatio =
    Math.max(enterCount, rejectCount) > 0
      ? round(
          Math.min(enterCount, rejectCount) / Math.max(enterCount, rejectCount),
        )
      : 0;

  const thresholds = {
    minRecordsForLimited: 40,
    minRecordsForShadow: 150,
    minComputedRewardCoveragePctForLimited: 45,
    minComputedRewardCoveragePctForShadow: 75,
    minLineageCoveragePctForLimited: 50,
    minLineageCoveragePctForShadow: 70,
  };

  const blockers: string[] = [];
  if (totalRecords < thresholds.minRecordsForLimited) {
    blockers.push(
      `only ${totalRecords} learning records are available; at least ${thresholds.minRecordsForLimited} are needed for offline tuning`,
    );
  }
  if (enterCount < 10 || rejectCount < 10) {
    blockers.push(
      `decision balance is weak (enter=${enterCount}, reject=${rejectCount}); both sides need enough examples`,
    );
  }
  if (
    computedRewardCoveragePct <
    thresholds.minComputedRewardCoveragePctForLimited
  ) {
    blockers.push(
      `computed reward coverage is ${computedRewardCoveragePct}%, below the ${thresholds.minComputedRewardCoveragePctForLimited}% offline-tuning threshold`,
    );
  }
  if (lineageCoveragePct < thresholds.minLineageCoveragePctForLimited) {
    blockers.push(
      `explicit/backfilled lineage coverage is ${lineageCoveragePct}%, below the ${thresholds.minLineageCoveragePctForLimited}% threshold`,
    );
  }
  if (terminalTradeCount < 15) {
    blockers.push(
      `only ${terminalTradeCount} terminal trade outcomes are available, so reward labels are still sparse`,
    );
  }

  let status: LearningReadinessStatus = "not_ready";
  if (
    totalRecords >= thresholds.minRecordsForShadow &&
    enterCount >= 25 &&
    rejectCount >= 25 &&
    computedRewardCoveragePct >=
      thresholds.minComputedRewardCoveragePctForShadow &&
    lineageCoveragePct >= thresholds.minLineageCoveragePctForShadow &&
    incompleteLineagePct <= 15
  ) {
    status = "ready_for_shadow_learning";
  } else if (
    totalRecords >= thresholds.minRecordsForLimited &&
    enterCount >= 10 &&
    rejectCount >= 10 &&
    computedRewardCoveragePct >=
      thresholds.minComputedRewardCoveragePctForLimited &&
    lineageCoveragePct >= thresholds.minLineageCoveragePctForLimited
  ) {
    status = "limited_offline_tuning";
  }

  const score = round(
    Math.min(totalRecords / thresholds.minRecordsForShadow, 1) * 30 +
      Math.min(computedRewardCoveragePct / 100, 1) * 30 +
      Math.min(lineageCoveragePct / 100, 1) * 25 +
      Math.min(decisionBalanceRatio, 1) * 15,
  );

  const summary =
    status === "ready_for_shadow_learning"
      ? "dataset quality is strong enough to support shadow-policy evaluation"
      : status === "limited_offline_tuning"
        ? "dataset quality is sufficient for conservative offline tuning, but not yet strong enough for shadow promotion"
        : "dataset quality is still below the bar for reliable offline learning";

  return {
    status,
    score,
    summary,
    blockers,
    metrics: {
      totalRecords,
      whaleSignalCount,
      eventTickerSignalCount,
      correlationSignalCount,
      enterCount,
      rejectCount,
      notEvaluatedCount,
      computedRewardCount,
      pendingRewardCount,
      terminalTradeCount,
      explicitLineageCount,
      backfilledLineageCount,
      inferredLineageCount,
      incompleteLineageCount,
      computedRewardCoveragePct,
      lineageCoveragePct,
      incompleteLineagePct,
      decisionBalanceRatio,
    },
    thresholds,
  };
}
