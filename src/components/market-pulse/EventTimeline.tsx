"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MarketPulseStateResponse } from "@/app/api/market-pulse/route";

type TickerState = MarketPulseStateResponse["tickers"][number];

export type TimelineItem = {
  id: string;
  time: string;
  level: string;
  title: string;
  detail: string;
  tone: "buyers" | "sellers" | "neutral" | "catalyst";
};

type TimelineFilter = "all" | "candle" | "sequence" | "catalyst";

function toneClasses(tone: TimelineItem["tone"]) {
  if (tone === "buyers")
    return "border-emerald-500/20 bg-emerald-500/5 text-emerald-300";
  if (tone === "sellers")
    return "border-rose-500/20 bg-rose-500/5 text-rose-300";
  if (tone === "catalyst") return "border-sky-500/20 bg-sky-500/5 text-sky-300";
  return "border-zinc-500/20 bg-zinc-500/5 text-zinc-300";
}

function formatTimeLabel(iso: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(date);
}

function normalizeLevelLabel(level: string) {
  if (level === "market_phase") return "market phase";
  return level;
}

function itemMatchesFilter(item: TimelineItem, filter: TimelineFilter) {
  if (filter === "all") return true;
  if (filter === "catalyst") return item.tone === "catalyst";
  return item.level === filter;
}

export function buildTimelineItems(state: TickerState): TimelineItem[] {
  const classificationItems = state.classifications.map((item) => {
    const control = String(item.classification.control ?? "neutral");
    return {
      id: `classification-${item.id}`,
      time: item.candleTime,
      level: item.level,
      title: item.eventBlurb,
      detail: `${control} control · ${item.significance} significance · ${item.tradability}`,
      tone:
        control === "buyers"
          ? "buyers"
          : control === "sellers"
            ? "sellers"
            : "neutral",
    } satisfies TimelineItem;
  });

  const correlationItems = state.correlations.map((item) => {
    return {
      id: `correlation-${item.id}`,
      time: item.candleTime,
      level: item.externalEventType,
      title: item.externalEventSummary,
      detail: `${Math.round(item.correlationConfidence * 100)}% confidence · ${item.sentiment}`,
      tone: "catalyst",
    } satisfies TimelineItem;
  });

  return [...classificationItems, ...correlationItems].sort(
    (left, right) =>
      new Date(right.time).getTime() - new Date(left.time).getTime(),
  );
}

export default function EventTimeline({
  items,
  selectedId,
  onSelect,
}: {
  items: TimelineItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [activeFilter, setActiveFilter] = useState<TimelineFilter>("all");

  const filteredItems = useMemo(
    () => items.filter((item) => itemMatchesFilter(item, activeFilter)),
    [activeFilter, items],
  );

  useEffect(() => {
    if (filteredItems.length === 0) return;
    if (!selectedId || !filteredItems.some((item) => item.id === selectedId)) {
      onSelect(filteredItems[0].id);
    }
  }, [filteredItems, onSelect, selectedId]);

  return (
    <Card size="sm" className="border-border/70 bg-background/70">
      <CardHeader>
        <CardTitle>Event Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "All"],
                ["candle", "Candle"],
                ["sequence", "Sequence"],
                ["catalyst", "Catalyst"],
              ] as const
            ).map(([filterKey, label]) => {
              const isActive = activeFilter === filterKey;
              return (
                <Button
                  key={filterKey}
                  type="button"
                  size="sm"
                  variant={isActive ? "default" : "outline"}
                  onClick={() => setActiveFilter(filterKey)}
                  className="h-8 rounded-full px-3 text-xs"
                >
                  {label}
                </Button>
              );
            })}
          </div>
        ) : null}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Market Pulse events have been stored for this ticker yet.
          </p>
        ) : filteredItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No {activeFilter} events are available for this ticker yet.
          </p>
        ) : (
          filteredItems.map((item) => {
            const selected = item.id === selectedId;
            return (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                onClick={() => onSelect(item.id)}
                className={`h-auto w-full justify-start rounded-xl border p-3 text-left ${toneClasses(item.tone)} ${selected ? "ring-1 ring-primary/50" : ""}`}
              >
                <div className="w-full space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="outline">
                      {normalizeLevelLabel(item.level)}
                    </Badge>
                    <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      {formatTimeLabel(item.time)}
                    </span>
                  </div>
                  <p className="whitespace-normal text-sm font-medium text-foreground">
                    {item.title}
                  </p>
                  <p className="whitespace-normal text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              </Button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
