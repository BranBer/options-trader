import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock DB ──────────────────────────────────────────────────────────────
const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
}));

vi.mock("@/lib/db/client", () => ({ db: mockDb }));

// Stub out modules that have side-effects or are irrelevant to this test
vi.mock("@/lib/services/market-pulse-engine", () => ({
  orchestrateTickerPulse: vi.fn(),
}));
vi.mock("@/lib/services/market-pulse-candles", () => ({
  LOOKBACK_CANDLE_COUNT: 96,
}));
vi.mock("@/lib/utils/market-hours", () => ({
  isMarketOpen: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/services/market-pulse-progress", () => ({
  finishTickerProgress: vi.fn(),
}));

import { resolveOrphanedRuns } from "@/lib/services/market-pulse-scheduler";

// ── Helpers ──────────────────────────────────────────────────────────────
function makeUpdateChain(changes = 0) {
  const whereResult = { changes };
  const where = vi.fn().mockResolvedValue(whereResult);
  const set = vi.fn(() => ({ where }));
  return { set, where, whereResult };
}

// ── Tests ────────────────────────────────────────────────────────────────
describe("resolveOrphanedRuns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates all 'running' rows to 'error' with orphan message", async () => {
    const chain = makeUpdateChain(3);
    mockDb.update.mockReturnValue(chain);

    const resolved = await resolveOrphanedRuns();

    expect(resolved).toBe(3);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        errorMessage: "Orphaned — server restarted",
      }),
    );
  });

  it("returns 0 when no orphaned rows exist", async () => {
    const chain = makeUpdateChain(0);
    mockDb.update.mockReturnValue(chain);

    const resolved = await resolveOrphanedRuns();

    expect(resolved).toBe(0);
  });
});
