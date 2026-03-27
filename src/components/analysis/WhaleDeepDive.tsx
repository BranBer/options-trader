"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useDeepDive, useHistoricalData } from "@/hooks/useApiData";
import type { DeepDiveAnalysis } from "@/types/analysis";
import PriceChart from "@/components/charts/PriceChart";
import OptionsStatsPanel from "@/components/charts/OptionsStatsPanel";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BookOpen,
  Target,
  AlertTriangle,
  Globe,
} from "lucide-react";

const TIMEFRAMES = ["1wk", "1mo", "3mo", "6mo", "1y"] as const;
const TIMEFRAME_LABELS: Record<string, string> = {
  "1wk": "1W",
  "1mo": "1M",
  "3mo": "3M",
  "6mo": "6M",
  "1y": "1Y",
};

interface WhaleDeepDiveProps {
  ticker: string;
}

export default function WhaleDeepDive({ ticker }: WhaleDeepDiveProps) {
  const [timeframe, setTimeframe] = useState<string>("3mo");

  const { data: deepDiveData, isLoading: ddLoading } = useDeepDive(ticker);
  const { data: histData, isLoading: histLoading } = useHistoricalData(
    ticker,
    timeframe,
  );

  const deepDive = deepDiveData?.analyses?.[0]?.output as
    | DeepDiveAnalysis
    | undefined;
  const candles = histData?.candles ?? [];

  if (ddLoading) {
    return (
      <div className="p-4 text-sm text-muted-foreground animate-pulse">
        Loading deep dive analysis for {ticker}...
      </div>
    );
  }

  if (!deepDive) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No deep dive analysis available for {ticker} yet. It will be generated
        during the next pipeline refresh.
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 border-t bg-muted/20">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Target className="h-4 w-4" />
          Deep Dive: {ticker}
        </h3>
        <p className="text-sm mt-1">{deepDive.whale_trade_summary}</p>
      </div>

      {/* Market Narrative */}
      <div>
        <p className="text-sm">{deepDive.market_narrative}</p>
      </div>

      <Separator />

      {/* Price Chart with timeframe toggle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Price Action</p>
          <div className="flex gap-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  timeframe === tf
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                aria-pressed={timeframe === tf}
              >
                {TIMEFRAME_LABELS[tf]}
              </button>
            ))}
          </div>
        </div>
        {histLoading ? (
          <div className="flex items-center justify-center h-75 text-sm text-muted-foreground animate-pulse">
            Loading chart data...
          </div>
        ) : (
          <PriceChart
            candles={candles}
            supportResistance={deepDive.support_resistance}
            height={300}
          />
        )}
      </div>

      <Separator />

      {/* Technical Patterns */}
      {deepDive.technical_patterns.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Technical Patterns</p>
          <div className="space-y-2">
            {deepDive.technical_patterns.map((p, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <PatternIcon type={p.type} />
                <div>
                  <span className="font-medium">{p.name}</span>
                  <Badge
                    variant={
                      p.type === "bullish"
                        ? "default"
                        : p.type === "bearish"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-xs ml-2"
                  >
                    {p.type}
                  </Badge>
                  {p.price_target && (
                    <span className="text-xs text-muted-foreground ml-2">
                      Target: ${p.price_target.toFixed(2)}
                    </span>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {p.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Indicators */}
      {deepDive.indicators.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Technical Indicators</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {deepDive.indicators.map((ind, i) => (
              <div key={i} className="rounded-md border p-2 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{ind.name}</span>
                  <Badge
                    variant={
                      ind.signal === "bullish"
                        ? "default"
                        : ind.signal === "bearish"
                          ? "destructive"
                          : "secondary"
                    }
                    className="text-xs"
                  >
                    {ind.signal}
                  </Badge>
                </div>
                <p className="text-muted-foreground">
                  {ind.value} — {ind.explanation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Options Context */}
      <OptionsStatsPanel optionsContext={deepDive.options_context} />

      <Separator />

      {/* Entry/Exit Strategy */}
      <div className="space-y-2">
        <p className="text-sm font-medium flex items-center gap-2">
          <Target className="h-4 w-4" />
          Entry/Exit Strategy
        </p>
        <div className="rounded-md border p-3 space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-muted-foreground">
                Recommended Option
              </span>
              <p className="font-medium">
                {deepDive.entry_exit.recommended_option_type}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Strike</span>
              <p className="font-medium">
                {deepDive.entry_exit.strike_selection}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Entry Range</span>
              <p className="font-medium">
                ${deepDive.entry_exit.entry_price_range.low.toFixed(2)} – $
                {deepDive.entry_exit.entry_price_range.high.toFixed(2)}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Expiry</span>
              <p className="font-medium">
                {deepDive.entry_exit.expiry_guidance}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">
                Profit Target
              </span>
              <p className="font-medium text-green-500">
                {deepDive.entry_exit.profit_target}
              </p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Stop Loss</span>
              <p className="font-medium text-red-500">
                {deepDive.entry_exit.stop_loss}
              </p>
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">
              Position Sizing
            </span>
            <p className="text-xs">{deepDive.entry_exit.position_sizing}</p>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Rationale</span>
            <p className="text-xs">{deepDive.entry_exit.rationale}</p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Global Events Connection */}
      <div className="space-y-1">
        <p className="text-sm font-medium flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Global Events Connection
        </p>
        <p className="text-sm">{deepDive.global_events_connection}</p>
      </div>

      {/* Risk Assessment */}
      <div className="space-y-2">
        <p className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Risk Assessment
        </p>
        <div className="flex items-center gap-2">
          <RiskBadge risk={deepDive.risk_assessment.overall_risk} />
          <span className="text-xs text-muted-foreground">
            Max allocation:{" "}
            {deepDive.risk_assessment.max_recommended_allocation}
          </span>
        </div>
        <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
          {deepDive.risk_assessment.key_risks.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>

      {/* Educational Notes */}
      {deepDive.educational_notes.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Learn More
            </p>
            <div className="space-y-1">
              {deepDive.educational_notes.map((note, i) => (
                <details key={i} className="text-xs group">
                  <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground transition-colors">
                    {note.term}
                  </summary>
                  <p className="mt-1 pl-4 text-muted-foreground border-l-2 border-muted">
                    {note.explanation}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">
        {deepDive.disclaimer}
      </p>
    </div>
  );
}

function PatternIcon({ type }: { type: string }) {
  switch (type) {
    case "bullish":
      return <TrendingUp className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />;
    case "bearish":
      return <TrendingDown className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />;
    default:
      return (
        <Minus className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      );
  }
}

function RiskBadge({ risk }: { risk: string }) {
  const variant =
    risk === "low"
      ? "default"
      : risk === "moderate"
        ? "secondary"
        : "destructive";
  return (
    <Badge variant={variant} className="text-xs">
      {risk.replace("_", " ")} risk
    </Badge>
  );
}
