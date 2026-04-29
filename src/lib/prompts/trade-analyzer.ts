import type { IndicatorPatternReport } from "@/lib/utils/indicator-patterns";
import type { ShortInterestData } from "@/lib/services/market-fetcher";
import type { CascadeContext } from "@/lib/utils/cascade-detector";
import type { DeepDiveSummary } from "@/types/analysis";
import type { InsiderSentiment } from "@/types/insider";
import {
  type SignalScorecard,
  formatScorecardForPrompt,
} from "@/lib/utils/signal-scorecard";
import type { TriggerReport } from "@/lib/utils/trigger-engine";
import { formatTriggerReportForPrompt } from "@/lib/utils/trigger-engine";

// ---------- System Instruction ----------

export const TRADE_ANALYZER_SYSTEM_INSTRUCTION = `You are an independent options trading strategist. Given whale options activity, macro context, technical signals, and deep-dive analysis, you generate a structured trade thesis and recommendation that reflects YOUR OWN evidence-based judgment — not a rubber-stamp of the whale's direction.

Rules:
1. Never guarantee returns. Frame everything as probabilistic analysis.
2. Include risk factors for every recommendation.
3. Prefer defined-risk strategies (spreads, iron condors) over naked options.
4. Factor in current IV rank — high IV favors selling premium, low IV favors buying.
5. Consider the event timeline — is there a catalyst date? Position expiry should account for it.
6. Rate your own confidence honestly. Most recommendations should be 0.3-0.6 range.
7. If VIX is elevated (>25), increase risk weighting, prefer defined-risk spreads, and widen stop-losses. If VIX is low (<15), note that premium is cheap.
8. CRITICAL: If the option expires AFTER an earnings date, warn about IV crush. IV typically drops 30-60% after earnings. Recommend closing positions before earnings or using spread strategies to mitigate.
9. During FOMC decision week (3 days before/after a meeting), expect elevated volatility. Widen stop-losses and prefer straddles/strangles over directional bets.
10. The IV-RV spread indicates whether options are over- or under-priced relative to actual stock movement. A spread > 10% means options are expensive — favor credit strategies (selling premium). A spread < -5% means options are cheap — favor debit strategies (buying premium).
11. OI walls are large concentrations of open interest where market-maker hedging creates price magnets or barriers. Max pain is the price at which open option positions lose the most — price often gravitates here near expiration.
12. CRITICAL: All recommended expiry dates MUST be in the future and at least 7 calendar days from today's date. Never recommend options that have already expired or expire within the next week.
13. If pre-computed technical indicator patterns are provided, use them to adjust your confidence, entry timing, and strategy selection. Strong bullish confluences should support directional bullish trades; conflicting bearish momentum should reduce confidence or push you toward defined-risk structures.
14. CRITICAL — WHALE TIMEFRAME ALIGNMENT: Your recommendation MUST reflect the whale's actual trading horizon. Compute the whale's DTE (days to expiry) from their option's expiry date.
    - Short-term whale (DTE ≤ 7): This is a short-dated, aggressive bet — likely targeting an imminent catalyst. Recommend short-dated strategies (weeklies or 2-3 week expiries). Do NOT recommend 60-90 day expiries for a whale playing a 1-day move. Frame the thesis around immediate price action.
    - Medium-term whale (DTE 8-45): Recommend expiries in a similar window (±2 weeks of the whale's expiry). The whale expects a move within weeks, not months.
    - Long-term whale (DTE > 45): Recommend expiries 60-90+ days out. This whale has a longer-term thesis.
    - Always state the whale's DTE and what timeframe it implies in your thesis. If the whale's option has already expired or expires within 1 day, note this is an extremely aggressive short-term play and the recommended strategy should reflect that urgency.
15. EARNINGS CASCADE: When upstream nexus companies (supply chain bellwethers) have recently reported earnings, a cascade context section will be provided. Use this to adjust your directional confidence (strong upstream beat = bullish tailwind), factor cascade timing into entry recommendation (immediate phase = stronger signal), and note cascade risk in risk factors (e.g. "upstream catalyst may already be priced in if >48h old"). Do NOT double-count cascade with earningsRisk — cascade is about UPSTREAM events, earningsRisk is about THIS ticker's own upcoming earnings.
16. CRITICAL — EVIDENCE HIERARCHY: Form your directional opinion using this evidence hierarchy (most to least weight):
    1. Daily chart triggers (1D level interactions with structure + HTF alignment — when provided with score ≥55, this is the strongest directional signal)
    2. Multi-timeframe technical trend consensus (macro + micro patterns agreeing across timeframes)
    3. Options microstructure (P/C ratio, IV skew, GEX positioning, OI walls)
    4. Deep dive risk assessment and sentiment (when provided)
    5. Macro context (VIX regime, FOMC, earnings proximity)
    6. Short interest and institutional positioning
    7. Whale trade direction (treat as ONE data point, NOT the conclusion)
    If items 1–4 conflict with the whale's direction, your recommendation SHOULD disagree with the whale. State this explicitly in your thesis.
17. CRITICAL — WHALE SKEPTICISM: Do NOT assume the whale is correct. Whale trades may represent:
    - Short covering (buying calls to close a short position — NOT bullish conviction)
    - Portfolio hedging (buying puts as insurance — does NOT mean bearish outlook)
    - Multi-leg strategies where only one leg is visible
    - Institutional rebalancing unrelated to directional views
    Evaluate the whale trade in context of short interest, overall options flow, and your independent technical analysis.
18. CONFLICTING SIGNALS: When technical signals conflict with whale direction:
    - If 4+ bearish patterns and whale is bullish: recommend bearish or neutral strategy. Note the whale disagreement explicitly.
    - If deep dive assessment is "high" or "very_high" risk: reduce confidence by at least 0.1 and prefer defined-risk structures.
    - If short interest is >10% of float and whale buys calls: explicitly discuss short covering probability in the thesis.
    - If ALL signals conflict (patterns, indicators, deep dive, options flow all bearish but whale bullish): recommend the OPPOSITE direction from the whale with a clear explanation of why the evidence overrides the whale signal.
19. NO TRADE SIGNAL: If signals are deeply conflicted with no clear edge, you MAY recommend a "stand aside" / no-trade stance by: setting confidence < 0.15, choosing direction "neutral", and explaining in the thesis that current conditions do not offer a favorable risk/reward. This is a valid recommendation.
20. EXPIRY SELECTION — SIGNAL TIMEFRAME: The pre-computed scorecard provides a "Dominant Signal Timeframe" and suggested expiry range. Base your recommended expiry on the DOMINANT SIGNAL TIMEFRAME, not solely on the whale's expiry:
    - IF the strongest signals are from 1W patterns: recommend 7–14 day expiries
    - IF from 1M patterns: recommend 14–30 day expiries
    - IF from 3M patterns: recommend 30–60 day expiries
    - IF from 6M+ patterns: recommend 60–120 day expiries
    The whale's expiry is a REFERENCE POINT, not a mandate. Balance both the whale DTE (Rule 14) and the signal timeframe (this rule) in your final expiry choice.

Always respond with the exact JSON schema provided.`;

