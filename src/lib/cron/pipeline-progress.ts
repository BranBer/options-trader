export type StepStatus = "pending" | "active" | "done" | "error";

export interface PipelineStep {
  label: string;
  status: StepStatus;
  detail?: string;
}

export interface PipelineProgress {
  active: boolean;
  steps: PipelineStep[];
  startedAt: string | null;
}

const state: PipelineProgress = {
  active: false,
  steps: [],
  startedAt: null,
};

export function getProgress(): PipelineProgress {
  return {
    active: state.active,
    startedAt: state.startedAt,
    steps: state.steps.map((s) => ({ ...s })),
  };
}

export function init(labels: string[]): void {
  state.active = true;
  state.startedAt = new Date().toISOString();
  state.steps = labels.map((label) => ({ label, status: "pending" as StepStatus }));
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
