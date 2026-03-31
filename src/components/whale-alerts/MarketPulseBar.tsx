"use client";

import {
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatPremium } from "@/lib/utils/formatters";
import type { MarketPulse } from "@/hooks/useApiData";

interface Props {
  pulse: MarketPulse;
}

export default function MarketPulseBar({ pulse }: Props) {
  // Sentiment score maps from -100..+100 to a display percentage 0..100
  const gaugeValue = Math.round((pulse.netSentimentScore + 100) / 2);

  const sentimentColor =
    pulse.netSentimentScore > 50
      ? "text-emerald-400"
      : pulse.netSentimentScore > 0
        ? "text-emerald-300"
        : pulse.netSentimentScore > -50
          ? "text-amber-400"
          : "text-red-400";

  const gaugeColor =
    pulse.netSentimentScore > 50
      ? "[&>div]:bg-emerald-500"
      : pulse.netSentimentScore > 0
        ? "[&>div]:bg-emerald-400"
        : pulse.netSentimentScore > -50
          ? "[&>div]:bg-amber-400"
          : "[&>div]:bg-red-400";

  return (
    <Card>
      <CardContent className="py-4 px-5">
        <div className="grid grid-cols-[minmax(220px,1fr)_auto_auto_auto] items-center gap-6 lg:grid-cols-[minmax(260px,1.5fr)_repeat(3,auto)]">
          {/* Sentiment Gauge — give it room to breathe */}
          <div className="flex items-start gap-3">
            <Activity className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span className="text-sm font-medium">Market Pulse</span>
                <span className={`text-xs font-medium ${sentimentColor}`}>
                  {pulse.sentimentLabel}
                </span>
              </div>
              <Progress value={gaugeValue} className={`h-2 ${gaugeColor}`} />
              <div className="flex justify-between text-[10px] text-muted-foreground/50 mt-1">
                <span>Bearish</span>
                <span>Bullish</span>
              </div>
            </div>
          </div>

          {/* Stats cluster */}
          <div className="flex items-center gap-5 border-l border-border pl-5">
            <div className="text-center">
              <div className="text-[11px] text-muted-foreground mb-0.5">
                P/C Ratio
              </div>
              <div className="text-sm font-mono font-medium">
                {pulse.pcRatio === 0
                  ? "0"
                  : pulse.pcRatio < 0.01
                    ? "<0.01"
                    : pulse.pcRatio.toFixed(2)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[11px] text-muted-foreground mb-0.5">
                Calls
              </div>
              <div className="flex items-center justify-center gap-1">
                <TrendingUp className="h-3 w-3 text-emerald-400" />
                <span className="text-sm font-medium">{pulse.callCount}</span>
              </div>
            </div>
            <div className="text-center">
              <div className="text-[11px] text-muted-foreground mb-0.5">
                Puts
              </div>
              <div className="flex items-center justify-center gap-1">
                {pulse.putCount > 0 ? (
                  <TrendingDown className="h-3 w-3 text-red-400" />
                ) : (
                  <span className="h-3 w-3 inline-flex items-center justify-center text-muted-foreground/40 text-xs">
                    —
                  </span>
                )}
                <span
                  className={`text-sm font-medium ${pulse.putCount === 0 ? "text-muted-foreground/60" : ""}`}
                >
                  {pulse.putCount}
                </span>
              </div>
            </div>
          </div>

          {/* Premium totals */}
          <div className="flex items-center gap-4 border-l border-border pl-5">
            <div className="text-center">
              <div className="text-[11px] text-muted-foreground mb-0.5">
                Call Premium
              </div>
              <div className="text-xs font-mono text-emerald-400">
                {formatPremium(pulse.callPremium)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-[11px] text-muted-foreground mb-0.5">
                Put Premium
              </div>
              <div
                className={`text-xs font-mono ${pulse.putPremium > 0 ? "text-red-400" : "text-muted-foreground/40"}`}
              >
                {pulse.putPremium > 0 ? formatPremium(pulse.putPremium) : "—"}
              </div>
            </div>
          </div>

          {/* Bearish Signal Callout */}
          {pulse.topBearishSignals.length > 0 && (
            <div className="flex items-center gap-2 border-l border-border pl-5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <div>
                <div className="text-[11px] text-amber-400 font-medium mb-0.5">
                  Bearish Signals
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pulse.topBearishSignals.map((s, i) => (
                    <Badge
                      key={`${s.ticker}-${s.strike}-${i}`}
                      variant="outline"
                      className="text-[10px] text-red-400 border-red-400/30"
                    >
                      {s.ticker} ${s.strike}P {formatPremium(s.premium)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
