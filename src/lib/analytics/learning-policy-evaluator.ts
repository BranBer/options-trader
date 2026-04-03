import type { LearningRecord } from "@/types/learning";
import {
  runLearningPolicyBaselineEvaluation,
  type LearningPolicyBaselineEvaluation,
} from "@/lib/analytics/learning-policy-baselines";

export interface PolicyEvaluationWindow {
  id: "recent_7d" | "recent_30d" | "all";
  label: string;
  startAt: string | null;
  endAt: string | null;
  evaluatedRecordCount: number;
  supported: boolean;
  supportReason: string | null;
  assumptions: string[];
  caveats: string[];
  evaluation: LearningPolicyBaselineEvaluation;
}

export interface LearningPolicyEvaluationHarness {
  referenceTimestamp: string | null;
  totalRecords: number;
  windows: PolicyEvaluationWindow[];
  globalCaveats: string[];
}

function getRecordTimestamp(record: LearningRecord) {
  return (
    record.action.decisionTimestamp ??
    record.state.alert.detectedAt ??
    record.metadata.generatedAt
  );
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function buildWindowRecords(
  records: LearningRecord[],
  startMs: number | null,
  endMs: number | null,
) {
  return records.filter((record) => {
    const ts = parseTimestamp(getRecordTimestamp(record));
    if (ts == null) return startMs == null && endMs == null;
    if (startMs != null && ts < startMs) return false;
    if (endMs != null && ts > endMs) return false;
    return true;
  });
}

function buildWindow(
  id: PolicyEvaluationWindow["id"],
  label: string,
  records: LearningRecord[],
  startAt: string | null,
  endAt: string | null,
): PolicyEvaluationWindow {
  const evaluation = runLearningPolicyBaselineEvaluation(records);
  const currentSelected = evaluation.current.metrics.selectedCount;
  const supported =
    evaluation.evaluatedRecordCount >= 5 &&
    currentSelected >= 2 &&
    evaluation.baselines.some(
      (baseline) => baseline.metrics.selectedCount >= 2,
    );

  let supportReason: string | null = null;
  if (!supported) {
    if (evaluation.evaluatedRecordCount < 5) {
      supportReason =
        "Fewer than 5 computed-reward records are available in this replay window.";
    } else if (currentSelected < 2) {
      supportReason =
        "The current policy selected too few records in this window for a stable comparison.";
    } else {
      supportReason =
        "Candidate baselines selected too few records to support a like-for-like comparison.";
    }
  }

  return {
    id,
    label,
    startAt,
    endAt,
    evaluatedRecordCount: evaluation.evaluatedRecordCount,
    supported,
    supportReason,
    assumptions: [
      "Only learning rows with computed rewards are included in the replay set.",
      "Rejected alerts use stored opportunity-cost proxies rather than unrealized live trades.",
      "Policies are compared on the same historical rows without simulating market impact or execution slippage.",
    ],
    caveats: [
      "This harness is counterfactual and conservative: it does not prove a policy would have achieved the same fills live.",
      "Small windows are useful for review, but not for promotion decisions.",
    ],
    evaluation,
  };
}

export function runLearningPolicyEvaluationHarness(
  records: LearningRecord[],
): LearningPolicyEvaluationHarness {
  const timestamps = records
    .map((record) => parseTimestamp(getRecordTimestamp(record)))
    .filter((value): value is number => value != null)
    .sort((left, right) => left - right);

  const referenceMs =
    timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;
  const referenceTimestamp =
    referenceMs != null ? new Date(referenceMs).toISOString() : null;

  const recent7dStart =
    referenceMs != null ? referenceMs - 7 * 24 * 60 * 60 * 1000 : null;
  const recent30dStart =
    referenceMs != null ? referenceMs - 30 * 24 * 60 * 60 * 1000 : null;

  const windows: PolicyEvaluationWindow[] = [
    buildWindow(
      "recent_7d",
      "Recent 7 Days",
      buildWindowRecords(records, recent7dStart, referenceMs),
      recent7dStart != null ? new Date(recent7dStart).toISOString() : null,
      referenceTimestamp,
    ),
    buildWindow(
      "recent_30d",
      "Recent 30 Days",
      buildWindowRecords(records, recent30dStart, referenceMs),
      recent30dStart != null ? new Date(recent30dStart).toISOString() : null,
      referenceTimestamp,
    ),
    buildWindow("all", "All Available", records, null, referenceTimestamp),
  ];

  return {
    referenceTimestamp,
    totalRecords: records.length,
    windows,
    globalCaveats: [
      "Use these results for offline review and prioritization, not as evidence for live promotion on their own.",
      "Promotion decisions still require larger windows, calibration checks, and later shadow-mode stability.",
    ],
  };
}
