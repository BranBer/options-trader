import type { DeskRunSummary } from "@/types/desk";

export interface DeskHeaderProps {
  asOf: string;
  lastRun: DeskRunSummary | null;
  onRun: () => void;
  isRunPending: boolean;
  runAnnouncement: string | null;
}
