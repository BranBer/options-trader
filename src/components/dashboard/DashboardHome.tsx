"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldAlert,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useNews, useWhaleAlerts, useAnalyses } from "@/hooks/useApiData";
import { SkeletonCard } from "@/components/shared/Skeletons";
import {
  formatPremium,
  timeAgo,
  confidenceLabel,
} from "@/lib/utils/formatters";

function sentimentColor(s: string | null) {
  if (s === "bullish" || s === "strong_bullish") return "text-emerald-400";
  if (s === "bearish" || s === "strong_bearish") return "text-red-400";
  return "text-muted-foreground";
}

function SentimentIcon({ sentiment }: { sentiment: string | null }) {
  if (sentiment === "bullish" || sentiment === "strong_bullish")
    return (
      <TrendingUp aria-hidden="true" className="h-4 w-4 text-emerald-400" />
    );
  if (sentiment === "bearish" || sentiment === "strong_bearish")
    return <TrendingDown aria-hidden="true" className="h-4 w-4 text-red-400" />;
  return <Minus aria-hidden="true" className="h-4 w-4 text-muted-foreground" />;
}

function sentimentLabel(sentiment: string | null): string {
  if (sentiment === "bullish" || sentiment === "strong_bullish")
    return "Bullish";
  if (sentiment === "bearish" || sentiment === "strong_bearish")
    return "Bearish";
  return "Neutral";
}

interface DashboardPipelineHealth {
  isStale: boolean;
  minutesSinceRefresh: number | null;
  status: "healthy" | "stale" | "running" | "never_run";
}

