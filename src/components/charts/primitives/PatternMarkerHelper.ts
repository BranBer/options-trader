import type { Time, ISeriesApi, SeriesType } from "lightweight-charts";
import { createSeriesMarkers } from "lightweight-charts";
import type { TechnicalPattern } from "@/types/analysis";
import { TrendlinePrimitive } from "./TrendlinePrimitive";
import { HighlightRegionPrimitive } from "./HighlightRegionPrimitive";

const TYPE_COLORS: Record<string, string> = {
  bullish: "rgb(34, 197, 94)",
  bearish: "rgb(239, 68, 68)",
  neutral: "rgb(245, 158, 11)",
};

export interface AttachedOverlays {
  trendlines: TrendlinePrimitive[];
  regions: HighlightRegionPrimitive[];
}

/**
 * Normalize a date string to YYYY-MM-DD for matching.
 * Handles ISO 8601, "March 15, 2025", "2025/03/15", etc.
 */
function normalizeDate(raw: string): string {
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // Try parsing
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return raw; // fallback — return as-is
}

/**
 * Find the closest candle time to a target time string.
 * Returns the matched candle time (as-is from the set), or null.
 */
function findClosestCandleTime(
  target: string,
  candleTimesArr: string[],
): string | null {
  const normalized = normalizeDate(target);

  // Exact match first (already normalized)
  for (const ct of candleTimesArr) {
    if (ct === normalized || normalizeDate(ct) === normalized) return ct;
  }

  // Fuzzy: find closest date by absolute distance
  const targetMs = new Date(normalized).getTime();
  if (isNaN(targetMs)) return null;

  let best: string | null = null;
  let bestDist = Infinity;
  for (const ct of candleTimesArr) {
    const ctMs = new Date(normalizeDate(ct)).getTime();
    if (isNaN(ctMs)) continue;
    const dist = Math.abs(ctMs - targetMs);
    if (dist < bestDist) {
      bestDist = dist;
      best = ct;
    }
  }

  // Only accept if within 3 days
  if (best && bestDist <= 3 * 86400000) return best;
  return null;
}

/**
 * Converts TechnicalPattern[] into chart primitives and markers.
 * Attach trendlines/regions via `series.attachPrimitive()`.
 * Returns references so they can be detached later.
 */
export function createPatternOverlays(
  patterns: TechnicalPattern[],
  series: ISeriesApi<SeriesType, Time>,
  candleTimeMap: Map<string, Time>,
): AttachedOverlays {
  const trendlines: TrendlinePrimitive[] = [];
  const regions: HighlightRegionPrimitive[] = [];
  const markers: Array<{
    time: Time;
    position: "aboveBar" | "belowBar";
    color: string;
    shape: "arrowUp" | "arrowDown" | "circle";
    text: string;
    id: string;
  }> = [];

  const candleTimesArr = Array.from(candleTimeMap.keys()).sort();

  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i];
    const color = TYPE_COLORS[p.type] ?? TYPE_COLORS.neutral;
    const id = `pattern-${i}`;

    const drawType = p.drawing_type ?? null;
    const hasCoords =
      p.start_time &&
      p.end_time &&
      p.start_price != null &&
      p.end_price != null;

    if (!hasCoords || drawType === "none") {
      // No coordinates — create marker at best-effort time
      let markerKey: string | null = null;
      if (p.start_time) {
        markerKey = findClosestCandleTime(p.start_time, candleTimesArr);
      }
      // Fallback: place marker at recent candle (75% through the data — right-ish side)
      if (!markerKey && candleTimesArr.length > 0) {
        const fallbackIdx = Math.min(
          Math.floor(candleTimesArr.length * 0.75),
          candleTimesArr.length - 1,
        );
        markerKey = candleTimesArr[fallbackIdx];
      }
      if (markerKey) {
        const resolvedTime = candleTimeMap.get(markerKey);
        if (resolvedTime != null) {
          markers.push({
            time: resolvedTime,
            position: p.type === "bearish" ? "aboveBar" : "belowBar",
            color,
            shape:
              p.type === "bullish"
                ? "arrowUp"
                : p.type === "bearish"
                  ? "arrowDown"
                  : "circle",
            text: p.name,
            id,
          });
        }
      }
      continue;
    }

    // Resolve times with fuzzy matching
    const resolvedStartKey = findClosestCandleTime(
      p.start_time!,
      candleTimesArr,
    );
    const resolvedEndKey = findClosestCandleTime(p.end_time!, candleTimesArr);
    if (!resolvedStartKey && !resolvedEndKey) {
      continue;
    }

    const startTime = candleTimeMap.get(resolvedStartKey ?? resolvedEndKey!)!;
    const endTime = candleTimeMap.get(resolvedEndKey ?? resolvedStartKey!)!;

    if (drawType === "channel" || drawType === "trendline") {
      const opts = {
        startTime,
        endTime,
        startPrice: p.start_price!,
        endPrice: p.end_price!,
        secondaryStartPrice:
          drawType === "channel"
            ? (p.secondary_start_price ?? undefined)
            : undefined,
        secondaryEndPrice:
          drawType === "channel"
            ? (p.secondary_end_price ?? undefined)
            : undefined,
        color,
        lineWidth: 2,
        label: p.name,
        id,
      };
      const primitive = new TrendlinePrimitive(opts);
      series.attachPrimitive(primitive);
      trendlines.push(primitive);
    } else if (drawType === "spike_region") {
      const primitive = new HighlightRegionPrimitive({
        startTime,
        endTime,
        color,
        label: p.name,
        id,
      });
      series.attachPrimitive(primitive);
      regions.push(primitive);
    } else if (drawType === "marker") {
      markers.push({
        time: startTime,
        position: p.type === "bearish" ? "aboveBar" : "belowBar",
        color,
        shape:
          p.type === "bullish"
            ? "arrowUp"
            : p.type === "bearish"
              ? "arrowDown"
              : "circle",
        text: p.name,
        id,
      });
    }
  }

  // Apply markers (sorted by time required by lightweight-charts)
  if (markers.length > 0) {
    const sorted = markers.sort((a, b) => {
      const at =
        typeof a.time === "number"
          ? a.time
          : new Date(a.time as string).getTime();
      const bt =
        typeof b.time === "number"
          ? b.time
          : new Date(b.time as string).getTime();
      return at - bt;
    });
    createSeriesMarkers(series, sorted);
  }

  return { trendlines, regions };
}

/**
 * Detach all primitives previously attached.
 */
export function detachPatternOverlays(
  overlays: AttachedOverlays,
  series: ISeriesApi<SeriesType, Time>,
) {
  for (const t of overlays.trendlines) {
    series.detachPrimitive(t);
  }
  for (const r of overlays.regions) {
    series.detachPrimitive(r);
  }
}

/**
 * Toggle visibility of all overlays.
 */
export function setOverlaysVisible(
  overlays: AttachedOverlays,
  visible: boolean,
) {
  for (const t of overlays.trendlines) t.setVisible(visible);
  for (const r of overlays.regions) r.setVisible(visible);
}
