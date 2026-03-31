"use client";

import { useState, useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useDeepDive } from "@/hooks/useApiData";
import type { DeepDiveAnalysis } from "@/types/analysis";
import OptionsStatsPanel from "@/components/charts/OptionsStatsPanel";
import TechnicalChart from "@/components/shared/TechnicalChart";
import { InfoTooltip } from "@/components/charts/IndicatorExplainers";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BookOpen,
  Target,
  AlertTriangle,
  Globe,
  Clock,
} from "lucide-react";

interface WhaleDeepDiveProps {
  ticker: string;
}

/** Map Gemini indicator names to our explainer keys */
function matchIndicatorKey(name: string): string | null {
  const lower = name.toLowerCase();
  if (/\bema\b.*9/.test(lower)) return "ema9";
  if (/\bema\b.*21/.test(lower)) return "ema21";
  if (/bollinger/i.test(lower)) return "bollinger";
  if (/\brsi\b/i.test(lower)) return "rsi";
  if (/\bmacd\b/i.test(lower)) return "macd";
  if (/volume.*(?:ma|average)/i.test(lower)) return "volumeMA";
  return null;
}

export default function WhaleDeepDive({ ticker }: WhaleDeepDiveProps) {
  const [hoveredPatternIndex, setHoveredPatternIndex] = useState<number | null>(
    null,
  );

  const { data: deepDiveData, isLoading: ddLoading } = useDeepDive(ticker);

  const analysisRow = deepDiveData?.analyses?.[0];
  const deepDive = analysisRow?.output as DeepDiveAnalysis | undefined;
  const analysisCreatedAt = analysisRow?.createdAt ?? null;

  const handleChartHover = useCallback((idx: number | null) => {
    setHoveredPatternIndex(idx);
  }, []);

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
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Target className="h-4 w-4" />
            Deep Dive: {ticker}
          </h3>
          {analysisCreatedAt && (
            <FreshnessBadge createdAt={analysisCreatedAt} />
          )}
        </div>
        <p className="text-sm mt-1">{deepDive.whale_trade_summary}</p>
      </div>

      {/* Market Narrative */}
      <div>
        <p className="text-sm">{deepDive.market_narrative}</p>
      </div>

      <Separator />

      {/* Price Chart with timeframe toggle */}
      <TechnicalChart
        ticker={ticker}
        supportResistance={deepDive.support_resistance}
        technicalPatterns={deepDive.technical_patterns}
        hoveredPatternIndex={hoveredPatternIndex}
        onHoveredPattern={handleChartHover}
        optionsContext={deepDive.options_context}
      />

      <Separator />

      {/* Technical Patterns */}
      {deepDive.technical_patterns.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Technical Patterns</p>
          <div className="space-y-2">
            {deepDive.technical_patterns.map((p, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 text-sm rounded-md px-2 py-1 transition-colors cursor-default ${
                  hoveredPatternIndex === i
                    ? "bg-accent/50 ring-1 ring-accent"
                    : ""
                }`}
                onMouseEnter={() => setHoveredPatternIndex(i)}
                onMouseLeave={() => setHoveredPatternIndex(null)}
              >
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
                  {p.confidence != null && (
                    <span className="text-xs text-muted-foreground ml-2">
                      {Math.round(p.confidence * 100)}% confidence
                    </span>
                  )}
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
            {deepDive.indicators.map((ind, i) => {
              // For Put/Call Ratio, derive signal from the numeric value
              // to ensure the badge reflects direct reading (high P/C = bearish)
              let signal = ind.signal;
              if (/put.?call/i.test(ind.name)) {
                const parsed = parseFloat(ind.value);
                if (!isNaN(parsed)) {
                  signal =
                    parsed > 1.2
                      ? "bearish"
                      : parsed < 0.8
                        ? "bullish"
                        : "neutral";
                }
              }
              return (
                <div
                  key={i}
                  className="rounded-md border p-2 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium flex items-center gap-1">
                      {ind.name}
                      {matchIndicatorKey(ind.name) && (
                        <InfoTooltip
                          text=""
                          indicatorKey={matchIndicatorKey(ind.name)!}
                        />
                      )}
                    </span>
                    <Badge
                      variant={
                        signal === "bullish"
                          ? "default"
                          : signal === "bearish"
                            ? "destructive"
                            : "secondary"
                      }
                      className="text-xs"
                    >
                      {signal}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">
                    {ind.value} — {ind.explanation}
                  </p>
                </div>
              );
            })}
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

function FreshnessBadge({ createdAt }: { createdAt: string }) {
  const [label, setLabel] = useState("just now");
  const [stale, setStale] = useState("text-muted-foreground");

  useEffect(() => {
    function update() {
      const diffMs = Date.now() - new Date(createdAt).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) setLabel("just now");
      else if (diffMins < 60) setLabel(`${diffMins}m ago`);
      else if (diffHours < 24) setLabel(`${diffHours}h ago`);
      else setLabel(`${diffDays}d ago`);

      setStale(
        diffHours >= 72
          ? "text-red-400"
          : diffHours >= 24
            ? "text-amber-400"
            : "text-muted-foreground",
      );
    }
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [createdAt]);

  return (
    <span className={`flex items-center gap-1 text-xs ${stale}`}>
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
}
