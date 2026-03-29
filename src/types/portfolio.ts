import { z } from "zod";

// --- Sim Trade Status ---
export const simTradeStatusEnum = z.enum(["open", "closed", "expired"]);
export type SimTradeStatus = z.infer<typeof simTradeStatusEnum>;

// --- Exit Reason ---
export const exitReasonEnum = z.enum([
  "profit_target",
  "stop_loss",
  "time_exit",
  "expiry",
  "manual",
  "insufficient_data",
]);
export type ExitReason = z.infer<typeof exitReasonEnum>;

// --- Strategy Leg ---
export const simLegSchema = z.object({
  action: z.enum(["buy", "sell"]),
  type: z.enum(["call", "put"]),
  strike: z.number(),
  expiry: z.string(),
  premium: z.number(),
  quantity: z.number().int().default(1),
});
export type SimLeg = z.infer<typeof simLegSchema>;

// --- Gemini Trade Decision ---
export const geminiTradeDecisionSchema = z.object({
  should_enter: z.boolean(),
  reasoning: z.string(),
  position_size_dollars: z.number(),
  adjusted_entry: z.object({
    strategy_name: z.string(),
    legs: z.array(simLegSchema),
    net_premium: z.number(), // positive = debit, negative = credit
  }),
  exit_plan: z.object({
    profit_target_pct: z.number(),
    stop_loss_pct: z.number(),
    time_exit_days: z.number().int(),
  }),
  risk_notes: z.array(z.string()),
  educational_summary: z.string(), // plain-English explanation for beginners
});
export type GeminiTradeDecision = z.infer<typeof geminiTradeDecisionSchema>;

// --- Sim Trade (DB row mapped) ---
export interface SimTrade {
  id: number;
  ticker: string;
  optionSymbol: string | null;
  strategyName: string;
  direction: string; // 'bullish' | 'bearish' | 'neutral'
  legs: SimLeg[];
  entryPrice: number; // net premium paid/received
  entryDate: string;
  exitPrice: number | null;
  exitDate: string | null;
  quantity: number;
  pnl: number | null;
  pnlPct: number | null;
  status: SimTradeStatus;
  exitReason: string | null;
  geminiReasoning: GeminiTradeDecision | null;
  profitTargetPct: number | null;
  stopLossPct: number | null;
  timeExitDays: number | null;
  sourceAnalysisId: number | null;
  sourceWhaleId: number | null;
  createdAt: string | null;
}

// --- Portfolio Stats ---
export interface PortfolioStats {
  balance: number;
  startingBalance: number;
  totalPnl: number;
  totalPnlPct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgPnl: number;
  maxDrawdown: number;
  bestTradePnl: number;
  worstTradePnl: number;
  sharpeRatio: number | null;
  openPositions: number;
  lastUpdated: string | null;
}

// --- Equity Curve Point ---
export interface EquityCurvePoint {
  date: string;
  balance: number;
  totalPnl: number;
  openPositions: number;
}

// --- API response shapes ---
export interface PortfolioResponse {
  portfolio: PortfolioStats;
}

export interface PortfolioTradesResponse {
  trades: SimTrade[];
  total: number;
}

export interface EquityCurveResponse {
  snapshots: EquityCurvePoint[];
}

// --- Position Valuation (batch exit monitor) ---
export interface PositionValuation {
  tradeId: number;
  ticker: string;
  currentValue: number;
  pnlPct: number;
  daysHeld: number;
  nearExitThreshold: boolean; // within 80% of any exit trigger
  exitTriggered: boolean;
  exitReason: string | null;
}
