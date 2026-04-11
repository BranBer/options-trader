/**
 * Economic event calendar for catalyst awareness.
 *
 * Provides a hardcoded schedule of major US economic releases for 2026,
 * plus proximity-based relevance scoring for a given trade window.
 *
 * Events are categorized by impact level:
 * - HIGH: CPI, NFP (Non-Farm Payrolls), FOMC (handled separately)
 * - MEDIUM: PPI, Retail Sales, GDP, PCE, ISM Manufacturing
 * - LOW: Housing Starts, Durable Goods, Consumer Confidence
 */

export type EventImpact = "high" | "medium" | "low";

export interface EconomicEvent {
  date: string;
  name: string;
  impact: EventImpact;
  /** Brief description of what this release measures */
  description: string;
}

export interface UpcomingCatalyst extends EconomicEvent {
  daysUntil: number;
}

export interface CatalystSummary {
  /** Events within the trade window */
  events: UpcomingCatalyst[];
  /** High-impact events within the trade window */
  highImpactCount: number;
  /** Whether any high-impact event falls within 3 days of trade entry */
  immediateRisk: boolean;
}

// ---------------------------------------------------------------------------
// 2026 Economic Calendar — Major US releases
// Dates sourced from BLS, BEA, Census Bureau schedules.
// Only includes recurring monthly/quarterly releases.
// ---------------------------------------------------------------------------

