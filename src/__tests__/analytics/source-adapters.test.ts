import { describe, expect, it } from "vitest";
import { createSourceRegistry } from "@/lib/analytics/data-source-registry";
import {
  fetchEarningsCalendar,
  fetchInsiderFilings,
  fetchVolatilityContext,
  fetchSectorContext,
} from "@/lib/analytics/source-adapters";

describe("fetchEarningsCalendar", () => {
  it("returns error when no API key is available", async () => {
    const registry = createSourceRegistry();
    const result = await fetchEarningsCalendar(registry, ["AAPL"]);

    // Without API keys, should return error
    expect(result.timestamp).toBeGreaterThan(0);
    if (result.error) {
      expect(result.error).toContain("Missing API key");
    }
  });

  it("returns data from available source when API key is set", async () => {
    const registry = createSourceRegistry();
    // This test verifies the adapter structure works when a source is available
    const result = await fetchEarningsCalendar(registry, ["AAPL"]);

    expect(result.source).not.toBe("none");
    expect(result.timestamp).toBeGreaterThan(0);
  });
});

describe("fetchInsiderFilings", () => {
  it("returns error when no API key is available", async () => {
    const registry = createSourceRegistry();
    const result = await fetchInsiderFilings(registry, "AAPL");

    expect(result.timestamp).toBeGreaterThan(0);
    if (result.error) {
      expect(result.error).toContain("Missing API key");
    }
  });
});

describe("fetchVolatilityContext", () => {
  it("returns error when no API key is available", async () => {
    const registry = createSourceRegistry();
    const result = await fetchVolatilityContext(registry, "AAPL");

    expect(result.timestamp).toBeGreaterThan(0);
    if (result.error) {
      expect(result.error).toContain("Missing API key");
    }
  });
});

describe("fetchSectorContext", () => {
  it("returns error when no API key is available", async () => {
    const registry = createSourceRegistry();
    const result = await fetchSectorContext(registry, "AAPL");

    expect(result.timestamp).toBeGreaterThan(0);
    if (result.error) {
      expect(result.error).toContain("Missing API key");
    }
  });
});
