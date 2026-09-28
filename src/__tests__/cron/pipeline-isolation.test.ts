import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---
const mockFetchAllNews = vi.fn();
const mockFetchAllTechNews = vi.fn();
const mockClassifyAndStoreNews = vi.fn();
const mockRunWhalePipeline = vi.fn();
const mockRunAnalysisPipeline = vi.fn();
const mockRefreshNexusEarnings = vi.fn().mockResolvedValue(new Map());
const mockRecordPipelineRunStart = vi.fn(() => 101);
const mockRecordPipelineRunCompletion = vi.fn(() => "2026-04-02T12:30:00.000Z");
const mockGetLastCompletedPipelineRefreshAt = vi.fn(() => null);
const mockCronSchedule = vi.fn();

vi.mock("@/lib/services/news-fetcher", () => ({
  fetchAllNews: (...args: unknown[]) => mockFetchAllNews(...args),
}));

vi.mock("@/lib/services/tech-news-fetcher", () => ({
  fetchAllTechNews: (...args: unknown[]) => mockFetchAllTechNews(...args),
}));

vi.mock("@/lib/services/live-economic-calendar", () => ({
  refreshCalendarCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/cron/pipelines/news-pipeline", () => ({
  classifyAndStoreNews: (...args: unknown[]) =>
    mockClassifyAndStoreNews(...args),
  runTechNewsPipeline: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/cron/pipelines/whale-pipeline", () => ({
  runWhalePipeline: (...args: unknown[]) => mockRunWhalePipeline(...args),
}));

vi.mock("@/lib/cron/pipelines/analysis-pipeline", () => ({
  runAnalysisPipeline: (...args: unknown[]) => mockRunAnalysisPipeline(...args),
}));

vi.mock("@/lib/services/nexus-earnings-cache", () => ({
  refreshNexusEarnings: (...args: unknown[]) =>
    mockRefreshNexusEarnings(...args),
}));

vi.mock("@/lib/desk/run-desk", () => ({
  runDesk: vi.fn().mockResolvedValue({
    startedAt: "2026-04-02T12:00:00.000Z",
    completedAt: "2026-04-02T12:00:01.000Z",
    opened: 0,
    marked: 0,
    closed: 0,
    errors: [],
  }),
}));

vi.mock("node-cron", () => ({
  default: { schedule: (...args: unknown[]) => mockCronSchedule(...args) },
}));

vi.mock("@/lib/cron/pipeline-run-store", () => ({
  recordPipelineRunStart: (...args: unknown[]) =>
    mockRecordPipelineRunStart(...args),
  recordPipelineRunCompletion: (...args: unknown[]) =>
    mockRecordPipelineRunCompletion(...args),
  getLastCompletedPipelineRefreshAt: (...args: unknown[]) =>
    mockGetLastCompletedPipelineRefreshAt(...args),
}));

import { runPipeline, startScheduler } from "@/lib/cron/scheduler";
import * as progress from "@/lib/cron/pipeline-progress";

describe("Story 17.1 — Per-Stage Try/Catch Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Happy path defaults
    mockFetchAllNews.mockResolvedValue([]);
    mockFetchAllTechNews.mockResolvedValue([]);
    mockRunWhalePipeline.mockResolvedValue(0);
    mockClassifyAndStoreNews.mockResolvedValue(0);
    mockRunAnalysisPipeline.mockResolvedValue(0);
    mockRefreshNexusEarnings.mockResolvedValue(new Map());
    mockRecordPipelineRunStart.mockReturnValue(101);
    mockRecordPipelineRunCompletion.mockReturnValue("2026-04-02T12:30:00.000Z");
    mockGetLastCompletedPipelineRefreshAt.mockReturnValue(null);
  });

  it("continues to later stages when analysis throws", async () => {
    mockRunAnalysisPipeline.mockRejectedValue(
      new Error("LLM cross-reference failed"),
    );

    const result = await runPipeline();

    expect(result.status).toBe("partial");
    expect(result.stages.analysis).toBe("error");
  });

  it("continues to classify + analysis when fetch throws", async () => {
    mockFetchAllNews.mockRejectedValue(new Error("Network timeout"));

    const result = await runPipeline();

    expect(result.stages.fetch).toBe("error");
    // classify still runs (with empty articles)
    expect(mockClassifyAndStoreNews).toHaveBeenCalledOnce();
    expect(mockRunAnalysisPipeline).toHaveBeenCalledOnce();
  });

  it("returns per-stage status when all succeed", async () => {
    const result = await runPipeline();

    expect(result.status).toBe("ok");
    expect(result.stages).toEqual({
      fetch: "ok",
      classify: "ok",
      analysis: "ok",
    });
  });

  it("marks multiple stage errors independently", async () => {
    mockRunAnalysisPipeline.mockRejectedValue(new Error("Analysis fail"));

    const result = await runPipeline();

    expect(result.status).toBe("partial");
    expect(result.stages.fetch).toBe("ok");
    expect(result.stages.classify).toBe("ok");
    expect(result.stages.analysis).toBe("error");
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
    });
  });

  it("warms nexus earnings cache on scheduler startup", async () => {
    startScheduler();

    // 10-min pipeline, daily calendar refresh, 2h nexus earnings refresh,
    // (Story S4) daily Jev judgment scoring, and (Story S6) the daily desk run.
    expect(mockCronSchedule).toHaveBeenCalledTimes(5);
    expect(mockRefreshNexusEarnings).toHaveBeenCalledTimes(1);
  });
});
