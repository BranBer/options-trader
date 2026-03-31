/**
 * Client-side technical indicator calculations from OHLCV data.
 * All functions accept arrays of numbers and return arrays of (number | null).
 * Null entries represent periods where there isn't enough data for the lookback.
 */

export type Candle = {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/** Simple Moving Average */
export function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += values[j];
      result.push(sum / period);
    }
  }
  return result;
}

/** Exponential Moving Average */
export function ema(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);

  // First EMA value is the SMA of the first `period` values
  for (let i = 0; i < period - 1; i++) result.push(null);

  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  result.push(prev);

  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

/** Bollinger Bands (middle = SMA, upper/lower = middle ± multiplier × stddev) */
export function bollingerBands(
  values: number[],
  period = 20,
  multiplier = 2,
): {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
} {
  const mid = sma(values, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < values.length; i++) {
    const m = mid[i];
    if (m == null) {
      upper.push(null);
      lower.push(null);
    } else {
      let variance = 0;
      for (let j = i - period + 1; j <= i; j++) {
        variance += (values[j] - m) ** 2;
      }
      const std = Math.sqrt(variance / period);
      upper.push(m + multiplier * std);
      lower.push(m - multiplier * std);
    }
  }
  return { upper, middle: mid, lower };
}

/** RSI (Relative Strength Index) — Wilder's smoothing */
export function rsi(values: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = [];
  if (values.length < period + 1) return values.map(() => null);

  // Need `period` changes = `period + 1` values
  for (let i = 0; i < period; i++) result.push(null);

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += -change;
  }
  avgGain /= period;
  avgLoss /= period;

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rs));

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsCur = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + rsCur));
  }
  return result;
}

/** MACD — returns { macd, signal, histogram } */
export function macd(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
} {
  const fastEma = ema(values, fastPeriod);
  const slowEma = ema(values, slowPeriod);

  const macdLine: (number | null)[] = fastEma.map((f, i) => {
    const s = slowEma[i];
    return f != null && s != null ? f - s : null;
  });

  // Signal = EMA of non-null MACD values
  const macdValues = macdLine.filter((v): v is number => v != null);
  const signalEma = ema(macdValues, signalPeriod);

  // Map signal values back to original indices
  const signal: (number | null)[] = [];
  const histogram: (number | null)[] = [];
  let sigIdx = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] == null) {
      signal.push(null);
      histogram.push(null);
    } else {
      const sig = signalEma[sigIdx] ?? null;
      signal.push(sig);
      histogram.push(sig != null ? macdLine[i]! - sig : null);
      sigIdx++;
    }
  }

  return { macd: macdLine, signal, histogram };
}

/** On-Balance Volume */
export function obv(candles: Candle[]): number[] {
  const result: number[] = [0];
  for (let i = 1; i < candles.length; i++) {
    const prev = result[i - 1];
    if (candles[i].close > candles[i - 1].close) {
      result.push(prev + candles[i].volume);
    } else if (candles[i].close < candles[i - 1].close) {
      result.push(prev - candles[i].volume);
    } else {
      result.push(prev);
    }
  }
  return result;
}

/** Volume-Weighted Average Price (cumulative from start of data) */
export function vwap(candles: Candle[]): (number | null)[] {
  let cumTypicalVol = 0;
  let cumVol = 0;
  return candles.map((c) => {
    const typical = (c.high + c.low + c.close) / 3;
    cumTypicalVol += typical * c.volume;
    cumVol += c.volume;
    return cumVol === 0 ? null : cumTypicalVol / cumVol;
  });
}

/** Volume SMA — moving average of volume values */
export function volumeSMA(candles: Candle[], period = 20): (number | null)[] {
  return sma(
    candles.map((c) => c.volume),
    period,
  );
}
