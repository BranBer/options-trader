import { NextResponse } from "next/server";
import { buildDeskResponse } from "@/lib/desk/desk-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/desk — the paper-trading desk's read model. See src/types/desk.ts
 * for the exact response contract (`DeskResponse`) shared with the Desk page.
 */
export async function GET() {
  try {
    const data = await buildDeskResponse();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/desk] Error:", err);
    return NextResponse.json(
      { error: "Failed to build desk response", detail: String(err) },
      { status: 500 },
    );
  }
}
