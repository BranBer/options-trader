import type {
  LearningPolicyEvaluationHarness,
  LearningReadinessScorecard,
  ShadowPolicyReviewSummary,
} from "@/types/analytics";

export interface PromotionChecklistItem {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail" | "pending";
  detail: string;
}

export interface PromotionGatesReport {
  currentMode: "analysis_only" | "shadow" | "advisory" | "execution_eligible";
  summary: string;
  checklist: PromotionChecklistItem[];
  rollbackTriggers: string[];
  modeDefinitions: Array<{ mode: string; meaning: string }>;
}

export function buildPromotionGatesReport(args: {
  readiness: LearningReadinessScorecard;
  policyEvaluation: LearningPolicyEvaluationHarness;
  shadowSummary: ShadowPolicyReviewSummary;
}): PromotionGatesReport {
  const { readiness, policyEvaluation, shadowSummary } = args;
  const allWindow = policyEvaluation.windows.find(
    (window) => window.id === "all",
  );
  const replayDiff = allWindow?.evaluation.comparison.currentVsBestBaseline;

  const checklist: PromotionChecklistItem[] = [
    {
      id: "readiness",
      label: "Learning dataset readiness",
      status:
        readiness.status === "ready_for_shadow_learning"
          ? "pass"
          : readiness.status === "limited_offline_tuning"
            ? "warn"
            : "fail",
      detail: readiness.summary,
    },
    {
      id: "offline_replay",
      label: "Offline replay evidence",
      status:
        allWindow?.supported !== true
          ? "fail"
          : replayDiff && replayDiff.avgPrimaryRewardDiff >= 0
            ? "pass"
            : "warn",
      detail:
        allWindow?.supported !== true
          ? (allWindow?.supportReason ??
            "No supported full-corpus replay window is available.")
          : replayDiff
            ? `Current-vs-best avg reward delta: ${replayDiff.avgPrimaryRewardDiff.toFixed(2)}.`
            : "Replay comparison is missing.",
    },
    {
      id: "shadow_volume",
      label: "Shadow recommendation volume",
      status:
        shadowSummary.totalLoggedDecisions >= 20
          ? "pass"
          : shadowSummary.totalLoggedDecisions > 0
            ? "warn"
            : "pending",
      detail:
        shadowSummary.totalLoggedDecisions > 0
          ? `${shadowSummary.totalLoggedDecisions} shadow decisions logged so far.`
          : "No shadow-policy decisions have been logged yet.",
    },
    {
      id: "shadow_feedback",
      label: "Operator review coverage",
      status:
        shadowSummary.feedbackCount >= 5
          ? "pass"
          : shadowSummary.feedbackCount > 0
            ? "warn"
            : "pending",
      detail:
        shadowSummary.feedbackCount > 0
          ? `${shadowSummary.feedbackCount} feedback item(s) captured across recent shadow decisions.`
          : "No operator feedback has been recorded on shadow recommendations yet.",
    },
  ];

  const hasFail = checklist.some((item) => item.status === "fail");
  const hasPending = checklist.some((item) => item.status === "pending");
  const hasWarn = checklist.some((item) => item.status === "warn");
  const shadowEvidenceReady =
    checklist.find((item) => item.id === "shadow_volume")?.status === "pass" &&
    checklist.find((item) => item.id === "shadow_feedback")?.status === "pass";

  const currentMode = hasFail
    ? readiness.status === "not_ready"
      ? "analysis_only"
      : "shadow"
    : hasPending
      ? "shadow"
      : hasWarn || !shadowEvidenceReady
        ? "shadow"
        : readiness.status !== "ready_for_shadow_learning"
          ? "advisory"
          : !hasWarn && shadowEvidenceReady
            ? "execution_eligible"
            : "advisory";

  return {
    currentMode,
    summary:
      currentMode === "execution_eligible"
        ? "All tracked gates currently clear the bar for execution eligibility review."
        : currentMode === "advisory"
          ? "Offline and shadow evidence are improving, but the learned policy should remain advisory until warnings are cleared."
          : currentMode === "shadow"
            ? "The learned policy should remain in shadow mode until more replay and review evidence accumulates."
            : "The learned policy should remain analysis-only until the training corpus and replay evidence improve.",
    checklist,
    rollbackTriggers: [
      "Offline replay windows turn unsupported or regress materially below the current policy.",
      "Shadow disagreement or misleading-feedback rate rises sharply over the last review window.",
      "Training-data readiness drops because lineage or reward coverage regresses after a backfill or schema change.",
    ],
    modeDefinitions: [
      {
        mode: "analysis_only",
        meaning:
          "Model outputs can be inspected offline, but no shadow or advisory surfacing should influence execution review.",
      },
      {
        mode: "shadow",
        meaning:
          "Model recommendations are logged alongside current decisions, but never shown as a live recommendation to operators.",
      },
      {
        mode: "advisory",
        meaning:
          "Model recommendations may be surfaced for review, but the current execution policy remains authoritative.",
      },
      {
        mode: "execution_eligible",
        meaning:
          "All tracked gates are green; a separate explicit promotion decision is still required before any live execution use.",
      },
    ],
  };
}
