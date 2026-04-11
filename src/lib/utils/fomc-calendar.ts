import { getCachedCalendar } from "@/lib/services/live-economic-calendar";

export interface FOMCProximity {
  nextDate: string;
  daysToNext: number;
  isDecisionWeek: boolean;
}

// FOMC meeting dates for 2026 (publicly announced schedule)
// Source: Federal Reserve Board — these are the 2-day meeting end dates
const FOMC_DATES_2026 = [
  "2026-01-28",
  "2026-03-18",
  "2026-05-06",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-11-04",
  "2026-12-16",
];

export function getFOMCProximity(date: Date = new Date()): FOMCProximity {
  const now = date.getTime();

  // Prefer live cache (populated by refreshCalendarCache); fall back to hardcoded
  const liveFOMCDates = getCachedCalendar()
    .filter((e) => e.name === "FOMC Decision")
    .map((e) => e.date)
    .sort();
  const fomcDates = liveFOMCDates.length > 0 ? liveFOMCDates : FOMC_DATES_2026;

  for (const fomcStr of fomcDates) {
    const fomcDate = new Date(fomcStr);
    const diff = fomcDate.getTime() - now;
    const daysToNext = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (daysToNext >= -3) {
      // Include dates up to 3 days past (still in "decision week" window)
      return {
        nextDate: fomcStr,
        daysToNext: Math.max(daysToNext, 0),
        isDecisionWeek: Math.abs(daysToNext) <= 3,
      };
    }
  }

  // All dates passed — return last date of the year
  const last = fomcDates[fomcDates.length - 1];
  return { nextDate: last, daysToNext: 0, isDecisionWeek: false };
}
