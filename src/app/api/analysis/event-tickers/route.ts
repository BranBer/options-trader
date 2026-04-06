import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { newsEvents } from "@/lib/db/schema";
import {
  analyzeEventTickers,
  getEventTickerAnalysesByEventId,
  HOURS_TO_CACHE,
} from "@/lib/services/event-ticker-analyzer";
import type { EventTickerAnalysis } from "@/types/analysis";

export const dynamic = "force-dynamic";

const eventContextSchema = z.object({
  headline: z.string().min(1).optional(),
  summary: z.string().optional(),
  sentiment: z.enum(["bullish", "bearish", "neutral"]).optional(),
  impactScore: z.number().min(1).max(10).optional(),
  eventType: z.string().optional(),
  sectors: z.array(z.string()).optional(),
});

const postSchema = z.object({
  eventId: z.coerce.number().int().positive(),
  tickers: z.array(z.string().min(1)).min(1).max(25).optional(),
  eventContext: eventContextSchema.optional(),
  force: z.boolean().optional(),
});

let activeAnalysis: Promise<EventTickerAnalysis[]> | null = null;

function orderByRequestedTickers(
  analyses: EventTickerAnalysis[],
  tickers: string[],
): EventTickerAnalysis[] {
  const analysisMap = new Map(
    analyses.map((analysis) => [analysis.ticker.toUpperCase(), analysis]),
  );
  return [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()))]
    .map((ticker) => analysisMap.get(ticker) ?? null)
    .filter((analysis): analysis is EventTickerAnalysis => analysis != null);
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizeTickers(tickers: string[]): string[] {
  return [
    ...new Set(
      tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean),
    ),
  ].slice(0, 5);
}

function buildEventContext(
  event: typeof newsEvents.$inferSelect,
  input?: z.infer<typeof eventContextSchema>,
) {
  return {
    headline: input?.headline?.trim() || event.headline,
    summary: input?.summary?.trim() || event.rawSummary || undefined,
    sentiment:
      input?.sentiment ??
      (event.sentiment === "bullish" || event.sentiment === "bearish"
        ? event.sentiment
        : "neutral"),
    impactScore: input?.impactScore ?? event.impactScore ?? 1,
    eventType: input?.eventType?.trim() || event.eventType || undefined,
    sectors:
      input?.sectors?.filter((sector) => sector.trim().length > 0) ??
      parseStringArray(event.sectors),
  };
}

export async function GET(req: NextRequest) {
  const eventId = Number(req.nextUrl.searchParams.get("eventId"));
  if (!Number.isInteger(eventId) || eventId <= 0) {
    return NextResponse.json(
      { error: "Valid eventId is required" },
      { status: 400 },
    );
  }

  const analyses = await getEventTickerAnalysesByEventId(eventId);
  return NextResponse.json({ analyses, cached: true });
}

export async function POST(req: NextRequest) {
  const parsed = postSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { eventId, tickers = [], eventContext, force = false } = parsed.data;

  const [event] = await db
    .select()
    .from(newsEvents)
    .where(and(eq(newsEvents.id, eventId)))
    .limit(1);

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const requestedTickers = normalizeTickers(
    tickers.length > 0 ? tickers : parseStringArray(event.tickers),
  );
  if (requestedTickers.length === 0) {
    return NextResponse.json(
      { error: "At least one valid ticker is required for event analysis" },
      { status: 400 },
    );
  }

  const normalizedEventContext = buildEventContext(event, eventContext);
  const cachedAnalyses = force
    ? []
    : await getEventTickerAnalysesByEventId(eventId, {
        sinceHours: HOURS_TO_CACHE,
      });
  const cachedTickerSet = new Set(
    cachedAnalyses.map((analysis) => analysis.ticker.toUpperCase()),
  );
  const missingTickers = requestedTickers.filter(
    (ticker) => !cachedTickerSet.has(ticker),
  );

  if (!force && missingTickers.length === 0) {
    return NextResponse.json({
      analyses: orderByRequestedTickers(cachedAnalyses, requestedTickers),
      cached: true,
    });
  }

  if (activeAnalysis) {
    return NextResponse.json(
      { error: "An event-ticker analysis request is already running" },
      { status: 409 },
    );
  }

  activeAnalysis = analyzeEventTickers({
    eventId,
    tickers: force ? requestedTickers : missingTickers,
    eventContext: normalizedEventContext,
  });

  try {
    const freshAnalyses = await activeAnalysis;
    const combined = orderByRequestedTickers(
      [...cachedAnalyses, ...freshAnalyses],
      requestedTickers,
    );

    return NextResponse.json({ analyses: combined, cached: false });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Event-ticker analysis failed",
      },
      { status: 500 },
    );
  } finally {
    activeAnalysis = null;
  }
}
