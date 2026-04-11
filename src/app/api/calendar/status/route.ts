import { NextResponse } from "next/server";
import {
  getCalendarCacheAge,
  getCachedCalendar,
} from "@/lib/services/live-economic-calendar";
import { getRecentReleaseSummary } from "@/lib/services/post-release-analyzer";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/status
 *
 * Returns the current state of the live economic calendar cache so operators
 * can confirm that the four authoritative sources (BLS, BEA, Census, Fed) are
 * being fetched successfully.
 *
 * Response shape:
 * {
 *   totalEvents:      number          — merged event count in memory
 *   fetchedAt:        string | null   — ISO timestamp of last successful refresh
 *   isStale:          boolean         — true when cache age > 24 h or never loaded
 *   sourceStatus:     { bls, bea, census, fed, heuristic } — "ok" | "failed" | "stale"
 *   nextEvents:       EconomicEvent[] — next 5 upcoming events from today
 *   recentReleases:   PostReleaseEvent[] — high-impact events in last 72 h
 * }
 */
export async function GET() {
  const { fetchedAt, isStale, sourceStatus } = getCalendarCacheAge();
  const events = getCachedCalendar();

  const today = new Date().toISOString().slice(0, 10);
  const nextEvents = events.filter((e) => e.date >= today).slice(0, 5);

  const { recentReleases, generatedAt } = getRecentReleaseSummary();

  return NextResponse.json({
    totalEvents: events.length,
    fetchedAt: fetchedAt ? new Date(fetchedAt).toISOString() : null,
    isStale,
    sourceStatus,
    nextEvents,
    recentReleases,
    generatedAt,
  });
}
