"use client";

import { useMemo } from "react";
import type { TechnicalPattern, SupportResistance } from "@/types/analysis";
import {
  INDICATOR_FAMILY_COLORS,
  INDICATOR_FAMILY_LABELS,
} from "@/components/charts/primitives/PatternMarkerHelper";

interface ChartLegendProps {
  supportResistance?: SupportResistance[];
  technicalPatterns?: TechnicalPattern[];
  showPatterns?: boolean;
}

const SIGNAL_COLORS: Record<string, string> = {
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

  // Derive unique indicator families present in the visible patterns
  const familyEntries = useMemo(() => {
    if (!hasPatterns) return [];
    const seen = new Set<string>();
    const entries: { key: string; color: string; label: string }[] = [];
    for (const p of technicalPatterns!) {
      const fam = p.indicator ?? "ai";
      if (seen.has(fam)) continue;
      seen.add(fam);
      const color =
        fam !== "ai" && INDICATOR_FAMILY_COLORS[fam]
          ? INDICATOR_FAMILY_COLORS[fam]
          : (SIGNAL_COLORS[p.type] ?? "#f59e0b");
      entries.push({
        key: fam,
        color,
        label:
          fam !== "ai"
            ? (INDICATOR_FAMILY_LABELS[fam] ?? fam.toUpperCase())
            : "AI Signals",
      });
    }
    return entries;
  }, [technicalPatterns, hasPatterns]);

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

      {/* Indicator-family legend (grouped, not per-pattern) */}
      {familyEntries.map((entry) => (
        <span key={entry.key} className="flex items-center gap-1">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: entry.color }}
          />
          {entry.label}
        </span>
      ))}
    </div>
  );
}
