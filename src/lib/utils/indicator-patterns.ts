import {
  bollingerBands,
  ema,
  macd,
  rsi,
  volumeSMA,
  type Candle,
} from "@/lib/utils/technical-indicators";
import type { AnalysisTimeframe } from "@/types/analysis";

export type IndicatorSignal = "bullish" | "bearish" | "neutral";

export interface IndicatorPattern {
  indicator: "ema" | "bollinger" | "rsi" | "macd" | "volume";
  name: string;
  patternId: string;
  signal: IndicatorSignal;
  confidence: number;
  detectedAt: number;
  detectedDate?: string;
  description: string;
  isRecent: boolean;
  metadata?: Record<string, number | string | null>;
}

export interface CombinationPattern {
  name: string;
  patternId: string;
  signal: IndicatorSignal;
  confidence: number;
  description: string;
  constituentPatternIds: string[];
  educationalNote: string;
}

export interface IndicatorPatternReport {
  ticker?: string;
  timeframe?: AnalysisTimeframe | string;
  patterns: IndicatorPattern[];
  combinations: CombinationPattern[];
  aggregateSignal: {
    direction: IndicatorSignal;
    strength: number;
    summary: string;
  };
  computedAt: string;
}

interface SeriesInput {
  candles: Candle[];
  closes: number[];
}

interface EmaPatternInput extends SeriesInput {
  ema9: (number | null)[];
  ema21: (number | null)[];
}

interface BollingerPatternInput extends SeriesInput {
  bands: ReturnType<typeof bollingerBands>;
}

interface RsiPatternInput extends SeriesInput {
  values: (number | null)[];
}

interface MacdPatternInput extends SeriesInput {
  values: ReturnType<typeof macd>;
}

interface VolumePatternInput extends SeriesInput {
  volumeMa: (number | null)[];
}

const RECENT_CANDLES = 5;
const DIVERGENCE_LOOKBACK = 25;

function toIsoDate(time: string | number): string {
  if (typeof time === "string") {
    const parsed = new Date(time);
    return Number.isNaN(parsed.getTime()) ? time : parsed.toISOString();
  }

  // Candle timestamps may be unix seconds (from intraday data) — convert to ms
  const ms = time < 1e12 ? time * 1000 : time;
  const parsed = new Date(ms);
  return Number.isNaN(parsed.getTime()) ? String(time) : parsed.toISOString();
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function latestIndexWithValue<T>(values: (T | null | undefined)[]): number {
  for (let index = values.length - 1; index >= 0; index--) {
    if (values[index] != null) return index;
  }
  return -1;
}

function isRecentIndex(length: number, index: number): boolean {
  return index >= Math.max(0, length - RECENT_CANDLES);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * p)),
  );
  return sorted[index];
}

function findPivotPoints(
  values: (number | null)[],
  kind: "low" | "high",
  lookback = 2,
  startIndex = 0,
): Array<{ index: number; value: number }> {
  const pivots: Array<{ index: number; value: number }> = [];
  for (
    let index = Math.max(startIndex, lookback);
    index < values.length - lookback;
    index++
  ) {
    const current = values[index];
    if (current == null) continue;

    let pivot = true;
    for (let offset = 1; offset <= lookback; offset++) {
      const left = values[index - offset];
      const right = values[index + offset];
      if (left == null || right == null) {
        pivot = false;
        break;
      }

      if (kind === "low") {
        if (!(current <= left && current <= right)) {
          pivot = false;
          break;
        }
      } else if (!(current >= left && current >= right)) {
        pivot = false;
        break;
      }
    }

    if (pivot) {
      pivots.push({ index, value: current });
    }
  }

  return pivots;
}

function buildPattern(
  candles: Candle[],
  pattern: Omit<IndicatorPattern, "isRecent" | "detectedDate">,
): IndicatorPattern {
  return {
    ...pattern,
    detectedDate: candles[pattern.detectedAt]
      ? toIsoDate(candles[pattern.detectedAt].time)
      : undefined,
    isRecent: isRecentIndex(candles.length, pattern.detectedAt),
  };
}

