// ============================================================
// Epic 43 — Cascade Detector
// Detects earnings cascade signals from nexus companies and
// computes cascade strength using the wave model.
// ============================================================

import type { NexusCompany } from "@/lib/data/nexus-companies";

// ---------- Types ----------

export interface CascadeSignal {
  nexusTicker: string;
  nexusName: string;
  reportedAt: string; // ISO timestamp of earnings report
  hoursSinceReport: number;
  epsSurprisePct: number; // e.g. 15.0 for 15% beat, -10.0 for 10% miss
  baseImpact: number; // normalized 0-1 from EPS magnitude
  direction: "bullish" | "bearish";
}

export interface CascadeEdge {
  nexusTicker: string;
  targetTicker: string;
  edgeWeight: number;
  hop: number; // 1 = direct, 2 = second-order
  relationship: string;
  directionality: "customer" | "supplier" | "platform" | "competitive";
}

export interface CascadeContext {
  signals: CascadeSignal[];
  edges: CascadeEdge[];
  cascadeStrength: number; // final 0-1 composite for confidence factor
  cascadeDirection: "bullish" | "bearish" | "mixed";
  timeFactor: number; // 0-1 time decay of strongest signal
  promptSection: string; // pre-formatted text for prompt injection
}

export interface NexusEarnings {
  reportedAt: string; // ISO timestamp
  epsSurprisePct: number; // positive = beat, negative = miss
}

// ---------- Constants ----------

const DECAY = 0.5; // per-hop attenuation
const MAX_HOPS = 2;
const MISS_ASYMMETRY = 1.3; // misses cascade stronger
const CASCADE_WINDOW_HOURS = 72;

// ---------- Helpers ----------

/** Normalize EPS surprise magnitude to 0-1 using step function */
export function normalizeEpsMagnitude(absPct: number): number {
  if (absPct < 1) return 0.1;
  if (absPct < 5) return 0.3;
  if (absPct < 10) return 0.5;
  if (absPct < 20) return 0.8;
  return 1.0;
}

/** Compute time factor: 1.0 at 0h, linear decay to 0.2 at 72h, 0 after */
export function computeTimeFactor(hoursSinceReport: number): number {
  if (hoursSinceReport < 0) return 0; // hasn't reported yet
  if (hoursSinceReport <= 4) return 1.0; // immediate phase
  if (hoursSinceReport <= CASCADE_WINDOW_HOURS) {
    // linear decay from 1.0 at 4h to 0.2 at 72h
    return 1.0 - ((hoursSinceReport - 4) / (CASCADE_WINDOW_HOURS - 4)) * 0.8;
  }
  return 0; // exhausted
}

/** Compute cascade strength for a single edge */
export function computeEdgeCascadeStrength(
  baseImpact: number,
  edgeWeight: number,
  hop: number,
  isMiss: boolean,
  timeFactor: number,
): number {
  const raw = baseImpact * edgeWeight * Math.pow(DECAY, hop - 1);
  const asymmetry = isMiss ? MISS_ASYMMETRY : 1.0;
  return Math.min(1, raw * asymmetry * timeFactor);
}

/**
 * Build a CascadeSignal from nexus company + earnings data.
 */
function buildSignal(
  nexus: NexusCompany,
  earnings: NexusEarnings,
  now: Date,
): CascadeSignal | null {
  const reportedDate = new Date(earnings.reportedAt);
  const hoursSinceReport =
    (now.getTime() - reportedDate.getTime()) / (1000 * 60 * 60);

  if (hoursSinceReport < 0 || hoursSinceReport > CASCADE_WINDOW_HOURS) {
    return null;
  }

  const absPct = Math.abs(earnings.epsSurprisePct);
  const baseImpact = normalizeEpsMagnitude(absPct);
  const direction = earnings.epsSurprisePct >= 0 ? "bullish" : "bearish";

  return {
    nexusTicker: nexus.ticker,
    nexusName: nexus.name,
    reportedAt: earnings.reportedAt,
    hoursSinceReport,
    epsSurprisePct: earnings.epsSurprisePct,
    baseImpact,
    direction,
  };
}

