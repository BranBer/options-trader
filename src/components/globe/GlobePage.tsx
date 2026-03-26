"use client";

import { useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useNews, type NewsEvent } from "@/hooks/useApiData";
import { timeAgo } from "@/lib/utils/formatters";

// Dynamically import Globe to avoid SSR issues with Three.js
const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

function impactColor(score: number): string {
  if (score >= 8) return "#ef4444"; // red
  if (score >= 6) return "#f59e0b"; // amber
  if (score >= 4) return "#3b82f6"; // blue
  return "#6b7280"; // gray
}

export default function GlobePage() {
  const { data, isLoading } = useNews(1, 200);
  const [selectedEvent, setSelectedEvent] = useState<NewsEvent | null>(null);

  const events = data?.events ?? [];

  // Filter events with valid coordinates
  const geoEvents = useMemo(
    () => events.filter((e) => e.lat != null && e.lng != null),
    [events]
  );

  const pointsData = useMemo(
    () =>
      geoEvents.map((e) => ({
        lat: e.lat!,
        lng: e.lng!,
        size: Math.max(0.3, ((e.impactScore ?? 1) / 10) * 1.2),
        color: impactColor(e.impactScore ?? 1),
        event: e,
      })),
    [geoEvents]
  );

  const handlePointClick = useCallback(
    (point: unknown) => {
      const p = point as { event: NewsEvent };
      setSelectedEvent(p.event);
    },
    []
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Global News Globe</h1>
        <p className="text-muted-foreground text-sm">
          Geospatial visualization of market-moving events. Click a point to see details.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Globe */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardContent className="p-0 h-[600px] relative">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Loading globe data...
              </div>
            ) : (
              <Globe
                globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
                backgroundColor="rgba(0,0,0,0)"
                pointsData={pointsData}
                pointLat="lat"
                pointLng="lng"
                pointAltitude={0.01}
                pointRadius="size"
                pointColor="color"
                onPointClick={handlePointClick}
                pointLabel={(d: unknown) => {
                  const p = d as { event: NewsEvent };
                  return `<div style="max-width:200px;font-size:12px;color:#fff">${p.event.headline}</div>`;
                }}
                width={typeof window !== "undefined" ? Math.min(window.innerWidth * 0.6, 800) : 800}
                height={600}
                animateIn
              />
            )}
          </CardContent>
        </Card>

        {/* Sidebar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {selectedEvent ? "Event Details" : "Events Feed"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[540px]">
              {selectedEvent ? (
                <EventDetail event={selectedEvent} onBack={() => setSelectedEvent(null)} />
              ) : (
                <EventsList events={geoEvents} onSelect={setSelectedEvent} />
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>Impact:</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" /> High (8-10)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500" /> Medium (6-7)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" /> Low (4-5)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-500" /> Minimal (1-3)
        </span>
      </div>
    </div>
  );
}

function EventDetail({ event, onBack }: { event: NewsEvent; onBack: () => void }) {
  const sectors = event.sectors ? JSON.parse(event.sectors) as string[] : [];
  const tickers = event.tickers ? JSON.parse(event.tickers) as string[] : [];

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs text-primary hover:underline">
        ← Back to feed
      </button>
      <h3 className="text-sm font-medium leading-tight">{event.headline}</h3>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline">{event.impactScore ?? 0}/10</Badge>
        <Badge
          variant={
            event.sentiment === "bullish"
              ? "default"
              : event.sentiment === "bearish"
              ? "destructive"
              : "secondary"
          }
        >
          {event.sentiment}
        </Badge>
        {event.eventType && <Badge variant="outline">{event.eventType}</Badge>}
      </div>

      {sectors.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Sectors</p>
          <div className="flex flex-wrap gap-1">
            {sectors.map((s) => (
              <Badge key={s} variant="outline" className="text-xs">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {tickers.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Tickers</p>
          <div className="flex flex-wrap gap-1">
            {tickers.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs font-mono">
                {t}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {event.rawSummary && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Summary</p>
          <p className="text-sm">{event.rawSummary}</p>
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-0.5">
        {event.source && <p>Source: {event.source}</p>}
        {event.countryCode && <p>Country: {event.countryCode}</p>}
        {event.publishedAt && <p>Published: {timeAgo(event.publishedAt)}</p>}
        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Read original →
          </a>
        )}
      </div>
    </div>
  );
}

function EventsList({
  events,
  onSelect,
}: {
  events: NewsEvent[];
  onSelect: (e: NewsEvent) => void;
}) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No geo-located events yet. Run a pipeline refresh.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {events.slice(0, 30).map((e) => (
        <button
          key={e.id}
          onClick={() => onSelect(e)}
          className="w-full text-left p-2 rounded hover:bg-muted/50 transition-colors"
        >
          <p className="text-sm leading-tight line-clamp-2">{e.headline}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: impactColor(e.impactScore ?? 1) }}
            />
            <span>{e.impactScore ?? 0}/10</span>
            {e.countryCode && <span>{e.countryCode}</span>}
            {e.publishedAt && <span>{timeAgo(e.publishedAt)}</span>}
          </div>
        </button>
      ))}
    </div>
  );
}
