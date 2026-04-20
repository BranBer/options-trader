"use client";

import { ArrowDownRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MarketPulseStateResponse } from "@/app/api/market-pulse/route";

type Narrative = MarketPulseStateResponse["tickers"][number]["narrative"];
type Correlation =
  MarketPulseStateResponse["tickers"][number]["correlations"][number];

function phaseTone(phase: string, control: string) {
  if (phase === "trend") {
    if (control === "buyers") return "border-emerald-500/30 text-emerald-400";
    if (control === "sellers") return "border-rose-500/30 text-rose-400";
    return "border-sky-500/30 text-sky-400";
  }

  if (phase === "transition") return "border-orange-500/30 text-orange-300";
  return "border-amber-500/30 text-amber-300";
}

function controlTone(control: string) {
  if (control === "buyers") return "text-emerald-400";
  if (control === "sellers") return "text-rose-400";
  return "text-zinc-300";
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return null;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function NarrativePanel({
  narrative,
  correlations = [],
  runHistoryHref,
  status,
}: {
  narrative: Narrative;
  correlations?: Correlation[];
  runHistoryHref?: string;
  status?: string;
}) {
  if (!narrative) {
    const isRunning = status === "running";
    return (
      <Card
        size="sm"
        className="border border-dashed border-border/70 bg-background/60"
      >
        <CardHeader>
          <CardTitle>Narrative</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {isRunning
              ? "Narrative synthesis is in progress — it will appear once the current run completes."
              : "No narrative available yet. Trigger a Market Pulse refresh to generate one."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const inlineCorrelations = correlations
    .filter((item) => item.correlationConfidence > 0.5)
    .sort(
      (left, right) => right.correlationConfidence - left.correlationConfidence,
    )
    .slice(0, 3);
  const generatedAt = formatTimestamp(narrative.createdAt);

  return (
    <Card size="sm" className="border-border/70 bg-background/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-2">
          <CardTitle>Narrative</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={phaseTone(
                narrative.marketPhase,
                narrative.currentControl,
              )}
            >
              {narrative.marketPhase}
            </Badge>
            <Badge
              variant="outline"
              className={controlTone(narrative.currentControl)}
            >
              {narrative.currentControl} in control {narrative.controlStrength}
              /10
            </Badge>
            <Badge variant="outline">{narrative.expectedBehavior}</Badge>
          </div>
        </div>
        {narrative.confidenceInAssessment != null ? (
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Confidence
            </p>
            <p className="text-sm font-semibold">
              {Math.round(narrative.confidenceInAssessment * 100)}%
            </p>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-6 text-foreground/90">
          {narrative.narrativeSummary}
        </p>
        {inlineCorrelations.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-sky-200">
              Catalyst Context
            </p>
            <ul className="space-y-2 text-sm text-sky-50/90">
              {inlineCorrelations.map((item) => {
                const confidence = `${Math.round(item.correlationConfidence * 100)}%`;

                return (
                  <li key={item.id} className="space-y-1">
                    <p>
                      Correlated with: {item.externalEventSummary} ({confidence}{" "}
                      confidence)
                    </p>
                    <p className="text-xs text-sky-100/75">
                      Matched to {item.priceEvent}
                      {item.reasoning ? ` · ${item.reasoning}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {narrative.keyConflicts.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-amber-300">
              Key Conflicts
            </p>
            <ul className="space-y-1 text-sm text-amber-50/85">
              {narrative.keyConflicts.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {generatedAt || runHistoryHref ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
            {generatedAt ? (
              <p className="text-xs text-muted-foreground">
                Generated {generatedAt}
              </p>
            ) : (
              <span />
            )}
            {runHistoryHref ? (
              <a
                href={runHistoryHref}
                className="inline-flex items-center gap-1 text-xs font-medium text-sky-300 transition-colors hover:text-sky-200 hover:underline"
              >
                View Prior Narratives
                <ArrowDownRight className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