/**
 * Find cascade edges from nexus companies to a target ticker.
 * Supports up to 2 hops through the dependency graph.
 */
function findEdges(
  targetTicker: string,
  nexusCompanies: NexusCompany[],
  activeNexusTickers: Set<string>,
): CascadeEdge[] {
  const upper = targetTicker.toUpperCase();
  const edges: CascadeEdge[] = [];

  for (const nexus of nexusCompanies) {
    if (!activeNexusTickers.has(nexus.ticker)) continue;

    // Hop 1: direct dependency
    const directDep = nexus.dependents.find(
      (d) => d.ticker.toUpperCase() === upper,
    );
    if (directDep) {
      edges.push({
        nexusTicker: nexus.ticker,
        targetTicker,
        edgeWeight: directDep.edgeWeight,
        hop: 1,
        relationship: directDep.relationship,
        directionality: directDep.directionality,
      });
      continue; // don't also add hop-2 for same nexus
    }

    // Hop 2: nexus → intermediate → target
    for (const dep of nexus.dependents) {
      const intermediate = nexusCompanies.find(
        (n) => n.ticker.toUpperCase() === dep.ticker.toUpperCase(),
      );
      if (!intermediate) continue;
      const secondHop = intermediate.dependents.find(
        (d) => d.ticker.toUpperCase() === upper,
      );
      if (secondHop) {
        // Use the weaker of the two edge weights
        const combinedWeight = Math.min(dep.edgeWeight, secondHop.edgeWeight);
        edges.push({
          nexusTicker: nexus.ticker,
          targetTicker,
          edgeWeight: combinedWeight,
          hop: 2,
          relationship: `${dep.ticker} → ${secondHop.relationship}`,
          directionality: secondHop.directionality,
        });
        break; // one hop-2 path per nexus is enough
      }
    }
  }

  return edges;
}

/** Format cascade context as prompt text */
function buildPromptSection(
  signals: CascadeSignal[],
  edges: CascadeEdge[],
  cascadeStrength: number,
  cascadeDirection: string,
  nexusCompanies: NexusCompany[],
): string {
  const lines: string[] = [];

  for (const signal of signals) {
    const relEdges = edges.filter((e) => e.nexusTicker === signal.nexusTicker);
    if (relEdges.length === 0) continue;

    const beatMiss = signal.direction === "bullish" ? "beat" : "miss";
    const magnitude =
      Math.abs(signal.epsSurprisePct) >= 20
        ? "LARGE"
        : Math.abs(signal.epsSurprisePct) >= 10
          ? "SIGNIFICANT"
          : Math.abs(signal.epsSurprisePct) >= 5
            ? "MODERATE"
            : "SMALL";
    const phase =
      signal.hoursSinceReport <= 4
        ? "IMMEDIATE"
        : signal.hoursSinceReport <= 72
          ? "DELAYED"
          : "EXHAUSTED";
    const hoursStr = Math.round(signal.hoursSinceReport);

    lines.push(
      `Upstream nexus company ${signal.nexusName} (${signal.nexusTicker}) reported earnings ${hoursStr}h ago.`,
    );
    lines.push(
      `- EPS surprise: ${signal.epsSurprisePct > 0 ? "+" : ""}${signal.epsSurprisePct.toFixed(1)}% ${beatMiss} (${magnitude} — ${beatMiss === "beat" ? "positive" : "negative"} cascade trigger)`,
    );
    lines.push(
      `- Cascade phase: ${phase} (${hoursStr}h post-report, signal at ${Math.round(computeTimeFactor(signal.hoursSinceReport) * 100)}% strength)`,
    );

    for (const edge of relEdges) {
      const hopLabel = edge.hop === 1 ? "Direct" : "Second-order";
      lines.push(
        `- ${hopLabel} ${edge.directionality} — ${edge.relationship} (edge weight: ${edge.edgeWeight})`,
      );
    }

    // List other affected tickers from same nexus
    const nexus = nexusCompanies.find((n) => n.ticker === signal.nexusTicker);
    if (nexus) {
      const others = nexus.dependents
        .map((d) => d.ticker)
        .filter(
          (t) =>
            !relEdges.some(
              (e) => e.targetTicker.toUpperCase() === t.toUpperCase(),
            ),
        );
      if (others.length > 0) {
        lines.push(
          `- Other affected tickers in this wave: ${others.join(", ")}`,
        );
      }
    }

    lines.push("");
  }

  lines.push(
    `Cascade signal: ${cascadeDirection.toUpperCase()} (cascade_strength: ${cascadeStrength.toFixed(2)})`,
  );

  return lines.join("\n");
}

