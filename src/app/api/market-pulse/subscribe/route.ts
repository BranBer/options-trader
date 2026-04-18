import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  addTicker,
  getTrackedTickers,
  MarketPulseSubscriptionError,
  removeTicker,
} from "@/lib/services/market-pulse-scheduler";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  ticker: z.string().min(1),
  action: z.enum(["add", "remove"]),
});

export async function GET() {
  const subscriptions = await getTrackedTickers();
  return NextResponse.json({ subscriptions });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const subscriptions =
      parsed.data.action === "add"
        ? await addTicker(parsed.data.ticker)
        : await removeTicker(parsed.data.ticker);

    return NextResponse.json({ subscriptions });
  } catch (error) {
    if (error instanceof MarketPulseSubscriptionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    console.error("[market-pulse/subscribe] Failed:", error);
    return NextResponse.json(
      { error: "Failed to update Market Pulse subscriptions" },
      { status: 500 },
    );
  }
}
