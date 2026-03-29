"use client";

import { useState } from "react";
import type { DeepDiveAnalysis } from "@/types/analysis";
import { ChevronDown, ChevronUp, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatNumber } from "@/lib/utils/formatters";

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
  const {
    oi_walls,
    max_pain,
    gex_summary,
    iv_rv_spread,
    iv_rv_interpretation,
  } = optionsContext;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Options Context</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <StatItem
          label="IV Percentile"
          value={optionsContext.iv_percentile}
          explanation={optionsContext.iv_interpretation}
          tooltip="Implied Volatility percentile â€” how expensive options are relative to the past year. High IV = more expensive premiums."
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

        {/* IV-RV Spread */}
        {iv_rv_spread != null && (
          <StatItem
            label="IV-RV Spread"
            value={`${iv_rv_spread > 0 ? "+" : ""}${iv_rv_spread.toFixed(1)}%`}
            explanation={
              iv_rv_interpretation ??
              (iv_rv_spread > 5
                ? "IV is significantly above realized vol â€” options look overpriced. Selling strategies may benefit."
                : iv_rv_spread < -5
                  ? "IV is below realized vol â€” options look underpriced. Buying strategies may benefit."
                  : "IV and realized vol are close â€” options are fairly priced.")
            }
            tooltip="The difference between Implied Volatility (what the market expects) and Realized Volatility (what actually happened). A large positive spread means options are expensive relative to actual moves."
          />
        )}

        {/* Max Pain */}
        {max_pain != null && (
          <StatItem
            label="Max Pain"
            value={`$${max_pain.toFixed(2)}`}
            explanation="The price at which the most options (both calls and puts) would expire worthless â€” causing option holders the maximum loss. Stocks often drift toward max pain as expiration approaches, because market makers who sold options may hedge in ways that push price toward this level."
            tooltip="The strike price where the total value of all outstanding options is minimized. Price tends to gravitate here near expiration."
          />
        )}

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

      {/* OI Walls */}
      {oi_walls &&
        (oi_walls.call_walls.length > 0 || oi_walls.put_walls.length > 0) && (
          <>
            <Separator className="my-3" />
            <OIWallsDisplay oiWalls={oi_walls} maxPain={max_pain} />
          </>
        )}

      {/* GEX Summary */}
      {gex_summary && (
        <>
          <Separator className="my-3" />
          <GEXDisplay gex={gex_summary} />
        </>
      )}
    </div>
  );
}

function OIWallsDisplay({
  oiWalls,
  maxPain,
}: {
  oiWalls: NonNullable<DeepDiveAnalysis["options_context"]["oi_walls"]>;
  maxPain?: number | null;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-1">
          OI Walls
          <TooltipProvider delay={200}>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-xs">
                <p className="font-medium mb-1">Open Interest Walls</p>
                <p>
                  Strike prices with the highest concentration of open
                  contracts. Call walls act as <strong>resistance</strong>{" "}
                  (price ceilings) because market makers hedge by selling stock
                  at those levels. Put walls act as <strong>support</strong>{" "}
                  (price floors) for the opposite reason.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </p>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} OI walls details`}
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Call walls = resistance */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            Call Walls (Resistance)
          </p>
          {oiWalls.call_walls.length > 0 ? (
            oiWalls.call_walls.map((w, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs rounded-md border px-2 py-1"
              >
                <span className="font-mono font-medium">${w.strike}</span>
                <span className="text-muted-foreground">
                  {formatNumber(w.oi)} OI
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">None detected</p>
          )}
        </div>

        {/* Put walls = support */}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            Put Walls (Support)
          </p>
          {oiWalls.put_walls.length > 0 ? (
            oiWalls.put_walls.map((w, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs rounded-md border px-2 py-1"
              >
                <span className="font-mono font-medium">${w.strike}</span>
                <span className="text-muted-foreground">
                  {formatNumber(w.oi)} OI
                </span>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">None detected</p>
          )}
        </div>
      </div>

      {expanded && (
        <p className="text-xs text-muted-foreground border-l-2 border-muted pl-2 mt-2">
          Open Interest walls represent strike prices where large numbers of
          contracts are outstanding. Price tends to &quot;stick&quot; near these
          levels because options market makers dynamically hedge their positions
          â€” selling stock near call walls and buying stock near put walls.
          {maxPain != null &&
            ` Combined with a max pain of $${maxPain.toFixed(2)}, you can map the expected price range heading into expiration.`}
        </p>
      )}
    </div>
  );
}

function GEXDisplay({
  gex,
}: {
  gex: NonNullable<DeepDiveAnalysis["options_context"]["gex_summary"]>;
}) {
  const [expanded, setExpanded] = useState(false);
  const positioningLabel =
    gex.dealer_positioning === "long_gamma"
      ? "Long Gamma"
      : gex.dealer_positioning === "short_gamma"
        ? "Short Gamma"
        : "Neutral";
  const positioningColor =
    gex.dealer_positioning === "long_gamma"
      ? "text-emerald-400"
      : gex.dealer_positioning === "short_gamma"
        ? "text-red-400"
        : "text-muted-foreground";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium flex items-center gap-1">
          Gamma Exposure (GEX)
          <TooltipProvider delay={200}>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64 text-xs">
                <p className="font-medium mb-1">Gamma Exposure</p>
                <p>
                  Measures how options dealers are positioned.{" "}
                  <strong>Long gamma</strong> = dealers dampen moves (price
                  mean-reverts). <strong>Short gamma</strong> = dealers amplify
                  moves (price trends harder). This tells you whether to expect
                  choppy or trending markets.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </p>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} GEX explanation`}
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <div className="rounded-md border p-2">
          <p className="text-xs text-muted-foreground">Dealer Positioning</p>
          <p className={`text-sm font-medium ${positioningColor}`}>
            {positioningLabel}
          </p>
        </div>
        <div className="rounded-md border p-2">
          <p className="text-xs text-muted-foreground">Net GEX</p>
          <p className="text-sm font-medium">
            {gex.net_gex >= 0 ? "+" : ""}
            {formatNumber(Math.round(gex.net_gex))}
          </p>
        </div>
        {gex.gex_flip_level != null && (
          <div className="rounded-md border p-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              GEX Flip Level
              <TooltipProvider delay={200}>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-56 text-xs">
                    The price where dealer gamma flips from positive to
                    negative. Below this level, expect amplified moves
                    (trending). Above it, expect dampened moves
                    (mean-reversion).
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </p>
            <p className="text-sm font-medium font-mono">
              ${gex.gex_flip_level.toFixed(2)}
            </p>
          </div>
        )}
      </div>

      {expanded && (
        <div className="text-xs text-muted-foreground border-l-2 border-muted pl-2 mt-1 space-y-1">
          {gex.interpretation ? (
            <p>{gex.interpretation}</p>
          ) : (
            <>
              <p>
                {gex.dealer_positioning === "long_gamma"
                  ? 'Dealers are long gamma â€” they hedge by buying dips and selling rallies. This creates a "dampening" effect that keeps price in a range. Breakouts are less likely but more powerful when they occur.'
                  : gex.dealer_positioning === "short_gamma"
                    ? "Dealers are short gamma â€” they hedge by selling into dips and buying into rallies. This amplifies moves and creates trending behavior. Watch for breakouts and momentum plays."
                    : "Dealers have roughly neutral gamma exposure. No strong directional hedging pressure."}
              </p>
              {gex.gex_flip_level != null && (
                <p>
                  The GEX flip level at ${gex.gex_flip_level.toFixed(2)} is a
                  key pivot â€” price behavior changes character as it crosses
                  this level.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
