"use client";

import { X, TrendingUp, TrendingDown, Minus, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type WhaleAlert } from "@/hooks/useApiData";
import {
  formatPremium,
  formatCurrency,
  formatNumber,
  formatDateTime,
} from "@/lib/utils/formatters";

interface Props {
  alert: WhaleAlert;
  onClose: () => void;
}

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger>
          <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-60 text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function WhaleAlertDetail({ alert, onClose }: Props) {
  const volOiRatio =
    alert.volume && alert.openInterest && alert.openInterest > 0
      ? (alert.volume / alert.openInterest).toFixed(2)
      : null;

  const volOiNum = volOiRatio ? parseFloat(volOiRatio) : null;

  // Calculate OTM distance
  const price = alert.underlyingPrice ?? alert.currentPrice ?? 0;
  const otmPct =
    price > 0 && alert.strike
      ? alert.callPut === "C"
        ? ((alert.strike - price) / price) * 100
        : ((price - alert.strike) / price) * 100
      : null;

  // DTE calculation
  const dte = alert.expiry
    ? Math.max(
        0,
        Math.round(
          (new Date(alert.expiry).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        ),
      )
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span className="font-mono">{alert.ticker}</span>
          <Badge variant={alert.callPut === "C" ? "default" : "destructive"}>
            {alert.callPut === "C" ? "CALL" : "PUT"}
          </Badge>
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <span className="sr-only">Close detail panel</span>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sentiment */}
        <div className="flex items-center gap-2">
          {alert.sentiment === "bullish" ? (
            <TrendingUp
              className="h-5 w-5 text-emerald-400"
              aria-hidden="true"
            />
          ) : alert.sentiment === "bearish" ? (
            <TrendingDown className="h-5 w-5 text-red-400" aria-hidden="true" />
          ) : (
            <Minus
              className="h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <span
            className={`text-lg font-semibold ${
              alert.sentiment === "bullish"
                ? "text-emerald-400"
                : "text-red-400"
            }`}
          >
            {alert.sentiment?.toUpperCase()}
          </span>
        </div>

        {/* Quality Score */}
        {alert.qualityScore != null && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  Trade Quality Score
                  <InfoTip text="A 0â€“100 composite score measuring the conviction behind this trade. Factors in volume/OI ratio, how far out-of-the-money the strike is, premium size, time to expiration, and sweep likelihood." />
                </span>
                <span
                  className={`text-sm font-bold ${
                    alert.qualityScore >= 70
                      ? "text-emerald-400"
                      : alert.qualityScore >= 40
                        ? "text-amber-400"
                        : "text-muted-foreground"
                  }`}
                >
                  {alert.qualityScore}/100
                </span>
              </div>
              <Progress
                value={alert.qualityScore}
                className="h-2"
                aria-label={`Quality score ${alert.qualityScore} out of 100`}
              />
              <p className="text-xs text-muted-foreground">
                {alert.qualityScore >= 70
                  ? "High conviction â€” strong signals across multiple factors"
                  : alert.qualityScore >= 40
                    ? "Moderate conviction â€” some positive signals detected"
                    : "Low conviction â€” may be hedging or routine activity"}
              </p>
            </div>
          </>
        )}

        <Separator />

        {/* Details grid with tooltips */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs flex items-center gap-1">
              Strike
              <InfoTip text="The price at which the option holder can buy (call) or sell (put) the underlying stock. Compared to the current stock price, this tells you how aggressive the bet is." />
            </p>
            <p className="font-medium">
              {alert.strike ? formatCurrency(alert.strike) : "â€”"}
              {otmPct != null && (
                <span
                  className={`ml-1 text-xs ${
                    otmPct > 0 ? "text-amber-400" : "text-blue-400"
                  }`}
                >
                  ({otmPct > 0 ? `${otmPct.toFixed(1)}% OTM` : "ITM"})
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs flex items-center gap-1">
              Expiry
              <InfoTip text="When the option contract expires. Shorter timeframes (under 7 days) suggest higher conviction â€” traders are paying for a quick directional bet." />
            </p>
            <p className="font-medium">
              {alert.expiry ?? "â€”"}
              {dte != null && (
                <span
                  className={`ml-1 text-xs ${
                    dte <= 7 ? "text-amber-400" : "text-muted-foreground"
                  }`}
                >
                  ({dte}d)
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs flex items-center gap-1">
              Premium
              <InfoTip text="Total dollar amount spent on this options trade. Large premiums ($100K+) indicate institutional-level bets, not retail traders." />
            </p>
            <p className="font-medium">
              {alert.premium ? formatPremium(alert.premium) : "â€”"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs flex items-center gap-1">
              Volume
              <InfoTip text="Number of contracts traded today. High volume relative to open interest suggests new positioning rather than closing existing trades." />
            </p>
            <p className="font-medium">
              {alert.volume ? formatNumber(alert.volume) : "â€”"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs flex items-center gap-1">
              Open Interest
              <InfoTip text="Total number of outstanding contracts for this strike/expiry. This represents existing positions that haven't been closed yet." />
            </p>
            <p className="font-medium">
              {alert.openInterest ? formatNumber(alert.openInterest) : "â€”"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs flex items-center gap-1">
              Vol/OI Ratio
              <InfoTip text="Volume divided by Open Interest. A ratio above 1.0 means today's trading exceeded all existing positions â€” a strong signal of new money entering. Above 3.0 is very aggressive." />
            </p>
            <p className="font-medium">
              {volOiRatio ? (
                <span
                  className={
                    volOiNum && volOiNum >= 3
                      ? "text-emerald-400"
                      : volOiNum && volOiNum >= 1
                        ? "text-amber-400"
                        : ""
                  }
                >
                  {volOiRatio}x
                </span>
              ) : (
                "â€”"
              )}
            </p>
          </div>
        </div>

        <Separator />

        {/* Underlying price */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Underlying Price</p>
            <p className="font-medium">
              {alert.underlyingPrice
                ? formatCurrency(alert.underlyingPrice)
                : "â€”"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Current Price</p>
            <p className="font-medium">
              {alert.currentPrice ? formatCurrency(alert.currentPrice) : "â€”"}
              {alert.dayChangePct != null && (
                <span
                  className={`ml-1 text-xs ${
                    alert.dayChangePct >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  ({alert.dayChangePct >= 0 ? "+" : ""}
                  {alert.dayChangePct.toFixed(2)}%)
                </span>
              )}
            </p>
          </div>
        </div>

        <Separator />

        <div className="text-xs text-muted-foreground">
          <p>Source: {alert.source ?? "unknown"}</p>
          {alert.detectedAt && (
            <p>Detected: {formatDateTime(alert.detectedAt)}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
