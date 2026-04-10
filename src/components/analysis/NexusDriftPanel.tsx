"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNexusDriftAnalysis, useActiveCascades } from "@/hooks/useApiData";
import { NEXUS_COMPANIES } from "@/lib/data/nexus-companies";
import type { NexusDriftAnalysis } from "@/types/analysis";
import {
  RefreshCw,
  AlertTriangle,
  Shield,
  TrendingUp,
  TrendingDown,
  Minus,
  Network,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Zap,
} from "lucide-react";

export default function NexusDriftPanel() {
  const { mutate, data, isPending, error } = useNexusDriftAnalysis();
  const { data: cascadeData } = useActiveCascades();
  const [showSeedList, setShowSeedList] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header card with re-analyze button */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-blue-400" />
              <CardTitle className="text-lg">Nexus Company Map</CardTitle>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Nexus companies are critical supply chain chokepoints
                      whose earnings cascade across many dependents. Use
                      &quot;Re-Analyze&quot; to check if global events have
                      shifted the landscape.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Button
              onClick={() => mutate()}
              disabled={isPending}
              size="sm"
              variant="outline"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-1.5 ${isPending ? "animate-spin" : ""}`}
              />
              {isPending ? "Analyzing…" : "Re-Analyze Drift"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {NEXUS_COMPANIES.length} seed nexus companies tracked across{" "}
            {new Set(NEXUS_COMPANIES.map((n) => n.sector)).size} sectors.
            {data
              ? ` Last analysis: ${data.overall_assessment.replace("_", " ")}.`
              : " Click Re-Analyze to check for structural shifts."}
          </p>
        </CardHeader>
      </Card>

      {/* Error state */}
      {error && (
        <Card className="border-red-500/30">
          <CardContent className="py-4">
            <p className="text-sm text-red-400">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              {error.message}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Drift analysis results */}
      {data && <DriftResults data={data} />}

      {/* Active Cascades (Story 43.8) */}
      {cascadeData && cascadeData.cascades.length > 0 && (
        <Card className="border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-400" />
              Active Earnings Cascades ({cascadeData.cascades.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cascadeData.cascades.map((c) => (
              <div
                key={c.nexusTicker}
                className="rounded-md border border-border/50 p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-semibold text-sm">
                    {c.nexusTicker}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.nexusName}
                  </span>
                  <Badge
                    variant={
                      c.direction === "bullish" ? "default" : "destructive"
                    }
                    className="text-xs"
                  >
                    {c.direction === "bullish" ? "Beat" : "Miss"}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {c.sector}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    EPS Surprise:{" "}
                    <span
                      className={
                        c.epsSurprisePct >= 0
                          ? "text-emerald-400 font-medium"
                          : "text-red-400 font-medium"
                      }
                    >
                      {c.epsSurprisePct >= 0 ? "+" : ""}
                      {c.epsSurprisePct.toFixed(1)}%
                    </span>
                  </span>
                  <span>{c.hoursSinceReport.toFixed(0)}h ago</span>
                  <span>{c.dependentCount} dependents affected</span>
                </div>
              </div>
            ))}

            {/* Sample cascade strengths for affected tickers */}
            {cascadeData.sampleContexts.length > 0 && (
              <div className="pt-2 border-t border-border/30">
                <p className="text-xs text-muted-foreground mb-1.5">
                  Sample cascade strengths:
                </p>
                <div className="flex flex-wrap gap-2">
                  {cascadeData.sampleContexts.map((sc) => (
                    <div
                      key={sc.ticker}
                      className="flex items-center gap-1.5 rounded-md border border-border/40 px-2 py-1 text-xs"
                    >
                      <span className="font-mono font-medium">{sc.ticker}</span>
                      <span
                        className={
                          sc.cascadeDirection === "bullish"
                            ? "text-emerald-400"
                            : sc.cascadeDirection === "bearish"
                              ? "text-red-400"
                              : "text-amber-400"
                        }
                      >
                        {(sc.cascadeStrength * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Seed list accordion */}
      <Card>
        <CardHeader
          className="pb-3 cursor-pointer select-none"
          onClick={() => setShowSeedList((p) => !p)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Seed Nexus Companies ({NEXUS_COMPANIES.length})
            </CardTitle>
            {showSeedList ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
        {showSeedList && (
          <CardContent className="pt-0 space-y-3">
            {Object.entries(
              Object.groupBy(NEXUS_COMPANIES, (n) => n.sector),
            ).map(([sector, companies]) => (
              <div key={sector}>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {sector}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {companies?.map((n) => (
                    <div
                      key={n.ticker}
                      className="rounded-md border border-border/50 p-2.5 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-blue-400">
                          {n.ticker}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {n.name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {n.nexusRole}
                      </p>
                      <p className="text-xs mt-1">
                        <span className="text-muted-foreground">
                          Dependents:{" "}
                        </span>
                        {n.dependents.map((d) => d.ticker).join(", ")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function DriftResults({ data }: { data: NexusDriftAnalysis }) {
  const assessmentColor =
    data.overall_assessment === "stable"
      ? "text-green-400"
      : data.overall_assessment === "minor_shifts"
        ? "text-yellow-400"
        : "text-red-400";

  const assessmentBadge =
    data.overall_assessment === "stable"
      ? "default"
      : data.overall_assessment === "minor_shifts"
        ? "secondary"
        : "destructive";

  const hasChanges =
    data.removals.length > 0 ||
    data.additions.length > 0 ||
    data.relationship_changes.length > 0;

  return (
    <div className="space-y-3">
      {/* Overall assessment */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-3 mb-2">
            <Badge
              variant={
                assessmentBadge as "default" | "secondary" | "destructive"
              }
            >
              {data.overall_assessment.replace("_", " ").toUpperCase()}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {data.analysis_date}
            </span>
          </div>
          <p className="text-sm">{data.summary}</p>
        </CardContent>
      </Card>

      {/* Risk alerts */}
      {data.risk_alerts.length > 0 && (
        <Card className="border-amber-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Risk Alerts ({data.risk_alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.risk_alerts.map((alert, i) => (
              <div
                key={`${alert.nexus_ticker}-${i}`}
                className="rounded-md border border-border/50 p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-semibold text-sm">
                    {alert.nexus_ticker}
                  </span>
                  <SeverityBadge severity={alert.severity} />
                  <Badge variant="outline" className="text-xs">
                    {alert.threat_type.replace("_", " ")}
                  </Badge>
                </div>
                <p className="text-sm">{alert.description}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Time horizon: {alert.time_horizon}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Removals */}
      {data.removals.length > 0 && (
        <Card className="border-red-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-400" />
              Proposed Removals ({data.removals.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.removals.map((r, i) => (
              <div
                key={`${r.ticker}-${i}`}
                className="rounded-md border border-red-500/20 p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-semibold text-sm text-red-400">
                    {r.ticker}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Confidence: {(r.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-sm">{r.reason}</p>
                {r.replacement_ticker && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Suggested replacement:{" "}
                    <span className="font-mono text-green-400">
                      {r.replacement_ticker}
                    </span>{" "}
                    — {r.replacement_rationale}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Additions */}
      {data.additions.length > 0 && (
        <Card className="border-green-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-400" />
              Proposed Additions ({data.additions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.additions.map((a, i) => (
              <div
                key={`${a.ticker}-${i}`}
                className="rounded-md border border-green-500/20 p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-semibold text-sm text-green-400">
                    {a.ticker}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {a.name} • {a.sector}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Confidence: {(a.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-sm">{a.nexus_role}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Trigger: {a.trigger_event}
                </p>
                <p className="text-xs mt-1">
                  <span className="text-muted-foreground">
                    Key dependents:{" "}
                  </span>
                  {a.key_dependents.join(", ")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Relationship changes */}
      {data.relationship_changes.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Minus className="h-4 w-4 text-blue-400" />
              Relationship Changes ({data.relationship_changes.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.relationship_changes.map((rc, i) => (
              <div
                key={`${rc.nexus_ticker}-${i}`}
                className="rounded-md border border-border/50 p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono font-semibold text-sm">
                    {rc.nexus_ticker}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {rc.change_type.replace(/_/g, " ")}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Confidence: {(rc.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-sm">{rc.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* No changes */}
      {!hasChanges && data.risk_alerts.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Shield className={`h-8 w-8 mx-auto mb-2 ${assessmentColor}`} />
            <p className="text-sm text-muted-foreground">
              No structural changes detected. The nexus landscape remains
              stable.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SeverityBadge({
  severity,
}: {
  severity: "watch" | "elevated" | "critical";
}) {
  const colors = {
    watch: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    elevated: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    critical: "bg-red-500/10 text-red-400 border-red-500/30",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors[severity]}`}
    >
      {severity.toUpperCase()}
    </span>
  );
}
