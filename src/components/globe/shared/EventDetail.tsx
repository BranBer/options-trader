"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { NewsEvent } from "@/hooks/useApiData";
import { timeAgo } from "@/lib/utils/formatters";
import {
  parseStringArray,
  getAnalyzableTickers,
  type AnalysisState,
} from "./globe-utils";

export default function EventDetail({
  event,
  onBack,
  onAnalyze,
  onReanalyze,
  analysisState,
  hasAnalysis,
  lastAnalyzedAt,
}: {
  event: NewsEvent;
  onBack: () => void;
  onAnalyze: (event: NewsEvent) => Promise<void>;
  onReanalyze: (event: NewsEvent) => Promise<void>;
  analysisState: AnalysisState;
  hasAnalysis: boolean;
  lastAnalyzedAt: string | null;
}) {
  const sectors = parseStringArray(event.sectors);
  const allTickers = parseStringArray(event.tickers);
  const tickers = getAnalyzableTickers(event);

  return (
    <div className="space-y-3 pr-3">
      <button
        onClick={onBack}
        className="text-xs text-primary hover:underline"
        aria-label="Back to events feed"
      >
        &larr; Back to feed
      </button>
      <h3 className="text-sm font-medium leading-tight">{event.headline}</h3>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline">{event.impactScore ?? 0}/10</Badge>
        <Badge
          variant={
            event.sentiment === "bullish"
              ? "default"
              : event.sentiment === "bearish"
                ? "destructive"
                : "secondary"
          }
        >
          {event.sentiment}
        </Badge>
        {event.eventType && <Badge variant="outline">{event.eventType}</Badge>}
      </div>

      {sectors.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Sectors</p>
          <div className="flex flex-wrap gap-1">
            {sectors.map((s) => (
              <Badge key={s} variant="outline" className="text-xs">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {tickers.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Tickers</p>
            {hasAnalysis && (
              <Badge
                variant="outline"
                className="text-[10px] uppercase tracking-wide"
              >
                {analysisState.cached ? "Cached" : "Ready"}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {tickers.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs font-mono">
                {t}
              </Badge>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            <Button
              onClick={() => void onAnalyze(event)}
              disabled={analysisState.status === "loading" || hasAnalysis}
              size="sm"
              className="w-full"
            >
              {analysisState.status === "loading"
                ? `Analyzing ${tickers.length} ticker${tickers.length === 1 ? "" : "s"}...`
                : hasAnalysis
                  ? "Analysis Loaded"
                  : "Analyze Tickers"}
            </Button>
            {hasAnalysis && (
              <div className="flex items-center justify-between gap-2">
                {lastAnalyzedAt && (
                  <p
                    className="text-xs text-muted-foreground"
                    suppressHydrationWarning
                  >
                    Analyzed {timeAgo(lastAnalyzedAt)}
                  </p>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-2 ml-auto"
                  disabled={analysisState.status === "loading"}
                  onClick={() => void onReanalyze(event)}
                >
                  {analysisState.status === "loading"
                    ? "Reloading..."
                    : "↺ Reload"}
                </Button>
              </div>
            )}
            {allTickers.length > tickers.length && (
              <p className="text-xs text-muted-foreground">
                Analyzing the first {tickers.length} affected tickers for this
                event.
              </p>
            )}
            {analysisState.status === "error" && (
              <p className="text-xs text-destructive">{analysisState.error}</p>
            )}
            {analysisState.status === "done" && hasAnalysis && (
              <p className="text-xs text-muted-foreground">
                Scroll down for the event-driven analysis panel.
              </p>
            )}
          </div>
        </div>
      )}

      <Separator />

      {event.rawSummary && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Summary</p>
          <p className="text-sm">{event.rawSummary}</p>
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-0.5">
        {event.source && <p>Source: {event.source}</p>}
        {event.countryCode && <p>Country: {event.countryCode}</p>}
        {event.publishedAt && (
          <p suppressHydrationWarning>
            Published: {timeAgo(event.publishedAt)}
          </p>
        )}
        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
            aria-label="Read original article in a new tab"
          >
            Read original &rarr;
          </a>
        )}
      </div>
    </div>
  );
}
