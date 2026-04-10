"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import TechnicalChart from "@/components/shared/TechnicalChart";
import OptionsStatsPanel from "@/components/charts/OptionsStatsPanel";
import {
  formatCurrency,
  formatNumber,
  formatPremium,
} from "@/lib/utils/formatters";
import type { EventTickerAnalysis } from "@/types/analysis";

export default function EventTickerAnalysisPanel({
  analyses,
  eventHeadline,
  onReloadTicker,
}: {
  analyses: EventTickerAnalysis[];
  eventHeadline: string;
  onReloadTicker?: (ticker: string) => Promise<void>;
}) {
  if (analyses.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>Event Ticker Analysis</span>
          <Badge variant="outline">
            {analyses.length} ticker{analyses.length === 1 ? "" : "s"}
          </Badge>
        </CardTitle>
        <p className="text-sm text-muted-foreground">{eventHeadline}</p>
      </CardHeader>
      <CardContent>
        {analyses.length === 1 ? (
          <TickerAnalysisCard
            analysis={analyses[0]}
            onReload={
              onReloadTicker
                ? () => onReloadTicker(analyses[0].ticker)
                : undefined
            }
          />
        ) : (
          <Tabs defaultValue={analyses[0].ticker}>
            <TabsList className="mb-4 flex h-auto max-w-full flex-wrap justify-start gap-1 overflow-visible bg-muted/70 p-1">
              {analyses.map((analysis) => (
                <TabsTrigger
                  key={analysis.ticker}
                  value={analysis.ticker}
                  className="h-8! flex-none! px-3 py-1"
                >
                  {analysis.ticker}
                </TabsTrigger>
              ))}
            </TabsList>
            {analyses.map((analysis) => (
              <TabsContent key={analysis.ticker} value={analysis.ticker}>
                <TickerAnalysisCard
                  analysis={analysis}
                  onReload={
                    onReloadTicker
                      ? () => onReloadTicker(analysis.ticker)
                      : undefined
                  }
                />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function TickerAnalysisCard({
  analysis,
  onReload,
}: {
  analysis: EventTickerAnalysis;
  onReload?: () => Promise<void>;
}) {
  const [reloading, setReloading] = useState(false);

  const handleReload = async () => {
    if (!onReload) return;
    setReloading(true);
    try {
      await onReload();
    } finally {
      setReloading(false);
    }
  };
  const recommendation = analysis.recommendation;
  const deepDive = analysis.deepDive;
  const marketSnapshot = analysis.marketSnapshot;
  const optionsSummary = analysis.optionsSummary;
  const recommendationDirectionVariant =
    recommendation.direction === "bullish"
      ? "default"
      : recommendation.direction === "bearish"
        ? "destructive"
        : "secondary";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono">
          {analysis.ticker}
        </Badge>
        {onReload && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs ml-auto"
            disabled={reloading}
            onClick={() => void handleReload()}
            aria-label={`Reload analysis for ${analysis.ticker}`}
          >
            <RefreshCw
              className={`h-3 w-3 mr-1 ${reloading ? "animate-spin" : ""}`}
            />
            {reloading ? "Reloading..." : "Reload"}
          </Button>
        )}
        <Badge variant={recommendationDirectionVariant}>
          {recommendation.direction}
        </Badge>
        <Badge variant="outline">
          Confidence {Math.round(recommendation.confidence * 100)}%
        </Badge>
        {!analysis.whaleMatch.hasWhaleActivity && (
          <Badge variant="secondary">No whale flow</Badge>
        )}
      </div>

      <Section title="Technical Analysis">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm">{deepDive.market_narrative}</p>
            <TechnicalChart
              ticker={analysis.ticker}
              supportResistance={deepDive.support_resistance}
              technicalPatterns={deepDive.technical_patterns}
              technicalPatternsByTimeframe={deepDive.timeframe_patterns}
              optionsContext={deepDive.options_context}
              height={360}
            />
          </div>

          <div className="max-w-md rounded-lg border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Risk Level
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {deepDive.risk_assessment.overall_risk.replace("_", " ")}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Max allocation{" "}
                {deepDive.risk_assessment.max_recommended_allocation}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Position sizing stays constrained until the event signal confirms
              follow-through.
            </p>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            {deepDive.indicators.length > 0 && (
              <div className="rounded-lg border p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Technical Indicators
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {deepDive.indicators.map((indicator, index) => (
                    <div
                      key={`${indicator.name}-${index}`}
                      className="rounded-md border p-3 text-xs"
                    >
                      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                        <span className="min-w-0 font-medium leading-4">
                          {indicator.name}
                        </span>
                        <Badge
                          className="shrink-0"
                          variant={
                            indicator.signal === "bullish"
                              ? "default"
                              : indicator.signal === "bearish"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {indicator.signal}
                        </Badge>
                      </div>
                      <p className="mt-2 text-muted-foreground">
                        {indicator.value} - {indicator.explanation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {deepDive.support_resistance.length > 0 && (
              <div className="rounded-lg border p-4">
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Support / Resistance
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {deepDive.support_resistance
                    .slice(0, 6)
                    .map((level, index) => (
                      <div
                        key={`${level.type}-${level.level}-${index}`}
                        className="rounded-md border p-3 text-xs"
                      >
                        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                          <span className="min-w-0 font-medium leading-4">
                            {level.type === "support"
                              ? "Support"
                              : "Resistance"}{" "}
                            {formatCurrency(level.level)}
                          </span>
                          <Badge variant="secondary" className="shrink-0">
                            {level.strength}
                          </Badge>
                        </div>
                        <p className="mt-2 text-muted-foreground">
                          {level.note}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          <OptionsStatsPanel optionsContext={deepDive.options_context} />
          {!analysis.whaleMatch.hasWhaleActivity &&
            deepDive.options_context.unusual_activity_note &&
            !/^no unusual activity$/i.test(
              deepDive.options_context.unusual_activity_note.trim(),
            ) && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  Unusual options activity detected.
                </span>{" "}
                This comes from options-chain analysis, not from the whale-alert
                pipeline, so whale alignment remains event-led unless a recent
                whale alert is also present.
              </div>
            )}
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Market Snapshot">
          {marketSnapshot ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Metric
                label="Price"
                value={formatCurrency(marketSnapshot.price)}
              />
              <Metric
                label="Volume"
                value={formatNumber(marketSnapshot.volume)}
              />
              <Metric
                label="Day Change"
                value={`${marketSnapshot.dayChangePct >= 0 ? "+" : ""}${marketSnapshot.dayChangePct.toFixed(2)}%`}
              />
              <Metric
                label="IV/RV Spread"
                value={
                  marketSnapshot.ivRvSpread != null
                    ? `${(marketSnapshot.ivRvSpread * 100).toFixed(1)} pts`
                    : "N/A"
                }
              />
            </div>
          ) : (
            <EmptyMetric message="No market snapshot available." />
          )}
        </Section>

        <Section title="Options Activity">
          {optionsSummary ? (
            <div className="space-y-2 text-sm">
              <Metric
                label="Nearest Expiry"
                value={optionsSummary.nearestExpiry.date}
              />
              <Metric
                label="Expirations"
                value={String(optionsSummary.expirations.length)}
              />
              <Metric
                label="Contracts"
                value={`${optionsSummary.nearestExpiry.calls.length} calls / ${optionsSummary.nearestExpiry.puts.length} puts`}
              />
              <Metric
                label="Max Pain"
                value={
                  optionsSummary.maxPain != null
                    ? formatCurrency(optionsSummary.maxPain)
                    : "N/A"
                }
              />
            </div>
          ) : (
            <EmptyMetric message="No options chain data available." />
          )}
        </Section>
      </div>

      <Section title="Trade Recommendation">
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <Badge variant={recommendationDirectionVariant}>
              {recommendation.direction.toUpperCase()}
            </Badge>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Confidence</span>
              <Progress
                value={recommendation.confidence * 100}
                className="h-2 w-28"
              />
              <span className="text-xs font-medium">
                {(recommendation.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <Badge variant="outline">
              {recommendation.primary_strategy.name}
            </Badge>
          </div>

          <p>{recommendation.thesis}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            <Metric
              label="Strategy"
              value={recommendation.primary_strategy.name}
            />
            <Metric
              label="Risk/Reward"
              value={recommendation.primary_strategy.risk_reward_ratio}
            />
          </div>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-2 text-left">Action</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-left">Strike</th>
                  <th className="p-2 text-left">Expiry</th>
                  <th className="p-2 text-right">Est. Premium</th>
                </tr>
              </thead>
              <tbody>
                {recommendation.primary_strategy.legs.map((leg, index) => (
                  <tr
                    key={`${leg.action}-${leg.strike}-${index}`}
                    className="border-b last:border-0"
                  >
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric
              label="Max Profit"
              value={recommendation.primary_strategy.max_profit}
            />
            <Metric
              label="Max Loss"
              value={recommendation.primary_strategy.max_loss}
            />
            <Metric
              label="Breakeven"
              value={recommendation.primary_strategy.breakeven}
            />
            <Metric
              label="Risk/Reward"
              value={recommendation.primary_strategy.risk_reward_ratio}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Market Context
              </p>
              <div className="mt-2 space-y-2 text-xs">
                <div>
                  <span className="font-medium">IV:</span>{" "}
                  {recommendation.market_context.iv_assessment}
                  <p className="text-muted-foreground">
                    {recommendation.market_context.iv_strategy_note}
                  </p>
                </div>
                <div>
                  <span className="font-medium">Volume:</span>{" "}
                  {recommendation.market_context.volume_assessment}
                  {recommendation.market_context.catalyst_date && (
                    <p className="text-muted-foreground">
                      Catalyst {recommendation.market_context.catalyst_date}
                      {recommendation.market_context.days_to_catalyst != null
                        ? ` (${recommendation.market_context.days_to_catalyst}d)`
                        : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Whale Alignment
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Badge
                  variant={
                    recommendation.whale_alignment.matches_whale
                      ? "default"
                      : "secondary"
                  }
                >
                  {recommendation.whale_alignment.matches_whale
                    ? "Aligned"
                    : "Event-led"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {recommendation.whale_alignment.whale_position_size}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {recommendation.whale_alignment.similarity_note}
              </p>
              {analysis.whaleMatch.hasWhaleActivity && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {analysis.whaleMatch.alerts.length} recent whale alert
                  {analysis.whaleMatch.alerts.length === 1 ? "" : "s"} found in
                  the pipeline.
                </p>
              )}
            </div>
          </div>

          {recommendation.risk_factors.length > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Risk Factors
              </p>
              <div className="flex flex-wrap gap-2">
                {recommendation.risk_factors.map((risk) => (
                  <Badge key={risk} variant="outline">
                    {risk}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Deep Dive Summary">
        <div className="space-y-3 text-sm">
          <p>{deepDive.global_events_connection}</p>
          <div className="rounded-md border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Entry / Exit Plan
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Metric
                label="Recommended Option"
                value={deepDive.entry_exit.recommended_option_type}
              />
              <Metric
                label="Expiry Guidance"
                value={deepDive.entry_exit.expiry_guidance}
              />
              <Metric
                label="Entry Range"
                value={`${formatCurrency(deepDive.entry_exit.entry_price_range.low)} - ${formatCurrency(deepDive.entry_exit.entry_price_range.high)}`}
              />
              <Metric
                label="Strike Selection"
                value={deepDive.entry_exit.strike_selection}
              />
              <Metric
                label="Profit Target"
                value={deepDive.entry_exit.profit_target}
              />
              <Metric label="Stop Loss" value={deepDive.entry_exit.stop_loss} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {deepDive.entry_exit.rationale}
            </p>
          </div>

          {deepDive.risk_assessment?.key_risks?.length ? (
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Key Risks
              </p>
              <div className="flex flex-wrap gap-2">
                {deepDive.risk_assessment.key_risks.map((risk) => (
                  <Badge key={risk} variant="outline">
                    {risk}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {deepDive.educational_notes.length > 0 && (
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Educational Notes
              </p>
              <div className="space-y-2">
                {deepDive.educational_notes.slice(0, 4).map((note) => (
                  <div
                    key={note.term}
                    className="rounded-md border p-2 text-xs"
                  >
                    <div className="font-medium">{note.term}</div>
                    <div className="text-muted-foreground">
                      {note.explanation}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">
            {deepDive.disclaimer}
          </p>
        </div>
      </Section>

      <Section title="Whale Alignment">
        {analysis.whaleMatch.hasWhaleActivity ? (
          <div className="space-y-2">
            {analysis.whaleMatch.alerts.slice(0, 3).map((alert) => (
              <div key={alert.id} className="rounded-md border p-2 text-xs">
                <div className="font-medium">
                  {alert.ticker} {alert.callPut} {alert.strike ?? "N/A"} exp{" "}
                  {alert.expiry ?? "N/A"}
                </div>
                <div className="text-muted-foreground">
                  Premium {formatPremium(alert.premium ?? 0)} · Quality{" "}
                  {alert.qualityScore ?? "N/A"}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyMetric message="No whale activity detected for this ticker in the recent window." />
        )}
      </Section>

      <Separator />

      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Risk: {deepDive.risk_assessment?.overall_risk ?? "N/A"}</span>
        <a
          className="text-primary hover:underline"
          href={`/analysis?ticker=${encodeURIComponent(analysis.ticker)}`}
        >
          View on Analysis page →
        </a>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function EmptyMetric({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}