export function detectEMAPatterns(input: EmaPatternInput): IndicatorPattern[] {
  const patterns: IndicatorPattern[] = [];
  const { candles, closes, ema9, ema21 } = input;
  if (closes.length < 21 || ema9.length < 21 || ema21.length < 21) {
    return patterns;
  }
  const length = Math.min(
    closes.length,
    ema9.length,
    ema21.length,
    candles.length,
  );

  for (let index = 1; index < length; index++) {
    const prev9 = ema9[index - 1];
    const prev21 = ema21[index - 1];
    const current9 = ema9[index];
    const current21 = ema21[index];
    if (
      !isFiniteNumber(prev9) ||
      !isFiniteNumber(prev21) ||
      !isFiniteNumber(current9) ||
      !isFiniteNumber(current21)
    ) {
      continue;
    }

    if (prev9 <= prev21 && current9 > current21) {
      patterns.push(
        buildPattern(candles, {
          indicator: "ema",
          name: "EMA 9 / EMA 21 Golden Cross",
          patternId: "ema_golden_cross",
          signal: "bullish",
          confidence: clampConfidence(
            0.72 +
              Math.min(
                0.22,
                (Math.abs(current9 - current21) / Math.max(1, closes[index])) *
                  12,
              ),
          ),
          detectedAt: index,
          description:
            "The fast EMA moved above the slower EMA, showing short-term momentum has flipped higher than the medium-term trend.",
          metadata: {
            ema9: current9,
            ema21: current21,
            spread: current9 - current21,
            seriesLength: candles.length,
          },
        }),
      );
    }

    if (prev9 >= prev21 && current9 < current21) {
      patterns.push(
        buildPattern(candles, {
          indicator: "ema",
          name: "EMA 9 / EMA 21 Death Cross",
          patternId: "ema_death_cross",
          signal: "bearish",
          confidence: clampConfidence(
            0.72 +
              Math.min(
                0.22,
                (Math.abs(current21 - current9) / Math.max(1, closes[index])) *
                  12,
              ),
          ),
          detectedAt: index,
          description:
            "The fast EMA moved below the slower EMA, showing short-term momentum has weakened beneath the medium-term trend.",
          metadata: {
            ema9: current9,
            ema21: current21,
            spread: current9 - current21,
            seriesLength: candles.length,
          },
        }),
      );
    }
  }

  const last = latestIndexWithValue(ema21);
  if (last >= 0 && last >= 2) {
    const recentCloses = closes.slice(Math.max(0, last - 2), last + 1);
    const recentEma9 = ema9.slice(Math.max(0, last - 2), last + 1);
    const recentEma21 = ema21.slice(Math.max(0, last - 2), last + 1);
    const allAbove = recentCloses.every((value, idx) => {
      const line9 = recentEma9[idx];
      const line21 = recentEma21[idx];
      return (
        isFiniteNumber(line9) &&
        isFiniteNumber(line21) &&
        value > line9 &&
        value > line21
      );
    });
    const allBelow = recentCloses.every((value, idx) => {
      const line9 = recentEma9[idx];
      const line21 = recentEma21[idx];
      return (
        isFiniteNumber(line9) &&
        isFiniteNumber(line21) &&
        value < line9 &&
        value < line21
      );
    });

    if (allAbove) {
      patterns.push(
        buildPattern(candles, {
          indicator: "ema",
          name: "EMA Bullish Alignment",
          patternId: "ema_bullish_alignment",
          signal: "bullish",
          confidence: 0.66,
          detectedAt: last,
          description:
            "Price has remained above both the fast and medium EMAs for several candles, confirming short- and medium-term trend alignment.",
          metadata: { seriesLength: candles.length },
        }),
      );
    }

    if (allBelow) {
      patterns.push(
        buildPattern(candles, {
          indicator: "ema",
          name: "EMA Bearish Alignment",
          patternId: "ema_bearish_alignment",
          signal: "bearish",
          confidence: 0.66,
          detectedAt: last,
          description:
            "Price has remained below both the fast and medium EMAs for several candles, confirming downside trend alignment.",
          metadata: { seriesLength: candles.length },
        }),
      );
    }

    const gapNow =
      ema9[last] != null && ema21[last] != null
        ? Math.abs(ema9[last]! - ema21[last]!)
        : null;
    const gapPastIndex = Math.max(0, last - 5);
    const gapPast =
      ema9[gapPastIndex] != null && ema21[gapPastIndex] != null
        ? Math.abs(ema9[gapPastIndex]! - ema21[gapPastIndex]!)
        : null;
    if (gapNow != null && gapPast != null && gapPast > 0) {
      if (gapNow > gapPast * 1.2) {
        patterns.push(
          buildPattern(candles, {
            indicator: "ema",
            name: "EMA Fanning",
            patternId: "ema_fanning_bullish",
            signal: ema9[last]! > ema21[last]! ? "bullish" : "bearish",
            confidence: clampConfidence(
              0.55 + Math.min(0.25, (gapNow / gapPast - 1) * 0.4),
            ),
            detectedAt: last,
            description:
              "The gap between EMA 9 and EMA 21 is widening, showing that the trend is gaining separation and conviction.",
            metadata: {
              gapNow,
              gapPast,
              seriesLength: candles.length,
            },
          }),
        );
      } else if (gapNow < gapPast * 0.8) {
        patterns.push(
          buildPattern(candles, {
            indicator: "ema",
            name: "EMA Compression",
            patternId: "ema_compression",
            signal: "neutral",
            confidence: clampConfidence(
              0.58 + Math.min(0.18, (1 - gapNow / gapPast) * 0.35),
            ),
            detectedAt: last,
            description:
              "The fast and medium EMAs are converging, which often happens before a trend change or breakout.",
            metadata: {
              gapNow,
              gapPast,
              seriesLength: candles.length,
            },
          }),
        );
      }
    }
  }

  return patterns;
}

