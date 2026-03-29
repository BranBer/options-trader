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
import { useInfiniteAnalyses, type Analysis } from "@/hooks/useApiData";
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
import { InfiniteScrollTrigger } from "@/components/shared/InfiniteScrollTrigger";
import { VirtualizedAnalysisList } from "@/components/shared/VirtualizedAnalysisList";
import { ConfidenceBreakdownPanel } from "@/components/shared/ConfidenceBreakdownPanel";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";

export default function AnalysisPage() {
  const {
    data: xrefData,
    isLoading: xrefLoading,
    hasNextPage: xrefHasMore,
    isFetchingNextPage: xrefFetchingNext,
    fetchNextPage: xrefFetchNext,
  } = useInfiniteAnalyses("cross_reference");
  const {
    data: recData,
    isLoading: recLoading,
    hasNextPage: recHasMore,
    isFetchingNextPage: recFetchingNext,
    fetchNextPage: recFetchNext,
  } = useInfiniteAnalyses("trade_recommendation");

  const crossRefs = xrefData?.pages.flatMap((p) => p.analyses) ?? [];
  const recommendations = recData?.pages.flatMap((p) => p.analyses) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Analysis</h1>
        <p className="text-muted-foreground text-sm">
          Gemini-powered cross-references and trade recommendations.
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
        </TabsList>

        <TabsContent value="correlations" className="mt-4">
          {xrefLoading ? (
            <p
              className="text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              Loading cross-reference analyses...
            </p>
          ) : crossRefs.length === 0 ? (
            <EmptyState message="No cross-reference analyses yet. Run a pipeline refresh with enough news & whale data." />
          ) : (
            <VirtualizedAnalysisList
              items={crossRefs}
              renderItem={(a) => <CrossReferenceCard analysis={a} />}
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
            <p
              className="text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              Loading trade recommendations...
            </p>
          ) : recommendations.length === 0 ? (
            <EmptyState message="No trade recommendations yet. Run a pipeline refresh to generate them." />
          ) : (
            <VirtualizedAnalysisList
              items={recommendations}
              renderItem={(a) => <RecommendationCard analysis={a} />}
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

function CrossReferenceCard({ analysis }: { analysis: Analysis }) {
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
                {isExpanded && <WhaleDeepDive ticker={c.whale_trade.ticker} />}
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

function RecommendationCard({ analysis }: { analysis: Analysis }) {
  const raw = analysis.output as unknown as TradeRecommendation | null;
  if (!raw || !raw.ticker || !raw.primary_strategy) return null;
  const output = raw;

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
          <p className="text-xs text-muted-foreground mb-1">Whale Alignment</p>
          <div className="flex items-center gap-2 text-sm">
            <Badge
              variant={
                output.whale_alignment?.matches_whale ? "default" : "secondary"
              }
            >
              {output.whale_alignment?.matches_whale
                ? "Aligned"
                : "Not aligned"}
            </Badge>
            <span className="text-xs">
              {output.whale_alignment?.similarity_note}
            </span>
          </div>
        </div>

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
