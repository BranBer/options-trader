import { NextResponse } from "next/server";
import { getMarketPulseRunDetails } from "@/lib/services/market-pulse-engine";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  if (!runId?.trim()) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const details = await getMarketPulseRunDetails(runId.trim());
  if (!details) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json(details);
}