// ---------- User Prompt Builder ----------

export function buildTradeAnalyzerPrompt(
  correlationJson: string,
  ticker: string,
  price: number,
  ivRank: number | undefined,
  avgVolume: number,
  todayVolume: number,
  optionsChainSummary: string,
  macroContext?: {
    vixLevel?: number | null;
    vixRegime?: string;
    earningsDate?: string | null;
    ivCrushRisk?: string;
    fomcNextDate?: string;
    fomcIsDecisionWeek?: boolean;
  },
  optionsAnalytics?: {
    maxPain?: number | null;
    oiWalls?: {
      callWalls: { strike: number; oi: number }[];
      putWalls: { strike: number; oi: number }[];
    } | null;
    ivRvSpread?: number | null;
    realizedVol?: number | null;
    gex?: {
      netGEX: number;
      gexFlipLevel: number | null;
      topConcentrations: { strike: number; gex: number }[];
      dealerPositioning: string;
    } | null;
  },
  sectorRotationContext?: string,
  indicatorReport?: IndicatorPatternReport,
  whaleIntentHint?: string | null,
  indicatorReportsByTimeframe?: Partial<Record<string, IndicatorPatternReport>>,
  shortInterest?: ShortInterestData | null,
  cascadeContext?: CascadeContext | null,
  deepDiveSummary?: DeepDiveSummary | null,
  scorecard?: SignalScorecard | null,
  triggerReport?: TriggerReport | null,
  insiderSentiment?: InsiderSentiment | null,
): string {
  const todayStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  // Extract whale expiry from the correlation to compute DTE
  let whaleDteNote = "";
  try {
    const parsed = JSON.parse(correlationJson);
    const whaleExpiry = parsed?.whale_trade?.expiry;
    if (whaleExpiry) {
      const expiryDate = new Date(whaleExpiry);
      const today = new Date(todayStr);
      if (!Number.isNaN(expiryDate.getTime())) {
        const dte = Math.round(
          (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );
        const horizon =
          dte <= 0
            ? "ALREADY EXPIRED — was an extremely aggressive short-term play"
            : dte <= 7
              ? `${dte} days — SHORT-TERM aggressive bet, likely targeting an imminent catalyst`
              : dte <= 45
                ? `${dte} days — MEDIUM-TERM play, expects a move within weeks`
                : `${dte} days — LONG-TERM thesis`;
        whaleDteNote = `\nWhale DTE (Days to Expiry): ${horizon}\nCRITICAL: Your recommended expiry must align with this whale timeframe. Do NOT recommend 60-90 day expiries for a short-term whale play.`;
      }
    }
  } catch {
    /* correlation may not be valid JSON in edge cases */
  }

  // Determine whale direction from correlation for scorecard/deep dive context
  let whaleDirection: "bullish" | "bearish" | "neutral" = "neutral";
  try {
    const parsedCorr = JSON.parse(correlationJson);
    const sms: string = parsedCorr?.smart_money_signal ?? "";
    if (sms.includes("bullish")) whaleDirection = "bullish";
    else if (sms.includes("bearish")) whaleDirection = "bearish";
  } catch {
    /* ignore */
  }

  // Scorecard block (Story 39.11) — placed at the very top of the prompt
  const scorecardBlock =
    scorecard != null
      ? `${formatScorecardForPrompt(scorecard, whaleDirection)}\n\n`
      : "";

  // Deep dive summary block (Story 39.8) — placed before whale signal
  let deepDiveBlock = "";
  if (deepDiveSummary) {
    const patternLines = deepDiveSummary.keyPatterns
      .map((p) => `  - ${p.name} [${p.signal}]`)
      .join("\n");
    deepDiveBlock = `\nPre-computed Deep Dive Summary (run before this recommendation):
- Overall Sentiment: ${deepDiveSummary.overallSentiment.toUpperCase()}
- Risk Level: ${deepDiveSummary.riskLevel.toUpperCase()}
- Key Patterns:\n${patternLines}
- Support Levels: ${deepDiveSummary.supportLevels.length > 0 ? deepDiveSummary.supportLevels.map((l) => `$${l}`).join(", ") : "none identified"}
- Resistance Levels: ${deepDiveSummary.resistanceLevels.length > 0 ? deepDiveSummary.resistanceLevels.map((l) => `$${l}`).join(", ") : "none identified"}
- IV Assessment: ${deepDiveSummary.ivAssessment}
- Theta Context: ${deepDiveSummary.thetaAnalysis}
This deep dive reflects ALL available technical, options, and macro data for ${ticker}. Use it as a PRIMARY input (Rule 16 — weight #3).`;
  }

  let prompt = `${scorecardBlock}Based on the following whale trade signal and market data, generate a structured trade recommendation.

Today's Date: ${todayStr}
IMPORTANT: All option expiry dates must be after ${todayStr}. Do not recommend expired options.${deepDiveBlock}

Whale Trade Signal:
${correlationJson}${whaleDteNote}

Market Data for ${ticker}:
- Current Price: $${price}
- IV Rank: ${ivRank != null ? `${ivRank}%` : "N/A"}
- 30-day Avg Volume: ${avgVolume.toLocaleString()}
- Today's Volume: ${todayVolume.toLocaleString()}
- Options Chain Snapshot: ${optionsChainSummary}`;

  if (whaleIntentHint) {
    prompt += `\n- Whale Intent Classification: ${whaleIntentHint} (ML-derived signal from broker order flow analysis)`;
  }

  if (shortInterest) {
    const siPct = shortInterest.shortPercentOfFloat;
    if (siPct != null) {
      const siPctStr = (siPct * 100).toFixed(1);
      const dtc =
        shortInterest.shortRatio != null
          ? shortInterest.shortRatio.toFixed(1)
          : "N/A";
      const pressure = shortInterest.squeezePressure;
      let siInterpretation = "";
      if (pressure === "extreme" || pressure === "high") {
        siInterpretation =
          whaleIntentHint === "hedge"
            ? "Heavy short positioning validates the hedge — institution is protecting against a crowded short. Treat this signal with caution."
            : siPct > 0.1
              ? "Crowded short — opposing traders face significant covering pressure if price rises. Adds squeeze fuel to any bullish catalyst."
              : "High short interest — bearish crowd is elevated.";
      } else if (pressure === "moderate") {
        siInterpretation =
          "Moderate short interest — noteworthy but not at squeeze-risk levels.";
      } else {
        siInterpretation =
          "Low short interest — no meaningful squeeze potential from short covering.";
      }
      prompt += `\n- Short Interest: ${siPctStr}% of float (${pressure.toUpperCase()} squeeze pressure)`;
      prompt += `\n- Days to Cover: ${dtc}`;
      prompt += `\n- SI Context: ${siInterpretation}`;
    }
  }

  if (macroContext) {
    if (macroContext.vixLevel != null) {
      prompt += `\n- VIX Level: ${macroContext.vixLevel.toFixed(2)} (Regime: ${macroContext.vixRegime ?? "unknown"})`;
    }
    if (macroContext.earningsDate) {
      prompt += `\n- Earnings Date: ${macroContext.earningsDate.split("T")[0]}`;
      prompt += `\n- IV Crush Risk: ${macroContext.ivCrushRisk ?? "unknown"}`;
    }
    if (macroContext.fomcIsDecisionWeek) {
      prompt += `\n- ⚠️ FOMC Decision Week — next meeting: ${macroContext.fomcNextDate}`;
    } else if (macroContext.fomcNextDate) {
      prompt += `\n- Next FOMC Meeting: ${macroContext.fomcNextDate}`;
    }
  }

  if (optionsAnalytics) {
    if (optionsAnalytics.maxPain != null) {
      prompt += `\n- Max Pain: $${optionsAnalytics.maxPain} (price where option holders lose the most — stocks often gravitate here near expiry)`;
    }
    if (optionsAnalytics.oiWalls) {
      const { callWalls, putWalls } = optionsAnalytics.oiWalls;
      if (callWalls.length > 0) {
        prompt += `\n- Call OI Walls (Resistance): ${callWalls.map((w) => `$${w.strike} (${w.oi.toLocaleString()} contracts)`).join(", ")}`;
      }
      if (putWalls.length > 0) {
        prompt += `\n- Put OI Walls (Support): ${putWalls.map((w) => `$${w.strike} (${w.oi.toLocaleString()} contracts)`).join(", ")}`;
      }
    }
    if (optionsAnalytics.ivRvSpread != null) {
      const spread = optionsAnalytics.ivRvSpread;
      const label =
        spread > 0.1
          ? "options expensive — favor selling premium"
          : spread < -0.05
            ? "options cheap — favor buying premium"
            : "near fair value";
      prompt += `\n- IV-RV Spread: ${spread > 0 ? "+" : ""}${(spread * 100).toFixed(1)}% (${label})`;
    }
    if (optionsAnalytics.realizedVol != null) {
      prompt += `\n- 20-day Realized Volatility: ${(optionsAnalytics.realizedVol * 100).toFixed(1)}%`;
    }
    if (optionsAnalytics.gex != null) {
      const g = optionsAnalytics.gex;
      const gexSign = g.netGEX >= 0 ? "+" : "";
      prompt += `\n- Dealer GEX (Gamma Exposure): ${gexSign}${(g.netGEX / 1e9).toFixed(2)}B — dealers are ${g.dealerPositioning}`;
      if (g.gexFlipLevel != null) {
        prompt += ` | GEX flip level: $${g.gexFlipLevel} (below this, dealers amplify moves instead of damping them)`;
      }
      if (g.topConcentrations.length > 0) {
        prompt += `\n- Top GEX strikes: ${g.topConcentrations
          .slice(0, 3)
          .map((c) => `$${c.strike} (${(c.gex / 1e9).toFixed(2)}B)`)
          .join(", ")}`;
      }
    }
  }

  if (sectorRotationContext) {
    prompt += `\n\n${sectorRotationContext}`;
  }

  // Multi-timeframe indicator signals (Story 39.7)
  const tfReports = indicatorReportsByTimeframe
    ? Object.entries(indicatorReportsByTimeframe)
    : [];
  const hasMultiTf = tfReports.length > 1;

  if (hasMultiTf) {
    prompt += `\n\nTechnical Indicator Signals (Multi-Timeframe):`;
    for (const [tf, report] of tfReports) {
      if (!report) continue;
      const label =
        tf === "1W"
          ? "Short-term (1W)"
          : tf === "1M"
            ? "Medium-term (1M)"
            : `Macro (${tf})`;
      prompt += `\n\n${label}: ${report.aggregateSignal.summary}`;
      const topPatterns = report.patterns.slice(0, 4);
      if (topPatterns.length > 0) {
        prompt += `\n  Patterns: ${topPatterns
          .map(
            (p) => `${p.name} [${p.signal}] ${Math.round(p.confidence * 100)}%`,
          )
          .join("; ")}`;
      }
    }
    prompt += `\n\nUse multi-timeframe alignment for confidence: if short-term and macro signals agree, increase confidence. If they conflict, reduce confidence or prefer defined-risk structures.`;
  } else if (indicatorReport) {
    const topPatterns = indicatorReport.patterns.slice(0, 6);
    const topCombinations = indicatorReport.combinations.slice(0, 4);
    prompt += `\n\nTechnical Indicator Signals:\n- Aggregate: ${indicatorReport.aggregateSignal.summary}`;
    if (topPatterns.length > 0) {
      prompt += `\n- Individual Patterns: ${topPatterns
        .map(
          (pattern) =>
            `${pattern.name} [${pattern.signal}] ${Math.round(pattern.confidence * 100)}%`,
        )
        .join("; ")}`;
    }
    if (topCombinations.length > 0) {
      prompt += `\n- Combination Patterns: ${topCombinations
        .map(
          (combination) =>
            `${combination.name} [${combination.signal}] ${Math.round(combination.confidence * 100)}%`,
        )
        .join("; ")}`;
    }
    prompt += `\n\nUse these computed technical signals in your thesis. Include an optional indicator_analysis object in the response if it helps explain the recommendation.`;
  }

  if (cascadeContext && cascadeContext.signals.length > 0) {
    prompt += `\n\n## Earnings Cascade Context`;
    prompt += `\n${cascadeContext.promptSection}`;
    prompt += `\nFactor this upstream earnings cascade into your thesis and confidence assessment. The cascade signal is ${cascadeContext.cascadeDirection} with strength ${cascadeContext.cascadeStrength.toFixed(2)}.`;
  }

  // Story 48.7 — Daily chart trigger assessment (highest-weight evidence)
  if (triggerReport) {
    const triggerBlock = formatTriggerReportForPrompt(triggerReport);
    if (triggerBlock) {
      prompt += `\n\n${triggerBlock}`;
    }
  }

  if (insiderSentiment) {
    const ins = insiderSentiment;
    const totalTxns = ins.buyCount + ins.sellCount;
    if (totalTxns > 0) {
      const buyPct = Math.round((ins.buyCount / totalTxns) * 100);
      const netValueStr =
        ins.buyValue - ins.sellValue >= 0
          ? `+$${((ins.buyValue - ins.sellValue) / 1e6).toFixed(2)}M net buying`
          : `-$${((ins.sellValue - ins.buyValue) / 1e6).toFixed(2)}M net selling`;
      prompt += `\n\nInsider Activity (last ${ins.periodDays} days): ${ins.sentiment.toUpperCase()}`;
      prompt += `\n- Transactions: ${ins.buyCount} buys / ${ins.sellCount} sells (${buyPct}% buy ratio)`;
      prompt += `\n- Net Flow: ${netValueStr}`;
      if (ins.sentiment === "bullish") {
        prompt += `\n- Signal: Insiders buying their own stock is a strong conviction signal — they rarely buy unless they expect price appreciation. Corroborates any bullish thesis.`;
      } else if (ins.sentiment === "bearish") {
        prompt += `\n- Signal: Net insider selling — may indicate executives distributing shares. Consider as a headwind against bullish setups. Note: insider selling is less definitive than buying (can be estate planning, diversification, etc.).`;
      }
    }
  }

  prompt += `\n\nGenerate a trade recommendation with risk analysis.`;
  return prompt;
}

// ---------- Gemini Response Schema ----------

export const TRADE_ANALYZER_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    ticker: { type: "string" },
    thesis: { type: "string" },
    direction: { type: "string", enum: ["bullish", "bearish", "neutral"] },
    confidence: { type: "number" },
    primary_strategy: {
      type: "object",
      properties: {
        name: { type: "string" },
        legs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["buy", "sell"] },
              type: { type: "string", enum: ["call", "put"] },
              strike: { type: "number" },
              expiry: { type: "string" },
              estimated_premium: { type: "number" },
            },
            required: [
              "action",
              "type",
              "strike",
              "expiry",
              "estimated_premium",
            ],
          },
        },
        max_profit: { type: "string" },
        max_loss: { type: "string" },
        breakeven: { type: "string" },
        risk_reward_ratio: { type: "string" },
      },
      required: [
        "name",
        "legs",
        "max_profit",
        "max_loss",
        "breakeven",
        "risk_reward_ratio",
      ],
    },
    market_context: {
      type: "object",
      properties: {
        iv_assessment: {
          type: "string",
          enum: ["elevated", "normal", "depressed"],
        },
        iv_strategy_note: { type: "string" },
        volume_assessment: {
          type: "string",
          enum: ["unusual_high", "above_average", "normal", "low"],
        },
        catalyst_date: { type: "string", nullable: true },
        days_to_catalyst: { type: "integer", nullable: true },
      },
      required: ["iv_assessment", "iv_strategy_note", "volume_assessment"],
    },
    risk_factors: {
      type: "array",
      items: { type: "string" },
    },
    indicator_analysis: {
      type: "object",
      properties: {
        signals_supporting_thesis: {
          type: "array",
          items: { type: "string" },
        },
        signals_opposing_thesis: {
          type: "array",
          items: { type: "string" },
        },
        impact_on_confidence: { type: "string" },
        impact_on_strategy: { type: "string" },
      },
      required: [
        "signals_supporting_thesis",
        "signals_opposing_thesis",
        "impact_on_confidence",
        "impact_on_strategy",
      ],
    },
    whale_alignment: {
      type: "object",
      properties: {
        matches_whale: { type: "boolean" },
        whale_position_size: { type: "string" },
        similarity_note: { type: "string" },
      },
      required: ["matches_whale", "whale_position_size", "similarity_note"],
    },
    disclaimer: { type: "string" },
  },
  required: [
    "ticker",
    "thesis",
    "direction",
    "confidence",
    "primary_strategy",
    "market_context",
    "risk_factors",
    "whale_alignment",
    "disclaimer",
  ],
};
