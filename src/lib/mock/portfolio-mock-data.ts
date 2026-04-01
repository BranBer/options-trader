/**
 * Mock data for portfolio development & testing.
 * Activated by NEXT_PUBLIC_USE_MOCK_DATA=true
 */
import type {
  SimTrade,
  PortfolioStats,
  EquityCurvePoint,
  TradeDecision,
  SimLeg,
} from "@/types/portfolio";

// ============================================================
// Mock Trades
// ============================================================

const nvdaBullCallSpread: SimTrade = {
  id: 9001,
  ticker: "NVDA",
  optionSymbol: "NVDA250418C00950000",
  strategyName: "Bull Call Spread",
  direction: "bullish",
  legs: [
    {
      action: "buy",
      type: "call",
      strike: 950,
      expiry: "2025-04-18",
      premium: 22.5,
      quantity: 1,
    },
    {
      action: "sell",
      type: "call",
      strike: 980,
      expiry: "2025-04-18",
      premium: 14.0,
      quantity: 1,
    },
  ] as SimLeg[],
  entryPrice: -8.5, // net debit
  entryDate: "2025-03-10T14:32:00Z",
  exitPrice: -18.0,
  exitDate: "2025-03-18T15:45:00Z",
  quantity: 1,
  pnl: 950,
  pnlPct: 111.8,
  status: "closed",
  exitReason: "profit_target",
  geminiReasoning: {
    should_enter: true,
    reasoning:
      "NVDA shows strong bullish momentum following data center revenue guidance beats. The whale alert shows $2.1M in call buying at the 950 strike with 3.2x Vol/OI ratio, confirming institutional conviction. Technical analysis shows price bouncing off the 20-day EMA with MACD crossover. IV rank at 42% makes debit spreads favourable.",
    position_size_dollars: 85,
    adjusted_entry: {
      strategy_name: "Bull Call Spread",
      legs: [
        {
          action: "buy",
          type: "call",
          strike: 950,
          expiry: "2025-04-18",
          premium: 22.5,
          quantity: 1,
        },
        {
          action: "sell",
          type: "call",
          strike: 980,
          expiry: "2025-04-18",
          premium: 14.0,
          quantity: 1,
        },
      ],
      net_premium: 8.5,
    },
    exit_plan: {
      profit_target_pct: 80,
      stop_loss_pct: 50,
      time_exit_days: 14,
    },
    risk_notes: [
      "Earnings on April 23 — exit before IV crush window",
      "Broad market risk from upcoming FOMC meeting",
      "Narrow 30-point spread limits max profit to $2,150 per contract",
    ],
    educational_summary:
      "We're betting NVDA stock will go up. We bought a cheaper call option and sold a more expensive one above it. This limits both our profit and loss. Think of it like renting a section of NVDA's upside between $950 and $980. We paid $8.50 for this 'rent' and can make up to $21.50 if NVDA goes above $980.",
  } as TradeDecision,
  profitTargetPct: 80,
  stopLossPct: 50,
  timeExitDays: 14,
  sourceAnalysisId: 101,
  sourceWhaleId: 201,
  createdAt: "2025-03-10T14:32:00Z",
};

