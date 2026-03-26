"use client";

import Link from "next/link";
import { Activity, Globe, BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useNews, useWhaleAlerts, useAnalyses } from "@/hooks/useApiData";
import { formatPremium, timeAgo, confidenceLabel } from "@/lib/utils/formatters";

function sentimentColor(s: string | null) {
  if (s === "bullish" || s === "strong_bullish") return "text-emerald-400";
  if (s === "bearish" || s === "strong_bearish") return "text-red-400";
  return "text-muted-foreground";
}

function SentimentIcon({ sentiment }: { sentiment: string | null }) {
  if (sentiment === "bullish" || sentiment === "strong_bullish")
    return <TrendingUp className="h-4 w-4 text-emerald-400" />;
  if (sentiment === "bearish" || sentiment === "strong_bearish")
    return <TrendingDown className="h-4 w-4 text-red-400" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

export default function DashboardHome() {
  const { data: newsData, isLoading: newsLoading } = useNews(5, 10);
  const { data: whaleData, isLoading: whalesLoading } = useWhaleAlerts({ limit: 10 });
  const { data: analysisData, isLoading: analysisLoading } = useAnalyses(undefined, 5);

  const news = newsData?.events ?? [];
  const whales = whaleData?.alerts ?? [];
  const allAnalyses = analysisData?.analyses ?? [];
  const crossRefs = allAnalyses.filter((a) => a.type === "cross_reference");
  const recommendations = allAnalyses.filter((a) => a.type === "trade_recommendation");

  // Stats
  const bullishWhales = whales.filter((w) => w.sentiment === "bullish").length;
  const bearishWhales = whales.filter((w) => w.sentiment === "bearish").length;
  const highImpactNews = news.filter((n) => (n.impactScore ?? 0) >= 7).length;
  const totalPremium = whales.reduce((sum, w) => sum + (w.premium ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Options Intelligence Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Real-time fusion of global news, options whale activity, and AI analysis.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Whale Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{whalesLoading ? "—" : whales.length}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-emerald-400">{bullishWhales} bullish</span>{" "}
              / <span className="text-red-400">{bearishWhales} bearish</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Premium</CardTitle>
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
            <CardTitle className="text-sm text-muted-foreground">High-Impact News</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{newsLoading ? "—" : highImpactNews}</div>
            <p className="text-xs text-muted-foreground">Score ≥ 7</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">AI Analyses</CardTitle>
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

      {/* Main content grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Top whale alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent Whale Alerts</CardTitle>
            <Link href="/whale-alerts" className="text-xs text-primary hover:underline">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72">
              {whalesLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : whales.length === 0 ? (
                <p className="text-sm text-muted-foreground">No whale alerts yet. Run a pipeline refresh.</p>
              ) : (
                <div className="space-y-3">
                  {whales.slice(0, 8).map((w) => (
                    <div key={w.id} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <SentimentIcon sentiment={w.sentiment} />
                        <div className="min-w-0">
                          <span className="font-mono font-medium text-sm">{w.ticker}</span>
                          <span className="text-xs text-muted-foreground ml-1">
                            {w.strike} {w.callPut} {w.expiry}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-medium">
                          {w.premium ? formatPremium(w.premium) : "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
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
            <Link href="/globe" className="text-xs text-primary hover:underline">
              Globe view →
            </Link>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-72">
              {newsLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : news.length === 0 ? (
                <p className="text-sm text-muted-foreground">No news events yet. Run a pipeline refresh.</p>
              ) : (
                <div className="space-y-3">
                  {news.slice(0, 8).map((n) => (
                    <div key={n.id} className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm leading-tight line-clamp-2">{n.headline}</p>
                        <Badge variant="outline" className="shrink-0 text-xs">
                          {n.impactScore ?? 0}/10
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={sentimentColor(n.sentiment)}>{n.sentiment}</span>
                        {n.countryCode && <span>{n.countryCode}</span>}
                        {n.publishedAt && <span>{timeAgo(n.publishedAt)}</span>}
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
            <Link href="/analysis" className="text-xs text-primary hover:underline">
              View all →
            </Link>
          </CardHeader>
          <CardContent>
            {analysisLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : allAnalyses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No analyses yet. Run a pipeline refresh to generate cross-references and recommendations.
              </p>
            ) : (
              <div className="space-y-4">
                {allAnalyses.slice(0, 3).map((a) => {
                  const output = a.output as Record<string, unknown> | null;
                  const summary =
                    (output?.summary as string) ?? (output?.thesis as string) ?? "—";
                  const ticker = output?.ticker as string | undefined;
                  return (
                    <div key={a.id}>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={a.type === "trade_recommendation" ? "default" : "secondary"}>
                          {a.type === "trade_recommendation" ? "Recommendation" : "Correlation"}
                        </Badge>
                        {ticker && (
                          <span className="font-mono text-sm font-medium">{ticker}</span>
                        )}
                        {a.confidence != null && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            {confidenceLabel(a.confidence)} ({(a.confidence * 100).toFixed(0)}%)
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{summary}</p>
                      {a.createdAt && (
                        <p className="text-xs text-muted-foreground mt-1">{timeAgo(a.createdAt)}</p>
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