export function detectBollingerPatterns(
  input: BollingerPatternInput,
): IndicatorPattern[] {
  const patterns: IndicatorPattern[] = [];
  const { candles, closes, bands } = input;
  if (closes.length < 20) {
    return patterns;
  }
  const bandwidth = bands.middle.map((middle, index) => {
    const upper = bands.upper[index];
    const lower = bands.lower[index];
    if (
      !isFiniteNumber(middle) ||
      !isFiniteNumber(upper) ||
      !isFiniteNumber(lower) ||
      middle === 0
    ) {
      return null;
    }
    return (upper - lower) / Math.abs(middle);
  });

  const validBandwidths = bandwidth.filter((value): value is number =>
    isFiniteNumber(value),
  );
  const squeezeThreshold =
    validBandwidths.length > 0 ? percentile(validBandwidths, 0.2) : null;
  const last = latestIndexWithValue(bands.middle);

  if (squeezeThreshold != null) {
    for (let index = 1; index < bandwidth.length; index++) {
      const current = bandwidth[index];
      const previous = bandwidth[index - 1];
      if (!isFiniteNumber(current)) continue;
      const enteredSqueeze =
        current <= squeezeThreshold * 1.1 &&
        (!isFiniteNumber(previous) || previous > squeezeThreshold * 1.1);
      if (!enteredSqueeze) continue;

      patterns.push(
        buildPattern(candles, {
          indicator: "bollinger",
          name: "Bollinger Band Squeeze",
          patternId: "bb_squeeze",
          signal: "neutral",
          confidence: clampConfidence(
            0.64 +
              Math.min(
                0.16,
                (squeezeThreshold - current) /
                  Math.max(0.0001, squeezeThreshold),
              ),
          ),
          detectedAt: index,
          description:
            "The bands are unusually tight, showing volatility compression and a higher chance of a larger move soon.",
          metadata: {
            bandwidth: current,
            threshold: squeezeThreshold,
            seriesLength: candles.length,
          },
        }),
      );
    }
  }

  for (let index = 1; index < closes.length; index++) {
    const upper = bands.upper[index];
    const lower = bands.lower[index];
    const prevUpper = bands.upper[index - 1];
    const prevLower = bands.lower[index - 1];
    if (
      !isFiniteNumber(upper) ||
      !isFiniteNumber(lower) ||
      !isFiniteNumber(prevUpper) ||
      !isFiniteNumber(prevLower)
    )
      continue;

    if (closes[index] > upper && closes[index - 1] <= prevUpper) {
      patterns.push(
        buildPattern(candles, {
          indicator: "bollinger",
          name: "Bollinger Band Breakout",
          patternId: "bb_breakout_bullish",
          signal: "bullish",
          confidence: 0.74,
          detectedAt: index,
          description:
            "Price closed above the upper band, indicating upside volatility expansion and strong momentum.",
          metadata: { upper, lower, seriesLength: candles.length },
        }),
      );
    }

    if (closes[index] < lower && closes[index - 1] >= prevLower) {
      patterns.push(
        buildPattern(candles, {
          indicator: "bollinger",
          name: "Bollinger Band Breakdown",
          patternId: "bb_breakout_bearish",
          signal: "bearish",
          confidence: 0.74,
          detectedAt: index,
          description:
            "Price closed below the lower band, indicating downside volatility expansion and strong downside momentum.",
          metadata: { upper, lower, seriesLength: candles.length },
        }),
      );
    }

    const window = closes.slice(Math.max(0, index - 2), index + 1);
    const windowUpper = bands.upper.slice(Math.max(0, index - 2), index + 1);
    const windowLower = bands.lower.slice(Math.max(0, index - 2), index + 1);
    const walkUpper =
      window.length === 3 &&
      window.every(
        (value, subIndex) =>
          isFiniteNumber(windowUpper[subIndex]) &&
          value >= windowUpper[subIndex]!,
      );
    const walkLower =
      window.length === 3 &&
      window.every(
        (value, subIndex) =>
          isFiniteNumber(windowLower[subIndex]) &&
          value <= windowLower[subIndex]!,
      );

    if (walkUpper) {
      patterns.push(
        buildPattern(candles, {
          indicator: "bollinger",
          name: "Upper Band Walk",
          patternId: "bb_walk_upper",
          signal: "bullish",
          confidence: 0.63,
          detectedAt: index,
          description:
            "Price has spent several candles pressing the upper band, which often means the trend is strong and persistent.",
          metadata: { seriesLength: candles.length },
        }),
      );
    }

    if (walkLower) {
      patterns.push(
        buildPattern(candles, {
          indicator: "bollinger",
          name: "Lower Band Walk",
          patternId: "bb_walk_lower",
          signal: "bearish",
          confidence: 0.63,
          detectedAt: index,
          description:
            "Price has spent several candles pressing the lower band, which often means the downtrend is persistent.",
          metadata: { seriesLength: candles.length },
        }),
      );
    }

    const prevClose = closes[index - 1];
    const middle = bands.middle[index];
    if (isFiniteNumber(middle)) {
      const touchedUpper =
        closes[index - 1] >= prevUpper &&
        closes[index] < upper &&
        closes[index] < prevClose;
      const touchedLower =
        closes[index - 1] <= prevLower &&
        closes[index] > lower &&
        closes[index] > prevClose;

      if (touchedUpper) {
        patterns.push(
          buildPattern(candles, {
            indicator: "bollinger",
            name: "Upper Band Mean Reversion",
            patternId: "bb_mean_reversion_bearish",
            signal: "bearish",
            confidence: 0.61,
            detectedAt: index,
            description:
              "Price touched the upper band and started to roll back inside the envelope, suggesting the move may be stretched.",
            metadata: { middle, seriesLength: candles.length },
          }),
        );
      }

      if (touchedLower) {
        patterns.push(
          buildPattern(candles, {
            indicator: "bollinger",
            name: "Lower Band Mean Reversion",
            patternId: "bb_mean_reversion_bullish",
            signal: "bullish",
            confidence: 0.61,
            detectedAt: index,
            description:
              "Price touched the lower band and started to recover toward the middle band, suggesting a rebound setup.",
            metadata: { middle, seriesLength: candles.length },
          }),
        );
      }
    }
  }

  return patterns;
}

