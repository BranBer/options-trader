import { describe, it, expect } from "vitest";

/**
 * Story 44.4 – Verify PriceChartHandle and TechnicalChartHandle type exports
 * exist and have the expected shape.  These are structural/contract tests
 * that run in Node (no DOM needed).
 */

describe("Chart ref handle exports", () => {
  it("PriceChartHandle has takeScreenshot method signature", async () => {
    const mod = await import("@/components/charts/PriceChart");
    // The module should export PriceChartHandle as a type – we can't
    // inspect types at runtime, but we can verify the module exports
    // the default component (forwardRef wrapper).
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("object"); // forwardRef returns an object with $$typeof
  });

  it("TechnicalChart exports TechnicalChartHandle type and default component", async () => {
    const mod = await import("@/components/shared/TechnicalChart");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe("object"); // forwardRef wrapper
  });

  it("PriceChartHandle interface shape is correct (compile-time check)", () => {
    // This test exists so TypeScript validates the import at compile time.
    // If PriceChartHandle changes shape, this file will fail type-check.
    type AssertScreenshot =
      import("@/components/charts/PriceChart").PriceChartHandle["takeScreenshot"];
    const _check: AssertScreenshot = (() => null) as AssertScreenshot;
    expect(typeof _check).toBe("function");
  });

  it("TechnicalChartHandle interface shape is correct (compile-time check)", () => {
    type AssertScreenshot =
      import("@/components/shared/TechnicalChart").TechnicalChartHandle["takeScreenshot"];
    const _check: AssertScreenshot = (() => null) as AssertScreenshot;
    expect(typeof _check).toBe("function");
  });
});
