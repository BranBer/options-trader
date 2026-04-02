import { DEFAULT_SIM_PORTFOLIO_BALANCE } from "@/lib/constants/portfolio";

// ---------- System Instruction ----------

export const SIM_TRADE_EVALUATOR_SYSTEM_INSTRUCTION = `You are a portfolio manager for a simulated options trading account with a PDT-compliant balance (around $${DEFAULT_SIM_PORTFOLIO_BALANCE.toLocaleString()}). Your job is to evaluate trade recommendations and decide whether to enter a position — and if so, how to structure it for the current account size.

Rules:
1. CAPITAL PRESERVATION IS PRIORITY #1. Never risk more than 20% of the current balance on a single trade.
2. Prefer defined-risk strategies: vertical spreads, iron condors, debit spreads. Avoid naked options.
3. Keep structures capital-efficient even with a larger balance: prefer defined-risk trades with sensible sizing over oversized single-name bets.
4. Only recommend entry if the risk/reward is genuinely favorable. It's fine to REJECT most trades — quality over quantity.
5. Adjust premiums and strikes to be realistic for current market prices. The recommendation's legs are a starting point — you may modify them.
6. The exit plan must be concrete: profit target %, stop loss %, and maximum days to hold.
7. Factor in commissions implicitly — a trade that makes $5 isn't worth it.
8. If confidence is below 0.4, almost always reject. Between 0.4-0.6, be selective. Above 0.6, still apply judgment.
9. Consider the portfolio's existing positions (if any) — avoid over-concentrating in one sector or direction.
10. EDUCATIONAL REQUIREMENT: The educational_summary must explain the trade in plain English that a beginner could understand. Explain what the strategy does, why it was chosen, and what the risks are. No jargon without explanation.
11. CRITICAL: All option leg expiry dates MUST be in the future. Same-day expiry (0DTE) is only acceptable during regular market hours and before the configured cutoff; otherwise reject it. Prefer at least 3 trading days to expiry when possible.
12. Strike prices must be within a reasonable range of the current stock price. For single-leg trades, stay within 30% OTM. For spreads, the short leg should be within 20% OTM.
13. Verify that premiums are realistic. A $100 stock's ATM monthly call typically costs $3-8. Deep OTM options have very low premiums ($0.05-$0.50). If your estimated premium seems unrealistic, adjust or reject.
14. For multi-leg strategies, ensure all legs share the same expiry date (except calendar spreads). For vertical spreads, verify the buy and sell legs have different strikes but same type (both calls or both puts).

Your response determines whether real (simulated) capital is allocated. Be conservative and thoughtful.`;

// ---------- LLM Response Schema ----------

export const SIM_TRADE_EVALUATOR_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    should_enter: {
      type: "boolean",
      description: "Whether the portfolio should enter this trade",
    },
    reasoning: {
      type: "string",
      description:
        "Detailed reasoning for the decision (2-4 sentences minimum)",
    },
    position_size_dollars: {
      type: "number",
      description:
        "How many dollars to allocate to this trade (0 if rejecting)",
    },
    adjusted_entry: {
      type: "object",
      description:
        "The actual trade structure to execute (adjusted for the current account balance)",
      properties: {
        strategy_name: {
          type: "string",
          description:
            "e.g. 'Bull Call Spread', 'Iron Condor', 'Long Put', etc.",
        },
        legs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["buy", "sell"] },
              type: { type: "string", enum: ["call", "put"] },
              strike: { type: "number" },
              expiry: { type: "string" },
              premium: {
                type: "number",
                description: "Estimated premium per share (not per contract)",
              },
              quantity: { type: "integer", description: "Number of contracts" },
            },
            required: [
              "action",
              "type",
              "strike",
              "expiry",
              "premium",
              "quantity",
            ],
          },
        },
        net_premium: {
          type: "number",
          description:
            "Net cost/credit of opening the position (positive = debit, negative = credit). Per contract, multiplied by 100 shares.",
        },
      },
      required: ["strategy_name", "legs", "net_premium"],
    },
    exit_plan: {
      type: "object",
      properties: {
        profit_target_pct: {
          type: "number",
          description: "Take profit at this % gain (e.g. 50 means +50%)",
        },
        stop_loss_pct: {
          type: "number",
          description: "Cut losses at this % loss (e.g. 30 means -30%)",
        },
        time_exit_days: {
          type: "integer",
          description:
            "Close position after this many days regardless of P&L (to avoid theta decay)",
        },
      },
      required: ["profit_target_pct", "stop_loss_pct", "time_exit_days"],
    },
    risk_notes: {
      type: "array",
      items: { type: "string" },
      description: "Specific risks for this trade",
    },
    educational_summary: {
      type: "string",
      description:
        "Plain-English explanation of the trade for beginners (3-5 sentences). Explain what it does, why, and risks.",
    },
  },
  required: [
    "should_enter",
    "reasoning",
    "position_size_dollars",
    "adjusted_entry",
    "exit_plan",
    "risk_notes",
    "educational_summary",
  ],
};

