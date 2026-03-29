/**
 * Sector Rotation Context — tracks the 11 GICS sector ETFs
 * to identify risk-on/risk-off regimes and institutional rotation patterns.
 */

export interface SectorPerformance {
  ticker: string;
  name: string;
  dayChangePct: number;
  /** Whether this sector is cyclical (true) or defensive (false) */
  cyclical: boolean;
}

export interface SectorRotationContext {
  regime: "risk_on" | "risk_off" | "mixed";
  leading: SectorPerformance[];
  lagging: SectorPerformance[];
  /** Full ranked list */
  all: SectorPerformance[];
}

/** The 11 GICS sector ETFs */
export const SECTOR_ETFS: Array<{
  ticker: string;
  name: string;
  cyclical: boolean;
}> = [
  { ticker: "XLK", name: "Technology", cyclical: true },
  { ticker: "XLF", name: "Financials", cyclical: true },
  { ticker: "XLE", name: "Energy", cyclical: true },
  { ticker: "XLV", name: "Healthcare", cyclical: false },
  { ticker: "XLY", name: "Consumer Discretionary", cyclical: true },
  { ticker: "XLP", name: "Consumer Staples", cyclical: false },
  { ticker: "XLI", name: "Industrials", cyclical: true },
  { ticker: "XLB", name: "Materials", cyclical: true },
  { ticker: "XLRE", name: "Real Estate", cyclical: true },
  { ticker: "XLU", name: "Utilities", cyclical: false },
  { ticker: "XLC", name: "Communication Services", cyclical: true },
];

/**
 * Classify the rotation regime based on which sectors are leading/lagging.
 * Risk-on: cyclical sectors outperforming defensives.
 * Risk-off: defensive sectors outperforming cyclicals.
 */
export function classifyRotation(
  performances: SectorPerformance[],
): SectorRotationContext {
  const sorted = [...performances].sort(
    (a, b) => b.dayChangePct - a.dayChangePct,
  );
  const leading = sorted.slice(0, 3);
  const lagging = sorted.slice(-3);

  // Count cyclicals in the top 3 vs bottom 3
  const leadingCyclicals = leading.filter((s) => s.cyclical).length;
  const laggingCyclicals = lagging.filter((s) => s.cyclical).length;

  let regime: SectorRotationContext["regime"] = "mixed";
  if (leadingCyclicals >= 2 && laggingCyclicals <= 1) {
    regime = "risk_on";
  } else if (leadingCyclicals <= 1 && laggingCyclicals >= 2) {
    regime = "risk_off";
  }

  return { regime, leading, lagging, all: sorted };
}

/**
 * Build a human-readable sector rotation context string for Gemini prompts.
 */
export function buildSectorRotationPromptContext(
  ctx: SectorRotationContext,
): string {
  const regime =
    ctx.regime === "risk_on"
      ? "Risk-On (cyclical sectors leading)"
      : ctx.regime === "risk_off"
        ? "Risk-Off (defensive sectors leading)"
        : "Mixed (no clear rotation signal)";

  const leading = ctx.leading
    .map(
      (s) =>
        `${s.name} (${s.ticker}: ${s.dayChangePct > 0 ? "+" : ""}${s.dayChangePct.toFixed(2)}%)`,
    )
    .join(", ");

  const lagging = ctx.lagging
    .map(
      (s) =>
        `${s.name} (${s.ticker}: ${s.dayChangePct > 0 ? "+" : ""}${s.dayChangePct.toFixed(2)}%)`,
    )
    .join(", ");

  return `## Sector Rotation\n- Regime: ${regime}\n- Leading: ${leading}\n- Lagging: ${lagging}`;
}
