import { describe, expect, it } from "vitest";
import { buildPromotionGatesReport } from "@/lib/analytics/promotion-gates";

describe("buildPromotionGatesReport", () => {
  it("keeps the system in shadow mode when shadow evidence is still sparse", () => {
    const result = buildPromotionGatesReport({
      readiness: {
        status: "ready_for_shadow_learning",
        score: 88,
        summary: "ready",
        blockers: [],
        metrics: {
          totalRecords: 200,
          enterCount: 80,
          rejectCount: 90,
          notEvaluatedCount: 30,
          computedRewardCount: 170,
          pendingRewardCount: 30,
          terminalTradeCount: 65,
          explicitLineageCount: 110,
          backfilledLineageCount: 50,
          inferredLineageCount: 20,
          incompleteLineageCount: 20,
          computedRewardCoveragePct: 85,
          lineageCoveragePct: 80,
          incompleteLineagePct: 10,
          decisionBalanceRatio: 0.89,
        },
        thresholds: {
          minRecordsForLimited: 40,
          minRecordsForShadow: 150,
          minComputedRewardCoveragePctForLimited: 45,
          minComputedRewardCoveragePctForShadow: 75,
          minLineageCoveragePctForLimited: 50,
          minLineageCoveragePctForShadow: 70,
        },
      },
      policyEvaluation: {
        referenceTimestamp: "2026-04-02T12:00:00.000Z",
        totalRecords: 200,
        globalCaveats: [],
        windows: [
          {
            id: "all",
            label: "All Available",
            startAt: null,
            endAt: "2026-04-02T12:00:00.000Z",
            evaluatedRecordCount: 170,
            supported: true,
            supportReason: null,
            assumptions: [],
            caveats: [],
            evaluation: {
              corpusSize: 200,
              evaluatedRecordCount: 170,
              current: {
                name: "Current Policy",
                description: "Current",
                metrics: {
                  selectedCount: 70,
                  acceptanceRatePct: 41,
                  computedRewardCount: 70,
                  avgPrimaryReward: 0.22,
                  totalPrimaryReward: 15.4,
                  positiveRewardRatePct: 58,
                  terminalTradeCount: 50,
                  winRatePct: 56,
                  avgEnteredPnlPct: 6.2,
                },
              },
              baselines: [],
              bestBaseline: null,
              comparison: {
                currentVsBestBaseline: {
                  avgPrimaryRewardDiff: 0.12,
                  totalPrimaryRewardDiff: 4.5,
                  winRateDiffPct: 3.2,
                },
              },
            },
          },
        ],
      },
      shadowSummary: {
        totalLoggedDecisions: 6,
        recommendEnterCount: 3,
        disagreeCount: 2,
        agreementRatePct: 66.6,
        feedbackCount: 1,
        usefulCount: 1,
        misleadingCount: 0,
        needsReviewCount: 0,
        lastLoggedAt: "2026-04-02T12:00:00.000Z",
      },
    });

    expect(result.currentMode).toBe("shadow");
    expect(
      result.checklist.some(
        (item) => item.status === "pending" || item.status === "warn",
      ),
    ).toBe(true);
  });
});
