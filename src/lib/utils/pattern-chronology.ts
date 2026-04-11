import type { ChartHistoryPeriod } from "@/lib/utils/chart-timeframes";
import type { TechnicalPattern } from "@/types/analysis";

export function parsePatternTimeValue(raw: string): number | null {
  const trimmed = raw.trim();
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return Date.UTC(Number(year), Number(month) - 1, Number(day), 12);
  }

  if (/^\d+$/.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return trimmed.length <= 10 ? numeric * 1000 : numeric;
    }
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

function hasClockTime(raw: string): boolean {
  const trimmed = raw.trim();
  return (
    /T\d{2}:\d{2}| \d{2}:\d{2}|:\d{2}/.test(trimmed) ||
    /^\d{10,}$/.test(trimmed)
  );
}

function formatCompactTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  const dayPeriod =
    parts
      .find((part) => part.type === "dayPeriod")
      ?.value?.toLowerCase()
      .replace(/\./g, "")
      .slice(0, 1) ?? "";
  return `${hour}:${minute}${dayPeriod}`;
}

function formatMonthDay(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatWeekday(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(date);
}

function formatMonthDayYear(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "2-digit",
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  return `${month} ${day} '${year}`;
}

export function formatPatternChronologyLabel(
  rawTime: string,
  timeframe: ChartHistoryPeriod,
): string | null {
  const parsed = parsePatternTimeValue(rawTime);
  if (parsed == null) return null;

  const date = new Date(parsed);
  if (Number.isNaN(date.getTime())) return null;

  switch (timeframe) {
    case "1d":
      return hasClockTime(rawTime)
        ? formatCompactTime(date)
        : formatMonthDay(date);
    case "1wk":
      return hasClockTime(rawTime)
        ? `${formatWeekday(date)} ${formatCompactTime(date)}`
        : `${formatWeekday(date)} ${formatMonthDay(date)}`;
    case "1mo":
    case "3mo":
    case "6mo":
      return formatMonthDay(date);
    case "1y":
      return formatMonthDayYear(date);
    default:
      return formatMonthDay(date);
  }
}

export function getPatternChronologyTime(
  pattern: TechnicalPattern,
): string | null {
  return pattern.end_time ?? pattern.start_time ?? null;
}

export function comparePatternChronology(
  left: TechnicalPattern,
  right: TechnicalPattern,
): number {
  const leftTime = getPatternChronologyTime(left);
  const rightTime = getPatternChronologyTime(right);
  const leftEpoch = leftTime ? parsePatternTimeValue(leftTime) : null;
  const rightEpoch = rightTime ? parsePatternTimeValue(rightTime) : null;

  if (leftEpoch == null && rightEpoch == null) return 0;
  if (leftEpoch == null) return 1;
  if (rightEpoch == null) return -1;
  return leftEpoch - rightEpoch;
}
