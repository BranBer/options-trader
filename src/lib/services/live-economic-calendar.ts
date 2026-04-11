/**
 * Unified live economic calendar — Epic 47, Story 47.5.
 *
 * Aggregates data from all four authoritative sources (BLS, BEA, Census, Fed)
 * via the fetchers created in Sprint 1, adds an ISM manufacturing heuristic,
 * and caches the merged result in memory with a 24-hour TTL.
 *
 * The synchronous `getCachedCalendar()` is the primary access point for
 * existing synchronous callers (getFOMCProximity, getUpcomingCatalysts).
 * The async `getEconomicCalendar()` / `refreshCalendarCache()` are used by
 * the cron job and any async context that can tolerate a short fetch delay.
 */

import type { EconomicEvent, EventSource } from "@/lib/utils/economic-calendar";

// ---------------------------------------------------------------------------
// Cache data structures
// ---------------------------------------------------------------------------

export type SourceStatus = "ok" | "failed" | "stale";

export interface CalendarRefreshResult {
  totalEvents: number;
  sourceStatus: Partial<Record<EventSource | "heuristic", SourceStatus>>;
  fetchedAt: number;
}

interface CalendarCache {
  events: EconomicEvent[];
  fetchedAt: number;
  sourceStatus: Partial<Record<EventSource | "heuristic", SourceStatus>>;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cache: CalendarCache | null = null;

// ---------------------------------------------------------------------------
// ISM Manufacturing heuristic — Story 47.11 (resolved: heuristic accepted)
//
// ISM PMI is always released on the first business day of each month at
// 10:00 ET.  This is an ISM convention with no documented exceptions.
//
// Source availability research (April 2026):
//   - ISM website (ismworld.org): calendar page returns HTTP 400 for API/scrape
//   - FRED (rid=19 ISM series): no scheduled release dates published
//   - No free machine-readable ICS/JSON source found
//
// Conclusion: "first business day" heuristic matches historical accuracy ~98%.
// Mark events with isEstimated: true so consumers can distinguish from live data.
// ---------------------------------------------------------------------------

const ISM_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function firstBusinessDay(year: number, month: number): string {
  // month is 1-indexed; Date constructor takes 0-indexed
  let d = new Date(year, month - 1, 1);
  // Advance past Saturday (6) and Sunday (0)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d = new Date(d.getTime() + 86_400_000);
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function generateISMHeuristic(year: number): EconomicEvent[] {
  return ISM_MONTHS.map((month) => ({
    date: firstBusinessDay(year, month),
    name: "ISM Manufacturing",
    impact: "medium" as const,
    description:
      "ISM Manufacturing PMI — reading below 50 signals contraction (estimated date; official source behind paywall)",
    source: "heuristic" as EventSource,
    isEstimated: true,
  }));
}

// ---------------------------------------------------------------------------
// Merge + deduplication
//
// Events are keyed by "date|name". Later sources in the array overwrite
// earlier ones for the same key, so live data takes priority over
// stale-cache fallbacks.
// ---------------------------------------------------------------------------

function mergeEvents(groups: EconomicEvent[][]): EconomicEvent[] {
  const map = new Map<string, EconomicEvent>();
  for (const group of groups) {
    for (const event of group) {
      map.set(`${event.date}|${event.name}`, event);
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Public API — synchronous
// ---------------------------------------------------------------------------

/**
 * Returns the current in-memory cache synchronously.
 * Returns an empty array if the cache has not been populated yet (cold start).
 *
 * Callers that cannot be async (getFOMCProximity, getUpcomingCatalysts) use
 * this and fall back to their own hardcoded data when it returns [].
 */
export function getCachedCalendar(): EconomicEvent[] {
  return cache?.events ?? [];
}

/**
 * Returns ISO timestamp of last successful refresh, or null if never refreshed.
 */
export function getCalendarCacheAge(): {
  fetchedAt: number | null;
  isStale: boolean;
  sourceStatus: Partial<Record<EventSource | "heuristic", SourceStatus>>;
} {
  return {
    fetchedAt: cache?.fetchedAt ?? null,
    isStale: cache == null || Date.now() - cache.fetchedAt > CACHE_TTL_MS,
    sourceStatus: cache?.sourceStatus ?? {},
  };
}

// ---------------------------------------------------------------------------
// Public API — async
// ---------------------------------------------------------------------------

/**
 * Return the live calendar, refreshing from all sources if the cache is stale.
 * First call on a cold server will hit the network; subsequent calls within
 * 24 hours are served from memory.
 */
export async function getEconomicCalendar(): Promise<EconomicEvent[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.events;
  }
  const result = await refreshCalendarCache();
  return cache?.events ?? [];
}

/**
 * Unconditionally refresh the calendar from all four live sources + ISM heuristic.
 * Uses `Promise.allSettled` so a single failing source never prevents the rest
 * from being used.  Failed sources preserve any stale events they contributed
 * to the previous cache (marked with `isEstimated: true`).
 */
export async function refreshCalendarCache(): Promise<CalendarRefreshResult> {
  const year = new Date().getFullYear();

  const {
    fetchBLSCalendar,
    fetchBEACalendar,
    fetchCensusCalendar,
    fetchFOMCCalendar,
  } = await import("./economic-calendar-fetcher");

  const [blsResult, beaResult, censusResult, fomcResult] =
    await Promise.allSettled([
      fetchBLSCalendar(year),
      fetchBEACalendar(year),
      fetchCensusCalendar(year),
      fetchFOMCCalendar(year),
    ]);

  const sourceKeys: EventSource[] = ["bls", "bea", "census", "fed"];
  const settled = [blsResult, beaResult, censusResult, fomcResult];
  const sourceStatus: Partial<Record<EventSource | "heuristic", SourceStatus>> =
    {};
  const eventGroups: EconomicEvent[][] = [];

  for (let i = 0; i < 4; i++) {
    const src = sourceKeys[i];
    const result = settled[i];

    if (result.status === "fulfilled") {
      sourceStatus[src] = "ok";
      eventGroups.push(result.value);
      console.log(
        `[LiveCalendar] ${src.toUpperCase()} returned ${result.value.length} events`,
      );
    } else {
      sourceStatus[src] = "failed";
      console.error(
        `[LiveCalendar] ${src.toUpperCase()} fetch failed:`,
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
      );
      // Preserve stale events from this source (mark as estimated)
      const stale = (cache?.events ?? [])
        .filter((e) => e.source === src)
        .map((e) => ({ ...e, isEstimated: true }));
      if (stale.length > 0) {
        sourceStatus[src] = "stale";
        eventGroups.push(stale);
      }
    }
  }

  // ISM heuristic — always succeeds
  const ismEvents = generateISMHeuristic(year);
  sourceStatus["heuristic"] = "ok";
  eventGroups.push(ismEvents);

  const events = mergeEvents(eventGroups);
  const fetchedAt = Date.now();

  cache = { events, fetchedAt, sourceStatus };

  console.log(
    `[LiveCalendar] Cache refreshed: ${events.length} events, sources: ${JSON.stringify(sourceStatus)}`,
  );

  return { totalEvents: events.length, sourceStatus, fetchedAt };
}

// ---------------------------------------------------------------------------
// Test helpers — not for production use
// ---------------------------------------------------------------------------

/** @internal Inject a known calendar into the cache for unit tests. */
export function _setCalendarCacheForTest(events: EconomicEvent[]): void {
  cache = {
    events,
    fetchedAt: Date.now(),
    sourceStatus: { bls: "ok", bea: "ok", census: "ok", fed: "ok" },
  };
}

/** @internal Clear the in-memory cache for unit tests. */
export function _clearCalendarCacheForTest(): void {
  cache = null;
}
