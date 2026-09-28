import { NextResponse } from "next/server";
import { DeskRunInProgressError, runDesk } from "@/lib/desk/run-desk";

export const dynamic = "force-dynamic";

/**
 * POST /api/desk/run — runs the paper-trading desk once (mark open trades,
 * apply exits, open new entries) and returns the `DeskRunSummary`. No real
 * orders anywhere — this only writes to paper_trades/desk_runs.
 */
export async function POST() {
  try {
    const summary = await runDesk();
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof DeskRunInProgressError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[/api/desk/run] Error:", err);
    return NextResponse.json(
      { error: "Desk run failed", detail: String(err) },
      { status: 500 },
    );
  }
}