const spyIronCondor: SimTrade = {
  id: 9002,
  ticker: "SPY",
  optionSymbol: "SPY250404P00560000",
  strategyName: "Iron Condor",
  direction: "neutral",
  legs: [
    {
      action: "sell",
      type: "put",
      strike: 560,
      expiry: "2025-04-04",
      premium: 3.2,
      quantity: 1,
    },
    {
      action: "buy",
      type: "put",
      strike: 555,
      expiry: "2025-04-04",
      premium: 2.1,
      quantity: 1,
    },
    {
      action: "sell",
      type: "call",
      strike: 585,
      expiry: "2025-04-04",
      premium: 2.8,
      quantity: 1,
    },
    {
      action: "buy",
      type: "call",
      strike: 590,
      expiry: "2025-04-04",
      premium: 1.6,
      quantity: 1,
    },
  ] as SimLeg[],
  entryPrice: 2.3, // net credit
  entryDate: "2025-03-14T10:15:00Z",
  exitPrice: 0.5,
  exitDate: "2025-03-28T16:00:00Z",
  quantity: 1,
  pnl: 180,
  pnlPct: 78.3,
  status: "closed",
  exitReason: "profit_target",
  geminiReasoning: {
    should_enter: true,
    reasoning:
      "SPY is range-bound between 560 and 585 with VIX at 16.2. Whale activity shows equal put and call selling at these levels, suggesting institutions expect consolidation. Mean reversion after the 3.2% rally makes a neutral strategy optimal. IV rank at 58% favours premium selling.",
    position_size_dollars: 50,
    adjusted_entry: {
      strategy_name: "Iron Condor",
      legs: [
        {
          action: "sell",
          type: "put",
          strike: 560,
          expiry: "2025-04-04",
          premium: 3.2,
          quantity: 1,
        },
        {
          action: "buy",
          type: "put",
          strike: 555,
          expiry: "2025-04-04",
          premium: 2.1,
          quantity: 1,
        },
        {
          action: "sell",
          type: "call",
          strike: 585,
          expiry: "2025-04-04",
          premium: 2.8,
          quantity: 1,
        },
        {
          action: "buy",
          type: "call",
          strike: 590,
          expiry: "2025-04-04",
          premium: 1.6,
          quantity: 1,
        },
      ],
      net_premium: -2.3,
    },
    exit_plan: {
      profit_target_pct: 65,
      stop_loss_pct: 100,
      time_exit_days: 21,
    },
    risk_notes: [
      "FOMC minutes on March 19 could break the range",
      "Maximum loss of $270 if SPY moves sharply in either direction",
      "Theta decay accelerates after day 14 — patience required",
    ],
    educational_summary:
      "We're betting SPY will stay between $560 and $585. We collected premium by selling options on both sides and bought insurance further out. If SPY stays in this range, all options expire worthless and we keep the $2.30 credit. It's like selling insurance on a calm day — we profit from nothing happening.",
  } as TradeDecision,
  profitTargetPct: 65,
  stopLossPct: 100,
  timeExitDays: 21,
  sourceAnalysisId: 102,
  sourceWhaleId: 202,
  createdAt: "2025-03-14T10:15:00Z",
};

const aaplPutCreditSpread: SimTrade = {
  id: 9003,
  ticker: "AAPL",
  optionSymbol: "AAPL250411P00215000",
  strategyName: "Put Credit Spread",
  direction: "bullish",
  legs: [
    {
      action: "sell",
      type: "put",
      strike: 215,
      expiry: "2025-04-11",
      premium: 4.5,
      quantity: 1,
    },
    {
      action: "buy",
      type: "put",
      strike: 210,
      expiry: "2025-04-11",
      premium: 2.8,
      quantity: 1,
    },
  ] as SimLeg[],
  entryPrice: 1.7, // net credit
  entryDate: "2025-03-20T11:00:00Z",
  exitPrice: 3.4,
  exitDate: "2025-03-26T14:30:00Z",
  quantity: 1,
  pnl: -170,
  pnlPct: -100,
  status: "closed",
  exitReason: "stop_loss",
  geminiReasoning: {
    should_enter: true,
    reasoning:
      "AAPL showing support at $215 with heavy put selling by institutions. Whale alert: $1.8M in put selling at 215 strike with bullish sentiment. RSI at 42 suggests oversold conditions. The $215 level aligns with the 50-day SMA and prior consolidation zone.",
    position_size_dollars: 50,
    adjusted_entry: {
      strategy_name: "Put Credit Spread",
      legs: [
        {
          action: "sell",
          type: "put",
          strike: 215,
          expiry: "2025-04-11",
          premium: 4.5,
          quantity: 1,
        },
        {
          action: "buy",
          type: "put",
          strike: 210,
          expiry: "2025-04-11",
          premium: 2.8,
          quantity: 1,
        },
      ],
      net_premium: -1.7,
    },
    exit_plan: {
      profit_target_pct: 60,
      stop_loss_pct: 100,
      time_exit_days: 21,
    },
    risk_notes: [
      "Product event rumours could cause unexpected volatility",
      "Max loss $330 if AAPL drops below $210",
      "China trade tensions are a headline risk for AAPL supply chain",
    ],
    educational_summary:
      "We're betting AAPL stays above $215. We sold an expensive put and bought a cheaper one below it for protection. We collected $1.70 upfront. If AAPL stays above $215, we keep the full credit. The risk is if AAPL drops below $210, where we'd lose up to $3.30. This trade profits from stability or upward movement.",
  } as TradeDecision,
  profitTargetPct: 60,
  stopLossPct: 100,
  timeExitDays: 21,
  sourceAnalysisId: 103,
  sourceWhaleId: 203,
  createdAt: "2025-03-20T11:00:00Z",
};

