import type { Time, ISeriesApi, SeriesType } from "lightweight-charts";
import type { TechnicalPattern } from "@/types/analysis";
import type { ChartHistoryPeriod } from "@/lib/utils/chart-timeframes";
import {
  formatPatternChronologyLabel,
  parsePatternTimeValue,
} from "@/lib/utils/pattern-chronology";
import { TrendlinePrimitive } from "./TrendlinePrimitive";
import { HighlightRegionPrimitive } from "./HighlightRegionPrimitive";
import type { CalloutEntry } from "./CalloutAnnotationPrimitive";

/** Signal-direction colors (used for AI/Gemini patterns without a family) */
const TYPE_COLORS: Record<string, string> = {
  bullish: "rgb(34, 197, 94)",
  bearish: "rgb(239, 68, 68)",
  neutral: "rgb(245, 158, 11)",
};

/**
 * Per-indicator-family colors. Each system gets a unique hue so analysts
 * can instantly identify *which* indicator fired without reading the label.
 * Direction (bullish/bearish) is communicated by ▲/▼ glyph, not color.
 */
export const INDICATOR_FAMILY_COLORS: Record<string, string> = {
  ema: "rgb(6,182,212)", // cyan-500
  bollinger: "rgb(59,130,246)", // blue-500
  rsi: "rgb(168,85,247)", // purple-500
  macd: "rgb(16,185,129)", // emerald-500
  volume: "rgb(148,163,184)", // slate-400
};

export const INDICATOR_FAMILY_LABELS: Record<string, string> = {
  ema: "EMA",
  bollinger: "BB",
  rsi: "RSI",
  macd: "MACD",
  volume: "Volume",
  ai: "AI Patterns",
};

/** Resolve the display color for a pattern — family color takes precedence over signal color.
 * @internal Exported for testing only.
 */
export function resolvePatternColor(p: TechnicalPattern): string {
  if (
    p.indicator &&
    p.indicator !== "ai" &&
    INDICATOR_FAMILY_COLORS[p.indicator]
  ) {
    return INDICATOR_FAMILY_COLORS[p.indicator];
  }
  return TYPE_COLORS[p.type] ?? TYPE_COLORS.neutral;
}

export interface AttachedOverlays {
  trendlines: TrendlinePrimitive[];
  regions: HighlightRegionPrimitive[];
  /** Callout entries for the right-margin annotation layer */
  callouts: CalloutEntry[];
}

export interface OverlayOptions {
  /**
   * Minimum confidence threshold (0–1). Patterns below this value are
   * skipped. Defaults to 0 (show all). Set to 0.6 for default display.
   */
  minConfidence?: number;
  /** Active chart timeframe used to format concise callout timestamps. */
  timeframe?: ChartHistoryPeriod;
}

/**
 * Find the closest candle time to a target time string.
 * Returns the matched candle time (as-is from the set), or null.
 */
function findClosestCandleTime(
  target: string,
  candleTimesArr: string[],
): string | null {
  const trimmedTarget = target.trim();

  for (const ct of candleTimesArr) {
    if (ct === trimmedTarget) return ct;
  }

  const targetMs = parsePatternTimeValue(trimmedTarget);
  if (targetMs == null) return null;
  const isIntradayTarget =
    /T\d{2}:\d{2}|:\d{2}/.test(trimmedTarget) ||
    /^\d{10,}$/.test(trimmedTarget);

  let best: string | null = null;
  let bestDist = Infinity;
  for (const ct of candleTimesArr) {
    const ctMs = parsePatternTimeValue(ct);
    if (ctMs == null) continue;
    const dist = Math.abs(ctMs - targetMs);
    if (dist < bestDist) {
      bestDist = dist;
      best = ct;
    }
  }

  const toleranceMs = isIntradayTarget
    ? 6 * 60 * 60 * 1000
    : 3 * 24 * 60 * 60 * 1000;
  if (best && bestDist <= toleranceMs) return best;
  return null;
}

/**
 * Converts TechnicalPattern[] into chart primitives and callout annotations.
 * - Applies confidence threshold (default: show all — caller should set 0.6)
 * - Uses indicator-family colors for client-side patterns
 * - Trendlines/regions are rendered without labels (labels live in callouts)
 * - All pattern labels are returned as CalloutEntry[] for the annotation layer
 *   which draws them in a left-side column with leader lines and no overlap
 */
export function createPatternOverlays(
  patterns: TechnicalPattern[],
  series: ISeriesApi<SeriesType, Time>,
  candleTimeMap: Map<string, Time>,
  options: OverlayOptions = {},
): AttachedOverlays {
  const { minConfidence = 0, timeframe } = options;

  const trendlines: TrendlinePrimitive[] = [];
  const regions: HighlightRegionPrimitive[] = [];
  const callouts: CalloutEntry[] = [];

  const candleTimesArr = Array.from(candleTimeMap.keys()).sort();

  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i];

    // Confidence filter
    if ((p.confidence ?? 1) < minConfidence) continue;

    const color = resolvePatternColor(p);
    const id = `pattern-${i}`;

    const drawType = p.drawing_type ?? null;
    const hasCoords =
      p.start_time &&
      p.end_time &&
      p.start_price != null &&
      p.end_price != null;

    if (!hasCoords || drawType === "none") {
      // No coordinates — callout at best-effort time
      let markerKey: string | null = null;
      if (p.start_time) {
        markerKey = findClosestCandleTime(p.start_time, candleTimesArr);
      }
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
          callouts.push({
            label: p.name,
            timestamp: timeframe
              ? formatPatternChronologyLabel(markerKey, timeframe)
              : null,
            color,
            time: resolvedTime,
            price: p.start_price ?? p.end_price ?? 0,
            direction: p.type,
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

    // Use the end point of the drawing as the callout anchor
    const calloutTime = endTime;
    const calloutPrice = p.end_price!;

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
        label: undefined, // No label on the line itself
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
        label: undefined, // No label on the region itself
        id,
      });
      series.attachPrimitive(primitive);
      regions.push(primitive);
    }

    // All patterns with coords get a callout pointing to their end point
    callouts.push({
      label: p.name,
      timestamp:
        timeframe && (resolvedEndKey ?? resolvedStartKey)
          ? formatPatternChronologyLabel(
              resolvedEndKey ?? resolvedStartKey!,
              timeframe,
            )
          : null,
      color,
      time: calloutTime,
      price: calloutPrice,
      direction: p.type,
      id,
    });
  }

  return { trendlines, regions, callouts };
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
