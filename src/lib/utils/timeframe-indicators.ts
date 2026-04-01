/**
 * Timeframe-aware technical indicator configuration.
 *
 * Maps chart timeframes to the most relevant indicators:
 * - 1W: Micro indicators (RSI, MACD, Bollinger Bands, 20-SMA)
 * - 1M: Mixed micro/macro (adds 50-SMA, Fibonacci)
 * - 3M: Transition zone (50-SMA, 200-SMA, Fibonacci, MACD)
 * - 6M+: Macro indicators (200-SMA, Fibonacci, Volume Profile)
 */

export type Timeframe = "1W" | "1M" | "3M" | "6M" | "1Y";

export interface IndicatorConfig {
  name: string;
  description: string;
  beginnerExplanation: string;
  timeframes: Timeframe[];
  category: "momentum" | "trend" | "volatility" | "volume";
}

export const INDICATOR_CONFIG: IndicatorConfig[] = [
  {
    name: "RSI",
    description: "Relative Strength Index — measures momentum",
    beginnerExplanation:
      "RSI shows if a stock is overbought (>70) or oversold (<30). Think of it like a spring — stretched too far in either direction tends to snap back.",
    timeframes: ["1W", "1M"],
    category: "momentum",
  },
  {
    name: "MACD",
    description: "Moving Average Convergence Divergence — trend following",
    beginnerExplanation:
      "MACD shows the relationship between two moving averages. When the fast line crosses above the slow line, it's bullish. Crosses below = bearish.",
    timeframes: ["1W", "1M", "3M"],
    category: "trend",
  },
  {
    name: "Bollinger Bands",
    description: "Volatility bands around price",
    beginnerExplanation:
      "Bollinger Bands are like rubber bands around price. When price touches the upper band, it might be overbought. Touches lower band = possibly oversold. Squeeze = low volatility, expect a big move soon.",
    timeframes: ["1W", "1M"],
    category: "volatility",
  },
  {
    name: "20-SMA",
    description: "20-day Simple Moving Average — short-term trend",
    beginnerExplanation:
      "The 20-day average shows the short-term trend. Price above = uptrend. Price below = downtrend.",
    timeframes: ["1W", "1M"],
    category: "trend",
  },
  {
    name: "50-SMA",
    description: "50-day Simple Moving Average — medium-term trend",
    beginnerExplanation:
      "The 50-day average shows the medium-term trend. When 20-day crosses above 50-day (golden cross), it's bullish. Death cross (20 below 50) = bearish.",
    timeframes: ["1M", "3M", "6M"],
    category: "trend",
  },
  {
    name: "200-SMA",
    description: "200-day Simple Moving Average — long-term trend",
    beginnerExplanation:
      "The 200-day average is the big picture trend. Price above 200-SMA = long-term bull market. Below = bear market. Institutions watch this closely.",
    timeframes: ["3M", "6M", "1Y"],
    category: "trend",
  },
  {
    name: "Fibonacci Retracement",
    description: "Key retracement levels (23.6%, 38.2%, 50%, 61.8%)",
    beginnerExplanation:
      'Fibonacci levels are like gravity for price — stocks tend to bounce at these levels (23.6%, 38.2%, 50%, 61.8%) during pullbacks. The 61.8% level is called the "golden ratio" and often acts as strong support.',
    timeframes: ["1M", "3M", "6M", "1Y"],
    category: "trend",
  },
  {
    name: "Volume Profile",
    description: "Volume distribution at price levels",
    beginnerExplanation:
      "Shows where the most trading happened. High volume at a price = strong support/resistance. Low volume areas = price tends to move through quickly.",
    timeframes: ["3M", "6M", "1Y"],
    category: "volume",
  },
];

/**
 * Get the indicators relevant for a given timeframe.
 */
export function getIndicatorsForTimeframe(
  timeframe: Timeframe,
): IndicatorConfig[] {
  return INDICATOR_CONFIG.filter((ind) => ind.timeframes.includes(timeframe));
}

/**
 * Get all unique indicator names across all timeframes.
 */
export function getAllIndicatorNames(): string[] {
  return [...new Set(INDICATOR_CONFIG.map((ind) => ind.name))];
}
