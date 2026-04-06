"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  InfoTooltip,
  INDICATOR_EXPLAINERS,
} from "@/components/charts/IndicatorExplainers";
import type {
  CombinationPattern,
  IndicatorPattern,
  IndicatorPatternReport,
} from "@/lib/utils/indicator-patterns";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Lightbulb } from "lucide-react";

const INDICATOR_LABELS: Record<IndicatorPattern["indicator"], string> = {
  ema: "EMA",
  bollinger: "BB",
  rsi: "RSI",
  macd: "MACD",
  volume: "Volume",
};

function indicatorExplainerKey(pattern: IndicatorPattern): string | null {
  if (pattern.indicator === "ema") {
    if (/21/.test(pattern.name)) return "ema21";
    return "ema9";
  }
  if (pattern.indicator === "bollinger") return "bollinger";
  if (pattern.indicator === "rsi") return "rsi";
  if (pattern.indicator === "macd") return "macd";
  if (pattern.indicator === "volume") return "volumeMA";
  return null;
}

function signalVariant(
  signal: IndicatorPattern["signal"] | CombinationPattern["signal"],
) {
  if (signal === "bullish") return "default" as const;
  if (signal === "bearish") return "destructive" as const;
  return "secondary" as const;
}

function signalTone(
  signal: IndicatorPattern["signal"] | CombinationPattern["signal"],
) {
  if (signal === "bullish")
    return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
  if (signal === "bearish")
    return "text-red-400 border-red-500/30 bg-red-500/10";
  return "text-amber-300 border-amber-500/30 bg-amber-500/10";
}

function humanizeTimeframe(timeframe?: string) {
  if (!timeframe) return "active timeframe";
  return timeframe;
}

function PatternCard({
  pattern,
  compact = false,
}: {
  pattern: IndicatorPattern;
  compact?: boolean;
}) {
  const explainerKey = indicatorExplainerKey(pattern);
  const label = INDICATOR_LABELS[pattern.indicator];

  return (
    <div className="rounded-lg border p-3 space-y-2 bg-card/60">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="shrink-0">
              {label}
            </Badge>
            <span className="min-w-0 text-sm font-medium leading-tight">
              {pattern.name}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {pattern.detectedDate
              ? pattern.detectedDate.slice(0, 10)
              : "recent"}{" "}
            · {pattern.patternId}
          </p>
        </div>

        <Badge variant={signalVariant(pattern.signal)} className="shrink-0">
          {pattern.signal}
        </Badge>
      </div>

      <Progress value={Math.round(pattern.confidence * 100)} className="h-2" />

      <p
        className={cn(
          "text-xs text-muted-foreground leading-relaxed",
          compact ? "line-clamp-2" : "",
        )}
      >
        {pattern.description}
      </p>

      {explainerKey && INDICATOR_EXPLAINERS[explainerKey] ? (
        <div className="flex items-center justify-between gap-2 pt-1">
          <InfoTooltip text="" indicatorKey={explainerKey} />
          <span className="text-[11px] text-muted-foreground">Learn more</span>
        </div>
      ) : null}
    </div>
  );
}

function CombinationCard({ combination }: { combination: CombinationPattern }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2",
        signalTone(combination.signal),
      )}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="shrink-0">
              Confluence
            </Badge>
            <span className="text-sm font-medium">{combination.name}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {combination.constituentPatternIds.join(" + ")}
          </p>
        </div>
        <Badge variant={signalVariant(combination.signal)} className="shrink-0">
          {Math.round(combination.confidence * 100)}%
        </Badge>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {combination.educationalNote}
      </p>
    </div>
  );
}

export default function IndicatorPatternSummary({
  report,
}: {
  report: IndicatorPatternReport | null | undefined;
}) {
  const [showAll, setShowAll] = useState(false);

  const visiblePatterns = useMemo(() => {
    if (!report) return [];
    return showAll ? report.patterns : report.patterns.slice(0, 4);
  }, [report, showAll]);

  if (
    !report ||
    (report.patterns.length === 0 && report.combinations.length === 0)
  ) {
    return (
      <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground bg-muted/20">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          Technical Signal Summary
        </div>
        <p className="mt-2 text-xs leading-relaxed">
          No clear computed indicator pattern cluster was detected for this
          chart yet.
        </p>
      </div>
    );
  }

  const bullish = report.patterns.filter(
    (pattern) => pattern.signal === "bullish",
  ).length;
  const bearish = report.patterns.filter(
    (pattern) => pattern.signal === "bearish",
  ).length;
  const neutral = report.patterns.filter(
    (pattern) => pattern.signal === "neutral",
  ).length;

  return (
    <div className="space-y-4 rounded-xl border bg-card/70 p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Lightbulb className="h-4 w-4 text-amber-400" />
            <h4 className="text-sm font-semibold">Technical Signal Summary</h4>
            <Badge variant={signalVariant(report.aggregateSignal.direction)}>
              {report.aggregateSignal.direction}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {report.aggregateSignal.summary}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Detected on {humanizeTimeframe(report.timeframe)} · computed{" "}
            {new Date(report.computedAt).toLocaleString()}
          </p>
        </div>

        <div className="min-w-45 max-w-65 space-y-1">
          <Progress
            value={Math.round(report.aggregateSignal.strength * 100)}
            className="h-2"
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{bullish} bullish</span>
            <span>{bearish} bearish</span>
            <span>{neutral} neutral</span>
          </div>
        </div>
      </div>

      {report.combinations.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Combination Patterns
            </h5>
            <Badge variant="outline">{report.combinations.length}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {report.combinations.slice(0, 4).map((combination) => (
              <CombinationCard
                key={combination.patternId}
                combination={combination}
              />
            ))}
          </div>
        </div>
      )}

      <Separator />

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Individual Patterns
          </h5>
          {report.patterns.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted/80 transition-colors"
            >
              {showAll ? (
                <>
                  Show Less <ChevronUp className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Show All <ChevronDown className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visiblePatterns.map((pattern) => (
            <PatternCard
              key={`${pattern.patternId}-${pattern.detectedAt}`}
              pattern={pattern}
              compact={!showAll}
            />
          ))}
        </div>

        {!showAll && report.patterns.length > 4 && (
          <p className="text-[11px] text-muted-foreground">
            Showing the 4 most recent signals. Expand to see the full computed
            pattern set.
          </p>
        )}
      </div>
    </div>
  );
}
