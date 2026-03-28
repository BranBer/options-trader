"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useNews, type NewsEvent } from "@/hooks/useApiData";
import { timeAgo } from "@/lib/utils/formatters";

function impactColor(score: number): string {
  if (score >= 8) return "#22d3ee";
  if (score >= 6) return "#3b82f6";
  if (score >= 4) return "#6366f1";
  return "#8b5cf6";
}

const COUNTRY_COORDS: Record<string, [number, number]> = {
  US: [39.8283, -98.5795],
  GB: [55.3781, -3.436],
  DE: [51.1657, 10.4515],
  FR: [46.2276, 2.2137],
  CN: [35.8617, 104.1954],
  JP: [36.2048, 138.2529],
  IN: [20.5937, 78.9629],
  RU: [61.524, 105.3188],
  BR: [-14.235, -51.9253],
  AU: [-25.2744, 133.7751],
  CA: [56.1304, -106.3468],
  KR: [35.9078, 127.7669],
  TW: [23.6978, 120.9605],
  IL: [31.0461, 34.8516],
  UA: [48.3794, 31.1656],
  IR: [32.4279, 53.688],
  MX: [23.6345, -102.5528],
  SG: [1.3521, 103.8198],
  SA: [23.8859, 45.0792],
};

function getEventCoordinates(
  event: NewsEvent,
): { lat: number; lng: number } | null {
  if (event.lat != null && event.lng != null) {
    return { lat: event.lat, lng: event.lng };
  }
  if (!event.countryCode) return null;
  const key = event.countryCode.toUpperCase().slice(0, 2);
  const coords = COUNTRY_COORDS[key];
  if (!coords) return null;
  return { lat: coords[0], lng: coords[1] };
}

function parseStringArray(input: string | null | undefined): string[] {
  if (!input) return [];
  try {
    const parsed = JSON.parse(input) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value) => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

type ClusterPoint = {
  lat: number;
  lng: number;
  size: number;
  color: string;
  isCluster: true;
  clusterKey: string;
  count: number;
  topEvents: NewsEvent[];
};

type EventPoint = {
  lat: number;
  lng: number;
  size: number;
  color: string;
  isCluster: false;
  clusterKey: string;
  clustered: boolean;
  event: NewsEvent;
};

type GlobePoint = ClusterPoint | EventPoint;

function clusterKey(
  event: NewsEvent,
  coords: { lat: number; lng: number },
): string {
  const cc = event.countryCode?.toUpperCase().slice(0, 2);
  return cc ?? `${coords.lat.toFixed(0)},${coords.lng.toFixed(0)}`;
}

/**
 * Packs N circles of given radii tightly together using sequential
 * tangent-placement. Returns (x, y) offsets in degree units, centered
 * around (0, 0) so placement sits symmetrically over the geographic centroid.
 */
function packCircles(radii: number[]): Array<{ x: number; y: number }> {
  const N = radii.length;
  if (N === 0) return [];
  type Placed = { x: number; y: number; r: number };
  const GAP = 0.08;
  const placed: Placed[] = [{ x: 0, y: 0, r: radii[0] }];
  if (N === 1) return [{ x: 0, y: 0 }];
  placed.push({ x: radii[0] + radii[1] + GAP, y: 0, r: radii[1] });
  for (let i = 2; i < N; i++) {
    const r = radii[i];
    let bestPos: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    const curBound = placed.reduce(
      (m, p) => Math.max(m, Math.sqrt(p.x * p.x + p.y * p.y) + p.r),
      0,
    );
    for (let a = 0; a < placed.length; a++) {
      for (let b = a + 1; b < placed.length; b++) {
        const pa = placed[a];
        const pb = placed[b];
        const dA = pa.r + r + GAP;
        const dB = pb.r + r + GAP;
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > dA + dB + 0.001 || d < Math.abs(dA - dB) - 0.001) continue;
        const aCoef = (dA * dA - dB * dB + d * d) / (2 * d);
        const hSq = dA * dA - aCoef * aCoef;
        if (hSq < 0) continue;
        const h = Math.sqrt(hSq);
        const mx = pa.x + (aCoef * dx) / d;
        const my = pa.y + (aCoef * dy) / d;
        for (const sign of [1, -1] as const) {
          const cx = mx + (sign * h * dy) / d;
          const cy = my - (sign * h * dx) / d;
          const overlaps = placed.some(
            (p) =>
              Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2) <
              p.r + r + GAP - 0.001,
          );
          if (overlaps) continue;
          const score = Math.max(curBound, Math.sqrt(cx * cx + cy * cy) + r);
          if (score < bestScore) {
            bestScore = score;
            bestPos = { x: cx, y: cy };
          }
        }
      }
    }
    if (!bestPos) {
      // Fallback: golden-angle spiral
      const angle = i * 2.39996;
      const rad = (placed[0].r + r + GAP) * (1 + Math.sqrt(i));
      bestPos = { x: rad * Math.cos(angle), y: rad * Math.sin(angle) };
    }
    placed.push({ x: bestPos.x, y: bestPos.y, r });
  }
  // Re-center so the geographic centroid is at the visual middle of the pack
  const meanX = placed.reduce((s, p) => s + p.x, 0) / placed.length;
  const meanY = placed.reduce((s, p) => s + p.y, 0) / placed.length;
  return placed.map(({ x, y }) => ({ x: x - meanX, y: y - meanY }));
}

