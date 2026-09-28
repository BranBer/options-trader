import { StrategyCard } from "@/components/desk/StrategyCard";
import type { StrategyScoreboardProps } from "./types";

export function StrategyScoreboard({ strategies }: StrategyScoreboardProps) {
  return (
    <section aria-labelledby="strategy-scoreboard-heading" className="space-y-3">
      <h2 id="strategy-scoreboard-heading" className="text-lg font-semibold">
        Strategy scoreboard
      </h2>
      {strategies.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No strategies are registered yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {strategies.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </div>
      )}
    </section>
  );
}
