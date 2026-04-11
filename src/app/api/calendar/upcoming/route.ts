import { NextResponse, type NextRequest } from "next/server";
import { getUpcomingCatalysts } from "@/lib/utils/economic-calendar";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/upcoming?days=14
 *
 * Returns a CatalystSummary for the requested look-ahead window.
 * Calls getUpcomingCatalysts() server-side so the live cache is used
 * rather than the hardcoded ECONOMIC_EVENTS_2026 fallback.
 *
 * Used by the client-side PDF export pipeline (report-data-aggregator runs
 * in the browser and cannot access the server-side in-memory cache directly).
 */
export async function GET(req: NextRequest) {
  const days = parseInt(req.nextUrl.searchParams.get("days") ?? "14", 10);
  const window = Number.isFinite(days) && days > 0 && days <= 365 ? days : 14;

  const catalysts = getUpcomingCatalysts(window);
  return NextResponse.json(catalysts);
}
