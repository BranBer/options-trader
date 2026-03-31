"use client";

import { useState, useCallback } from "react";
import { Separator } from "@/components/ui/separator";
import { useHistoricalData } from "@/hooks/useApiData";
import type { TechnicalPattern } from "@/types/analysis";
import type { DeepDiveAnalysis } from "@/types/analysis";
import PriceChart, {
  type IndicatorConfig,
} from "@/components/charts/PriceChart";
import ChartLegend from "@/components/charts/ChartLegend";
import { Eye, EyeOff, BarChart3 } from "lucide-react";
import {
  IndicatorGuidePanel,
  InfoTooltip,
} from "@/components/charts/IndicatorExplainers";

const TIMEFRAMES = ["1wk", "1mo", "3mo", "6mo", "1y"] as const;
const TIMEFRAME_LABELS: Record<string, string> = {
  "1wk": "1W",
  "1mo": "1M",
  "3mo": "3M",
  "6mo": "6M",
  "1y": "1Y",
};

const INDICATOR_OPTIONS: {
  key: keyof IndicatorConfig;
  label: string;
  color: string;
}[] = [
  { key: "ema9", label: "EMA 9", color: "bg-cyan-500" },
  { key: "ema21", label: "EMA 21", color: "bg-orange-500" },
  { key: "bollinger", label: "BB", color: "bg-blue-400" },
  { key: "volumeMA", label: "Vol MA", color: "bg-white/60" },
  { key: "rsi", label: "RSI", color: "bg-purple-500" },
  { key: "macd", label: "MACD", color: "bg-blue-500" },
];

interface TechnicalChartProps {
  ticker: string;
  supportResistance?: DeepDiveAnalysis["support_resistance"];
  technicalPatterns?: TechnicalPattern[];
  /** Entry price line (green for bullish, red for bearish) */
  entryPrice?: number;
  /** Exit price line (shown only for closed trades) */
  exitPrice?: number;
  /** Pattern hover index shared with external pattern list */
  hoveredPatternIndex?: number | null;
  onHoveredPattern?: (idx: number | null) => void;
  height?: number;
  /** Options context for OI walls / max pain / GEX flip lines */
  optionsContext?: DeepDiveAnalysis["options_context"];
  /** Which computed indicators to display */
  indicators?: IndicatorConfig;
}

export default function TechnicalChart({
  ticker,
  supportResistance,
  technicalPatterns,
  entryPrice,
  exitPrice,
  hoveredPatternIndex = null,
  onHoveredPattern,
  height = 300,
  optionsContext,
  indicators,
}: TechnicalChartProps) {
  const [timeframe, setTimeframe] = useState<string>("3mo");
  const [showPatterns, setShowPatterns] = useState(true);
  const [showIndicators, setShowIndicators] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<IndicatorConfig>({
    ema9: false,
    ema21: false,
    bollinger: false,
    volumeMA: false,
    rsi: false,
    macd: false,
  });

  // Merge external indicators prop with local toggle state
  const mergedIndicators: IndicatorConfig = indicators
    ? { ...activeIndicators, ...indicators }
    : activeIndicators;

  const toggleIndicator = useCallback((key: keyof IndicatorConfig) => {
    setActiveIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const { data: histData, isLoading } = useHistoricalData(ticker, timeframe);
  const candles = histData?.candles ?? [];

  const handleHover = useCallback(
    (idx: number | null) => onHoveredPattern?.(idx),
    [onHoveredPattern],
  );

  return (
    <div className="space-y-2">
      {/* Controls row */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Price Action</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowIndicators(!showIndicators)}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors ${
              showIndicators
                ? "bg-primary/20 text-primary"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
            aria-pressed={showIndicators}
            title="Toggle indicators panel"
          >
            <BarChart3 className="h-3 w-3" />
            Indicators
          </button>
          {technicalPatterns && technicalPatterns.length > 0 && (
            <button
              onClick={() => setShowPatterns(!showPatterns)}
              className="flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors bg-muted text-muted-foreground hover:bg-muted/80"
              aria-pressed={showPatterns}
              title={
                showPatterns ? "Hide pattern overlays" : "Show pattern overlays"
              }
            >
              {showPatterns ? (
                <Eye className="h-3 w-3" />
              ) : (
                <EyeOff className="h-3 w-3" />
              )}
              Patterns
            </button>
          )}
          <div className="flex gap-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  timeframe === tf
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                aria-pressed={timeframe === tf}
              >
                {TIMEFRAME_LABELS[tf]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Indicator toggles */}
      {showIndicators && (
        <div className="flex flex-wrap gap-1.5">
          {INDICATOR_OPTIONS.map(({ key, label, color }) => {
            const active = mergedIndicators[key];
            return (
              <span key={key} className="inline-flex items-center gap-0.5">
                <button
                  onClick={() => toggleIndicator(key)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 text-xs rounded transition-colors ${
                    active
                      ? "bg-accent text-accent-foreground ring-1 ring-accent"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  aria-pressed={!!active}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${color} ${active ? "opacity-100" : "opacity-40"}`}
                  />
                  {label}
                </button>
                <InfoTooltip text="" indicatorKey={key} />
              </span>
            );
          })}
        </div>
      )}

      {/* Chart */}
      {isLoading ? (
        <div
          className="flex items-center justify-center text-sm text-muted-foreground animate-pulse"
          style={{ height }}
        >
          Loading chart data...
        </div>
      ) : (
        <>
          <PriceChart
            candles={candles}
            supportResistance={supportResistance}
            technicalPatterns={technicalPatterns}
            showPatterns={showPatterns}
            highlightedPatternIndex={hoveredPatternIndex}
            onHoveredPattern={handleHover}
            height={height}
            entryPrice={entryPrice}
            exitPrice={exitPrice}
            optionsContext={optionsContext}
            indicators={mergedIndicators}
          />
          <ChartLegend
            supportResistance={supportResistance}
            technicalPatterns={technicalPatterns}
            showPatterns={showPatterns}
          />
          <IndicatorGuidePanel
            activeIndicators={Object.entries(mergedIndicators)
              .filter(([, v]) => v)
              .map(([k]) => k)}
            showOptionsContext={!!optionsContext}
          />
        </>
      )}
    </div>
  );
}