// ---------- User Prompt Builder ----------

interface SimTradeEvalInput {
  ticker: string;
  currentPrice: number;
  recommendation: {
    thesis: string;
    direction: string;
    confidence: number;
    strategy: {
      name: string;
      legs: Array<{
        action: string;
        type: string;
        strike: number;
        expiry: string;
        estimated_premium: number;
      }>;
      max_loss: string;
      max_profit: string;
      risk_reward_ratio: string;
    };
    risk_factors: string[];
  };
  deepDive?: {
    market_narrative: string;
    risk_level: string;
    entry_exit?: {
      profit_target: string;
      stop_loss: string;
      position_sizing: string;
    };
  };
  compositeConfidence?: number;
  whaleQualityScore?: number;
  portfolioBalance: number;
  openPositions: Array<{
    ticker: string;
    direction: string;
    entryPrice: number;
    currentPnlPct: number;
  }>;
}

export function buildSimTradeEvalPrompt(input: SimTradeEvalInput): string {
  const todayStr = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/New_York",
  });
  let prompt = `Evaluate whether the simulated portfolio should enter the following trade.

## Important Context
- Today's Date: ${todayStr}
- All option expiry dates MUST be after today, unless you are intentionally proposing a same-day (0DTE) trade before the regular-hours cutoff.

## Portfolio State
- Current Balance: $${input.portfolioBalance.toFixed(2)}
- Open Positions: ${input.openPositions.length === 0 ? "None" : ""}`;

  for (const pos of input.openPositions) {
    prompt += `\n  - ${pos.ticker} (${pos.direction}): entry $${pos.entryPrice.toFixed(2)}, current P&L ${pos.currentPnlPct >= 0 ? "+" : ""}${pos.currentPnlPct.toFixed(1)}%`;
  }

  prompt += `\n
## Trade Recommendation
- Ticker: ${input.ticker}
- Current Price: $${input.currentPrice.toFixed(2)}
- Direction: ${input.recommendation.direction}
- Confidence: ${(input.recommendation.confidence * 100).toFixed(0)}%`;

  if (input.compositeConfidence != null) {
    prompt += `\n- Composite Confidence (multi-factor): ${(input.compositeConfidence * 100).toFixed(0)}%`;
  }
  if (input.whaleQualityScore != null) {
    prompt += `\n- Whale Quality Score: ${input.whaleQualityScore}/100`;
  }

  prompt += `\n- Thesis: ${input.recommendation.thesis}
- Strategy: ${input.recommendation.strategy.name}
- Max Profit: ${input.recommendation.strategy.max_profit}
- Max Loss: ${input.recommendation.strategy.max_loss}
- Risk/Reward: ${input.recommendation.strategy.risk_reward_ratio}
- Strategy Legs:`;

  for (const leg of input.recommendation.strategy.legs) {
    prompt += `\n  - ${leg.action.toUpperCase()} ${leg.type.toUpperCase()} $${leg.strike} exp ${leg.expiry} @ $${leg.estimated_premium.toFixed(2)}`;
  }

  prompt += `\n- Risk Factors: ${input.recommendation.risk_factors.join("; ")}`;

  if (input.deepDive) {
    prompt += `\n
## Deep Dive Context
- Market Narrative: ${input.deepDive.market_narrative}
- Overall Risk Level: ${input.deepDive.risk_level}`;
    if (input.deepDive.entry_exit) {
      prompt += `\n- Suggested Profit Target: ${input.deepDive.entry_exit.profit_target}`;
      prompt += `\n- Suggested Stop Loss: ${input.deepDive.entry_exit.stop_loss}`;
      prompt += `\n- Position Sizing Guidance: ${input.deepDive.entry_exit.position_sizing}`;
    }
  }

  prompt += `\n
## Decision Required
Should this trade be entered given the portfolio's current balance and positions? If yes, provide the adjusted trade structure suitable for a ~$${input.portfolioBalance.toFixed(0)} account. Remember: capital preservation first, quality over quantity.`;

  return prompt;
}
