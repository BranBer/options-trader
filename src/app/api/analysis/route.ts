import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { analyses } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const type = params.get("type"); // 'cross_reference' | 'trade_recommendation'
  const limit = Math.min(Number(params.get("limit")) || 20, 100);

  let query = db.select().from(analyses);
  if (type === "cross_reference" || type === "trade_recommendation") {
    query = query.where(eq(analyses.type, type)) as typeof query;
  }

  const results = await query
    .orderBy(desc(analyses.createdAt))
    .limit(limit);

  // Parse output JSON for each analysis
  const parsed = results.map((a) => ({
    ...a,
    output: a.output ? JSON.parse(a.output) : null,
    inputRefs: a.inputRefs ? JSON.parse(a.inputRefs) : null,
  }));

  return NextResponse.json({ analyses: parsed });
}
