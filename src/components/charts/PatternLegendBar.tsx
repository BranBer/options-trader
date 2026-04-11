"use client";

import type { CalloutEntry } from "./primitives/CalloutAnnotationPrimitive";

interface PatternLegendBarProps {
  entries: CalloutEntry[];
}

const DIRECTION_GLYPH: Record<CalloutEntry["direction"], string> = {
  bullish: "▲",
  bearish: "▼",
  neutral: "●",
};

export default function PatternLegendBar({ entries }: PatternLegendBarProps) {
  if (entries.length === 0) return null;

  return (
    <div
      className="flex flex-wrap gap-1"
      role="list"
      aria-label="Pattern legend"
    >
      {entries.map((entry, i) => {
        const order = i + 1;
        return (
          <span
            key={entry.id}
            role="listitem"
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-tight bg-black/75"
          >
            {/* Numbered badge */}
            <span
              className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-black/90"
              style={{ backgroundColor: entry.color }}
            >
              {order}
            </span>
            {/* Direction glyph */}
            <span className="text-[9px]" style={{ color: entry.color }}>
              {DIRECTION_GLYPH[entry.direction]}
            </span>
            {/* Pattern name */}
            <span className="font-semibold" style={{ color: entry.color }}>
              {entry.label}
            </span>
            {/* Timestamp */}
            {entry.timestamp && (
              <span className="text-[10px] text-white/50">
                {entry.timestamp}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
