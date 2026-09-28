import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  CONTROL_STRATEGY_IDS,
  STRATEGY_EXECUTION_LABEL,
  STRATEGY_STATUS_LABEL,
} from "../constants";
import { formatSignedPercent } from "../desk-format";
import type { StrategyCardProps } from "./types";

export function StrategyCard({ strategy }: StrategyCardProps) {
  const { evidence, forward, liveCriteria } = strategy;
  const isControl = CONTROL_STRATEGY_IDS.includes(strategy.id);

  const closedRatio = forward.closed / liveCriteria.minClosedTrades;
  const tStatAbs = Math.abs(forward.tStat ?? 0);
  const tRatio = tStatAbs / liveCriteria.minTStat;
  const progressPct = Math.min(100, Math.min(closedRatio, tRatio) * 100);
  const progressLabel = `${forward.closed} of ${liveCriteria.minClosedTrades} closed trades · t ${tStatAbs.toFixed(1)} of ${liveCriteria.minTStat.toFixed(1)}`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle>{strategy.label}</CardTitle>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="outline">
              {STRATEGY_EXECUTION_LABEL[strategy.execution]}
            </Badge>
            <Badge variant={strategy.status === "live-eligible" ? "default" : "secondary"}>
              {STRATEGY_STATUS_LABEL[strategy.status]}
            </Badge>
            {isControl && (
              <Badge variant="outline">Control: kept to measure the old approach</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">{strategy.thesis}</p>
        <p>
          {evidence.summary} {evidence.verdict} — mean after costs{" "}
          {formatSignedPercent(evidence.meanAfterCosts)} (95% CI{" "}
          {formatSignedPercent(evidence.ci95[0])} to{" "}
          {formatSignedPercent(evidence.ci95[1])})
        </p>
        <p>
          Forward: {forward.closed} closed / {forward.open} open · mean{" "}
          {forward.meanRet !== null ? formatSignedPercent(forward.meanRet) : "—"}{" "}
          · win rate{" "}
          {forward.winRate !== null ? `${(forward.winRate * 100).toFixed(1)}%` : "—"}{" "}
          · t {forward.tStat !== null ? forward.tStat.toFixed(1) : "—"}
        </p>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{progressLabel}</p>
          <Progress value={progressPct} aria-label={progressLabel} />
        </div>
        <p className="text-xs text-muted-foreground">{liveCriteria.rule}</p>
      </CardContent>
    </Card>
  );
}
