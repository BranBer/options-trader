"use client";

import {
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
  type SeriesMarker,
} from "lightweight-charts";
import type { DeepDiveAnalysis, TechnicalPattern } from "@/types/analysis";
import {
  ema,
  bollingerBands,
  rsi as calcRsi,
  macd as calcMacd,
  volumeSMA,
} from "@/lib/utils/technical-indicators";
import {
  createPatternOverlays,
  detachPatternOverlays,
  type AttachedOverlays,
} from "./primitives/PatternMarkerHelper";
import { CalloutAnnotationPrimitive } from "./primitives/CalloutAnnotationPrimitive";
import type { CalloutEntry } from "./primitives/CalloutAnnotationPrimitive";
import type { ChartHistoryPeriod } from "@/lib/utils/chart-timeframes";
import type { EconomicEvent } from "@/lib/utils/economic-calendar";
import type { TriggerAnnotation } from "@/lib/utils/trigger-annotations";
import type {
  IntradayResistanceLevel,
  IntradaySupportLevel,
} from "@/lib/utils/intraday-resistance";
import { TriggerAnnotationPrimitive } from "./primitives/TriggerAnnotationPrimitive";
import { ExtendedHoursPrimitive } from "./primitives/ExtendedHoursPrimitive";

export interface TriggerMarker {
  /** Stable identifier used for linking chart markers back to external UI state */
  id?: string;
  /** Candle time in seconds (lightweight-charts Time) */
  time: number;
  /** "bullish" | "bearish" | "neutral" */
  direction: string;
  /** Interaction type label, e.g. "reclaim", "bounce", "breakdown" */
  type: string;
  /** Price level the interaction occurred at */
  level: number;
  /** Human-readable text shown on hover */
  text: string;
  /** Whether this is the primary trigger (larger marker) */
  primary?: boolean;
  /** Whether this marker is the active selection in external UI state */
  selected?: boolean;
}

function isIntradayTimeframe(timeframe: ChartHistoryPeriod): boolean {
  return timeframe === "1d" || timeframe === "1wk";
}

export function candleTimeToSeconds(time: string | number): number {
  if (typeof time === "number") {
    return time > 10_000_000_000 ? Math.floor(time / 1000) : time;
  }

  return Math.floor(new Date(time).getTime() / 1000);
}

function utcDayKeyFromSeconds(timeSec: number): string {
  return new Date(timeSec * 1000).toISOString().slice(0, 10);
}

