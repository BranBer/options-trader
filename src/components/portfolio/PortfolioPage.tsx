"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  usePortfolio,
  usePortfolioTrades,
  useEquityCurve,
  usePortfolioTrade,
  useDeepDive,
  useInfinitePortfolioDiagnostics,
  useLearningReadiness,
  usePolicyEvaluation,
  usePolicyBaseline,
  usePromotionGates,
  useShadowPolicyReview,
} from "@/hooks/useApiData";
import { formatCurrency, timeAgo } from "@/lib/utils/formatters";
import type { SimTrade, TradeDecision } from "@/types/portfolio";
import type { DeepDiveAnalysis } from "@/types/analysis";
import type {
  AttributionResponse,
  AttributionMissedOpportunity,
  PostmortemResponse,
  PostmortemResult,
  BenchmarkResponse,
  BenchmarkBaseline,
  AlertDecisionTrace,
  AlertDiagnosticsOutcome,
  AlertDiagnosticsReasonCluster,
  PortfolioDiagnosticsPayload,
  LearningPolicyBaselineResult,
  LearningPolicyEvaluationHarness,
  PromotionChecklistItem,
  PromotionGatesReport,
  LearningReadinessScorecard,
  ShadowPolicyDecisionRecord,
  ShadowPolicyFeedbackVerdict,
} from "@/types/analytics";
import { ConfidenceBreakdownPanel } from "@/components/shared/ConfidenceBreakdownPanel";
import TechnicalChart from "@/components/shared/TechnicalChart";
import OptionsStatsPanel from "@/components/charts/OptionsStatsPanel";
import LineChart from "@/components/shared/LineChart";
import {
  createDefaultPortfolioStats,
  DEFAULT_SIM_PORTFOLIO_BALANCE,
  MIN_DAY_TRADING_BALANCE,
} from "@/lib/constants/portfolio";
import {
  buildDiagnosticsJsonReport,
  buildDiagnosticsMarkdownReport,
  getReasonClusterLabel,
  summarizeReasonClusters,
} from "@/lib/analytics/alert-diagnostics-export";
import {
  getDiagnosticsHrefForCorrelation,
  getDiagnosticsHrefForDecisionTrace,
  getDiagnosticsHrefForMissedOpportunity,
  getDiagnosticsHrefForPipelineGaps,
} from "@/lib/analytics/diagnostics-links";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  ShieldAlert,
  Clock,
  Trophy,
  BarChart3,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Activity,
  Filter,
  Search,
  X,
  Download,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";

// ============================================================
// Portfolio Overview Page
// ============================================================