const tslaLongCall: SimTrade = {
  id: 9004,
  ticker: "TSLA",
  optionSymbol: "TSLA250425C00280000",
  strategyName: "Long Call",
  direction: "bullish",
  legs: [
    {
      action: "buy",
      type: "call",
      strike: 280,
      expiry: "2025-04-25",
      premium: 12.0,
      quantity: 1,
    },
  ] as SimLeg[],
  entryPrice: -12.0,
  entryDate: "2025-03-24T13:45:00Z",
  exitPrice: -12.0,
  exitDate: "2025-03-28T16:00:00Z",
  quantity: 1,
  pnl: 0,
  pnlPct: 0,
  status: "closed",
  exitReason: "time_exit",
  geminiReasoning: {
    should_enter: true,
    reasoning:
      "TSLA breaking out above a 2-week descending wedge pattern on above-average volume. Whale alert shows $3.5M in call buying at 280 strike expiring April 25. Delivery numbers announcement expected April 2 could be the catalyst. IV rank at 35% makes long options relatively cheap.",
    position_size_dollars: 120,
    adjusted_entry: {
      strategy_name: "Long Call",
      legs: [
        {
          action: "buy",
          type: "call",
          strike: 280,
          expiry: "2025-04-25",
          premium: 12.0,
          quantity: 1,
        },
      ],
      net_premium: 12.0,
    },
    exit_plan: {
      profit_target_pct: 100,
      stop_loss_pct: 50,
      time_exit_days: 5,
    },
    risk_notes: [
      "TSLA is highly volatile — single-leg long calls carry full premium risk",
      "Delivery numbers could disappoint, causing sharp drop",
      "Short time horizon makes theta decay significant",
    ],
    educational_summary:
      "We bought a single call option on TSLA betting the stock goes above $280. This is the simplest options trade — we pay $12 upfront (premium) and profit if TSLA rises enough to cover our cost. The most we can lose is the $12 we paid. We set a 5-day time limit because this is a catalyst-driven trade.",
  } as TradeDecision,
  profitTargetPct: 100,
  stopLossPct: 50,
  timeExitDays: 5,
  sourceAnalysisId: 104,
  sourceWhaleId: 204,
  createdAt: "2025-03-24T13:45:00Z",
};

