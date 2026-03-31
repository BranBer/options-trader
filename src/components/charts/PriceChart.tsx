"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
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

export interface IndicatorConfig {
  ema9?: boolean;
  ema21?: boolean;
  bollinger?: boolean;
  volumeMA?: boolean;
  rsi?: boolean;
  macd?: boolean;
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
}

export default function PriceChart({
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
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaysRef = useRef<AttachedOverlays | null>(null);

  const initChart = useCallback(() => {
    if (!containerRef.current || candles.length === 0) return;

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
      color: c.close >= c.open ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)",
    }));

    volumeSeries.setData(volumeData);
    volumeSeriesRef.current = volumeSeries;

    // Support/Resistance lines
    if (supportResistance && supportResistance.length > 0) {
      for (const sr of supportResistance) {
        const color =
          sr.type === "support" ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)";
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
      for (let i = 0; i < data.length; i++) {
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
      for (let i = 0; i < rsiData.length; i++) {
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
      for (let i = 0; i < macdResult.macd.length; i++) {
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
      for (let i = 0; i < macdResult.signal.length; i++) {
        if (macdResult.signal[i] != null) {
          signalLineData.push({ time: times[i], value: macdResult.signal[i]! });
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
      for (let i = 0; i < macdResult.histogram.length; i++) {
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

    chart.timeScale().fitContent();

    // Pattern overlays
    if (technicalPatterns && technicalPatterns.length > 0 && showPatterns) {
      // Build a map from normalized YYYY-MM-DD → original Time value
      const candleTimeMap = new Map<string, Time>();
      for (const c of candles) {
        const normalizedKey =
          typeof c.time === "number"
            ? new Date(c.time * 1000).toISOString().slice(0, 10)
            : String(c.time);
        // For intraday, multiple candles share the same date — keep the first
        if (!candleTimeMap.has(normalizedKey)) {
          candleTimeMap.set(normalizedKey, c.time as Time);
        }
      }
      const overlays = createPatternOverlays(
        technicalPatterns,
        candleSeries,
        candleTimeMap,
      );
      overlaysRef.current = overlays;
    }

    // Crosshair move for pattern hover detection
    if (onHoveredPattern) {
      chart.subscribeCrosshairMove((param) => {
        if (param.hoveredObjectId) {
          const idStr = String(param.hoveredObjectId);
          const match = idStr.match(/^pattern-(\d+)$/);
          if (match) {
            onHoveredPattern(parseInt(match[1], 10));
            return;
          }
        }
        onHoveredPattern(null);
      });
    }

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
      if (overlaysRef.current && candleSeriesRef.current) {
        detachPatternOverlays(overlaysRef.current, candleSeriesRef.current);
        overlaysRef.current = null;
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
  }, [highlightedPatternIndex]);

  useEffect(() => {
    const cleanup = initChart();
    return () => cleanup?.();
  }, [initChart]);

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
}
