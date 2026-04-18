/**
 * Signal Hierarchy — structures all analysis signals into actionability tiers
 * for the LLM prompt.
 *
 * Tier 1 (Primary / Actionable): Structure-based signals that define the trade thesis.
 *   Volume profile levels, algorithmic S/R with high confluence, options positioning,
 *   catalysts/earnings, GEX regime.
 *
 * Tier 2 (Confirming): Momentum/trend signals that confirm or challenge Tier 1.
 *   MACD, RSI, EMA crosses, indicator pattern combinations.
 *
 * Tier 3 (Context Only): Background environment data. Do NOT base entries on these alone.
 *   Bollinger width, volume SMA ratio, VIX level, short interest.
 *
 * The hierarchy is injected as a structured preamble in the LLM prompt so the model
 * knows which signals to weight most heavily.
 */

import type { VolumeProfile } from "./volume-profile";
import { formatVolumeProfileForPrompt } from "./volume-profile";
import type { AlgoSRLevel } from "./algo-sr";
import { formatAlgoSRForPrompt } from "./algo-sr";
import type { IVSkew, OISummary } from "./options-analytics";
import { formatEnhancedOptionsForPrompt } from "./options-analytics";
import type { CatalystSummary } from "./economic-calendar";
import { formatCatalystsForPrompt } from "./economic-calendar";

export interface SignalHierarchyInput {
  volumeProfile?: VolumeProfile | null;
  algoSR?: AlgoSRLevel[] | null;
  currentPrice?: number;
  ivSkew?: IVSkew | null;
  oiSummary?: OISummary | null;
  catalysts?: CatalystSummary | null;
  earningsDate?: string | null;
}

/**
 * Build the tiered signal hierarchy section for the deep-dive LLM prompt.
 * Returns empty string if no enriched data is available.
 */
export function buildSignalHierarchyPrompt(
  input: SignalHierarchyInput,
): string {
  const sections: string[] = [];

  // Preamble — instruct the LLM on signal weighting
  sections.push(`## Signal Hierarchy — How to Weight These Signals

The data below is organized by actionability. Follow these rules strictly:
- **Tier 1 (Primary)**: These define the trade thesis. Entry/exit levels, position sizing, and directional bias should be grounded in Tier 1 data.
- **Tier 2 (Confirming)**: Use ONLY to confirm or challenge a Tier 1 thesis. A Tier 2 signal alone is NEVER sufficient for an entry recommendation.
- **Tier 3 (Context)**: Background information only. Mention in narrative but do NOT base trade decisions on Tier 3 signals alone.

⚠️ DO NOT recommend entry/exit based solely on indicator crossovers (RSI, MACD, EMA). These are Tier 2 confirming signals only.`);

  // Tier 1 — Primary / Actionable
  const tier1Parts: string[] = [];

  if (input.volumeProfile && input.currentPrice != null) {
    tier1Parts.push(
      `### Volume Profile\n${formatVolumeProfileForPrompt(input.volumeProfile, input.currentPrice)}`,
    );
  }

  if (input.algoSR && input.algoSR.length > 0 && input.currentPrice != null) {
    tier1Parts.push(
      `### Algorithmic Support/Resistance\n${formatAlgoSRForPrompt(input.algoSR, input.currentPrice)}`,
    );
  }

  if ((input.ivSkew || input.oiSummary) && input.currentPrice != null) {
    tier1Parts.push(
      `### Enhanced Options Context\n${formatEnhancedOptionsForPrompt(input.ivSkew ?? null, input.oiSummary ?? null, input.currentPrice)}`,
    );
  }

  if (input.catalysts) {
    tier1Parts.push(
      `### Catalyst Calendar\n${formatCatalystsForPrompt(input.catalysts, input.earningsDate)}`,
    );
  }

  if (tier1Parts.length > 0) {
    sections.push(
      `### 🟢 TIER 1 — Primary Signals (Define the thesis)\n\n${tier1Parts.join("\n\n")}`,
    );
  }

  // Tier 2 and 3 are already in the prompt via existing indicator reports
  // and macro context sections. Add a reminder label for them.
  sections.push(`### 🟡 TIER 2 — Confirming Signals
The "Pre-Computed Technical Indicator Analysis" section below contains Tier 2 signals (MACD, RSI, EMA, OBV). Use them to confirm Tier 1 thesis only.`);

  sections.push(`### ⚪ TIER 3 — Context Only
The "Macro Context", "Short Interest Context", and Bollinger Band width from indicators are Tier 3. Mention in narrative but do not trade on them alone.`);

  return sections.join("\n\n");
}
