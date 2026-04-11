/**
 * Economic calendar data fetchers — Epic 47, Sprint 1.
 *
 * Story 47.1: BLS ICS calendar  → CPI, PPI, NFP, JOLTS
 * Story 47.2: BEA JSON API      → GDP, Core PCE
 * Story 47.3: Census Bureau HTML → Retail Sales, Housing Starts, Durable Goods
 * Story 47.4: Federal Reserve HTML → FOMC decision dates
 *
 * Each exported `fetch*` function hits the live source.
 * Each exported `parse*` function accepts raw content for testability without network.
 * See live-economic-calendar.ts (47.5) for the unified cached service.
 */

import ical from "node-ical";
import * as cheerio from "cheerio";
import type { EconomicEvent, EventImpact } from "@/lib/utils/economic-calendar";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date as YYYY-MM-DD using local-time components.
 * node-ical creates DATE-type events as local-midnight Dates, so local
 * methods are correct here regardless of server timezone.
 */
function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Extract plain string from a node-ical ParameterValue.
 * Can be either a bare string or { val, params }.
 */
function paramStr(val: ical.ParameterValue | undefined): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  return val.val ?? "";
}

const MONTH_NAMES: Readonly<Record<string, number>> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

// ---------------------------------------------------------------------------
// 47.1 — BLS ICS Calendar (CPI, PPI, NFP, JOLTS, …)
// ---------------------------------------------------------------------------

/** BLS ICS SUMMARY text → our event classification */
const BLS_EVENT_MAP: Readonly<
  Record<string, { name: string; impact: EventImpact; description: string }>
> = {
  "Consumer Price Index": {
    name: "CPI",
    impact: "high",
    description:
      "Consumer Price Index — key inflation gauge; higher-than-expected = hawkish Fed, risk-off",
  },
  "Producer Price Index": {
    name: "PPI",
    impact: "medium",
    description: "Producer Price Index — upstream inflation; leads CPI trends",
  },
  "Employment Situation": {
    name: "Non-Farm Payrolls",
    impact: "high",
    description:
      "Jobs report — strong = hawkish Fed, weak = dovish; moves rates and equities",
  },
  "Job Openings and Labor Turnover Survey": {
    name: "JOLTS",
    impact: "medium",
    description:
      "Job openings and quit rate — signals labor market tightness, leads employment trends",
  },
  "Real Earnings": {
    name: "Real Earnings",
    impact: "low",
    description:
      "Inflation-adjusted wage growth — published alongside CPI, secondary signal",
  },
  "Employment Cost Index": {
    name: "Employment Cost Index",
    impact: "medium",
    description:
      "Wage and benefit cost growth — leads CPI components, closely watched by Fed",
  },
};

/**
 * Fetch the BLS ICS calendar from bls.gov and parse it.
 * Returns events for `year` whose SUMMARY matches our tracked indicators.
 */
export async function fetchBLSCalendar(
  year: number = new Date().getFullYear(),
): Promise<EconomicEvent[]> {
  const res = await fetch("https://www.bls.gov/schedule/news_release/bls.ics");
  if (!res.ok) throw new Error(`BLS ICS fetch failed: HTTP ${res.status}`);
  return parseBLSICS(await res.text(), year);
}

/**
 * Parse a BLS ICS text body into EconomicEvent[].
 * Exposed for testing without network access.
 */
