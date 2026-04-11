import type { AnalysisTimeframe } from "@/lib/utils/chart-timeframes";
import { ANALYSIS_TIMEFRAMES } from "@/lib/utils/chart-timeframes";
import type { IndicatorPatternReport } from "@/lib/utils/indicator-patterns";
import type { ShortInterestData } from "@/lib/services/market-fetcher";
import type { CascadeContext } from "@/lib/utils/cascade-detector";
import type { SignalHierarchyInput } from "@/lib/utils/signal-hierarchy";
import { buildSignalHierarchyPrompt } from "@/lib/utils/signal-hierarchy";

// ---------- System Instruction ----------

export const DEEP_DIVE_SYSTEM_INSTRUCTION = `You are an expert options analyst and educator. Given a whale trade, historical price data, and options chain context, produce a comprehensive deep dive analysis designed for beginner-to-intermediate traders.

Core principles:
1. EDUCATIONAL: Explain every concept in plain language. If you reference a technical term (RSI, IV rank, theta decay, etc.), include a brief explanation a beginner would understand.
2. EVIDENCE-BASED: Ground every claim in the price data, options data, or news context provided. Never fabricate data points.
3. ACTIONABLE: Provide specific entry/exit levels, strike selections, and position sizing guidance.
4. HONEST: Rate your own confidence honestly. Clearly state what you're uncertain about. Most analyses should acknowledge significant uncertainty.
5. RISK-FIRST: Lead with risk assessment. Never minimize downside potential. Prefer defined-risk strategies.
6. CONNECTED: Tie the whale trade to broader market context and global events when relevant.
7. If pre-computed technical indicator patterns are provided, treat them as the primary technical signal source and reconcile any disagreement with your own chart reading transparently.

Technical analysis rules:
- Identify chart patterns only when they are clearly formed (not "emerging" or "potential").
- For each identified pattern, provide the approximate start_time and end_time (matching dates from the historical candle data) and start_price/end_price where the pattern is visible on the chart. For channels, also provide secondary_start_price and secondary_end_price for the opposite boundary.
- Classify each pattern's drawing_type as one of: "trendline" (single diagonal line), "channel" (two parallel lines), "spike_region" (vertical highlighted zone), "marker" (single point annotation), or "none" (cannot be drawn).
- Support/resistance levels should be based on actual price action (recent highs/lows, volume clusters).
- Indicator signals should agree with price action — divergences should be noted.

Options-specific rules:
- High IV favors selling premium (credit spreads, iron condors).
- Low IV favors buying premium (debit spreads, long options).
- Always consider time decay. Recommend expiries that give the thesis enough time to play out.
- Position sizing should never exceed 2-5% of a typical portfolio.
- For greeks_breakdown, explain each Greek in plain English that a beginner would understand. Example: "For every $1 the stock moves up, this option gains approximately $0.45 in value."
- OI walls represent large concentrations of open interest where market-maker hedging may act as magnets or barriers for price. Call OI walls above price act as resistance; put OI walls below act as support.
- Max pain is the price at which option holders lose the most — stocks often gravitate toward max pain near expiration due to market-maker delta hedging.
- The IV-RV spread indicates whether options are over- or under-priced relative to actual stock movement. A spread > 10% means options are expensive (favor credit strategies). A spread < -5% means options are cheap (favor debit strategies).
- GEX (Gamma Exposure) measures how much market makers need to hedge. Positive net GEX means dealers are long gamma and will dampen price moves (mean-reversion environment). Negative net GEX means dealers are short gamma and will amplify price moves (trending environment). The GEX flip level is the price where dealer positioning transitions — above it expect dampened moves, below it expect amplified moves.

Indicator signal labeling rules:
- For the Put/Call Ratio indicator, use the DIRECT reading for the signal field: ratio > 1.0 means more puts than calls = "bearish"; ratio < 1.0 means more calls than puts = "bullish"; ratio ≈ 1.0 = "neutral". You may mention the contrarian interpretation in the explanation, but the signal field must reflect the direct sentiment of the positioning.

Macro awareness rules:
- If VIX context is provided, factor the volatility regime into position sizing and strategy selection. Elevated VIX (>25) means wider expected moves — tighten stops, prefer defined-risk.
- If earnings proximity data is provided and the option expires AFTER earnings, prominently warn about IV crush risk. IV typically drops 30-60% post-earnings.
- During FOMC decision week, expect elevated intraday volatility and potential trend reversals.

Earnings cascade rules:
- When upstream nexus companies (supply chain bellwethers) have recently reported earnings, a cascade context section will be provided. Incorporate this upstream catalyst in your risk assessment and entry/exit timing analysis. Do NOT double-count cascade with the ticker's own earningsRisk.

Always respond with the exact JSON schema provided.`;