export function detectRSIPatterns(input: RsiPatternInput): IndicatorPattern[] {
  const patterns: IndicatorPattern[] = [];
  const { candles, closes, values } = input;
  if (closes.length < 15 || values.length < 15) {
    return patterns;
  }
  const length = Math.min(closes.length, values.length, candles.length);
  const validIndices = values
    .map((value, index) => (value != null ? index : -1))
    .filter((index) => index >= 0);

  for (const index of validIndices) {
    const current = values[index];
    const prev = index > 0 ? values[index - 1] : null;
    if (!isFiniteNumber(current)) continue;

    if (current >= 70 && (!isFiniteNumber(prev) || prev < 70)) {
      patterns.push(
        buildPattern(candles, {
          indicator: "rsi",
          name: "RSI Overbought",
          patternId: "rsi_overbought",
          signal: "bearish",
          confidence: clampConfidence(
            0.58 + Math.min(0.22, (current - 70) / 25),
          ),
          detectedAt: index,
          description:
            "RSI has entered overbought territory, showing momentum may be stretched and vulnerable to a pullback.",
          metadata: { rsi: current, seriesLength: candles.length },
        }),
      );
    }

    if (current <= 30 && (!isFiniteNumber(prev) || prev > 30)) {
      patterns.push(
        buildPattern(candles, {
          indicator: "rsi",
          name: "RSI Oversold",
          patternId: "rsi_oversold",
          signal: "bullish",
          confidence: clampConfidence(
            0.58 + Math.min(0.22, (30 - current) / 25),
          ),
          detectedAt: index,
          description:
            "RSI has entered oversold territory, showing selling pressure may be stretched and vulnerable to a bounce.",
          metadata: { rsi: current, seriesLength: candles.length },
        }),
      );
    }

    if (current >= 50 && isFiniteNumber(prev) && prev < 50) {
      patterns.push(
        buildPattern(candles, {
          indicator: "rsi",
          name: "RSI Centerline Cross Up",
          patternId: "rsi_centerline_bullish",
          signal: "bullish",
          confidence: 0.59,
          detectedAt: index,
          description:
            "RSI moved above 50, which often marks a shift from bearish momentum toward bullish momentum.",
          metadata: { rsi: current, seriesLength: candles.length },
        }),
      );
    }

    if (current <= 50 && isFiniteNumber(prev) && prev > 50) {
      patterns.push(
        buildPattern(candles, {
          indicator: "rsi",
          name: "RSI Centerline Cross Down",
          patternId: "rsi_centerline_bearish",
          signal: "bearish",
          confidence: 0.59,
          detectedAt: index,
          description:
            "RSI moved below 50, which often marks a shift from bullish momentum toward bearish momentum.",
          metadata: { rsi: current, seriesLength: candles.length },
        }),
      );
    }
  }

  const recentStart = Math.max(0, length - DIVERGENCE_LOOKBACK);
  const priceLows = findPivotPoints(
    closes.slice(0, length).map((value) => value),
    "low",
    2,
    recentStart,
  );
  const priceHighs = findPivotPoints(
    closes.slice(0, length).map((value) => value),
    "high",
    2,
    recentStart,
  );
  const rsiLows = findPivotPoints(
    values.slice(0, length),
    "low",
    2,
    recentStart,
  );
  const rsiHighs = findPivotPoints(
    values.slice(0, length),
    "high",
    2,
    recentStart,
  );

  const lastPriceLowPair = priceLows.slice(-2);
  const lastRsiLowPair = rsiLows.slice(-2);
  if (lastPriceLowPair.length === 2 && lastRsiLowPair.length === 2) {
    const [firstPriceLow, secondPriceLow] = lastPriceLowPair;
    const [firstRsiLow, secondRsiLow] = lastRsiLowPair;
    const priceDrop = firstPriceLow.value - secondPriceLow.value;
    if (
      secondPriceLow.index > firstPriceLow.index &&
      secondRsiLow.index > firstRsiLow.index &&
      secondPriceLow.value < firstPriceLow.value &&
      secondRsiLow.value > firstRsiLow.value &&
      priceDrop / Math.max(1, firstPriceLow.value) > 0.005
    ) {
      patterns.push(
        buildPattern(candles, {
          indicator: "rsi",
          name: "Bullish RSI Divergence",
          patternId: "rsi_bullish_divergence",
          signal: "bullish",
          confidence: 0.76,
          detectedAt: secondPriceLow.index,
          description:
            "Price made a lower low while RSI made a higher low, showing downside momentum is weakening even though price kept falling.",
          metadata: {
            priceLow1: firstPriceLow.value,
            priceLow2: secondPriceLow.value,
            rsiLow1: firstRsiLow.value,
            rsiLow2: secondRsiLow.value,
            seriesLength: candles.length,
          },
        }),
      );
    }
  }

  const lastPriceHighPair = priceHighs.slice(-2);
  const lastRsiHighPair = rsiHighs.slice(-2);
  if (lastPriceHighPair.length === 2 && lastRsiHighPair.length === 2) {
    const [firstPriceHigh, secondPriceHigh] = lastPriceHighPair;
    const [firstRsiHigh, secondRsiHigh] = lastRsiHighPair;
    const priceRise = secondPriceHigh.value - firstPriceHigh.value;
    if (
      secondPriceHigh.index > firstPriceHigh.index &&
      secondRsiHigh.index > firstRsiHigh.index &&
      secondPriceHigh.value > firstPriceHigh.value &&
      secondRsiHigh.value < firstRsiHigh.value &&
      priceRise / Math.max(1, firstPriceHigh.value) > 0.005
    ) {
      patterns.push(
        buildPattern(candles, {
          indicator: "rsi",
          name: "Bearish RSI Divergence",
          patternId: "rsi_bearish_divergence",
          signal: "bearish",
          confidence: 0.76,
          detectedAt: secondPriceHigh.index,
          description:
            "Price made a higher high while RSI made a lower high, showing upside momentum is weakening even though price kept rising.",
          metadata: {
            priceHigh1: firstPriceHigh.value,
            priceHigh2: secondPriceHigh.value,
            rsiHigh1: firstRsiHigh.value,
            rsiHigh2: secondRsiHigh.value,
            seriesLength: candles.length,
          },
        }),
      );
    }
  }

  const last = latestIndexWithValue(values);
  if (last >= 3) {
    const a = values[last - 3];
    const b = values[last - 2];
    const c = values[last - 1];
    const d = values[last];
    if (
      isFiniteNumber(a) &&
      isFiniteNumber(b) &&
      isFiniteNumber(c) &&
      isFiniteNumber(d)
    ) {
      if (a < 30 && b > 30 && c >= b && d > c) {
        patterns.push(
          buildPattern(candles, {
            indicator: "rsi",
            name: "Bullish RSI Failure Swing",
            patternId: "rsi_failure_swing_bullish",
            signal: "bullish",
            confidence: 0.7,
            detectedAt: last,
            description:
              "RSI recovered from oversold, held above 30, and continued to build strength — a classic bullish failure swing setup.",
            metadata: { rsi: d, seriesLength: candles.length },
          }),
        );
      }

      if (a > 70 && b < 70 && c <= b && d < c) {
        patterns.push(
          buildPattern(candles, {
            indicator: "rsi",
            name: "Bearish RSI Failure Swing",
            patternId: "rsi_failure_swing_bearish",
            signal: "bearish",
            confidence: 0.7,
            detectedAt: last,
            description:
              "RSI pulled back from overbought, failed to regain strength, and continued weakening — a bearish failure swing setup.",
            metadata: { rsi: d, seriesLength: candles.length },
          }),
        );
      }
    }
  }

  return patterns;
}