export default function GlobePage() {
  const { data, isLoading } = useNews(5, 200);
  const [selectedEvent, setSelectedEvent] = useState<NewsEvent | null>(null);
  const [globeReady, setGlobeReady] = useState(false);
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(
    new Set(),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeInstanceRef = useRef<any>(null);

  const events = useMemo(() => {
    const raw = data?.events ?? [];
    // Deduplicate: same headline (case-insensitive) + same source → keep newest (highest id)
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

  const pointsData = useMemo((): GlobePoint[] => {
    type Entry = { event: NewsEvent; coords: { lat: number; lng: number } };
    const rawGroups = new Map<string, Entry[]>();

    for (const e of events) {
      const coords = getEventCoordinates(e);
      if (!coords) continue;
      const key = clusterKey(e, coords);
      const arr = rawGroups.get(key);
      if (arr) {
        arr.push({ event: e, coords });
      } else {
        rawGroups.set(key, [{ event: e, coords }]);
      }
    }

    const points: GlobePoint[] = [];

    for (const [key, entries] of rawGroups) {
      const N = entries.length;
      const centLat = entries.reduce((s, x) => s + x.coords.lat, 0) / N;
      const centLng = entries.reduce((s, x) => s + x.coords.lng, 0) / N;

      if (N === 1) {
        const { event, coords } = entries[0];
        points.push({
          lat: coords.lat,
          lng: coords.lng,
          size: Math.max(0.45, ((event.impactScore ?? 1) / 10) * 1.5),
          color: impactColor(event.impactScore ?? 1),
          isCluster: false as const,
          clusterKey: key,
          clustered: false,
          event,
        });
      } else if (collapsedClusters.has(key)) {
        const maxImpact = Math.max(
          ...entries.map((x) => x.event.impactScore ?? 1),
        );
        points.push({
          lat: centLat,
          lng: centLng,
          size: Math.max(0.8, 0.4 + N * 0.15),
          color: impactColor(maxImpact),
          isCluster: true as const,
          clusterKey: key,
          count: N,
          topEvents: entries.slice(0, 3).map((x) => x.event),
        });
      } else {
        // Expanded: largest circles first for tighter packing
        const sorted = [...entries].sort(
          (a, b) => (b.event.impactScore ?? 1) - (a.event.impactScore ?? 1),
        );
        const radii = sorted.map((x) =>
          Math.max(0.45, ((x.event.impactScore ?? 1) / 10) * 1.5),
        );
        const packed = packCircles(radii);
        const cosLat = Math.cos((centLat * Math.PI) / 180);
        sorted.forEach(({ event }, i) => {
          points.push({
            lat: centLat + packed[i].y,
            lng: centLng + packed[i].x / cosLat,
            size: radii[i],
            color: impactColor(event.impactScore ?? 1),
            isCluster: false as const,
            clusterKey: key,
            clustered: true,
            event,
          });
        });
      }
    }

    return points;
  }, [events, collapsedClusters]);

  // Single init: fetch GeoJSON + globe.gl in parallel, then construct
  // globe with polygon data + style in ONE chain (official example pattern).
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let instance: any = null;
    let cancelled = false;

    let lastClick: { key: string; time: number } | null = null;

    const init = async () => {
      const [{ default: Globe }, THREE, geoRes] = await Promise.all([
        import("globe.gl"),
        import("three"),
        fetch("/ne_110m_admin_0_countries.geojson"),
      ]);
      if (cancelled) return;

      if (!geoRes.ok) {
        console.error("GeoJSON fetch failed:", geoRes.status);
        return;
      }

      const geoData = (await geoRes.json()) as {
        features: Array<{ properties: { ISO_A2: string } }>;
      };
      if (cancelled) return;

      // Build globe in ONE chain with polygon data + style together.
      instance = new Globe(el, { animateIn: true })
        // Explicit container size (prevents window-sized canvas / off-center)
        .width(el.clientWidth)
        .height(el.clientHeight)
        .backgroundColor("rgba(0,0,0,0)")

        // Dark navy sphere, no texture
        .showGraticules(true)
        .atmosphereColor("#1d4ed8")
        .atmosphereAltitude(0.15)
        .globeMaterial(
          new THREE.MeshPhongMaterial({
            color: "#0a1628",
            shininess: 6,
            transparent: true,
            opacity: 0.97,
          }),
        )

        // Country polygons: data + style in one chain
        .polygonsData(
          geoData.features.filter((d) => d.properties.ISO_A2 !== "AQ"),
        )
        .polygonGeoJsonGeometry("geometry" as const)
        .polygonCapColor(() => "rgba(15, 23, 42, 0.55)")
        .polygonSideColor(() => "rgba(15, 23, 42, 0.2)")
        .polygonStrokeColor(() => "#38bdf8")
        .polygonAltitude(0.01)

        // Point accessors
        .pointLat("lat")
        .pointLng("lng")
        .pointAltitude(0.02)
        .pointRadius("size")
        .pointColor("color")
        .pointLabel((d: unknown) => {
          const p = d as GlobePoint;
          if (p.isCluster) {
            const headlines = p.topEvents
              .map(
                (e) =>
                  `<div style="margin-top:4px;font-size:11px;color:#94a3b8">${e.headline}</div>`,
              )
              .join("");
            return [
              '<div style="max-width:260px;font-size:12px;color:#f1f5f9;',
              "background:rgba(10,22,40,0.95);padding:8px 10px;",
              'border-radius:6px;border:1px solid rgba(56,189,248,0.35);line-height:1.6">',
              `<div style="font-weight:600;color:#38bdf8">${p.count} events \u00b7 ${p.clusterKey}</div>`,
              '<div style="font-size:11px;color:#94a3b8;margin-top:2px">click to expand</div>',
              headlines,
              "</div>",
            ].join("");
          }
          const e = p.event;
          const sentiment = e.sentiment ?? "neutral";
          const sentimentColor =
            sentiment === "bullish"
              ? "#22c55e"
              : sentiment === "bearish"
                ? "#ef4444"
                : "#94a3b8";
          return [
            '<div style="max-width:240px;font-size:12px;color:#f1f5f9;',
            "background:rgba(10,22,40,0.95);padding:8px 10px;",
            'border-radius:6px;border:1px solid rgba(56,189,248,0.35);line-height:1.6">',
            `<div style="font-weight:600;margin-bottom:4px">${e.headline}</div>`,
            '<div style="display:flex;gap:8px;font-size:11px">',
            `<span style="color:#38bdf8">Impact ${e.impactScore ?? 0}/10</span>`,
            `<span style="color:${sentimentColor}">${sentiment}</span>`,
            e.countryCode
              ? `<span style="color:#94a3b8">${e.countryCode}</span>`
              : "",
            "</div>",
            p.clustered
              ? '<div style="font-size:11px;color:#94a3b8;margin-top:2px">double-click to collapse cluster</div>'
              : "",
            "</div>",
          ].join("");
        })
        .onPointClick((point: unknown) => {
          const p = point as GlobePoint;
          if (p.isCluster) {
            setCollapsedClusters((prev) => {
              const next = new Set(prev);
              next.delete(p.clusterKey);
              return next;
            });
          } else {
            const now = Date.now();
            if (
              p.clustered &&
              lastClick?.key === p.clusterKey &&
              now - lastClick.time < 300
            ) {
              lastClick = null;
              setCollapsedClusters((prev) => new Set(prev).add(p.clusterKey));
            } else {
              lastClick = p.clustered ? { key: p.clusterKey, time: now } : null;
              setSelectedEvent(p.event);
            }
          }
        })

        // Initial camera centered on Atlantic
        .pointOfView({ lat: 20, lng: 0, altitude: 2.5 });

      globeInstanceRef.current = instance;

      // Zoom limits, damping, slow auto-rotation
      const ctrl = instance.controls();
      if (ctrl) {
        ctrl.minDistance = 150;
        ctrl.maxDistance = 500;
        ctrl.enableDamping = true;
        ctrl.dampingFactor = 0.1;
      }

      setGlobeReady(true);
    };

    void init();

    return () => {
      cancelled = true;
      instance?._destructor?.();
      globeInstanceRef.current = null;
    };
  }, []);

  // Sync news markers when data changes
  useEffect(() => {
    if (!globeReady || !globeInstanceRef.current) return;
    globeInstanceRef.current.pointsData(pointsData);
  }, [globeReady, pointsData]);

  // Keep globe filling its container on resize
  useEffect(() => {
    if (!containerRef.current || !globeInstanceRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      globeInstanceRef.current?.width(width).height(height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [globeReady]);

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
        {/* Globe */}
        <Card className="lg:col-span-2 overflow-hidden">
          <CardContent className="p-0 h-150 relative">
            {isLoading && (
              <div
                className="absolute inset-0 flex items-center justify-center text-muted-foreground z-10 pointer-events-none"
                role="status"
                aria-live="polite"
              >
                Loading globe data...
              </div>
            )}
            <div ref={containerRef} className="w-full h-full" />
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
            <ScrollArea className="h-135">
              {selectedEvent ? (
                <EventDetail
                  event={selectedEvent}
                  onBack={() => setSelectedEvent(null)}
                />
              ) : (
                <EventsList events={events} onSelect={setSelectedEvent} />
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>Impact:</span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-cyan-400" /> High (8-10)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" /> Medium (6-7)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-indigo-500" /> Low (4-5)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-violet-500" /> Minimal (1-3)
        </span>
      </div>
    </div>
  );
}

function EventDetail({
  event,
  onBack,
}: {
  event: NewsEvent;
  onBack: () => void;
}) {
  const sectors = parseStringArray(event.sectors);
  const tickers = parseStringArray(event.tickers);

  return (
    <div className="space-y-3 pr-3">
      <button
        onClick={onBack}
        className="text-xs text-primary hover:underline"
        aria-label="Back to events feed"
      >
        &larr; Back to feed
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
        {event.publishedAt && (
          <p suppressHydrationWarning>
            Published: {timeAgo(event.publishedAt)}
          </p>
        )}
        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
            aria-label="Read original article in a new tab"
          >
            Read original &rarr;
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
        No high-impact events yet. Run a pipeline refresh.
      </p>
    );
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
              style={{ backgroundColor: impactColor(e.impactScore ?? 1) }}
            />
            <span>{e.impactScore ?? 0}/10</span>
            {e.countryCode && <span>{e.countryCode}</span>}
            {e.publishedAt && (
              <span suppressHydrationWarning>{timeAgo(e.publishedAt)}</span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
