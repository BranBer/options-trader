/**
 * Market hours guard — determines whether US equity markets are open.
 * NYSE regular session: 9:30 AM – 4:00 PM ET, Monday–Friday.
 */

// US market holidays for 2025–2026 (NYSE observed)
const MARKET_HOLIDAYS: string[] = [
  // 2025
  "2025-01-01", // New Year's Day
  "2025-01-20", // MLK Jr. Day
  "2025-02-17", // Presidents' Day
  "2025-04-18", // Good Friday
  "2025-05-26", // Memorial Day
  "2025-06-19", // Juneteenth
  "2025-07-04", // Independence Day
  "2025-09-01", // Labor Day
  "2025-11-27", // Thanksgiving
  "2025-12-25", // Christmas
  // 2026
  "2026-01-01", // New Year's Day
  "2026-01-19", // MLK Jr. Day
  "2026-02-16", // Presidents' Day
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
];

const HOLIDAY_SET = new Set(MARKET_HOLIDAYS);

export interface MarketHoursInfo {
  isOpen: boolean;
  isExtendedHours: boolean;
  reason: string;
}

export interface SameDayEntryPolicy {
  allowed: boolean;
  reason: string;
  cutoffTimeEt: string;
}

/**
 * Get current time in US Eastern timezone.
 */
function getETNow(now: Date = new Date()): {
  hour: number;
  minute: number;
  dayOfWeek: number;
  dateStr: string;
} {
  const et = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const parts = Object.fromEntries(et.map((p) => [p.type, p.value]));
  const hour = parseInt(parts.hour, 10);
  const minute = parseInt(parts.minute, 10);
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = dayMap[parts.weekday] ?? 0;
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;

  return { hour, minute, dayOfWeek, dateStr };
}

function getSameDayCutoff(): { hour: number; minute: number; label: string } {
  const rawCutoff = process.env.SIM_0DTE_ENTRY_CUTOFF_ET ?? "15:30";
  const match = rawCutoff.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return { hour: 15, minute: 30, label: "15:30" };
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return { hour: 15, minute: 30, label: "15:30" };
  }

  return {
    hour,
    minute,
    label: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
  };
}

/**
 * Check if US equity markets are currently in the regular trading session.
 * Regular hours: Mon–Fri, 9:30 AM – 4:00 PM ET, excluding holidays.
 */
export function isMarketOpen(now?: Date): MarketHoursInfo {
  const { hour, minute, dayOfWeek, dateStr } = getETNow(now);

  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { isOpen: false, isExtendedHours: false, reason: "weekend" };
  }

  // Holiday
  if (HOLIDAY_SET.has(dateStr)) {
    return { isOpen: false, isExtendedHours: false, reason: "holiday" };
  }

  const timeMinutes = hour * 60 + minute;
  const marketOpen = 9 * 60 + 30; // 9:30 AM ET
  const marketClose = 16 * 60; // 4:00 PM ET
  const preMarketOpen = 4 * 60; // 4:00 AM ET
  const afterMarketClose = 20 * 60; // 8:00 PM ET

  // Regular hours
  if (timeMinutes >= marketOpen && timeMinutes < marketClose) {
    return { isOpen: true, isExtendedHours: false, reason: "regular_hours" };
  }

  // Pre-market or after-hours
  if (
    (timeMinutes >= preMarketOpen && timeMinutes < marketOpen) ||
    (timeMinutes >= marketClose && timeMinutes < afterMarketClose)
  ) {
    return { isOpen: false, isExtendedHours: true, reason: "extended_hours" };
  }

  return { isOpen: false, isExtendedHours: false, reason: "outside_hours" };
}

/**
 * Check if we're within market hours or extended hours (any time options might move).
 */
export function isWithinTradingWindow(now?: Date): boolean {
  const info = isMarketOpen(now);
  return info.isOpen || info.isExtendedHours;
}

export function getSameDayEntryPolicy(now?: Date): SameDayEntryPolicy {
  const market = isMarketOpen(now);
  const { hour, minute } = getETNow(now);
  const cutoff = getSameDayCutoff();
  const currentMinutes = hour * 60 + minute;
  const cutoffMinutes = cutoff.hour * 60 + cutoff.minute;

  if (!market.isOpen) {
    return {
      allowed: false,
      reason: market.isExtendedHours
        ? "Same-day expiry entries are blocked outside regular market hours"
        : "Same-day expiry entries are blocked when the market is closed",
      cutoffTimeEt: cutoff.label,
    };
  }

  if (currentMinutes >= cutoffMinutes) {
    return {
      allowed: false,
      reason: `Same-day expiry entries are blocked after ${cutoff.label} ET`,
      cutoffTimeEt: cutoff.label,
    };
  }

  return {
    allowed: true,
    reason: `Same-day expiry entries allowed before ${cutoff.label} ET during regular hours`,
    cutoffTimeEt: cutoff.label,
  };
}