// ---------- User Prompt Builder ----------

interface DeepDivePromptInput {
  ticker: string;
  whaleTradeJson: string;
  historicalDataSummary: string;
  historicalDataSummariesByTimeframe?: Partial<
    Record<AnalysisTimeframe, string>
  >;
  optionsChainSummary: string;
  currentPrice: number;
  correlatedEventJson?: string;
  newsContextJson?: string;
  macroContext?: {
    vixLevel?: number | null;
    vixRegime?: string;
    earningsDate?: string | null;
    ivCrushRisk?: string;
    fomcNextDate?: string;
    fomcIsDecisionWeek?: boolean;
  };
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
  };
  computedIndicators?: Partial<
    Record<AnalysisTimeframe, IndicatorPatternReport>
  >;
  shortInterest?: ShortInterestData | null;
  cascadeContext?: CascadeContext | null;
  signalHierarchy?: SignalHierarchyInput | null;
}

function renderIndicatorReport(report: IndicatorPatternReport): string {
  const recentPatterns = report.patterns.slice(0, 8);
  const recentCombinations = report.combinations.slice(0, 5);

  const individualSection =
    recentPatterns.length > 0
      ? recentPatterns
          .map(
            (pattern) =>
              `- [${pattern.signal.toUpperCase()}] ${pattern.name} (${pattern.patternId}) @ candle ${pattern.detectedAt}${pattern.detectedDate ? ` (${pattern.detectedDate})` : ""} — confidence ${Math.round(pattern.confidence * 100)}%\n  ${pattern.description}`,
          )
          .join("\n")
      : "- No clear individual indicator patterns detected.";

  const combinationSection =
    recentCombinations.length > 0
      ? recentCombinations
          .map(
            (combination) =>
              `- [${combination.signal.toUpperCase()}] ${combination.name} (${Math.round(combination.confidence * 100)}%)\n  ${combination.educationalNote}`,
          )
          .join("\n")
      : "- No combination patterns detected.";

  return `Aggregate signal: ${report.aggregateSignal.summary}\nIndividual signals:\n${individualSection}\nCombination signals:\n${combinationSection}`;
}

