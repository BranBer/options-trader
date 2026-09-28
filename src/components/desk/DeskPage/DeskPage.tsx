"use client";

import { Button } from "@/components/ui/button";
import { DeskHeader } from "@/components/desk/DeskHeader";
import { VerdictBanner } from "@/components/desk/VerdictBanner";
import { StrategyScoreboard } from "@/components/desk/StrategyScoreboard";
import { TradesTable } from "@/components/desk/TradesTable";
import { CalibrationTable } from "@/components/desk/CalibrationTable";
import { SystemStatus } from "@/components/desk/SystemStatus";
import { DeskSkeleton } from "@/components/desk/DeskSkeleton";
import { useDeskData, useRunDesk } from "@/hooks/useApiData";

function describeRunResult(mutation: ReturnType<typeof useRunDesk>): string | null {
  if (mutation.isPending) return "Running now…";
  if (mutation.isError) return mutation.error?.message ?? "Run failed.";
  if (mutation.isSuccess && mutation.data) {
    const summary = mutation.data;
    return `Run complete: ${summary.opened} opened, ${summary.marked} marked, ${summary.closed} closed${
      summary.errors.length > 0 ? `, ${summary.errors.length} error(s)` : ""
    }.`;
  }
  return null;
}

export function DeskPage() {
  const { data, isLoading, isError, refetch } = useDeskData();
  const runMutation = useRunDesk();

  const handleRun = () => runMutation.mutate();

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-6">
        <DeskSkeleton />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-6">
        <div role="alert" className="space-y-3 text-sm">
          <p>Failed to load the desk.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
      <DeskHeader
        asOf={data.asOf}
        lastRun={data.lastRun}
        onRun={handleRun}
        isRunPending={runMutation.isPending}
        runAnnouncement={describeRunResult(runMutation)}
      />
      <VerdictBanner strategies={data.strategies} />
      <StrategyScoreboard strategies={data.strategies} />
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Open positions</h2>
        <TradesTable variant="open" trades={data.open} />
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Recently closed</h2>
        <TradesTable variant="closed" trades={data.recentClosed} />
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Signal calibration</h2>
        <CalibrationTable calibration={data.calibration} />
      </section>
      <SystemStatus system={data.system} />
    </div>
  );
}