export function resolveTriggerMarkerTime(
  triggerTimeSec: number,
  candleTimesSec: number[],
  timeframe: ChartHistoryPeriod,
): number | null {
  if (candleTimesSec.includes(triggerTimeSec)) {
    return triggerTimeSec;
  }

  if (!isIntradayTimeframe(timeframe)) {
    return null;
  }

  const triggerDay = utcDayKeyFromSeconds(triggerTimeSec);
  const sameDayTimes = candleTimesSec.filter(
    (timeSec) => utcDayKeyFromSeconds(timeSec) === triggerDay,
  );

  if (sameDayTimes.length === 0) {
    return null;
  }

  let nearest = sameDayTimes[0];
  let nearestDistance = Math.abs(nearest - triggerTimeSec);

  for (let index = 1; index < sameDayTimes.length; index += 1) {
    const candidate = sameDayTimes[index];
    const distance = Math.abs(candidate - triggerTimeSec);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export interface IndicatorConfig {
  ema9?: boolean;
  ema21?: boolean;
  bollinger?: boolean;
  volumeMA?: boolean;
  rsi?: boolean;
  macd?: boolean;
}

/** Imperative handle exposed via ref for external chart access */
export interface PriceChartHandle {
  /** Returns a PNG data URL screenshot of the chart, or null if chart not ready */
  takeScreenshot: () => string | null;
}

interface PriceChartProps {
  candles: Array<{
    time: string | number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  supportResistance?: DeepDiveAnalysis["support_resistance"];
  technicalPatterns?: TechnicalPattern[];
  showPatterns?: boolean;
  highlightedPatternIndex?: number | null;
  onHoveredPattern?: (patternIndex: number | null) => void;
  height?: number;
  /** Trade entry price — shown as a horizontal line */
  entryPrice?: number;
  /** Trade exit price — shown as a horizontal line */
  exitPrice?: number;
  /** Options context for OI walls / max pain / GEX flip lines */
  optionsContext?: DeepDiveAnalysis["options_context"];
  /** Which computed indicators to display */
  indicators?: IndicatorConfig;
  /** Active history range used for timestamp labels and viewport padding */
  timeframe?: ChartHistoryPeriod;
  /**
   * Minimum pattern confidence to display (0–1). Patterns below this
   * threshold are hidden. Defaults to 0.6 when omitted.
   */
  minConfidence?: number;
  /** Called when callout entries are computed, for rendering the external legend */
  onCalloutEntries?: (entries: CalloutEntry[]) => void;
  /**
   * Economic events to overlay as markers on the chart.
   * Events are snapped to the nearest candle within the visible range.
   */
  economicEvents?: EconomicEvent[];
  /** Trigger markers from the trigger engine */
  triggerMarkers?: TriggerMarker[];
  /** Called when a chart marker is hovered or clicked and maps to a trigger marker id */
  onTriggerMarkerSelect?: (markerId: string | null) => void;
  /** Trigger interaction drawings from the trigger engine */
  triggerAnnotations?: TriggerAnnotation[];
  /** Intraday-only resistance levels derived from session structure */
  intradayResistanceLevels?: IntradayResistanceLevel[];
  /** Intraday-only support levels derived from session structure */
  intradaySupportLevels?: IntradaySupportLevel[];
}

const PriceChart = forwardRef<PriceChartHandle, PriceChartProps>(
  function PriceChart(
    {
      candles,
      supportResistance,
      technicalPatterns,
      showPatterns = true,
      highlightedPatternIndex,
      onHoveredPattern,
      height = 400,
      entryPrice,
      exitPrice,
      optionsContext,
      indicators,
      timeframe = "3mo",
      minConfidence = 0.6,
      onCalloutEntries,
      economicEvents,
      triggerMarkers,
      onTriggerMarkerSelect,
      triggerAnnotations,
      intradayResistanceLevels,
      intradaySupportLevels,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);

    useImperativeHandle(ref, () => ({
      takeScreenshot: () => {
        const chart = chartRef.current;
        if (!chart) return null;
        try {
          const canvas = chart.takeScreenshot(true, false);
          return canvas.toDataURL("image/png");
        } catch {
          return null;
        }
      },
    }));
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const overlaysRef = useRef<AttachedOverlays | null>(null);
    const calloutRef = useRef<CalloutAnnotationPrimitive | null>(null);
    const triggerAnnotationRef = useRef<TriggerAnnotationPrimitive | null>(
      null,
    );
    const extendedHoursRef = useRef<ExtendedHoursPrimitive | null>(null);
    // Persist user's zoom/scroll position across chart re-initializations
    const savedRangeRef = useRef<{ from: Time; to: Time } | null>(null);
    // Stable ref for the marker-select callback so crosshair/click handlers
    // always see the latest without being in initChart deps.
    const triggerMarkerSelectRef = useRef(onTriggerMarkerSelect);
    useEffect(() => {
      triggerMarkerSelectRef.current = onTriggerMarkerSelect;
    }, [onTriggerMarkerSelect]);
    // Track whether chart has been initialized at least once (for viewport)
    const hasSetInitialViewport = useRef(false);

    const initChart = useCallback(() => {
      if (!containerRef.current || candles.length === 0) return;

      // Reset legend when chart reinitializes
      onCalloutEntries?.([]);

      // Clean up previous chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }

      const hasRSI = indicators?.rsi ?? false;
      const hasMACD = indicators?.macd ?? false;

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#a1a1aa",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.04)" },
          horzLines: { color: "rgba(255,255,255,0.04)" },
        },
        crosshair: {
          vertLine: { color: "rgba(255,255,255,0.1)" },
          horzLine: { color: "rgba(255,255,255,0.1)" },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.1)",
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.1)",
          timeVisible: typeof candles[0]?.time === "number",
          minBarSpacing: 4,
        },
      });

      chartRef.current = chart;

      // Candlestick series
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });

      const candleData: CandlestickData<Time>[] = candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));

      candleSeries.setData(candleData);
      candleSeriesRef.current = candleSeries;

      // Volume histogram
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });

      // Scale margins: compress candle+volume area when sub-panes are active
      const subPaneCount = (hasRSI ? 1 : 0) + (hasMACD ? 1 : 0);
      const volumeTop =
        subPaneCount === 2 ? 0.55 : subPaneCount === 1 ? 0.65 : 0.8;

      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: volumeTop, bottom: 0 },
      });

      const volumeData: HistogramData<Time>[] = candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color:
          c.close >= c.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
      }));

      volumeSeries.setData(volumeData);
      volumeSeriesRef.current = volumeSeries;

      // Support/Resistance lines
      if (supportResistance && supportResistance.length > 0) {
        for (const sr of supportResistance) {
          const color =
            sr.type === "support"
              ? "rgba(34,197,94,0.5)"
              : "rgba(239,68,68,0.5)";
          const lineWidth =
            sr.strength === "strong" ? 2 : sr.strength === "moderate" ? 1 : 1;
          const lineStyle = sr.strength === "weak" ? 2 : 0; // 2 = dashed, 0 = solid

          candleSeries.createPriceLine({
            price: sr.level,
            color,
            lineWidth: lineWidth as 1 | 2 | 3 | 4,
            lineStyle,
            axisLabelVisible: true,
            title: `${sr.type === "support" ? "S" : "R"} ${sr.level.toFixed(2)}`,
          });
        }
      }

      if (intradayResistanceLevels && intradayResistanceLevels.length > 0) {
        for (const [index, level] of intradayResistanceLevels.entries()) {
          const color =
            level.source === "opening-range"
              ? "rgba(239,68,68,0.65)"
              : level.source === "premarket-high"
                ? "rgba(251,146,60,0.72)"
                : level.source === "anchored-vwap"
                  ? "rgba(14,165,233,0.75)"
                  : level.source === "prior-day-high" ||
                      level.source === "prior-day-close"
                    ? "rgba(245,158,11,0.7)"
                    : "rgba(168,85,247,0.7)";
          const lineStyle =
            level.source === "vwap-band" || level.source === "anchored-vwap"
              ? 1
              : level.source === "prior-day-close"
                ? 2
                : 0;

          candleSeries.createPriceLine({
            price: level.level,
            color,
            lineWidth:
              level.strength === "strong"
                ? 2
                : level.strength === "moderate"
                  ? 1
                  : 1,
            lineStyle,
            axisLabelVisible: index < 3,
            title: level.label,
          });
        }
      }

      if (intradaySupportLevels && intradaySupportLevels.length > 0) {
        for (const [index, level] of intradaySupportLevels.entries()) {
          const color =
            level.source === "opening-range-low"
              ? "rgba(34,197,94,0.72)"
              : level.source === "premarket-low"
                ? "rgba(16,185,129,0.72)"
                : level.source === "anchored-vwap-high"
                  ? "rgba(6,182,212,0.75)"
                  : level.source === "prior-day-low" ||
                      level.source === "prior-day-close"
                    ? "rgba(74,222,128,0.7)"
                    : "rgba(45,212,191,0.7)";
          const lineStyle =
            level.source === "vwap-band-lower" ||
            level.source === "anchored-vwap-high"
              ? 1
              : level.source === "prior-day-close"
                ? 2
                : 0;

          candleSeries.createPriceLine({
            price: level.level,
            color,
            lineWidth:
              level.strength === "strong"
                ? 2
                : level.strength === "moderate"
                  ? 1
                  : 1,
            lineStyle,
            axisLabelVisible: index < 3,
            title: level.label,
          });
        }
      }

      // Options context lines: max pain, OI walls, GEX flip
      if (optionsContext) {
        const { max_pain, oi_walls, gex_summary } = optionsContext;

        if (max_pain != null) {
          candleSeries.createPriceLine({
            price: max_pain,
            color: "rgba(251,191,36,0.7)", // amber
            lineWidth: 2,
            lineStyle: 2, // dashed
            axisLabelVisible: true,
            title: `MaxPain $${max_pain.toFixed(0)}`,
          });
        }

        if (oi_walls) {
          for (const wall of oi_walls.call_walls.slice(0, 3)) {
            candleSeries.createPriceLine({
              price: wall.strike,
              color: "rgba(239,68,68,0.4)",
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: `Call OI ${(wall.oi / 1000).toFixed(1)}k`,
            });
          }
          for (const wall of oi_walls.put_walls.slice(0, 3)) {
            candleSeries.createPriceLine({
              price: wall.strike,
              color: "rgba(34,197,94,0.4)",
              lineWidth: 1,
              lineStyle: 2,
              axisLabelVisible: true,
              title: `Put OI ${(wall.oi / 1000).toFixed(1)}k`,
            });
          }
        }

        if (gex_summary?.gex_flip_level != null) {
          candleSeries.createPriceLine({
            price: gex_summary.gex_flip_level,
            color: "rgba(168,85,247,0.7)", // purple
            lineWidth: 2,
            lineStyle: 1, // dotted
            axisLabelVisible: true,
            title: `GEX Flip $${gex_summary.gex_flip_level.toFixed(0)}`,
          });
        }
      }

      // Entry/exit price lines (for portfolio trade detail)
      if (entryPrice != null) {
        candleSeries.createPriceLine({
          price: entryPrice,
          color: "rgba(59,130,246,0.8)",
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: `Entry $${entryPrice.toFixed(2)}`,
        });
      }
      if (exitPrice != null) {
        candleSeries.createPriceLine({
          price: exitPrice,
          color: "rgba(168,85,247,0.8)",
          lineWidth: 2,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `Exit $${exitPrice.toFixed(2)}`,
        });
      }

      // ——— Computed Technical Indicators ———
      const closes = candles.map((c) => c.close);
      const times = candles.map((c) => c.time as Time);
      const candleTimesSec = candles.map((c) => candleTimeToSeconds(c.time));

      function addLineSeries(
        data: (number | null)[],
        color: string,
        lineWidth: 1 | 2 | 3 | 4 = 1,
        priceScaleId?: string,
      ) {
        const series = chart.addSeries(LineSeries, {
          color,
          lineWidth,
          crosshairMarkerVisible: false,
          priceLineVisible: false,
          lastValueVisible: false,
          ...(priceScaleId ? { priceScaleId } : {}),
        });
        const lineData: LineData<Time>[] = [];
        for (let i = 0; i < Math.min(data.length, times.length); i++) {
          if (data[i] != null) {
            lineData.push({ time: times[i], value: data[i]! });
          }
        }
        series.setData(lineData);
        return series;
      }

      // EMA 9 (cyan)
      if (indicators?.ema9) {
        addLineSeries(ema(closes, 9), "rgba(6,182,212,0.8)", 1);
      }

      // EMA 21 (orange)
      if (indicators?.ema21) {
        addLineSeries(ema(closes, 21), "rgba(249,115,22,0.8)", 1);
      }

      // Bollinger Bands (blue fill)
      if (indicators?.bollinger) {
        const bb = bollingerBands(closes, 20, 2);
        addLineSeries(bb.upper, "rgba(96,165,250,0.5)", 1);
        addLineSeries(bb.middle, "rgba(96,165,250,0.3)", 1);
        addLineSeries(bb.lower, "rgba(96,165,250,0.5)", 1);
      }

      // Volume MA (white line on volume pane)
      if (indicators?.volumeMA) {
        const volMA = volumeSMA(
          candles as {
            time: string | number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
          }[],
          20,
        );
        addLineSeries(volMA, "rgba(255,255,255,0.6)", 1, "volume");
      }

      // RSI pane
      if (indicators?.rsi) {
        const rsiData = calcRsi(closes, 14);
        const rsiSeries = chart.addSeries(LineSeries, {
          color: "rgba(147,51,234,0.9)",
          lineWidth: 1,
          priceScaleId: "rsi",
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
        });
        chart.priceScale("rsi").applyOptions({
          scaleMargins: {
            top: hasMACD ? 0.72 : 0.78,
            bottom: hasMACD ? 0.15 : 0.02,
          },
          borderVisible: false,
        });
        const rsiLineData: LineData<Time>[] = [];
        for (let i = 0; i < Math.min(rsiData.length, times.length); i++) {
          if (rsiData[i] != null) {
            rsiLineData.push({ time: times[i], value: rsiData[i]! });
          }
        }
        rsiSeries.setData(rsiLineData);
        // Overbought / oversold reference lines
        rsiSeries.createPriceLine({
          price: 70,
          color: "rgba(239,68,68,0.3)",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: "",
        });
        rsiSeries.createPriceLine({
          price: 30,
          color: "rgba(34,197,94,0.3)",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: false,
          title: "",
        });
      }

      // MACD pane
      if (indicators?.macd) {
        const macdResult = calcMacd(closes, 12, 26, 9);

        // MACD line (blue)
        const macdSeries = chart.addSeries(LineSeries, {
          color: "rgba(59,130,246,0.9)",
          lineWidth: 1,
          priceScaleId: "macd",
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        chart.priceScale("macd").applyOptions({
          scaleMargins: { top: hasRSI ? 0.88 : 0.82, bottom: 0.02 },
          borderVisible: false,
        });
        const macdLineData: LineData<Time>[] = [];
        for (
          let i = 0;
          i < Math.min(macdResult.macd.length, times.length);
          i++
        ) {
          if (macdResult.macd[i] != null) {
            macdLineData.push({ time: times[i], value: macdResult.macd[i]! });
          }
        }
        macdSeries.setData(macdLineData);

        // Signal line (orange)
        const signalSeries = chart.addSeries(LineSeries, {
          color: "rgba(249,115,22,0.9)",
          lineWidth: 1,
          priceScaleId: "macd",
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        const signalLineData: LineData<Time>[] = [];
        for (
          let i = 0;
          i < Math.min(macdResult.signal.length, times.length);
          i++
        ) {
          if (macdResult.signal[i] != null) {
            signalLineData.push({
              time: times[i],
              value: macdResult.signal[i]!,
            });
          }
        }
        signalSeries.setData(signalLineData);

        // MACD histogram
        const macdHistSeries = chart.addSeries(HistogramSeries, {
          priceScaleId: "macd",
          priceLineVisible: false,
          lastValueVisible: false,
        });
        const macdHistData: HistogramData<Time>[] = [];
        for (
          let i = 0;
          i < Math.min(macdResult.histogram.length, times.length);
          i++
        ) {
          if (macdResult.histogram[i] != null) {
            macdHistData.push({
              time: times[i],
              value: macdResult.histogram[i]!,
              color:
                macdResult.histogram[i]! >= 0
                  ? "rgba(34,197,94,0.4)"
                  : "rgba(239,68,68,0.4)",
            });
          }
        }
        macdHistSeries.setData(macdHistData);
      }

      // Pattern overlays
      if (technicalPatterns && technicalPatterns.length > 0 && showPatterns) {
        // Build a map from normalized YYYY-MM-DD → original Time value
        const candleTimeMap = new Map<string, Time>();
        for (const c of candles) {
          if (typeof c.time === "number") {
            const exactKey = new Date(c.time * 1000).toISOString();
            const dateKey = exactKey.slice(0, 10);
            candleTimeMap.set(exactKey, c.time as Time);
            if (!candleTimeMap.has(dateKey)) {
              candleTimeMap.set(dateKey, c.time as Time);
            }
          } else {
            const key = String(c.time);
            if (!candleTimeMap.has(key)) {
              candleTimeMap.set(key, c.time as Time);
            }
          }
        }
        const overlays = createPatternOverlays(
          technicalPatterns,
          candleSeries,
          candleTimeMap,
          { minConfidence, timeframe },
        );
        overlaysRef.current = overlays;

        // Callout annotation layer — attached AFTER trigger annotations so it
        // renders on top (both use zOrder "top", last-attached wins).
        if (overlays.callouts.length > 0) {
          const calloutPrimitive = new CalloutAnnotationPrimitive();
          calloutPrimitive.setEntries(overlays.callouts);
          candleSeries.attachPrimitive(calloutPrimitive);
          calloutRef.current = calloutPrimitive;
        }

        // Fire the legend callback so the DOM legend can render
        onCalloutEntries?.(overlays.callouts);
      }

      // Extended-hours shading + session boundary lines (Stories 3.1 + 3.2).
      // Uses zOrder "bottom" so it sits under every other primitive.
      // Only meaningful for intraday timeframes (unix-second candle timestamps).
      const isIntraday = timeframe === "1d" || timeframe === "1wk";
      if (isIntraday && candles.length > 0) {
        const candlesForSession = candles.map((c) => ({
          time:
            typeof c.time === "number"
              ? c.time
              : Math.floor(new Date(c.time).getTime() / 1000),
        }));
        const extendedPrimitive = new ExtendedHoursPrimitive(candlesForSession);
        candleSeries.attachPrimitive(extendedPrimitive);
        extendedHoursRef.current = extendedPrimitive;
      }

      // Trigger annotation drawings — attached BEFORE pattern overlays so they
      // render underneath the technical-analysis callout layer.
      if (triggerAnnotations && triggerAnnotations.length > 0) {
        const resolvedAnnotations = triggerAnnotations
          .map((annotation) => {
            const resolvedTimeSec = resolveTriggerMarkerTime(
              annotation.time,
              candleTimesSec,
              timeframe,
            );
            if (resolvedTimeSec == null) return null;
            return { ...annotation, time: resolvedTimeSec };
          })
          .filter(
            (annotation): annotation is TriggerAnnotation => annotation != null,
          );

        if (resolvedAnnotations.length > 0) {
          const primitive = new TriggerAnnotationPrimitive(resolvedAnnotations);
          candleSeries.attachPrimitive(primitive);
          triggerAnnotationRef.current = primitive;
        }
      }

      // Set initial viewport (only on first mount or structural rebuild)
      if (!hasSetInitialViewport.current) {
        const VISIBLE_BAR_COUNT = 30;
        if (isIntraday && candles.length > VISIBLE_BAR_COUNT) {
          const from = candles[candles.length - VISIBLE_BAR_COUNT].time as Time;
          const to = candles[candles.length - 1].time as Time;
          chart.timeScale().setVisibleRange({ from, to });
        } else {
          chart.timeScale().fitContent();
        }
        hasSetInitialViewport.current = true;
      } else if (savedRangeRef.current) {
        chart.timeScale().setVisibleRange(savedRangeRef.current);
      } else {
        chart.timeScale().fitContent();
      }

      // Crosshair move for pattern hover detection and marker linking.
      // Uses refs so the handlers stay current without being deps.
      chart.subscribeCrosshairMove((param) => {
        if (param.hoveredObjectId) {
          const idStr = String(param.hoveredObjectId);
          const match = idStr.match(/^pattern-(\d+)$/);
          if (match) {
            onHoveredPattern?.(parseInt(match[1], 10));
            return;
          }

          if (idStr.startsWith("classification-")) {
            triggerMarkerSelectRef.current?.(idStr);
            return;
          }
        }
        onHoveredPattern?.(null);
        triggerMarkerSelectRef.current?.(null);
      });

      chart.subscribeClick((param) => {
        if (!param.hoveredObjectId) return;
        const idStr = String(param.hoveredObjectId);
        if (idStr.startsWith("classification-")) {
          triggerMarkerSelectRef.current?.(idStr);
        }
      });

      // Resize observer
      const ro = new ResizeObserver(() => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: containerRef.current.clientWidth,
          });
        }
      });
      ro.observe(containerRef.current);

      return () => {
        ro.disconnect();
        // Persist the user's zoom/scroll position before tearing down
        try {
          const range = chart.timeScale().getVisibleRange();
          if (range) savedRangeRef.current = range;
        } catch {
          /* chart already disposed */
        }
        if (overlaysRef.current && candleSeriesRef.current) {
          detachPatternOverlays(overlaysRef.current, candleSeriesRef.current);
          overlaysRef.current = null;
        }
        if (calloutRef.current && candleSeriesRef.current) {
          candleSeriesRef.current.detachPrimitive(calloutRef.current);
          calloutRef.current = null;
        }
        if (triggerAnnotationRef.current && candleSeriesRef.current) {
          candleSeriesRef.current.detachPrimitive(triggerAnnotationRef.current);
          triggerAnnotationRef.current = null;
        }
        chart.remove();
        chartRef.current = null;
      };
    }, [
      candles,
      supportResistance,
      technicalPatterns,
      showPatterns,
      height,
      onHoveredPattern,
      entryPrice,
      exitPrice,
      optionsContext,
      indicators,
      timeframe,
      minConfidence,
      onCalloutEntries,
      triggerAnnotations,
      intradayResistanceLevels,
      intradaySupportLevels,
    ]);

    // Highlight a specific pattern overlay when hovered from text
    useEffect(() => {
      if (!overlaysRef.current) return;
      const all = [
        ...overlaysRef.current.trendlines,
        ...overlaysRef.current.regions,
      ];
      for (const prim of all) {
        const idx = parseInt(prim.id.replace("pattern-", ""), 10);
        // When a pattern is highlighted, dim others
        if (highlightedPatternIndex != null) {
          prim.setVisible(idx === highlightedPatternIndex);
        } else {
          prim.setVisible(true);
        }
      }
      // Filter callout annotations to only the highlighted pattern
      if (calloutRef.current && overlaysRef.current) {
        if (highlightedPatternIndex != null) {
          const highlightedId = `pattern-${highlightedPatternIndex}`;
          calloutRef.current.setEntries(
            overlaysRef.current.callouts.filter((c) => c.id === highlightedId),
          );
        } else {
          calloutRef.current.setEntries(overlaysRef.current.callouts);
        }
      }
    }, [highlightedPatternIndex]);

    useEffect(() => {
      const cleanup = initChart();
      return () => cleanup?.();
    }, [initChart]);

    // -----------------------------------------------------------------------
    // Marker effect — updates economic + trigger markers in-place without
    // rebuilding the chart.  Runs when markers or candle data change.
    // -----------------------------------------------------------------------
    useEffect(() => {
      const candleSeries = candleSeriesRef.current;
      if (!candleSeries || candles.length === 0) return;

      const allMarkers: SeriesMarker<Time>[] = [];

      // Economic event markers
      if (economicEvents && economicEvents.length > 0) {
        const dateToTime = new Map<string, Time>();
        for (const c of candles) {
          let dateKey: string;
          if (typeof c.time === "number") {
            dateKey = new Date(c.time * 1000).toISOString().slice(0, 10);
          } else {
            dateKey = String(c.time).slice(0, 10);
          }
          if (!dateToTime.has(dateKey)) {
            dateToTime.set(dateKey, c.time as Time);
          }
        }

        for (const event of economicEvents) {
          const t = dateToTime.get(event.date);
          if (!t) continue;

          const color =
            event.impact === "high"
              ? "#ef4444"
              : event.impact === "medium"
                ? "#f59e0b"
                : "#6b7280";

          allMarkers.push({
            time: t,
            position: "aboveBar",
            shape: "circle",
            color,
            size: event.impact === "high" ? 1.5 : 1,
            text: event.name,
            id: `econ-${event.date}-${event.name}`,
          });
        }
      }

      // Trigger markers (Market Pulse classifications)
      if (triggerMarkers && triggerMarkers.length > 0) {
        const candleTimesSec = candles.map((c) => candleTimeToSeconds(c.time));

        for (const tm of triggerMarkers) {
          const resolvedTimeSec = resolveTriggerMarkerTime(
            tm.time,
            candleTimesSec,
            timeframe,
          );
          if (resolvedTimeSec == null) continue;

          const isBullish = tm.direction === "bullish";
          const isBearish = tm.direction === "bearish";

          const markerId = tm.id ?? `trigger-${resolvedTimeSec}-${tm.type}`;

          allMarkers.push({
            time: resolvedTimeSec as unknown as Time,
            position: isBearish ? "aboveBar" : "belowBar",
            shape: "circle",
            color: isBullish ? "#38bdf8" : isBearish ? "#fb7185" : "#fbbf24",
            size: tm.selected ? 1.5 : tm.primary ? 1 : 0.8,
            text: `${tm.type} $${tm.level.toFixed(0)}`,
            id: markerId,
          });
        }
      }

      if (allMarkers.length > 0) {
        allMarkers.sort((a, b) => String(a.time).localeCompare(String(b.time)));
      }
      createSeriesMarkers(candleSeries, allMarkers);
    }, [candles, economicEvents, triggerMarkers, timeframe]);

    if (candles.length === 0) {
      return (
        <div
          className="flex items-center justify-center text-sm text-muted-foreground"
          style={{ height }}
        >
          No price data available
        </div>
      );
    }

    return <div ref={containerRef} className="w-full" style={{ height }} />;
  },
);

export default PriceChart;
