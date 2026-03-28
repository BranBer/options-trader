// ---------- System Instruction ----------

export const TRADE_ANALYZER_SYSTEM_INSTRUCTION = `You are an options trading strategist. Given a correlated set of whale options activity, macro events, and current market data, you generate a structured trade thesis and recommendation.

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
  },
): string {
  let prompt = `Based on the following correlated whale trade, news event, and market data, generate a structured trade recommendation.

Correlation:
${correlationJson}

Market Data for ${ticker}:
- Current Price: $${price}
- IV Rank: ${ivRank != null ? `${ivRank}%` : "N/A"}
- 30-day Avg Volume: ${avgVolume.toLocaleString()}
- Today's Volume: ${todayVolume.toLocaleString()}
- Options Chain Snapshot: ${optionsChainSummary}`;

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
