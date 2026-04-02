import { describe, it, expect } from "vitest";
import {
  getSameDayEntryPolicy,
  isMarketOpen,
  isWithinTradingWindow,
} from "@/lib/utils/market-hours";

// Helper: create a Date at a specific ET time on a given date.
// We use known offsets — EDT (UTC-4) for summer, EST (UTC-5) for winter.
// March 29 2026 is a Sunday — DST starts March 8, so EDT applies.
// Use a weekday for regular tests: March 30 2026 is Monday (EDT, UTC-4).
function etDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  utcOffset: number = -4,
): Date {
  // utcOffset is the ET offset (e.g. -4 for EDT, -5 for EST)
  const utcHour = hour - utcOffset;
  return new Date(Date.UTC(year, month - 1, day, utcHour, minute));
}

describe("isMarketOpen", () => {
  describe("regular hours", () => {
    it("returns isOpen: true at 10:00 AM ET on a Monday", () => {
      const mon10am = etDate(2026, 3, 30, 10, 0); // Mon Mar 30 2026
      const result = isMarketOpen(mon10am);
      expect(result.isOpen).toBe(true);
      expect(result.isExtendedHours).toBe(false);
      expect(result.reason).toBe("regular_hours");
    });

    it("returns isOpen: true at 9:30 AM ET exactly (market open)", () => {
      const open = etDate(2026, 3, 30, 9, 30);
      expect(isMarketOpen(open).isOpen).toBe(true);
    });

    it("returns isOpen: true at 3:59 PM ET (just before close)", () => {
      const beforeClose = etDate(2026, 3, 30, 15, 59);
      expect(isMarketOpen(beforeClose).isOpen).toBe(true);
    });

    it("returns isOpen: false at 4:00 PM ET exactly (market close)", () => {
      const close = etDate(2026, 3, 30, 16, 0);
      expect(isMarketOpen(close).isOpen).toBe(false);
    });
  });

  describe("weekends", () => {
    it("returns isOpen: false on Saturday", () => {
      const sat = etDate(2026, 3, 28, 12, 0); // Sat Mar 28
      const result = isMarketOpen(sat);
      expect(result.isOpen).toBe(false);
      expect(result.isExtendedHours).toBe(false);
      expect(result.reason).toBe("weekend");
    });

    it("returns isOpen: false on Sunday", () => {
      const sun = etDate(2026, 3, 29, 12, 0); // Sun Mar 29
      const result = isMarketOpen(sun);
      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("weekend");
    });
  });

  describe("holidays", () => {
    it("returns isOpen: false on Christmas 2025", () => {
      // Dec 25 2025 is during EST (UTC-5)
      const xmas = etDate(2025, 12, 25, 12, 0, -5);
      const result = isMarketOpen(xmas);
      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("holiday");
    });

    it("returns isOpen: false on July 3 2026 (Independence Day observed)", () => {
      const july3 = etDate(2026, 7, 3, 12, 0);
      const result = isMarketOpen(july3);
      expect(result.isOpen).toBe(false);
      expect(result.reason).toBe("holiday");
    });
  });

  describe("extended hours", () => {
    it("returns isExtendedHours: true during pre-market (7:00 AM ET)", () => {
      const premarket = etDate(2026, 3, 30, 7, 0);
      const result = isMarketOpen(premarket);
      expect(result.isOpen).toBe(false);
      expect(result.isExtendedHours).toBe(true);
      expect(result.reason).toBe("extended_hours");
    });

    it("returns isExtendedHours: true during after-hours (5:00 PM ET)", () => {
      const afterhours = etDate(2026, 3, 30, 17, 0);
      const result = isMarketOpen(afterhours);
      expect(result.isOpen).toBe(false);
      expect(result.isExtendedHours).toBe(true);
      expect(result.reason).toBe("extended_hours");
    });

    it("returns isExtendedHours: false at 3:00 AM ET (before pre-market)", () => {
      const latenight = etDate(2026, 3, 30, 3, 0);
      const result = isMarketOpen(latenight);
      expect(result.isOpen).toBe(false);
      expect(result.isExtendedHours).toBe(false);
      expect(result.reason).toBe("outside_hours");
    });

    it("returns isExtendedHours: false at 9:00 PM ET (after extended hours)", () => {
      const nighttime = etDate(2026, 3, 30, 21, 0);
      const result = isMarketOpen(nighttime);
      expect(result.isOpen).toBe(false);
      expect(result.isExtendedHours).toBe(false);
      expect(result.reason).toBe("outside_hours");
    });
  });
});

describe("isWithinTradingWindow", () => {
  it("returns true during regular hours", () => {
    const regular = etDate(2026, 3, 30, 12, 0);
    expect(isWithinTradingWindow(regular)).toBe(true);
  });

  it("returns true during extended hours", () => {
    const extended = etDate(2026, 3, 30, 7, 0);
    expect(isWithinTradingWindow(extended)).toBe(true);
  });

  it("returns false on weekends", () => {
    const weekend = etDate(2026, 3, 28, 12, 0);
    expect(isWithinTradingWindow(weekend)).toBe(false);
  });

  it("returns false outside all windows", () => {
    const midnight = etDate(2026, 3, 30, 2, 0);
    expect(isWithinTradingWindow(midnight)).toBe(false);
  });
});

describe("getSameDayEntryPolicy", () => {
  it("allows same-day entries before the cutoff during regular hours", () => {
    const result = getSameDayEntryPolicy(etDate(2026, 3, 30, 10, 0));
    expect(result.allowed).toBe(true);
    expect(result.cutoffTimeEt).toBe("15:30");
  });

  it("blocks same-day entries after the cutoff", () => {
    const result = getSameDayEntryPolicy(etDate(2026, 3, 30, 15, 45));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/after 15:30 ET/);
  });

  it("blocks same-day entries during extended hours", () => {
    const result = getSameDayEntryPolicy(etDate(2026, 3, 30, 7, 0));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/outside regular market hours/i);
  });
});