export default function DashboardHome() {
  const { data: newsData, isLoading: newsLoading, isError: newsError } = useNews(5, 10);
  const { data: whaleData, isLoading: whalesLoading, isError: whalesError } = useWhaleAlerts({
    limit: 10,
  });
  const { data: analysisData, isLoading: analysisLoading, isError: analysisError } = useAnalyses(
    undefined,
    5,
  );
  const [pipelineHealth, setPipelineHealth] =
    useState<DashboardPipelineHealth | null>(null);

  const news = newsData?.events ?? [];
  const whales = whaleData?.alerts ?? [];
  const allAnalyses = analysisData?.analyses ?? [];
  const crossRefs = allAnalyses.filter((a) => a.type === "cross_reference");
  const recommendations = allAnalyses.filter(
    (a) => a.type === "trade_recommendation",
  );

  // Stats
  const bullishWhales = whales.filter((w) => w.sentiment === "bullish").length;
  const bearishWhales = whales.filter((w) => w.sentiment === "bearish").length;
  const highImpactNews = news.filter((n) => (n.impactScore ?? 0) >= 7).length;
  const totalPremium = whales.reduce((sum, w) => sum + (w.premium ?? 0), 0);

  useEffect(() => {
    let active = true;

    const fetchPipelineHealth = async () => {
      try {
        const res = await fetch("/api/pipeline-status");
        if (!res.ok) return;
        const data = (await res.json()) as {
          pipelineHealth?: DashboardPipelineHealth;
        };
        if (active && data.pipelineHealth) {
          setPipelineHealth(data.pipelineHealth);
        }
      } catch {
        // Ignore dashboard status poll failures; navbar already surfaces pipeline status.
      }
    };

    fetchPipelineHealth();
    const interval = setInterval(fetchPipelineHealth, 15000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Options Intelligence Dashboard
        </h1>
        <p className="text-muted-foreground text-sm">
          Real-time fusion of global news, options whale activity, and AI
          analysis.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Whale Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {whalesLoading ? "—" : whales.length}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="text-emerald-400">{bullishWhales} bullish</span>{" "}
              / <span className="text-red-400">{bearishWhales} bearish</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              Total Premium
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {whalesLoading ? "—" : formatPremium(totalPremium)}
            </div>
            <p className="text-xs text-muted-foreground">Last 24h flow</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              High-Impact News
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {newsLoading ? "—" : highImpactNews}
            </div>
            <p className="text-xs text-muted-foreground">Score ≥ 7</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              AI Analyses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analysisLoading ? "—" : allAnalyses.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {crossRefs.length} correlations / {recommendations.length} recs
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70 bg-muted/20">
        <CardContent className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {pipelineHealth?.status === "healthy" ? (
                <Target className="h-4 w-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-amber-400" />
              )}
              <span className="text-sm font-medium">Pipeline Health</span>
              {pipelineHealth ? (
                <Badge variant="outline" className="text-[10px] uppercase">
                  {pipelineHealth.status.replace(/_/g, " ")}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {pipelineHealth == null
                ? "Pipeline status loading..."
                : pipelineHealth.status === "healthy"
                  ? "Pipeline is running normally. Check the analysis page for the latest AI insights."
                  : pipelineHealth.status === "running"
                    ? "The pipeline is currently running. Results will update as soon as the latest refresh completes."
                    : pipelineHealth.status === "never_run"
                      ? "No completed refresh has been recorded in the database yet. In local development this usually means the pipeline has not finished a full cycle since the current database was created."
                      : `Pipeline freshness is degraded${pipelineHealth.minutesSinceRefresh != null ? ` (${pipelineHealth.minutesSinceRefresh} minute(s) since the last completed refresh)` : ""}. In local development this often means the dev server was idle or restarted.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/analysis"
              className="inline-flex items-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              View Analysis
            </Link>
            <Link
              href="/whale-alerts"
              className="inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-background"
            >
              View Whale Alerts
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Main content grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top whale alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent Whale Alerts</CardTitle>
            <div className="flex items-center gap-3">
              <Link
                href="/whale-alerts"
                className="text-xs text-primary hover:underline"
              >
                View all →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72">
              {whalesLoading ? (
                <SkeletonCard />
              ) : whalesError ? (
                <p className="text-sm text-destructive" role="alert">
                  Failed to load whale alerts. Please refresh.
                </p>
              ) : whales.length === 0 ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>No whale alerts yet. Run a pipeline refresh.</p>
                </div>
              ) : (
                <div className="space-y-3 pr-3">
                  {whales.slice(0, 8).map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <SentimentIcon sentiment={w.sentiment} />
                        <span className="sr-only">
                          {sentimentLabel(w.sentiment)} signal
                        </span>
                        <div className="min-w-0">
                          <span className="font-mono font-medium text-sm">
                            {w.ticker}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            {w.strike} {w.callPut} {w.expiry}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-medium">
                          {w.premium ? formatPremium(w.premium) : "—"}
                        </div>
                        <div
                          className="text-xs text-muted-foreground"
                          suppressHydrationWarning
                        >
                          {w.detectedAt ? timeAgo(w.detectedAt) : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Top news events */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">High-Impact News</CardTitle>
            <Link
              href="/globe"
              className="text-xs text-primary hover:underline"
            >
              Globe view →
            </Link>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72">
              {newsLoading ? (
                <SkeletonCard />
              ) : newsError ? (
                <p className="text-sm text-destructive" role="alert">
                  Failed to load news. Please refresh.
                </p>
              ) : news.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No news events yet. Run a pipeline refresh.
                </p>
              ) : (
                <div className="space-y-3 pr-3">
                  {news.slice(0, 8).map((n) => (
                    <div key={n.id} className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm leading-tight line-clamp-2">
                          {n.headline}
                        </p>
                        <Badge variant="outline" className="shrink-0 text-xs">
                          {n.impactScore ?? 0}/10
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={sentimentColor(n.sentiment)}>
                          {n.sentiment}
                        </span>
                        {n.countryCode && <span>{n.countryCode}</span>}
                        {n.publishedAt && (
                          <span suppressHydrationWarning>
                            {timeAgo(n.publishedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Latest AI analysis */}
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Latest AI Analysis</CardTitle>
            <div className="flex items-center gap-3">
              <Link
                href="/analysis"
                className="text-xs text-primary hover:underline"
              >
                View all →
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {analysisLoading ? (
              <SkeletonCard />
            ) : analysisError ? (
              <p className="text-sm text-destructive" role="alert">
                Failed to load analyses. Please refresh.
              </p>
            ) : allAnalyses.length === 0 ? (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  No analyses yet. Run a pipeline refresh to generate
                  cross-references and recommendations.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {allAnalyses.slice(0, 3).map((a) => {
                  const output = a.output as Record<string, unknown> | null;
                  const isCorrelation = a.type === "cross_reference";
                  const correlations = isCorrelation
                    ? (output?.correlations as
                        | Array<{
                            whale_trade: {
                              ticker: string;
                              type: string;
                              strike: number;
                            };
                            related_event: { headline: string };
                            alignment: string;
                            thesis: string;
                          }>
                        | undefined)
                    : undefined;
                  const summary =
                    (output?.summary as string) ??
                    (output?.thesis as string) ??
                    "—";
                  const ticker = isCorrelation
                    ? correlations
                        ?.map((c) => c.whale_trade.ticker)
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .join(", ")
                    : (output?.ticker as string | undefined);
                  return (
                    <div key={a.id}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={
                            a.type === "trade_recommendation"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {a.type === "trade_recommendation"
                            ? "Recommendation"
                            : "Correlation"}
                        </Badge>
                        {ticker && (
                          <span className="font-mono text-sm font-medium">
                            {ticker}
                          </span>
                        )}
                        {a.confidence != null && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            {confidenceLabel(a.confidence)} (
                            {(a.confidence * 100).toFixed(0)}%)
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {summary}
                      </p>
                      {isCorrelation &&
                        correlations &&
                        correlations.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {correlations.slice(0, 3).map((c, i) => (
                              <div
                                key={i}
                                className="flex items-start gap-2 text-xs"
                              >
                                <Badge
                                  variant="outline"
                                  className="shrink-0 text-[10px] px-1.5"
                                >
                                  {c.alignment}
                                </Badge>
                                <span className="text-muted-foreground line-clamp-1">
                                  {c.related_event.headline}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      {a.createdAt && (
                        <p
                          className="text-xs text-muted-foreground mt-1"
                          suppressHydrationWarning
                        >
                          {timeAgo(a.createdAt)}
                        </p>
                      )}
                      <Separator className="mt-3" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
