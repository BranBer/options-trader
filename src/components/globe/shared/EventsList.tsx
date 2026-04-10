"use client";

import { Separator } from "@/components/ui/separator";
import type { NewsEvent } from "@/hooks/useApiData";
import { timeAgo } from "@/lib/utils/formatters";
import { impactColor, type AnalyzedEventsResponse } from "./globe-utils";

export default function EventsList({
  events,
  onSelect,
  analyzedEventIds,
  recentAnalyses,
  emptyMessage = "No high-impact events yet. Run a pipeline refresh.",
}: {
  events: NewsEvent[];
  onSelect: (e: NewsEvent) => void;
  analyzedEventIds: Set<number>;
  recentAnalyses: AnalyzedEventsResponse["recentAnalyses"];
  emptyMessage?: string;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-2 pr-3">
      {events.slice(0, 30).map((e) => (
        <button
          key={e.id}
          onClick={() => onSelect(e)}
          className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors"
          aria-label={`View event details: ${e.headline}`}
        >
          <p className="text-sm leading-tight line-clamp-2">{e.headline}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span
              aria-hidden="true"
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                backgroundColor: analyzedEventIds.has(e.id)
                  ? "#f59e0b"
                  : impactColor(e.impactScore ?? 1),
              }}
            />
            <span>{e.impactScore ?? 0}/10</span>
            {analyzedEventIds.has(e.id) && <span>Analyzed</span>}
            {e.countryCode && <span>{e.countryCode}</span>}
            {e.publishedAt && (
              <span suppressHydrationWarning>{timeAgo(e.publishedAt)}</span>
            )}
          </div>
        </button>
      ))}
      {recentAnalyses.length > 0 && (
        <div className="pt-3">
          <Separator />
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent Analyses
            </p>
            {recentAnalyses.map((entry) => (
              <button
                key={entry.eventId}
                onClick={() => {
                  const event = events.find(
                    (candidate) => candidate.id === entry.eventId,
                  );
                  if (event) onSelect(event);
                }}
                className="w-full rounded-md border p-2 text-left text-xs hover:bg-muted/50"
              >
                <div className="font-medium line-clamp-2">{entry.headline}</div>
                <div className="mt-1 text-muted-foreground">
                  {entry.tickers.join(", ")}
                  {entry.createdAt ? ` · ${timeAgo(entry.createdAt)}` : ""}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
