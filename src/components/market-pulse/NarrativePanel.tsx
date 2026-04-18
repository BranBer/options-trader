"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MarketPulseStateResponse } from "@/app/api/market-pulse/route";

type Narrative = MarketPulseStateResponse["tickers"][number]["narrative"];

function phaseTone(phase: string) {
  if (phase === "trend") return "border-emerald-500/30 text-emerald-400";
  if (phase === "transition") return "border-amber-500/30 text-amber-400";
  return "border-sky-500/30 text-sky-400";
}

function controlTone(control: string) {
  if (control === "buyers") return "text-emerald-400";
  if (control === "sellers") return "text-rose-400";
  return "text-zinc-300";
}

export default function NarrativePanel({
  narrative,
}: {
  narrative: Narrative;
}) {
  if (!narrative) {
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
            The first Market Pulse narrative will appear after this ticker
            completes its initial run.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm" className="border-border/70 bg-background/70">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-2">
          <CardTitle>Narrative</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={phaseTone(narrative.marketPhase)}
            >
              {narrative.marketPhase}
            </Badge>
            <Badge
              variant="outline"
              className={controlTone(narrative.currentControl)}
            >
              {narrative.currentControl} {narrative.controlStrength}/10
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
      </CardContent>
    </Card>
  );
}
