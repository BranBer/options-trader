import { describe, it, expect } from "vitest";
import {
  validateTradeLegs,
  validateStrategyConsistency,
} from "@/lib/services/sim-engine";
import type { SimLeg } from "@/types/portfolio";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a leg with sensible defaults. */
function leg(overrides: Partial<SimLeg> = {}): SimLeg {
  return {
    action: "buy",
    type: "call",
    strike: 150,
    expiry: futureDate(30),
    premium: 5.0,
    quantity: 1,
    ...overrides,
  };
}

/** Return a YYYY-MM-DD string N calendar days from `base`. */
function futureDate(days: number, base: Date = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** A fixed "now" for deterministic tests (Monday 2026-03-30 at noon ET). */
const NOW = new Date("2026-03-30T12:00:00-04:00");

const CURRENT_PRICE = 150;
const BALANCE = 2000;

// ---------------------------------------------------------------------------
// Story 19.1 — Expiry validation
// ---------------------------------------------------------------------------

describe("validateTradeLegs — Expiry validation (Story 19.1)", () => {
  it("rejects a leg that expired yesterday", () => {
    const result = validateTradeLegs(
      [leg({ expiry: futureDate(-1, NOW) })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/past or today/i);
  });

  it("rejects a leg expiring today", () => {
    const today = NOW.toLocaleDateString("en-CA", {
      timeZone: "America/New_York",
    });
    const result = validateTradeLegs(
      [leg({ expiry: today })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/past or today/i);
  });

  it("accepts a leg expiring tomorrow", () => {
    // Tomorrow is Tuesday, 1 trading day — will trigger DTE warning but not expiry reject
    const result = validateTradeLegs(
      [leg({ expiry: futureDate(1, NOW) })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    // DTE < 2, all legs below min → rejected by DTE guard, not expiry
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/trading days/i);
  });

  it("accepts a leg expiring in 10 days", () => {
    const result = validateTradeLegs(
      [leg({ expiry: futureDate(10, NOW) })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(true);
  });

  it("rejects a malformed expiry string", () => {
    const result = validateTradeLegs(
      [leg({ expiry: "soon" })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Invalid expiry date format/);
  });

  it("rejects empty expiry string", () => {
    const result = validateTradeLegs(
      [leg({ expiry: "" })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Invalid expiry date format/);
  });

  it("rejects 'N/A' expiry string", () => {
    const result = validateTradeLegs(
      [leg({ expiry: "N/A" })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/Invalid expiry date format/);
  });
});

// ---------------------------------------------------------------------------
// Story 19.2 — Minimum DTE guard
// ---------------------------------------------------------------------------

describe("validateTradeLegs — Minimum DTE guard (Story 19.2)", () => {
  it("rejects when ALL legs have DTE < 2 trading days", () => {
    // 1 calendar day out = 1 trading day (Tue). Below the 2-day threshold.
    const result = validateTradeLegs(
      [leg({ expiry: futureDate(1, NOW) })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/trading days/i);
  });

  it("warns but allows when SOME legs have low DTE but not all", () => {
    const legs = [
      leg({ expiry: futureDate(1, NOW), strike: 150 }), // low DTE
      leg({ expiry: futureDate(30, NOW), strike: 160 }), // fine
    ];
    const result = validateTradeLegs(
      legs,
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/Low DTE/);
  });

  it("accepts legs with 3+ trading days remaining", () => {
    // 5 calendar days from Monday = Saturday, but the intervening Mon-Fri has 5 trading days
    const result = validateTradeLegs(
      [leg({ expiry: futureDate(7, NOW) })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Story 19.3 — Strike reasonableness
// ---------------------------------------------------------------------------

describe("validateTradeLegs — Strike reasonableness (Story 19.3)", () => {
  it("rejects a call strike >50% OTM", () => {
    const result = validateTradeLegs(
      [leg({ strike: 260, expiry: futureDate(30, NOW) })], // 73% OTM
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/OTM/i);
  });

  it("rejects a put strike >50% OTM", () => {
    const result = validateTradeLegs(
      [leg({ type: "put", strike: 50, expiry: futureDate(30, NOW) })], // 67% OTM
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/OTM/i);
  });

  it("accepts a call strike within 50% OTM", () => {
    const result = validateTradeLegs(
      [leg({ strike: 200, expiry: futureDate(30, NOW) })], // 33% OTM
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(true);
  });

  it("relaxes OTM check for protective (buy) leg in a spread", () => {
    // In a call spread, the buy leg can be far OTM (it's the protection)
    const legs = [
      leg({
        action: "sell",
        type: "call",
        strike: 160,
        expiry: futureDate(30, NOW),
        premium: 3,
      }),
      leg({
        action: "buy",
        type: "call",
        strike: 260,
        expiry: futureDate(30, NOW),
        premium: 0.5,
      }),
    ];
    const result = validateTradeLegs(
      legs,
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Story 19.4 — Premium sanity
// ---------------------------------------------------------------------------

describe("validateTradeLegs — Premium sanity (Story 19.4)", () => {
  it("rejects a buy leg with zero premium", () => {
    const result = validateTradeLegs(
      [leg({ premium: 0, expiry: futureDate(30, NOW) })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/non-positive premium/i);
  });

  it("rejects a buy leg with negative premium", () => {
    const result = validateTradeLegs(
      [leg({ premium: -2, expiry: futureDate(30, NOW) })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/non-positive premium/i);
  });

  it("rejects a premium exceeding 50% of stock price", () => {
    const result = validateTradeLegs(
      [leg({ premium: 80, expiry: futureDate(30, NOW) })], // 80 > 75 (50% of 150)
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/exceeds 50%/i);
  });

  it("accepts a reasonable premium", () => {
    const result = validateTradeLegs(
      [leg({ premium: 5, expiry: futureDate(30, NOW) })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(true);
  });

  it("allows sell legs with any premium (credit received)", () => {
    const result = validateTradeLegs(
      [leg({ action: "sell", premium: 0.5, expiry: futureDate(30, NOW) })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Story 19.5 — Strategy leg consistency
// ---------------------------------------------------------------------------

describe("validateStrategyConsistency (Story 19.5)", () => {
  describe("Vertical spreads", () => {
    it("accepts a valid bull call spread", () => {
      const result = validateStrategyConsistency("Bull Call Spread", [
        leg({ action: "buy", type: "call", strike: 150, expiry: "2026-05-15" }),
        leg({
          action: "sell",
          type: "call",
          strike: 160,
          expiry: "2026-05-15",
          premium: 3,
        }),
      ]);
      expect(result.valid).toBe(true);
    });

    it("rejects a vertical spread with 1 leg", () => {
      const result = validateStrategyConsistency("Bull Call Spread", [
        leg({ action: "buy", type: "call", strike: 150 }),
      ]);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/exactly 2 legs/);
    });

    it("rejects a vertical spread with mixed types (call + put)", () => {
      const result = validateStrategyConsistency("Bull Call Spread", [
        leg({ action: "buy", type: "call", strike: 150, expiry: "2026-05-15" }),
        leg({
          action: "sell",
          type: "put",
          strike: 140,
          expiry: "2026-05-15",
          premium: 2,
        }),
      ]);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/same type/i);
    });

    it("rejects a vertical spread with mismatched expiries", () => {
      const result = validateStrategyConsistency("Bear Put Spread", [
        leg({ action: "buy", type: "put", strike: 150, expiry: "2026-05-15" }),
        leg({
          action: "sell",
          type: "put",
          strike: 140,
          expiry: "2026-06-15",
          premium: 2,
        }),
      ]);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/same expiry/i);
    });

    it("rejects a vertical spread with same strikes", () => {
      const result = validateStrategyConsistency("Bull Call Spread", [
        leg({ action: "buy", type: "call", strike: 150, expiry: "2026-05-15" }),
        leg({
          action: "sell",
          type: "call",
          strike: 150,
          expiry: "2026-05-15",
          premium: 3,
        }),
      ]);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/different strikes/i);
    });

    it("rejects a vertical spread with two buy legs", () => {
      const result = validateStrategyConsistency("Bull Call Spread", [
        leg({ action: "buy", type: "call", strike: 150, expiry: "2026-05-15" }),
        leg({ action: "buy", type: "call", strike: 160, expiry: "2026-05-15" }),
      ]);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/one buy and one sell/i);
    });
  });

  describe("Iron condor", () => {
    it("accepts a valid iron condor", () => {
      const result = validateStrategyConsistency("Iron Condor", [
        leg({ action: "buy", type: "put", strike: 130, expiry: "2026-05-15" }),
        leg({
          action: "sell",
          type: "put",
          strike: 140,
          expiry: "2026-05-15",
          premium: 3,
        }),
        leg({
          action: "sell",
          type: "call",
          strike: 160,
          expiry: "2026-05-15",
          premium: 3,
        }),
        leg({ action: "buy", type: "call", strike: 170, expiry: "2026-05-15" }),
      ]);
      expect(result.valid).toBe(true);
    });

    it("rejects an iron condor with 3 legs", () => {
      const result = validateStrategyConsistency("Iron Condor", [
        leg({ action: "buy", type: "put", strike: 130, expiry: "2026-05-15" }),
        leg({
          action: "sell",
          type: "put",
          strike: 140,
          expiry: "2026-05-15",
          premium: 3,
        }),
        leg({
          action: "sell",
          type: "call",
          strike: 160,
          expiry: "2026-05-15",
          premium: 3,
        }),
      ]);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/4 legs/);
    });

    it("rejects an iron condor with mismatched expiries", () => {
      const result = validateStrategyConsistency("Iron Condor", [
        leg({ action: "buy", type: "put", strike: 130, expiry: "2026-05-15" }),
        leg({
          action: "sell",
          type: "put",
          strike: 140,
          expiry: "2026-05-15",
          premium: 3,
        }),
        leg({
          action: "sell",
          type: "call",
          strike: 160,
          expiry: "2026-06-15",
          premium: 3,
        }),
        leg({ action: "buy", type: "call", strike: 170, expiry: "2026-05-15" }),
      ]);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/same expiry/i);
    });

    it("rejects an iron condor with 3 calls and 1 put", () => {
      const result = validateStrategyConsistency("Iron Condor", [
        leg({ action: "buy", type: "call", strike: 130, expiry: "2026-05-15" }),
        leg({
          action: "sell",
          type: "call",
          strike: 140,
          expiry: "2026-05-15",
          premium: 3,
        }),
        leg({
          action: "sell",
          type: "call",
          strike: 160,
          expiry: "2026-05-15",
          premium: 3,
        }),
        leg({ action: "buy", type: "put", strike: 170, expiry: "2026-05-15" }),
      ]);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/2 calls and 2 puts/);
    });
  });

  describe("Straddle / Strangle", () => {
    it("accepts a valid straddle", () => {
      const result = validateStrategyConsistency("Long Straddle", [
        leg({ action: "buy", type: "call", strike: 150, expiry: "2026-05-15" }),
        leg({ action: "buy", type: "put", strike: 150, expiry: "2026-05-15" }),
      ]);
      expect(result.valid).toBe(true);
    });

    it("rejects a straddle with different strikes", () => {
      const result = validateStrategyConsistency("Long Straddle", [
        leg({ action: "buy", type: "call", strike: 150, expiry: "2026-05-15" }),
        leg({ action: "buy", type: "put", strike: 145, expiry: "2026-05-15" }),
      ]);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/same strike/i);
    });

    it("accepts a strangle with different strikes", () => {
      const result = validateStrategyConsistency("Long Strangle", [
        leg({ action: "buy", type: "call", strike: 155, expiry: "2026-05-15" }),
        leg({ action: "buy", type: "put", strike: 145, expiry: "2026-05-15" }),
      ]);
      expect(result.valid).toBe(true);
    });

    it("rejects a straddle with mismatched expiries", () => {
      const result = validateStrategyConsistency("Long Straddle", [
        leg({ action: "buy", type: "call", strike: 150, expiry: "2026-05-15" }),
        leg({ action: "buy", type: "put", strike: 150, expiry: "2026-06-15" }),
      ]);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/same expiry/i);
    });

    it("rejects a straddle with 2 calls", () => {
      const result = validateStrategyConsistency("Long Straddle", [
        leg({ action: "buy", type: "call", strike: 150, expiry: "2026-05-15" }),
        leg({ action: "buy", type: "call", strike: 150, expiry: "2026-05-15" }),
      ]);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/one call and one put/i);
    });
  });

  describe("Single-leg strategies", () => {
    it("accepts a single long call", () => {
      const result = validateStrategyConsistency("Long Call", [
        leg({ action: "buy", type: "call", strike: 150 }),
      ]);
      expect(result.valid).toBe(true);
    });

    it("warns but allows wrong leg count for single-leg", () => {
      const result = validateStrategyConsistency("Long Put", [
        leg({ action: "buy", type: "put", strike: 140 }),
        leg({ action: "sell", type: "put", strike: 130, premium: 2 }),
      ]);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toMatch(/expected 1 leg/i);
    });
  });

  describe("Unrecognized strategies", () => {
    it("allows through with a warning", () => {
      const result = validateStrategyConsistency("Reverse Jade Lizard", [
        leg({}),
        leg({ action: "sell", premium: 3 }),
        leg({ type: "put" }),
      ]);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toMatch(/Unrecognized strategy/i);
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: validateTradeLegs calls strategy consistency (19.5 wired)
// ---------------------------------------------------------------------------

describe("validateTradeLegs — strategy consistency integration", () => {
  it("rejects when strategy name contradicts leg structure", () => {
    const result = validateTradeLegs(
      [leg({ expiry: futureDate(30, NOW) })], // single leg
      CURRENT_PRICE,
      BALANCE,
      "Bull Call Spread", // expects 2 legs
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/exactly 2 legs/);
  });

  it("passes when strategy matches legs", () => {
    const result = validateTradeLegs(
      [
        leg({
          action: "buy",
          type: "call",
          strike: 150,
          expiry: futureDate(30, NOW),
          premium: 5,
        }),
        leg({
          action: "sell",
          type: "call",
          strike: 160,
          expiry: futureDate(30, NOW),
          premium: 3,
        }),
      ],
      CURRENT_PRICE,
      BALANCE,
      "Bull Call Spread",
      NOW,
    );
    expect(result.valid).toBe(true);
  });

  it("skips consistency check when strategyName is undefined", () => {
    const result = validateTradeLegs(
      [leg({ expiry: futureDate(30, NOW) })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Edge cases & combined scenarios
// ---------------------------------------------------------------------------

describe("validateTradeLegs — edge cases", () => {
  it("handles a multi-leg trade where first leg is valid but second is expired", () => {
    const legs = [
      leg({ expiry: futureDate(30, NOW) }),
      leg({ expiry: futureDate(-5, NOW), strike: 160 }),
    ];
    const result = validateTradeLegs(
      legs,
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/past or today/);
  });

  it("returns warnings array even on valid trades", () => {
    const result = validateTradeLegs(
      [leg({ expiry: futureDate(30, NOW) })],
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("handles ITM calls (strike < currentPrice) without OTM rejection", () => {
    const result = validateTradeLegs(
      [leg({ strike: 140, expiry: futureDate(30, NOW) })], // ITM — otmPct negative
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(true);
  });

  it("handles ITM puts (strike > currentPrice) without OTM rejection", () => {
    const result = validateTradeLegs(
      [leg({ type: "put", strike: 160, expiry: futureDate(30, NOW) })], // ITM
      CURRENT_PRICE,
      BALANCE,
      undefined,
      NOW,
    );
    expect(result.valid).toBe(true);
  });
});
