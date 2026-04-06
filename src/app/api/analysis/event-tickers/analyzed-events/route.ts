import { NextResponse } from "next/server";
import {
  getAnalyzedEventIds,
  getAnalyzedEventSummaries,
} from "@/lib/services/event-ticker-analyzer";

export const dynamic = "force-dynamic";

export async function GET() {
  const [analyzedEventIds, recentAnalyses] = await Promise.all([
    getAnalyzedEventIds(200),
    getAnalyzedEventSummaries(5),
  ]);

  return NextResponse.json({
    analyzedEventIds,
    recentAnalyses,
  });
}
