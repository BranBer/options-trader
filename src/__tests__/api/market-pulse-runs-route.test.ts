import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ db: mockDb }));
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number }) => ({
      data,
      status: init?.status ?? 200,
      json: () => data,
    })),
  },
}));

import { GET } from "@/app/api/market-pulse/runs/route";

function makeRequest(url: string) {
  return {
    nextUrl: new URL(url),
  } as any;
}

describe("GET /api/market-pulse/runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when ticker is missing", async () => {
    const response = await GET(
      makeRequest("http://localhost:3000/api/market-pulse/runs"),
    );

    expect(response.status).toBe(400);
    expect((response as any).data).toEqual({ error: "ticker is required" });
  });

  it("parses and returns stored telemetry for recent runs", async () => {
    mockDb.select.mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([
              {
                runId: "run-aapl-2",
                ticker: "AAPL",
                status: "partial",
                trigger: "manual",
                llmTokensUsed: 160,
                durationMs: 4200,
                startedAt: "2026-04-18T12:15:00.000Z",
                completedAt: "2026-04-18T12:15:04.200Z",
                errorMessage: "narrative: timeout",
                stages: JSON.stringify({
                  candleCount: 8,
                  stages: {
                    classification: {
                      durationMs: 2100,
                      llmTokensUsed: 100,
                      itemCount: 9,
                    },
                    correlation: {
                      durationMs: 1100,
                      llmTokensUsed: 60,
                      itemCount: 2,
                      averageConfidence: 0.84,
                    },
                  },
                }),
              },
            ]),
          })),
        })),
      })),
    }));

    const response = await GET(
      makeRequest(
        "http://localhost:3000/api/market-pulse/runs?ticker=aapl&limit=3",
      ),
    );
    const data = (response as any).data;

    expect(response.status).toBe(200);
    expect(data.runs).toHaveLength(1);
    expect(data.runs[0]).toMatchObject({
      runId: "run-aapl-2",
      ticker: "AAPL",
      status: "partial",
      trigger: "manual",
    });
    expect(data.runs[0].stages).toMatchObject({
      candleCount: 8,
      stages: {
        classification: { itemCount: 9 },
        correlation: { averageConfidence: 0.84 },
      },
    });
  });
});
