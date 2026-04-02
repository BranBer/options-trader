import type { PortfolioStats } from "@/types/portfolio";

export const MIN_DAY_TRADING_BALANCE = 25_000;
export const DEFAULT_SIM_PORTFOLIO_BALANCE = 30_000;

export function createDefaultPortfolioStats(): PortfolioStats {
  return {
    balance: DEFAULT_SIM_PORTFOLIO_BALANCE,
    startingBalance: DEFAULT_SIM_PORTFOLIO_BALANCE,
    totalPnl: 0,
    totalPnlPct: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    avgPnl: 0,
    maxDrawdown: 0,
    bestTradePnl: 0,
    worstTradePnl: 0,
    sharpeRatio: null,
    openPositions: 0,
    lastUpdated: null,
  };
}
