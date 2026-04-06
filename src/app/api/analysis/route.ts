import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { analyses } from "@/lib/db/schema";
import { desc, eq, and, like, lt } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const type = params.get("type"); // 'cross_reference' | 'trade_recommendation' | 'deep_dive' | 'event_ticker_analysis'
  const ticker = params.get("ticker");
  const cursor = params.get("cursor"); // id of the last item from previous page
  const limit = Math.min(Number(params.get("limit")) || 20, 100);

  const validTypes = [
    "cross_reference",
    "trade_recommendation",
    "deep_dive",
    "event_ticker_analysis",
  ];
  const conditions = [];

  if (type && validTypes.includes(type)) {
    conditions.push(eq(analyses.type, type));
  }

  // Filter by ticker at DB level via JSON substring match on input_refs
  if (ticker) {
    conditions.push(
      like(analyses.inputRefs, `%"ticker":"${ticker.toUpperCase()}"%`),
    );
  }

  // Cursor-based pagination: fetch items with id < cursor
  if (cursor) {
    const cursorId = Number(cursor);
    if (!Number.isNaN(cursorId)) {
      conditions.push(lt(analyses.id, cursorId));
    }
  }

  let query = db.select().from(analyses);
  if (conditions.length > 0) {
    query = query.where(
      conditions.length === 1 ? conditions[0] : and(...conditions),
    ) as typeof query;
  }

  // Fetch one extra to determine if there are more items
  const results = await query.orderBy(desc(analyses.id)).limit(limit + 1);

  const hasMore = results.length > limit;
  const page = hasMore ? results.slice(0, limit) : results;

  const parsed = page.map((a) => ({
    ...a,
    output: a.output ? JSON.parse(a.output) : null,
    inputRefs: a.inputRefs ? JSON.parse(a.inputRefs) : null,
    confidenceBreakdown: a.confidenceBreakdown
      ? JSON.parse(a.confidenceBreakdown)
      : null,
  }));

  return NextResponse.json({
    analyses: parsed,
    nextCursor: hasMore ? page[page.length - 1].id : null,
    hasMore,
  });
}
