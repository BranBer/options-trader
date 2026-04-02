import { DEFAULT_SIM_PORTFOLIO_BALANCE } from "@/lib/constants/portfolio";
import type { WhaleAlertRow } from "@/types/whale";
import type {
  LearningAction,
  LearningAnalysisState,
  LearningLineageQuality,
  LearningRecord,
  LearningRecordSummary,
} from "@/types/learning";
import {
  LEARNING_RECORD_SCHEMA_VERSION,
  learningRecordSchema,
} from "@/types/learning";
import { tradeRecommendationSchema } from "@/types/analysis";

export interface LearningExportManifest {
  generatedAt: string;
  schemaVersion: typeof LEARNING_RECORD_SCHEMA_VERSION;
  rowCount: number;
  filters: {
    lineageQuality: LearningLineageQuality | null;
    limit: number;
  };
  summary: LearningRecordSummary;
}

export interface LearningRecordEvaluation {
  id: number | null;
  ticker: string;
  shouldEnter: boolean;
  reasoning: string | null;
  strategyName: string | null;
  legs: string | null;
  positionSize: number | null;
  netPremium: number | null;
  confidence: number | null;
  whaleQualityScore: number | null;
  portfolioBalance: number | null;
  sourceAnalysisId: number | null;
  rejectionGate: string | null;
  rejectionReason: string | null;
  createdAt: string | null;
  primaryWhaleId?: number | null;
  whaleIds?: number[];
}

export interface LearningRecordTrade {
  id: number;
  ticker: string;
  strike?: number;
  expiry?: string;
  entryPrice: number;
  entryDate: string;
  exitPrice: number | null;
  exitDate: string | null;
  pnl: number | null;
  pnlPct: number | null;
  status: "open" | "closed" | "expired";
  exitReason: string | null;
  direction: string;
  sourceWhaleId?: number | null;
  sourceAnalysisId?: number | null;
}