// Open positions
const amdBullCallSpread: SimTrade = {
  id: 9005,
  ticker: "AMD",
  optionSymbol: "AMD250502C00165000",
  strategyName: "Bull Call Spread",
  direction: "bullish",
  legs: [
    {
      action: "buy",
      type: "call",
      strike: 165,
      expiry: "2025-05-02",
      premium: 8.5,
      quantity: 1,
    },
    {
      action: "sell",
      type: "call",
      strike: 180,
      expiry: "2025-05-02",
      premium: 3.2,
      quantity: 1,
    },
  ] as SimLeg[],
  entryPrice: -5.3,
  entryDate: "2025-03-27T10:30:00Z",
  exitPrice: null,
  exitDate: null,
  quantity: 1,
  pnl: null,
  pnlPct: null,
  status: "open",
  exitReason: null,
  geminiReasoning: {
    should_enter: true,
    reasoning:
      "AMD shows institutional accumulation with $4.2M in call buying across 165-180 strikes. The AI chip narrative is strengthening with new partnership announcements. Price is holding above the 200-day SMA at $158 with positive MACD divergence. The bull call spread limits risk while capturing the upside thesis.",
    position_size_dollars: 53,
    adjusted_entry: {
      strategy_name: "Bull Call Spread",
      legs: [
        {
          action: "buy",
          type: "call",
          strike: 165,
          expiry: "2025-05-02",
          premium: 8.5,
          quantity: 1,
        },
        {
          action: "sell",
          type: "call",
          strike: 180,
          expiry: "2025-05-02",
          premium: 3.2,
          quantity: 1,
        },
      ],
      net_premium: 5.3,
    },
    exit_plan: {
      profit_target_pct: 80,
      stop_loss_pct: 50,
      time_exit_days: 30,
    },
    risk_notes: [
      "AMD earnings May 6 could cause post-expiry volatility — exit before",
      "Sector rotation out of tech is a risk if yields spike",
      "Max loss limited to $530 (premium paid)",
    ],
    educational_summary:
      "We're betting AMD goes up over the next month. We bought a call at $165 and sold one at $180 to reduce our cost from $8.50 to $5.30. If AMD reaches $180 by May 2, our spread is worth $15, giving us a profit of $9.70. If AMD stays below $165, we lose our $5.30 investment.",
  } as TradeDecision,
  profitTargetPct: 80,
  stopLossPct: 50,
  timeExitDays: 30,
  sourceAnalysisId: 105,
  sourceWhaleId: 205,
  createdAt: "2025-03-27T10:30:00Z",
};

const metaPutCreditSpread: SimTrade = {
  id: 9006,
  ticker: "META",
  optionSymbol: "META250509P00580000",
  strategyName: "Put Credit Spread",
  direction: "bullish",
  legs: [
    {
      action: "sell",
      type: "put",
      strike: 580,
      expiry: "2025-05-09",
      premium: 11.0,
      quantity: 1,
    },
    {
      action: "buy",
      type: "put",
      strike: 570,
      expiry: "2025-05-09",
      premium: 7.5,
      quantity: 1,
    },
  ] as SimLeg[],
  entryPrice: 3.5, // net credit
  entryDate: "2025-03-28T09:45:00Z",
  exitPrice: null,
  exitDate: null,
  quantity: 1,
  pnl: null,
  pnlPct: null,
  status: "open",
  exitReason: null,
  geminiReasoning: {
    should_enter: true,
    reasoning:
      "META pulled back to the $580 support zone with a high-quality whale alert showing $5.8M in put selling at this level. IV rank at 62% makes credit strategies attractive. The 50-day SMA at $578 provides additional technical support. Ad revenue growth narrative intact following positive industry data.",
    position_size_dollars: 65,
    adjusted_entry: {
      strategy_name: "Put Credit Spread",
      legs: [
        {
          action: "sell",
          type: "put",
          strike: 580,
          expiry: "2025-05-09",
          premium: 11.0,
          quantity: 1,
        },
        {
          action: "buy",
          type: "put",
          strike: 570,
          expiry: "2025-05-09",
          premium: 7.5,
          quantity: 1,
        },
      ],
      net_premium: -3.5,
    },
    exit_plan: {
      profit_target_pct: 50,
      stop_loss_pct: 100,
      time_exit_days: 35,
    },
    risk_notes: [
      "META earnings April 30 — exit before if still open",
      "Regulatory headlines (EU DMA) could cause sharp downside",
      "Max loss $650 if META drops below $570",
    ],
    educational_summary:
      "We're betting META stays above $580. We sold a put at $580 (collecting premium) and bought insurance at $570 in case we're wrong. We received $3.50 upfront. If META stays above $580 by May 9, we keep all of it. The worst case is a $6.50 loss if META drops below $570. This trade profits from META being stable or going up.",
  } as TradeDecision,
  profitTargetPct: 50,
  stopLossPct: 100,
  timeExitDays: 35,
  sourceAnalysisId: 106,
  sourceWhaleId: 206,
  createdAt: "2025-03-28T09:45:00Z",
};

// ============================================================
// All mock trades
// ============================================================

export const MOCK_TRADES: SimTrade[] = [
  nvdaBullCallSpread,
  spyIronCondor,
  aaplPutCreditSpread,
  tslaLongCall,
  amdBullCallSpread,
  metaPutCreditSpread,
];

