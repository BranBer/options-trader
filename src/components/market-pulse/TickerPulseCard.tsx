"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, RefreshCw, Trash2 } from "lucide-react";
import PriceChart, { type TriggerMarker } from "@/components/charts/PriceChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import EventTimeline, {
  buildTimelineItems,
} from "@/components/market-pulse/EventTimeline";
import NarrativePanel from "@/components/market-pulse/NarrativePanel";
import InspectorDrawer from "@/components/market-pulse/InspectorDrawer";
import RunHistory from "@/components/market-pulse/RunHistory";
import type { MarketPulseApiTickerState } from "@/app/api/market-pulse/route";

type TickerState = MarketPulseApiTickerState;

function statusTone(status: TickerState["status"]) {
  if (status === "success") return "border-emerald-500/30 text-emerald-400";
  if (status === "partial") return "border-amber-500/30 text-amber-400";
  if (status === "error") return "border-rose-500/30 text-rose-400";
  if (status === "running") return "border-sky-500/30 text-sky-400";
  return "border-zinc-500/30 text-zinc-300";
}

function controlToDirection(control: unknown): TriggerMarker["direction"] {
  return control === "buyers"
    ? "bullish"
    : control === "sellers"
      ? "bearish"
      : "neutral";
}

function formatDateTime(value: string | null) {
  if (!value) return "Waiting for first run";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCountdown(msRemaining: number) {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

export default function TickerPulseCard({
  state,
  onRemove,
  onRefresh,
  removing,
  refreshing,
}: {
  state: TickerState;
  onRemove: (ticker: string) => void;
  onRefresh: (ticker: string) => void;
  removing: boolean;
  refreshing: boolean;
}) {
  const timelineItems = useMemo(() => buildTimelineItems(state), [state]);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTarget, setInspectorTarget] = useState<
    | { type: "classification"; label: string; runId: string; rowId: number }
    | { type: "correlation"; label: string; runId: string; rowId: number }
    | { type: "narrative"; label: string; runId: string }
    | { type: "run"; label: string; runId: string }
    | null
  >(null);
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(
    timelineItems[0]?.id ?? null,
  );

  useEffect(() => {
    setSelectedTimelineId((current) =>
      current && timelineItems.some((item) => item.id === current)
        ? current
        : (timelineItems[0]?.id ?? null),
    );
  }, [timelineItems]);

  useEffect(() => {
    const needsLiveClock =
      refreshing || state.status === "running" || state.nextRunAt != null;
    if (!needsLiveClock) return;

    const intervalId = window.setInterval(() => {
      setClockNow(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [refreshing, state.nextRunAt, state.status]);

  const triggerMarkers = useMemo<TriggerMarker[]>(
    () =>
      state.classifications.map((item) => ({
        time: Math.floor(new Date(item.candleTime).getTime() / 1000),
        direction: controlToDirection(item.classification.control),
        type: item.level,
        level:
          state.candles.find(
            (candle) =>
              candle.time ===
              Math.floor(new Date(item.candleTime).getTime() / 1000),
          )?.close ?? 0,
        text: item.eventBlurb,
        primary: item.significance === "high",
      })),
    [state],
  );

  const selectedItem =
    timelineItems.find((item) => item.id === selectedTimelineId) ?? null;
  const selectedClassification = selectedItem?.id.startsWith("classification-")
    ? (state.classifications.find(
        (item) => `classification-${item.id}` === selectedItem.id,
      ) ?? null)
    : null;
  const selectedCorrelation = selectedItem?.id.startsWith("correlation-")
    ? (state.correlations.find(
        (item) => `correlation-${item.id}` === selectedItem.id,
      ) ?? null)
    : null;
  const isBusy = refreshing || state.status === "running";
  const nextRefreshLabel = useMemo(() => {
    if (isBusy) return "Refresh in progress";
    if (!state.nextRunAt) return "Awaiting next cycle";

    const nextRunMs = new Date(state.nextRunAt).getTime();
    if (Number.isNaN(nextRunMs)) return "Awaiting next cycle";

    const remainingMs = nextRunMs - clockNow;
    if (remainingMs <= 0) return "Due now";
    return formatCountdown(remainingMs);
  }, [clockNow, isBusy, state.nextRunAt]);

  return (
    <>
      <Card className="relative overflow-visible border-border/70 bg-card/80 shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
        <CardHeader className="gap-4 border-b border-border/60 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl tracking-tight">
                  {state.ticker}
                </CardTitle>
                <Badge variant="outline" className={statusTone(state.status)}>
                  {state.status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>Updated {formatDateTime(state.lastRunAt)}</span>
                <span>Next refresh in {nextRefreshLabel}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={refreshing || state.status === "running"}
                onClick={() => onRefresh(state.ticker)}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={removing}
                onClick={() => onRemove(state.ticker)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {isBusy ? (
            <div className="rounded-xl border border-sky-500/20 bg-sky-500/6 px-3 py-2 text-xs font-medium text-sky-100">
              {refreshing
                ? `Manual refresh queued for ${state.ticker}.`
                : `${state.ticker} is processing the latest Market Pulse cycle.`}
            </div>
          ) : null}
          {selectedItem ? (
            <div className="rounded-xl border border-border/70 bg-background/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                    Focused Event
                  </p>
                  <p className="mt-2 text-sm font-medium text-foreground">
                    {selectedItem.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedItem.detail}
                  </p>
                </div>
                {(selectedClassification || selectedCorrelation) &&
                state.lastRunId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setInspectorTarget(
                        selectedClassification
                          ? {
                              type: "classification",
                              label: `${state.ticker} classification`,
                              runId: state.lastRunId!,
                              rowId: selectedClassification.id,
                            }
                          : {
                              type: "correlation",
                              label: `${state.ticker} correlation`,
                              runId: state.lastRunId!,
                              rowId: selectedCorrelation!.id,
                            },
                      );
                      setInspectorOpen(true);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Inspect
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-[#07111b] p-3">
                {state.candles.length > 0 ? (
                  <div className="relative">
                    <PriceChart
                      candles={state.candles}
                      height={360}
                      timeframe="1d"
                      triggerMarkers={triggerMarkers}
                    />
                    {isBusy ? (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-[#07111b]/66 backdrop-blur-[1px]">
                        <div className="rounded-full border border-sky-500/30 bg-slate-950/80 px-4 py-2 text-xs font-medium tracking-[0.16em] text-sky-100 uppercase">
                          Refresh in progress
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex h-90 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
                    Waiting for the first candle window to be classified.
                  </div>
                )}
              </div>
              <div className="space-y-4 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)] xl:gap-4 xl:space-y-0">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          Narrative
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Rolling synthesis for the current run.
                        </p>
                      </div>
                      {state.narrative && state.lastRunId ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setInspectorTarget({
                              type: "narrative",
                              label: `${state.ticker} narrative`,
                              runId: state.lastRunId!,
                            });
                            setInspectorOpen(true);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Inspect
                        </Button>
                      ) : null}
                    </div>
                    <NarrativePanel narrative={state.narrative} />
                  </div>
                  <RunHistory
                    ticker={state.ticker}
                    onInspectRun={(runId) => {
                      setInspectorTarget({
                        type: "run",
                        label: `${state.ticker} run ${runId.slice(0, 8)}`,
                        runId,
                      });
                      setInspectorOpen(true);
                    }}
                  />
                </div>
                <EventTimeline
                  items={timelineItems}
                  selectedId={selectedTimelineId}
                  onSelect={setSelectedTimelineId}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <InspectorDrawer
        target={inspectorTarget}
        open={inspectorOpen}
        onOpenChange={setInspectorOpen}
      />
    </>
  );
}
