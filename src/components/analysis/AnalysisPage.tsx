"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useInfiniteAnalyses,
  useWhaleAlerts,
  type Analysis,
} from "@/hooks/useApiData";
import {
  formatPremium,
  formatCurrency,
  timeAgo,
  confidenceLabel,
} from "@/lib/utils/formatters";
import type {
  CrossReferenceAnalysis,
  TradeRecommendation,
} from "@/types/analysis";
import WhaleDeepDive from "@/components/analysis/WhaleDeepDive";
import NexusDriftPanel from "@/components/analysis/NexusDriftPanel";
import { IndicatorGuide } from "@/components/charts/IndicatorExplainers";
import { InfiniteScrollTrigger } from "@/components/shared/InfiniteScrollTrigger";
import { VirtualizedAnalysisList } from "@/components/shared/VirtualizedAnalysisList";
import { ConfidenceBreakdownPanel } from "@/components/shared/ConfidenceBreakdownPanel";
import { SkeletonCard } from "@/components/shared/Skeletons";
import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  BookOpen,
  Network,
  Shield,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Zap,
} from "lucide-react";

export default function AnalysisPage() {
  const {
    data: xrefData,
    isLoading: xrefLoading,
    isError: xrefError,
    hasNextPage: xrefHasMore,
    isFetchingNextPage: xrefFetchingNext,
    fetchNextPage: xrefFetchNext,
  } = useInfiniteAnalyses("cross_reference");
  const {
    data: recData,
    isLoading: recLoading,
    isError: recError,
    hasNextPage: recHasMore,
    isFetchingNextPage: recFetchingNext,
    fetchNextPage: recFetchNext,
  } = useInfiniteAnalyses("trade_recommendation");

  const { data: alertsData } = useWhaleAlerts({ limit: 200 });
  const siByTicker = new Map(
    (alertsData?.alerts ?? [])
      .filter((a) => a.shortPercentOfFloat != null)
      .map((a) => [
        a.ticker,
        {
          shortPercentOfFloat: a.shortPercentOfFloat,
          shortRatio: a.shortRatio,
          squeezePressure: a.squeezePressure,
        },
      ]),
  );

  const crossRefs = xrefData?.pages.flatMap((p) => p.analyses) ?? [];
  const recommendations = recData?.pages.flatMap((p) => p.analyses) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Analysis</h1>
        <p className="text-muted-foreground text-sm">
          AI-powered cross-references and trade recommendations.
        </p>
      </div>

      <Tabs defaultValue="correlations">
        <TabsList>
          <TabsTrigger value="correlations">
            Correlations ({crossRefs.length})
          </TabsTrigger>
          <TabsTrigger value="recommendations">
            Recommendations ({recommendations.length})
          </TabsTrigger>
          <TabsTrigger value="guide">
            <BookOpen className="h-3.5 w-3.5 mr-1" />
            TA Guide
          </TabsTrigger>
          <TabsTrigger value="nexus">
            <Network className="h-3.5 w-3.5 mr-1" />
            Nexus Map
          </TabsTrigger>
        </TabsList>

        <TabsContent value="correlations" className="mt-4">
          {xrefLoading ? (
            <SkeletonCard />
          ) : xrefError ? (
            <p className="text-sm text-destructive" role="alert">
              Failed to load analyses. Please refresh.
            </p>
          ) : crossRefs.length === 0 ? (
            <EmptyState message="No cross-reference analyses yet. Run a pipeline refresh with enough news & whale data." />
          ) : (
            <VirtualizedAnalysisList
              items={crossRefs}
              renderItem={(a) => (
                <CrossReferenceCard analysis={a} siByTicker={siByTicker} />
              )}
              footer={
                <InfiniteScrollTrigger
                  onLoadMore={xrefFetchNext}
                  hasMore={xrefHasMore ?? false}
                  isLoading={xrefFetchingNext}
                />
              }
            />
          )}
        </TabsContent>

        <TabsContent value="recommendations" className="mt-4">
          {recLoading ? (
            <SkeletonCard />
          ) : recError ? (
            <p className="text-sm text-destructive" role="alert">
              Failed to load recommendations. Please refresh.
            </p>
          ) : recommendations.length === 0 ? (
            <EmptyState message="No trade recommendations yet. Run a pipeline refresh to generate them." />
          ) : (
            <VirtualizedAnalysisList
              items={recommendations}
              renderItem={(a) => (
                <RecommendationCard analysis={a} siByTicker={siByTicker} />
              )}
              footer={
                <InfiniteScrollTrigger
                  onLoadMore={recFetchNext}
                  hasMore={recHasMore ?? false}
                  isLoading={recFetchingNext}
                />
              }
            />
          )}
        </TabsContent>

        <TabsContent value="guide" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Technical Analysis Guide for Options Traders
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Learn how to use each chart indicator and what it means for your
                options trades. Click any indicator below to expand its full
                explanation.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Chart Overlay Indicators */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">
                    Chart Overlay Indicators
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    These indicators are drawn directly on the price chart.
                    Enable them using the &quot;Indicators&quot; button above
                    any chart in the Deep Dive view.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <IndicatorGuide indicatorKey="ema9" />
                    <IndicatorGuide indicatorKey="ema21" />
                    <IndicatorGuide indicatorKey="bollinger" />
                    <IndicatorGuide indicatorKey="volumeMA" />
                  </div>
                </div>

                <Separator />

                {/* Oscillator Indicators */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">
                    Momentum Oscillators
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    These appear in separate panes below the chart and measure
                    momentum and trend strength.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <IndicatorGuide indicatorKey="rsi" />
                    <IndicatorGuide indicatorKey="macd" />
                  </div>
                </div>

                <Separator />

                {/* Options-Specific Indicators */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">
                    Options Flow Indicators
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    These are derived from the options market and appear
                    automatically on charts when Deep Dive data is available.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <IndicatorGuide indicatorKey="maxPain" />
                    <IndicatorGuide indicatorKey="oiWalls" />
                    <IndicatorGuide indicatorKey="gexFlip" />
                  </div>
                </div>

                <Separator />

                {/* Quick Tips */}
                <div className="rounded-md bg-amber-500/5 border border-amber-500/20 p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-amber-400">
                    Quick Tips for Using Indicators
                  </h3>
                  <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                    <li>
                      <span className="text-foreground/80 font-medium">
                        Don&apos;t use indicators in isolation
                      </span>{" "}
                      — combine 2-3 indicators for confirmation before entering
                      a trade.
                    </li>
                    <li>
                      <span className="text-foreground/80 font-medium">
                        Match your timeframe
                      </span>{" "}
                      — if you&apos;re trading weekly options, use the 1W or 1M
                      chart. For monthly options, use 3M.
                    </li>
                    <li>
                      <span className="text-foreground/80 font-medium">
                        Volume confirms everything
                      </span>{" "}
                      — a signal without volume is just noise. Always check the
                      Volume MA.
                    </li>
                    <li>
                      <span className="text-foreground/80 font-medium">
                        Options-specific levels matter most
                      </span>{" "}
                      — Max Pain, OI Walls, and GEX Flip are unique to options
                      and give you an edge that stock-only traders don&apos;t
                      have.
                    </li>
                    <li>
                      <span className="text-foreground/80 font-medium">
                        Respect the trend
                      </span>{" "}
                      — if both EMAs are pointing the same direction, trade with
                      them, not against them.
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nexus" className="mt-4">
          <NexusDriftPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

type SiByTicker = Map<
  string,
  {
    shortPercentOfFloat: number | null;
    shortRatio: number | null;
    squeezePressure: string | null;
  }
>;

function CrossReferenceCard({
  analysis,
  siByTicker,
}: {
  analysis: Analysis;
  siByTicker?: SiByTicker;
}) {
  const output =
    analysis.output as unknown as Partial<CrossReferenceAnalysis> | null;
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  const toggleTicker = useCallback((ticker: string) => {
    setExpandedTicker((prev) => (prev === ticker ? null : ticker));
  }, []);

  if (!output || !output.correlations) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Cross-Reference Analysis</CardTitle>
          <div className="flex items-center gap-2">
            {analysis.confidence != null && (
              <Badge variant="outline">
                {confidenceLabel(analysis.confidence)} (
                {(analysis.confidence * 100).toFixed(0)}%)
              </Badge>
            )}
            {analysis.createdAt && (
              <span
                className="text-xs text-muted-foreground"
                suppressHydrationWarning
              >
                {timeAgo(analysis.createdAt)}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">{output.summary}</p>

        {/* Metadata */}
        {output.analysis_metadata && (
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>
              {output.analysis_metadata.news_events_analyzed} news analyzed
            </span>
            <span>
              {output.analysis_metadata.whale_trades_analyzed} whale trades
            </span>
            <span>
              {output.analysis_metadata.correlations_found} correlations
            </span>
          </div>
        )}

        <Separator />

        {/* Correlations */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Correlations</p>
          {output.correlations.map((c, i) => {
            const isExpanded = expandedTicker === c.whale_trade.ticker;
            return (
              <div key={i} className="rounded-md border overflow-hidden">
                <button
                  onClick={() => toggleTicker(c.whale_trade.ticker)}
                  className="w-full text-left p-3 space-y-2 hover:bg-muted/30 transition-colors"
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium text-sm">
                        {c.whale_trade.ticker}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {c.whale_trade.type.toUpperCase()} $
                        {c.whale_trade.strike} {c.whale_trade.expiry}
                      </Badge>
                      <Badge
                        variant={
                          c.alignment === "confirming"
                            ? "default"
                            : c.alignment === "contrarian"
                              ? "destructive"
                              : "secondary"
                        }
                        className="text-xs"
                      >
                        {c.alignment}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <SignalBadge signal={c.smart_money_signal} />
                      <span className="text-xs text-muted-foreground">
                        {(c.correlation_confidence * 100).toFixed(0)}%
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.related_event.headline}
                  </p>
                  <p className="text-sm">{c.thesis}</p>
                </button>
                {isExpanded && (
                  <>
                    {c.alignment === "hedging" && (
                      <div className="mx-3 mb-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
                        <div className="flex items-center gap-2 text-amber-400">
                          <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="text-xs font-semibold">
                            Hedging Alignment Detected
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          The AI classified this whale trade as a{" "}
                          <strong className="text-foreground/80">hedge</strong>,
                          not a directional bet. Large institutions routinely
                          buy options to protect existing short positions — a
                          big call purchase isn&apos;t always a bullish signal.
                        </p>
                        {(() => {
                          const si = siByTicker?.get(c.whale_trade.ticker);
                          if (si?.shortPercentOfFloat != null) {
                            const siPct = (
                              si.shortPercentOfFloat * 100
                            ).toFixed(1);
                            const pressure = si.squeezePressure ?? "low";
                            const pressureColor =
                              pressure === "extreme" || pressure === "high"
                                ? "text-red-400"
                                : pressure === "moderate"
                                  ? "text-amber-400"
                                  : "text-emerald-400";
                            return (
                              <p
                                className={`text-xs font-medium ${pressureColor}`}
                              >
                                ⚠️ Short interest for {c.whale_trade.ticker} is{" "}
                                {siPct}% of float ({pressure.toUpperCase()}{" "}
                                squeeze pressure)
                                {pressure === "extreme" || pressure === "high"
                                  ? " — elevated short interest validates the hedge."
                                  : " — low short interest; hedge may be driven by other factors."}
                              </p>
                            );
                          }
                          return (
                            <p className="text-xs text-amber-400 font-medium">
                              ⚠️ Reduce confidence in this signal. Short
                              interest data unavailable for{" "}
                              {c.whale_trade.ticker}.
                            </p>
                          );
                        })()}
                      </div>
                    )}
                    <WhaleDeepDive ticker={c.whale_trade.ticker} />
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Uncorrelated whales */}
        {(output.uncorrelated_whales?.length ?? 0) > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Uncorrelated Whale Trades
              </p>
              {output.uncorrelated_whales?.map((u, i) => {
                const isExpanded = expandedTicker === `uncorr-${u.ticker}`;
                return (
                  <div key={i} className="rounded-md border overflow-hidden">
                    <button
                      onClick={() => toggleTicker(`uncorr-${u.ticker}`)}
                      className="w-full text-left p-2 hover:bg-muted/30 transition-colors"
                      aria-expanded={isExpanded}
                    >
                      <div className="text-xs flex items-center gap-2">
                        <span className="font-mono">{u.ticker}</span>
                        <Badge variant="outline" className="text-xs">
                          {u.type.toUpperCase()}
                        </Badge>
                        <span>{formatPremium(u.premium)}</span>
                        <span className="text-muted-foreground flex-1">
                          â€” {u.note}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                    {isExpanded && <WhaleDeepDive ticker={u.ticker} />}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RecommendationCard({
  analysis,
  siByTicker,
}: {
  analysis: Analysis;
  siByTicker?: SiByTicker;
}) {
  const raw = analysis.output as unknown as TradeRecommendation | null;
  if (!raw || !raw.ticker || !raw.primary_strategy) return null;
  const output = raw;

  // Detect active cascade influence from confidence breakdown
  const cascadeFactor = analysis.confidenceBreakdown?.factors.find(
    (f) => f.name === "Cascade Strength" && f.value > 0,
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="font-mono">{output.ticker}</span>
            <Badge
              variant={
                output.direction === "bullish"
                  ? "default"
                  : output.direction === "bearish"
                    ? "destructive"
                    : "secondary"
              }
            >
              {output.direction.toUpperCase()}
            </Badge>
            {cascadeFactor && (
              <TooltipProvider delay={200}>
                <Tooltip>
                  <TooltipTrigger>
                    <Badge variant="outline" className="text-xs gap-1">
                      <Zap className="h-3 w-3 text-blue-400" />
                      Cascade {(cascadeFactor.value * 100).toFixed(0)}%
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-56 text-xs">
                    This recommendation is influenced by an upstream nexus
                    company&apos;s earnings report cascading through the supply
                    chain.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Confidence:</span>
              <Progress
                value={output.confidence * 100}
                className="w-20 h-2"
                aria-label={`Recommendation confidence ${(output.confidence * 100).toFixed(0)} percent`}
              />
              <span className="text-xs font-medium">
                {(output.confidence * 100).toFixed(0)}%
              </span>
            </div>
            {analysis.createdAt && (
              <span
                className="text-xs text-muted-foreground"
                suppressHydrationWarning
              >
                {timeAgo(analysis.createdAt)}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">{output.thesis}</p>

        {/* Short Interest Inline */}
        {(() => {
          const si = siByTicker?.get(output.ticker);
          if (!si || si.shortPercentOfFloat == null) return null;
          const pct = (si.shortPercentOfFloat * 100).toFixed(1);
          const pressure = si.squeezePressure ?? "low";
          const color =
            pressure === "extreme" || pressure === "high"
              ? "text-red-400"
              : pressure === "moderate"
                ? "text-amber-400"
                : "text-emerald-400";
          const interpretation =
            pressure === "extreme" || pressure === "high"
              ? output.direction === "bullish"
                ? "Elevated short interest could amplify upside via a squeeze."
                : "Heavy short interest supports bearish thesis."
              : pressure === "moderate"
                ? "Moderate short interest — monitor for squeeze risk."
                : "Low short interest — no significant squeeze catalyst.";
          return (
            <div className="rounded-md border border-border/50 bg-muted/30 px-3 py-2 flex items-center gap-3 text-xs">
              <span className="text-muted-foreground shrink-0">
                Short Interest
              </span>
              <span className={`font-mono font-semibold ${color}`}>
                {pct}% of float
              </span>
              {si.shortRatio != null && (
                <span className="text-muted-foreground">
                  {si.shortRatio.toFixed(1)}d to cover
                </span>
              )}
              <span className="text-muted-foreground hidden md:inline">
                {interpretation}
              </span>
            </div>
          );
        })()}

        {/* Confidence Breakdown */}
        {analysis.confidenceBreakdown && (
          <>
            <Separator />
            <ConfidenceBreakdownPanel
              breakdown={analysis.confidenceBreakdown}
            />
          </>
        )}

        <Separator />

        {/* Strategy */}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Strategy: {output.primary_strategy?.name}
          </p>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <caption className="sr-only">
                Recommended options strategy legs for {output.ticker}
              </caption>
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2">Action</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-left p-2">Strike</th>
                  <th className="text-left p-2">Expiry</th>
                  <th className="text-right p-2">Est. Premium</th>
                </tr>
              </thead>
              <tbody>
                {(output.primary_strategy?.legs ?? []).map((leg, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-2">
                      <Badge
                        variant={
                          leg.action === "buy" ? "default" : "destructive"
                        }
                        className="text-xs"
                      >
                        {leg.action.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="p-2">{leg.type.toUpperCase()}</td>
                    <td className="p-2">{formatCurrency(leg.strike)}</td>
                    <td className="p-2">{leg.expiry}</td>
                    <td className="p-2 text-right">
                      {formatCurrency(leg.estimated_premium)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Max Profit</p>
              <p className="font-medium">
                {output.primary_strategy?.max_profit}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Max Loss</p>
              <p className="font-medium">{output.primary_strategy?.max_loss}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Breakeven</p>
              <p className="font-medium">
                {output.primary_strategy?.breakeven}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Risk/Reward</p>
              <p className="font-medium">
                {output.primary_strategy?.risk_reward_ratio}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Market context */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              IV Assessment
              <TooltipProvider delay={200}>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-56 text-xs">
                    How expensive options are right now. Elevated IV favors
                    selling premium (e.g., credit spreads). Depressed IV favors
                    buying (e.g., long calls/puts).
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </p>
            <Badge variant="outline">
              {output.market_context?.iv_assessment}
            </Badge>
            <p className="text-xs mt-1">
              {output.market_context?.iv_strategy_note}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              Volume
              <TooltipProvider delay={200}>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-56 text-xs">
                    How trading volume compares to normal. Unusual high volume
                    often confirms that large players are positioning â€” adding
                    weight to the signal.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </p>
            <Badge variant="outline">
              {output.market_context?.volume_assessment}
            </Badge>
            {output.market_context?.catalyst_date && (
              <p className="text-xs mt-1">
                Catalyst: {output.market_context.catalyst_date}
                {output.market_context.days_to_catalyst != null &&
                  ` (${output.market_context.days_to_catalyst}d)`}
              </p>
            )}
          </div>
        </div>

        {/* Whale alignment */}
        <div>
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            Whale Alignment
            <TooltipProvider delay={200}>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-64 text-xs">
                  Whether this recommendation follows the same direction as the
                  whale trade. &quot;Aligned&quot; means you&apos;d be trading
                  alongside the whale. &quot;Not aligned&quot; means the AI
                  found reasons to take the opposite view.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </p>
          <div className="flex items-center gap-2 text-sm">
            <Badge
              variant={
                output.whale_alignment?.matches_whale ? "default" : "secondary"
              }
            >
              {output.whale_alignment?.matches_whale
                ? "Aligned with whale"
                : "Contrarian to whale"}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {output.whale_alignment?.similarity_note}
            </span>
          </div>
          {!output.whale_alignment?.matches_whale && (
            <p className="text-xs text-amber-400 mt-1">
              ⚠️ The AI is recommending against the whale&apos;s direction —
              likely because the whale may be hedging rather than making a
              directional bet.
            </p>
          )}
        </div>

        {/* Technical indicator analysis — signals supporting/opposing (Story 39.7) */}
        {output.indicator_analysis && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                Technical Signal Analysis
                <TooltipProvider delay={200}>
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-64 text-xs">
                      The AI analyzed indicator patterns across multiple
                      timeframes (1W, 1M, 3M) and listed which signals support
                      the thesis and which contradict it. More supporting
                      signals = higher conviction.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </p>
              {output.indicator_analysis.signals_supporting_thesis.length >
                0 && (
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2.5 space-y-1">
                  <p className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" aria-hidden="true" />
                    Supporting signals
                  </p>
                  <ul className="space-y-0.5">
                    {output.indicator_analysis.signals_supporting_thesis.map(
                      (s, i) => (
                        <li key={i} className="text-xs text-muted-foreground">
                          • {s}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}
              {output.indicator_analysis.signals_opposing_thesis.length > 0 && (
                <div className="rounded-md border border-red-500/20 bg-red-500/5 p-2.5 space-y-1">
                  <p className="text-[10px] font-semibold text-red-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    Opposing signals
                  </p>
                  <ul className="space-y-0.5">
                    {output.indicator_analysis.signals_opposing_thesis.map(
                      (s, i) => (
                        <li key={i} className="text-xs text-muted-foreground">
                          • {s}
                        </li>
                      ),
                    )}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Impact on confidence</p>
                  <p className="text-foreground/80">
                    {output.indicator_analysis.impact_on_confidence}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Impact on strategy</p>
                  <p className="text-foreground/80">
                    {output.indicator_analysis.impact_on_strategy}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Risk factors */}
        {(output.risk_factors?.length ?? 0) > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Risk Factors</p>
            <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
              {output.risk_factors.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">
          {output.disclaimer}
        </p>
      </CardContent>
    </Card>
  );
}

function SignalBadge({ signal }: { signal: string }) {
  const variant =
    signal === "strong_bullish" || signal === "bullish"
      ? "default"
      : signal === "strong_bearish" || signal === "bearish"
        ? "destructive"
        : "secondary";
  const label = signal.replace(/_/g, " ");
  return (
    <Badge variant={variant} className="text-xs">
      {label}
    </Badge>
  );
}