export function detectMACDPatterns(
  input: MacdPatternInput,
): IndicatorPattern[] {
  const patterns: IndicatorPattern[] = [];
  const { candles, closes, values } = input;
  const { macd: macdLine, signal, histogram } = values;
  if (
    closes.length < 35 ||
    macdLine.length < 35 ||
    signal.length < 35 ||
    histogram.length < 35
  ) {
    return patterns;
  }
  const length = Math.min(
    closes.length,
    macdLine.length,
    signal.length,
    histogram.length,
    candles.length,
  );

  for (let index = 1; index < length; index++) {
    const prevMacd = macdLine[index - 1];
    const prevSignal = signal[index - 1];
    const currentMacd = macdLine[index];
    const currentSignal = signal[index];
    if (
      !isFiniteNumber(prevMacd) ||
      !isFiniteNumber(prevSignal) ||
      !isFiniteNumber(currentMacd) ||
      !isFiniteNumber(currentSignal)
    ) {
      continue;
    }

    if (prevMacd <= prevSignal && currentMacd > currentSignal) {
      patterns.push(
        buildPattern(candles, {
          indicator: "macd",
          name: "MACD Bullish Crossover",
          patternId: "macd_bullish_crossover",
          signal: "bullish",
          confidence: 0.73,
          detectedAt: index,
          description:
            "The MACD line crossed above the signal line, showing momentum is turning upward.",
          metadata: {
            macd: currentMacd,
            signal: currentSignal,
            histogram: histogram[index] ?? null,
            seriesLength: candles.length,
          },
        }),
      );
    }

    if (prevMacd >= prevSignal && currentMacd < currentSignal) {
      patterns.push(
        buildPattern(candles, {
          indicator: "macd",
          name: "MACD Bearish Crossover",
          patternId: "macd_bearish_crossover",
          signal: "bearish",
          confidence: 0.73,
          detectedAt: index,
          description:
            "The MACD line crossed below the signal line, showing momentum is turning downward.",
          metadata: {
            macd: currentMacd,
            signal: currentSignal,
            histogram: histogram[index] ?? null,
            seriesLength: candles.length,
          },
        }),
      );
    }

    if (prevMacd <= 0 && currentMacd > 0) {
      patterns.push(
        buildPattern(candles, {
          indicator: "macd",
          name: "MACD Centerline Cross Up",
          patternId: "macd_centerline_bullish",
          signal: "bullish",
          confidence: 0.61,
          detectedAt: index,
          description:
            "MACD moved above the zero line, confirming upside momentum has expanded into positive territory.",
          metadata: { macd: currentMacd, seriesLength: candles.length },
        }),
      );
    }

    if (prevMacd >= 0 && currentMacd < 0) {
      patterns.push(
        buildPattern(candles, {
          indicator: "macd",
          name: "MACD Centerline Cross Down",
          patternId: "macd_centerline_bearish",
          signal: "bearish",
          confidence: 0.61,
          detectedAt: index,
          description:
            "MACD moved below the zero line, confirming downside momentum has expanded into negative territory.",
          metadata: { macd: currentMacd, seriesLength: candles.length },
        }),
      );
    }
  }

  const recentStart = Math.max(0, length - DIVERGENCE_LOOKBACK);
  const priceLows = findPivotPoints(
    closes.slice(0, length).map((value) => value),
    "low",
    2,
    recentStart,
  );
  const priceHighs = findPivotPoints(
    closes.slice(0, length).map((value) => value),
    "high",
    2,
    recentStart,
  );
  const macdLows = findPivotPoints(
    macdLine.slice(0, length),
    "low",
    2,
    recentStart,
  );
  const macdHighs = findPivotPoints(
    macdLine.slice(0, length),
    "high",
    2,
    recentStart,
  );

  const lastPriceLowPair = priceLows.slice(-2);
  const lastMacdLowPair = macdLows.slice(-2);
  if (lastPriceLowPair.length === 2 && lastMacdLowPair.length === 2) {
    const [firstPriceLow, secondPriceLow] = lastPriceLowPair;
    const [firstMacdLow, secondMacdLow] = lastMacdLowPair;
    if (
      secondPriceLow.index > firstPriceLow.index &&
      secondMacdLow.index > firstMacdLow.index &&
      secondPriceLow.value < firstPriceLow.value &&
      secondMacdLow.value > firstMacdLow.value &&
      (firstPriceLow.value - secondPriceLow.value) /
        Math.max(1, firstPriceLow.value) >
        0.005
    ) {
      patterns.push(
        buildPattern(candles, {
          indicator: "macd",
          name: "Bullish MACD Divergence",
          patternId: "macd_bullish_divergence",
          signal: "bullish",
          confidence: 0.74,
          detectedAt: secondPriceLow.index,
          description:
            "Price made a lower low while MACD made a higher low, suggesting downside momentum is fading.",
          metadata: {
            priceLow1: firstPriceLow.value,
            priceLow2: secondPriceLow.value,
            macdLow1: firstMacdLow.value,
            macdLow2: secondMacdLow.value,
            seriesLength: candles.length,
          },
        }),
      );
    }
  }

  const lastPriceHighPair = priceHighs.slice(-2);
  const lastMacdHighPair = macdHighs.slice(-2);
  if (lastPriceHighPair.length === 2 && lastMacdHighPair.length === 2) {
    const [firstPriceHigh, secondPriceHigh] = lastPriceHighPair;
    const [firstMacdHigh, secondMacdHigh] = lastMacdHighPair;
    if (
      secondPriceHigh.index > firstPriceHigh.index &&
      secondMacdHigh.index > firstMacdHigh.index &&
      secondPriceHigh.value > firstPriceHigh.value &&
      secondMacdHigh.value < firstMacdHigh.value &&
      (secondPriceHigh.value - firstPriceHigh.value) /
        Math.max(1, firstPriceHigh.value) >
        0.005
    ) {
      patterns.push(
        buildPattern(candles, {
          indicator: "macd",
          name: "Bearish MACD Divergence",
          patternId: "macd_bearish_divergence",
          signal: "bearish",
          confidence: 0.74,
          detectedAt: secondPriceHigh.index,
          description:
            "Price made a higher high while MACD made a lower high, suggesting upside momentum is fading.",
          metadata: {
            priceHigh1: firstPriceHigh.value,
            priceHigh2: secondPriceHigh.value,
            macdHigh1: firstMacdHigh.value,
            macdHigh2: secondMacdHigh.value,
            seriesLength: candles.length,
          },
        }),
      );
    }
  }

  const histRecent = histogram
    .slice(Math.max(0, length - 4), length)
    .filter((value): value is number => isFiniteNumber(value));
  if (histRecent.length === 4) {
    if (
      histRecent[0] < histRecent[1] &&
      histRecent[1] < histRecent[2] &&
      histRecent[2] < histRecent[3] &&
      histRecent[3] > 0
    ) {
      patterns.push(
        buildPattern(candles, {
          indicator: "macd",
          name: "MACD Histogram Acceleration",
          patternId: "macd_histogram_acceleration_bullish",
          signal: "bullish",
          confidence: 0.62,
          detectedAt: length - 1,
          description:
            "MACD histogram bars are expanding upward in sequence, showing momentum is building on the bullish side.",
          metadata: { histogram: histRecent[3], seriesLength: candles.length },
        }),
      );
    }

    if (
      histRecent[0] > histRecent[1] &&
      histRecent[1] > histRecent[2] &&
      histRecent[2] > histRecent[3] &&
      histRecent[3] < 0
    ) {
      patterns.push(
        buildPattern(candles, {
          indicator: "macd",
          name: "MACD Histogram Acceleration",
          patternId: "macd_histogram_acceleration_bearish",
          signal: "bearish",
          confidence: 0.62,
          detectedAt: length - 1,
          description:
            "MACD histogram bars are expanding downward in sequence, showing momentum is building on the bearish side.",
          metadata: { histogram: histRecent[3], seriesLength: candles.length },
        }),
      );
    }
  }

  return patterns;
}