export function parseBLSICS(icsText: string, year: number): EconomicEvent[] {
  const cal = ical.sync.parseICS(icsText);
  const events: EconomicEvent[] = [];

  for (const component of Object.values(cal)) {
    if (!component || component.type !== "VEVENT") continue;
    const event = component as ical.VEvent;
    if (!event.start) continue;

    const dateStr = toDateString(new Date(event.start));
    if (!dateStr.startsWith(String(year))) continue;

    const summary = paramStr(event.summary).trim();

    // Try exact match first, then prefix match for BLS naming variations
    let mapped = BLS_EVENT_MAP[summary];
    if (!mapped) {
      for (const [key, val] of Object.entries(BLS_EVENT_MAP)) {
        if (summary.startsWith(key)) {
          mapped = val;
          break;
        }
      }
    }
    if (!mapped) continue;

    events.push({
      date: dateStr,
      name: mapped.name,
      impact: mapped.impact,
      description: mapped.description,
      source: "bls",
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// 47.2 — BEA JSON API (GDP, Core PCE)
// ---------------------------------------------------------------------------

interface BEAReleaseSchedule {
  [releaseName: string]:
    | {
        release_dates: string[];
        to_be_rescheduled?: string[];
      }
    | undefined;
}

/**
 * Fetch the BEA release schedule JSON (no auth required).
 * Returns GDP and Core PCE events for `year`.
 */
export async function fetchBEACalendar(
  year: number = new Date().getFullYear(),
): Promise<EconomicEvent[]> {
  const res = await fetch("https://apps.bea.gov/API/signup/release_dates.json");
  if (!res.ok) throw new Error(`BEA JSON fetch failed: HTTP ${res.status}`);
  return parseBEAJson((await res.json()) as BEAReleaseSchedule, year);
}

/**
 * Classify a GDP release name based on the release month and day.
 *
 * BEA releases 3 estimates per quarter (Advance → Second → Third).
 * Advance estimates land late in the month following quarter close:
 *   Q1 Advance ≈ late April, Q2 ≈ late July, Q3 ≈ late October.
 * Earlier releases (Jan–Mar) are prior-year Q revisions.
 */
function gdpLabel(month: number, day: number): string {
  if (month <= 3) return "GDP (Q3 Final)"; // prior-year trailing estimates
  if (month === 4 && day < 20) return "GDP (Q4 Final)";
  if (month === 4 && day >= 20) return "GDP (Q1 Advance)";
  if (month === 5 || month === 6) return "GDP (Q1 Revision)";
  if (month === 7 && day < 20) return "GDP (Q1 Final)";
  if (month === 7 && day >= 20) return "GDP (Q2 Advance)";
  if (month === 8 || month === 9) return "GDP (Q2 Revision)";
  if (month === 10 && day < 20) return "GDP (Q2 Final)";
  if (month === 10 && day >= 20) return "GDP (Q3 Advance)";
  if (month === 11 || month === 12) return "GDP (Q3 Revision)";
  return "GDP";
}

function gdpImpact(month: number, day: number): EventImpact {
  // Advance estimates (first reading for each quarter) are the most market-moving
  const isAdvance =
    (month === 4 && day >= 20) ||
    (month === 7 && day >= 20) ||
    (month === 10 && day >= 20);
  return isAdvance ? "medium" : "low";
}

/**
 * Parse a BEA release schedule JSON into EconomicEvent[].
 * Exposed for testing without network access.
 */
export function parseBEAJson(
  json: BEAReleaseSchedule,
  year: number,
): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  const yearStr = String(year);

  // Build a flat set of rescheduled ISO timestamps for quick lookup
  const rescheduled = new Set<string>();
  for (const entry of Object.values(json)) {
    for (const d of entry?.to_be_rescheduled ?? []) {
      rescheduled.add(d);
    }
  }

  // ── GDP ──────────────────────────────────────────────────────────────────
  for (const isoDate of json["Gross Domestic Product"]?.release_dates ?? []) {
    const dateStr = isoDate.slice(0, 10);
    if (!dateStr.startsWith(yearStr)) continue;
    const month = parseInt(dateStr.slice(5, 7));
    const day = parseInt(dateStr.slice(8, 10));
    events.push({
      date: dateStr,
      name: gdpLabel(month, day),
      impact: gdpImpact(month, day),
      description: "Quarterly GDP growth — broad economic health indicator",
      source: "bea",
      isEstimated: rescheduled.has(isoDate),
    });
  }

  // ── Core PCE (inside "Personal Income and Outlays" release) ──────────────
  for (const isoDate of json["Personal Income and Outlays"]?.release_dates ??
    []) {
    const dateStr = isoDate.slice(0, 10);
    if (!dateStr.startsWith(yearStr)) continue;
    events.push({
      date: dateStr,
      name: "Core PCE",
      impact: "high",
      description:
        "Fed's preferred inflation measure — directly influences rate decisions",
      source: "bea",
      isEstimated: rescheduled.has(isoDate),
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// 47.3 — Census Bureau HTML (Retail Sales, Housing Starts, Durable Goods)
// ---------------------------------------------------------------------------

/** Census indicator prefix → our event classification */
const CENSUS_EVENT_MAP: Readonly<
  Record<string, { name: string; impact: EventImpact; description: string }>
> = {
  "Advance Monthly Sales for Retail and Food Services": {
    name: "Retail Sales",
    impact: "medium",
    description:
      "Consumer spending on goods — 70% of GDP; strong = bullish consumer sector",
  },
  "New Residential Construction": {
    name: "Housing Starts",
    impact: "low",
    description:
      "Housing construction activity — leading indicator for construction sector and rates sensitivity",
  },
  "Advance Report on Durable Goods": {
    name: "Durable Goods",
    impact: "low",
    description:
      "Business investment signal — non-defense ex-aircraft tracks capital spending trends",
  },
};

/**
 * Fetch and parse the Census Bureau economic indicator schedule HTML.
 * Returns Retail Sales (and optionally Housing Starts, Durable Goods) for `year`.
 */
export async function fetchCensusCalendar(
  year: number = new Date().getFullYear(),
): Promise<EconomicEvent[]> {
  const res = await fetch(
    "https://www.census.gov/economic-indicators/calendar-listview.html",
  );
  if (!res.ok)
    throw new Error(`Census calendar fetch failed: HTTP ${res.status}`);
  return parseCensusHTML(await res.text(), year);
}

/** Parse "January 14, 2026" → "2026-01-14", or null if unparseable. */
function parseCensusDate(text: string): string | null {
  const m = text.trim().match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTH_NAMES[m[1].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/**
 * Parse the Census Bureau indicator schedule HTML into EconomicEvent[].
 * Exposed for testing without network access.
 */
export function parseCensusHTML(html: string, year: number): EconomicEvent[] {
  const $ = cheerio.load(html);
  const events: EconomicEvent[] = [];
  const yearStr = String(year);

  $("table tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const indicator = $(cells[0]).text().trim();
    const dateText = $(cells[1]).text().trim();
    const periodText =
      cells.length >= 4 ? $(cells[3]).text().trim() : undefined;

    if (dateText === "Suspended") return;

    const dateStr = parseCensusDate(dateText);
    if (!dateStr || !dateStr.startsWith(yearStr)) return;

    for (const [prefix, mapped] of Object.entries(CENSUS_EVENT_MAP)) {
      if (indicator.startsWith(prefix)) {
        events.push({
          date: dateStr,
          name: mapped.name,
          impact: mapped.impact,
          description: mapped.description,
          source: "census",
          periodCovered: periodText,
        });
        break;
      }
    }
  });

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// 47.4 — Federal Reserve FOMC Calendar
// ---------------------------------------------------------------------------

/**
 * Matches FOMC meeting date ranges in Fed page text.
 * Captures: (MonthName) (startDay)-(endDay)(*?)
 * The end day is the announcement date (decision always on last day of meeting).
 */
const FOMC_DATE_PATTERN =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})-(\d{1,2})(\*?)/g;

/**
 * Fetch and parse the Federal Reserve FOMC meeting calendar.
 * Returns FOMC decision dates for `year`.
 */
export async function fetchFOMCCalendar(
  year: number = new Date().getFullYear(),
): Promise<EconomicEvent[]> {
  const res = await fetch(
    "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  );
  if (!res.ok)
    throw new Error(`Fed FOMC calendar fetch failed: HTTP ${res.status}`);
  return parseFOMCHTML(await res.text(), year);
}

/**
 * Extract the text content of a given year's FOMC section.
 * Slices from "YYYY FOMC Meetings" up to the next year section (or 4 000 chars).
 */
function extractFOMCYearSection(pageText: string, year: number): string | null {
  const marker = `${year} FOMC Meetings`;
  const start = pageText.indexOf(marker);
  if (start === -1) return null;

  // Find the nearest following boundary: any other year's section
  const candidates: number[] = [];
  for (const offset of [-1, 1, 2]) {
    const idx = pageText.indexOf(
      `${year + offset} FOMC Meetings`,
      start + marker.length,
    );
    if (idx !== -1) candidates.push(idx);
  }

  const end = candidates.length > 0 ? Math.min(...candidates) : start + 4_000;

  return pageText.slice(start, end);
}

/**
 * Parse the Federal Reserve FOMC calendar HTML into EconomicEvent[].
 * Exposed for testing without network access.
 */
export function parseFOMCHTML(html: string, year: number): EconomicEvent[] {
  // Strip tags to get clean text; collapse whitespace
  const $ = cheerio.load(html);
  const pageText = $("body").text().replace(/\s+/g, " ");

  const section = extractFOMCYearSection(pageText, year);
  if (!section) return [];

  const events: EconomicEvent[] = [];
  FOMC_DATE_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = FOMC_DATE_PATTERN.exec(section)) !== null) {
    const monthNum = MONTH_NAMES[match[1].toLowerCase()];
    if (!monthNum) continue;

    // match[3] is the end day (announcement day); match[4] is "*" for SEP meetings
    const endDay = match[3].padStart(2, "0");
    const isSEP = match[4] === "*";

    const dateStr = `${year}-${String(monthNum).padStart(2, "0")}-${endDay}`;

    events.push({
      date: dateStr,
      name: "FOMC Decision",
      impact: "high",
      description: isSEP
        ? "Fed rate decision + updated dot plot and economic projections (SEP meeting)"
        : "Federal Reserve rate decision + statement — most market-moving event",
      source: "fed",
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}