// ---------- Main Entry Point ----------

/**
 * Detect active earnings cascade affecting a target ticker.
 *
 * @param targetTicker — The ticker being analyzed
 * @param nexusCompanies — Full list of nexus companies (seed list)
 * @param recentEarnings — Map of nexusTicker → earnings data for companies
 *                         that reported within the cascade window
 * @param now — Current time (optional, for testing)
 * @returns CascadeContext if active cascade, null otherwise
 */
export function detectCascade(
  targetTicker: string,
  nexusCompanies: NexusCompany[],
  recentEarnings: Map<string, NexusEarnings>,
  now: Date = new Date(),
): CascadeContext | null {
  // Build signals for nexus companies that reported recently
  const signals: CascadeSignal[] = [];
  const activeNexusTickers = new Set<string>();

  for (const nexus of nexusCompanies) {
    const earnings = recentEarnings.get(nexus.ticker);
    if (!earnings) continue;

    const signal = buildSignal(nexus, earnings, now);
    if (signal) {
      signals.push(signal);
      activeNexusTickers.add(nexus.ticker);
    }
  }

  if (signals.length === 0) return null;

  // Find edges connecting active nexus companies to our target
  const edges = findEdges(targetTicker, nexusCompanies, activeNexusTickers);
  if (edges.length === 0) return null;

  // Compute cascade strength: take the strongest edge × signal combo
  let maxStrength = 0;
  let dominantDirection: "bullish" | "bearish" = "bullish";
  let bestTimeFactor = 0;

  const directionVotes = { bullish: 0, bearish: 0 };

  for (const edge of edges) {
    const signal = signals.find((s) => s.nexusTicker === edge.nexusTicker);
    if (!signal) continue;

    const timeFactor = computeTimeFactor(signal.hoursSinceReport);
    const isMiss = signal.direction === "bearish";
    const strength = computeEdgeCascadeStrength(
      signal.baseImpact,
      edge.edgeWeight,
      edge.hop,
      isMiss,
      timeFactor,
    );

    // For competitive edges, direction may invert (Phase 2 refinement)
    // For now, treat all edges as correlated
    directionVotes[signal.direction] += strength;

    if (strength > maxStrength) {
      maxStrength = strength;
      dominantDirection = signal.direction;
      bestTimeFactor = timeFactor;
    }
  }

  if (maxStrength === 0) return null;

  const cascadeDirection: CascadeContext["cascadeDirection"] =
    directionVotes.bullish > 0 && directionVotes.bearish > 0
      ? "mixed"
      : dominantDirection;

  const promptSection = buildPromptSection(
    signals.filter((s) => edges.some((e) => e.nexusTicker === s.nexusTicker)),
    edges,
    maxStrength,
    cascadeDirection,
    nexusCompanies,
  );

  return {
    signals: signals.filter((s) =>
      edges.some((e) => e.nexusTicker === s.nexusTicker),
    ),
    edges,
    cascadeStrength: maxStrength,
    cascadeDirection,
    timeFactor: bestTimeFactor,
    promptSection,
  };
}
