"use client";

import { useState, type KeyboardEvent } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  HelpCircle,
  Shield,
  Zap,
  Building2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useWhaleAlerts, type WhaleAlert } from "@/hooks/useApiData";
import {
  formatPremium,
  formatNumber,
  timeAgo,
  formatCurrency,
} from "@/lib/utils/formatters";
import WhaleAlertDetail from "./WhaleAlertDetail";
import WhaleAlertFilters, { type WhaleFilters } from "./WhaleAlertFilters";
import MarketPulseBar from "./MarketPulseBar";

export default function WhaleAlertsPage() {
  const [filters, setFilters] = useState<WhaleFilters>({});
  const [selected, setSelected] = useState<WhaleAlert | null>(null);

  const { data, isLoading } = useWhaleAlerts({
    ticker: filters.ticker || undefined,
    sentiment: filters.sentiment || undefined,
    minPremium: filters.minPremium || undefined,
    limit: 100,
  });

  const alerts = data?.alerts ?? [];
  const marketPulse = data?.marketPulse;

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    alert: WhaleAlert,
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelected(alert);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Whale Alerts</h1>
        <p className="text-muted-foreground text-sm">
          Unusual options activity detected across markets.
        </p>
      </div>

      <WhaleAlertFilters filters={filters} onChange={setFilters} />

      {marketPulse && <MarketPulseBar pulse={marketPulse} />}

      {/* Table — always full width */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {isLoading ? "Loading..." : `${alerts.length} alerts`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[600px]">
            <div className="pr-3">
              <Table>
                <caption className="sr-only">
                  Whale alerts table. Select a row to view detailed options flow
                  information.
                </caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Strike</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Premium</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">OI</TableHead>
                    <TableHead>Sentiment</TableHead>
                    <TableHead className="text-center">
                      <span className="flex items-center justify-center gap-1">
                        Quality
                        <TooltipProvider delay={200}>
                          <Tooltip>
                            <TooltipTrigger>
                              <HelpCircle className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              className="max-w-60 text-xs"
                            >
                              Trade quality score (0â€“100) based on Volume/OI
                              ratio, OTM distance, premium size, expiry timing,
                              and sweep likelihood. Higher = stronger conviction
                              signal.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </span>
                    </TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {alerts.length === 0 && !isLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="text-center text-muted-foreground py-8"
                      >
                        No whale alerts found. Run a pipeline refresh or adjust
                        filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    alerts.map((alert) => (
                      <TableRow
                        key={alert.id}
                        className={`cursor-pointer transition-colors ${
                          selected?.id === alert.id
                            ? "bg-muted"
                            : "hover:bg-muted/50"
                        }`}
                        role="button"
                        tabIndex={0}
                        aria-label={`View details for ${alert.ticker} ${alert.callPut === "C" ? "call" : "put"} option`}
                        onClick={() => setSelected(alert)}
                        onKeyDown={(event) => handleRowKeyDown(event, alert)}
                      >
                        <TableCell className="font-mono font-medium">
                          {alert.ticker}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              alert.callPut === "C" ? "default" : "destructive"
                            }
                            className="text-xs"
                          >
                            {alert.callPut === "C" ? "CALL" : "PUT"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {alert.strike ? formatCurrency(alert.strike) : "â€”"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {alert.expiry ?? "â€”"}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {alert.premium ? formatPremium(alert.premium) : "â€”"}
                        </TableCell>
                        <TableCell className="text-right">
                          {alert.volume ? formatNumber(alert.volume) : "â€”"}
                        </TableCell>
                        <TableCell className="text-right">
                          {alert.openInterest
                            ? formatNumber(alert.openInterest)
                            : "â€”"}
                        </TableCell>
                        <TableCell>
                          <SentimentBadge alert={alert} />
                        </TableCell>
                        <TableCell className="text-center">
                          {alert.qualityScore != null ? (
                            <QualityBadge score={alert.qualityScore} />
                          ) : (
                            "â€”"
                          )}
                        </TableCell>
                        <TableCell
                          className="text-xs text-muted-foreground"
                          suppressHydrationWarning
                        >
                          {alert.detectedAt ? timeAgo(alert.detectedAt) : "â€”"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Detail — sliding sidebar sheet */}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full sm:max-w-lg overflow-y-auto p-0"
        >
          {selected && (
            <WhaleAlertDetail
              alert={selected}
              onClose={() => setSelected(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function QualityBadge({ score }: { score: number }) {
  const variant =
    score >= 70 ? "default" : score >= 40 ? "secondary" : "outline";
  const color =
    score >= 70
      ? "text-emerald-400"
      : score >= 40
        ? "text-amber-400"
        : "text-muted-foreground";
  return (
    <Badge variant={variant} className={`text-xs ${color}`}>
      {score}
    </Badge>
  );
}

const sentimentConfig: Record<
  string,
  { label: string; color: string; icon: typeof TrendingUp }
> = {
  strongly_bullish: {
    label: "Strong Bull",
    color: "text-emerald-400",
    icon: TrendingUp,
  },
  bullish: { label: "Bullish", color: "text-emerald-300", icon: TrendingUp },
  neutral: { label: "Neutral", color: "text-muted-foreground", icon: Minus },
  bearish: { label: "Bearish", color: "text-red-300", icon: TrendingDown },
  strongly_bearish: {
    label: "Strong Bear",
    color: "text-red-400",
    icon: TrendingDown,
  },
};

const intentConfig: Record<
  string,
  {
    label: string;
    color: string;
    bg: string;
    icon: React.ReactNode;
    tip: string;
  }
> = {
  speculative: {
    label: "Speculative",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
    icon: <Zap className="h-2.5 w-2.5" aria-hidden="true" />,
    tip: "Far OTM + high volume vs. open interest — aggressive directional bet, not a hedge. Follow this signal more closely.",
  },
  institutional: {
    label: "Institutional",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    icon: <Building2 className="h-2.5 w-2.5" aria-hidden="true" />,
    tip: "Large premium placed near the current stock price. A confident, measured entry by a large institution — not a speculative long shot.",
  },
  hedge: {
    label: "Hedge",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    icon: <Shield className="h-2.5 w-2.5" aria-hidden="true" />,
    tip: "Deep ITM or high-delta contract. Likely protecting an existing short position, not a directional bet. Treat this signal with caution.",
  },
};

function SentimentBadge({ alert }: { alert: WhaleAlert }) {
  const key = alert.inferredSentiment ?? alert.sentiment ?? "";
  const config = sentimentConfig[key] ?? {
    label:
      alert.sentiment === "bullish"
        ? "Bullish"
        : alert.sentiment === "bearish"
          ? "Bearish"
          : "—",
    color:
      alert.sentiment === "bullish"
        ? "text-emerald-400"
        : alert.sentiment === "bearish"
          ? "text-red-400"
          : "text-muted-foreground",
    icon: Minus,
  };
  const Icon = config.icon;
  const intentCfg =
    alert.intentHint && alert.intentHint !== "unknown"
      ? intentConfig[alert.intentHint]
      : null;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${config.color}`} />
        <span className={`text-xs ${config.color}`}>{config.label}</span>
      </div>
      {intentCfg && (
        <TooltipProvider delay={200}>
          <Tooltip>
            <TooltipTrigger className="cursor-help">
              <div
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium w-fit ${intentCfg.color} ${intentCfg.bg}`}
                aria-label={`Intent: ${intentCfg.label}`}
              >
                {intentCfg.icon}
                {intentCfg.label}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-56 text-xs">
              {intentCfg.tip}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
