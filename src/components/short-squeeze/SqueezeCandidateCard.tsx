"use client";

import Link from "next/link";
import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, Zap, ExternalLink, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SqueezeScoreGauge } from "./SqueezeScoreGauge";
import { formatCurrency } from "@/lib/utils/formatters";
import type { SqueezeRankingEntry, ShortVolumeTrend } from "@/types/squeeze";
import { SkeletonCard } from "@/components/shared/Skeletons";
import WhaleDeepDive from "@/components/analysis/WhaleDeepDive";

interface Props {
  entry: SqueezeRankingEntry;
}

const TREND_ICONS: Record<ShortVolumeTrend, React.ReactNode> = {
  accelerating: <TrendingUp className="h-3 w-3 text-red-400" />,
  rising: <TrendingUp className="h-3 w-3 text-amber-400" />,
  flat: <Minus className="h-3 w-3 text-muted-foreground" />,
  falling: <TrendingDown className="h-3 w-3 text-emerald-400" />,
};

const TREND_LABELS: Record<ShortVolumeTrend, string> = {
  accelerating: "↑ Accelerating",
  rising: "↑ Rising",
  flat: "→ Flat",
  falling: "↓ Easing",
};

const TREND_COLORS: Record<ShortVolumeTrend, string> = {
  accelerating: "text-red-400",
  rising: "text-amber-400",
  flat: "text-muted-foreground",
  falling: "text-emerald-400",
};

/** S51-23: 5-point sparkline for FINRA short volume trend */
function ShortVolumeSpark({
  history,
  trend,
}: {
  history: { date: string; shortVolumePct: number }[];
  trend: ShortVolumeTrend;
}) {
  if (history.length < 3) {
    return (
      <span className="text-xs text-muted-foreground">Trend: insufficient data</span>
    );
  }

  const W = 56;
  const H = 24;
  const pts = history.slice(-5);
  const min = Math.min(...pts.map((p) => p.shortVolumePct));
  const max = Math.max(...pts.map((p) => p.shortVolumePct));
  const range = max - min || 0.01;

  const toX = (i: number) => (i / (pts.length - 1)) * W;
  const toY = (v: number) => H - ((v - min) / range) * (H - 4) - 2;

  const polyline = pts
    .map((p, i) => `${toX(i).toFixed(1)},${toY(p.shortVolumePct).toFixed(1)}`)
    .join(" ");

  const fillColor =
    trend === "accelerating" || trend === "rising" ? "#ef4444" : trend === "flat" ? "#ca8a04" : "#22c55e";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <div className="flex items-center gap-1.5 cursor-default">
            <svg
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              aria-hidden="true"
              className="shrink-0"
            >
              <polyline
                points={polyline}
                fill="none"
                stroke={fillColor}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={toX(i)}
                  cy={toY(p.shortVolumePct)}
                  r="2"
                  fill={fillColor}
                />
              ))}
            </svg>
            <span className={`text-xs font-medium ${TREND_COLORS[trend]}`}>
              {TREND_LABELS[trend]}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-0.5 text-xs">
            {pts.map((p) => (
              <div key={p.date} className="flex justify-between gap-4">
                <span className="text-muted-foreground">{p.date}</span>
                <span className="font-medium">{(p.shortVolumePct * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SqueezeCandidateCard({ entry }: Props) {
  const [isDeepDiveOpen, setIsDeepDiveOpen] = useState(false);

  const shortPct = entry.shortPercentOfFloat != null
    ? `${(entry.shortPercentOfFloat * 100).toFixed(1)}%`
    : "—";
  const dtc = entry.shortRatio != null
    ? `${entry.shortRatio.toFixed(1)}d`
    : "—";

  const whalePremium = entry.components.whalePremium > 0
    ? formatCurrency(
        // Reverse-map from score back to the input range (approximate display only)
        entry.components.whalePremium >= 20 ? 5_000_001
        : entry.components.whalePremium >= 15 ? 2_000_001
        : entry.components.whalePremium >= 10 ? 1_000_001
        : entry.components.whalePremium >= 6 ? 500_001
        : 100_001,
      )
    : null;

  const siFresh =
    entry.shortVolumeDate
      ? (Date.now() - new Date(entry.shortVolumeDate).getTime()) / 86_400_000 <= 14
      : true;

  const trend = entry.components.shortVolumeTrend;

  return (
    <>
      <Card className="relative overflow-hidden">
        <CardContent className="p-4">
          {/* Header row */}
          <div className="flex items-start gap-3">
            {/* Gauge */}
            <SqueezeScoreGauge result={entry} size={80} />

            {/* Ticker + metrics */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold tracking-tight">{entry.ticker}</span>
                <Badge
                  variant="outline"
                  className={
                    entry.squeezeRisk === "extreme"
                      ? "border-red-500 text-red-400"
                      : entry.squeezeRisk === "high"
                        ? "border-orange-500 text-orange-400"
                        : entry.squeezeRisk === "moderate"
                          ? "border-yellow-500 text-yellow-400"
                          : "border-emerald-500 text-emerald-400"
                  }
                >
                  {entry.squeezeRisk === "extreme"
                    ? "Critical"
                    : entry.squeezeRisk === "high"
                      ? "Elevated"
                      : entry.squeezeRisk === "moderate"
                        ? "Developing"
                        : "Low Pressure"}
                </Badge>

                {!siFresh && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <span className="flex items-center gap-1 text-xs text-amber-400 cursor-default">
                          <AlertTriangle className="h-3 w-3" />
                          SI stale
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        SI data may be stale (&gt;14 days). FINRA reports on a bi-monthly schedule.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Short float</span>
                  <span className="font-medium">{shortPct}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Days to cover</span>
                  <span className="font-medium">{dtc}</span>
                </div>
                {entry.shortVolumeDate && (
                  <div className="flex items-center justify-between col-span-2">
                    <span className="text-muted-foreground">SI date</span>
                    <span className="font-medium text-xs">{entry.shortVolumeDate}</span>
                  </div>
                )}
              </div>

              {/* Whale flow row */}
              {whalePremium && (
                <div className="flex items-center gap-1.5 text-sm text-emerald-400">
                  <Zap className="h-3.5 w-3.5" />
                  <span>{whalePremium} bullish flow (48h)</span>
                </div>
              )}

              {/* FINRA trend sparkline */}
              {trend && entry.shortVolumeHistory && entry.shortVolumeHistory.length >= 3 && (
                <ShortVolumeSpark history={entry.shortVolumeHistory} trend={trend} />
              )}
            </div>
          </div>

          {/* Action row */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsDeepDiveOpen(true)}
              className="h-7 text-xs"
            >
              Deep Dive
            </Button>

            <Link
              href={`/whale-alerts?ticker=${entry.ticker}`}
              className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "h-7 text-xs")}
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Whale Flow
            </Link>
          </div>
        </CardContent>
      </Card>

      <Sheet open={isDeepDiveOpen} onOpenChange={setIsDeepDiveOpen}>
        <SheetContent
          side="right"
          className="data-[side=right]:w-full data-[side=right]:sm:max-w-5xl overflow-y-auto gap-0 p-0"
        >
          <SheetHeader className="border-b border-border/60 bg-background/95 sticky top-0 z-10 backdrop-blur supports-backdrop-filter:bg-background/75">
            <SheetTitle>{entry.ticker} Deep Dive</SheetTitle>
            <SheetDescription>
              Full thesis, trigger context, options positioning, and risk review for this squeeze candidate.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <WhaleDeepDive ticker={entry.ticker} autoGenerateIfMissing />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function SqueezeCandidateCardSkeleton() {
  return <SkeletonCard />;
}
