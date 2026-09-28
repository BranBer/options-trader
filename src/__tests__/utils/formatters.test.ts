import { describe, it, expect } from "vitest";
import {
  formatPremium,
  formatCurrency,
  formatNumber,
  timeAgo,
  confidenceLabel,
  parseDbTime,
} from "@/lib/utils/formatters";
import { getFOMCProximity } from "@/lib/utils/fomc-calendar";

describe("formatPremium", () => {
  it("formats millions", () => {
    expect(formatPremium(2_500_000)).toBe("$2.5M");
  });

  it("formats thousands", () => {
    expect(formatPremium(42_000)).toBe("$42K");
  });

  it("formats small values with decimals", () => {
    expect(formatPremium(99.5)).toBe("$99.50");
  });

  it("formats zero", () => {
    expect(formatPremium(0)).toBe("$0.00");
  });

  it("formats exactly 1M", () => {
    expect(formatPremium(1_000_000)).toBe("$1.0M");
  });

  it("formats exactly 1K", () => {
    expect(formatPremium(1_000)).toBe("$1K");
  });
});

describe("formatCurrency", () => {
  it("formats positive values", () => {
    expect(formatCurrency(1234.56)).toBe("$1,234.56");
  });

  it("formats negative values", () => {
    const result = formatCurrency(-500);
    expect(result).toContain("500");
    expect(result).toContain("$");
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });
});

describe("formatNumber", () => {
  it("formats millions", () => {
    expect(formatNumber(1_500_000)).toBe("1.5M");
  });

  it("formats thousands", () => {
    expect(formatNumber(25_000)).toBe("25K");
  });

  it("formats small numbers with locale string", () => {
    const result = formatNumber(999);
    expect(result).toBe("999");
  });
});

describe("timeAgo", () => {
  it('returns "just now" for recent timestamps', () => {
    const now = new Date().toISOString();
    expect(timeAgo(now)).toBe("just now");
  });

  it("returns minutes ago", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(timeAgo(fiveMinAgo)).toBe("5m ago");
  });

  it("returns hours ago", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    expect(timeAgo(twoHoursAgo)).toBe("2h ago");
  });

  it("returns days ago", () => {
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60_000,
    ).toISOString();
    expect(timeAgo(threeDaysAgo)).toBe("3d ago");
  });
});

describe("parseDbTime", () => {
  it("reads SQLite CURRENT_TIMESTAMP values as UTC", () => {
    expect(parseDbTime("2026-09-27 04:53:20").toISOString()).toBe(
      "2026-09-27T04:53:20.000Z",
    );
  });

  it("leaves ISO strings with a zone untouched", () => {
    expect(parseDbTime("2026-09-27T04:53:20-04:00").toISOString()).toBe(
      "2026-09-27T08:53:20.000Z",
    );
  });

  it("makes timeAgo agree for DB and ISO forms of the same instant", () => {
    const iso = new Date(Date.now() - 3 * 60 * 60_000).toISOString();
    const db = iso.slice(0, 19).replace("T", " ");
    expect(timeAgo(db)).toBe(timeAgo(iso));
  });
});

describe("confidenceLabel", () => {
  it('returns "Very High" for >= 0.8', () => {
    expect(confidenceLabel(0.85)).toBe("Very High");
    expect(confidenceLabel(0.8)).toBe("Very High");
  });

  it('returns "High" for >= 0.6', () => {
    expect(confidenceLabel(0.65)).toBe("High");
  });

  it('returns "Moderate" for >= 0.4', () => {
    expect(confidenceLabel(0.45)).toBe("Moderate");
  });

  it('returns "Low" for >= 0.2', () => {
    expect(confidenceLabel(0.25)).toBe("Low");
  });

  it('returns "Very Low" for < 0.2', () => {
    expect(confidenceLabel(0.1)).toBe("Very Low");
    expect(confidenceLabel(0)).toBe("Very Low");
  });
});

describe("getFOMCProximity", () => {
  it("returns correct upcoming date in early 2026", () => {
    const result = getFOMCProximity(new Date("2026-01-10"));
    expect(result.nextDate).toBe("2026-01-28");
    expect(result.daysToNext).toBeGreaterThan(0);
    expect(result.isDecisionWeek).toBe(false);
  });

  it("returns isDecisionWeek: true within 3 days of meeting", () => {
    const result = getFOMCProximity(new Date("2026-01-27")); // 1 day before
    expect(result.isDecisionWeek).toBe(true);
    expect(result.nextDate).toBe("2026-01-28");
  });

  it("returns isDecisionWeek: true on meeting day", () => {
    const result = getFOMCProximity(new Date("2026-01-28"));
    expect(result.isDecisionWeek).toBe(true);
    expect(result.daysToNext).toBe(0);
  });

  it("returns isDecisionWeek: true up to 3 days after meeting", () => {
    const result = getFOMCProximity(new Date("2026-01-30")); // 2 days after
    expect(result.isDecisionWeek).toBe(true);
  });

  it("finds the next meeting after one passes", () => {
    const result = getFOMCProximity(new Date("2026-02-15")); // After Jan, before Mar
    expect(result.nextDate).toBe("2026-03-18");
    expect(result.daysToNext).toBeGreaterThan(0);
  });

  it("returns last date when all meetings have passed", () => {
    const result = getFOMCProximity(new Date("2026-12-25"));
    expect(result.nextDate).toBe("2026-12-16");
  });
});
