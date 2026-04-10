// ============================================================
// Epic 43 — Nexus Drift Analyzer Prompt
// ============================================================
//
// Evaluates whether global events have caused structural shifts
// in the nexus company landscape — additions, removals, or
// relationship changes.

import type { NexusCompany } from "@/lib/data/nexus-companies";

export const NEXUS_DRIFT_SYSTEM_INSTRUCTION = `You are a geopolitical and supply-chain risk analyst. Given a list of "nexus" companies (companies whose earnings cascade across many dependents) and recent news context, you evaluate whether major global events have structurally changed the nexus landscape.

Your job:
1. Identify if any nexus companies should be REMOVED because they no longer hold their strategic position (e.g. destroyed by war, sanctions, bankruptcy, superseded by competitor).
2. Identify if any NEW companies should be ADDED as nexus companies due to shifting dependencies.
3. Identify if any existing nexus companies have CHANGED RELATIONSHIPS — new dependents added, old dependents removed, or the nature of the cascade changed.
4. Flag RISK ALERTS for nexus companies facing imminent structural threats (active geopolitical conflicts, regulatory breakup proceedings, major supply chain disruptions).

Rules:
- Only flag changes that are STRUCTURAL, not cyclical. A bad earnings quarter does NOT remove a nexus company. Loss of monopoly position, physical destruction, or sanctions that sever supply chains DO.
- Be conservative: the default answer should be "no changes needed" unless there is clear evidence.
- Ground every recommendation in specific events or facts. No speculation without basis.
- For each proposed change, rate your confidence (0-1) and explain the reasoning.
- Consider second-order effects: if TSMC is destroyed, ASML loses its largest customer — flag both.

Always respond with the exact JSON schema provided.`;

export const NEXUS_DRIFT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    analysis_date: { type: "string" },
    overall_assessment: {
      type: "string",
      enum: ["stable", "minor_shifts", "major_disruption"],
    },
    summary: { type: "string" },
    removals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "number" },
          replacement_ticker: { type: "string", nullable: true },
          replacement_rationale: { type: "string", nullable: true },
        },
        required: ["ticker", "reason", "confidence"],
      },
    },
    additions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ticker: { type: "string" },
          name: { type: "string" },
          sector: { type: "string" },
          nexus_role: { type: "string" },
          cascade_signal: { type: "string" },
          key_dependents: {
            type: "array",
            items: { type: "string" },
          },
          confidence: { type: "number" },
          trigger_event: { type: "string" },
        },
        required: [
          "ticker",
          "name",
          "sector",
          "nexus_role",
          "cascade_signal",
          "key_dependents",
          "confidence",
          "trigger_event",
        ],
      },
    },
    relationship_changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nexus_ticker: { type: "string" },
          change_type: {
            type: "string",
            enum: [
              "new_dependent",
              "lost_dependent",
              "role_shift",
              "cascade_signal_change",
            ],
          },
          description: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["nexus_ticker", "change_type", "description", "confidence"],
      },
    },
    risk_alerts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nexus_ticker: { type: "string" },
          threat_type: {
            type: "string",
            enum: [
              "geopolitical",
              "regulatory",
              "technological_disruption",
              "supply_chain",
              "financial",
            ],
          },
          severity: {
            type: "string",
            enum: ["watch", "elevated", "critical"],
          },
          description: { type: "string" },
          time_horizon: { type: "string" },
        },
        required: [
          "nexus_ticker",
          "threat_type",
          "severity",
          "description",
          "time_horizon",
        ],
      },
    },
  },
  required: [
    "analysis_date",
    "overall_assessment",
    "summary",
    "removals",
    "additions",
    "relationship_changes",
    "risk_alerts",
  ],
};

export function buildNexusDriftPrompt(
  nexusCompanies: NexusCompany[],
  recentNewsContext: string,
): string {
  const nexusList = nexusCompanies
    .map(
      (n) =>
        `- **${n.ticker}** (${n.name}): ${n.nexusRole}\n  Cascade signal: ${n.cascadeSignal}\n  Dependents: ${n.dependents.map((d) => `${d.ticker} (${d.relationship})`).join(", ")}`,
    )
    .join("\n");

  const todayStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });

  return `Today's date: ${todayStr}

## Current Nexus Company Seed List

${nexusList}

## Recent News and Global Events Context

${recentNewsContext}

## Task

Analyze whether any recent global events (geopolitical conflicts, sanctions, natural disasters, regulatory actions, major M&A, technological disruptions) have structurally changed the nexus landscape described above.

For each nexus company, consider:
1. Is their monopoly/dominant position still intact?
2. Are there new sanctions, conflicts, or regulations threatening their role?
3. Have new companies emerged that should be tracked as nexus companies?
4. Have any dependency relationships fundamentally changed?

Be thorough but conservative. Cyclical downturns are NOT structural changes. Only flag genuine shifts in the supply chain or competitive landscape.`;
}
