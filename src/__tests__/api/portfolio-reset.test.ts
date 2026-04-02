import { beforeEach, describe, expect, it, vi } from "vitest";

type MockResponse = { data: unknown };

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    delete: vi.fn(),
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({
  db: mockDb,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((data: unknown) => ({ data })),
  },
}));

import { DELETE } from "@/app/api/portfolio/route";

describe("DELETE /api/portfolio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.delete.mockResolvedValue(undefined);
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([
          {
            id: 1,
            balance: 30000,
            startingBalance: 30000,
            lastUpdated: "2026-04-02T15:30:00.000Z",
          },
        ]),
      }),
    });
  });

  it("wipes trading data and recreates the portfolio at the default balance", async () => {
    const response = await DELETE();
    const data = (response as unknown as MockResponse).data as {
      reset: boolean;
      portfolio: {
        balance: number;
        startingBalance: number;
        totalTrades: number;
        totalPnl: number;
      };
    };

    expect(mockDb.delete).toHaveBeenCalledTimes(4);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(data.reset).toBe(true);
    expect(data.portfolio).toMatchObject({
      balance: 30000,
      startingBalance: 30000,
      totalTrades: 0,
      totalPnl: 0,
    });
  });
});
