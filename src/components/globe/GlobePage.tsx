"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNews, type NewsEvent } from "@/hooks/useApiData";
import EventTickerAnalysisPanel from "@/components/globe/EventTickerAnalysis";
import type { EventTickerAnalysis } from "@/types/analysis";
import GlobeVisualization from "@/components/globe/shared/GlobeVisualization";
import EventDetail from "@/components/globe/shared/EventDetail";
import EventsList from "@/components/globe/shared/EventsList";
import {
  type AnalysisState,
  type AnalyzedEventsResponse,
  parseStringArray,
  getAnalyzableTickers,
} from "@/components/globe/shared/globe-utils";

type EventTickerResponse = {
  analyses: EventTickerAnalysis[];
  cached: boolean;
  error?: string;
};

export default function GlobePage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useNews(5, 200);
  const [selectedEvent, setSelectedEvent] = useState<NewsEvent | null>(null);
  const [eventAnalyses, setEventAnalyses] = useState<
    Record<number, EventTickerAnalysis[]>
  >({});
  const [analysisStateByEvent, setAnalysisStateByEvent] = useState<
    Record<number, AnalysisState>
  >({});
  const [analyzedEventIds, setAnalyzedEventIds] = useState<Set<number>>(
    new Set(),
  );
  const [recentAnalyses, setRecentAnalyses] = useState<
    AnalyzedEventsResponse["recentAnalyses"]
  >([]);

  const events = useMemo(() => {
    const raw = data?.events ?? [];
    const seen = new Map<string, NewsEvent>();
    for (const e of raw) {
      const key = `${e.headline.toLowerCase()}|||${e.source ?? ""}`;
      const existing = seen.get(key);
      if (!existing || e.id > existing.id) {
        seen.set(key, e);
      }
    }
    return Array.from(seen.values());
  }, [data]);

  useEffect(() => {
    let active = true;

    const loadAnalyzedEvents = async () => {
      try {
        const response = await fetch(
          "/api/analysis/event-tickers/analyzed-events",
        );
        if (!response.ok) return;
        const payload = (await response.json()) as AnalyzedEventsResponse;
        if (!active) return;
        setAnalyzedEventIds(new Set(payload.analyzedEventIds));
        setRecentAnalyses(payload.recentAnalyses);
      } catch {
        // Non-critical UI enhancement
      }
    };

    const ensureHighImpactAnalyses = async () => {
      try {
        await fetch("/api/analysis/event-tickers/high-impact", {
          method: "POST",
        });
        await loadAnalyzedEvents();
      } catch {
        // Best-effort backfill only
      }
    };

    void loadAnalyzedEvents();
    void ensureHighImpactAnalyses();
    return () => {
      active = false;
    };
  }, []);

  const selectedEventAnalysis = selectedEvent
    ? eventAnalyses[selectedEvent.id]
    : null;
  const selectedAnalysisState: AnalysisState = selectedEvent
    ? (analysisStateByEvent[selectedEvent.id] ?? {
        status: "idle",
        cached: false,
      })
    : { status: "idle", cached: false };

  useEffect(() => {
    if (!selectedEvent) return;

    const tickers = getAnalyzableTickers(selectedEvent);
    if (tickers.length === 0) return;
    if (eventAnalyses[selectedEvent.id]?.length) return;
    if (analysisStateByEvent[selectedEvent.id]?.status === "loading") return;

    const controller = new AbortController();

    const loadCachedAnalysis = async () => {
      try {
        const response = await fetch(
          `/api/analysis/event-tickers?eventId=${selectedEvent.id}`,
          { signal: controller.signal },
        );
        if (!response.ok) return;

        const payload = (await response.json()) as EventTickerResponse;
        if (payload.analyses.length === 0) return;

        setEventAnalyses((current) => ({
          ...current,
          [selectedEvent.id]: payload.analyses,
        }));
        setAnalysisStateByEvent((current) => ({
          ...current,
          [selectedEvent.id]: { status: "done", cached: payload.cached },
        }));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    };

    void loadCachedAnalysis();
    return () => controller.abort();
  }, [analysisStateByEvent, eventAnalyses, selectedEvent]);

  async function handleAnalyzeEvent(event: NewsEvent) {
    const tickers = getAnalyzableTickers(event);
    if (tickers.length === 0) return;

    const sentiment =
      event.sentiment === "bullish" ||
      event.sentiment === "bearish" ||
      event.sentiment === "neutral"
        ? event.sentiment
        : "neutral";

    setAnalysisStateByEvent((current) => ({
      ...current,
      [event.id]: { status: "loading", cached: false },
    }));

    try {
      const response = await fetch("/api/analysis/event-tickers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          tickers,
          eventContext: {
            headline: event.headline,
            summary: event.rawSummary ?? undefined,
            sentiment,
            impactScore: event.impactScore ?? 1,
            eventType: event.eventType ?? undefined,
            sectors: parseStringArray(event.sectors),
          },
        }),
      });

      const payload = (await response.json()) as EventTickerResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Event analysis failed");
      }

      setEventAnalyses((current) => ({
        ...current,
        [event.id]: payload.analyses,
      }));
      setAnalyzedEventIds((current) => new Set(current).add(event.id));
      setRecentAnalyses((current) => {
        const next = [
          {
            eventId: event.id,
            headline: event.headline,
            tickers,
            createdAt: new Date().toISOString(),
          },
          ...current.filter((entry) => entry.eventId !== event.id),
        ];
        return next.slice(0, 5);
      });
      setAnalysisStateByEvent((current) => ({
        ...current,
        [event.id]: { status: "done", cached: payload.cached },
      }));
    } catch (error) {
      setAnalysisStateByEvent((current) => ({
        ...current,
        [event.id]: {
          status: "error",
          cached: false,
          error:
            error instanceof Error ? error.message : "Event analysis failed",
        },
      }));
    }
  }

  const handleReanalyzeEvent = useCallback(
    async (event: NewsEvent) => {
      setEventAnalyses((current) => {
        const next = { ...current };
        delete next[event.id];
        return next;
      });
      setAnalysisStateByEvent((current) => {
        const next = { ...current };
        delete next[event.id];
        return next;
      });
      await handleAnalyzeEvent(event);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleReloadTicker = useCallback(
    async (ticker: string) => {
      if (!selectedEvent) return;
      const event = selectedEvent;
      const sentiment =
        event.sentiment === "bullish" ||
        event.sentiment === "bearish" ||
        event.sentiment === "neutral"
          ? event.sentiment
          : "neutral";
      try {
        const response = await fetch("/api/analysis/event-tickers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: event.id,
            tickers: [ticker],
            force: true,
            eventContext: {
              headline: event.headline,
              summary: event.rawSummary ?? undefined,
              sentiment,
              impactScore: event.impactScore ?? 1,
              eventType: event.eventType ?? undefined,
              sectors: parseStringArray(event.sectors),
            },
          }),
        });
        const payload = (await response.json()) as EventTickerResponse;
        if (!response.ok || !payload.analyses.length) return;
        setEventAnalyses((current) => {
          const existing = current[event.id] ?? [];
          const merged = existing.filter(
            (a) => a.ticker.toUpperCase() !== ticker.toUpperCase(),
          );
          return { ...current, [event.id]: [...merged, ...payload.analyses] };
        });
        await queryClient.invalidateQueries({
          queryKey: ["historicalData", ticker.toUpperCase()],
        });
      } catch {
        // Non-critical � the stale data remains visible
      }
    },
    [queryClient, selectedEvent],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Global News Globe</h1>
        <p className="text-muted-foreground text-sm">
          Geospatial visualization of market-moving events. Click a point to see
          details.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <GlobeVisualization
          events={events}
          isLoading={isLoading}
          analyzedEventIds={analyzedEventIds}
          onEventSelect={setSelectedEvent}
        />

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {selectedEvent ? "Event Details" : "Events Feed"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-135">
              {selectedEvent ? (
                <EventDetail
                  event={selectedEvent}
                  onBack={() => setSelectedEvent(null)}
                  analysisState={selectedAnalysisState}
                  hasAnalysis={Boolean(selectedEventAnalysis?.length)}
                  onAnalyze={handleAnalyzeEvent}
                  onReanalyze={handleReanalyzeEvent}
                  lastAnalyzedAt={
                    recentAnalyses.find((r) => r.eventId === selectedEvent.id)
                      ?.createdAt ?? null
                  }
                />
              ) : (
                <EventsList
                  events={events}
                  onSelect={setSelectedEvent}
                  analyzedEventIds={analyzedEventIds}
                  recentAnalyses={recentAnalyses}
                />
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {selectedEvent &&
        selectedEventAnalysis &&
        selectedEventAnalysis.length > 0 && (
          <EventTickerAnalysisPanel
            analyses={selectedEventAnalysis}
            eventHeadline={selectedEvent.headline}
            onReloadTicker={handleReloadTicker}
          />
        )}

      <div className="flex items-center gap-4 text-xs text-muted-foreground" role="img" aria-label="Impact level color legend">
        <span>Impact:</span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-cyan-400" aria-hidden="true" /> High (8–10)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" aria-hidden="true" /> Medium (6–7)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-indigo-500" aria-hidden="true" /> Low (4–5)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500" aria-hidden="true" /> Minimal (1–3)
        </span>
      </div>
    </div>
  );
}
