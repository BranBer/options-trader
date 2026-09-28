import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime, timeAgo } from "@/lib/utils/formatters";
import { formatSessionDate } from "@/components/desk/desk-format";
import type { DeskHeaderProps } from "./types";

export function DeskHeader({
  asOf,
  lastRun,
  onRun,
  isRunPending,
  runAnnouncement,
}: DeskHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Desk</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
            Paper trading: every position here is simulated. Nothing is sent to
            a broker.
          </p>
        </div>
        <Button onClick={onRun} disabled={isRunPending} className="gap-1.5">
          {isRunPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Run now
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {lastRun ? (
          <>
            Last run {timeAgo(lastRun.startedAt)} ({formatDateTime(lastRun.startedAt)})
            {" · "}
            {lastRun.opened} opened / {lastRun.marked} marked / {lastRun.closed}{" "}
            closed
            {lastRun.errors.length > 0 && (
              <span className="text-destructive">
                {" · "}
                {lastRun.errors.length} error
                {lastRun.errors.length === 1 ? "" : "s"}
              </span>
            )}
          </>
        ) : (
          "No run has been recorded yet."
        )}
        {" · as of the "}
        {formatSessionDate(asOf)}
        {" close"}
      </p>

      <p className="text-sm" role="status" aria-live="polite">
        {runAnnouncement}
      </p>
    </div>
  );
}
