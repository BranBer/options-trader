import { NextResponse } from "next/server";
import { NEXUS_COMPANIES, type NexusCompany } from "@/lib/data/nexus-companies";
import {
  fetchEarningsDate,
  fetchEpsSurprise,
} from "@/lib/services/market-fetcher";
import {
  detectCascade,
  type NexusEarnings,
  type CascadeContext,
} from "@/lib/utils/cascade-detector";

export const dynamic = "force-dynamic";

export interface ActiveCascadeEntry {
  nexusTicker: string;
  nexusName: string;
  sector: string;
  reportedAt: string;
  hoursSinceReport: number;
  epsSurprisePct: number;
  direction: "bullish" | "bearish";
  dependentCount: number;
}

export interface ActiveCascadesResponse {
  cascades: ActiveCascadeEntry[];
  /** Sample cascade contexts for the most-affected tickers */
  sampleContexts: Array<{
    ticker: string;
    cascadeStrength: number;
    cascadeDirection: string;
  }>;
  fetchedAt: string;
}

export async function GET() {
  try {
    const recentNexusEarnings = new Map<string, NexusEarnings>();
    const cascadeEntries: ActiveCascadeEntry[] = [];

    // Check all nexus companies for recent earnings (within 72h)
    for (const nexus of NEXUS_COMPANIES) {
      try {
        const earningsDate = await fetchEarningsDate(nexus.ticker);
        if (!earningsDate) continue;

        const reportedMs = new Date(earningsDate).getTime();
        const hoursSince = (Date.now() - reportedMs) / (1000 * 60 * 60);

        if (hoursSince >= 0 && hoursSince <= 72) {
          const epsData = await fetchEpsSurprise(nexus.ticker);
          const epsSurprisePct = epsData?.epsSurprisePct ?? 0;

          recentNexusEarnings.set(nexus.ticker, {
            reportedAt: earningsDate,
            epsSurprisePct,
          });

          cascadeEntries.push({
            nexusTicker: nexus.ticker,
            nexusName: nexus.name,
            sector: nexus.sector,
            reportedAt: earningsDate,
            hoursSinceReport: Math.round(hoursSince * 10) / 10,
            epsSurprisePct,
            direction: epsSurprisePct >= 0 ? "bullish" : "bearish",
            dependentCount: nexus.dependents.length,
          });
        }
      } catch {
        // Non-critical — skip
      }
    }

    // Build sample cascade contexts for a few dependent tickers
    const sampleContexts: ActiveCascadesResponse["sampleContexts"] = [];
    if (recentNexusEarnings.size > 0) {
      // Collect unique dependent tickers from active cascades
      const dependentTickers = new Set<string>();
      for (const entry of cascadeEntries) {
        const nexus = NEXUS_COMPANIES.find(
          (n) => n.ticker === entry.nexusTicker,
        );
        if (nexus) {
          for (const dep of nexus.dependents) {
            dependentTickers.add(dep.ticker);
          }
        }
      }

      // Compute cascade context for up to 5 dependents
      const sampleTickers = [...dependentTickers].slice(0, 5);
      for (const ticker of sampleTickers) {
        const ctx = detectCascade(ticker, NEXUS_COMPANIES, recentNexusEarnings);
        if (ctx) {
          sampleContexts.push({
            ticker,
            cascadeStrength: Math.round(ctx.cascadeStrength * 1000) / 1000,
            cascadeDirection: ctx.cascadeDirection,
          });
        }
      }
    }

    return NextResponse.json({
      cascades: cascadeEntries,
      sampleContexts,
      fetchedAt: new Date().toISOString(),
    } satisfies ActiveCascadesResponse);
  } catch (err) {
    console.error("[active-cascades] Failed:", err);
    return NextResponse.json(
      { error: "Failed to fetch active cascades" },
      { status: 500 },
    );
  }
}
