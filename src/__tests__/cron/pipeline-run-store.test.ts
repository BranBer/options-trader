import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRun, mockGet, mockPrepare } = vi.hoisted(() => {
  const mockRun = vi.fn();
  const mockGet = vi.fn();
  const mockPrepare = vi.fn((sql: string) => {
    if (sql.includes("INSERT INTO pipeline_runs")) {
      return { run: mockRun };
    }
    if (sql.includes("UPDATE pipeline_runs")) {
      return { run: mockRun };
    }
    return { get: mockGet };
  });

  return { mockRun, mockGet, mockPrepare };
});

vi.mock("@/lib/db/client", () => ({
  sqlite: {
    prepare: mockPrepare,
  },
}));

import {
  getLastCompletedPipelineRefreshAt,
  recordPipelineRunCompletion,
  recordPipelineRunStart,
} from "@/lib/cron/pipeline-run-store";

describe("pipeline-run-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRun.mockReturnValue({ lastInsertRowid: 12 });
    mockGet.mockReturnValue(undefined);
  });

  it("records pipeline run starts and returns the inserted id", () => {
    expect(recordPipelineRunStart("manual")).toBe(12);
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO pipeline_runs"),
    );
  });

  it("records pipeline run completion and returns the completion timestamp", () => {
    const completedAt = recordPipelineRunCompletion({
      runId: 12,
      status: "ok",
      stages: {
        fetch: "ok",
        classify: "ok",
        analysis: "ok",
        sim: "ok",
      },
      errorMessage: null,
    });

    expect(typeof completedAt).toBe("string");
    expect(mockPrepare).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE pipeline_runs"),
    );
  });

  it("returns the latest completed refresh timestamp from storage", () => {
    mockGet.mockReturnValue({ completedAt: "2026-04-03T00:24:00.000Z" });

    expect(getLastCompletedPipelineRefreshAt()).toBe(
      "2026-04-03T00:24:00.000Z",
    );
  });
});