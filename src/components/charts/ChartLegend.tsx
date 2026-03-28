"use client";

import type { TechnicalPattern, SupportResistance } from "@/types/analysis";

interface ChartLegendProps {
  supportResistance?: SupportResistance[];
  technicalPatterns?: TechnicalPattern[];
  showPatterns?: boolean;
}

const PATTERN_COLORS: Record<string, string> = {
  bullish: "#22c55e",
  bearish: "#ef4444",
  neutral: "#f59e0b",
};

export default function ChartLegend({
  supportResistance,
  technicalPatterns,
  showPatterns,
}: ChartLegendProps) {
  const hasSupport = supportResistance?.some((s) => s.type === "support");
  const hasResistance = supportResistance?.some((s) => s.type === "resistance");
  const hasPatterns =
    showPatterns && technicalPatterns && technicalPatterns.length > 0;

  if (!hasSupport && !hasResistance && !hasPatterns) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-muted-foreground">
      {/* Candle legend */}
      <span className="flex items-center gap-1">
        <span
          className="inline-block w-2 h-2 rounded-sm"
          style={{ background: "#22c55e" }}
        />
        <span
          className="inline-block w-2 h-2 rounded-sm"
          style={{ background: "#ef4444" }}
        />
        Candles
      </span>

      {/* Support / Resistance */}
      {hasSupport && (
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 border-t-2 border-dashed"
            style={{ borderColor: "#22c55e" }}
          />
          Support
        </span>
      )}
      {hasResistance && (
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 border-t-2 border-dashed"
            style={{ borderColor: "#ef4444" }}
          />
          Resistance
        </span>
      )}

      {/* Pattern overlays */}
      {hasPatterns &&
        technicalPatterns!.map((p, i) => (
          <span key={i} className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: PATTERN_COLORS[p.type] ?? "#f59e0b" }}
            />
            {p.name}
          </span>
        ))}
    </div>
  );
}
