import { sqlite } from "@/lib/db/client";

export type PipelineRunTrigger = "manual" | "schedule" | "startup";
export type PipelineRunStatus = "running" | "ok" | "partial";

export interface PipelineRunRecord {
  id: number;
  trigger: PipelineRunTrigger;
  status: PipelineRunStatus;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export function recordPipelineRunStart(trigger: PipelineRunTrigger): number {
  const startedAt = new Date().toISOString();
  const result = sqlite
    .prepare(
      `INSERT INTO pipeline_runs (trigger, status, started_at)
       VALUES (?, 'running', ?)`,
    )
    .run(trigger, startedAt);

  return Number(result.lastInsertRowid);
}

export function recordPipelineRunCompletion(args: {
  runId: number;
  status: Exclude<PipelineRunStatus, "running">;
  stages: { fetch: string; classify: string; analysis: string };
  errorMessage?: string | null;
}): string {
  const completedAt = new Date().toISOString();
  sqlite
    .prepare(
      `UPDATE pipeline_runs
       SET status = ?, completed_at = ?, stages = ?, error_message = ?
       WHERE id = ?`,
    )
    .run(
      args.status,
      completedAt,
      JSON.stringify(args.stages),
      args.errorMessage ?? null,
      args.runId,
    );

  return completedAt;
}

export function getLastCompletedPipelineRefreshAt(): string | null {
  const row = sqlite
    .prepare(
      `SELECT completed_at AS completedAt
       FROM pipeline_runs
       WHERE completed_at IS NOT NULL AND status IN ('ok', 'partial')
       ORDER BY datetime(completed_at) DESC, id DESC
       LIMIT 1`,
    )
    .get() as { completedAt?: string | null } | undefined;

  return row?.completedAt ?? null;
}

export function getLatestPipelineRun(): PipelineRunRecord | null {
  const row = sqlite
    .prepare(
      `SELECT id,
              trigger,
              status,
              started_at AS startedAt,
              completed_at AS completedAt,
              error_message AS errorMessage
       FROM pipeline_runs
       ORDER BY id DESC
       LIMIT 1`,
    )
    .get() as PipelineRunRecord | undefined;

  return row ?? null;
}
