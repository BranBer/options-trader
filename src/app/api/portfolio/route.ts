import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import {
  simTrades,
  simPortfolio,
  simPortfolioSnapshots,
  simEvaluations,
  analyses,
  whaleAlerts,
} from "@/lib/db/schema";
import { and, asc, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import {
  getMockPortfolioOverview,
  getMockPortfolioTrades,
  getMockEquityCurve,
  getMockPortfolioTrade,
} from "@/lib/mock/portfolio-mock-data";
import { runAttribution } from "@/lib/analytics/attribution-engine";
import { buildAlertDiagnostics } from "@/lib/analytics/alert-diagnostics";
import {
  matchesAlertReasonCluster,
  summarizeAlertDecisionTraces,
  type AlertDiagnosticsReasonCluster,
} from "@/lib/analytics/alert-diagnostics";
import { buildAlertCorrelations } from "@/lib/analytics/alert-correlation";
import { buildAttributionDiagnostics } from "@/lib/analytics/funnel-diagnostics";
import { runPostmortemEngine } from "@/lib/analytics/postmortem-engine";
import { runReplayHarness } from "@/lib/analytics/replay-harness";
import { getLastRefreshAt } from "@/lib/cron/scheduler";

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const view = params.get("view") ?? "overview"; // 'overview' | 'trades' | 'equity' | 'trade' | 'attribution' | 'diagnostics' | 'postmortem' | 'benchmark'
  const tradeId = params.get("id");
  const status = params.get("status"); // 'open' | 'closed' | 'all'
  const limit = Math.min(Number(params.get("limit")) || 50, 200);

  // --- Mock data mode ---
  if (USE_MOCK) {
    if (view === "trade" && tradeId) {
      const result = getMockPortfolioTrade(Number(tradeId));
      if (!result)
        return NextResponse.json({ error: "Trade not found" }, { status: 404 });
      return NextResponse.json(result);
    }
    if (view === "equity") return NextResponse.json(getMockEquityCurve());
    if (view === "trades")
      return NextResponse.json(getMockPortfolioTrades(status ?? undefined));
    return NextResponse.json(getMockPortfolioOverview());
  }

  // --- Single trade detail ---
  if (view === "trade" && tradeId) {
    const id = Number(tradeId);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid trade ID" }, { status: 400 });
    }
    const [trade] = await db
      .select()
      .from(simTrades)
      .where(eq(simTrades.id, id));

    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    // Fetch confidence breakdown from the source analysis if linked
    let confidenceBreakdown = null;
    let sourceAnalysis = null;
    if (trade.sourceAnalysisId) {
      const [analysis] = await db
        .select()
        .from(analyses)
        .where(eq(analyses.id, trade.sourceAnalysisId));
      if (analysis) {
        if (analysis.confidenceBreakdown) {
          try {
            confidenceBreakdown = JSON.parse(analysis.confidenceBreakdown);
          } catch {
            // ignore malformed JSON
          }
        }
        sourceAnalysis = {
          id: analysis.id,
          type: analysis.type,
          confidence: analysis.confidence,
          createdAt: analysis.createdAt,
        };
      }
    }

    // Fetch source whale alert if linked
    let sourceWhale = null;
    if (trade.sourceWhaleId) {
      const [whale] = await db
        .select()
        .from(whaleAlerts)
        .where(eq(whaleAlerts.id, trade.sourceWhaleId));
      if (whale) {
        sourceWhale = {
          id: whale.id,
          ticker: whale.ticker,
          strike: whale.strike,
          expiry: whale.expiry,
          callPut: whale.callPut,
          premium: whale.premium,
          volume: whale.volume,
          openInterest: whale.openInterest,
          underlyingPrice: whale.underlyingPrice,
          sentiment: whale.sentiment,
          qualityScore: whale.qualityScore,
          detectedAt: whale.detectedAt,
        };
      }
    }

    return NextResponse.json({
      trade: {
        ...trade,
        legs: trade.legs ? JSON.parse(trade.legs) : [],
        geminiReasoning: trade.geminiReasoning
          ? JSON.parse(trade.geminiReasoning)
          : null,
      },
      confidenceBreakdown,
      sourceAnalysis,
      sourceWhale,
    });
  }

  // --- Story 20.4: Evaluations audit trail ---
  if (view === "evaluations") {
    const filterStatus = params.get("status"); // 'accepted' | 'rejected' | null (all)

    let query = db.select().from(simEvaluations);

    if (filterStatus === "accepted") {
      query = query.where(eq(simEvaluations.shouldEnter, true)) as typeof query;
    } else if (filterStatus === "rejected") {
      query = query.where(
        eq(simEvaluations.shouldEnter, false),
      ) as typeof query;
    }

    const evals = await query
      .orderBy(desc(simEvaluations.createdAt))
      .limit(limit);

    // Compute acceptance rate for the last 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentEvals = await db
      .select({
        shouldEnter: simEvaluations.shouldEnter,
      })
      .from(simEvaluations)
      .where(gte(simEvaluations.createdAt, since24h));

    const total = recentEvals.length;
    const accepted = recentEvals.filter((e) => e.shouldEnter).length;
    const acceptanceRate = total > 0 ? (accepted / total) * 100 : null;

    return NextResponse.json({
      evaluations: evals,
      stats: {
        total24h: total,
        accepted24h: accepted,
        rejected24h: total - accepted,
        acceptanceRate24h: acceptanceRate,
      },
    });
  }

  // --- Equity curve ---
  if (view === "equity") {
    const snapshots = await db
      .select()
      .from(simPortfolioSnapshots)
      .orderBy(asc(simPortfolioSnapshots.snapshotDate))
      .limit(365);

    return NextResponse.json({
      snapshots: snapshots.map((s) => ({
        date: s.snapshotDate,
        balance: s.balance,
        totalPnl: s.totalPnl,
        openPositions: s.openPositions,
      })),
    });
  }

  // --- Trades list ---
  if (view === "trades") {
    let query = db.select().from(simTrades);

    if (status === "open") {
      query = query.where(eq(simTrades.status, "open")) as typeof query;
    } else if (status === "closed") {
      query = query.where(eq(simTrades.status, "closed")) as typeof query;
    }

    const trades = await query.orderBy(desc(simTrades.createdAt)).limit(limit);

    return NextResponse.json({
      trades: trades.map((t) => ({
        ...t,
        legs: t.legs ? JSON.parse(t.legs) : [],
        geminiReasoning: t.geminiReasoning
          ? JSON.parse(t.geminiReasoning)
          : null,
      })),
      total: trades.length,
    });
  }

  // --- Epic 32.1 / 32.2: Dedicated recent alert diagnostics ---
  if (view === "diagnostics") {
    const ticker = params.get("ticker")?.trim().toUpperCase() ?? null;
    const outcome = params.get("outcome") as
      | "entered"
      | "rejected"
      | "not_evaluated"
      | null;
    const reasonCluster = params.get(
      "reasonCluster",
    ) as AlertDiagnosticsReasonCluster | null;
    const startDate = params.get("startDate");
    const endDate = params.get("endDate");
    const minQualityRaw = params.get("minQuality");
    const minQuality =
      minQualityRaw != null && minQualityRaw !== ""
        ? Number(minQualityRaw)
        : null;
    const cursorRaw = params.get("cursor");
    const cursor = cursorRaw != null ? Number(cursorRaw) : null;

    const scanLimit = Math.min(
      outcome ? Math.max(limit * 5, limit + 1) : limit + 1,
      500,
    );
    const conditions = [];

    if (cursor != null && !Number.isNaN(cursor)) {
      conditions.push(lt(whaleAlerts.id, cursor));
    }
    if (ticker) {
      conditions.push(eq(whaleAlerts.ticker, ticker));
    }
    if (minQuality != null && !Number.isNaN(minQuality)) {
      conditions.push(gte(whaleAlerts.qualityScore, minQuality));
    }
    if (startDate) {
      conditions.push(gte(whaleAlerts.detectedAt, startDate));
    }
    if (endDate) {
      conditions.push(lte(whaleAlerts.detectedAt, endDate));
    }

    let whalesQuery = db.select().from(whaleAlerts);
    if (conditions.length > 0) {
      whalesQuery = whalesQuery.where(and(...conditions)) as typeof whalesQuery;
    }

    const whaleRows = await whalesQuery
      .orderBy(desc(whaleAlerts.id))
      .limit(scanLimit + 1);

    const hasMoreRaw = whaleRows.length > scanLimit;
    const whaleWindow = whaleRows.slice(0, scanLimit);
    const tickers = [...new Set(whaleWindow.map((row) => row.ticker))];

    const evaluationRows = tickers.length
      ? await db
          .select({
            ticker: simEvaluations.ticker,
            shouldEnter: simEvaluations.shouldEnter,
            confidence: simEvaluations.confidence,
            rejectionGate: simEvaluations.rejectionGate,
            rejectionReason: simEvaluations.rejectionReason,
            createdAt: simEvaluations.createdAt,
            sourceAnalysisId: simEvaluations.sourceAnalysisId,
          })
          .from(simEvaluations)
          .where(inArray(simEvaluations.ticker, tickers))
          .orderBy(desc(simEvaluations.createdAt))
          .limit(scanLimit * 6)
      : [];

    const tradeRows = tickers.length
      ? await db
          .select()
          .from(simTrades)
          .where(inArray(simTrades.ticker, tickers))
          .orderBy(desc(simTrades.createdAt))
          .limit(scanLimit * 4)
      : [];

    const sourceAnalysisIds = evaluationRows
      .map((evaluation) => evaluation.sourceAnalysisId)
      .filter((id): id is number => id != null);
    const analysisRows = sourceAnalysisIds.length
      ? await db
          .select({ id: analyses.id, inputRefs: analyses.inputRefs })
          .from(analyses)
          .where(inArray(analyses.id, sourceAnalysisIds))
      : [];
    const analysisRefMap = new Map<number, Record<string, unknown>>(
      analysisRows.map((row) => {
        try {
          return [row.id, JSON.parse(row.inputRefs ?? "{}")] as const;
        } catch {
          return [row.id, {}] as const;
        }
      }),
    );

    const whalesForTrace = whaleWindow.map((row) => ({
      id: row.id,
      ticker: row.ticker,
      strike: row.strike ?? 0,
      expiry: row.expiry ?? "",
      callPut: (row.callPut ?? "C") as "C" | "P",
      premium: row.premium ?? 0,
      volume: row.volume ?? 0,
      openInterest: row.openInterest ?? 0,
      underlyingPrice: row.underlyingPrice ?? undefined,
      sentiment: ((row.sentiment ?? "bullish") === "bearish"
        ? "bearish"
        : "bullish") as "bullish" | "bearish",
      source: row.source ?? "unknown",
      detectedAt: row.detectedAt ?? row.createdAt ?? new Date().toISOString(),
      qualityScore: row.qualityScore ?? undefined,
    }));

    const evaluationsForTrace = evaluationRows.map((evaluation) => {
      const refs = evaluation.sourceAnalysisId
        ? analysisRefMap.get(evaluation.sourceAnalysisId)
        : undefined;

      return {
        ...evaluation,
        primaryWhaleId:
          typeof refs?.primaryWhaleId === "number" ? refs.primaryWhaleId : null,
        whaleIds: Array.isArray(refs?.whaleIds)
          ? refs.whaleIds.filter((id): id is number => typeof id === "number")
          : [],
      };
    });

    const tradesForTrace = tradeRows.map((trade) => {
      let strike: number | undefined;
      let expiry: string | undefined;

      try {
        const legs = trade.legs ? JSON.parse(trade.legs) : [];
        const firstLeg = Array.isArray(legs) ? legs[0] : null;
        strike =
          typeof firstLeg?.strike === "number" ? firstLeg.strike : undefined;
        expiry =
          typeof firstLeg?.expiry === "string" ? firstLeg.expiry : undefined;
      } catch {
        strike = undefined;
        expiry = undefined;
      }

      return {
        id: trade.id,
        ticker: trade.ticker,
        entryDate: trade.entryDate,
        exitDate: trade.exitDate,
        strike,
        expiry,
        entryPrice: Number(trade.entryPrice),
        exitPrice: trade.exitPrice ? Number(trade.exitPrice) : null,
        pnl: trade.pnl ? Number(trade.pnl) : null,
        pnlPct: trade.pnlPct ? Number(trade.pnlPct) : null,
        status: (trade.status === "open" ? "open" : "closed") as
          | "open"
          | "closed",
        sourceWhaleId: trade.sourceWhaleId,
        sourceAnalysisId: trade.sourceAnalysisId,
      };
    });

    const diagnostics = buildAlertDiagnostics({
      whales: whalesForTrace,
      evaluations: evaluationsForTrace,
      trades: tradesForTrace,
      lastRefreshAt: getLastRefreshAt(),
    });

    const filteredTraces = diagnostics.traces.filter((trace) => {
      if (outcome && trace.finalOutcome !== outcome) return false;
      if (!matchesAlertReasonCluster(trace, reasonCluster)) return false;
      return true;
    });
    const traces = filteredTraces.slice(0, limit);
    const lastTrace = traces.length > 0 ? traces[traces.length - 1] : null;
    const lastWhale =
      whaleWindow.length > 0 ? whaleWindow[whaleWindow.length - 1] : null;
    const nextCursor =
      filteredTraces.length > limit
        ? (lastTrace?.alertId ?? null)
        : hasMoreRaw
          ? (lastWhale?.id ?? null)
          : null;

    return NextResponse.json({
      diagnostics: {
        traces,
        summary: summarizeAlertDecisionTraces(filteredTraces),
        pipelineHealth: diagnostics.pipelineHealth,
        pageInfo: {
          limit,
          nextCursor,
          hasMore: nextCursor != null,
        },
        filters: {
          ticker,
          outcome,
          reasonCluster,
          minQuality,
          startDate,
          endDate,
        },
      },
    });
  }

  // --- Story 30.6: Opportunity Attribution Diagnostics ---
  if (view === "attribution") {
    // Fetch all whale alerts
    const whales = await db
      .select()
      .from(whaleAlerts)
      .orderBy(desc(whaleAlerts.detectedAt))
      .limit(limit);

    // Fetch all trades
    const trades = await db.select().from(simTrades);

    // Fetch recent evaluations to classify missed alerts from actual pipeline decisions
    const evaluations = await db
      .select({
        ticker: simEvaluations.ticker,
        shouldEnter: simEvaluations.shouldEnter,
        confidence: simEvaluations.confidence,
        rejectionGate: simEvaluations.rejectionGate,
        rejectionReason: simEvaluations.rejectionReason,
        createdAt: simEvaluations.createdAt,
        sourceAnalysisId: simEvaluations.sourceAnalysisId,
      })
      .from(simEvaluations)
      .orderBy(desc(simEvaluations.createdAt))
      .limit(limit * 4);

    const whalesForEngine = whales.map((w) => ({
      id: w.id,
      ticker: w.ticker,
      strike: w.strike ?? 0,
      expiry: w.expiry ?? "",
      callPut: (w.callPut ?? "C") as "C" | "P",
      premium: w.premium ?? 0,
      volume: w.volume ?? 0,
      openInterest: w.openInterest ?? 0,
      underlyingPrice: w.underlyingPrice ?? undefined,
      sentiment: (w.sentiment ?? "bullish") as "bullish" | "bearish",
      source: w.source ?? "unknown",
      detectedAt: w.detectedAt ?? new Date().toISOString(),
      qualityScore: w.qualityScore ?? undefined,
    }));

    const tradesForEngine = trades.map((t) => ({
      id: t.id,
      ticker: t.ticker,
      entryDate: t.entryDate ?? "",
      exitDate: t.exitDate,
      entryPrice: Number(t.entryPrice),
      exitPrice: t.exitPrice ? Number(t.exitPrice) : null,
      pnl: t.pnl ? Number(t.pnl) : null,
      pnlPct: t.pnlPct ? Number(t.pnlPct) : null,
      status: (t.status ?? "closed") as "open" | "closed",
      sourceWhaleId: t.sourceWhaleId,
      sourceAnalysisId: t.sourceAnalysisId,
    }));

    const sourceAnalysisIds = evaluations
      .map((evaluation) => evaluation.sourceAnalysisId)
      .filter((id): id is number => id != null);
    const analysisRows = sourceAnalysisIds.length
      ? await db
          .select({ id: analyses.id, inputRefs: analyses.inputRefs })
          .from(analyses)
          .where(inArray(analyses.id, sourceAnalysisIds))
      : [];
    const analysisRefMap = new Map<number, Record<string, unknown>>(
      analysisRows.map((row) => {
        try {
          return [row.id, JSON.parse(row.inputRefs ?? "{}")] as const;
        } catch {
          return [row.id, {}] as const;
        }
      }),
    );
    const evaluationsWithRefs = evaluations.map((evaluation) => {
      const refs = evaluation.sourceAnalysisId
        ? analysisRefMap.get(evaluation.sourceAnalysisId)
        : undefined;
      return {
        ...evaluation,
        primaryWhaleId:
          typeof refs?.primaryWhaleId === "number" ? refs.primaryWhaleId : null,
        whaleIds: Array.isArray(refs?.whaleIds)
          ? refs.whaleIds.filter((id): id is number => typeof id === "number")
          : [],
      };
    });

    const attribution = runAttribution(
      whalesForEngine,
      tradesForEngine,
      evaluationsWithRefs,
    );
    const diagnostics = buildAttributionDiagnostics({
      whales: whalesForEngine,
      evaluations: evaluationsWithRefs,
      missed: attribution.missed.map((missed) => ({
        ticker: missed.ticker,
        missReason: missed.missReason,
      })),
    });
    const correlations = buildAlertCorrelations({
      whales: whalesForEngine,
      evaluations: evaluationsWithRefs,
      trades: tradesForEngine,
    });

    return NextResponse.json({
      attribution: {
        captureRate: attribution.captureRate,
        totalCandidates: attribution.totalCandidates,
        capturedCount: attribution.captured.length,
        missedCount: attribution.missed.length,
        captured: attribution.captured.map((c) => ({
          ticker: c.ticker,
          sentiment: c.sentiment,
          premium: c.premium,
          qualityScore: c.qualityScore,
          realizedReturnPct: c.realizedReturnPct,
          detectedAt: c.detectedAt,
        })),
        missed: attribution.missed.slice(0, 20).map((m) => ({
          ticker: m.ticker,
          sentiment: m.sentiment,
          premium: m.premium,
          qualityScore: m.qualityScore,
          missReason: m.missReason,
          detectedAt: m.detectedAt,
        })),
        diagnostics: {
          ...diagnostics,
          correlations,
        },
        summary: attribution.summary,
      },
    });
  }

  // --- Story 30.7: Trade Postmortem Diagnostics ---
  if (view === "postmortem") {
    const trades = await db
      .select()
      .from(simTrades)
      .where(eq(simTrades.status, "closed"))
      .orderBy(desc(simTrades.exitDate))
      .limit(limit);

    const postmortemInputs = trades.map((t) => ({
      tradeId: t.id,
      ticker: t.ticker,
      direction: "bullish" as const,
      entryDate: t.entryDate ?? "",
      exitDate: t.exitDate ?? "",
      entryPrice: Number(t.entryPrice),
      exitPrice: Number(t.exitPrice),
      pnl: Number(t.pnl),
      pnlPct: Number(t.pnlPct),
    }));

    const postmortem = runPostmortemEngine(postmortemInputs);

    return NextResponse.json({
      postmortem: {
        avoidableCount: postmortem.avoidableCount,
        unavoidableCount: postmortem.unavoidableCount,
        results: postmortem.results.map((r) => ({
          tradeId: r.tradeId,
          ticker: r.isLosingTrade
            ? trades.find((t) => t.id === r.tradeId)?.ticker
            : undefined,
          isLosingTrade: r.isLosingTrade,
          isAvoidable: r.isAvoidable,
          avoidableCategory: r.avoidableCategory,
          riskScore: r.riskScore,
          explanation: r.explanation,
          preTradeWarnings: r.preTradeWarnings,
        })),
        summary: postmortem.summary,
      },
    });
  }

  // --- Story 30.8: Benchmark Comparison ---
  if (view === "benchmark") {
    const trades = await db.select().from(simTrades);

    const replayInputs = trades.map((t) => ({
      tradeId: t.id,
      ticker: t.ticker,
      entryDate: t.entryDate ?? "",
      exitDate: t.exitDate ?? "",
      entryPrice: Number(t.entryPrice),
      exitPrice: Number(t.exitPrice),
      direction: "bullish" as const,
      pnl: Number(t.pnl),
      pnlPct: Number(t.pnlPct),
      qualityScore: undefined,
      ivRegime: undefined as "elevated" | "normal" | "low" | undefined,
      technicalAlignment: undefined,
      compositeConfidence: undefined,
    }));

    const replay = runReplayHarness(replayInputs);

    return NextResponse.json({
      benchmark: {
        current: {
          name: replay.current.config.name,
          metrics: replay.current.metrics,
        },
        baselines: replay.baselines.map((b) => ({
          name: b.config.name,
          description: b.config.description,
          metrics: b.metrics,
        })),
        comparison: replay.comparison,
        report: replay.report,
      },
    });
  }

  // --- Overview (default) ---
  const [portfolio] = await db.select().from(simPortfolio).limit(1);

  if (!portfolio) {
    return NextResponse.json({
      portfolio: {
        balance: 2000,
        startingBalance: 2000,
        totalPnl: 0,
        totalPnlPct: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        avgPnl: 0,
        maxDrawdown: 0,
        bestTradePnl: 0,
        worstTradePnl: 0,
        sharpeRatio: null,
        openPositions: 0,
        lastUpdated: null,
      },
    });
  }

  const openCount = await db
    .select()
    .from(simTrades)
    .where(eq(simTrades.status, "open"));

  const totalTrades = portfolio.totalTrades;
  const winRate =
    totalTrades > 0 ? (portfolio.winningTrades / totalTrades) * 100 : 0;
  const avgPnl = totalTrades > 0 ? portfolio.totalPnl / totalTrades : 0;
  const totalPnlPct =
    portfolio.startingBalance > 0
      ? (portfolio.totalPnl / portfolio.startingBalance) * 100
      : 0;

  // Compute Sharpe ratio from snapshots (if enough data)
  let sharpeRatio: number | null = null;
  const snapshots = await db
    .select()
    .from(simPortfolioSnapshots)
    .orderBy(asc(simPortfolioSnapshots.snapshotDate));

  if (snapshots.length >= 5) {
    const returns: number[] = [];
    for (let i = 1; i < snapshots.length; i++) {
      const prev = snapshots[i - 1].balance;
      const curr = snapshots[i].balance;
      if (prev > 0) returns.push((curr - prev) / prev);
    }
    if (returns.length > 1) {
      const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
      const variance =
        returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) /
        (returns.length - 1);
      const stdDev = Math.sqrt(variance);
      if (stdDev > 0) {
        sharpeRatio = (mean / stdDev) * Math.sqrt(252); // Annualized
      }
    }
  }

  return NextResponse.json({
    portfolio: {
      balance: portfolio.balance,
      startingBalance: portfolio.startingBalance,
      totalPnl: portfolio.totalPnl,
      totalPnlPct,
      totalTrades,
      winningTrades: portfolio.winningTrades,
      losingTrades: portfolio.losingTrades,
      winRate,
      avgPnl,
      maxDrawdown: portfolio.maxDrawdown,
      bestTradePnl: portfolio.bestTradePnl,
      worstTradePnl: portfolio.worstTradePnl,
      sharpeRatio,
      openPositions: openCount.length,
      lastUpdated: portfolio.lastUpdated,
    },
  });
}
