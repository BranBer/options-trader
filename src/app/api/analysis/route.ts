import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { analyses } from "@/lib/db/schema";
import { desc, eq, and, like } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const type = params.get("type"); // 'cross_reference' | 'trade_recommendation' | 'deep_dive'
  const ticker = params.get("ticker");
  const limit = Math.min(Number(params.get("limit")) || 20, 100);

  const validTypes = ["cross_reference", "trade_recommendation", "deep_dive"];
  const conditions = [];

  if (type && validTypes.includes(type)) {
    conditions.push(eq(analyses.type, type));
  }

  // Filter by ticker at DB level via JSON substring match on input_refs
  if (ticker) {
    conditions.push(like(analyses.inputRefs, `%"ticker":"${ticker.toUpperCase()}"%`));
  }

  let query = db.select().from(analyses);
  if (conditions.length > 0) {
    query = query.where(
      conditions.length === 1 ? conditions[0] : and(...conditions),
    ) as typeof query;
  }

  const results = await query
    .orderBy(desc(analyses.createdAt))
    .limit(limit);

  const parsed = results.map((a) => ({
    ...a,
    output: a.output ? JSON.parse(a.output) : null,
    inputRefs: a.inputRefs ? JSON.parse(a.inputRefs) : null,
  }));

  return NextResponse.json({ analyses: parsed });
}
