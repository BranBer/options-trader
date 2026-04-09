"use client";

import {
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  Shield,
  Zap,
  Building2,
} from "lucide-react";
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

type IntentHint = "speculative" | "institutional" | "hedge" | "unknown";

const INTENT_CONFIG: Record<
  IntentHint,
  {
    label: string;
    icon: React.ReactNode;
    colorClass: string;
    borderClass: string;
    bgClass: string;
    headline: string;
    explanation: string;
    takeaway: string;
  }
> = {
  hedge: {
    label: "Short Hedge",
    icon: <Shield className="h-4 w-4" aria-hidden="true" />,
    colorClass: "text-amber-400",
    borderClass: "border-amber-500/30",
    bgClass: "bg-amber-500/5",
    headline: "Likely protecting an existing short position",
    explanation:
      "Deep in-the-money options or high-delta contracts are a classic way for large institutions to hedge short stock exposure. Buying calls while short stock caps the upside risk — it is not necessarily a bullish bet on the company.",
    takeaway:
      "⚠️ Don't blindly follow this signal. The whale may be managing risk, not predicting a rally. Check if short interest in this name is elevated.",
  },
  speculative: {
    label: "Speculative Bet",
    icon: <Zap className="h-4 w-4" aria-hidden="true" />,
    colorClass: "text-violet-400",
    borderClass: "border-violet-500/30",
    bgClass: "bg-violet-500/5",
    headline: "Aggressive directional trade — not a hedge",
    explanation:
      "Far out-of-the-money options with volume eclipsing open interest signal a new, conviction-driven bet. No known existing position to protect — this institution is expecting a significant price move before expiry.",
    takeaway:
      "✅ Higher signal quality. This trade is more likely to reflect inside knowledge or strong conviction rather than routine hedging.",
  },
  institutional: {
    label: "Institutional Block",
    icon: <Building2 className="h-4 w-4" aria-hidden="true" />,
    colorClass: "text-blue-400",
    borderClass: "border-blue-500/30",
    bgClass: "bg-blue-500/5",
    headline: "Large measured entry near the current stock price",
    explanation:
      "A very large premium placed at-the-money (near the current price) typically means an institution is opening a significant directional position — not a speculative long shot, but a confident, deliberate bet.",
    takeaway:
      "📊 Watch volume over the next 1–3 days. Institutional blocks often front-run a catalyst (earnings, FDA approval, M&A). Check upcoming news dates.",
  },
  unknown: {
    label: "Intent Unclear",
    icon: <HelpCircle className="h-4 w-4" aria-hidden="true" />,
    colorClass: "text-muted-foreground",
    borderClass: "border-muted/30",
    bgClass: "bg-muted/5",
    headline: "Not enough data to classify this trade's purpose",
    explanation:
      "The available data (volume, OI, strike distance, Greeks) doesn't clearly suggest hedging, speculation, or an institutional block. This may be a small trade or one with missing data.",
    takeaway:
      "🔍 Use other signals: check the Vol/OI ratio, how far out-of-the-money the strike is, and whether news or earnings are coming up.",
  },
};

function IntentSignalPanel({
  intent,
  callPut,
}: {
  intent: IntentHint;
  callPut: string | null;
}) {
  const cfg = INTENT_CONFIG[intent] ?? INTENT_CONFIG.unknown;

  // Contextualise hedge explanation based on call vs put
  const contextNote =
    intent === "hedge" && callPut === "C"
      ? "Buying calls while holding a short stock position is called a 'short hedge' or 'short cover hedge' — the institution limits its losses if the stock price rises unexpectedly."
      : intent === "hedge" && callPut === "P"
        ? "Buying puts while holding long stock is standard portfolio insurance — the institution is capping downside risk, not necessarily predicting a crash."
        : null;

  return (
    <div
      className={`rounded-md border ${cfg.borderClass} ${cfg.bgClass} p-3 space-y-2`}
      role="region"
      aria-label="Whale intent classification"
    >
      <div className="flex items-center gap-2">
        <span className={cfg.colorClass}>{cfg.icon}</span>
        <span className={`text-sm font-semibold ${cfg.colorClass}`}>
          {cfg.label}
        </span>
        <InfoTip text="ML-derived classification based on strike distance from price, volume/OI ratio, premium size, and option Greeks. Helps distinguish hedging from directional speculation." />
      </div>
      <p className="text-xs font-medium text-foreground/80">{cfg.headline}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {cfg.explanation}
      </p>
      {contextNote && (
        <p className="text-xs text-muted-foreground leading-relaxed italic">
          {contextNote}
        </p>
      )}
      <p className={`text-xs font-medium ${cfg.colorClass} leading-relaxed`}>
        {cfg.takeaway}
      </p>
    </div>
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

        {/* Intent Signal Panel — hedging vs speculative vs institutional */}
        {alert.intentHint && (
          <>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                Intent Classification
                <InfoTip text="Automated analysis of whether this trade is likely a hedge (risk management), a speculative bet (directional conviction), or an institutional block (measured large entry)." />
              </p>
              <IntentSignalPanel
                intent={alert.intentHint as IntentHint}
                callPut={alert.callPut}
              />
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