export function detectVolumePatterns(
  input: VolumePatternInput,
): IndicatorPattern[] {
  const patterns: IndicatorPattern[] = [];
  const { candles, closes, volumeMa } = input;
  if (candles.length < 20 || volumeMa.length < 20) {
    return patterns;
  }
  const length = Math.min(candles.length, closes.length, volumeMa.length);

  for (let index = 1; index < length; index++) {
    const currentVolume = candles[index].volume;
    const ma = volumeMa[index];
    if (!isFiniteNumber(ma) || ma === 0) continue;

    const ratio = currentVolume / ma;
    const direction: IndicatorSignal =
      closes[index] >= closes[index - 1] ? "bullish" : "bearish";

    if (ratio >= 1.5) {
      patterns.push(
        buildPattern(candles, {
          indicator: "volume",
          name:
            direction === "bullish"
              ? "Volume Breakout Up"
              : "Volume Breakout Down",
          patternId:
            direction === "bullish"
              ? "volume_breakout_bullish"
              : "volume_breakout_bearish",
          signal: direction,
          confidence: clampConfidence(
            0.66 + Math.min(0.18, (ratio - 1.5) * 0.15),
          ),
          detectedAt: index,
          description:
            direction === "bullish"
              ? "Price advanced on elevated volume, showing the move has participation and conviction."
              : "Price fell on elevated volume, showing the move has participation and conviction.",
          metadata: {
            volume: currentVolume,
            volumeMa: ma,
            ratio,
            seriesLength: candles.length,
          },
        }),
      );
    }

    if (ratio >= 3) {
      patterns.push(
        buildPattern(candles, {
          indicator: "volume",
          name:
            direction === "bullish"
              ? "Bullish Volume Spike"
              : "Bearish Volume Spike",
          patternId:
            direction === "bullish"
              ? "volume_spike_bullish"
              : "volume_spike_bearish",
          signal: direction,
          confidence: 0.8,
          detectedAt: index,
          description:
            direction === "bullish"
              ? "A climactic upside volume spike can mark a breakout or an exhaustion burst depending on the surrounding trend."
              : "A climactic downside volume spike can mark a breakdown or an exhaustion burst depending on the surrounding trend.",
          metadata: {
            volume: currentVolume,
            volumeMa: ma,
            ratio,
            seriesLength: candles.length,
          },
        }),
      );
    }
  }

  const tailWindow = candles.slice(Math.max(0, length - 3), length);
  const tailMa = volumeMa.slice(Math.max(0, length - 3), length);
  if (
    tailWindow.length === 3 &&
    tailMa.length === 3 &&
    tailWindow.every(
      (candle, index) =>
        isFiniteNumber(tailMa[index]) && candle.volume < tailMa[index]! * 0.5,
    )
  ) {
    patterns.push(
      buildPattern(candles, {
        indicator: "volume",
        name: "Volume Dry-Up",
        patternId: "volume_dryup",
        signal: "neutral",
        confidence: 0.61,
        detectedAt: length - 1,
        description:
          "Volume has contracted well below its moving average for several candles, suggesting the market is coiling before the next move.",
        metadata: { seriesLength: candles.length },
      }),
    );
  }

  const recentWindow = candles.slice(Math.max(0, length - 5), length);
  if (recentWindow.length === 5) {
    const startClose = recentWindow[0].close;
    const endClose = recentWindow[recentWindow.length - 1].close;
    const startAvgVolume =
      recentWindow.slice(0, 2).reduce((sum, candle) => sum + candle.volume, 0) /
      2;
    const endAvgVolume =
      recentWindow.slice(-2).reduce((sum, candle) => sum + candle.volume, 0) /
      2;

    if (endClose > startClose * 1.01 && endAvgVolume < startAvgVolume * 0.9) {
      patterns.push(
        buildPattern(candles, {
          indicator: "volume",
          name: "Bearish Volume Divergence",
          patternId: "volume_divergence_bearish",
          signal: "bearish",
          confidence: 0.59,
          detectedAt: length - 1,
          description:
            "Price is rising faster than participation, which can weaken the durability of the move.",
          metadata: { seriesLength: candles.length },
        }),
      );
    }

    if (endClose < startClose * 0.99 && endAvgVolume < startAvgVolume * 0.9) {
      patterns.push(
        buildPattern(candles, {
          indicator: "volume",
          name: "Bullish Volume Divergence",
          patternId: "volume_divergence_bullish",
          signal: "bullish",
          confidence: 0.59,
          detectedAt: length - 1,
          description:
            "Price is falling on shrinking participation, which can weaken the durability of the decline.",
          metadata: { seriesLength: candles.length },
        }),
      );
    }
  }

  return patterns;
}

