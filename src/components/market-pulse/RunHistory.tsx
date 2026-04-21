"use client";

import { useState } from "react";
import { ChevronDown, History, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CollapsibleRoot,
  CollapsibleTrigger,
  CollapsiblePanel,
} from "@/components/ui/collapsible";
import { useMarketPulseRuns } from "@/hooks/useMarketPulse";

type MarketPulseStageTelemetry = {
  durationMs?: number;
  llmTokensUsed?: number;
  itemCount?: number;
  distribution?: Record<string, number>;
  averageConfidence?: number | null;
  changedFromPrior?: boolean;
};

type MarketPulseRunTelemetry = {
  candleCount?: number;
  stages?: {
    classification?: MarketPulseStageTelemetry;
    correlation?: MarketPulseStageTelemetry;
    narrative?: MarketPulseStageTelemetry;
  };
};

function formatDate(value: string | null) {
  if (!value) return "in progress";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(value: number | null) {
  if (value == null) return "--";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function statusTone(status: string) {
  if (status === "success") return "border-emerald-500/30 text-emerald-400";
  if (status === "partial") return "border-amber-500/30 text-amber-400";
  if (status === "error") return "border-rose-500/30 text-rose-400";
  if (status === "running") return "border-sky-500/30 text-sky-400";
  return "border-zinc-500/30 text-zinc-300";
}

function asRunTelemetry(
  value: Record<string, unknown> | null,
): MarketPulseRunTelemetry | null {
  if (!value || typeof value !== "object") return null;
  return value as MarketPulseRunTelemetry;
}

function formatPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return `${Math.round(value * 100)}%`;
}

function formatDistribution(distribution: Record<string, number> | undefined) {
  if (!distribution) return null;

  const buyers = distribution.buyers ?? 0;
  const sellers = distribution.sellers ?? 0;
  const neutral = distribution.neutral ?? 0;
  return `B ${buyers} / S ${sellers} / N ${neutral}`;
}

export default function RunHistory({
  ticker,
  onInspectRun,
}: {
  ticker: string;
  onInspectRun: (runId: string) => void;
}) {
  const { data, isLoading, error } = useMarketPulseRuns(ticker, 6);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card size="sm" className="border-border/70 bg-background/70">
      <CollapsibleRoot open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger
          render={<div />}
          nativeButton={false}
          className="w-full cursor-pointer"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Recent Runs
            </CardTitle>
            <div className="flex items-center gap-2">
              {data?.runs.length ? (
                <span className="text-xs text-muted-foreground">
                  {data.runs.length} runs
                </span>
              ) : null}
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${
                  isOpen ? "rotate-180" : "rotate-0"
                }`}
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <CardContent className="space-y-3 pt-0">
            {isLoading ? (
              <div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading run history...
              </div>
            ) : error ? (
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-sm text-rose-200">
                {error.message}
              </div>
            ) : data?.runs.length ? (
              data.runs.map((run) => {
                const telemetry = asRunTelemetry(run.stages);
                const classification = telemetry?.stages?.classification;
                const correlation = telemetry?.stages?.correlation;
                const narrative = telemetry?.stages?.narrative;
                const distribution = formatDistribution(
                  classification?.distribution,
                );
                const averageConfidence = formatPct(
                  correlation?.averageConfidence,
                );

                return (
                  <div
                    key={run.runId}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-3"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={statusTone(run.status)}
                        >
                          {run.status}
                        </Badge>
                        <Badge variant="outline">{run.trigger}</Badge>
                        {telemetry?.candleCount != null ? (
                          <Badge variant="outline">
                            {telemetry.candleCount} candles
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>
                          {formatDate(run.completedAt ?? run.startedAt)}
                        </span>
                        <span>{formatDuration(run.durationMs)}</span>
                        <span>{run.llmTokensUsed ?? 0} tokens</span>
                      </div>
                      {classification || correlation || narrative ? (
                        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          {classification ? (
                            <Badge
                              variant="secondary"
                              className="bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/10"
                            >
                              {classification.itemCount ?? 0} classified
                            </Badge>
                          ) : null}
                          {distribution ? (
                            <Badge
                              variant="secondary"
                              className="bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/10"
                            >
                              {distribution}
                            </Badge>
                          ) : null}
                          {correlation ? (
                            <Badge
                              variant="secondary"
                              className="bg-sky-500/10 text-sky-100 hover:bg-sky-500/10"
                            >
                              {correlation.itemCount ?? 0} correlations
                              {averageConfidence
                                ? ` @ ${averageConfidence}`
                                : ""}
                            </Badge>
                          ) : null}
                          {narrative ? (
                            <Badge
                              variant="secondary"
                              className="bg-amber-500/10 text-amber-100 hover:bg-amber-500/10"
                            >
                              {narrative.changedFromPrior
                                ? "Narrative changed"
                                : "Narrative stable"}
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                      {run.errorMessage ? (
                        <p className="text-xs text-amber-300">
                          {run.errorMessage}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => onInspectRun(run.runId)}
                    >
                      Inspect Run
                    </Button>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">
                No historical runs stored for {ticker} yet.
              </p>
            )}
          </CardContent>
        </CollapsiblePanel>
      </CollapsibleRoot>
    </Card>
  );
}
