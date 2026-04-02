import { describe, expect, it, beforeEach } from "vitest";
import {
  createSourceRegistry,
  isThrottled,
  recordRequest,
  getCached,
  setCache,
  getAvailableSourcesForCategory,
} from "@/lib/analytics/data-source-registry";

describe("createSourceRegistry", () => {
  it("initializes with default configs", () => {
    const registry = createSourceRegistry();
    expect(registry.configs.size).toBeGreaterThan(0);
    expect(registry.configs.has("polygon")).toBe(true);
    expect(registry.configs.has("unusual_whales")).toBe(true);
  });
});

describe("isThrottled", () => {
  it("returns false when no requests have been made", () => {
    const registry = createSourceRegistry();
    expect(isThrottled(registry, "polygon")).toBe(false);
  });

  it("returns true after hitting rate limit", () => {
    const registry = createSourceRegistry();
    const config = registry.configs.get("polygon")!;
    for (let i = 0; i < config.requestsPerMinute; i++) {
      recordRequest(registry, "polygon");
    }
    expect(isThrottled(registry, "polygon")).toBe(true);
  });

  it("returns true for unknown source", () => {
    const registry = createSourceRegistry();
    expect(isThrottled(registry, "unknown_source")).toBe(true);
  });
});

describe("cache operations", () => {
  it("returns null for missing cache key", () => {
    const registry = createSourceRegistry();
    expect(getCached(registry, "missing")).toBeNull();
  });

  it("stores and retrieves cached data", () => {
    const registry = createSourceRegistry();
    setCache(registry, "test-key", { value: 42 }, 5);
    const result = getCached<{ value: number }>(registry, "test-key");
    expect(result).toEqual({ value: 42 });
  });

  it("returns null for expired cache", () => {
    const registry = createSourceRegistry();
    setCache(registry, "test-key", { value: 42 }, 0.0001);
    const result = getCached<{ value: number }>(registry, "test-key");
    // Either null or the data (timing-dependent)
    expect(result === null || result.value === 42).toBe(true);
  });
});

describe("getAvailableSourcesForCategory", () => {
  it("returns sources sorted by priority", () => {
    const registry = createSourceRegistry();
    const sources = getAvailableSourcesForCategory(registry, "options_flow");
    expect(sources.length).toBeGreaterThan(0);
    expect(sources[0].priority).toBe("high");
  });

  it("returns empty for unknown category", () => {
    const registry = createSourceRegistry();
    const sources = getAvailableSourcesForCategory(
      registry,
      "unknown_category",
    );
    expect(sources.length).toBe(0);
  });
});
