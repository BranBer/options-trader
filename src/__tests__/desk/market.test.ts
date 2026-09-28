import { describe, expect, it } from "vitest";
import {
  addDays,
  addWeekdays,
  annualizedHV,
  fillClose,
  fillOpen,
  nextWeekday,
  occ,
  payoffAt,
  payoffGridMaxLoss,
  positionValue,
  toNyDate,
  type PayoffLeg,
} from "@/lib/desk/market";

describe("occ ticker format", () => {
  it("builds the OCC ticker for a call", () => {
    expect(occ("NVDA", "2026-05-15", "C", 215)).toBe("O:NVDA260515C00215000");
  });

  it("builds the OCC ticker for a put with a fractional strike", () => {
    expect(occ("SPY", "2026-01-02", "P", 12.5)).toBe("O:SPY260102P00012500");
  });
});

describe("date helpers", () => {
  it("nextWeekday skips a following Saturday", () => {
    // 2026-09-25 is a Friday
    expect(nextWeekday("2026-09-25")).toBe("2026-09-28");
  });

  it("nextWeekday steps forward a normal weekday", () => {
    expect(nextWeekday("2026-09-28")).toBe("2026-09-29");
  });

  it("addWeekdays skips weekends when counting forward", () => {
    // Friday + 1 weekday = Monday
    expect(addWeekdays("2026-09-25", 1)).toBe("2026-09-28");
    // Friday + 3 weekdays = Wednesday
    expect(addWeekdays("2026-09-25", 3)).toBe("2026-09-30");
  });

  it("addDays is calendar-day arithmetic (no weekend skipping)", () => {
    expect(addDays("2026-09-25", 3)).toBe("2026-09-28");
  });

  it("toNyDate renders a UTC evening timestamp as the next NY calendar date boundary correctly", () => {
    // Midnight UTC on 2026-09-26 is still 2026-09-25 evening in New York.
    expect(toNyDate(Date.parse("2026-09-26T00:00:00Z"))).toBe("2026-09-25");
  });
});

describe("half-spread cost model", () => {
  it("buying pays price*(1+h); selling receives price*(1-h)", () => {
    expect(fillOpen(10, 0.02, 1)).toBeCloseTo(10.2, 6);
    expect(fillOpen(10, 0.02, -1)).toBeCloseTo(9.8, 6);
  });

  it("closing reverses the direction relative to opening", () => {
    expect(fillClose(10, 0.02, 1)).toBeCloseTo(9.8, 6); // closing a long = selling
    expect(fillClose(10, 0.02, -1)).toBeCloseTo(10.2, 6); // closing a short = buying back
  });
});

describe("positionValue (single formula for debit and credit structures)", () => {
  it("entryValue for a long straddle equals the classic debit formula", () => {
    const legs = [
      { side: 1 as const, qty: 1 },
      { side: 1 as const, qty: 1 },
    ];
    const v0 = positionValue(legs, [3, 4], 0.02, true);
    expect(v0).toBeCloseTo((3 + 4) * 1.02, 6);
  });

  it("entryValue for a short iron fly equals -credit, and pnl = markValue - entryValue matches the credit/close-cost formula", () => {
    const legs = [
      { side: -1 as const, qty: 1 }, // short call K
      { side: -1 as const, qty: 1 }, // short put K
      { side: 1 as const, qty: 1 }, // long call wing
      { side: 1 as const, qty: 1 }, // long put wing
    ];
    const h = 0.02;
    const entryPrices = [5, 5, 1, 1];
    const entryValue = positionValue(legs, entryPrices, h, true);
    const credit = (5 + 5) * (1 - h) - (1 + 1) * (1 + h);
    expect(entryValue).toBeCloseTo(-credit, 6);

    const closePrices = [4, 4, 0.5, 0.5];
    const markValue = positionValue(legs, closePrices, h, false);
    const closeCost = (4 + 4) * (1 + h) - (0.5 + 0.5) * (1 - h);
    const pnl = markValue - entryValue;
    expect(pnl).toBeCloseTo(credit - closeCost, 6);
  });
});

describe("payoff / max loss", () => {
  it("payoffAt sums intrinsic value across legs at a given underlying close", () => {
    const legs: PayoffLeg[] = [
      { side: 1, qty: 1, cp: "C", strike: 100 },
      { side: -1, qty: 1, cp: "P", strike: 90 },
    ];
    expect(payoffAt(legs, 105)).toBe(5); // call ITM 5, put worthless
    expect(payoffAt(legs, 80)).toBe(-10); // call worthless, short put loses 10
  });

  it("payoffGridMaxLoss is unbounded for a naked short call", () => {
    const legs: PayoffLeg[] = [{ side: -1, qty: 1, cp: "C", strike: 100 }];
    expect(payoffGridMaxLoss(legs, -2)).toBe(Infinity);
  });
});

describe("annualizedHV", () => {
  it("returns null with insufficient history", () => {
    expect(annualizedHV([100, 101, 102], 20)).toBeNull();
  });

  it("returns 0 for a perfectly flat price series", () => {
    const closes = Array.from({ length: 25 }, () => 100);
    expect(annualizedHV(closes, 20)).toBe(0);
  });
});
