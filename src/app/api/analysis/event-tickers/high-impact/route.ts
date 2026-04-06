import { NextResponse } from "next/server";
import { backfillRecentHighImpactEventAnalyses } from "@/lib/services/event-ticker-analyzer";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const triggered = await backfillRecentHighImpactEventAnalyses(3);
    return NextResponse.json({ triggered });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "High-impact event backfill failed",
      },
      { status: 500 },
    );
  }
}