export interface LearningRecordAnalysis {
  id: number;
  type: string | null;
  inputRefs: Record<string, unknown>;
  output: Record<string, unknown> | null;
  confidence: number | null;
  confidenceBreakdown: Record<string, unknown> | null;
  createdAt: string | null;
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseJsonObject(
  value: string | null | undefined,
): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function parseTradeDecisionLegs(
  value: string | null | undefined,
): LearningAction["legs"] {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundMetric(value: number) {
  return Number(value.toFixed(4));
}

function parseRecommendationAnalysis(
  analysis: LearningRecordAnalysis | null,
): Pick<
  LearningAnalysisState,
  | "recommendationDirection"
  | "recommendationConfidence"
  | "strategyName"
  | "riskRewardRatio"
  | "riskFactors"
> {
  if (!analysis?.output) {
    return {
      recommendationDirection: null,
      recommendationConfidence: null,
      strategyName: null,
      riskRewardRatio: null,
      riskFactors: [],
    };
  }

  const parsed = tradeRecommendationSchema.safeParse(analysis.output);
  if (!parsed.success) {
    return {
      recommendationDirection: null,
      recommendationConfidence: analysis.confidence,
      strategyName: null,
      riskRewardRatio: null,
      riskFactors: [],
    };
  }

  return {
    recommendationDirection: parsed.data.direction,
    recommendationConfidence: parsed.data.confidence,
    strategyName: parsed.data.primary_strategy.name,
    riskRewardRatio: parsed.data.primary_strategy.risk_reward_ratio,
    riskFactors: parsed.data.risk_factors,
  };
}

function parseCompositeConfidence(
  analysis: LearningRecordAnalysis | null,
): number | null {
  const composite = analysis?.confidenceBreakdown?.composite;
  return typeof composite === "number"
    ? composite
    : (analysis?.confidence ?? null);
}

function deriveLineageQuality(args: {
  whale: WhaleAlertRow;
  evaluation: LearningRecordEvaluation | null;
  trade: LearningRecordTrade | null;
}): LearningLineageQuality {
  const { whale, evaluation, trade } = args;
  const explicitWhale =
    evaluation?.primaryWhaleId === whale.id ||
    evaluation?.whaleIds?.includes(whale.id) === true ||
    trade?.sourceWhaleId === whale.id;
  const explicitAnalysis =
    evaluation?.sourceAnalysisId != null || trade?.sourceAnalysisId != null;

  if (explicitWhale && explicitAnalysis) return "explicit";
  if (explicitWhale || explicitAnalysis) return "backfilled";
  if (evaluation || trade) return "inferred";
  return "incomplete";
}

function buildRecordId(whale: WhaleAlertRow): string {
  return whale.id != null
    ? `alert-${whale.id}`
    : `${whale.ticker}-${whale.detectedAt ?? "unknown"}`;
}

function findNearestEvaluation(
  whale: WhaleAlertRow,
  evaluations: LearningRecordEvaluation[],
): LearningRecordEvaluation | null {
  if (whale.id != null) {
    const exact = evaluations.find(
      (evaluation) =>
        evaluation.primaryWhaleId === whale.id ||
        evaluation.whaleIds?.includes(whale.id) === true,
    );
    if (exact) return exact;
  }

  const whaleTs = parseTimestamp(whale.detectedAt);
  const tickerMatches = evaluations.filter((evaluation) => {
    if (evaluation.ticker !== whale.ticker) return false;
    const evalTs = parseTimestamp(evaluation.createdAt);
    if (whaleTs == null || evalTs == null) return true;

    return (
      evalTs >= whaleTs - 5 * 60 * 1000 &&
      evalTs <= whaleTs + 24 * 60 * 60 * 1000
    );
  });

  if (tickerMatches.length === 0) return null;
  if (whaleTs == null) return tickerMatches[0];

  return tickerMatches.sort((left, right) => {
    const leftTs = parseTimestamp(left.createdAt) ?? whaleTs;
    const rightTs = parseTimestamp(right.createdAt) ?? whaleTs;
    return Math.abs(leftTs - whaleTs) - Math.abs(rightTs - whaleTs);
  })[0];
}

function findMatchedTrade(
  whale: WhaleAlertRow,
  trades: LearningRecordTrade[],
): LearningRecordTrade | null {
  if (whale.id != null) {
    const exact = trades.find((trade) => trade.sourceWhaleId === whale.id);
    if (exact) return exact;
  }

  return (
    trades.find(
      (trade) =>
        trade.ticker === whale.ticker &&
        (trade.strike == null ||
          trade.strike === whale.strike ||
          whale.strike == null) &&
        (trade.expiry == null ||
          trade.expiry === whale.expiry ||
          whale.expiry == null),
    ) ?? null
  );
}

function getOpenPositionsAtTimestamp(
  trades: LearningRecordTrade[],
  timestamp: string | null | undefined,
) {
  const decisionTs = parseTimestamp(timestamp);
  if (decisionTs == null) {
    return {
      openTrades: [] as LearningRecordTrade[],
      openTickers: [] as string[],
      counts: { bullish: 0, bearish: 0, neutral: 0 },
    };
  }

  const openTrades = trades.filter((trade) => {
    const entryTs = parseTimestamp(trade.entryDate);
    if (entryTs == null || entryTs > decisionTs) return false;

    const exitTs = parseTimestamp(trade.exitDate);
    return exitTs == null || exitTs > decisionTs;
  });

  const openTickers = [...new Set(openTrades.map((trade) => trade.ticker))];
  const counts = {
    bullish: openTrades.filter((trade) => trade.direction === "bullish").length,
    bearish: openTrades.filter((trade) => trade.direction === "bearish").length,
    neutral: openTrades.filter((trade) => trade.direction === "neutral").length,
  };

  return { openTrades, openTickers, counts };
}

function isProtectiveRejection(action: LearningAction) {
  const signal =
    `${action.rejectionGate ?? ""} ${action.rejectionReason ?? ""}`.toLowerCase();
  return /(capital|risk|drawdown|exposure|position|pdt|preservation)/.test(
    signal,
  );
}

function computeOpportunityCostPenalty(args: {
  state: LearningRecord["state"];
  action: LearningRecord["action"];
  outcome: LearningRecord["outcome"];
}) {
  const { state, action, outcome } = args;
  if (action.decision === "enter" || outcome.finalOutcome === "entered") {
    return 0;
  }

  const quality = clamp(
    (state.analysis.whaleQualityScore ?? state.alert.qualityScore ?? 0) / 100,
    0,
    1,
  );
  const confidence = clamp(
    Math.max(
      state.analysis.recommendationConfidence ?? 0,
      state.analysis.compositeConfidence ?? 0,
    ),
    0,
    1,
  );
  const signalStrength = Math.max(quality, confidence);
  if (signalStrength < 0.35) {
    return 0;
  }

  const base = action.decision === "reject" ? 0.04 : 0.02;
  let penalty =
    base + signalStrength * (action.decision === "reject" ? 0.22 : 0.16);
  if (isProtectiveRejection(action)) {
    penalty *= 0.35;
  }

  return roundMetric(clamp(penalty, 0, 0.3));
}

function computeCapitalPressurePenalty(args: {
  state: LearningRecord["state"];
  action: LearningRecord["action"];
}) {
  const { state, action } = args;
  if (action.decision !== "enter") {
    return 0;
  }

  const balance = state.portfolio.portfolioBalance;
  const positionSize = action.positionSizeDollars ?? 0;
  const utilization = balance > 0 ? positionSize / balance : 0;
  const lowBalancePenalty =
    balance < DEFAULT_SIM_PORTFOLIO_BALANCE
      ? ((DEFAULT_SIM_PORTFOLIO_BALANCE - balance) /
          DEFAULT_SIM_PORTFOLIO_BALANCE) *
        0.12
      : 0;
  const concentrationPenalty =
    utilization > 0.12 ? (utilization - 0.12) * 0.8 : 0;
  const crowdingPenalty =
    state.portfolio.openPositionsCount > 3
      ? (state.portfolio.openPositionsCount - 3) * 0.025
      : 0;

  return roundMetric(
    clamp(lowBalancePenalty + concentrationPenalty + crowdingPenalty, 0, 0.25),
  );
}

function computeLearningReward(args: {
  state: LearningRecord["state"];
  action: LearningRecord["action"];
  outcome: LearningRecord["outcome"];
}): LearningRecord["reward"] {
  const { state, action, outcome } = args;

  if (outcome.finalOutcome === "entered" && outcome.tradeStatus === "open") {
    return {
      status: "pending",
      primaryReward: null,
      realizedPnl: outcome.pnl,
      realizedPnlPct: outcome.pnlPct,
      drawdownPenalty: null,
      opportunityCostPenalty: null,
      notes: [
        "reward pending until the open position reaches a terminal outcome",
      ],
    };
  }

  if (outcome.finalOutcome === "entered" && outcome.pnlPct != null) {
    const normalizedReturn = clamp(outcome.pnlPct / 100, -1.5, 1.5);
    const drawdownPenalty =
      outcome.pnlPct < 0
        ? roundMetric(clamp((Math.abs(outcome.pnlPct) / 100) * 0.45, 0, 0.75))
        : 0;
    const capitalPressurePenalty = computeCapitalPressurePenalty({
      state,
      action,
    });

    return {
      status: "computed",
      primaryReward: roundMetric(
        clamp(
          normalizedReturn - drawdownPenalty - capitalPressurePenalty,
          -1.5,
          1.5,
        ),
      ),
      realizedPnl: outcome.pnl,
      realizedPnlPct: outcome.pnlPct,
      drawdownPenalty,
      opportunityCostPenalty: 0,
      notes: [
        "reward = normalized realized return - drawdown penalty - capital pressure penalty",
      ],
    };
  }

  const opportunityCostPenalty = computeOpportunityCostPenalty({
    state,
    action,
    outcome,
  });
  return {
    status: "computed",
    primaryReward: roundMetric(-opportunityCostPenalty),
    realizedPnl: null,
    realizedPnlPct: null,
    drawdownPenalty: null,
    opportunityCostPenalty,
    notes:
      opportunityCostPenalty > 0
        ? [
            "proxy reward because no terminal trade outcome exists for this alert",
          ]
        : [
            "neutral reward because no trade outcome and no strong missed-opportunity signal were observed",
          ],
  };
}

export function summarizeLearningRecords(
  records: LearningRecord[],
): LearningRecordSummary {
  const summary: LearningRecordSummary = {
    total: records.length,
    byDecision: {
      enter: 0,
      reject: 0,
      not_evaluated: 0,
    },
    byOutcome: {
      entered: 0,
      rejected: 0,
      not_evaluated: 0,
    },
    byLineageQuality: {
      explicit: 0,
      backfilled: 0,
      inferred: 0,
      incomplete: 0,
    },
    byRewardStatus: {
      pending: 0,
      computed: 0,
      not_applicable: 0,
    },
  };

  for (const record of records) {
    summary.byDecision[record.action.decision] += 1;
    summary.byOutcome[record.outcome.finalOutcome] += 1;
    summary.byLineageQuality[record.metadata.lineageQuality] += 1;
    summary.byRewardStatus[record.reward.status] += 1;
  }

  return summary;
}

export function buildLearningExportManifest(args: {
  records: LearningRecord[];
  summary: LearningRecordSummary;
  filters: {
    lineageQuality: LearningLineageQuality | null;
    limit: number;
  };
}): LearningExportManifest {
  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: LEARNING_RECORD_SCHEMA_VERSION,
    rowCount: args.records.length,
    filters: args.filters,
    summary: args.summary,
  };
}

export function serializeLearningRecordsToJsonl(args: {
  records: LearningRecord[];
  summary: LearningRecordSummary;
  filters: {
    lineageQuality: LearningLineageQuality | null;
    limit: number;
  };
}) {
  const manifest = buildLearningExportManifest(args);

  return [
    JSON.stringify({ type: "manifest", manifest }),
    ...args.records.map((record) =>
      JSON.stringify({ type: "learning_record", record }),
    ),
  ].join("\n");
}

export function serializeLearningRecordsToCsv(args: {
  records: LearningRecord[];
  summary: LearningRecordSummary;
  filters: {
    lineageQuality: LearningLineageQuality | null;
    limit: number;
  };
}) {
  const manifest = buildLearningExportManifest(args);
  const headers = [
    "exportGeneratedAt",
    "exportSchemaVersion",
    "exportRowCount",
    "exportLineageQualityFilter",
    "recordId",
    "lineageQuality",
    "decision",
    "finalOutcome",
    "rewardStatus",
    "primaryReward",
    "drawdownPenalty",
    "opportunityCostPenalty",
    "ticker",
    "detectedAt",
    "qualityScore",
    "recommendationConfidence",
    "compositeConfidence",
    "portfolioBalance",
    "openPositionsCount",
    "evaluationId",
    "tradeId",
    "tradeStatus",
    "pnl",
    "pnlPct",
    "rejectionGate",
    "rejectionReason",
    "riskFactors",
    "notes",
  ];

  const escapeCsv = (value: unknown) => {
    if (value == null) return "";
    const stringValue = Array.isArray(value)
      ? JSON.stringify(value)
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
    return /[",\n]/.test(stringValue)
      ? `"${stringValue.replaceAll('"', '""')}"`
      : stringValue;
  };

  const rows = args.records.map((record) => [
    manifest.generatedAt,
    manifest.schemaVersion,
    manifest.rowCount,
    manifest.filters.lineageQuality,
    record.metadata.recordId,
    record.metadata.lineageQuality,
    record.action.decision,
    record.outcome.finalOutcome,
    record.reward.status,
    record.reward.primaryReward,
    record.reward.drawdownPenalty,
    record.reward.opportunityCostPenalty,
    record.state.alert.ticker,
    record.state.alert.detectedAt,
    record.state.alert.qualityScore,
    record.state.analysis.recommendationConfidence,
    record.state.analysis.compositeConfidence,
    record.state.portfolio.portfolioBalance,
    record.state.portfolio.openPositionsCount,
    record.action.evaluationId,
    record.outcome.tradeId,
    record.outcome.tradeStatus,
    record.outcome.pnl,
    record.outcome.pnlPct,
    record.action.rejectionGate,
    record.action.rejectionReason,
    record.state.analysis.riskFactors,
    record.reward.notes,
  ]);

  return [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ].join("\n");
}

export function buildLearningRecords(args: {
  whales: WhaleAlertRow[];
  evaluations: LearningRecordEvaluation[];
  trades: LearningRecordTrade[];
  analyses: LearningRecordAnalysis[];
  startingBalance?: number | null;
}): LearningRecord[] {
  const {
    whales,
    evaluations,
    trades,
    analyses,
    startingBalance = DEFAULT_SIM_PORTFOLIO_BALANCE,
  } = args;
  const analysisMap = new Map<number, LearningRecordAnalysis>(
    analyses.map((analysis) => [analysis.id, analysis]),
  );

  return whales.map((whale) => {
    const evaluation = findNearestEvaluation(whale, evaluations);
    const trade = findMatchedTrade(whale, trades);
    const analysis =
      (evaluation?.sourceAnalysisId != null
        ? analysisMap.get(evaluation.sourceAnalysisId)
        : undefined) ??
      (trade?.sourceAnalysisId != null
        ? analysisMap.get(trade.sourceAnalysisId)
        : undefined) ??
      null;

    const recommendation = parseRecommendationAnalysis(analysis);
    const compositeConfidence = parseCompositeConfidence(analysis);
    const decisionTimestamp =
      trade?.entryDate ?? evaluation?.createdAt ?? whale.detectedAt;
    const { openTrades, openTickers, counts } = getOpenPositionsAtTimestamp(
      trades,
      decisionTimestamp,
    );

    const actionDecision = trade
      ? "enter"
      : evaluation
        ? evaluation.shouldEnter
          ? "enter"
          : "reject"
        : "not_evaluated";
    const finalOutcome = trade
      ? "entered"
      : evaluation
        ? "rejected"
        : "not_evaluated";
    const lineageQuality = deriveLineageQuality({ whale, evaluation, trade });
    const legs = parseTradeDecisionLegs(evaluation?.legs);

    const state: LearningRecord["state"] = {
      alert: {
        alertId: whale.id,
        ticker: whale.ticker,
        detectedAt:
          whale.detectedAt ?? whale.createdAt ?? new Date().toISOString(),
        callPut:
          whale.callPut === "C" || whale.callPut === "P" ? whale.callPut : null,
        strike: whale.strike,
        expiry: whale.expiry,
        premium: whale.premium,
        volume: whale.volume,
        openInterest: whale.openInterest,
        underlyingPrice: whale.underlyingPrice,
        sentiment: whale.sentiment,
        inferredSentiment: null,
        sentimentConfidence: null,
        intentHint: null,
        qualityScore: whale.qualityScore,
        delta: null,
        gamma: null,
        theta: null,
        vega: null,
        impliedVolatility: null,
        breakEvenPrice: null,
      },
      analysis: {
        sourceAnalysisId:
          evaluation?.sourceAnalysisId ?? trade?.sourceAnalysisId ?? null,
        recommendationDirection: recommendation.recommendationDirection,
        recommendationConfidence: recommendation.recommendationConfidence,
        compositeConfidence,
        whaleQualityScore:
          evaluation?.whaleQualityScore ?? whale.qualityScore ?? null,
        strategyName: evaluation?.strategyName ?? recommendation.strategyName,
        riskRewardRatio: recommendation.riskRewardRatio,
        riskFactors: recommendation.riskFactors,
        deepDiveRiskLevel:
          typeof analysis?.output?.risk_assessment === "object" &&
          analysis.output.risk_assessment &&
          "overall_risk" in analysis.output.risk_assessment
            ? String(
                (analysis.output.risk_assessment as Record<string, unknown>)
                  .overall_risk ?? "",
              ) || null
            : null,
        marketNarrative:
          typeof analysis?.output?.market_narrative === "string"
            ? analysis.output.market_narrative
            : null,
      },
      portfolio: {
        portfolioBalance:
          evaluation?.portfolioBalance ??
          startingBalance ??
          DEFAULT_SIM_PORTFOLIO_BALANCE,
        startingBalance: startingBalance ?? DEFAULT_SIM_PORTFOLIO_BALANCE,
        openPositionsCount: openTrades.length,
        openTickers,
        openDirectionCounts: counts,
      },
    };

    const action: LearningRecord["action"] = {
      decision: actionDecision,
      evaluationId: evaluation?.id ?? null,
      decisionTimestamp: evaluation?.createdAt ?? null,
      shouldEnter: evaluation?.shouldEnter ?? (trade ? true : null),
      reasoning: evaluation?.reasoning ?? null,
      rejectionGate: evaluation?.rejectionGate ?? null,
      rejectionReason: evaluation?.rejectionReason ?? null,
      positionSizeDollars: evaluation?.positionSize ?? null,
      netPremium: evaluation?.netPremium ?? (trade ? trade.entryPrice : null),
      strategyName: evaluation?.strategyName ?? recommendation.strategyName,
      legs,
    };

    const outcome: LearningRecord["outcome"] = {
      finalOutcome,
      tradeId: trade?.id ?? null,
      tradeStatus: trade?.status ?? null,
      pnl: trade?.pnl ?? null,
      pnlPct: trade?.pnlPct ?? null,
      exitReason:
        trade?.exitReason === null ||
        trade?.exitReason === "profit_target" ||
        trade?.exitReason === "stop_loss" ||
        trade?.exitReason === "time_exit" ||
        trade?.exitReason === "expiry" ||
        trade?.exitReason === "manual" ||
        trade?.exitReason === "insufficient_data"
          ? (trade?.exitReason ?? null)
          : null,
      holdingDays:
        trade?.entryDate && trade?.exitDate
          ? Math.max(
              0,
              Math.round(
                (Date.parse(trade.exitDate) - Date.parse(trade.entryDate)) /
                  (24 * 60 * 60 * 1000),
              ),
            )
          : null,
      realizedAt: trade?.exitDate ?? null,
    };

    const reward = computeLearningReward({ state, action, outcome });

    const record: LearningRecord = {
      state,
      action,
      outcome,
      reward,
      metadata: {
        recordId: buildRecordId(whale),
        schemaVersion: LEARNING_RECORD_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        lineageQuality,
        sourceRefs: {
          primaryWhaleId:
            evaluation?.primaryWhaleId ??
            trade?.sourceWhaleId ??
            whale.id ??
            null,
          whaleIds:
            evaluation?.whaleIds ?? (whale.id != null ? [whale.id] : []),
          sourceAnalysisId:
            evaluation?.sourceAnalysisId ?? trade?.sourceAnalysisId ?? null,
          evaluationId: evaluation?.id ?? null,
          tradeId: trade?.id ?? null,
        },
        completeness: {
          hasAlert: true,
          hasAnalysis: analysis != null,
          hasEvaluation: evaluation != null,
          hasTrade: trade != null,
          hasReward: reward.status !== "not_applicable",
        },
      },
    };

    return learningRecordSchema.parse(record);
  });
}