const ECONOMIC_EVENTS_2026: EconomicEvent[] = [
  // CPI — typically 2nd or 3rd Tuesday/Wednesday of month
  {
    date: "2026-01-14",
    name: "CPI",
    impact: "high",
    description:
      "Consumer Price Index — key inflation gauge; higher-than-expected = hawkish Fed, risk-off",
  },
  {
    date: "2026-02-11",
    name: "CPI",
    impact: "high",
    description: "Consumer Price Index — key inflation gauge",
  },
  {
    date: "2026-03-11",
    name: "CPI",
    impact: "high",
    description: "Consumer Price Index — key inflation gauge",
  },
  {
    date: "2026-04-14",
    name: "CPI",
    impact: "high",
    description: "Consumer Price Index — key inflation gauge",
  },
  {
    date: "2026-05-13",
    name: "CPI",
    impact: "high",
    description: "Consumer Price Index — key inflation gauge",
  },
  {
    date: "2026-06-10",
    name: "CPI",
    impact: "high",
    description: "Consumer Price Index — key inflation gauge",
  },
  {
    date: "2026-07-15",
    name: "CPI",
    impact: "high",
    description: "Consumer Price Index — key inflation gauge",
  },
  {
    date: "2026-08-12",
    name: "CPI",
    impact: "high",
    description: "Consumer Price Index — key inflation gauge",
  },
  {
    date: "2026-09-16",
    name: "CPI",
    impact: "high",
    description: "Consumer Price Index — key inflation gauge",
  },
  {
    date: "2026-10-14",
    name: "CPI",
    impact: "high",
    description: "Consumer Price Index — key inflation gauge",
  },
  {
    date: "2026-11-12",
    name: "CPI",
    impact: "high",
    description: "Consumer Price Index — key inflation gauge",
  },
  {
    date: "2026-12-10",
    name: "CPI",
    impact: "high",
    description: "Consumer Price Index — key inflation gauge",
  },

  // NFP — first Friday of month
  {
    date: "2026-01-09",
    name: "Non-Farm Payrolls",
    impact: "high",
    description:
      "Jobs report — strong = hawkish Fed, weak = dovish; moves rates and equities",
  },
  {
    date: "2026-02-06",
    name: "Non-Farm Payrolls",
    impact: "high",
    description: "Jobs report — labor market strength indicator",
  },
  {
    date: "2026-03-06",
    name: "Non-Farm Payrolls",
    impact: "high",
    description: "Jobs report — labor market strength indicator",
  },
  {
    date: "2026-04-03",
    name: "Non-Farm Payrolls",
    impact: "high",
    description: "Jobs report — labor market strength indicator",
  },
  {
    date: "2026-05-08",
    name: "Non-Farm Payrolls",
    impact: "high",
    description: "Jobs report — labor market strength indicator",
  },
  {
    date: "2026-06-05",
    name: "Non-Farm Payrolls",
    impact: "high",
    description: "Jobs report — labor market strength indicator",
  },
  {
    date: "2026-07-02",
    name: "Non-Farm Payrolls",
    impact: "high",
    description: "Jobs report — labor market strength indicator",
  },
  {
    date: "2026-08-07",
    name: "Non-Farm Payrolls",
    impact: "high",
    description: "Jobs report — labor market strength indicator",
  },
  {
    date: "2026-09-04",
    name: "Non-Farm Payrolls",
    impact: "high",
    description: "Jobs report — labor market strength indicator",
  },
  {
    date: "2026-10-02",
    name: "Non-Farm Payrolls",
    impact: "high",
    description: "Jobs report — labor market strength indicator",
  },
  {
    date: "2026-11-06",
    name: "Non-Farm Payrolls",
    impact: "high",
    description: "Jobs report — labor market strength indicator",
  },
  {
    date: "2026-12-04",
    name: "Non-Farm Payrolls",
    impact: "high",
    description: "Jobs report — labor market strength indicator",
  },

  // PCE (Core PCE) — last Friday of month (Fed's preferred inflation measure)
  {
    date: "2026-01-30",
    name: "Core PCE",
    impact: "high",
    description:
      "Fed's preferred inflation measure — directly influences rate decisions",
  },
  {
    date: "2026-02-27",
    name: "Core PCE",
    impact: "high",
    description: "Fed's preferred inflation measure",
  },
  {
    date: "2026-03-27",
    name: "Core PCE",
    impact: "high",
    description: "Fed's preferred inflation measure",
  },
  {
    date: "2026-04-30",
    name: "Core PCE",
    impact: "high",
    description: "Fed's preferred inflation measure",
  },
  {
    date: "2026-05-29",
    name: "Core PCE",
    impact: "high",
    description: "Fed's preferred inflation measure",
  },
  {
    date: "2026-06-26",
    name: "Core PCE",
    impact: "high",
    description: "Fed's preferred inflation measure",
  },
  {
    date: "2026-07-31",
    name: "Core PCE",
    impact: "high",
    description: "Fed's preferred inflation measure",
  },
  {
    date: "2026-08-28",
    name: "Core PCE",
    impact: "high",
    description: "Fed's preferred inflation measure",
  },
  {
    date: "2026-09-25",
    name: "Core PCE",
    impact: "high",
    description: "Fed's preferred inflation measure",
  },
  {
    date: "2026-10-30",
    name: "Core PCE",
    impact: "high",
    description: "Fed's preferred inflation measure",
  },
  {
    date: "2026-11-25",
    name: "Core PCE",
    impact: "high",
    description: "Fed's preferred inflation measure",
  },
  {
    date: "2026-12-23",
    name: "Core PCE",
    impact: "high",
    description: "Fed's preferred inflation measure",
  },

  // PPI — ~1 day after CPI
  {
    date: "2026-01-15",
    name: "PPI",
    impact: "medium",
    description: "Producer Price Index — upstream inflation; leads CPI trends",
  },
  {
    date: "2026-02-12",
    name: "PPI",
    impact: "medium",
    description: "Producer Price Index",
  },
  {
    date: "2026-03-12",
    name: "PPI",
    impact: "medium",
    description: "Producer Price Index",
  },
  {
    date: "2026-04-15",
    name: "PPI",
    impact: "medium",
    description: "Producer Price Index",
  },
  {
    date: "2026-05-14",
    name: "PPI",
    impact: "medium",
    description: "Producer Price Index",
  },
  {
    date: "2026-06-11",
    name: "PPI",
    impact: "medium",
    description: "Producer Price Index",
  },
  {
    date: "2026-07-16",
    name: "PPI",
    impact: "medium",
    description: "Producer Price Index",
  },
  {
    date: "2026-08-13",
    name: "PPI",
    impact: "medium",
    description: "Producer Price Index",
  },
  {
    date: "2026-09-17",
    name: "PPI",
    impact: "medium",
    description: "Producer Price Index",
  },
  {
    date: "2026-10-15",
    name: "PPI",
    impact: "medium",
    description: "Producer Price Index",
  },
  {
    date: "2026-11-13",
    name: "PPI",
    impact: "medium",
    description: "Producer Price Index",
  },
  {
    date: "2026-12-11",
    name: "PPI",
    impact: "medium",
    description: "Producer Price Index",
  },

  // Retail Sales — mid-month
  {
    date: "2026-01-16",
    name: "Retail Sales",
    impact: "medium",
    description:
      "Consumer spending — 70% of GDP; strong = bullish consumer sector",
  },
  {
    date: "2026-02-17",
    name: "Retail Sales",
    impact: "medium",
    description: "Consumer spending data",
  },
  {
    date: "2026-03-17",
    name: "Retail Sales",
    impact: "medium",
    description: "Consumer spending data",
  },
  {
    date: "2026-04-16",
    name: "Retail Sales",
    impact: "medium",
    description: "Consumer spending data",
  },
  {
    date: "2026-05-15",
    name: "Retail Sales",
    impact: "medium",
    description: "Consumer spending data",
  },
  {
    date: "2026-06-16",
    name: "Retail Sales",
    impact: "medium",
    description: "Consumer spending data",
  },
  {
    date: "2026-07-17",
    name: "Retail Sales",
    impact: "medium",
    description: "Consumer spending data",
  },
  {
    date: "2026-08-14",
    name: "Retail Sales",
    impact: "medium",
    description: "Consumer spending data",
  },
  {
    date: "2026-09-15",
    name: "Retail Sales",
    impact: "medium",
    description: "Consumer spending data",
  },
  {
    date: "2026-10-16",
    name: "Retail Sales",
    impact: "medium",
    description: "Consumer spending data",
  },
  {
    date: "2026-11-17",
    name: "Retail Sales",
    impact: "medium",
    description: "Consumer spending data",
  },
  {
    date: "2026-12-15",
    name: "Retail Sales",
    impact: "medium",
    description: "Consumer spending data",
  },

  // GDP — end of month (quarterly, advanced/preliminary/final)
  {
    date: "2026-01-29",
    name: "GDP (Q4 Advance)",
    impact: "medium",
    description: "Quarterly GDP growth — broad economic health indicator",
  },
  {
    date: "2026-02-26",
    name: "GDP (Q4 Second)",
    impact: "low",
    description: "GDP revision — rarely market-moving unless large revision",
  },
  {
    date: "2026-03-26",
    name: "GDP (Q4 Final)",
    impact: "low",
    description: "GDP final revision",
  },
  {
    date: "2026-04-29",
    name: "GDP (Q1 Advance)",
    impact: "medium",
    description: "Quarterly GDP growth",
  },
  {
    date: "2026-06-25",
    name: "GDP (Q1 Final)",
    impact: "low",
    description: "GDP final revision",
  },
  {
    date: "2026-07-30",
    name: "GDP (Q2 Advance)",
    impact: "medium",
    description: "Quarterly GDP growth",
  },
  {
    date: "2026-09-24",
    name: "GDP (Q2 Final)",
    impact: "low",
    description: "GDP final revision",
  },
  {
    date: "2026-10-29",
    name: "GDP (Q3 Advance)",
    impact: "medium",
    description: "Quarterly GDP growth",
  },
  {
    date: "2026-12-22",
    name: "GDP (Q3 Final)",
    impact: "low",
    description: "GDP final revision",
  },

  // ISM Manufacturing — first business day of month
  {
    date: "2026-01-05",
    name: "ISM Manufacturing",
    impact: "medium",
    description:
      "Manufacturing activity — above 50 = expansion; leading economic indicator",
  },
  {
    date: "2026-02-02",
    name: "ISM Manufacturing",
    impact: "medium",
    description: "Manufacturing activity",
  },
  {
    date: "2026-03-02",
    name: "ISM Manufacturing",
    impact: "medium",
    description: "Manufacturing activity",
  },
  {
    date: "2026-04-01",
    name: "ISM Manufacturing",
    impact: "medium",
    description: "Manufacturing activity",
  },
  {
    date: "2026-05-04",
    name: "ISM Manufacturing",
    impact: "medium",
    description: "Manufacturing activity",
  },
  {
    date: "2026-06-01",
    name: "ISM Manufacturing",
    impact: "medium",
    description: "Manufacturing activity",
  },
  {
    date: "2026-07-01",
    name: "ISM Manufacturing",
    impact: "medium",
    description: "Manufacturing activity",
  },
  {
    date: "2026-08-03",
    name: "ISM Manufacturing",
    impact: "medium",
    description: "Manufacturing activity",
  },
  {
    date: "2026-09-01",
    name: "ISM Manufacturing",
    impact: "medium",
    description: "Manufacturing activity",
  },
  {
    date: "2026-10-01",
    name: "ISM Manufacturing",
    impact: "medium",
    description: "Manufacturing activity",
  },
  {
    date: "2026-11-02",
    name: "ISM Manufacturing",
    impact: "medium",
    description: "Manufacturing activity",
  },
  {
    date: "2026-12-01",
    name: "ISM Manufacturing",
    impact: "medium",
    description: "Manufacturing activity",
  },

  // FOMC — 8 meetings per year (2-day meetings, date = announcement day)
  {
    date: "2026-01-28",
    name: "FOMC Decision",
    impact: "high",
    description:
      "Federal Reserve rate decision + statement — most market-moving event",
  },
  {
    date: "2026-03-18",
    name: "FOMC Decision",
    impact: "high",
    description: "Fed rate decision + updated dot plot and projections",
  },
  {
    date: "2026-05-06",
    name: "FOMC Decision",
    impact: "high",
    description: "Federal Reserve rate decision + statement",
  },
  {
    date: "2026-06-17",
    name: "FOMC Decision",
    impact: "high",
    description: "Fed rate decision + updated dot plot and projections",
  },
  {
    date: "2026-07-29",
    name: "FOMC Decision",
    impact: "high",
    description: "Federal Reserve rate decision + statement",
  },
  {
    date: "2026-09-16",
    name: "FOMC Decision",
    impact: "high",
    description: "Fed rate decision + updated dot plot and projections",
  },
  {
    date: "2026-11-04",
    name: "FOMC Decision",
    impact: "high",
    description: "Federal Reserve rate decision + statement",
  },
  {
    date: "2026-12-16",
    name: "FOMC Decision",
    impact: "high",
    description: "Fed rate decision + updated dot plot and projections",
  },
];