export function detectCombinationPatterns(
  patterns: IndicatorPattern[],
): CombinationPattern[] {
  const recent = patterns.filter((pattern) => pattern.isRecent);
  const byId = new Map(recent.map((pattern) => [pattern.patternId, pattern]));

  const rules: Array<{
    patternId: string;
    name: string;
    signal: IndicatorSignal;
    requiredPatterns: string[];
    educationalNote: string;
    boostFactor: number;
  }> = [
    {
      patternId: "ema_cross_volume_breakout_bullish",
      name: "EMA Cross + Volume Breakout",
      signal: "bullish",
      requiredPatterns: ["ema_golden_cross", "volume_breakout_bullish"],
      educationalNote:
        "A moving-average crossover is stronger when a surge in volume confirms that real money is participating in the move.",
      boostFactor: 1.2,
    },
    {
      patternId: "ema_cross_volume_breakout_bearish",
      name: "EMA Cross + Volume Breakout",
      signal: "bearish",
      requiredPatterns: ["ema_death_cross", "volume_breakout_bearish"],
      educationalNote:
        "A bearish moving-average crossover is more credible when downside volume confirms the selling pressure.",
      boostFactor: 1.2,
    },
    {
      patternId: "bb_squeeze_macd_crossover_bullish",
      name: "BB Squeeze + MACD Crossover",
      signal: "bullish",
      requiredPatterns: ["bb_squeeze", "macd_bullish_crossover"],
      educationalNote:
        "Volatility compression followed by a bullish MACD crossover often signals that expansion is beginning to favor the upside.",
      boostFactor: 1.25,
    },
    {
      patternId: "bb_squeeze_macd_crossover_bearish",
      name: "BB Squeeze + MACD Crossover",
      signal: "bearish",
      requiredPatterns: ["bb_squeeze", "macd_bearish_crossover"],
      educationalNote:
        "Volatility compression followed by a bearish MACD crossover often signals that expansion is beginning to favor the downside.",
      boostFactor: 1.25,
    },
    {
      patternId: "rsi_divergence_bb_touch_bullish",
      name: "RSI Divergence + Lower Band Touch",
      signal: "bullish",
      requiredPatterns: ["rsi_bullish_divergence", "bb_mean_reversion_bullish"],
      educationalNote:
        "A bullish RSI divergence becomes more actionable when price also tags the lower Bollinger Band, combining momentum loss with oversold volatility stretch.",
      boostFactor: 1.3,
    },
    {
      patternId: "rsi_divergence_bb_touch_bearish",
      name: "RSI Divergence + Upper Band Touch",
      signal: "bearish",
      requiredPatterns: ["rsi_bearish_divergence", "bb_mean_reversion_bearish"],
      educationalNote:
        "A bearish RSI divergence becomes more actionable when price also tags the upper Bollinger Band, combining fading momentum with overextended volatility.",
      boostFactor: 1.3,
    },
    {
      patternId: "ema_cross_rsi_centerline_bullish",
      name: "EMA Cross + RSI Centerline Cross",
      signal: "bullish",
      requiredPatterns: ["ema_golden_cross", "rsi_centerline_bullish"],
      educationalNote:
        "When both trend and momentum flip higher together, the probability of a sustained move improves.",
      boostFactor: 1.15,
    },
    {
      patternId: "ema_cross_rsi_centerline_bearish",
      name: "EMA Cross + RSI Centerline Cross",
      signal: "bearish",
      requiredPatterns: ["ema_death_cross", "rsi_centerline_bearish"],
      educationalNote:
        "When both trend and momentum flip lower together, downside follow-through is more credible.",
      boostFactor: 1.15,
    },
    {
      patternId: "volume_dryup_bb_squeeze",
      name: "Volume Dry-Up + BB Squeeze",
      signal: "neutral",
      requiredPatterns: ["volume_dryup", "bb_squeeze"],
      educationalNote:
        "Low volume and tight bands together mean the market is coiling. The direction is still unclear, but the next move may be sharp.",
      boostFactor: 1.1,
    },
    {
      patternId: "macd_divergence_volume_decline_bullish",
      name: "MACD Divergence + Volume Decline",
      signal: "bullish",
      requiredPatterns: [
        "macd_bullish_divergence",
        "volume_divergence_bullish",
      ],
      educationalNote:
        "If price keeps falling but MACD and volume participation both fade, the decline may be losing support.",
      boostFactor: 1.2,
    },
    {
      patternId: "macd_divergence_volume_decline_bearish",
      name: "MACD Divergence + Volume Decline",
      signal: "bearish",
      requiredPatterns: [
        "macd_bearish_divergence",
        "volume_divergence_bearish",
      ],
      educationalNote:
        "If price keeps rising but MACD and volume participation both fade, the uptrend may be losing support.",
      boostFactor: 1.2,
    },
  ];

  const combinations: CombinationPattern[] = [];
  for (const rule of rules) {
    const matches = rule.requiredPatterns
      .map((patternId) => byId.get(patternId))
      .filter(Boolean) as IndicatorPattern[];
    if (matches.length !== rule.requiredPatterns.length) continue;

    const maxSpread =
      Math.max(...matches.map((pattern) => pattern.detectedAt)) -
      Math.min(...matches.map((pattern) => pattern.detectedAt));
    if (maxSpread > RECENT_CANDLES) continue;

    const averageConfidence =
      matches.reduce((sum, pattern) => sum + pattern.confidence, 0) /
      matches.length;
    const maxDetectedAt = Math.max(
      ...matches.map((pattern) => pattern.detectedAt),
    );
    combinations.push({
      patternId: rule.patternId,
      name: rule.name,
      signal: rule.signal,
      confidence: clampConfidence(averageConfidence * rule.boostFactor),
      description: rule.educationalNote,
      constituentPatternIds: rule.requiredPatterns,
      educationalNote: rule.educationalNote,
      _maxDetectedAt: maxDetectedAt,
    });
  }

  // When opposing signals of the same family fire (e.g. bullish AND bearish
  // BB Squeeze + MACD Crossover), keep only the most recent one.
  const grouped = new Map<
    string,
    (CombinationPattern & { _maxDetectedAt: number })[]
  >();
  for (const combo of combinations) {
    const group = grouped.get(combo.name) ?? [];
    group.push(combo as CombinationPattern & { _maxDetectedAt: number });
    grouped.set(combo.name, group);
  }

  const deduped: CombinationPattern[] = [];
  for (const group of grouped.values()) {
    if (group.length <= 1) {
      deduped.push(...group);
    } else {
      // Keep only the combination whose differentiating pattern was most recent
      group.sort((a, b) => b._maxDetectedAt - a._maxDetectedAt);
      deduped.push(group[0]);
    }
  }

  // Clean up internal bookkeeping field
  for (const combo of deduped) {
    delete (combo as Record<string, unknown>)._maxDetectedAt;
  }

  return deduped;
}

