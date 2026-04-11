/**
 * Post-release impact analyzer — Epic 47, Story 47.9.
 *
 * After a high-impact economic event passes, this module detects it as a
 * "recent release" and builds a market reaction summary using publicly
 * available price data (SPY, VIX).
 *
 * Data gap note: We do not currently have a free, machine-readable source for
 * "actual vs. expected" economic readings (e.g., CPI 2.3% vs. 2.1% expected).
 * ISM and BLS publish actuals after release, but not in a structured API that
 * is freely accessible without auth. Until that source is identified (Story
 * 47.11 follow-up), the summary focuses on market price reaction only.
 *
 * If/when actual readings are available they can be passed in via the optional
 * `actualReading` field in PostReleaseContext.
 */

import type { EconomicEvent } from "@/lib/utils/economic-calendar";
import { getCachedCalendar } from "./live-economic-calendar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PostReleaseEvent {
  event: EconomicEvent;
  /** Hours since the event date (0–72) */
  hoursAgo: number;
  /** Actual economic reading if available (e.g., "2.3%"), null otherwise */
  actualReading: string | null;
}

export interface RecentReleaseSummary {
  /** Events that released within the look-back window */
  recentReleases: PostReleaseEvent[];
  /** ISO timestamp this summary was generated */
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Return high-impact economic events that released in the last `hoursWindow`
 * hours.  Events are sourced from the live calendar cache.
 *
 * Defaults to a 72 h window (3 trading days) so that weekend releases are
 * still captured on Monday morning.
 */
export function getRecentHighImpactReleases(
  hoursWindow: number = 72,
  now: Date = new Date(),
): PostReleaseEvent[] {
  const events = getCachedCalendar();
  const todayMs = now.getTime();
  const windowStartMs = todayMs - hoursWindow * 60 * 60 * 1000;

  const results: PostReleaseEvent[] = [];

  for (const event of events) {
    if (event.impact !== "high") continue;

    // Parse event date as midnight UTC
    const eventMs = Date.parse(`${event.date}T00:00:00Z`);
    if (eventMs < windowStartMs || eventMs > todayMs) continue;

    const hoursAgo = Math.round((todayMs - eventMs) / (60 * 60 * 1000));
    results.push({ event, hoursAgo, actualReading: null });
  }

  // Most recent first
  return results.sort((a, b) => a.hoursAgo - b.hoursAgo);
}

// ---------------------------------------------------------------------------
// Market reaction summary builder
//
// Produces a text block suitable for LLM prompt injection.
// When actual market data is available (SPY 1-day change, VIX change) the
// caller can augment the context; for now we produce a template with labelled
// placeholders so the LLM knows what to expect when data is supplied.
// ---------------------------------------------------------------------------

export interface MarketReactionData {
  spyChangePct?: number | null;
  vixBefore?: number | null;
  vixAfter?: number | null;
}

/**
 * Build a prompt-ready string for a recently released high-impact event.
 * Include `marketReaction` when price data is available.
 */
export function buildPostReleaseContext(
  release: PostReleaseEvent,
  marketReaction?: MarketReactionData,
): string {
  const lines: string[] = [];

  lines.push(
    `📢 RECENT ECONOMIC RELEASE: ${release.event.name} (${release.event.date})`,
  );
  lines.push(`  Released approximately ${release.hoursAgo} hours ago.`);
  lines.push(`  Event: ${release.event.description}`);

  if (release.actualReading) {
    lines.push(`  Actual reading: ${release.actualReading}`);
  } else {
    lines.push(
      `  Actual reading: not available (no free structured data source)`,
    );
  }

  if (marketReaction) {
    if (marketReaction.spyChangePct != null) {
      const dir = marketReaction.spyChangePct >= 0 ? "+" : "";
      lines.push(
        `  SPY 1-day reaction: ${dir}${marketReaction.spyChangePct.toFixed(2)}%`,
      );
    }
    if (marketReaction.vixBefore != null && marketReaction.vixAfter != null) {
      const vixChange = marketReaction.vixAfter - marketReaction.vixBefore;
      const vixDir = vixChange >= 0 ? "+" : "";
      lines.push(
        `  VIX change: ${marketReaction.vixBefore.toFixed(1)} → ${marketReaction.vixAfter.toFixed(1)} (${vixDir}${vixChange.toFixed(1)})`,
      );
    }
  }

  return lines.join("\n");
}

/**
 * Build a combined context string for all recent high-impact releases.
 * Returns null when there are no recent releases.
 */
export function buildRecentReleasesContext(
  releases: PostReleaseEvent[],
): string | null {
  if (releases.length === 0) return null;

  const header =
    releases.length === 1
      ? "⚠️ A high-impact economic release just occurred:"
      : `⚠️ ${releases.length} high-impact economic releases occurred recently:`;

  const bodies = releases.map((r) => buildPostReleaseContext(r));
  return [header, ...bodies].join("\n\n");
}

/**
 * Summarize recent releases for the calendar status endpoint.
 */
export function getRecentReleaseSummary(
  hoursWindow = 72,
  now: Date = new Date(),
): RecentReleaseSummary {
  return {
    recentReleases: getRecentHighImpactReleases(hoursWindow, now),
    generatedAt: now.toISOString(),
  };
}
