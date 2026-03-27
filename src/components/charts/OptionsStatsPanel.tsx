"use client";

import { useState } from "react";
import type { DeepDiveAnalysis } from "@/types/analysis";
import { ChevronDown, ChevronUp } from "lucide-react";

interface OptionsStatsPanelProps {
  optionsContext: DeepDiveAnalysis["options_context"];
}

interface StatItemProps {
  label: string;
  value: string;
  explanation: string;
}

function StatItem({ label, value, explanation }: StatItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border p-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} explanation for ${label}`}
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <p className="text-sm font-medium">{value}</p>
      {expanded && (
        <p className="text-xs text-muted-foreground mt-1 border-l-2 border-muted pl-2">
          {explanation}
        </p>
      )}
    </div>
  );
}

export default function OptionsStatsPanel({
  optionsContext,
}: OptionsStatsPanelProps) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Options Context</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <StatItem
          label="IV Percentile"
          value={optionsContext.iv_percentile}
          explanation={optionsContext.iv_interpretation}
        />
        <StatItem
          label="Put/Call Ratio"
          value={optionsContext.put_call_ratio}
          explanation="The ratio of put volume to call volume. Above 1.0 suggests more bearish positioning; below 1.0 suggests more bullish positioning."
        />
        <StatItem
          label="Unusual Activity"
          value={optionsContext.unusual_activity_note.length > 50
            ? optionsContext.unusual_activity_note.slice(0, 50) + "..."
            : optionsContext.unusual_activity_note}
          explanation={optionsContext.unusual_activity_note}
        />
        <div className="col-span-2 md:col-span-3">
          <StatItem
            label="Greeks Summary"
            value={optionsContext.greeks_summary.length > 80
              ? optionsContext.greeks_summary.slice(0, 80) + "..."
              : optionsContext.greeks_summary}
            explanation={optionsContext.greeks_summary}
          />
        </div>
      </div>
    </div>
  );
}
