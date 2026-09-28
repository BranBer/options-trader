import { Card, CardContent } from "@/components/ui/card";
import { BACKTEST_FINDINGS_PATH } from "../constants";
import type { VerdictBannerProps } from "./types";

export function VerdictBanner({ strategies }: VerdictBannerProps) {
  const liveEligible = strategies.filter((s) => s.status === "live-eligible");

  return (
    <Card>
      <CardContent className="space-y-1.5 text-sm">
        {liveEligible.length === 0 ? (
          <p>
            No strategy has passed its forward test yet, so live trading stays
            off. Backtests found no edge after costs in the dashboard&apos;s
            recommendations, whale-flow copying or news reading.
          </p>
        ) : (
          <p>
            {liveEligible.map((s) => s.label).join(", ")}{" "}
            {liveEligible.length === 1 ? "has" : "have"} passed its
            pre-registered forward test. Every other strategy stays paper-only
            until it does the same.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Read the backtest findings: {BACKTEST_FINDINGS_PATH}
        </p>
      </CardContent>
    </Card>
  );
}
