import YahooFinance from "yahoo-finance2";
import type { CandleData } from "@/types/market";
import {
  marketPulsePreparedCandleSchema,
  type MarketPulseBbPosition,
  type MarketPulsePreparedCandle,
  type MarketPulseTrend,
} from "@/types/market-pulse";

// yahoo-finance2 v3 class API — runtime methods are available despite weak exported types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new YahooFinance() as any;

export const MARKET_PULSE_TIMEFRAME = "15m";
// Bumped from 8→12 to capture a full extended-hours session (pre + regular + post ≈ 64 bars)
export const MARKET_PULSE_DEFAULT_WINDOW_SIZE = 12;
// Bumped from 40→96 so RSI-14 / BB-20 / vol-20 have full indicator history across extended bars
// Also used as the catch-up window size for the initial 24h run
export const LOOKBACK_CANDLE_COUNT = 96;
const LOOKBACK_DAYS = 7;
const RSI_PERIOD = 14;
const BOLLINGER_PERIOD = 20;
const BOLLINGER_STD_DEV = 2;
const VOLUME_AVG_PERIOD = 20;

interface CandleIndicators {
  rsi: number;
  bbUpper: number;
  bbLower: number;
  bbPosition: MarketPulseBbPosition;
  volumeVsAvg: number;
}

function round(value: number, decimals = 4): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(decimals));
}

function toIsoCandleTime(time: CandleData["time"]): string {
  if (typeof time === "number") {
    return new Date(time * 1000).toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(time)) {
    return `${time}T00:00:00.000Z`;
  }

  return new Date(time).toISOString();
}

/** ET hour boundaries for session tagging (inclusive start, exclusive end). */
const ET_TIMEZONE = "America/New_York";

function getCandleSession(
  unixSec: number,
): "pre" | "regular" | "post" | "outside" {
  const d = new Date(unixSec * 1000);
  const etFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = etFormatter.formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(
    parts.find((p) => p.type === "minute")?.value ?? "0",
    10,
  );
  const totalMinutes = hour * 60 + minute;
  // Pre-market: 4:00 AM – 9:29 AM ET
  if (totalMinutes >= 4 * 60 && totalMinutes < 9 * 60 + 30) return "pre";
  // Regular: 9:30 AM – 3:59 PM ET
  if (totalMinutes >= 9 * 60 + 30 && totalMinutes < 16 * 60) return "regular";
  // After-hours: 4:00 PM – 8:00 PM ET
  if (totalMinutes >= 16 * 60 && totalMinutes < 20 * 60) return "post";
  return "outside";
}

