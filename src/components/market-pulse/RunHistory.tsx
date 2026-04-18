"use client";

import { History, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMarketPulseRuns } from "@/hooks/useMarketPulse";

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

export default function RunHistory({
  ticker,
  onInspectRun,
}: {
  ticker: string;
  onInspectRun: (runId: string) => void;
}) {
  const { data, isLoading, error } = useMarketPulseRuns(ticker, 6);

  return (
    <Card size="sm" className="border-border/70 bg-background/70">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <History className="h-4 w-4" />
          Recent Runs
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
          data.runs.map((run) => (
            <div
              key={run.runId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-3"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={statusTone(run.status)}>
                    {run.status}
                  </Badge>
                  <Badge variant="outline">{run.trigger}</Badge>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>{formatDate(run.completedAt ?? run.startedAt)}</span>
                  <span>{formatDuration(run.durationMs)}</span>
                  <span>{run.llmTokensUsed ?? 0} tokens</span>
                </div>
                {run.errorMessage ? (
                  <p className="text-xs text-amber-300">{run.errorMessage}</p>
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
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No historical runs stored for {ticker} yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
