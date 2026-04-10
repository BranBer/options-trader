import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { newsEvents } from "@/lib/db/schema";
import { and, desc, eq, gte } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const minImpact = parseInt(searchParams.get("minImpact") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);
  const category = searchParams.get("category") ?? "general";

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const filters = [
    gte(newsEvents.impactScore, minImpact),
    gte(newsEvents.createdAt, oneDayAgo),
  ];

  if (category !== "all") {
    filters.push(eq(newsEvents.category, category));
  }

  const events = await db
    .select()
    .from(newsEvents)
    .where(and(...filters))
    .orderBy(desc(newsEvents.createdAt))
    .limit(limit);

  return NextResponse.json({ events, count: events.length });
}
