import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { newsEvents } from "@/lib/db/schema";
import { desc, gte, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const minImpact = parseInt(searchParams.get("minImpact") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const events = await db
    .select()
    .from(newsEvents)
    .where(
      sql`${newsEvents.impactScore} >= ${minImpact} AND ${newsEvents.createdAt} >= ${oneDayAgo}`
    )
    .orderBy(desc(newsEvents.createdAt))
    .limit(limit);

  return NextResponse.json({ events, count: events.length });
}
