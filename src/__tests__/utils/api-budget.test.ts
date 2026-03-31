import { describe, it, expect, beforeEach } from "vitest";
import {
  recordApiCall,
  getUsage,
  getBudget,
  isOverBudget,
  getRemainingBudget,
  getBudgetSummary,
} from "@/lib/utils/api-budget";

// The module uses a module-level Map, so we need to be mindful of test order.
// Since we can't easily reset module state, we use a unique provider per test group.

describe("api-budget", () => {
  describe("recordApiCall + getUsage", () => {
    it("returns 0 for an unused provider", () => {
      expect(getUsage("unused_provider_xyz")).toBe(0);
    });

    it("increments usage when calls are recorded", () => {
      recordApiCall("test_provider_a");
      expect(getUsage("test_provider_a")).toBe(1);
      recordApiCall("test_provider_a");
      expect(getUsage("test_provider_a")).toBe(2);
    });

    it("records multiple calls at once with count parameter", () => {
      recordApiCall("test_provider_b", 10);
      expect(getUsage("test_provider_b")).toBe(10);
      recordApiCall("test_provider_b", 5);
      expect(getUsage("test_provider_b")).toBe(15);
    });
  });

  describe("getBudget", () => {
    it("returns known budget for yahoo", () => {
      expect(getBudget("yahoo")).toBe(1800);
    });

    it("returns known budget for finnhub", () => {
      expect(getBudget("finnhub")).toBe(250);
    });

    it("returns default 1000 for unknown providers", () => {
      expect(getBudget("unknown_random_api")).toBe(1000);
    });
  });

  describe("isOverBudget", () => {
    it("returns false when under budget", () => {
      expect(isOverBudget("test_budget_c")).toBe(false);
    });

    it("returns true when at or over budget", () => {
      // Unknown provider has budget of 1000
      recordApiCall("test_budget_d", 1000);
      expect(isOverBudget("test_budget_d")).toBe(true);
    });
  });

  describe("getRemainingBudget", () => {
    it("returns full budget for unused provider", () => {
      expect(getRemainingBudget("test_remain_e")).toBe(1000);
    });

    it("returns reduced budget after calls", () => {
      recordApiCall("test_remain_f", 300);
      expect(getRemainingBudget("test_remain_f")).toBe(700);
    });

    it("returns 0 when over budget", () => {
      recordApiCall("test_remain_g", 1500);
      expect(getRemainingBudget("test_remain_g")).toBe(0);
    });
  });

  describe("getBudgetSummary", () => {
    it("returns summary for all known providers", () => {
      const summary = getBudgetSummary();
      expect(summary).toHaveProperty("yahoo");
      expect(summary).toHaveProperty("finnhub");
      expect(summary).toHaveProperty("polygon");
      expect(summary).toHaveProperty("marketaux");
    });

    it("each provider summary has correct shape", () => {
      const summary = getBudgetSummary();
      for (const entry of Object.values(summary)) {
        expect(entry).toHaveProperty("used");
        expect(entry).toHaveProperty("budget");
        expect(entry).toHaveProperty("pct");
        expect(typeof entry.used).toBe("number");
        expect(typeof entry.budget).toBe("number");
        expect(typeof entry.pct).toBe("number");
      }
    });

    it("shows correct usage for a provider with recorded calls", () => {
      recordApiCall("yahoo", 100);
      const summary = getBudgetSummary();
      expect(summary.yahoo.used).toBeGreaterThanOrEqual(100);
      expect(summary.yahoo.budget).toBe(1800);
    });
  });
});
