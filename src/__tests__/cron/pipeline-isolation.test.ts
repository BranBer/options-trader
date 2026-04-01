import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockFetchAllNews = vi.fn();
const mockClassifyAndStoreNews = vi.fn();
const mockRunWhalePipeline = vi.fn();
const mockRunAnalysisPipeline = vi.fn();
const mockRunSimPipeline = vi.fn();
const mockRunExitMonitor = vi.fn();

vi.mock("@/lib/services/news-fetcher", () => ({
  fetchAllNews: (...args: unknown[]) => mockFetchAllNews(...args),
}));

vi.mock("@/lib/cron/pipelines/news-pipeline", () => ({
  classifyAndStoreNews: (...args: unknown[]) =>
    mockClassifyAndStoreNews(...args),
}));

vi.mock("@/lib/cron/pipelines/whale-pipeline", () => ({
  runWhalePipeline: (...args: unknown[]) => mockRunWhalePipeline(...args),
}));

vi.mock("@/lib/cron/pipelines/analysis-pipeline", () => ({
  runAnalysisPipeline: (...args: unknown[]) => mockRunAnalysisPipeline(...args),
}));

vi.mock("@/lib/cron/pipelines/sim-pipeline", () => ({
  runSimPipeline: (...args: unknown[]) => mockRunSimPipeline(...args),
  getLastRunRejections: vi.fn(() => []),
}));

vi.mock("@/lib/cron/exit-monitor", () => ({
  runExitMonitor: (...args: unknown[]) => mockRunExitMonitor(...args),
  getExitMonitorStatus: vi.fn(),
}));

vi.mock("node-cron", () => ({
  default: { schedule: vi.fn() },
}));

import { runPipeline } from "@/lib/cron/scheduler";
import * as progress from "@/lib/cron/pipeline-progress";

describe("Story 17.1 — Per-Stage Try/Catch Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Happy path defaults
    mockFetchAllNews.mockResolvedValue([]);
    mockRunWhalePipeline.mockResolvedValue(0);
    mockClassifyAndStoreNews.mockResolvedValue(0);
    mockRunAnalysisPipeline.mockResolvedValue(0);
    mockRunSimPipeline.mockResolvedValue(0);
  });

  it("continues to sim pipeline when analysis throws", async () => {
    mockRunAnalysisPipeline.mockRejectedValue(
      new Error("LLM cross-reference failed"),
    );

    const result = await runPipeline();

    expect(result.status).toBe("partial");
    expect(result.stages.analysis).toBe("error");
    expect(result.stages.sim).toBe("ok");
    expect(mockRunSimPipeline).toHaveBeenCalledOnce();
  });

  it("continues to classify + analysis + sim when fetch throws", async () => {
    mockFetchAllNews.mockRejectedValue(new Error("Network timeout"));

    const result = await runPipeline();

    expect(result.stages.fetch).toBe("error");
    // classify still runs (with empty articles)
    expect(mockClassifyAndStoreNews).toHaveBeenCalledOnce();
    expect(mockRunAnalysisPipeline).toHaveBeenCalledOnce();
    expect(mockRunSimPipeline).toHaveBeenCalledOnce();
  });

  it("returns per-stage status when all succeed", async () => {
    const result = await runPipeline();

    expect(result.status).toBe("ok");
    expect(result.stages).toEqual({
      fetch: "ok",
      classify: "ok",
      analysis: "ok",
      sim: "ok",
    });
  });

  it("marks multiple stage errors independently", async () => {
    mockRunAnalysisPipeline.mockRejectedValue(new Error("Analysis fail"));
    mockRunSimPipeline.mockRejectedValue(new Error("Sim fail"));

    const result = await runPipeline();

    expect(result.status).toBe("partial");
    expect(result.stages.fetch).toBe("ok");
    expect(result.stages.classify).toBe("ok");
    expect(result.stages.analysis).toBe("error");
    expect(result.stages.sim).toBe("error");
  });

  it("sets lastError on pipeline-progress when a stage fails", async () => {
    mockRunAnalysisPipeline.mockRejectedValue(new Error("LLM down"));

    await runPipeline();

    const prog = progress.getProgress();
    expect(prog.lastError).not.toBeNull();
    expect(prog.lastError!.stage).toBe("analysis");
    expect(prog.lastError!.message).toBe("LLM down");
  });

  it("clears lastError when all stages succeed", async () => {
    // First: fail
    mockRunAnalysisPipeline.mockRejectedValueOnce(new Error("fail"));
    await runPipeline();
    expect(progress.getProgress().lastError).not.toBeNull();

    // Second: succeed
    mockRunAnalysisPipeline.mockResolvedValueOnce(0);
    await runPipeline();
    expect(progress.getProgress().lastError).toBeNull();
  });

  it("records stage results in pipeline-progress", async () => {
    mockRunAnalysisPipeline.mockRejectedValue(new Error("oops"));

    await runPipeline();

    const prog = progress.getProgress();
    expect(prog.stageResults).toEqual({
      fetch: "ok",
      classify: "ok",
      analysis: "error",
      sim: "ok",
    });
  });
});

describe("Story 17.3 — Sim Pipeline Prior-Cycle Independence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchAllNews.mockResolvedValue([]);
    mockRunWhalePipeline.mockResolvedValue(0);
    mockClassifyAndStoreNews.mockResolvedValue(0);
    mockRunSimPipeline.mockResolvedValue(0);
  });

  it("sim pipeline runs when analysis pipeline throws", async () => {
    mockRunAnalysisPipeline.mockRejectedValue(new Error("LLM quota exceeded"));

    const result = await runPipeline();

    expect(mockRunSimPipeline).toHaveBeenCalledOnce();
    expect(result.stages.sim).toBe("ok");
    expect(result.stages.analysis).toBe("error");
  });

  it("sim pipeline runs when both fetch and analysis throw", async () => {
    mockFetchAllNews.mockRejectedValue(new Error("DNS failure"));
    mockRunAnalysisPipeline.mockRejectedValue(new Error("No data"));

    const result = await runPipeline();

    expect(mockRunSimPipeline).toHaveBeenCalledOnce();
    expect(result.stages.sim).toBe("ok");
  });

  it("sim pipeline runs and returns actions when analysis fails", async () => {
    mockRunAnalysisPipeline.mockRejectedValue(new Error("fail"));
    mockRunSimPipeline.mockResolvedValue(3); // 3 actions from prior-cycle recs

    const result = await runPipeline();

    expect(mockRunSimPipeline).toHaveBeenCalledOnce();
    expect(result.stages.sim).toBe("ok");
  });
});
