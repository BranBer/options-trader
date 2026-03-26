import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { marketSnapshots } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const ticker = params.get("ticker");
  const limit = Math.min(Number(params.get("limit")) || 20, 100);

  let query = db.select().from(marketSnapshots);
  if (ticker) {
    query = query.where(eq(marketSnapshots.ticker, ticker.toUpperCase())) as typeof query;
  }

  const snapshots = await query
    .orderBy(desc(marketSnapshots.capturedAt))
    .limit(limit);

  return NextResponse.json({ snapshots });
}