/**
 * Get upcoming economic events within a trade window.
 *
 * @param tradeWindowDays How many days forward to look (default: 14 for 2-week trade)
 * @param fromDate Start date (default: now)
 * @returns Summary of catalysts within the window
 */
export function getUpcomingCatalysts(
  tradeWindowDays: number = 14,
  fromDate: Date = new Date(),
): CatalystSummary {
  const fromMs = fromDate.getTime();
  const windowEnd = fromMs + tradeWindowDays * 24 * 60 * 60 * 1000;

  const events: UpcomingCatalyst[] = [];

  for (const event of ECONOMIC_EVENTS_2026) {
    const eventMs = new Date(event.date).getTime();
    if (eventMs >= fromMs && eventMs <= windowEnd) {
      const daysUntil = Math.ceil((eventMs - fromMs) / (1000 * 60 * 60 * 24));
      events.push({ ...event, daysUntil });
    }
  }

  // Sort by date ascending
  events.sort((a, b) => a.daysUntil - b.daysUntil);

  const highImpactCount = events.filter((e) => e.impact === "high").length;
  const immediateRisk = events.some(
    (e) => e.impact === "high" && e.daysUntil <= 3,
  );

  return { events, highImpactCount, immediateRisk };
}

/**
 * Format catalyst summary for LLM prompt injection.
 */