function normalizeCandles(
  quotes: Array<{
    date?: Date | string | number;
    open?: number | null;
    high?: number | null;
    low?: number | null;
    close?: number | null;
    volume?: number | null;
  }>,
): (CandleData & { session: "pre" | "regular" | "post" | "outside" })[] {
  return quotes
    .filter(
      (quote) =>
        quote.open != null &&
        quote.high != null &&
        quote.low != null &&
        quote.close != null &&
        quote.date != null,
    )
    .map((quote) => {
      const unixSec = Math.floor(new Date(quote.date as Date).getTime() / 1000);
      return {
        time: unixSec,
        open: Number(quote.open),
        high: Number(quote.high),
        low: Number(quote.low),
        close: Number(quote.close),
        volume: Number(quote.volume ?? 0),
        session: getCandleSession(unixSec),
      };
    })
    .sort((left, right) => Number(left.time) - Number(right.time));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function calculateRsi(candles: CandleData[], index: number): number {
  if (index <= 0) return 50;

  const start = Math.max(1, index - RSI_PERIOD + 1);
  let gains = 0;
  let losses = 0;
  let samples = 0;

  for (let currentIndex = start; currentIndex <= index; currentIndex += 1) {
    const change =
      candles[currentIndex].close - candles[currentIndex - 1].close;
    if (change > 0) gains += change;
    if (change < 0) losses += Math.abs(change);
    samples += 1;
  }

  if (samples === 0) return 50;

  const avgGain = gains / samples;
  const avgLoss = losses / samples;

  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateBollinger(
  candles: CandleData[],
  index: number,
): { upper: number; lower: number; position: MarketPulseBbPosition } {
  const start = Math.max(0, index - BOLLINGER_PERIOD + 1);
  const closes = candles.slice(start, index + 1).map((candle) => candle.close);
  const middle = average(closes);
  const deviation = stdDev(closes);
  const upper = middle + deviation * BOLLINGER_STD_DEV;
  const lower = middle - deviation * BOLLINGER_STD_DEV;

  if (upper <= lower) {
    return {
      upper: candles[index].close,
      lower: candles[index].close,
      position: "mid",
    };
  }

  const relativePosition = (candles[index].close - lower) / (upper - lower);
  const position: MarketPulseBbPosition =
    relativePosition >= 0.67
      ? "upper"
      : relativePosition <= 0.33
        ? "lower"
        : "mid";

  return { upper, lower, position };
}

function calculateVolumeVsAverage(
  candles: CandleData[],
  index: number,
): number {
  const start = Math.max(0, index - VOLUME_AVG_PERIOD + 1);
  const volumes = candles
    .slice(start, index + 1)
    .map((candle) => candle.volume);
  const avgVolume = average(volumes);

  if (avgVolume <= 0) return 1;
  return candles[index].volume / avgVolume;
}

export function computeIndicators(candles: CandleData[]): CandleIndicators[] {
  return candles.map((_, index) => {
    const rsi = calculateRsi(candles, index);
    const bollinger = calculateBollinger(candles, index);
    const volumeVsAvg = calculateVolumeVsAverage(candles, index);

    return {
      rsi: round(rsi),
      bbUpper: round(bollinger.upper),
      bbLower: round(bollinger.lower),
      bbPosition: bollinger.position,
      volumeVsAvg: round(volumeVsAvg),
    };
  });
}

export function deriveTrend(candles: CandleData[]): MarketPulseTrend {
  if (candles.length < 4) return "range";

  const recent = candles.slice(-Math.min(candles.length, 20));
  let higherCloses = 0;
  let lowerCloses = 0;

  for (let index = 1; index < recent.length; index += 1) {
    if (recent[index].close > recent[index - 1].close) higherCloses += 1;
    if (recent[index].close < recent[index - 1].close) lowerCloses += 1;
  }

  const firstClose = recent[0].close;
  const lastClose = recent[recent.length - 1].close;
  const pctChange = firstClose > 0 ? (lastClose - firstClose) / firstClose : 0;

  if (pctChange >= 0.01 && higherCloses >= lowerCloses + 2) return "uptrend";
  if (pctChange <= -0.01 && lowerCloses >= higherCloses + 2) return "downtrend";
  return "range";
}

export function deriveKeyLevels(candles: CandleData[]): number[] {
  if (candles.length === 0) return [];

  const recent = candles.slice(-Math.min(candles.length, 20));
  const closes = recent.map((candle) => candle.close);
  const highs = recent.map((candle) => candle.high);
  const lows = recent.map((candle) => candle.low);
  const latestClose = recent[recent.length - 1].close;

  const rawLevels = [
    Math.max(...highs),
    Math.min(...lows),
    latestClose,
    average(closes),
  ];
  const deduped: number[] = [];

  for (const level of rawLevels.map((value) => round(value, 2))) {
    const exists = deduped.some(
      (existing) => Math.abs(existing - level) / existing <= 0.001,
    );
    if (!exists) deduped.push(level);
  }

  return deduped;
}

function buildPreparedCandles(
  ticker: string,
  candles: (CandleData & {
    session?: "pre" | "regular" | "post" | "outside";
  })[],
  windowSize: number,
): MarketPulsePreparedCandle[] {
  const indicators = computeIndicators(candles);
  const trend = deriveTrend(candles);
  const keyLevels = deriveKeyLevels(candles);
  const selectedCandles = candles.slice(-windowSize);
  const selectedIndicators = indicators.slice(-windowSize);

  return selectedCandles.map((candle, index) =>
    marketPulsePreparedCandleSchema.parse({
      ticker,
      candleTime: toIsoCandleTime(candle.time),
      payload: {
        candle: {
          open: round(candle.open),
          high: round(candle.high),
          low: round(candle.low),
          close: round(candle.close),
          volume: round(candle.volume),
          session: (candle as { session?: string }).session as
            | "pre"
            | "regular"
            | "post"
            | "outside"
            | undefined,
        },
        indicators: {
          rsi: selectedIndicators[index].rsi,
          bb_upper: selectedIndicators[index].bbUpper,
          bb_lower: selectedIndicators[index].bbLower,
          bb_position: selectedIndicators[index].bbPosition,
          volume_vs_avg: selectedIndicators[index].volumeVsAvg,
        },
        context: {
          trend,
          key_levels: keyLevels,
          timeframe: "15m",
        },
      },
    }),
  );
}

export async function fetchCandleWindow(
  ticker: string,
  windowSize: number = MARKET_PULSE_DEFAULT_WINDOW_SIZE,
): Promise<MarketPulsePreparedCandle[]> {
  const normalizedTicker = ticker.trim().toUpperCase();
  const now = new Date();
  const period1 = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  try {
    const result = await yf.chart(normalizedTicker, {
      period1,
      period2: now,
      interval: MARKET_PULSE_TIMEFRAME,
      // Include pre-market (4 AM – 9:30 AM ET) and after-hours (4 PM – 8 PM ET) bars
      includePrePost: true,
    });

    const candles = normalizeCandles(result?.quotes ?? []);
    if (candles.length === 0) return [];

    const effectiveWindowSize = Math.min(
      windowSize,
      candles.length,
      LOOKBACK_CANDLE_COUNT,
    );
    return buildPreparedCandles(
      normalizedTicker,
      candles.slice(-LOOKBACK_CANDLE_COUNT),
      effectiveWindowSize,
    );
  } catch (error) {
    console.error(
      `[market-pulse-candles] Failed to fetch 15m candles for ${normalizedTicker}:`,
      error,
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// Cached raw 15-minute candles for chart display (full 24h context)
// ---------------------------------------------------------------------------

type CachedIntraday = {
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
  fetchedAt: number;
};

const intradayCache = new Map<string, CachedIntraday>();
const INTRADAY_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Fetch the most recent ~96 bars (≈24 h of extended-hours 15-min candles) for
 * chart display.  Results are cached in-memory for 3 minutes to avoid
 * hammering Yahoo Finance on every API poll.
 */
export async function fetchIntraday15mCandles(
  ticker: string,
): Promise<CachedIntraday["candles"]> {
  const key = ticker.trim().toUpperCase();
  const cached = intradayCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < INTRADAY_CACHE_TTL_MS) {
    return cached.candles;
  }

  const now = new Date();
  const period1 = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  try {
    const result = await yf.chart(key, {
      period1,
      period2: now,
      interval: MARKET_PULSE_TIMEFRAME,
      includePrePost: true,
    });

    const all = normalizeCandles(result?.quotes ?? []);
    // Keep the last ~96 bars (full extended-hours day)
    const candles = all.slice(-LOOKBACK_CANDLE_COUNT).map((c) => ({
      time:
        typeof c.time === "number"
          ? c.time
          : Math.floor(new Date(String(c.time)).getTime() / 1000),
      open: round(c.open),
      high: round(c.high),
      low: round(c.low),
      close: round(c.close),
      volume: round(c.volume, 0),
    }));

    intradayCache.set(key, { candles, fetchedAt: Date.now() });
    return candles;
  } catch (error) {
    console.error(
      `[market-pulse-candles] Failed to fetch intraday candles for ${key}:`,
      error,
    );
    // Return stale cache if available, otherwise empty
    return cached?.candles ?? [];
  }
}
