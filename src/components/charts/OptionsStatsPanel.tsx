"use client";

import { useState } from "react";
import type { DeepDiveAnalysis } from "@/types/analysis";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface OptionsStatsPanelProps {
  optionsContext: DeepDiveAnalysis["options_context"];
}

interface StatItemProps {
  label: string;
  value: string;
  explanation: string;
  tooltip?: string;
}

function StatItem({ label, value, explanation, tooltip }: StatItemProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border p-3 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          {label}
          {tooltip && (
            <TooltipProvider delay={200}>
              <Tooltip>
                <TooltipTrigger>
                  <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-56 text-xs">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </span>
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

const GREEK_LABELS: Record<string, string> = {
  delta: "\u0394 Delta",
  gamma: "\u0393 Gamma",
  theta: "\u0398 Theta",
  vega: "\u03BD Vega",
  rho: "\u03C1 Rho",
};

const IMPLICATION_COLORS: Record<string, string> = {
  favorable: "text-green-500",
  neutral: "text-muted-foreground",
  unfavorable: "text-red-400",
};

function GreeksBreakdown({
  breakdown,
}: {
  breakdown: NonNullable<
    DeepDiveAnalysis["options_context"]["greeks_breakdown"]
  >;
}) {
  return (
    <div className="col-span-2 md:col-span-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">
        Greeks Breakdown
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {breakdown.map((g) => (
          <div key={g.greek} className="rounded-md border p-2 space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">
                {GREEK_LABELS[g.greek] ?? g.greek}
              </span>
              <span
                className={`text-[10px] ${IMPLICATION_COLORS[g.implication] ?? ""}`}
              >
                {g.implication}
              </span>
            </div>
            <p className="text-sm font-semibold">{g.value}</p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {g.plain_english}
            </p>
          </div>
        ))}
      </div>
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
          tooltip="Implied Volatility percentile — how expensive options are relative to the past year. High IV = more expensive premiums."
        />
        <StatItem
          label="Put/Call Ratio"
          value={optionsContext.put_call_ratio}
          explanation="The ratio of put volume to call volume. Above 1.0 suggests more bearish positioning; below 1.0 suggests more bullish positioning."
          tooltip="Compares the volume of puts vs calls. Extreme values can signal contrarian opportunities."
        />
        <StatItem
          label="Unusual Activity"
          value={
            optionsContext.unusual_activity_note.length > 50
              ? optionsContext.unusual_activity_note.slice(0, 50) + "..."
              : optionsContext.unusual_activity_note
          }
          explanation={optionsContext.unusual_activity_note}
        />
        {optionsContext.greeks_breakdown &&
        optionsContext.greeks_breakdown.length > 0 ? (
          <GreeksBreakdown breakdown={optionsContext.greeks_breakdown} />
        ) : (
          <div className="col-span-2 md:col-span-3">
            <StatItem
              label="Greeks Summary"
              value={
                optionsContext.greeks_summary.length > 80
                  ? optionsContext.greeks_summary.slice(0, 80) + "..."
                  : optionsContext.greeks_summary
              }
              explanation={optionsContext.greeks_summary}
            />
          </div>
        )}
      </div>
    </div>
  );
}