export function buildDeepDivePrompt(input: DeepDivePromptInput): string {
  let prompt = `Produce a comprehensive deep dive analysis for the following whale trade.

## Whale Trade
${input.whaleTradeJson}

## Current Price
$${input.currentPrice}

## Historical Price Data
${
  input.historicalDataSummariesByTimeframe
    ? ([...ANALYSIS_TIMEFRAMES] as const)
        .filter(
          (timeframe) => input.historicalDataSummariesByTimeframe?.[timeframe],
        )
        .map(
          (timeframe) =>
            `### ${timeframe}${timeframe === "1D" ? " (Intraday — 5-minute candles, today only)" : ""}
${input.historicalDataSummariesByTimeframe?.[timeframe]}`,
        )
        .join("\n\n")
    : input.historicalDataSummary
}

## Options Chain Context
${input.optionsChainSummary}`;

  // Signal Hierarchy — tiered signal framing + enriched data (Epic 46)
  if (input.signalHierarchy) {
    const hierarchySection = buildSignalHierarchyPrompt(input.signalHierarchy);
    if (hierarchySection) {
      prompt += `\n\n${hierarchySection}`;
    }
  }

  if (input.correlatedEventJson) {
    prompt += `

## Correlated News Event
${input.correlatedEventJson}`;
  }

  if (input.newsContextJson) {
    prompt += `

## Additional News Context
${input.newsContextJson}`;
  }

  if (input.macroContext) {
    prompt += `\n\n## Macro Context`;
    if (input.macroContext.vixLevel != null) {
      prompt += `\n- VIX: ${input.macroContext.vixLevel.toFixed(2)} (${input.macroContext.vixRegime ?? "unknown"} regime)`;
    }
    if (input.macroContext.earningsDate) {
      prompt += `\n- Next Earnings: ${input.macroContext.earningsDate.split("T")[0]} (IV Crush Risk: ${input.macroContext.ivCrushRisk ?? "unknown"})`;
    }
    if (input.macroContext.fomcIsDecisionWeek) {
      prompt += `\n- ⚠️ FOMC Decision Week — next meeting: ${input.macroContext.fomcNextDate}`;
    } else if (input.macroContext.fomcNextDate) {
      prompt += `\n- Next FOMC Meeting: ${input.macroContext.fomcNextDate}`;
    }
  }

  if (input.optionsAnalytics) {
    prompt += `\n\n## Options Microstructure`;
    if (input.optionsAnalytics.maxPain != null) {
      prompt += `\n- Max Pain: $${input.optionsAnalytics.maxPain} — the strike where option holders lose the most; stocks often pin near this level at expiration due to market-maker hedging`;
    }
    if (input.optionsAnalytics.oiWalls) {
      const { callWalls, putWalls } = input.optionsAnalytics.oiWalls;
      if (callWalls.length > 0) {
        prompt += `\n- Call OI Walls (Resistance): ${callWalls.map((w) => `$${w.strike} (${w.oi.toLocaleString()} contracts)`).join(", ")}`;
      }
      if (putWalls.length > 0) {
        prompt += `\n- Put OI Walls (Support): ${putWalls.map((w) => `$${w.strike} (${w.oi.toLocaleString()} contracts)`).join(", ")}`;
      }
    }
    if (input.optionsAnalytics.ivRvSpread != null) {
      const spread = input.optionsAnalytics.ivRvSpread;
      const label =
        spread > 0.1
          ? "options are expensive — favor selling premium"
          : spread < -0.05
            ? "options are cheap — favor buying premium"
            : "near fair value";
      prompt += `\n- IV-RV Spread: ${spread > 0 ? "+" : ""}${(spread * 100).toFixed(1)}% (${label})`;
    }
    if (input.optionsAnalytics.realizedVol != null) {
      prompt += `\n- 20-day Realized Volatility: ${(input.optionsAnalytics.realizedVol * 100).toFixed(1)}%`;
    }
    if (input.optionsAnalytics.gex) {
      const g = input.optionsAnalytics.gex;
      const netLabel = g.netGEX >= 0 ? "+" : "";
      const posLabel =
        g.dealerPositioning === "long_gamma"
          ? "dealers long gamma — expect mean-reversion, dampened moves"
          : g.dealerPositioning === "short_gamma"
            ? "dealers short gamma — expect trending, amplified moves"
            : "neutral positioning";
      prompt += `\n- Net GEX: ${netLabel}$${Math.abs(g.netGEX).toLocaleString()} (${posLabel})`;
      if (g.gexFlipLevel != null) {
        prompt += `\n- GEX Flip Level: $${g.gexFlipLevel} — above this price moves are dampened, below they are amplified`;
      }
      if (g.topConcentrations.length > 0) {
        prompt += `\n- Top GEX Concentrations: ${g.topConcentrations.map((c) => `$${c.strike} ($${Math.abs(c.gex).toLocaleString()})`).join(", ")}`;
      }
    }
  }
  if (input.shortInterest) {
    const si = input.shortInterest;
    const siPct = si.shortPercentOfFloat;
    if (siPct != null) {
      const siPctStr = (siPct * 100).toFixed(1);
      const dtc = si.shortRatio != null ? si.shortRatio.toFixed(1) : "N/A";
      const pressure = si.squeezePressure;
      prompt += `\n\n## Short Interest Context`;
      prompt += `\n- Short Interest: ${siPctStr}% of float (${pressure.toUpperCase()} squeeze pressure)`;
      prompt += `\n- Days to Cover: ${dtc} (how many days of average volume needed for all shorts to cover)`;
      if (pressure === "extreme" || pressure === "high") {
        prompt += `\n- Interpretation: A significant portion of this stock's float is held short. If positive catalysts emerge, shorts may be forced to buy back shares rapidly, creating a short squeeze that amplifies upside moves. This also increases overall volatility risk.`;
      } else if (pressure === "moderate") {
        prompt += `\n- Interpretation: Moderate short interest. Noteworthy but not at squeeze-risk levels. Factor into risk assessment as a potential volatility amplifier.`;
      } else {
        prompt += `\n- Interpretation: Low short interest. Short covering is unlikely to materially amplify moves. SI is not a significant factor for this trade.`;
      }
    }
  }
  if (input.computedIndicators) {
    const indicatorSections = (
      Object.entries(input.computedIndicators) as Array<
        [AnalysisTimeframe, IndicatorPatternReport | undefined]
      >
    )
      .filter(([, report]) => report != null)
      .map(
        ([timeframe, report]) =>
          `### ${timeframe}${timeframe === "1D" ? " (Intraday — short-term noise; do NOT let this override macro trend direction from 1M+ timeframes)" : ""}\n${renderIndicatorReport(report!)}`,
      )
      .join("\n\n");

    if (indicatorSections) {
      prompt += `\n\n## Pre-Computed Technical Indicator Analysis\n${indicatorSections}`;
    }
  }

  if (input.cascadeContext && input.cascadeContext.signals.length > 0) {
    prompt += `\n\n## Earnings Cascade Context`;
    prompt += `\n${input.cascadeContext.promptSection}`;
    prompt += `\nIncorporate this upstream catalyst in your risk assessment and entry/exit timing analysis.`;
  }

  prompt += `

Analyze the chart data to identify:
1. Key support and resistance levels from the price action
2. Any clear technical patterns (head & shoulders, double bottom, channels, etc.) — provide these separately for each timeframe in timeframe_patterns. For each pattern, specify the drawing_type, start_time, end_time, start_price, end_price from that timeframe's historical data so patterns can be drawn on the chart. For channels, also specify secondary_start_price and secondary_end_price. Use the exact timestamp/date strings from the candle data for that timeframe.
3. Technical indicator signals (trend, momentum, volatility)
4. How the whale's trade aligns with the technical picture
5. Specific entry/exit strategy with risk management
6. How global events connect to this trade
7. Educational notes explaining key concepts for beginners
8. For greeks_breakdown, provide individual assessments for the most relevant Greeks (delta, gamma, theta, vega) with plain English explanations

Also populate the top-level technical_patterns array as the combined union of all timeframe-specific patterns, and tag every pattern with its timeframe (1D, 1W, 1M, 3M, 6M, or 1Y).

IMPORTANT: 1D (intraday) patterns are for educational context only. They show today's short-term price action and should be labeled as such. If 1D patterns contradict the macro trend (1M+), explicitly note this is short-term noise and the macro trend should dominate directional analysis.

Do not leave 6M or 1Y blank if a dominant long-range trend, range, or channel is visible. For those broader horizons, return at least one primary structure whenever there is enough price history to infer one.

Be specific with price levels. Ground everything in the data provided.`;

  return prompt;
}

