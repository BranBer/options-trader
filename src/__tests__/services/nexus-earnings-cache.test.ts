import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchEarningsDate: vi.fn(),
  fetchEpsSurprise: vi.fn(),
}));

vi.mock("@/lib/data/nexus-companies", () => ({
  NEXUS_COMPANIES: [
    { ticker: "AAPL", name: "Apple", sector: "Tech", dependents: [] },
    { ticker: "NVDA", name: "NVIDIA", sector: "Tech", dependents: [] },
    { ticker: "TSM", name: "TSMC", sector: "Tech", dependents: [] },
    { ticker: "ASML", name: "ASML", sector: "Tech", dependents: [] },
    { ticker: "AMD", name: "AMD", sector: "Tech", dependents: [] },
  ],
}));

vi.mock("@/lib/services/market-fetcher", () => ({
  fetchEarningsDate: (...args: unknown[]) => mocks.fetchEarningsDate(...args),
  fetchEpsSurprise: (...args: unknown[]) => mocks.fetchEpsSurprise(...args),
}));

async function loadModule() {
  return import("@/lib/services/nexus-earnings-cache");
}

describe("nexus-earnings-cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.fetchEarningsDate.mockResolvedValue("2026-04-16T12:00:00.000Z");
    mocks.fetchEpsSurprise.mockResolvedValue({
      epsSurprisePct: 7.5,
      epsActual: 1.5,
      epsEstimate: 1.4,
    });
  });

  it("refreshes and caches recent nexus earnings", async () => {
    const {
      refreshNexusEarnings,
      getCachedNexusEarnings,
      getNexusEarningsAge,
    } = await loadModule();

    const refreshed = await refreshNexusEarnings();
    const cached = getCachedNexusEarnings();

    expect(refreshed.size).toBe(5);
    expect(cached.size).toBe(5);
    expect(cached.get("AAPL")).toMatchObject({
      reportedAt: "2026-04-16T12:00:00.000Z",
      epsSurprisePct: 7.5,
    });
    expect(getNexusEarningsAge()).toBeGreaterThanOrEqual(0);
    expect(mocks.fetchEarningsDate).toHaveBeenCalledTimes(5);
    expect(mocks.fetchEpsSurprise).toHaveBeenCalledTimes(5);
  });

  it("returns an empty cache before first refresh", async () => {
    const { getCachedNexusEarnings, getNexusEarningsAge } = await loadModule();

    expect(getCachedNexusEarnings().size).toBe(0);
    expect(getNexusEarningsAge()).toBe(Number.POSITIVE_INFINITY);
  });

  it("skips EPS surprise fetches for stale reports", async () => {
    mocks.fetchEarningsDate
      .mockResolvedValueOnce("2026-04-10T12:00:00.000Z")
      .mockResolvedValue("2026-04-16T12:00:00.000Z");

    const { refreshNexusEarnings } = await loadModule();
    const refreshed = await refreshNexusEarnings();

    expect(refreshed.has("AAPL")).toBe(false);
    expect(refreshed.size).toBe(4);
    expect(mocks.fetchEpsSurprise).toHaveBeenCalledTimes(4);
  });

  it("handles partial failures and keeps successful entries", async () => {
    mocks.fetchEarningsDate
      .mockRejectedValueOnce(new Error("upstream fail"))
      .mockResolvedValue("2026-04-16T12:00:00.000Z");

    const { refreshNexusEarnings } = await loadModule();
    const refreshed = await refreshNexusEarnings();

    expect(refreshed.size).toBe(4);
    expect(refreshed.has("AAPL")).toBe(false);
  });

  it("fetches earnings data with bounded concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const releases: Array<() => void> = [];

    mocks.fetchEarningsDate.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          releases.push(() => {
            active -= 1;
            resolve("2026-04-16T12:00:00.000Z");
          });
        }),
    );

    const { refreshNexusEarnings } = await loadModule();
    const refreshPromise = refreshNexusEarnings();

    await Promise.resolve();
    await Promise.resolve();
    expect(maxActive).toBe(3);

    for (let index = 0; index < 5; index += 1) {
      while (releases.length === 0) {
        await Promise.resolve();
      }
      const release = releases.shift();
      release?.();
      await Promise.resolve();
    }

    await refreshPromise;
    expect(maxActive).toBe(3);
  });
});
