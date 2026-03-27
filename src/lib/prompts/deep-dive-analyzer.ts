// ---------- System Instruction ----------

export const DEEP_DIVE_SYSTEM_INSTRUCTION = `You are an expert options analyst and educator. Given a whale trade, historical price data, and options chain context, produce a comprehensive deep dive analysis designed for beginner-to-intermediate traders.

Core principles:
1. EDUCATIONAL: Explain every concept in plain language. If you reference a technical term (RSI, IV rank, theta decay, etc.), include a brief explanation a beginner would understand.
2. EVIDENCE-BASED: Ground every claim in the price data, options data, or news context provided. Never fabricate data points.
3. ACTIONABLE: Provide specific entry/exit levels, strike selections, and position sizing guidance.
4. HONEST: Rate your own confidence honestly. Clearly state what you're uncertain about. Most analyses should acknowledge significant uncertainty.
5. RISK-FIRST: Lead with risk assessment. Never minimize downside potential. Prefer defined-risk strategies.
6. CONNECTED: Tie the whale trade to broader market context and global events when relevant.

Technical analysis rules:
- Identify chart patterns only when they are clearly formed (not "emerging" or "potential").
- Support/resistance levels should be based on actual price action (recent highs/lows, volume clusters).
- Indicator signals should agree with price action — divergences should be noted.

Options-specific rules:
- High IV favors selling premium (credit spreads, iron condors).
- Low IV favors buying premium (debit spreads, long options).
- Always consider time decay. Recommend expiries that give the thesis enough time to play out.
- Position sizing should never exceed 2-5% of a typical portfolio.

Always respond with the exact JSON schema provided.`;

// ---------- User Prompt Builder ----------

interface DeepDivePromptInput {
  ticker: string;
  whaleTradeJson: string;
  historicalDataSummary: string;
  optionsChainSummary: string;
  currentPrice: number;
  correlatedEventJson?: string;
  newsContextJson?: string;
}

export function buildDeepDivePrompt(input: DeepDivePromptInput): string {
  let prompt = `Produce a comprehensive deep dive analysis for the following whale trade.

## Whale Trade
${input.whaleTradeJson}

## Current Price
$${input.currentPrice}

## Historical Price Data (recent candles)
${input.historicalDataSummary}

## Options Chain Context
${input.optionsChainSummary}`;

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

  prompt += `

Analyze the chart data to identify:
1. Key support and resistance levels from the price action
2. Any clear technical patterns (head & shoulders, double bottom, channels, etc.)
3. Technical indicator signals (trend, momentum, volatility)
4. How the whale's trade aligns with the technical picture
5. Specific entry/exit strategy with risk management
6. How global events connect to this trade
7. Educational notes explaining key concepts for beginners

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
          price_target: { type: "number", nullable: true },
        },
        required: ["name", "type", "description", "confidence"],
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