// ============================================================
// Mock Portfolio Stats
// ============================================================

export const MOCK_PORTFOLIO_STATS: PortfolioStats = {
  balance: 2178,
  startingBalance: 2000,
  totalPnl: 960,
  totalPnlPct: 48.0,
  totalTrades: 4,
  winningTrades: 2,
  losingTrades: 1,
  winRate: 50,
  avgPnl: 240,
  maxDrawdown: 8.5,
  bestTradePnl: 950,
  worstTradePnl: -170,
  sharpeRatio: 1.42,
  openPositions: 2,
  lastUpdated: "2025-03-28T16:00:00Z",
};

// ============================================================
// Mock Equity Curve
// ============================================================

export const MOCK_EQUITY_CURVE: EquityCurvePoint[] = [
  { date: "2025-03-10", balance: 2000, totalPnl: 0, openPositions: 1 },
  { date: "2025-03-12", balance: 2000, totalPnl: 0, openPositions: 1 },
  { date: "2025-03-14", balance: 2000, totalPnl: 0, openPositions: 2 },
  { date: "2025-03-18", balance: 2950, totalPnl: 950, openPositions: 1 },
  { date: "2025-03-20", balance: 2950, totalPnl: 950, openPositions: 2 },
  { date: "2025-03-24", balance: 2950, totalPnl: 950, openPositions: 3 },
  { date: "2025-03-26", balance: 2780, totalPnl: 780, openPositions: 2 },
  { date: "2025-03-28", balance: 2178, totalPnl: 960, openPositions: 2 },
];

// ============================================================
// Mock Confidence Breakdowns (keyed by trade ID)
// ============================================================

const MOCK_CONFIDENCE_BREAKDOWNS: Record<
  number,
  {
    composite: number;
    factors: {
      name: string;
      value: number;
      weight: number;
      contribution: number;
      description: string;
    }[];
  }