function computeAggregateSignal(
  patterns: IndicatorPattern[],
  combinations: CombinationPattern[],
) {
  const weightedPatterns = patterns
    .filter((pattern) => pattern.isRecent)
    .map((pattern) => ({
      direction: pattern.signal,
      confidence: pattern.confidence,
      weight: 1,
    }));

  const weightedCombinations = combinations.map((combination) => ({
    direction: combination.signal,
    confidence: combination.confidence,
    weight: 1.4,
  }));

  const combined = [...weightedPatterns, ...weightedCombinations].filter(
    (entry) => entry.direction !== "neutral",
  );

  if (combined.length === 0) {
    return {
      direction: "neutral" as const,
      strength: 0,
      summary: "No clear technical pattern cluster detected.",
    };
  }

  const signed = combined.reduce((sum, entry) => {
    const direction = entry.direction === "bullish" ? 1 : -1;
    return sum + direction * entry.confidence * entry.weight;
  }, 0);
  const total = combined.reduce(
    (sum, entry) => sum + entry.confidence * entry.weight,
    0,
  );
  const strength = total === 0 ? 0 : clampConfidence(Math.abs(signed) / total);
  const bullishCount =
    patterns.filter(
      (pattern) => pattern.isRecent && pattern.signal === "bullish",
    ).length +
    combinations.filter((combination) => combination.signal === "bullish")
      .length;
  const bearishCount =
    patterns.filter(
      (pattern) => pattern.isRecent && pattern.signal === "bearish",
    ).length +
    combinations.filter((combination) => combination.signal === "bearish")
      .length;
  const neutralCount =
    patterns.filter(
      (pattern) => pattern.isRecent && pattern.signal === "neutral",
    ).length +
    combinations.filter((combination) => combination.signal === "neutral")
      .length;
  const direction =
    signed > 0.08 ? "bullish" : signed < -0.08 ? "bearish" : "neutral";

  return {
    direction,
    strength,
    summary: `${bullishCount} bullish / ${bearishCount} bearish / ${neutralCount} neutral — ${direction} bias${strength > 0 ? ` (${Math.round(strength * 100)}% strength)` : ""}`,
  };
}

export function detectAllIndicatorPatterns(
  candles: Candle[],
  ticker?: string,
  timeframe?: AnalysisTimeframe | string,
): IndicatorPatternReport {
  if (candles.length === 0) {
    return {
      ticker,
      timeframe,
      patterns: [],
      combinations: [],
      aggregateSignal: {
        direction: "neutral",
        strength: 0,
        summary: "No candle data available.",
      },
      computedAt: new Date().toISOString(),
    };
  }

  const closes = candles.map((candle) => candle.close);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const bands = bollingerBands(closes);
  const rsiValues = rsi(closes);
  const macdValues = macd(closes);
  const volumeMa = volumeSMA(candles);

  const patterns = [
    ...detectEMAPatterns({ candles, closes, ema9, ema21 }),
    ...detectBollingerPatterns({ candles, closes, bands }),
    ...detectRSIPatterns({ candles, closes, values: rsiValues }),
    ...detectMACDPatterns({ candles, closes, values: macdValues }),
    ...detectVolumePatterns({ candles, closes, volumeMa }),
  ].sort((left, right) => right.detectedAt - left.detectedAt);

  const combinations = detectCombinationPatterns(patterns).sort(
    (left, right) => right.confidence - left.confidence,
  );

  return {
    ticker,
    timeframe,
    patterns,
    combinations,
    aggregateSignal: computeAggregateSignal(patterns, combinations),
    computedAt: new Date().toISOString(),
  };
}
