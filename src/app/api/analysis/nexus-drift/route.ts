import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { newsEvents } from "@/lib/db/schema";
import { desc, gte } from "drizzle-orm";
import { NEXUS_COMPANIES } from "@/lib/data/nexus-companies";
import { analyzeNexusDrift } from "@/lib/services/llm-analyzer";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // Fetch recent high-impact news (last 3 days, impact >= 5) for context
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const recentNews = await db
      .select({
        headline: newsEvents.headline,
        sentiment: newsEvents.sentiment,
        impactScore: newsEvents.impactScore,
        eventType: newsEvents.eventType,
        sectors: newsEvents.sectors,
        tickers: newsEvents.tickers,
        publishedAt: newsEvents.publishedAt,
      })
      .from(newsEvents)
      .where(gte(newsEvents.createdAt, threeDaysAgo))
      .orderBy(desc(newsEvents.impactScore))
      .limit(50);

    // Build news context string for the LLM
    const newsContext =
      recentNews.length > 0
        ? recentNews
            .map(
              (n) =>
                `[${n.sentiment ?? "neutral"}, impact ${n.impactScore ?? 0}] ${n.headline}${n.tickers ? ` (tickers: ${n.tickers})` : ""}`,
            )
            .join("\n")
        : "No recent high-impact news events found in the database. Analyze based on your knowledge of current global events as of today.";

    const result = await analyzeNexusDrift(NEXUS_COMPANIES, newsContext);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[nexus-drift] Analysis failed:", error);
    return NextResponse.json(
      {
        error: "Nexus drift analysis failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