> = {
  9001: {
    composite: 0.78,
    factors: [
      {
        name: "AI Correlation",
        value: 0.85,
        weight: 0.25,
        contribution: 0.2125,
        description:
          "Strong correlation between NVDA whale call sweep and AI infrastructure spending news",
      },
      {
        name: "Whale Quality",
        value: 0.92,
        weight: 0.2,
        contribution: 0.184,
        description:
          "Large $2.1M single-leg sweep, 4.2x Volume/OI, near-term expiry",
      },
      {
        name: "Technical Alignment",
        value: 0.7,
        weight: 0.15,
        contribution: 0.105,
        description: "Price above 20-day MA but approaching resistance at $960",
      },
      {
        name: "IV Regime",
        value: 0.55,
        weight: 0.1,
        contribution: 0.055,
        description:
          "IV rank 42nd percentile — moderate, neither cheap nor expensive",
      },
      {
        name: "VIX Regime",
        value: 0.65,
        weight: 0.08,
        contribution: 0.052,
        description:
          "VIX at 16.2 — low fear environment supports bullish thesis",
      },
      {
        name: "Earnings Risk",
        value: 0.8,
        weight: 0.08,
        contribution: 0.064,
        description: "No earnings within 21 days, minimal event risk",
      },
      {
        name: "Insider Alignment",
        value: 0.6,
        weight: 0.07,
        contribution: 0.042,
        description:
          "Mixed insider activity — small sales by CFO, no major buys",
      },
      {
        name: "Sector Momentum",
        value: 0.75,
        weight: 0.07,
        contribution: 0.0525,
        description:
          "Semiconductor sector outperforming S&P 500 by 3.2% over 30 days",
      },
    ],
  },
  9002: {
    composite: 0.71,
    factors: [
      {
        name: "AI Correlation",
        value: 0.6,
        weight: 0.25,
        contribution: 0.15,
        description:
          "Moderate link between SPY iron condor flow and Fed rate decision expectations",
      },
      {
        name: "Whale Quality",
        value: 0.88,
        weight: 0.2,
        contribution: 0.176,
        description:
          "Complex multi-leg order, $850K notional, executed in a single block",
      },
      {
        name: "Technical Alignment",
        value: 0.75,
        weight: 0.15,
        contribution: 0.1125,
        description:
          "SPY in a tight range between 520-530, ideal for iron condor",
      },
      {
        name: "IV Regime",
        value: 0.8,
        weight: 0.1,
        contribution: 0.08,
        description:
          "IV rank 68th percentile — elevated, favorable for premium selling",
      },
      {
        name: "VIX Regime",
        value: 0.5,
        weight: 0.08,
        contribution: 0.04,
        description: "VIX at 18.5 — slightly elevated but not extreme",
      },
      {
        name: "Earnings Risk",
        value: 0.9,
        weight: 0.08,
        contribution: 0.072,
        description: "ETF — no single-stock earnings risk",
      },
      {
        name: "Insider Alignment",
        value: 0.5,
        weight: 0.07,
        contribution: 0.035,
        description: "N/A for ETF",
      },
      {
        name: "Sector Momentum",
        value: 0.5,
        weight: 0.07,
        contribution: 0.035,
        description: "Broad market neutral — supports range-bound thesis",
      },
    ],
  },
  9003: {
    composite: 0.62,
    factors: [
      {
        name: "AI Correlation",
        value: 0.7,
        weight: 0.25,
        contribution: 0.175,
        description:
          "Whale put credit spread on AAPL linked to iPhone supply chain normalization news",
      },
      {
        name: "Whale Quality",
        value: 0.75,
        weight: 0.2,
        contribution: 0.15,
        description: "Moderate sized $500K spread, 2.1x V/OI ratio",
      },
      {
        name: "Technical Alignment",
        value: 0.45,
        weight: 0.15,
        contribution: 0.0675,
        description:
          "AAPL below 50-day MA, bearish setup conflicting with bullish thesis",
      },
      {
        name: "IV Regime",
        value: 0.6,
        weight: 0.1,
        contribution: 0.06,
        description:
          "IV rank 38th percentile — slightly low for premium selling",
      },
      {
        name: "VIX Regime",
        value: 0.65,
        weight: 0.08,
        contribution: 0.052,
        description: "VIX at 15.8 — calm environment",
      },
      {
        name: "Earnings Risk",
        value: 0.4,
        weight: 0.08,
        contribution: 0.032,
        description: "Earnings in 18 days — elevated binary event risk",
      },
      {
        name: "Insider Alignment",
        value: 0.55,
        weight: 0.07,
        contribution: 0.0385,
        description:
          "Tim Cook sold $20M in planned sales — routine, not bearish",
      },
      {
        name: "Sector Momentum",
        value: 0.65,
        weight: 0.07,
        contribution: 0.0455,
        description: "Tech sector in-line with S&P 500",
      },
    ],
  },
  9005: {
    composite: 0.74,
    factors: [
      {
        name: "AI Correlation",
        value: 0.8,
        weight: 0.25,
        contribution: 0.2,
        description:
          "AMD whale calls correlated with MI300X data center GPU orders",
      },
      {
        name: "Whale Quality",
        value: 0.85,
        weight: 0.2,
        contribution: 0.17,
        description: "Aggressive $1.4M OTM call sweep, 5.1x V/OI ratio",
      },
      {
        name: "Technical Alignment",
        value: 0.72,
        weight: 0.15,
        contribution: 0.108,
        description: "Breakout above previous resistance at $165, now support",
      },
      {
        name: "IV Regime",
        value: 0.6,
        weight: 0.1,
        contribution: 0.06,
        description: "IV rank 45th percentile — fair value",
      },
      {
        name: "VIX Regime",
        value: 0.7,
        weight: 0.08,
        contribution: 0.056,
        description: "VIX at 14.5 — risk-on environment",
      },
      {
        name: "Earnings Risk",
        value: 0.85,
        weight: 0.08,
        contribution: 0.068,
        description: "No earnings for 35+ days",
      },
      {
        name: "Insider Alignment",
        value: 0.65,
        weight: 0.07,
        contribution: 0.0455,
        description: "Small insider purchases by VP of Engineering",
      },
      {
        name: "Sector Momentum",
        value: 0.7,
        weight: 0.07,
        contribution: 0.049,
        description: "Semis rotating back into favor after pullback",
      },
    ],
  },
};

