"use client";

import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type ConfidenceBreakdown } from "@/hooks/useApiData";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";

export const FACTOR_TOOLTIPS: Record<string, string> = {
  "AI Correlation":
    "How confidently the AI model linked this whale trade to a related news event or catalyst.",
  "Whale Quality":
    "Quality score of the underlying whale trade — based on Volume/OI ratio, OTM aggressiveness, premium size, and timing.",
  "Technical Alignment":
    "Whether the price chart patterns (support/resistance, indicators) agree with the thesis direction.",
  "IV Regime":
    "Whether implied volatility supports the recommended strategy. Extreme IV (high or low) is a stronger signal than mid-range.",
  "VIX Regime":
    "Market-wide fear gauge. High VIX increases risk but can also present opportunities if the thesis accounts for it.",
  "Earnings Risk":
    "Proximity to earnings announcements. Upcoming earnings add uncertainty that can quickly move prices.",
  "Insider Alignment":
    "Whether company insiders (executives, directors) have been buying or selling — aligned insider activity strengthens conviction.",
  "Sector Momentum":
    "Whether the stock's sector is in a favorable rotation. Outperforming sectors give a tailwind to individual stocks.",
};

export function ConfidenceBreakdownPanel({
  breakdown,
}: {
  breakdown: ConfidenceBreakdown;
}) {
  const [expanded, setExpanded] = useState(false);
  const factors = breakdown.factors;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-1">
          Confidence Breakdown
          <TooltipProvider delay={200}>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-xs">
                The overall confidence score is a weighted combination of
                multiple independent signals. Each factor contributes based on
                its weight and how favorable the data is for the thesis.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </p>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} confidence factor details`}
        >
          {expanded ? "Hide details" : "Show details"}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Stacked bar visualization */}
      <div className="space-y-1">
        <div className="flex h-3 rounded-full overflow-hidden bg-muted">
          {factors
            .filter((f) => f.contribution > 0)
            .map((f, i) => {
              const pct = f.contribution * 100;
              return (
                <TooltipProvider key={i} delay={200}>
                  <Tooltip>
                    <TooltipTrigger
                      className={`h-full transition-all cursor-default ${
                        f.value >= 0.6
                          ? "bg-emerald-500"
                          : f.value >= 0.4
                            ? "bg-amber-500"
                            : "bg-red-400"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                    <TooltipContent side="top" className="text-xs">
                      {f.name}: {(f.value * 100).toFixed(0)}% (weight:{" "}
                      {(f.weight * 100).toFixed(0)}%)
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            })}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0%</span>
          <span>Composite: {(breakdown.composite * 100).toFixed(0)}%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Expanded factor list */}
      {expanded && (
        <div className="space-y-1.5 pt-1">
          {factors.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-xs rounded-md border p-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-medium">{f.name}</span>
                  {FACTOR_TOOLTIPS[f.name] && (
                    <TooltipProvider delay={200}>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-56 text-xs">
                          {FACTOR_TOOLTIPS[f.name]}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <span className="text-muted-foreground ml-auto">
                    {(f.weight * 100).toFixed(0)}% weight
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5">{f.description}</p>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={`font-medium ${
                    f.value >= 0.6
                      ? "text-emerald-400"
                      : f.value >= 0.4
                        ? "text-amber-400"
                        : "text-red-400"
                  }`}
                >
                  {(f.value * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