export function formatCatalystsForPrompt(
  catalysts: CatalystSummary,
  earningsDate?: string | null,
  fromDate: Date = new Date(),
): string {
  const lines: string[] = [];

  if (earningsDate) {
    const daysTo = Math.ceil(
      (new Date(earningsDate).getTime() - fromDate.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    if (daysTo > 0 && daysTo <= 14) {
      lines.push(
        `⚠️ EARNINGS in ${daysTo} day${daysTo !== 1 ? "s" : ""} (${earningsDate}) — expect IV expansion into earnings and potential IV crush after. This is the single most important catalyst for this trade.`,
      );
    }
  }

  if (catalysts.events.length === 0) {
    lines.push("No major economic releases within the trade window.");
    return lines.join("\n");
  }

  if (catalysts.immediateRisk) {
    lines.push(
      "⚠️ HIGH-IMPACT economic release within 3 days — consider delaying entry or adjusting position size.",
    );
  }

  lines.push(
    `${catalysts.highImpactCount} high-impact event${catalysts.highImpactCount !== 1 ? "s" : ""} within the trade window:`,
  );

  for (const e of catalysts.events) {
    const impactIcon =
      e.impact === "high" ? "🔴" : e.impact === "medium" ? "🟡" : "⚪";
    lines.push(
      `${impactIcon} ${e.name} — ${e.date} (${e.daysUntil}d away): ${e.description}`,
    );
  }

  return lines.join("\n");
}