// ============================================================
// Mock Source Signals (whale alerts & analyses keyed by trade ID)
// ============================================================

const MOCK_SOURCE_WHALES: Record<
  number,
  {
    id: number;
    ticker: string;
    strike: number | null;
    expiry: string | null;
    callPut: string | null;
    premium: number | null;
    volume: number | null;
    openInterest: number | null;
    underlyingPrice: number | null;
    sentiment: string | null;
    qualityScore: number | null;
    detectedAt: string | null;
  }
> = {
  9001: {
    id: 201,
    ticker: "NVDA",
    strike: 950,
    expiry: "2025-04-18",
    callPut: "C",
    premium: 2100000,
    volume: 8400,
    openInterest: 2000,
    underlyingPrice: 942.5,
    sentiment: "bullish",
    qualityScore: 92,
    detectedAt: "2025-03-10T13:45:00Z",
  },
  9002: {
    id: 202,
    ticker: "SPY",
    strike: 560,
    expiry: "2025-04-04",
    callPut: "P",
    premium: 850000,
    volume: 12000,
    openInterest: 15000,
    underlyingPrice: 572.3,
    sentiment: "bearish",
    qualityScore: 78,
    detectedAt: "2025-03-14T09:55:00Z",
  },
  9003: {
    id: 203,
    ticker: "AAPL",
    strike: 210,
    expiry: "2025-04-11",
    callPut: "P",
    premium: 500000,
    volume: 5200,
    openInterest: 3100,
    underlyingPrice: 218.7,
    sentiment: "bearish",
    qualityScore: 65,
    detectedAt: "2025-03-15T11:20:00Z",
  },
  9005: {
    id: 205,
    ticker: "AMD",
    strike: 175,
    expiry: "2025-05-02",
    callPut: "C",
    premium: 1400000,
    volume: 9800,
    openInterest: 1920,
    underlyingPrice: 168.2,
    sentiment: "bullish",
    qualityScore: 85,
    detectedAt: "2025-03-20T14:10:00Z",
  },
};

const MOCK_SOURCE_ANALYSES: Record<
  number,
  {
    id: number;
    type: string;
    confidence: number | null;
    createdAt: string | null;
  }
> = {
  9001: {
    id: 101,
    type: "trade_recommendation",
    confidence: 0.78,
    createdAt: "2025-03-10T14:00:00Z",
  },
  9002: {
    id: 102,
    type: "trade_recommendation",
    confidence: 0.71,
    createdAt: "2025-03-14T10:00:00Z",
  },
  9003: {
    id: 103,
    type: "trade_recommendation",
    confidence: 0.62,
    createdAt: "2025-03-15T11:30:00Z",
  },
  9005: {
    id: 105,
    type: "trade_recommendation",
    confidence: 0.74,
    createdAt: "2025-03-20T14:20:00Z",
  },
};

// ============================================================
// Helper — get mock data by view
// ============================================================

export function getMockPortfolioOverview() {
  return { portfolio: MOCK_PORTFOLIO_STATS };
}

export function getMockPortfolioTrades(status?: string) {
  let trades = MOCK_TRADES;
  if (status === "open") trades = trades.filter((t) => t.status === "open");
  else if (status === "closed")
    trades = trades.filter((t) => t.status !== "open");
  return { trades, total: trades.length };
}

export function getMockEquityCurve() {
  return { snapshots: MOCK_EQUITY_CURVE };
}

export function getMockPortfolioTrade(id: number) {
  const trade = MOCK_TRADES.find((t) => t.id === id);
  if (!trade) return null;
  const confidenceBreakdown = MOCK_CONFIDENCE_BREAKDOWNS[id] ?? null;
  const sourceWhale = MOCK_SOURCE_WHALES[id] ?? null;
  const sourceAnalysis = MOCK_SOURCE_ANALYSES[id] ?? null;
  return { trade, confidenceBreakdown, sourceWhale, sourceAnalysis };
}
