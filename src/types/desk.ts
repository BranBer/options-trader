// Contract between the paper-trading desk (src/lib/desk, /api/desk) and the Desk page.

export type StrategyId =
  | "earnings_iron_fly"
  | "cheap_vol_straddle"
  | "whale_follow"
  | "llm_recommendation"
  | "rec_trend";

/** research: backtest only · paper: forward-testing · live-eligible: passed its pre-registered forward test */
export type StrategyStatus = "research" | "paper" | "live-eligible";

/** agent: single-leg long orders the Robinhood agent account can place · manual-level3: needs multi-leg/short legs */
export type StrategyExecution = "agent" | "manual-level3";

export interface StrategyEvidence {
  /** One sentence a trader can read, with the numbers. */
  summary: string;
  n: number;
  /** Mean return per trade on capital at risk, after the backtest cost model (fraction, 0.03 = +3%). */
  meanAfterCosts: number;
  ci95: [number, number];
  costModel: string;
  verdict: string;
}

export interface ForwardStats {
  closed: number;
  open: number;
  meanRet: number | null;
  winRate: number | null;
  tStat: number | null;
  /** Sum of closed-trade P&L in dollars at one unit per trade. */
  totalPnl: number;
}

export interface LiveCriteria {
  minClosedTrades: number;
  minTStat: number;
  /** Human-readable statement of the full rule, including anything not captured above. */
  rule: string;
}

export interface DeskStrategy {
  id: StrategyId;
  label: string;
  thesis: string;
  execution: StrategyExecution;
  status: StrategyStatus;
  evidence: StrategyEvidence;
  forward: ForwardStats;
  liveCriteria: LiveCriteria;
}

export interface PaperLeg {
  /** OCC ticker, e.g. O:NVDA260515C00215000 */
  occ: string;
  /** +1 long, -1 short */
  side: 1 | -1;
  qty: number;
  cp: "C" | "P";
  strike: number;
  expiry: string;
  entryPrice: number;
  lastPrice: number | null;
}

export interface PaperTradeContext {
  /** Options-implied move to expiry/event as a fraction of the stock price. */
  impliedMove?: number;
  eventDate?: string;
  eventTiming?: "BMO" | "AMC";
  /** Plain-language reason this entry was taken. */
  note?: string;
  /** VIX close on the entry session — the backtest's short-vol edge appeared only when VIX ≥ 22 (one episode). */
  vix?: number;
  /** Reddit attention on the entry session (ApeWisdom). Hype marks crowded, overpriced options, not direction. */
  hype?: { rank: number; mentions: number; mentions24hAgo: number | null };
  /** Jev evidence readings attached at entry — displayed, never used as a probability of profit. */
  jev?: { question: string; answer: string; p?: number }[];
}

export interface PaperTrade {
  id: number;
  strategy: StrategyId;
  ticker: string;
  status: "open" | "closed";
  entryDate: string;
  plannedExit: string;
  exitDate: string | null;
  exitReason: string | null;
  legs: PaperLeg[];
  /** Per-share position value at entry including costs: positive = debit paid, negative = credit received. */
  entryValue: number;
  /** Per-share capital at risk (the debit, or max loss for credit structures). */
  risk: number;
  markValue: number | null;
  /** Per-share P&L including costs; multiply by 100 for dollars per unit. */
  pnl: number | null;
  /** pnl / risk */
  ret: number | null;
  context: PaperTradeContext;
}

export interface DeskRunSummary {
  startedAt: string;
  completedAt: string | null;
  opened: number;
  marked: number;
  closed: number;
  errors: string[];
}

export interface JevCalibrationSummary {
  contextType: string;
  questionId: string;
  n: number;
  hitRate: number | null;
  brier: { jev: number; baseline: number } | null;
}

export interface DeskResponse {
  asOf: string;
  lastRun: DeskRunSummary | null;
  strategies: DeskStrategy[];
  open: PaperTrade[];
  recentClosed: PaperTrade[];
  calibration: JevCalibrationSummary[];
  system: {
    llmPrimary: "claude" | "openrouter";
    claudeModel: string;
    /** ISO time until which Claude is skipped after a usage-limit or auth error, or null. */
    claudeCooldownUntil: string | null;
    lastClaudeError: string | null;
    jevConfigured: boolean;
    unusualWhalesConfigured: boolean;
  };
}
