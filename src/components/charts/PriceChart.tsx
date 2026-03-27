"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  type CandlestickData,
  type HistogramData,
  type Time,
} from "lightweight-charts";
import type { DeepDiveAnalysis } from "@/types/analysis";

interface PriceChartProps {
  candles: Array<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  supportResistance?: DeepDiveAnalysis["support_resistance"];
  height?: number;
}

export default function PriceChart({
  candles,
  supportResistance,
  height = 400,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const initChart = useCallback(() => {
    if (!containerRef.current || candles.length === 0) return;

    // Clean up previous chart
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

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
        timeVisible: false,
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

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
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

    chart.timeScale().fitContent();

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
      chart.remove();
      chartRef.current = null;
    };
  }, [candles, supportResistance, height]);

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
