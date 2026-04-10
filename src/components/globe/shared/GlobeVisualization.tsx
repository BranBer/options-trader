"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { NewsEvent } from "@/hooks/useApiData";
import {
  clusterKey as makeClusterKey,
  getEventCoordinates,
  impactColor,
  packCircles,
  type GlobePoint,
} from "./globe-utils";

interface GlobeVisualizationProps {
  events: NewsEvent[];
  isLoading: boolean;
  analyzedEventIds: Set<number>;
  onEventSelect: (event: NewsEvent) => void;
  /** Override the point color function for custom themes. Defaults to general impact colors. */
  colorFn?: (score: number) => string;
}

export default function GlobeVisualization({
  events,
  isLoading,
  analyzedEventIds,
  onEventSelect,
  colorFn = impactColor,
}: GlobeVisualizationProps) {
  const [globeReady, setGlobeReady] = useState(false);
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(
    new Set(),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const globeInstanceRef = useRef<any>(null);
  // Keep onEventSelect current without triggering globe re-init
  const onEventSelectRef = useRef(onEventSelect);
  onEventSelectRef.current = onEventSelect;

  const pointsData = useMemo((): GlobePoint[] => {
    type Entry = { event: NewsEvent; coords: { lat: number; lng: number } };
    const rawGroups = new Map<string, Entry[]>();

    for (const e of events) {
      const coords = getEventCoordinates(e);
      if (!coords) continue;
      const key = makeClusterKey(e, coords);
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
          size:
            Math.max(0.45, ((event.impactScore ?? 1) / 10) * 1.5) +
            (analyzedEventIds.has(event.id) ? 0.15 : 0),
          color: analyzedEventIds.has(event.id)
            ? "#f59e0b"
            : colorFn(event.impactScore ?? 1),
          isCluster: false as const,
          clusterKey: key,
          clustered: false,
          event,
        });
      } else if (collapsedClusters.has(key)) {
        const maxImpact = Math.max(
          ...entries.map((x) => x.event.impactScore ?? 1),
        );
        const hasAnalyzedEvent = entries.some((entry) =>
          analyzedEventIds.has(entry.event.id),
        );
        points.push({
          lat: centLat,
          lng: centLng,
          size: Math.max(0.8, 0.4 + N * 0.15) + (hasAnalyzedEvent ? 0.15 : 0),
          color: hasAnalyzedEvent ? "#f59e0b" : colorFn(maxImpact),
          isCluster: true as const,
          clusterKey: key,
          count: N,
          topEvents: entries.slice(0, 3).map((x) => x.event),
        });
      } else {
        const sorted = [...entries].sort(
          (a, b) => (b.event.impactScore ?? 1) - (a.event.impactScore ?? 1),
        );
        const radii = sorted.map((x) =>
          Math.max(0.45, ((x.event.impactScore ?? 1) / 10) * 1.5),
        );
        const packed = packCircles(radii);
        const cosLat = Math.cos((centLat * Math.PI) / 180);
        sorted.forEach(({ event }, i) => {
          const isAnalyzed = analyzedEventIds.has(event.id);
          points.push({
            lat: centLat + packed[i].y,
            lng: centLng + packed[i].x / cosLat,
            size: radii[i] + (isAnalyzed ? 0.15 : 0),
            color: isAnalyzed ? "#f59e0b" : colorFn(event.impactScore ?? 1),
            isCluster: false as const,
            clusterKey: key,
            clustered: true,
            event,
          });
        });
      }
    }

    return points;
  }, [analyzedEventIds, events, collapsedClusters, colorFn]);

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

      instance = new Globe(el, { animateIn: true })
        .width(el.clientWidth)
        .height(el.clientHeight)
        .backgroundColor("rgba(0,0,0,0)")
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
        .polygonsData(
          geoData.features.filter((d) => d.properties.ISO_A2 !== "AQ"),
        )
        .polygonGeoJsonGeometry("geometry" as const)
        .polygonCapColor(() => "rgba(15, 23, 42, 0.55)")
        .polygonSideColor(() => "rgba(15, 23, 42, 0.2)")
        .polygonStrokeColor(() => "#38bdf8")
        .polygonAltitude(0.01)
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
              onEventSelectRef.current(p.event);
            }
          }
        })
        .pointOfView({ lat: 20, lng: 0, altitude: 2.5 });

      globeInstanceRef.current = instance;

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
  );
}