export default function PortfolioPage() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedTradeId, setSelectedTradeId] = useState<number | null>(null);
  const [isResettingPortfolio, setIsResettingPortfolio] = useState(false);
  const [resetNotice, setResetNotice] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const allowedTabs = new Set([
    "open",
    "closed",
    "equity",
    "diagnostics",
    "learning",
    "attribution",
    "postmortem",
    "benchmark",
  ]);
  const requestedTab = searchParams.get("tab");
  const activeTab =
    requestedTab && allowedTabs.has(requestedTab) ? requestedTab : "open";

  const handleTabChange = (nextTab: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (nextTab === "open") {
      next.delete("tab");
    } else {
      next.set("tab", nextTab);
    }
    router.replace(
      `${pathname}${next.toString() ? `?${next.toString()}` : ""}`,
      {
        scroll: false,
      },
    );
  };

  const handleResetPortfolio = async () => {
    if (isResettingPortfolio) return;

    const confirmed = window.confirm(
      `This will permanently delete all simulated trades, equity snapshots, and evaluation history, then reset the portfolio to ${formatCurrency(DEFAULT_SIM_PORTFOLIO_BALANCE)}. Continue?`,
    );

    if (!confirmed) return;

    setIsResettingPortfolio(true);
    setResetError(null);
    setResetNotice(null);

    try {
      const response = await fetch("/api/portfolio", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to reset portfolio");
      }

      setSelectedTradeId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["portfolio"] }),
        queryClient.invalidateQueries({ queryKey: ["portfolioTrades"] }),
        queryClient.invalidateQueries({ queryKey: ["portfolioTrade"] }),
        queryClient.invalidateQueries({ queryKey: ["equityCurve"] }),
        queryClient.invalidateQueries({ queryKey: ["portfolioDiagnostics"] }),
      ]);
      router.refresh();
      setResetNotice(
        `Portfolio reset to ${formatCurrency(DEFAULT_SIM_PORTFOLIO_BALANCE)}.`,
      );
    } catch {
      setResetError(
        "Portfolio reset failed. The existing simulated data was left in place.",
      );
    } finally {
      setIsResettingPortfolio(false);
    }
  };

  if (selectedTradeId != null) {
    return (
      <TradeDetail
        tradeId={selectedTradeId}
        onBack={() => setSelectedTradeId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                Simulated Portfolio
              </h1>
              {process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true" && (
                <Badge
                  variant="outline"
                  className="text-xs border-amber-500/50 text-amber-400"
                >
                  MOCK DATA
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              AI-managed paper trading account following whale activity and
              analysis signals. Starting balance:{" "}
              {formatCurrency(DEFAULT_SIM_PORTFOLIO_BALANCE)} to stay above the{" "}
              {formatCurrency(MIN_DAY_TRADING_BALANCE)} pattern day trader
              minimum and reduce avoidable capital-preservation rejects.
            </p>
          </div>

          <div className="flex flex-col items-start gap-2 md:items-end">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleResetPortfolio}
              disabled={isResettingPortfolio}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {isResettingPortfolio ? "Resetting..." : "Reset Portfolio"}
            </Button>
            <p className="max-w-sm text-xs text-muted-foreground md:text-right">
              Wipes simulated trades, equity snapshots, and evaluation history,
              then restores the portfolio to its default cash state.
            </p>
          </div>
        </div>

        {resetNotice ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {resetNotice}
          </p>
        ) : null}
        {resetError ? (
          <p className="text-sm text-destructive">{resetError}</p>
        ) : null}
      </div>

      <PortfolioOverview />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="open">Open Positions</TabsTrigger>
          <TabsTrigger value="closed">Trade History</TabsTrigger>
          <TabsTrigger value="equity">Equity Curve</TabsTrigger>
          <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
          <TabsTrigger value="learning">Learning</TabsTrigger>
          <TabsTrigger value="attribution">Attribution</TabsTrigger>
          <TabsTrigger value="postmortem">Postmortem</TabsTrigger>
          <TabsTrigger value="benchmark">Benchmark</TabsTrigger>
        </TabsList>

        <TabsContent value="open" className="mt-4">
          <TradeList status="open" onSelectTrade={setSelectedTradeId} />
        </TabsContent>
        <TabsContent value="closed" className="mt-4">
          <TradeList status="closed" onSelectTrade={setSelectedTradeId} />
        </TabsContent>
        <TabsContent value="equity" className="mt-4">
          <EquityCurveSection />
        </TabsContent>
        <TabsContent value="diagnostics" className="mt-4">
          <DiagnosticsSection key={searchParams.toString()} />
        </TabsContent>
        <TabsContent value="learning" className="mt-4">
          <LearningSection />
        </TabsContent>
        <TabsContent value="attribution" className="mt-4">
          <AttributionSection />
        </TabsContent>
        <TabsContent value="postmortem" className="mt-4">
          <PostmortemSection />
        </TabsContent>
        <TabsContent value="benchmark" className="mt-4">
          <BenchmarkSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LearningSection() {
  const queryClient = useQueryClient();
  const readinessQuery = useLearningReadiness();
  const baselineQuery = usePolicyBaseline();
  const evaluationQuery = usePolicyEvaluation();
  const shadowQuery = useShadowPolicyReview();
  const promotionQuery = usePromotionGates();
  const [feedbackPendingId, setFeedbackPendingId] = useState<number | null>(
    null,
  );

  if (
    readinessQuery.isLoading ||
    baselineQuery.isLoading ||
    evaluationQuery.isLoading ||
    shadowQuery.isLoading ||
    promotionQuery.isLoading
  ) {
    return <div className="h-48 animate-pulse rounded bg-muted" />;
  }

  if (
    !readinessQuery.data?.readiness ||
    !baselineQuery.data?.policyBaseline ||
    !evaluationQuery.data?.policyEvaluation ||
    !shadowQuery.data?.shadowPolicy ||
    !promotionQuery.data?.promotionGates
  ) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Activity className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Learning insights will appear once the portfolio has enough joined
            evaluation and trade history to score readiness offline.
          </p>
        </CardContent>
      </Card>
    );
  }

  const readiness = readinessQuery.data.readiness;
  const learningSummary = readinessQuery.data.summary;
  const baseline = baselineQuery.data.policyBaseline;
  const policyEvaluation = evaluationQuery.data.policyEvaluation;
  const shadowPolicy = shadowQuery.data.shadowPolicy;
  const promotionGates = promotionQuery.data.promotionGates;
  const currentVsBest = baseline.comparison.currentVsBestBaseline;

  const handleShadowFeedback = async (
    shadowDecisionId: number,
    verdict: ShadowPolicyFeedbackVerdict,
  ) => {
    setFeedbackPendingId(shadowDecisionId);

    try {
      const response = await fetch("/api/portfolio?view=shadow-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shadowDecisionId, verdict }),
      });

      if (!response.ok) {
        throw new Error("Failed to save shadow feedback");
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shadowPolicyReview"] }),
        queryClient.invalidateQueries({ queryKey: ["promotionGates"] }),
      ]);
    } finally {
      setFeedbackPendingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Readiness Score"
          value={`${readiness.score.toFixed(1)}/100`}
          icon={BarChart3}
          description={readiness.summary}
          tooltip="Composite readiness score built from sample size, reward coverage, lineage quality, and decision balance."
          trend={getLearningStatusTrend(readiness.status)}
        />
        <StatCard
          title="Reward Coverage"
          value={`${readiness.metrics.computedRewardCoveragePct.toFixed(1)}%`}
          icon={DollarSign}
          description={`${readiness.metrics.computedRewardCount} of ${readiness.metrics.totalRecords} records have computed rewards`}
          tooltip="Share of learning rows that already have reproducible reward labels."
          trend={readiness.metrics.computedRewardCoveragePct >= 75 ? 1 : -1}
        />
        <StatCard
          title="Lineage Coverage"
          value={`${readiness.metrics.lineageCoveragePct.toFixed(1)}%`}
          icon={Target}
          description={`${readiness.metrics.explicitLineageCount + readiness.metrics.backfilledLineageCount} rows are explicit or backfilled`}
          tooltip="Share of records whose provenance is strong enough for dependable offline analysis."
          trend={readiness.metrics.lineageCoveragePct >= 70 ? 1 : -1}
        />
        <StatCard
          title="Current vs Best"
          value={
            currentVsBest
              ? `${currentVsBest.avgPrimaryRewardDiff >= 0 ? "+" : ""}${currentVsBest.avgPrimaryRewardDiff.toFixed(2)}`
              : "n/a"
          }
          icon={Trophy}
          description="Average primary reward delta versus the strongest baseline selector"
          tooltip="Positive values mean the current policy beats the best deterministic offline baseline on average reward."
          trend={
            currentVsBest
              ? currentVsBest.avgPrimaryRewardDiff >= 0
                ? 1
                : -1
              : 0
          }
        />
      </div>

      <Card className={getLearningStatusCardClass(readiness.status)}>
        <CardHeader>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-sm font-medium">
                Learning Readiness Status
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {readiness.summary}
              </p>
            </div>
            <Badge
              variant="outline"
              className={getLearningStatusBadgeClass(readiness.status)}
            >
              {formatLearningStatus(readiness.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
            <div className="space-y-3">
              <div className="rounded-lg border bg-background/70 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Current blockers
                </div>
                {readiness.blockers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No critical blockers are currently flagged for the active
                    learning window.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {readiness.blockers.map((blocker) => (
                      <div
                        key={blocker}
                        className="rounded bg-muted/40 p-2 text-sm text-muted-foreground"
                      >
                        {blocker}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                <LearningMetricTile
                  label="Decision mix"
                  value={`${readiness.metrics.enterCount} / ${readiness.metrics.rejectCount}`}
                  detail={`${readiness.metrics.notEvaluatedCount} unevaluated`}
                />
                <LearningMetricTile
                  label="Decision balance"
                  value={readiness.metrics.decisionBalanceRatio.toFixed(2)}
                  detail="1.00 means enter and reject examples are evenly represented"
                />
                <LearningMetricTile
                  label="Terminal trades"
                  value={String(readiness.metrics.terminalTradeCount)}
                  detail="Closed or expired entered positions with realized outcomes"
                />
                <LearningMetricTile
                  label="Explicit lineage"
                  value={String(readiness.metrics.explicitLineageCount)}
                  detail={`${readiness.metrics.backfilledLineageCount} backfilled`}
                />
                <LearningMetricTile
                  label="Incomplete lineage"
                  value={`${readiness.metrics.incompleteLineagePct.toFixed(1)}%`}
                  detail={`${readiness.metrics.incompleteLineageCount} records are still incomplete`}
                />
                <LearningMetricTile
                  label="Reward backlog"
                  value={String(readiness.metrics.pendingRewardCount)}
                  detail="Open or not-yet-realized records still awaiting reward completion"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border bg-background/70 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Readiness thresholds
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center justify-between rounded bg-muted/40 px-2 py-1.5">
                    <span>Limited offline tuning</span>
                    <span className="font-mono">
                      {readiness.thresholds.minRecordsForLimited} rows /{" "}
                      {
                        readiness.thresholds
                          .minComputedRewardCoveragePctForLimited
                      }
                      % rewards
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-muted/40 px-2 py-1.5">
                    <span>Shadow-learning threshold</span>
                    <span className="font-mono">
                      {readiness.thresholds.minRecordsForShadow} rows /{" "}
                      {
                        readiness.thresholds
                          .minComputedRewardCoveragePctForShadow
                      }
                      % rewards
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-muted/40 px-2 py-1.5">
                    <span>Required lineage coverage</span>
                    <span className="font-mono">
                      {readiness.thresholds.minLineageCoveragePctForShadow}% for
                      shadow readiness
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-background/70 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Corpus summary
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <LearningSummaryPill
                    label="Total"
                    value={String(learningSummary.total)}
                  />
                  <LearningSummaryPill
                    label="Enter"
                    value={String(learningSummary.byDecision.enter)}
                  />
                  <LearningSummaryPill
                    label="Reject"
                    value={String(learningSummary.byDecision.reject)}
                  />
                  <LearningSummaryPill
                    label="Computed"
                    value={String(learningSummary.byRewardStatus.computed)}
                  />
                  <LearningSummaryPill
                    label="Explicit"
                    value={String(learningSummary.byLineageQuality.explicit)}
                  />
                  <LearningSummaryPill
                    label="Backfilled"
                    value={String(learningSummary.byLineageQuality.backfilled)}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Offline Policy Baselines
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <StatCard
              title="Evaluated Corpus"
              value={String(baseline.evaluatedRecordCount)}
              icon={Activity}
              description={`${baseline.corpusSize} total materialized records`}
              tooltip="Rows with computed rewards that can support like-for-like offline policy comparison."
              trend={baseline.evaluatedRecordCount > 0 ? 1 : 0}
            />
            <StatCard
              title="Win Rate Delta"
              value={
                currentVsBest
                  ? `${currentVsBest.winRateDiffPct >= 0 ? "+" : ""}${currentVsBest.winRateDiffPct.toFixed(1)}%`
                  : "n/a"
              }
              icon={Target}
              description="Current policy versus best deterministic baseline"
              tooltip="Difference in realized win rate between the current policy and the strongest offline baseline selector."
              trend={
                currentVsBest ? (currentVsBest.winRateDiffPct >= 0 ? 1 : -1) : 0
              }
            />
            <StatCard
              title="Total Reward Delta"
              value={
                currentVsBest
                  ? `${currentVsBest.totalPrimaryRewardDiff >= 0 ? "+" : ""}${currentVsBest.totalPrimaryRewardDiff.toFixed(2)}`
                  : "n/a"
              }
              icon={TrendingUp}
              description={
                baseline.bestBaseline
                  ? `Current policy vs ${baseline.bestBaseline.name}`
                  : "No baseline comparison yet"
              }
              tooltip="Total primary reward difference between the current policy and the strongest deterministic baseline."
              trend={
                currentVsBest
                  ? currentVsBest.totalPrimaryRewardDiff >= 0
                    ? 1
                    : -1
                  : 0
              }
            />
          </div>

          <div className="space-y-3">
            <PolicyBaselineCard
              result={baseline.current}
              badgeLabel="Current policy"
              accentClass="border-blue-500/20 bg-blue-500/5"
              badgeClass="border-blue-500/30 text-blue-400"
              titleClass="text-blue-400"
            />
            {baseline.baselines.map((result) => (
              <PolicyBaselineCard
                key={result.name}
                result={result}
                badgeLabel={
                  baseline.bestBaseline?.name === result.name
                    ? "Best baseline"
                    : "Baseline"
                }
                accentClass={
                  baseline.bestBaseline?.name === result.name
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "bg-muted/50"
                }
                badgeClass={
                  baseline.bestBaseline?.name === result.name
                    ? "border-emerald-500/30 text-emerald-400"
                    : ""
                }
                titleClass={
                  baseline.bestBaseline?.name === result.name
                    ? "text-emerald-400"
                    : ""
                }
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Counterfactual Replay Windows
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
            Replays compare the current policy and candidate alternatives on the
            same computed-reward rows. Unsupported windows stay visible, but are
            explicitly marked so they do not get mistaken for promotion-ready
            evidence.
          </div>
          <div className="space-y-3">
            {policyEvaluation.windows.map((window) => (
              <PolicyEvaluationWindowCard key={window.id} window={window} />
            ))}
          </div>
          <div className="rounded-lg border bg-background/70 p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Global caveats
            </div>
            <div className="space-y-1 text-sm text-muted-foreground">
              {policyEvaluation.globalCaveats.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Shadow Policy Review
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <StatCard
              title="Shadow Logs"
              value={String(shadowPolicy.summary.totalLoggedDecisions)}
              icon={Activity}
              description={
                shadowPolicy.summary.lastLoggedAt
                  ? `Last logged ${timeAgo(shadowPolicy.summary.lastLoggedAt)}`
                  : "No shadow decisions logged yet"
              }
              tooltip="Number of recent shadow-policy recommendations captured alongside the live decision path."
              trend={shadowPolicy.summary.totalLoggedDecisions > 0 ? 1 : 0}
            />
            <StatCard
              title="Agreement"
              value={`${shadowPolicy.summary.agreementRatePct.toFixed(1)}%`}
              icon={Target}
              description={`${shadowPolicy.summary.disagreeCount} disagreements in recent logs`}
              tooltip="How often the shadow policy agrees with the current execution decision on recent recommendations."
              trend={shadowPolicy.summary.agreementRatePct >= 50 ? 1 : 0}
            />
            <StatCard
              title="Feedback"
              value={String(shadowPolicy.summary.feedbackCount)}
              icon={HelpCircle}
              description={`${shadowPolicy.summary.usefulCount} useful / ${shadowPolicy.summary.misleadingCount} misleading`}
              tooltip="Operator review count captured on logged shadow recommendations."
              trend={shadowPolicy.summary.feedbackCount > 0 ? 1 : 0}
            />
            <StatCard
              title="Holdout Accuracy"
              value={`${shadowPolicy.model.calibration.accuracyPct.toFixed(1)}%`}
              icon={BarChart3}
              description={`${shadowPolicy.model.calibration.holdoutSize} holdout rows`}
              tooltip="Holdout accuracy for the empirical shadow-policy model trained from the current learning corpus."
              trend={shadowPolicy.model.calibration.accuracyPct >= 55 ? 1 : 0}
            />
          </div>

          <div className="rounded-lg border bg-background/70 p-3">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Model snapshot
            </div>
            <div className="grid gap-2 text-xs md:grid-cols-4">
              <PolicyMetric
                label="Policy"
                value={shadowPolicy.model.policyName}
              />
              <PolicyMetric
                label="Threshold"
                value={shadowPolicy.model.threshold.toFixed(2)}
              />
              <PolicyMetric
                label="Precision"
                value={`${shadowPolicy.model.calibration.precisionPct.toFixed(1)}%`}
              />
              <PolicyMetric
                label="Recall"
                value={`${shadowPolicy.model.calibration.recallPct.toFixed(1)}%`}
              />
            </div>
          </div>

          {shadowPolicy.decisions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Shadow recommendations will appear here after the next simulation
              pipeline cycle records them.
            </div>
          ) : (
            <div className="space-y-3">
              {shadowPolicy.decisions.map((decision) => (
                <ShadowDecisionCard
                  key={decision.id}
                  decision={decision}
                  pending={feedbackPendingId === decision.id}
                  onFeedback={handleShadowFeedback}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="text-sm font-medium">
              Promotion Gates
            </CardTitle>
            <Badge
              variant="outline"
              className={getPromotionModeBadgeClass(promotionGates.currentMode)}
            >
              {promotionGates.currentMode.replace(/_/g, " ")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border bg-background/70 p-3 text-sm text-muted-foreground">
            {promotionGates.summary}
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
            <div className="space-y-2">
              {promotionGates.checklist.map((item) => (
                <PromotionChecklistCard key={item.id} item={item} />
              ))}
            </div>
            <div className="space-y-3">
              <div className="rounded-lg border bg-background/70 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Deployment modes
                </div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  {promotionGates.modeDefinitions.map((definition) => (
                    <div
                      key={definition.mode}
                      className="rounded bg-muted/40 p-2"
                    >
                      <div className="font-medium text-foreground">
                        {definition.mode.replace(/_/g, " ")}
                      </div>
                      <div>{definition.meaning}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border bg-background/70 p-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Rollback triggers
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {promotionGates.rollbackTriggers.map((trigger) => (
                    <div key={trigger}>{trigger}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LearningMetricTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-background/70 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function LearningSummaryPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded bg-muted/40 px-2 py-1.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

function PolicyBaselineCard({
  result,
  badgeLabel,
  accentClass,
  badgeClass,
  titleClass,
}: {
  result: LearningPolicyBaselineResult;
  badgeLabel: string;
  accentClass: string;
  badgeClass: string;
  titleClass: string;
}) {
  return (
    <div className={`rounded p-3 ${accentClass}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className={`text-sm font-medium ${titleClass}`}>
            {result.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {result.description}
          </div>
        </div>
        <Badge variant="outline" className={badgeClass}>
          {badgeLabel}
        </Badge>
      </div>
      <div className="grid gap-2 text-xs md:grid-cols-3 xl:grid-cols-6">
        <PolicyMetric
          label="Selected"
          value={String(result.metrics.selectedCount)}
        />
        <PolicyMetric
          label="Accept %"
          value={`${result.metrics.acceptanceRatePct.toFixed(1)}%`}
        />
        <PolicyMetric
          label="Avg Reward"
          value={result.metrics.avgPrimaryReward.toFixed(2)}
        />
        <PolicyMetric
          label="Total Reward"
          value={result.metrics.totalPrimaryReward.toFixed(2)}
        />
        <PolicyMetric
          label="Win Rate"
          value={`${result.metrics.winRatePct.toFixed(1)}%`}
        />
        <PolicyMetric
          label="Avg PnL %"
          value={`${result.metrics.avgEnteredPnlPct.toFixed(1)}%`}
        />
      </div>
    </div>
  );
}

function PolicyEvaluationWindowCard({
  window,
}: {
  window: LearningPolicyEvaluationHarness["windows"][number];
}) {
  const bestName = window.evaluation.bestBaseline?.name ?? "No baseline leader";
  const currentVsBest = window.evaluation.comparison.currentVsBestBaseline;

  return (
    <div className="rounded-lg border bg-background/70 p-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{window.label}</span>
            <Badge
              variant="outline"
              className={
                window.supported
                  ? "border-emerald-500/30 text-emerald-400"
                  : "border-amber-500/30 text-amber-400"
              }
            >
              {window.supported ? "supported" : "unsupported"}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {window.startAt && window.endAt
              ? `${new Date(window.startAt).toLocaleDateString()} to ${new Date(window.endAt).toLocaleDateString()}`
              : "Full available corpus window"}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{window.evaluatedRecordCount} evaluated records</div>
          <div>Leader: {bestName}</div>
        </div>
      </div>

      {window.supportReason ? (
        <div className="mt-3 rounded bg-amber-500/10 p-2 text-sm text-amber-300">
          {window.supportReason}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <LearningMetricTile
          label="Current selected"
          value={String(window.evaluation.current.metrics.selectedCount)}
          detail="Rows the current policy would have entered in this window"
        />
        <LearningMetricTile
          label="Reward delta"
          value={
            currentVsBest
              ? `${currentVsBest.avgPrimaryRewardDiff >= 0 ? "+" : ""}${currentVsBest.avgPrimaryRewardDiff.toFixed(2)}`
              : "n/a"
          }
          detail="Average primary reward difference versus the best baseline"
        />
        <LearningMetricTile
          label="Win-rate delta"
          value={
            currentVsBest
              ? `${currentVsBest.winRateDiffPct >= 0 ? "+" : ""}${currentVsBest.winRateDiffPct.toFixed(1)}%`
              : "n/a"
          }
          detail="Realized win-rate delta versus the best baseline"
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded border bg-muted/20 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Assumptions
          </div>
          <div className="space-y-1 text-sm text-muted-foreground">
            {window.assumptions.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </div>
        <div className="rounded border bg-muted/20 p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Caveats
          </div>
          <div className="space-y-1 text-sm text-muted-foreground">
            {window.caveats.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShadowDecisionCard({
  decision,
  pending,
  onFeedback,
}: {
  decision: ShadowPolicyDecisionRecord;
  pending: boolean;
  onFeedback: (
    shadowDecisionId: number,
    verdict: ShadowPolicyFeedbackVerdict,
  ) => Promise<void>;
}) {
  return (
    <div className="rounded-lg border bg-background/70 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-bold">{decision.ticker}</span>
            <Badge
              variant="outline"
              className={
                decision.recommendedAction === "enter"
                  ? "border-emerald-500/30 text-emerald-400"
                  : "border-amber-500/30 text-amber-400"
              }
            >
              shadow {decision.recommendedAction}
            </Badge>
            <Badge
              variant="outline"
              className={
                decision.agreedWithCurrent
                  ? "border-blue-500/30 text-blue-400"
                  : "border-red-500/30 text-red-400"
              }
            >
              {decision.agreedWithCurrent ? "agrees" : "disagrees"} with current{" "}
              {decision.currentDecision}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {decision.reasonSummary ?? "No shadow rationale recorded."}
          </div>
          <div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
            <PolicyMetric label="Score" value={decision.score.toFixed(2)} />
            <PolicyMetric
              label="Confidence"
              value={decision.confidence.toFixed(2)}
            />
            <PolicyMetric
              label="Logged"
              value={decision.createdAt ? timeAgo(decision.createdAt) : "n/a"}
            />
          </div>
          {decision.drivers.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {decision.drivers.map((driver) => (
                <Badge
                  key={`${decision.id}-${driver.label}`}
                  variant="outline"
                  className={
                    driver.impact === "positive"
                      ? "border-emerald-500/30 text-emerald-400"
                      : "border-amber-500/30 text-amber-400"
                  }
                >
                  {driver.label}: {driver.contribution >= 0 ? "+" : ""}
                  {driver.contribution.toFixed(2)}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 lg:items-end">
          {decision.feedback ? (
            <Badge
              variant="outline"
              className={getFeedbackBadgeClass(decision.feedback.verdict)}
            >
              {decision.feedback.verdict.replace(/_/g, " ")}
            </Badge>
          ) : (
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => onFeedback(decision.id, "useful")}
              >
                Useful
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => onFeedback(decision.id, "misleading")}
              >
                Misleading
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => onFeedback(decision.id, "needs_review")}
              >
                Needs Review
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PromotionChecklistCard({ item }: { item: PromotionChecklistItem }) {
  return (
    <div className="rounded-lg border bg-background/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{item.label}</div>
          <div className="mt-1 text-sm text-muted-foreground">
            {item.detail}
          </div>
        </div>
        <Badge
          variant="outline"
          className={getPromotionChecklistBadgeClass(item.status)}
        >
          {item.status}
        </Badge>
      </div>
    </div>
  );
}

function PolicyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <p className="font-mono">{value}</p>
    </div>
  );
}

function formatLearningStatus(status: LearningReadinessScorecard["status"]) {
  switch (status) {
    case "ready_for_shadow_learning":
      return "Ready For Shadow Learning";
    case "limited_offline_tuning":
      return "Limited Offline Tuning";
    default:
      return "Not Ready";
  }
}

function getLearningStatusTrend(status: LearningReadinessScorecard["status"]) {
  switch (status) {
    case "ready_for_shadow_learning":
      return 1;
    case "limited_offline_tuning":
      return 0;
    default:
      return -1;
  }
}

function getLearningStatusCardClass(
  status: LearningReadinessScorecard["status"],
) {
  switch (status) {
    case "ready_for_shadow_learning":
      return "border-emerald-500/20 bg-emerald-500/5";
    case "limited_offline_tuning":
      return "border-blue-500/20 bg-blue-500/5";
    default:
      return "border-amber-500/20 bg-amber-500/5";
  }
}

function getLearningStatusBadgeClass(
  status: LearningReadinessScorecard["status"],
) {
  switch (status) {
    case "ready_for_shadow_learning":
      return "border-emerald-500/30 text-emerald-400";
    case "limited_offline_tuning":
      return "border-blue-500/30 text-blue-400";
    default:
      return "border-amber-500/30 text-amber-400";
  }
}

function getPromotionChecklistBadgeClass(
  status: PromotionChecklistItem["status"],
) {
  switch (status) {
    case "pass":
      return "border-emerald-500/30 text-emerald-400";
    case "warn":
      return "border-blue-500/30 text-blue-400";
    case "pending":
      return "border-amber-500/30 text-amber-400";
    default:
      return "border-red-500/30 text-red-400";
  }
}

function getPromotionModeBadgeClass(mode: PromotionGatesReport["currentMode"]) {
  switch (mode) {
    case "execution_eligible":
      return "border-emerald-500/30 text-emerald-400";
    case "advisory":
      return "border-blue-500/30 text-blue-400";
    case "shadow":
      return "border-amber-500/30 text-amber-400";
    default:
      return "border-red-500/30 text-red-400";
  }
}

function getFeedbackBadgeClass(verdict: ShadowPolicyFeedbackVerdict) {
  switch (verdict) {
    case "useful":
      return "border-emerald-500/30 text-emerald-400";
    case "misleading":
      return "border-red-500/30 text-red-400";
    default:
      return "border-amber-500/30 text-amber-400";
  }
}

// ============================================================
// Portfolio Stats Cards
// ============================================================

function PortfolioOverview() {
  const { data, isLoading } = usePortfolio();

  if (isLoading) {
    return (
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4">
              <div className="h-12 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const p = data?.portfolio ?? createDefaultPortfolioStats();

  return (
    <TooltipProvider>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Balance"
          value={formatCurrency(p.balance)}
          icon={DollarSign}
          description={`Started at ${formatCurrency(p.startingBalance)}`}
          tooltip="Current cash balance in the simulated portfolio. Decreases when opening debit positions and increases when collecting credits or closing profitable trades."
          trend={p.totalPnl}
        />
        <StatCard
          title="Total P&L"
          value={`${p.totalPnl >= 0 ? "+" : ""}${formatCurrency(p.totalPnl)}`}
          icon={p.totalPnl >= 0 ? TrendingUp : TrendingDown}
          description={`${p.totalPnlPct >= 0 ? "+" : ""}${p.totalPnlPct.toFixed(1)}% return`}
          tooltip="Total profit or loss across all closed trades. This is the net gain/loss compared to the starting balance."
          trend={p.totalPnl}
        />
        <StatCard
          title="Win Rate"
          value={`${p.winRate.toFixed(0)}%`}
          icon={Target}
          description={`${p.winningTrades}W / ${p.losingTrades}L of ${p.totalTrades} trades`}
          tooltip="Percentage of closed trades that were profitable. A win rate above 50% combined with a positive average P&L suggests a sound strategy."
          trend={p.winRate > 50 ? 1 : p.winRate === 0 ? 0 : -1}
        />
        <StatCard
          title="Max Drawdown"
          value={`${p.maxDrawdown.toFixed(1)}%`}
          icon={ShieldAlert}
          description={
            p.sharpeRatio != null
              ? `Sharpe: ${p.sharpeRatio.toFixed(2)}`
              : `${p.openPositions} open position${p.openPositions !== 1 ? "s" : ""}`
          }
          tooltip="The largest peak-to-trough decline in portfolio value. Lower is better — it measures the worst-case loss you would have experienced. The Sharpe ratio measures risk-adjusted returns (higher is better, above 1.0 is good)."
          trend={p.maxDrawdown > 20 ? -1 : 0}
        />
      </div>
    </TooltipProvider>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  tooltip,
  trend,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  tooltip: string;
  trend: number;
}) {
  const trendColor =
    trend > 0
      ? "text-emerald-400"
      : trend < 0
        ? "text-red-400"
        : "text-muted-foreground";

  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between">
          <Tooltip>
            <TooltipTrigger>
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                {title}
                <HelpCircle className="h-3 w-3" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">{tooltip}</p>
            </TooltipContent>
          </Tooltip>
          <Icon className={`h-4 w-4 ${trendColor}`} />
        </div>
        <p className={`mt-0.5 text-xl font-bold ${trendColor}`}>{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Trade List (Open / Closed)
// ============================================================

function TradeList({
  status,
  onSelectTrade,
}: {
  status: "open" | "closed";
  onSelectTrade: (id: number) => void;
}) {
  const { data, isLoading } = usePortfolioTrades(status);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  const trades = data?.trades ?? [];

  if (trades.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Activity className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            {status === "open"
              ? "No open positions yet. The AI will open trades when it finds high-quality opportunities from whale activity and analysis."
              : "No trade history yet. Closed trades will appear here with full P&L breakdowns."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {trades.map((trade) => (
        <TradeRow
          key={trade.id}
          trade={trade}
          onClick={() => onSelectTrade(trade.id)}
        />
      ))}
    </div>
  );
}

function TradeRow({
  trade,
  onClick,
}: {
  trade: SimTrade;
  onClick: () => void;
}) {
  const isOpen = trade.status === "open";
  const pnl = trade.pnl ?? 0;
  const pnlPct = trade.pnlPct ?? 0;
  const pnlColor =
    pnl > 0
      ? "text-emerald-400"
      : pnl < 0
        ? "text-red-400"
        : "text-muted-foreground";
  const directionColor =
    trade.direction === "bullish"
      ? "text-emerald-400"
      : trade.direction === "bearish"
        ? "text-red-400"
        : "text-yellow-400";

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent/50"
      onClick={onClick}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold">{trade.ticker}</span>
              <Badge variant="outline" className="text-xs">
                {trade.strategyName}
              </Badge>
              <span className={`text-xs ${directionColor}`}>
                {trade.direction}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Entry: {formatCurrency(Math.abs(trade.entryPrice))} •{" "}
              {timeAgo(trade.entryDate)}
              {trade.exitReason && (
                <> • Exit: {formatExitReason(trade.exitReason)}</>
              )}
            </p>
          </div>
          <div className="text-right shrink-0">
            {isOpen ? (
              <Badge
                variant="outline"
                className="border-blue-500/30 text-blue-400"
              >
                Open
              </Badge>
            ) : (
              <span className={`font-mono font-bold text-sm ${pnlColor}`}>
                {pnl >= 0 ? "+" : ""}
                {formatCurrency(pnl)}
                <span className="text-xs ml-1">
                  ({pnlPct >= 0 ? "+" : ""}
                  {pnlPct.toFixed(1)}%)
                </span>
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// Equity Curve
// ============================================================

function EquityCurveSection() {
  const { data, isLoading } = useEquityCurve();
  const snapshots = data?.snapshots ?? [];

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-muted" />;
  }

  if (snapshots.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            Equity curve data will appear after the first portfolio snapshot.
            Snapshots are taken every 30 minutes during pipeline runs.
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = snapshots.map((s) => ({
    date: new Date(s.date),
    value: s.balance,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          Portfolio Value Over Time
        </CardTitle>
      </CardHeader>
      <CardContent>
        <LineChart
          data={chartData}
          formatValue={(v) => `$${v.toLocaleString()}`}
        />
      </CardContent>
    </Card>
  );
}

// ============================================================
// Diagnostics Section (Epic 32)
// ============================================================

export function DiagnosticsSection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const [draftTicker, setDraftTicker] = useState(
    searchParams.get("ticker") ?? "",
  );
  const [draftMinQuality, setDraftMinQuality] = useState(
    searchParams.get("minQuality") ?? "",
  );
  const [expandedTraceKey, setExpandedTraceKey] = useState<string | null>(null);
  const [pinnedTraceKeys, setPinnedTraceKeys] = useState<string[]>([]);
  const [compareDensity, setCompareDensity] = useState<"detailed" | "compact">(
    "detailed",
  );

  const outcomeParam = searchParams.get("outcome");
  const outcome =
    outcomeParam === "entered" ||
    outcomeParam === "rejected" ||
    outcomeParam === "not_evaluated"
      ? outcomeParam
      : null;
  const reasonClusterParam = searchParams.get("reasonCluster");
  const reasonCluster =
    reasonClusterParam === "same_day_blocked" ||
    reasonClusterParam === "missing_market_data" ||
    reasonClusterParam === "pipeline_gap" ||
    reasonClusterParam === "confidence_threshold" ||
    reasonClusterParam === "portfolio_concentration"
      ? reasonClusterParam
      : null;
  const appliedTicker =
    searchParams.get("ticker")?.trim().toUpperCase() || undefined;
  const appliedMinQualityRaw = searchParams.get("minQuality");
  const appliedMinQuality =
    appliedMinQualityRaw != null && appliedMinQualityRaw !== ""
      ? Number(appliedMinQualityRaw)
      : null;
  const hasActiveFilters =
    appliedTicker != null ||
    outcome != null ||
    reasonCluster != null ||
    appliedMinQuality != null ||
    startDate != null ||
    endDate != null;

  const updateDiagnosticsSearch = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", "diagnostics");

    for (const [key, value] of Object.entries(updates)) {
      if (value == null || value === "") {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const diagnosticsQuery = useInfinitePortfolioDiagnostics(
    {
      ticker: appliedTicker,
      outcome,
      reasonCluster,
      minQuality: appliedMinQuality,
    },
    8,
  );

  const pages = diagnosticsQuery.data?.pages ?? [];
  const traces = pages.flatMap((page) => page.diagnostics.traces);
  const overview = pages[0]?.diagnostics ?? null;
  const exportPayload: PortfolioDiagnosticsPayload | null = overview
    ? {
        ...overview,
        traces,
      }
    : null;
  const failureClusters = summarizeReasonClusters(traces);
  const pinnedTraces = pinnedTraceKeys
    .map((traceKey) => traces.find((trace) => getTraceKey(trace) === traceKey))
    .filter((trace): trace is AlertDecisionTrace => trace != null);

  const downloadReport = (
    fileName: string,
    contents: string,
    contentType: string,
  ) => {
    const blob = new Blob([contents], { type: contentType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = (format: "json" | "markdown") => {
    if (!exportPayload) return;

    const date = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      downloadReport(
        `alert-diagnostics-${date}.json`,
        buildDiagnosticsJsonReport(exportPayload),
        "application/json",
      );
      return;
    }

    downloadReport(
      `alert-diagnostics-${date}.md`,
      buildDiagnosticsMarkdownReport(exportPayload),
      "text/markdown",
    );
  };

  const togglePinnedTrace = (traceKey: string) => {
    setPinnedTraceKeys((current) => {
      if (current.includes(traceKey)) {
        return current.filter((key) => key !== traceKey);
      }
      if (current.length >= 3) {
        return current;
      }
      return [...current, traceKey];
    });
  };

  const applyReasonClusterFilter = (
    cluster: AlertDiagnosticsReasonCluster,
    nextOutcome?: AlertDiagnosticsOutcome,
  ) => {
    updateDiagnosticsSearch({
      reasonCluster: cluster,
      outcome:
        nextOutcome ??
        (cluster === "pipeline_gap" ? "not_evaluated" : "rejected"),
    });
  };

  const applyTopReasonFilter = (reason: string) => {
    const cluster = inferReasonClusterFromReasonText(reason);
    updateDiagnosticsSearch({
      reasonCluster: cluster,
      outcome: cluster === "pipeline_gap" ? "not_evaluated" : "rejected",
    });
  };

  const applyFilters = () => {
    const nextTicker = draftTicker.trim().toUpperCase();
    const nextMinQuality = draftMinQuality.trim();

    updateDiagnosticsSearch({
      ticker: nextTicker || null,
      minQuality:
        nextMinQuality === "" || Number.isNaN(Number(nextMinQuality))
          ? null
          : nextMinQuality,
    });
  };

  const clearFilters = () => {
    setDraftTicker("");
    setDraftMinQuality("");
    updateDiagnosticsSearch({
      ticker: null,
      outcome: null,
      reasonCluster: null,
      minQuality: null,
      startDate: null,
      endDate: null,
    });
  };

  const focusPipelineGaps = () => {
    setDraftTicker("");
    setDraftMinQuality("");
    updateDiagnosticsSearch({
      ticker: null,
      minQuality: null,
      outcome: "not_evaluated",
      reasonCluster: "pipeline_gap",
      startDate: null,
      endDate: null,
    });
  };

  const applyPreset = (
    preset:
      | "all"
      | "high_quality_missed"
      | "pipeline_gaps"
      | "same_day_blocked"
      | "missing_market_data"
      | "entered",
  ) => {
    if (preset === "all") {
      clearFilters();
      return;
    }

    if (preset === "high_quality_missed") {
      setDraftMinQuality("70");
      updateDiagnosticsSearch({
        ticker: null,
        minQuality: "70",
        outcome: "rejected",
        reasonCluster: null,
      });
      return;
    }

    if (preset === "pipeline_gaps") {
      setDraftTicker("");
      setDraftMinQuality("");
      updateDiagnosticsSearch({
        ticker: null,
        minQuality: null,
        outcome: "not_evaluated",
        reasonCluster: "pipeline_gap",
      });
      return;
    }

    if (preset === "same_day_blocked") {
      updateDiagnosticsSearch({
        outcome: "rejected",
        reasonCluster: "same_day_blocked",
      });
      return;
    }

    if (preset === "missing_market_data") {
      updateDiagnosticsSearch({
        outcome: "rejected",
        reasonCluster: "missing_market_data",
      });
      return;
    }

    updateDiagnosticsSearch({
      outcome: "entered",
      reasonCluster: null,
      ticker: null,
      minQuality: null,
    });
  };

  if (diagnosticsQuery.isLoading) {
    return <div className="h-48 animate-pulse rounded bg-muted" />;
  }

  if (diagnosticsQuery.isError) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-amber-500" />
          <p className="text-sm font-medium">
            Diagnostics are temporarily unavailable.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            The recent alert trace window could not be loaded. Retry the request
            or clear filters if this was triggered by a narrow query.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => diagnosticsQuery.refetch()}
            >
              Retry
            </Button>
            {hasActiveFilters ? (
              <Button variant="ghost" onClick={clearFilters}>
                Clear Filters
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!overview) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Activity className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            Diagnostics payload is not available yet. This usually means there
            are no recent whale alerts stored for tracing.
          </p>
        </CardContent>
      </Card>
    );
  }

  const pipelineHealth = overview.pipelineHealth;
  const noTraces = traces.length === 0;
  const noDiagnosticsYet = noTraces && !hasActiveFilters;
  const filteredEmpty = noTraces && hasActiveFilters;
  const showPipelineGapCta =
    pipelineHealth.status === "stale" || pipelineHealth.status === "never_run";
  const activeDiagnosticsFilters = [
    appliedTicker
      ? {
          key: "ticker",
          label: `Ticker: ${appliedTicker}`,
          onRemove: () => {
            setDraftTicker("");
            updateDiagnosticsSearch({ ticker: null });
          },
        }
      : null,
    outcome
      ? {
          key: "outcome",
          label: `Outcome: ${formatDiagnosticsOutcomeLabel(outcome)}`,
          onRemove: () => updateDiagnosticsSearch({ outcome: null }),
        }
      : null,
    reasonCluster
      ? {
          key: "reasonCluster",
          label: `Cluster: ${getReasonClusterLabel(reasonCluster)}`,
          onRemove: () => updateDiagnosticsSearch({ reasonCluster: null }),
        }
      : null,
    appliedMinQuality != null
      ? {
          key: "minQuality",
          label: `Min quality: ${appliedMinQuality}`,
          onRemove: () => {
            setDraftMinQuality("");
            updateDiagnosticsSearch({ minQuality: null });
          },
        }
      : null,
    startDate
      ? {
          key: "startDate",
          label: `Start: ${startDate}`,
          onRemove: () => updateDiagnosticsSearch({ startDate: null }),
        }
      : null,
    endDate
      ? {
          key: "endDate",
          label: `End: ${endDate}`,
          onRemove: () => updateDiagnosticsSearch({ endDate: null }),
        }
      : null,
  ].filter(
    (
      filter,
    ): filter is {
      key: string;
      label: string;
      onRemove: () => void;
    } => filter != null,
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Recent Alerts"
          value={String(overview.summary.total)}
          icon={Activity}
          description="Current diagnostics window"
          tooltip="Number of recent whale alerts in the currently filtered diagnostics view."
          trend={0}
        />
        <StatCard
          title="Entered"
          value={String(overview.summary.byOutcome.entered)}
          icon={TrendingUp}
          description="Alerts that became trades"
          tooltip="Recent alerts that successfully reached trade entry."
          trend={overview.summary.byOutcome.entered > 0 ? 1 : 0}
        />
        <StatCard
          title="Rejected"
          value={String(overview.summary.byOutcome.rejected)}
          icon={TrendingDown}
          description="Alerts blocked by a gate"
          tooltip="Recent alerts that were evaluated but stopped before a trade was opened."
          trend={overview.summary.byOutcome.rejected > 0 ? -1 : 0}
        />
        <StatCard
          title="Pipeline Health"
          value={overview.pipelineHealth.status}
          icon={overview.pipelineHealth.isStale ? ShieldAlert : Target}
          description={
            overview.pipelineHealth.minutesSinceRefresh != null
              ? `${overview.pipelineHealth.minutesSinceRefresh} minute(s) since refresh`
              : "No successful refresh yet"
          }
          tooltip="Derived pipeline freshness for the diagnostics window. Stale or never-run states explain why alerts may not have been evaluated."
          trend={overview.pipelineHealth.status === "healthy" ? 1 : -1}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            Diagnostics Filters
            <Filter className="h-4 w-4 text-muted-foreground" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                value={draftTicker}
                onChange={(event) => setDraftTicker(event.target.value)}
                placeholder="Filter by ticker"
                className="pl-8"
              />
            </div>
            <Input
              value={draftMinQuality}
              onChange={(event) => setDraftMinQuality(event.target.value)}
              inputMode="numeric"
              placeholder="Min quality"
            />
            <Button variant="outline" onClick={applyFilters}>
              Apply
            </Button>
            <Button variant="ghost" onClick={clearFilters}>
              <X className="h-4 w-4" />
              Clear
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={outcome === null ? "secondary" : "outline"}
              size="sm"
              onClick={() =>
                updateDiagnosticsSearch({ outcome: null, reasonCluster: null })
              }
            >
              All outcomes
            </Button>
            <Button
              variant={outcome === "entered" ? "secondary" : "outline"}
              size="sm"
              onClick={() =>
                updateDiagnosticsSearch({
                  outcome: "entered",
                  reasonCluster: null,
                })
              }
            >
              Entered
            </Button>
            <Button
              variant={outcome === "rejected" ? "secondary" : "outline"}
              size="sm"
              onClick={() => updateDiagnosticsSearch({ outcome: "rejected" })}
            >
              Rejected
            </Button>
            <Button
              variant={outcome === "not_evaluated" ? "secondary" : "outline"}
              size="sm"
              onClick={() =>
                updateDiagnosticsSearch({
                  outcome: "not_evaluated",
                  reasonCluster: "pipeline_gap",
                })
              }
            >
              Not evaluated
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset("all")}
            >
              All recent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset("high_quality_missed")}
            >
              High-quality missed
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset("pipeline_gaps")}
            >
              Pipeline gaps
            </Button>
            <Button
              variant={
                reasonCluster === "same_day_blocked" ? "secondary" : "outline"
              }
              size="sm"
              onClick={() => applyPreset("same_day_blocked")}
            >
              Same-day blocked
            </Button>
            <Button
              variant={
                reasonCluster === "missing_market_data"
                  ? "secondary"
                  : "outline"
              }
              size="sm"
              onClick={() => applyPreset("missing_market_data")}
            >
              Missing market data
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => applyPreset("entered")}
            >
              Captured alerts
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 p-2">
            <div className="text-xs text-muted-foreground">
              {noTraces
                ? "Exports unlock once the current diagnostics window contains traces."
                : "Export the current filtered window or pin up to three traces for sprint review."}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("json")}
                disabled={!exportPayload || traces.length === 0}
              >
                <Download className="h-3.5 w-3.5" />
                Export JSON
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("markdown")}
                disabled={!exportPayload || traces.length === 0}
              >
                <Download className="h-3.5 w-3.5" />
                Export Markdown
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {hasActiveFilters ? (
        <Card className="border-border/70 bg-muted/15">
          <CardContent className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium">
                Active diagnostics window
              </div>
              <p className="text-xs text-muted-foreground">
                Showing {overview.summary.total} alert(s) for the current filter
                set.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {activeDiagnosticsFilters.map((filter) => (
                <Button
                  key={filter.key}
                  variant="secondary"
                  size="sm"
                  onClick={filter.onRemove}
                >
                  {filter.label}
                  <X className="h-3.5 w-3.5" />
                </Button>
              ))}
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Reset all
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {pipelineHealth.status === "never_run" ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">
                  The pipeline has not produced a diagnostics window yet.
                </div>
                <p className="text-sm text-muted-foreground">
                  Recent whale alerts cannot be traced until a successful
                  pipeline run stores evaluations. No completed refresh has been
                  recorded in the database yet, so this is usually a startup or
                  brand-new-db state rather than a hidden pipeline failure.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {hasActiveFilters ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={focusPipelineGaps}>
                  Focus Pipeline Gaps
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {pipelineHealth.status === "stale" &&
      overview.summary.byOutcome.not_evaluated > 0 ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">
                  Pipeline freshness may be masking unevaluated alerts.
                </div>
                <p className="text-sm text-muted-foreground">
                  The last completed refresh was{" "}
                  {pipelineHealth.minutesSinceRefresh} minute(s) ago. In local
                  development this often means the dev server was restarted or
                  left idle. Use the pipeline-gap view to isolate alerts that
                  were never evaluated before the data went stale.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={focusPipelineGaps}>
                  Investigate Pipeline Gaps
                </Button>
                {hasActiveFilters ? (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Reset Filters
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {filteredEmpty ? (
        <Card className="border-dashed">
          <CardContent className="py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="text-sm font-medium text-foreground">
                  No alert traces match the current filters.
                </div>
                <p className="text-sm text-muted-foreground">
                  Broaden the ticker, outcome, cluster, or minimum-quality
                  filters to reopen the diagnostics window.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Show All Recent
                </Button>
                {showPipelineGapCta ? (
                  <Button variant="ghost" size="sm" onClick={focusPipelineGaps}>
                    Check Pipeline Gaps
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {noDiagnosticsYet ? (
        <Card className="border-dashed">
          <CardContent className="py-4">
            <div className="space-y-1">
              <div className="text-sm font-medium text-foreground">
                No recent whale alerts are available in the diagnostics window.
              </div>
              <p className="text-sm text-muted-foreground">
                This is different from a fetch error: the diagnostics API is
                healthy, but there are no recent alerts stored to trace right
                now.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-medium">
              Pinned Trace Comparison
            </CardTitle>
            {pinnedTraces.length >= 2 ? (
              <div className="flex items-center gap-2">
                <Button
                  variant={
                    compareDensity === "compact" ? "secondary" : "outline"
                  }
                  size="sm"
                  onClick={() => setCompareDensity("compact")}
                >
                  Compact compare
                </Button>
                <Button
                  variant={
                    compareDensity === "detailed" ? "secondary" : "outline"
                  }
                  size="sm"
                  onClick={() => setCompareDensity("detailed")}
                >
                  Detailed compare
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {pinnedTraces.length === 0
                ? "Pin alerts from the trace list below to compare decisions side by side."
                : `${pinnedTraces.length} of 3 traces pinned for comparison.`}
            </span>
            {pinnedTraceKeys.length >= 3 ? (
              <Badge variant="outline" className="text-[10px]">
                Pin limit reached
              </Badge>
            ) : null}
          </div>

          {pinnedTraces.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              {noTraces
                ? "No traces are currently available to pin for comparison."
                : "Use the pin action on any alert trace to keep it in this comparison view."}
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-3">
              {pinnedTraces.map((trace) => {
                const traceKey = getTraceKey(trace);

                return (
                  <div
                    key={`compare-${traceKey}`}
                    className="rounded-lg border bg-muted/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold">
                            {trace.ticker}
                          </span>
                          <Badge
                            variant="outline"
                            className={getOutcomeBadgeClass(trace.finalOutcome)}
                          >
                            {trace.finalOutcome.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {trace.primaryReason ??
                            "No blocking reason recorded."}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => togglePinnedTrace(traceKey)}
                      >
                        <PinOff className="h-3.5 w-3.5" />
                        Unpin
                      </Button>
                    </div>

                    {compareDensity === "compact" ? (
                      <div className="mt-3 space-y-2 text-xs">
                        <div className="rounded bg-background/70 p-2 text-muted-foreground">
                          <div>Detected {timeAgo(trace.detectedAt)}</div>
                          <div>Quality {trace.qualityScore ?? "n/a"}</div>
                          <div>
                            Cluster {getReasonClusterLabel(trace.reasonCluster)}
                          </div>
                        </div>
                        <div className="rounded border bg-background/70 p-2">
                          <div className="font-medium text-foreground">
                            Stage overview
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {trace.stageEvents.map((event) => (
                              <Badge
                                key={`compact-${traceKey}-${event.stage}`}
                                variant="outline"
                                className={`${getStageStatusClass(event.status)} text-[10px]`}
                              >
                                {formatStageLabel(event.stage)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2 text-xs">
                        <div className="rounded bg-background/70 p-2 text-muted-foreground">
                          <div>Detected {timeAgo(trace.detectedAt)}</div>
                          <div>Quality {trace.qualityScore ?? "n/a"}</div>
                          <div>
                            Cluster {getReasonClusterLabel(trace.reasonCluster)}
                          </div>
                        </div>
                        {trace.stageEvents.map((event) => (
                          <div
                            key={`compare-${traceKey}-${event.stage}`}
                            className="rounded border bg-background/70 p-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium">
                                {formatStageLabel(event.stage)}
                              </span>
                              <Badge
                                variant="outline"
                                className={getStageStatusClass(event.status)}
                              >
                                {event.status.replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <div className="mt-1 text-muted-foreground">
                              {event.reason ?? "No reason recorded."}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
        <Card className="overflow-visible">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Recent Alert Traces
            </CardTitle>
          </CardHeader>
          <CardContent>
            {traces.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {filteredEmpty
                  ? "The current filters returned an empty diagnostics window. Reset the filters or switch to pipeline gaps."
                  : pipelineHealth.status === "never_run"
                    ? "The pipeline has not run yet, so there are no traces to inspect."
                    : "No recent alert traces are available in the current diagnostics window."}
              </div>
            ) : (
              <ScrollArea className="h-180 pr-3">
                <div className="space-y-3">
                  {traces.map((trace) => {
                    const traceKey = getTraceKey(trace);
                    const isExpanded = expandedTraceKey === traceKey;
                    const isPinned = pinnedTraceKeys.includes(traceKey);

                    return (
                      <div
                        key={traceKey}
                        className="rounded-lg border bg-muted/30 p-3"
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTraceKey((current) =>
                                current === traceKey ? null : traceKey,
                              )
                            }
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono font-bold">
                                    {trace.ticker}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={getOutcomeBadgeClass(
                                      trace.finalOutcome,
                                    )}
                                  >
                                    {trace.finalOutcome.replace(/_/g, " ")}
                                  </Badge>
                                  {trace.qualityScore != null && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px]"
                                    >
                                      Q {trace.qualityScore}
                                    </Badge>
                                  )}
                                  {trace.reasonCluster ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px]"
                                    >
                                      {getReasonClusterLabel(
                                        trace.reasonCluster,
                                      )}
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Detected {timeAgo(trace.detectedAt)}
                                  {trace.primaryReason
                                    ? ` • ${trace.primaryReason}`
                                    : ""}
                                </div>
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {trace.stageEvents.map((event) => (
                                    <span
                                      key={`${traceKey}-${event.stage}`}
                                      className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${getStageStatusClass(event.status)}`}
                                    >
                                      {formatStageLabel(event.stage)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="shrink-0 text-muted-foreground">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </div>
                            </div>
                          </button>
                          <Button
                            variant={isPinned ? "secondary" : "outline"}
                            size="sm"
                            onClick={() => togglePinnedTrace(traceKey)}
                            disabled={!isPinned && pinnedTraceKeys.length >= 3}
                          >
                            {isPinned ? (
                              <PinOff className="h-3.5 w-3.5" />
                            ) : (
                              <Pin className="h-3.5 w-3.5" />
                            )}
                            {isPinned ? "Unpin" : "Pin"}
                          </Button>
                        </div>

                        {isExpanded ? (
                          <div className="mt-3 space-y-3">
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                              {trace.stageEvents.map((event) => (
                                <div
                                  key={`${traceKey}-${event.stage}-detail`}
                                  className="rounded border bg-background/70 p-2"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-medium">
                                      {formatStageLabel(event.stage)}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className={getStageStatusClass(
                                        event.status,
                                      )}
                                    >
                                      {event.status.replace(/_/g, " ")}
                                    </Badge>
                                  </div>
                                  <div className="mt-1 text-[11px] text-muted-foreground">
                                    {event.timestamp
                                      ? new Date(
                                          event.timestamp,
                                        ).toLocaleString()
                                      : "No timestamp"}
                                  </div>
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {event.reason ??
                                      "No blocking reason recorded."}
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                              <div className="rounded bg-background/70 p-2">
                                <div className="font-medium text-foreground">
                                  Whale Ref
                                </div>
                                <div>
                                  {trace.sourceRefs.primaryWhaleId != null
                                    ? `#${trace.sourceRefs.primaryWhaleId}`
                                    : "No explicit whale id"}
                                </div>
                              </div>
                              <div className="rounded bg-background/70 p-2">
                                <div className="font-medium text-foreground">
                                  Analysis Ref
                                </div>
                                <div>
                                  {trace.sourceRefs.sourceAnalysisId != null
                                    ? `#${trace.sourceRefs.sourceAnalysisId}`
                                    : "No analysis row"}
                                </div>
                              </div>
                              <div className="rounded bg-background/70 p-2">
                                <div className="font-medium text-foreground">
                                  Trade Ref
                                </div>
                                <div>
                                  {trace.sourceRefs.tradeId != null
                                    ? `#${trace.sourceRefs.tradeId}`
                                    : "No trade opened"}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {diagnosticsQuery.hasNextPage ? (
                  <div className="mt-4 border-t pt-4">
                    <div className="flex justify-center">
                      <Button
                        variant="outline"
                        onClick={() => diagnosticsQuery.fetchNextPage()}
                        disabled={diagnosticsQuery.isFetchingNextPage}
                      >
                        {diagnosticsQuery.isFetchingNextPage
                          ? "Loading..."
                          : "Load More Alerts"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Failure Clusters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {failureClusters.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No missed-alert clusters in the current diagnostics window.
                </p>
              ) : (
                failureClusters.slice(0, 4).map((cluster) => (
                  <button
                    key={cluster.cluster}
                    type="button"
                    onClick={() =>
                      cluster.cluster !== "unclassified"
                        ? applyReasonClusterFilter(cluster.cluster)
                        : updateDiagnosticsSearch({
                            outcome: "rejected",
                            reasonCluster: null,
                          })
                    }
                    className="w-full rounded bg-muted/50 p-2 text-left transition-colors hover:bg-muted"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm">{cluster.label}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {cluster.count}
                        </Badge>
                        <span className="text-[11px] text-primary">Apply</span>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Drop-Off Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.entries(overview.summary.dropOffByStage).map(
                ([stage, count]) => (
                  <div
                    key={stage}
                    className="flex items-center justify-between rounded bg-muted/50 p-2"
                  >
                    <span className="text-muted-foreground">
                      {formatStageLabel(
                        stage as AlertDecisionTrace["stageEvents"][number]["stage"],
                      )}
                    </span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ),
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Top Reasons</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {overview.summary.topReasons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No rejection or pipeline-gap reasons in the current window.
                  </p>
                ) : (
                  overview.summary.topReasons.map((item) => (
                    <button
                      key={item.reason}
                      type="button"
                      onClick={() => applyTopReasonFilter(item.reason)}
                      className="w-full rounded bg-muted/50 p-2 text-left transition-colors hover:bg-muted"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm">{item.reason}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {item.count}
                          </Badge>
                          <span className="text-[11px] text-primary">
                            Filter
                          </span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {diagnosticsQuery.isFetching ? (
            <div className="text-xs text-muted-foreground">
              Refreshing diagnostics window...
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Trade Detail (Educational Breakdown)
// ============================================================

function TradeDetail({
  tradeId,
  onBack,
}: {
  tradeId: number;
  onBack: () => void;
}) {
  const { data, isLoading } = usePortfolioTrade(tradeId);

  // Fetch deep-dive analysis for chart overlays (S/R levels, patterns)
  const ticker = data?.trade?.ticker;
  const { data: deepDiveData } = useDeepDive(ticker);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const trade = data?.trade;
  if (!trade) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Trade not found.</p>
        <button onClick={onBack} className="text-sm text-blue-400 mt-2">
          ← Back to portfolio
        </button>
      </div>
    );
  }

  const decision = trade.geminiReasoning as TradeDecision | null;
  const deepDive = deepDiveData?.analyses?.[0]?.output as
    | DeepDiveAnalysis
    | undefined;
  const pnl = trade.pnl ?? 0;
  const pnlPct = trade.pnlPct ?? 0;
  const pnlColor =
    pnl > 0
      ? "text-emerald-400"
      : pnl < 0
        ? "text-red-400"
        : "text-muted-foreground";
  const isOpen = trade.status === "open";

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Back button + Header */}
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to portfolio
        </button>

        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold font-mono">{trade.ticker}</h2>
          <Badge variant="outline">{trade.strategyName}</Badge>
          <Badge
            variant={isOpen ? "default" : pnl >= 0 ? "default" : "destructive"}
            className={
              isOpen
                ? "border-blue-500/30 text-blue-400"
                : pnl >= 0
                  ? "border-emerald-500/30 text-emerald-400"
                  : ""
            }
          >
            {isOpen
              ? "Open"
              : `Closed · ${formatExitReason(trade.exitReason ?? "")}`}
          </Badge>
        </div>

        {/* Educational Summary — prominent placement for beginners */}
        {decision?.educational_summary && (
          <Card className="border-blue-500/20 bg-blue-500/5">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start gap-2">
                <HelpCircle className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-blue-400 mb-1">
                    What does this trade do? (Plain English)
                  </p>
                  <p className="text-sm text-foreground/90">
                    {decision.educational_summary}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Confidence Breakdown — shows how the AI scored each signal factor */}
        {data?.confidenceBreakdown && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <ConfidenceBreakdownPanel breakdown={data.confidenceBreakdown} />
            </CardContent>
          </Card>
        )}

        {/* Price Chart — stock price context with trade strike levels */}
        {ticker && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <TechnicalChart
                ticker={ticker}
                supportResistance={deepDive?.support_resistance}
                technicalPatterns={deepDive?.technical_patterns}
                technicalPatternsByTimeframe={deepDive?.timeframe_patterns}
              />
            </CardContent>
          </Card>
        )}

        {/* Trade Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="Entry Price"
            value={formatCurrency(Math.abs(trade.entryPrice))}
            icon={DollarSign}
          />
          <MetricCard
            label="Entry Date"
            value={new Date(trade.entryDate).toLocaleDateString()}
            icon={Clock}
          />
          {!isOpen && trade.exitPrice != null && (
            <MetricCard
              label="Exit Price"
              value={formatCurrency(Math.abs(trade.exitPrice))}
              icon={DollarSign}
            />
          )}
          {!isOpen && (
            <MetricCard
              label="P&L"
              value={`${pnl >= 0 ? "+" : ""}${formatCurrency(pnl)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)`}
              icon={pnl >= 0 ? TrendingUp : TrendingDown}
              valueColor={pnlColor}
            />
          )}
          <MetricCard
            label="Profit Target"
            value={`${trade.profitTargetPct?.toFixed(0) ?? "—"}%`}
            icon={Target}
          />
          <MetricCard
            label="Stop Loss"
            value={`${trade.stopLossPct?.toFixed(0) ?? "—"}%`}
            icon={ShieldAlert}
          />
          <MetricCard
            label="Time Limit"
            value={`${trade.timeExitDays ?? "—"} days`}
            icon={Clock}
          />
          {/* IV Regime — from confidence breakdown factors */}
          {data?.confidenceBreakdown?.factors &&
            (() => {
              const ivFactor = data.confidenceBreakdown.factors.find(
                (f) => f.name === "IV Regime",
              );
              if (!ivFactor) return null;
              const regime =
                ivFactor.value >= 0.7
                  ? "Elevated"
                  : ivFactor.value >= 0.4
                    ? "Normal"
                    : "Low";
              const color =
                ivFactor.value >= 0.7
                  ? "text-amber-400"
                  : ivFactor.value >= 0.4
                    ? "text-emerald-400"
                    : "text-blue-400";
              return (
                <MetricCard
                  label="IV Regime"
                  value={regime}
                  icon={Activity}
                  valueColor={color}
                />
              );
            })()}
          {/* Insider Alignment — from confidence breakdown factors */}
          {data?.confidenceBreakdown?.factors &&
            (() => {
              const insiderFactor = data.confidenceBreakdown.factors.find(
                (f) => f.name === "Insider Alignment",
              );
              if (!insiderFactor) return null;
              const alignment =
                insiderFactor.value >= 0.6
                  ? "Bullish"
                  : insiderFactor.value >= 0.4
                    ? "Neutral"
                    : "Bearish";
              const color =
                insiderFactor.value >= 0.6
                  ? "text-emerald-400"
                  : insiderFactor.value >= 0.4
                    ? "text-muted-foreground"
                    : "text-red-400";
              return (
                <MetricCard
                  label="Insider Alignment"
                  value={alignment}
                  icon={TrendingUp}
                  valueColor={color}
                />
              );
            })()}
        </div>

        {/* Strategy Legs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Strategy Legs
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">
                    Each &quot;leg&quot; is one part of the options trade. Buy =
                    paying premium, Sell = collecting premium. Call = profits
                    when price goes up, Put = profits when price goes down.
                  </p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {trade.legs.map((leg, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm p-2 rounded bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        leg.action === "buy"
                          ? "border-emerald-500/30 text-emerald-400"
                          : "border-red-500/30 text-red-400"
                      }
                    >
                      {leg.action.toUpperCase()}
                    </Badge>
                    <span className="font-mono">
                      {leg.type.toUpperCase()} ${leg.strike}
                    </span>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <span>exp {leg.expiry}</span>
                    <span className="ml-2 font-mono">
                      @ {formatCurrency(leg.premium)}
                    </span>
                    <span className="ml-2">×{leg.quantity}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Options & Market Context — from deep dive analysis */}
        {deepDive?.options_context && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <OptionsStatsPanel optionsContext={deepDive.options_context} />
            </CardContent>
          </Card>
        )}

        {/* Gemini Reasoning */}
        {decision && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                AI Decision Reasoning
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      This is the AI&apos;s full reasoning for why it decided to
                      enter this trade. Transparency is key — you should always
                      understand why a trade was made.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{decision.reasoning}</p>

              {decision.risk_notes.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Risk Notes
                    </p>
                    <ul className="space-y-1">
                      {decision.risk_notes.map((note, i) => (
                        <li
                          key={i}
                          className="text-xs text-muted-foreground flex items-start gap-1"
                        >
                          <ShieldAlert className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" />
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              <Separator />
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Position size:{" "}
                  <span className="font-mono text-foreground">
                    {formatCurrency(decision.position_size_dollars)}
                  </span>
                </span>
                <span>
                  Strategy:{" "}
                  <span className="text-foreground">
                    {decision.adjusted_entry.strategy_name}
                  </span>
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Source Signals — trace trade back to whale alert & analysis */}
        {(data?.sourceWhale || data?.sourceAnalysis) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Source Signals
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      Every trade originates from a detected whale alert that
                      was analyzed by the AI pipeline. This shows the original
                      signals that led to this trade.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.sourceWhale && (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-400" />
                    <span className="text-sm font-medium">
                      Whale Alert #{data.sourceWhale.id}
                    </span>
                    <Badge
                      variant={
                        data.sourceWhale.sentiment === "bullish"
                          ? "default"
                          : "destructive"
                      }
                      className="text-xs"
                    >
                      {data.sourceWhale.sentiment}
                    </Badge>
                    {data.sourceWhale.qualityScore != null && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        Quality: {data.sourceWhale.qualityScore}/100
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Strike</span>
                      <p className="font-mono">
                        ${data.sourceWhale.strike?.toFixed(0) ?? "—"}{" "}
                        {data.sourceWhale.callPut === "C" ? "Call" : "Put"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Expiry</span>
                      <p className="font-mono">
                        {data.sourceWhale.expiry ?? "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Premium</span>
                      <p className="font-mono">
                        {data.sourceWhale.premium != null
                          ? formatCurrency(data.sourceWhale.premium)
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Vol / OI</span>
                      <p className="font-mono">
                        {data.sourceWhale.volume?.toLocaleString() ?? "—"} /{" "}
                        {data.sourceWhale.openInterest?.toLocaleString() ?? "—"}
                      </p>
                    </div>
                  </div>
                  {data.sourceWhale.detectedAt && (
                    <p className="text-xs text-muted-foreground">
                      Detected:{" "}
                      {new Date(data.sourceWhale.detectedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {data.sourceAnalysis && (
                <div className="rounded-md border p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-purple-400" />
                    <span className="text-sm font-medium">
                      AI Analysis #{data.sourceAnalysis.id}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {data.sourceAnalysis.type?.replace(/_/g, " ")}
                    </Badge>
                    {data.sourceAnalysis.confidence != null && (
                      <span className="text-xs text-muted-foreground ml-auto font-mono">
                        {(data.sourceAnalysis.confidence * 100).toFixed(0)}%
                        confidence
                      </span>
                    )}
                  </div>
                  {data.sourceAnalysis.createdAt && (
                    <p className="text-xs text-muted-foreground">
                      Generated:{" "}
                      {new Date(data.sourceAnalysis.createdAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Attribution — did this trade capture a whale opportunity? */}
        {data?.sourceWhale && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Opportunity Attribution
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      Whether this trade successfully captured a whale-driven
                      opportunity. Shows the original whale alert quality and
                      how the trade performed relative to expectations.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AttributionCard
                sentiment={data.sourceWhale.sentiment ?? "neutral"}
                qualityScore={data.sourceWhale.qualityScore}
                premium={data.sourceWhale.premium}
                pnl={pnl}
                pnlPct={pnlPct}
                isOpen={isOpen}
              />
            </CardContent>
          </Card>
        )}

        {/* Postmortem — avoidable loss classification for closed losing trades */}
        {!isOpen && pnl < 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                Postmortem Analysis
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="text-xs">
                      Classification of whether this loss was avoidable based on
                      pre-trade signals that were available at entry time.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PostmortemCard tradeId={trade.id} />
            </CardContent>
          </Card>
        )}

        {/* Lifecycle Timeline — chronological journey of the trade */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              Trade Lifecycle
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">
                    The full journey of this trade — from the original whale
                    alert detection, through AI analysis, to entry and (if
                    closed) exit.
                  </p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TradeTimeline
              whaleDetectedAt={data?.sourceWhale?.detectedAt ?? null}
              analysisCreatedAt={data?.sourceAnalysis?.createdAt ?? null}
              entryDate={trade.entryDate}
              exitDate={trade.exitDate ?? null}
              exitReason={trade.exitReason ?? null}
              isOpen={isOpen}
            />
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}

function getTraceKey(trace: AlertDecisionTrace): string {
  return trace.alertId != null
    ? `alert-${trace.alertId}`
    : `${trace.ticker}-${trace.detectedAt}`;
}

function formatStageLabel(
  stage: AlertDecisionTrace["stageEvents"][number]["stage"],
): string {
  const labels: Record<string, string> = {
    detection: "Detection",
    analysis: "Analysis",
    evaluation: "Evaluation",
    validation: "Validation",
    entry: "Entry",
    trade_execution: "Trade Execution",
  };

  return labels[stage] ?? stage;
}

function getOutcomeBadgeClass(outcome: AlertDiagnosticsOutcome): string {
  if (outcome === "entered") {
    return "border-emerald-500/30 text-emerald-400";
  }
  if (outcome === "rejected") {
    return "border-red-500/30 text-red-400";
  }
  return "border-amber-500/30 text-amber-400";
}

function getStageStatusClass(
  status: AlertDecisionTrace["stageEvents"][number]["status"],
): string {
  const classes: Record<string, string> = {
    completed: "border-blue-500/30 text-blue-400",
    passed: "border-emerald-500/30 text-emerald-400",
    blocked: "border-red-500/30 text-red-400",
    missing: "border-amber-500/30 text-amber-400",
    not_applicable: "border-muted text-muted-foreground",
  };

  return classes[status] ?? "border-muted text-muted-foreground";
}

function formatDiagnosticsOutcomeLabel(
  outcome: AlertDiagnosticsOutcome,
): string {
  if (outcome === "not_evaluated") {
    return "Not evaluated";
  }

  return outcome.charAt(0).toUpperCase() + outcome.slice(1);
}

function formatMissReasonLabel(reason: string | null | undefined): string {
  const labels: Record<string, string> = {
    confidence_too_low: "Entry confidence below threshold",
    quality_too_low: "Whale quality below minimum",
    position_size_limit: "Position sizing or balance limit",
    entry_filter_rejected: "Entry filter rejected",
    outside_trade_window: "Outside trade window",
    "0dte_rejected": "0DTE or near-expiry rejected",
    portfolio_concentration: "Portfolio concentration limit",
    pipeline_not_run: "Pipeline did not run",
    missing_market_data: "Missing market data",
    analysis_not_completed: "Analysis not completed",
  };

  return labels[reason ?? ""] ?? "Not classified";
}

function inferReasonClusterFromReasonText(
  reason: string | null | undefined,
): AlertDiagnosticsReasonCluster | null {
  const normalized = reason?.toLowerCase() ?? "";

  if (
    normalized.includes("pipeline") ||
    normalized.includes("analysis not completed") ||
    normalized.includes("did not run")
  ) {
    return "pipeline_gap";
  }

  if (normalized.includes("market data")) {
    return "missing_market_data";
  }

  if (
    normalized.includes("0dte") ||
    normalized.includes("same-day") ||
    normalized.includes("theta risk") ||
    normalized.includes("outside trade window")
  ) {
    return "same_day_blocked";
  }

  if (normalized.includes("concentration")) {
    return "portfolio_concentration";
  }

  if (normalized.includes("confidence")) {
    return "confidence_threshold";
  }

  return null;
}

// ============================================================
// Attribution Section (Missed Opportunities)
// ============================================================

function AttributionSection() {
  const [data, setData] = useState<AttributionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portfolio?view=attribution")
      .then((r) => r.json())
      .then((d) => {
        setData(d.attribution);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-muted" />;
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Target className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            Attribution data will appear once there are whale alerts and trades
            to analyze.
          </p>
        </CardContent>
      </Card>
    );
  }

  const funnelDetected = Math.max(data.diagnostics.funnel.detected, 1);
  const funnelStages = [
    { label: "Detected", count: data.diagnostics.funnel.detected },
    { label: "Quality Passed", count: data.diagnostics.funnel.qualityPassed },
    { label: "Evaluated", count: data.diagnostics.funnel.evaluated },
    { label: "LLM Accepted", count: data.diagnostics.funnel.llmAccepted },
    { label: "Entered", count: data.diagnostics.funnel.entered },
  ];
  const dropOffEntries = [
    { label: "Scoring", count: data.diagnostics.funnel.droppedByStage.scoring },
    {
      label: "Validation",
      count: data.diagnostics.funnel.droppedByStage.validation,
    },
    {
      label: "Risk Check",
      count: data.diagnostics.funnel.droppedByStage.riskCheck,
    },
    {
      label: "Entry Decision",
      count: data.diagnostics.funnel.droppedByStage.entryDecision,
    },
    {
      label: "Trade Open",
      count: data.diagnostics.funnel.droppedByStage.tradeOpen,
    },
    {
      label: "Pipeline / Analysis",
      count: data.diagnostics.funnel.droppedByStage.pipeline,
    },
  ];
  const maxDropCount = Math.max(
    1,
    ...dropOffEntries.map((entry) => entry.count),
  );
  const dominantDrop = [...dropOffEntries].sort(
    (left, right) => right.count - left.count,
  )[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        <StatCard
          title="Capture Rate"
          value={`${data.captureRate?.toFixed(1) ?? 0}%`}
          icon={Target}
          description={`${data.capturedCount ?? 0} of ${data.totalCandidates ?? 0} alerts`}
          tooltip="Percentage of whale alerts that resulted in a trade. Higher is better — it means the algorithm is capturing opportunities."
          trend={data.captureRate > 50 ? 1 : data.captureRate > 20 ? 0 : -1}
        />
        <StatCard
          title="Captured"
          value={data.capturedCount?.toString() ?? "0"}
          icon={TrendingUp}
          description="Whale alerts traded"
          tooltip="Number of whale alerts that the algorithm successfully traded on."
          trend={1}
        />
        <StatCard
          title="Missed"
          value={data.missedCount?.toString() ?? "0"}
          icon={TrendingDown}
          description="Whale alerts not traded"
          tooltip="Number of whale alerts that were not traded. Some may have been intentionally skipped due to low quality scores."
          trend={-1}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-medium">
                Decision Funnel
              </CardTitle>
              <Link
                href={getDiagnosticsHrefForPipelineGaps()}
                className="text-xs text-primary hover:underline"
              >
                Open pipeline gaps →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">
                    Dominant drop-off
                  </div>
                  <div className="text-sm font-medium">
                    {dominantDrop.count > 0
                      ? `${dominantDrop.label} (${dominantDrop.count})`
                      : "No dominant drop-off in current window"}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>
                    {data.captureRate?.toFixed(1) ?? "0.0"}% capture rate
                  </div>
                  <div>
                    {data.diagnostics.funnel.entered} alerts reached entry
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {funnelStages.map((stage, index) => {
                const previousCount =
                  index === 0 ? stage.count : funnelStages[index - 1].count;
                const percentOfDetected = Math.round(
                  (stage.count / funnelDetected) * 100,
                );
                const retainedFromPrevious =
                  index === 0
                    ? 100
                    : previousCount > 0
                      ? Math.round((stage.count / previousCount) * 100)
                      : 0;
                const barWidth =
                  stage.count > 0 ? Math.max(percentOfDetected, 6) : 0;

                return (
                  <div
                    key={stage.label}
                    className="rounded-lg border bg-background/60 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{stage.label}</span>
                      <span className="font-semibold">{stage.count}</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{percentOfDetected}% of detected</span>
                      <span>
                        {retainedFromPrevious}% retained from prior stage
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 space-y-2">
              {dropOffEntries.map((entry) => {
                const barWidth =
                  entry.count > 0
                    ? Math.max(
                        Math.round((entry.count / maxDropCount) * 100),
                        8,
                      )
                    : 0;

                return (
                  <div key={entry.label} className="rounded bg-muted/40 p-2">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">
                        {entry.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span>{entry.count}</span>
                        {entry.label === "Pipeline / Analysis" &&
                        entry.count > 0 ? (
                          <Link
                            href={getDiagnosticsHrefForPipelineGaps()}
                            className="text-primary hover:underline"
                          >
                            Inspect
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-background">
                      <div
                        className="h-1.5 rounded-full bg-amber-400"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-medium">
                Recent Decision Traces
              </CardTitle>
              <Link
                href="/portfolio?tab=diagnostics"
                className="text-xs text-primary hover:underline"
              >
                Open all traces →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.diagnostics.recentDecisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recent evaluation traces yet.
                </p>
              ) : (
                data.diagnostics.recentDecisions.map((trace, index) => (
                  <div
                    key={`${trace.ticker}-${trace.timestamp ?? index}`}
                    className="rounded bg-muted/50 p-2 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">
                            {trace.ticker}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase tracking-wide"
                          >
                            {trace.outcome}
                          </Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {trace.stage}
                          {trace.timestamp
                            ? ` • ${timeAgo(trace.timestamp)}`
                            : ""}
                        </div>
                        {trace.reason ? (
                          <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                            {trace.reason}
                          </div>
                        ) : null}
                      </div>
                      <Link
                        href={getDiagnosticsHrefForDecisionTrace(trace)}
                        className="shrink-0 text-xs text-primary hover:underline"
                      >
                        Open trace →
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-medium">
              Alert to Decision Correlation
            </CardTitle>
            <Link
              href="/portfolio?tab=diagnostics"
              className="text-xs text-primary hover:underline"
            >
              Open diagnostics →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.diagnostics.correlations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No high-priority whale alerts available for correlation yet.
              </p>
            ) : (
              data.diagnostics.correlations.map((correlation, index) => (
                <div
                  key={`${correlation.ticker}-${correlation.detectedAt}-${index}`}
                  className="rounded bg-muted/50 p-3 text-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">
                        {correlation.ticker}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        Q {correlation.qualityScore ?? "?"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(correlation.detectedAt)}
                      </span>
                      <Link
                        href={getDiagnosticsHrefForCorrelation(correlation)}
                        className="text-xs text-primary hover:underline"
                      >
                        Open trace →
                      </Link>
                    </div>
                  </div>

                  <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <div>
                      <div className="font-medium text-foreground">
                        Evaluation
                      </div>
                      <div>
                        {correlation.evaluatedAt
                          ? `${correlation.shouldEnter ? "enter" : "reject"} • ${timeAgo(correlation.evaluatedAt)}`
                          : "not evaluated"}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium text-foreground">Gate</div>
                      <div>
                        {correlation.rejectionGate?.replace(/_/g, " ") ??
                          "none"}
                      </div>
                    </div>
                    <div>
                      <div className="font-medium text-foreground">Trade</div>
                      <div>
                        {correlation.tradeId != null
                          ? `#${correlation.tradeId} • ${correlation.tradeStatus}`
                          : "no trade opened"}
                      </div>
                    </div>
                  </div>

                  {correlation.rejectionReason ? (
                    <div className="mt-2 text-xs text-muted-foreground line-clamp-2">
                      {correlation.rejectionReason}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {data.missed?.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-medium">
                Missed High-Quality Opportunities
              </CardTitle>
              <Link
                href="/portfolio?tab=diagnostics&outcome=rejected"
                className="text-xs text-primary hover:underline"
              >
                Open missed alerts →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.missed.map((m: AttributionMissedOpportunity, i: number) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-3 text-sm p-2 rounded bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold">{m.ticker}</span>
                      <Badge variant="outline" className="text-xs">
                        {m.sentiment}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Quality: {m.qualityScore ?? "?"}/100
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatMissReasonLabel(m.missReason)}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {timeAgo(m.detectedAt)}
                    </div>
                  </div>
                  <div className="shrink-0 pt-0.5">
                    <Link
                      href={getDiagnosticsHrefForMissedOpportunity(m)}
                      className="text-xs text-primary hover:underline"
                    >
                      Open trace →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Postmortem Section (Bad Trade Analysis)
// ============================================================

function PostmortemSection() {
  const [data, setData] = useState<PostmortemResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portfolio?view=postmortem")
      .then((r) => r.json())
      .then((d) => {
        setData(d.postmortem);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-muted" />;
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            Postmortem data will appear once there are closed losing trades to
            analyze.
          </p>
        </CardContent>
      </Card>
    );
  }

  const avoidableResults =
    data.results?.filter((r: PostmortemResult) => r.isAvoidable) ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <StatCard
          title="Avoidable Losses"
          value={data.avoidableCount?.toString() ?? "0"}
          icon={ShieldAlert}
          description="Losses that could have been prevented"
          tooltip="Number of losing trades that were likely avoidable based on pre-trade signals."
          trend={-1}
        />
        <StatCard
          title="Unavoidable Losses"
          value={data.unavoidableCount?.toString() ?? "0"}
          icon={Activity}
          description="Market noise — no fault"
          tooltip="Number of losing trades that appear unavoidable given the information available at entry time."
          trend={0}
        />
      </div>

      {avoidableResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Avoidable Losses by Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {avoidableResults.map((r: PostmortemResult, i: number) => (
                <div key={i} className="p-3 rounded bg-muted/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">
                        {r.ticker ?? `Trade #${r.tradeId}`}
                      </span>
                      <Badge variant="destructive" className="text-xs">
                        {r.avoidableCategory?.replace(/_/g, " ") ?? "unknown"}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Risk: {r.riskScore}/100
                    </span>
                  </div>
                  {r.preTradeWarnings?.length > 0 && (
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {r.preTradeWarnings.map((w: string, j: number) => (
                        <li key={j} className="flex items-start gap-1">
                          <ShieldAlert className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Benchmark Section (Algorithm Comparison)
// ============================================================

function BenchmarkSection() {
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portfolio?view=benchmark")
      .then((r) => r.json())
      .then((d) => {
        setData(d.benchmark);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const handleExport = () => {
    if (!data?.report) return;
    const blob = new Blob([data.report], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `benchmark-report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-muted" />;
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Trophy className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">
            Benchmark data will appear once there are trades to compare against
            baseline strategies.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Export button */}
      <div className="flex justify-end">
        <button
          onClick={handleExport}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
        >
          <BarChart3 className="h-3 w-3" />
          Export Report
        </button>
      </div>
      {/* Current Algorithm vs Best Baseline */}
      <div className="grid gap-2 sm:grid-cols-3">
        <StatCard
          title="Win Rate vs Best"
          value={`${data.comparison?.currentVsBestBaseline?.winRateDiff >= 0 ? "+" : ""}${data.comparison?.currentVsBestBaseline?.winRateDiff?.toFixed(1) ?? 0}%`}
          icon={Target}
          description="Current algorithm vs best baseline"
          tooltip="Difference in win rate between the current algorithm and the best-performing baseline strategy."
          trend={
            data.comparison?.currentVsBestBaseline?.winRateDiff >= 0 ? 1 : -1
          }
        />
        <StatCard
          title="P&L vs Best"
          value={`${data.comparison?.currentVsBestBaseline?.pnlDiff >= 0 ? "+" : ""}${data.comparison?.currentVsBestBaseline?.pnlDiff?.toFixed(2) ?? 0}%`}
          icon={
            data.comparison?.currentVsBestBaseline?.pnlDiff >= 0
              ? TrendingUp
              : TrendingDown
          }
          description="Current algorithm vs best baseline"
          tooltip="Difference in total P&L between the current algorithm and the best-performing baseline strategy."
          trend={data.comparison?.currentVsBestBaseline?.pnlDiff >= 0 ? 1 : -1}
        />
        <StatCard
          title="Sharpe vs Best"
          value={`${data.comparison?.currentVsBestBaseline?.sharpeDiff >= 0 ? "+" : ""}${data.comparison?.currentVsBestBaseline?.sharpeDiff?.toFixed(2) ?? 0}`}
          icon={BarChart3}
          description="Current algorithm vs best baseline"
          tooltip="Difference in Sharpe ratio between the current algorithm and the best-performing baseline strategy."
          trend={
            data.comparison?.currentVsBestBaseline?.sharpeDiff >= 0 ? 1 : -1
          }
        />
      </div>

      {/* Baseline Comparison Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Baseline Strategy Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Current Algorithm */}
            <div className="p-3 rounded bg-blue-500/10 border border-blue-500/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-400">
                  {data.current?.name ?? "Current Algorithm"}
                </span>
                <Badge
                  variant="outline"
                  className="border-blue-500/30 text-blue-400"
                >
                  Your Strategy
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Win Rate</span>
                  <p className="font-mono">
                    {data.current?.metrics?.winRate?.toFixed(1) ?? 0}%
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total P&L</span>
                  <p className="font-mono">
                    {data.current?.metrics?.totalPnlPct?.toFixed(2) ?? 0}%
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Sharpe</span>
                  <p className="font-mono">
                    {data.current?.metrics?.sharpeRatio?.toFixed(2) ?? 0}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Max DD</span>
                  <p className="font-mono">
                    {data.current?.metrics?.maxDrawdownPct?.toFixed(2) ?? 0}%
                  </p>
                </div>
              </div>
            </div>

            {/* Baselines */}
            {data.baselines?.map((b: BenchmarkBaseline, i: number) => (
              <div key={i} className="p-3 rounded bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{b.name}</span>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">{b.description}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Win Rate</span>
                    <p className="font-mono">
                      {b.metrics?.winRate?.toFixed(1) ?? 0}%
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total P&L</span>
                    <p className="font-mono">
                      {b.metrics?.totalPnlPct?.toFixed(2) ?? 0}%
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sharpe</span>
                    <p className="font-mono">
                      {b.metrics?.sharpeRatio?.toFixed(2) ?? 0}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Max DD</span>
                    <p className="font-mono">
                      {b.metrics?.maxDrawdownPct?.toFixed(2) ?? 0}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// PostmortemCard (inline classification for trade detail)
// ============================================================

function PostmortemCard({ tradeId }: { tradeId: number }) {
  const [result, setResult] = useState<PostmortemResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portfolio?view=postmortem")
      .then((r) => r.json())
      .then((d) => {
        const postmortem = d.postmortem;
        const match = postmortem?.results?.find(
          (r: PostmortemResult) => r.tradeId === tradeId,
        );
        setResult(match ?? null);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [tradeId]);

  if (isLoading) {
    return <div className="h-16 animate-pulse rounded bg-muted" />;
  }

  if (!result) {
    return (
      <p className="text-xs text-muted-foreground">
        Postmortem data not available for this trade.
      </p>
    );
  }

  if (!result.isAvoidable) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Activity className="h-4 w-4 text-blue-400" />
        <span className="text-blue-400 font-medium">Unavoidable Loss</span>
        <span className="text-muted-foreground text-xs">
          — This loss appears to be market noise given the pre-trade signals.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-red-400" />
        <span className="text-red-400 font-medium text-sm">Avoidable Loss</span>
        <Badge variant="destructive" className="text-xs">
          {result.avoidableCategory?.replace(/_/g, " ") ?? "unknown"}
        </Badge>
        <span className="text-xs text-muted-foreground ml-auto">
          Risk score: {result.riskScore}/100
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{result.explanation}</p>
      {result.preTradeWarnings?.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1">
          {result.preTradeWarnings.map((w: string, i: number) => (
            <li key={i} className="flex items-start gap-1">
              <ShieldAlert className="h-3 w-3 text-yellow-400 mt-0.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ============================================================
// AttributionCard (inline attribution for trade detail)
// ============================================================

function AttributionCard({
  sentiment,
  qualityScore,
  premium,
  pnl,
  pnlPct,
  isOpen,
}: {
  sentiment: string;
  qualityScore: number | null;
  premium: number | null;
  pnl: number;
  pnlPct: number;
  isOpen: boolean;
}) {
  if (isOpen) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Target className="h-4 w-4 text-blue-400" />
        <span className="text-blue-400 font-medium">Open Position</span>
        <span className="text-muted-foreground text-xs">
          — Attribution will be calculated when this trade closes.
        </span>
      </div>
    );
  }

  const isCaptured = pnl >= 0;
  const qualityLabel =
    qualityScore != null
      ? qualityScore >= 80
        ? "High"
        : qualityScore >= 60
          ? "Medium"
          : "Low"
      : "Unknown";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {isCaptured ? (
          <>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <span className="text-emerald-400 font-medium text-sm">
              Captured Opportunity
            </span>
          </>
        ) : (
          <>
            <TrendingDown className="h-4 w-4 text-red-400" />
            <span className="text-red-400 font-medium text-sm">
              Opportunity Lost
            </span>
          </>
        )}
        <Badge
          variant="outline"
          className={
            sentiment === "bullish"
              ? "border-emerald-500/30 text-emerald-400"
              : "border-red-500/30 text-red-400"
          }
        >
          {sentiment}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Whale Quality</span>
          <p className="font-mono">
            {qualityScore != null
              ? `${qualityScore}/100 (${qualityLabel})`
              : "—"}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Premium</span>
          <p className="font-mono">
            {premium != null ? formatCurrency(premium) : "—"}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Result</span>
          <p
            className={`font-mono ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {pnl >= 0 ? "+" : ""}
            {pnlPct.toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Small helpers
// ============================================================

function MetricCard({
  label,
  value,
  icon: Icon,
  valueColor,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  valueColor?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Icon className="h-3 w-3" />
          {label}
        </div>
        <p className={`text-sm font-bold font-mono ${valueColor ?? ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function formatExitReason(reason: string): string {
  const map: Record<string, string> = {
    profit_target: "Profit Target",
    stop_loss: "Stop Loss",
    time_exit: "Time Limit",
    expiry: "Expired",
    manual: "Manual",
    insufficient_data: "No Data",
  };
  return map[reason] ?? reason;
}

function TradeTimeline({
  whaleDetectedAt,
  analysisCreatedAt,
  entryDate,
  exitDate,
  exitReason,
  isOpen,
}: {
  whaleDetectedAt: string | null;
  analysisCreatedAt: string | null;
  entryDate: string;
  exitDate: string | null;
  exitReason: string | null;
  isOpen: boolean;
}) {
  const events: { label: string; time: string; icon: string; color: string }[] =
    [];

  if (whaleDetectedAt) {
    events.push({
      label: "Whale Alert Detected",
      time: new Date(whaleDetectedAt).toLocaleString(),
      icon: "🐋",
      color: "border-blue-500",
    });
  }
  if (analysisCreatedAt) {
    events.push({
      label: "AI Analysis Generated",
      time: new Date(analysisCreatedAt).toLocaleString(),
      icon: "🤖",
      color: "border-purple-500",
    });
  }
  events.push({
    label: "Trade Entered",
    time: new Date(entryDate).toLocaleString(),
    icon: "📈",
    color: "border-emerald-500",
  });
  if (!isOpen && exitDate) {
    events.push({
      label: `Trade Closed — ${formatExitReason(exitReason ?? "")}`,
      time: new Date(exitDate).toLocaleString(),
      icon: "🏁",
      color:
        exitReason === "profit_target"
          ? "border-emerald-500"
          : "border-red-500",
    });
  } else if (isOpen) {
    events.push({
      label: "Position Open",
      time: "Now",
      icon: "⏳",
      color: "border-amber-500",
    });
  }

  return (
    <div className="relative space-y-0">
      {events.map((event, i) => (
        <div key={i} className="flex gap-3 pb-4 last:pb-0">
          {/* Vertical line + dot */}
          <div className="flex flex-col items-center">
            <div
              className={`w-6 h-6 rounded-full border-2 ${event.color} bg-background flex items-center justify-center text-xs`}
            >
              {event.icon}
            </div>
            {i < events.length - 1 && (
              <div className="w-px flex-1 bg-border min-h-4" />
            )}
          </div>
          {/* Content */}
          <div className="pt-0.5">
            <p className="text-sm font-medium">{event.label}</p>
            <p className="text-xs text-muted-foreground">{event.time}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
