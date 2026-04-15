"use client";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Crosshair } from "lucide-react";
import type { TriggerReport } from "@/lib/utils/trigger-engine";

// ---------- Trigger Assessment Styles & Helpers ----------

export const ASSESSMENT_STYLES: Record<
  TriggerReport["overallAssessment"],
  { label: string; color: string; border: string; bg: string }
> = {
  actionable_bullish: {
    label: "ACTIONABLE BULLISH TRIGGER",
    color: "text-green-400",
    border: "border-green-500/30",
    bg: "bg-green-500/5",
  },
  actionable_bearish: {
    label: "ACTIONABLE BEARISH TRIGGER",
    color: "text-red-400",
    border: "border-red-500/30",
    bg: "bg-red-500/5",
  },
  setup_only: {
    label: "SETUP FORMING",
    color: "text-amber-400",
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
  },
  conflicted: {
    label: "CONFLICTED SIGNALS",
    color: "text-amber-400",
    border: "border-amber-500/30",
    bg: "bg-amber-500/5",
  },
  no_trigger: {
    label: "NO TRIGGER",
    color: "text-muted-foreground",
    border: "border-muted",
    bg: "",
  },
};

function scoreColor(score: number) {
  if (score >= 70) return "text-green-400";
  if (score >= 55) return "text-amber-400";
  return "text-muted-foreground";
}

function ScoreBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={`font-mono ${scoreColor((value / max) * 100)}`}>
          {value}/{max}
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
    </div>
  );
}

// ---------- Main Component ----------