// ---------- Gemini Response Schema ----------

export const DEEP_DIVE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    ticker: { type: "string" },
    whale_trade_summary: { type: "string" },
    market_narrative: { type: "string" },
    technical_patterns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["bullish", "bearish", "neutral"] },
          description: { type: "string" },
          confidence: { type: "number" },
          timeframe: {
            type: "string",
            enum: ["1D", "1W", "1M", "3M", "6M", "1Y"],
            nullable: true,
          },
          price_target: { type: "number", nullable: true },
          drawing_type: {
            type: "string",
            enum: ["trendline", "channel", "spike_region", "marker", "none"],
            nullable: true,
          },
          start_time: { type: "string", nullable: true },
          end_time: { type: "string", nullable: true },
          start_price: { type: "number", nullable: true },
          end_price: { type: "number", nullable: true },
          secondary_start_price: { type: "number", nullable: true },
          secondary_end_price: { type: "number", nullable: true },
        },
        required: [
          "name",
          "type",
          "description",
          "confidence",
          "timeframe",
          "drawing_type",
          "start_time",
          "end_time",
          "start_price",
          "end_price",
        ],
      },
    },
    timeframe_patterns: {
      type: "object",
      properties: {
        "1D": {
          type: "array",
          items: { $ref: "#/properties/technical_patterns/items" },
        },
        "1W": {
          type: "array",
          items: { $ref: "#/properties/technical_patterns/items" },
        },
        "1M": {
          type: "array",
          items: { $ref: "#/properties/technical_patterns/items" },
        },
        "3M": {
          type: "array",
          items: { $ref: "#/properties/technical_patterns/items" },
        },
        "6M": {
          type: "array",
          items: { $ref: "#/properties/technical_patterns/items" },
        },
        "1Y": {
          type: "array",
          items: { $ref: "#/properties/technical_patterns/items" },
        },
      },
    },
    support_resistance: {
      type: "array",
      items: {
        type: "object",
        properties: {
          level: { type: "number" },
          type: { type: "string", enum: ["support", "resistance"] },
          strength: { type: "string", enum: ["weak", "moderate", "strong"] },
          note: { type: "string" },
        },
        required: ["level", "type", "strength", "note"],
      },
    },
    indicators: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          value: { type: "string" },
          signal: { type: "string", enum: ["bullish", "bearish", "neutral"] },
          explanation: { type: "string" },
        },
        required: ["name", "value", "signal", "explanation"],
      },
    },
    options_context: {
      type: "object",
      properties: {
        iv_percentile: { type: "string" },
        iv_interpretation: { type: "string" },
        put_call_ratio: { type: "string" },
        unusual_activity_note: { type: "string" },
        greeks_summary: { type: "string" },
        greeks_breakdown: {
          type: "array",
          nullable: true,
          items: {
            type: "object",
            properties: {
              greek: {
                type: "string",
                enum: ["delta", "gamma", "theta", "vega", "rho"],
              },
              value: { type: "string" },
              plain_english: { type: "string" },
              implication: {
                type: "string",
                enum: ["favorable", "neutral", "unfavorable"],
              },
            },
            required: ["greek", "value", "plain_english", "implication"],
          },
        },
      },
      required: [
        "iv_percentile",
        "iv_interpretation",
        "put_call_ratio",
        "unusual_activity_note",
        "greeks_summary",
      ],
    },
    entry_exit: {
      type: "object",
      properties: {
        recommended_option_type: { type: "string" },
        entry_price_range: {
          type: "object",
          properties: {
            low: { type: "number" },
            high: { type: "number" },
          },
          required: ["low", "high"],
        },
        strike_selection: { type: "string" },
        expiry_guidance: { type: "string" },
        profit_target: { type: "string" },
        stop_loss: { type: "string" },
        position_sizing: { type: "string" },
        rationale: { type: "string" },
      },
      required: [
        "recommended_option_type",
        "entry_price_range",
        "strike_selection",
        "expiry_guidance",
        "profit_target",
        "stop_loss",
        "position_sizing",
        "rationale",
      ],
    },
    global_events_connection: { type: "string" },
    risk_assessment: {
      type: "object",
      properties: {
        overall_risk: {
          type: "string",
          enum: ["low", "moderate", "high", "very_high"],
        },
        key_risks: {
          type: "array",
          items: { type: "string" },
        },
        max_recommended_allocation: { type: "string" },
      },
      required: ["overall_risk", "key_risks", "max_recommended_allocation"],
    },
    educational_notes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          term: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["term", "explanation"],
      },
    },
    disclaimer: { type: "string" },
  },
  required: [
    "ticker",
    "whale_trade_summary",
    "market_narrative",
    "technical_patterns",
    "support_resistance",
    "indicators",
    "options_context",
    "entry_exit",
    "global_events_connection",
    "risk_assessment",
    "educational_notes",
    "disclaimer",
  ],
};
