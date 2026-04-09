export type StepStatus = "pending" | "active" | "done" | "error";

export interface PipelineStep {
  label: string;
  status: StepStatus;
  detail?: string;
}

export interface PipelineError {
  stage: string;
  message: string;
  timestamp: string;
}

export interface StageResults {
  fetch: "ok" | "error" | "pending";
  classify: "ok" | "error" | "pending";
  analysis: "ok" | "error" | "pending";
}

export interface PipelineProgress {
  active: boolean;
  steps: PipelineStep[];
  startedAt: string | null;
  lastError: PipelineError | null;
  stageResults: StageResults | null;
}

let _lastError: PipelineError | null = null;
let _stageResults: StageResults | null = null;

const state: Omit<PipelineProgress, "lastError" | "stageResults"> = {
  active: false,
  steps: [],
  startedAt: null,
};

export function getProgress(): PipelineProgress {
  return {
    active: state.active,
    startedAt: state.startedAt,
    steps: state.steps.map((s) => ({ ...s })),
    lastError: _lastError ? { ..._lastError } : null,
    stageResults: _stageResults ? { ..._stageResults } : null,
  };
}

export function setLastError(stage: string, message: string): void {
  _lastError = { stage, message, timestamp: new Date().toISOString() };
}

export function clearLastError(): void {
  _lastError = null;
}

export function getLastError(): PipelineError | null {
  return _lastError ? { ..._lastError } : null;
}

export function setStageResults(results: StageResults): void {
  _stageResults = { ...results };
}

export function getStageResults(): StageResults | null {
  return _stageResults ? { ..._stageResults } : null;
}

export function init(labels: string[]): void {
  state.active = true;
  state.startedAt = new Date().toISOString();
  state.steps = labels.map((label) => ({
    label,
    status: "pending" as StepStatus,
  }));
}

export function activate(index: number, detail?: string): void {
  if (index >= 0 && index < state.steps.length) {
    state.steps[index].status = "active";
    if (detail) state.steps[index].detail = detail;
  }
}

export function updateDetail(index: number, detail: string): void {
  if (index >= 0 && index < state.steps.length) {
    state.steps[index].detail = detail;
  }
}

export function complete(index: number): void {
  if (index >= 0 && index < state.steps.length) {
    state.steps[index].status = "done";
    state.steps[index].detail = undefined;
  }
}

export function fail(index: number): void {
  if (index >= 0 && index < state.steps.length) {
    state.steps[index].status = "error";
  }
}

export function finish(): void {
  state.active = false;
}

/**
 * Mark all pending/active steps as error, keep the bar visible
 * for `visibleMs` so the user sees WHAT failed, then deactivate.
 */
export function finishWithError(visibleMs = 8000): void {
  for (const step of state.steps) {
    if (step.status === "active") {
      step.status = "error";
    } else if (step.status === "pending") {
      step.status = "error";
      step.detail = "skipped";
    }
  }
  // Keep active so the Navbar shows the error state briefly
  setTimeout(() => {
    state.active = false;
  }, visibleMs);
}
