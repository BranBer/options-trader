import type { StrategyExecution, StrategyId, StrategyStatus } from "@/types/desk";

export const STRATEGY_STATUS_LABEL: Record<StrategyStatus, string> = {
  research: "Research",
  paper: "Paper",
  "live-eligible": "Live-eligible",
};

export const STRATEGY_EXECUTION_LABEL: Record<StrategyExecution, string> = {
  agent: "Agent can place",
  "manual-level3": "Needs Level 3 multi-leg",
};

export const STRATEGY_SHORT_LABEL: Record<StrategyId, string> = {
  earnings_iron_fly: "Earnings iron fly",
  cheap_vol_straddle: "Cheap-vol straddle",
  whale_follow: "Whale copy (control)",
  llm_recommendation: "LLM rec (control)",
  rec_trend: "Rec + trend calls",
};

// Strategies run only to measure the old approach, never candidates for going live.
export const CONTROL_STRATEGY_IDS: StrategyId[] = [
  "whale_follow",
  "llm_recommendation",
];

export const BACKTEST_FINDINGS_PATH = "docs/research/backtest-findings.md";
