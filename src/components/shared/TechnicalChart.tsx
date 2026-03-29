"use client";

import { useState, useCallback } from "react";
import { Separator } from "@/components/ui/separator";
import { useHistoricalData } from "@/hooks/useApiData";
import type { TechnicalPattern } from "@/types/analysis";
import type { DeepDiveAnalysis } from "@/types/analysis";
import PriceChart from "@/components/charts/PriceChart";
import ChartLegend from "@/components/charts/ChartLegend";
import { Eye, EyeOff } from "lucide-react";

const TIMEFRAMES = ["1wk", "1mo", "3mo", "6mo", "1y"] as const;
const TIMEFRAME_LABELS: Record<string, string> = {
  "1wk": "1W",
  "1mo": "1M",
  "3mo": "3M",
  "6mo": "6M",
  "1y": "1Y",
};

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
}: TechnicalChartProps) {
  const [timeframe, setTimeframe] = useState<string>("3mo");
  const [showPatterns, setShowPatterns] = useState(true);

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
          />
          <ChartLegend
            supportResistance={supportResistance}
            technicalPatterns={technicalPatterns}
            showPatterns={showPatterns}
          />
        </>
      )}
    </div>
  );
}