export default function TriggerAssessmentCard({
  triggerReport,
}: {
  triggerReport: TriggerReport;
}) {
  const {
    primaryTrigger,
    secondaryTriggers = [],
    swingStructure,
    activeLevels = [],
    overallAssessment,
  } = triggerReport;
  const style =
    ASSESSMENT_STYLES[overallAssessment] ?? ASSESSMENT_STYLES.no_trigger;

  return (
    <div
      className={`rounded-md border ${style.border} ${style.bg} p-3 space-y-3`}
    >
      <div className="flex items-center gap-2">
        <Crosshair className={`h-4 w-4 ${style.color} shrink-0`} />
        <p className="text-sm font-medium">Daily Chart Trigger Assessment</p>
        <Badge
          variant={
            overallAssessment.startsWith("actionable_bullish")
              ? "default"
              : overallAssessment.startsWith("actionable_bearish")
                ? "destructive"
                : "secondary"
          }
          className="text-xs"
        >
          {style.label}
        </Badge>
      </div>

      {primaryTrigger && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Primary trigger details */}
          <div className="rounded-md border p-2 space-y-1.5">
            <p className="text-xs font-medium">Primary Trigger</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <div>
                <span className="text-muted-foreground">Direction</span>
                <p
                  className={`font-medium ${
                    primaryTrigger.direction === "bullish"
                      ? "text-green-400"
                      : primaryTrigger.direction === "bearish"
                        ? "text-red-400"
                        : "text-muted-foreground"
                  }`}
                >
                  {primaryTrigger.direction.toUpperCase()} —{" "}
                  {primaryTrigger.classification.replace(/_/g, " ")}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Score</span>
                <p
                  className={`font-bold font-mono ${scoreColor(primaryTrigger.score)}`}
                >
                  {primaryTrigger.score}/100
                </p>
              </div>
              {primaryTrigger.interaction && (
                <div>
                  <span className="text-muted-foreground">Key Level</span>
                  <p className="font-medium">
                    ${primaryTrigger.interaction.level.toFixed(2)}{" "}
                    <span className="text-muted-foreground font-normal">
                      ({primaryTrigger.interaction.levelLabel})
                    </span>
                  </p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Confirmation</span>
                <p className="font-medium">
                  {primaryTrigger.confirmationType.replace(/_/g, " ")}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">HTF Alignment</span>
                <p
                  className={`font-medium ${
                    primaryTrigger.htfAlignment === "aligned"
                      ? "text-green-400"
                      : primaryTrigger.htfAlignment === "countertrend"
                        ? "text-red-400"
                        : "text-amber-400"
                  }`}
                >
                  {primaryTrigger.htfAlignment.replace(/_/g, " ")}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Confidence</span>
                <p className="font-medium">{primaryTrigger.confidence}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1 border-l-2 border-muted pl-2">
              {primaryTrigger.summary}
            </p>
          </div>

          {/* Score breakdown */}
          <div className="rounded-md border p-2 space-y-2">
            <p className="text-xs font-medium">Score Breakdown</p>
            <ScoreBar
              label="Level Interaction"
              value={primaryTrigger.scoreBreakdown?.levelInteraction ?? 0}
              max={40}
            />
            <ScoreBar
              label="Structure"
              value={primaryTrigger.scoreBreakdown?.structureAlignment ?? 0}
              max={25}
            />
            <ScoreBar
              label="Context (HTF)"
              value={primaryTrigger.scoreBreakdown?.contextAlignment ?? 0}
              max={20}
            />
            <ScoreBar
              label="Patterns"
              value={primaryTrigger.scoreBreakdown?.patternSupport ?? 0}
              max={15}
            />
            <Separator />
            <div className="flex items-center justify-between text-xs font-medium">
              <span>Total</span>
              <span className={`font-mono ${scoreColor(primaryTrigger.score)}`}>
                {primaryTrigger.score}/100
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Market structure */}
      <div className="text-xs space-y-1">
        <p className="font-medium">Market Structure</p>
        <div className="flex flex-wrap gap-2">
          <span className="text-muted-foreground">
            Structure:{" "}
            <span
              className={`font-medium ${
                swingStructure.structure === "bullish"
                  ? "text-green-400"
                  : swingStructure.structure === "bearish"
                    ? "text-red-400"
                    : "text-muted-foreground"
              }`}
            >
              {swingStructure.structure}
            </span>
          </span>
          <span className="text-muted-foreground">
            Swings:{" "}
            {swingStructure.swings?.filter(
              (s: { type: string }) => s.type === "high",
            ).length ?? 0}
            H /{" "}
            {swingStructure.swings?.filter(
              (s: { type: string }) => s.type === "low",
            ).length ?? 0}
            L
          </span>
        </div>
      </div>

      {/* Active levels */}
      {activeLevels.length > 0 && (
        <div className="text-xs space-y-1">
          <p className="font-medium">
            Active Level Interactions ({activeLevels.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {activeLevels.slice(0, 6).map((lvl, i) => (
              <Badge
                key={i}
                variant={
                  ["reclaim", "bounce", "acceptance_above"].includes(lvl.type)
                    ? "default"
                    : ["breakdown", "rejection", "acceptance_below"].includes(
                          lvl.type,
                        )
                      ? "destructive"
                      : "secondary"
                }
                className="text-xs font-mono"
              >
                {lvl.type} ${lvl.level.toFixed(2)}
              </Badge>
            ))}
            {activeLevels.length > 6 && (
              <span className="text-muted-foreground">
                +{activeLevels.length - 6} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Secondary triggers */}
      {secondaryTriggers.length > 0 && (
        <div className="text-xs space-y-1">
          <p className="font-medium">
            Secondary Triggers ({secondaryTriggers.length})
          </p>
          <div className="space-y-0.5">
            {secondaryTriggers.slice(0, 3).map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <Badge
                  variant={
                    t.direction === "bullish"
                      ? "default"
                      : t.direction === "bearish"
                        ? "destructive"
                        : "secondary"
                  }
                  className="text-xs"
                >
                  {t.direction}
                </Badge>
                <span className={`font-mono ${scoreColor(t.score)}`}>
                  {t.score}
                </span>
                <span className="text-muted-foreground truncate">
                  {t.summary}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
