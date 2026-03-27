"use client";

import { X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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

export default function WhaleAlertDetail({ alert, onClose }: Props) {
  const volOiRatio =
    alert.volume && alert.openInterest && alert.openInterest > 0
      ? (alert.volume / alert.openInterest).toFixed(2)
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

        <Separator />

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Strike</p>
            <p className="font-medium">
              {alert.strike ? formatCurrency(alert.strike) : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Expiry</p>
            <p className="font-medium">{alert.expiry ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Premium</p>
            <p className="font-medium">
              {alert.premium ? formatPremium(alert.premium) : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Volume</p>
            <p className="font-medium">
              {alert.volume ? formatNumber(alert.volume) : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Open Interest</p>
            <p className="font-medium">
              {alert.openInterest ? formatNumber(alert.openInterest) : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Vol/OI Ratio</p>
            <p className="font-medium">{volOiRatio ? `${volOiRatio}x` : "—"}</p>
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
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Current Price</p>
            <p className="font-medium">
              {alert.currentPrice ? formatCurrency(alert.currentPrice) : "—"}
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
