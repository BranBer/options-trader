import type { Candle } from "./technical-indicators";

export interface IntradayResistanceLevel {
  level: number;
  label: string;
  strength: "weak" | "moderate" | "strong";
  note: string;
  distanceFromPrice: number;
  distancePct: number;
  source:
    | "opening-range"
    | "premarket-high"
    | "anchored-vwap"
    | "prior-day-high"
    | "prior-day-close"
    | "vwap-band"
    | "composite";
}

export interface IntradaySupportLevel {
  level: number;
  label: string;
  strength: "weak" | "moderate" | "strong";
  note: string;
  distanceFromPrice: number;
  distancePct: number;
  source:
    | "opening-range-low"
    | "premarket-low"
    | "anchored-vwap-high"
    | "prior-day-low"
    | "prior-day-close"
    | "vwap-band-lower"
    | "composite";
}

export interface IntradayResistanceControl {
  label: string;
  tone: "seller-control" | "approaching-supply" | "buyers-clear";
  detail: string;
}

export interface IntradaySupportControl {
  label: string;
  tone: "buyer-control" | "approaching-support" | "thin-support";
  detail: string;
}

export interface IntradaySessionNarrative {
  title: string;
  detail: string;
}

function strengthRank(strength: IntradayResistanceLevel["strength"]): number {
  if (strength === "strong") return 3;
  if (strength === "moderate") return 2;
  return 1;
}

function supportStrengthRank(
  strength: IntradaySupportLevel["strength"],
): number {
  if (strength === "strong") return 3;
  if (strength === "moderate") return 2;
  return 1;
}

function candleTimeMs(candle: Candle): number {
  return typeof candle.time === "number"
    ? candle.time * 1000
    : new Date(candle.time).getTime();
}

function getEtParts(date: Date): {
  dateKey: string;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

function isRegularHours(candle: Candle): boolean {
  const { hour, minute } = getEtParts(new Date(candleTimeMs(candle)));
  const totalMinutes = hour * 60 + minute;
  return totalMinutes >= 9 * 60 + 30 && totalMinutes <= 16 * 60;
}

function latestRegularSession(intradayCandles: Candle[]): Candle[] {
  const regular = intradayCandles.filter(
    (candle) => typeof candle.time === "number" && isRegularHours(candle),
  );
  if (regular.length === 0) return [];

  const latestDate = getEtParts(
    new Date(candleTimeMs(regular[regular.length - 1])),
  ).dateKey;
  return regular.filter(
    (candle) =>
      getEtParts(new Date(candleTimeMs(candle))).dateKey === latestDate,
  );
}

function latestSessionDateKey(intradayCandles: Candle[]): string | null {
  const latest = intradayCandles.at(-1);
  if (!latest) return null;
  return getEtParts(new Date(candleTimeMs(latest))).dateKey;
}

function isPremarket(candle: Candle): boolean {
  const { hour, minute } = getEtParts(new Date(candleTimeMs(candle)));
  const totalMinutes = hour * 60 + minute;
  return totalMinutes >= 4 * 60 && totalMinutes < 9 * 60 + 30;
}

function weightedStdDev(candles: Candle[]): number {
  let weightedSum = 0;
  let totalVolume = 0;
  const typicalPrices = candles.map((candle) => {
    const typical = (candle.high + candle.low + candle.close) / 3;
    weightedSum += typical * candle.volume;
    totalVolume += candle.volume;
    return typical;
  });

  if (totalVolume === 0) return 0;
  const mean = weightedSum / totalVolume;
  let weightedVariance = 0;

  for (let index = 0; index < candles.length; index += 1) {
    weightedVariance +=
      candles[index].volume * (typicalPrices[index] - mean) ** 2;
  }

  return Math.sqrt(weightedVariance / totalVolume);
}

function cumulativeVwap(candles: Candle[]): number {
  let cumulativeTpVol = 0;
  let cumulativeVolume = 0;
  for (const candle of candles) {
    const typical = (candle.high + candle.low + candle.close) / 3;
    cumulativeTpVol += typical * candle.volume;
    cumulativeVolume += candle.volume;
  }
  return cumulativeVolume === 0 ? 0 : cumulativeTpVol / cumulativeVolume;
}

function anchoredVwapFromIndex(candles: Candle[], startIndex: number): number {
  return cumulativeVwap(candles.slice(startIndex));
}

function dedupeNearbyLevels(
  levels: IntradayResistanceLevel[],
): IntradayResistanceLevel[] {
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  const deduped: IntradayResistanceLevel[] = [];

  for (const level of sorted) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(level.level - prev.level) / prev.level <= 0.0015) {
      prev.label = `${prev.label} / ${level.label}`;
      prev.note = `${prev.note}; ${level.note}`;
      prev.source = "composite";
      if (level.strength === "strong") prev.strength = "strong";
      prev.distanceFromPrice = Math.min(
        prev.distanceFromPrice,
        level.distanceFromPrice,
      );
      prev.distancePct = Math.min(prev.distancePct, level.distancePct);
      continue;
    }
    deduped.push({ ...level });
  }

  return deduped;
}

function dedupeNearbySupportLevels(
  levels: IntradaySupportLevel[],
): IntradaySupportLevel[] {
  const sorted = [...levels].sort((a, b) => b.level - a.level);
  const deduped: IntradaySupportLevel[] = [];

  for (const level of sorted) {
    const prev = deduped[deduped.length - 1];
    if (prev && Math.abs(level.level - prev.level) / prev.level <= 0.0015) {
      prev.label = `${prev.label} / ${level.label}`;
      prev.note = `${prev.note}; ${level.note}`;
      prev.source = "composite";
      if (level.strength === "strong") prev.strength = "strong";
      prev.distanceFromPrice = Math.min(
        prev.distanceFromPrice,
        level.distanceFromPrice,
      );
      prev.distancePct = Math.min(prev.distancePct, level.distancePct);
      continue;
    }
    deduped.push({ ...level });
  }

  return deduped;
}

function sortAndTrimLevels(
  levels: IntradayResistanceLevel[],
): IntradayResistanceLevel[] {
  return [...levels]
    .sort((left, right) => {
      if (left.distancePct !== right.distancePct) {
        return left.distancePct - right.distancePct;
      }

      if (strengthRank(left.strength) !== strengthRank(right.strength)) {
        return strengthRank(right.strength) - strengthRank(left.strength);
      }

      return left.level - right.level;
    })
    .slice(0, 4);
}

function sortAndTrimSupportLevels(
  levels: IntradaySupportLevel[],
): IntradaySupportLevel[] {
  return [...levels]
    .sort((left, right) => {
      if (left.distancePct !== right.distancePct) {
        return left.distancePct - right.distancePct;
      }

      if (
        supportStrengthRank(left.strength) !==
        supportStrengthRank(right.strength)
      ) {
        return (
          supportStrengthRank(right.strength) -
          supportStrengthRank(left.strength)
        );
      }

      return right.level - left.level;
    })
    .slice(0, 4);
}

export function summarizeIntradayResistance(
  levels: IntradayResistanceLevel[],
  currentPrice: number,
): string {
  if (levels.length === 0) {
    return "No nearby intraday overhead supply was detected from the opening range, premarket, prior-day carryover, or VWAP stretch bands.";
  }

  const nearest = levels[0];
  const clusteredLevels = levels.filter((level) => level.distancePct <= 0.015);
  const clusterCount = clusteredLevels.length;
  const controlText =
    nearest.distancePct <= 0.004
      ? "Sellers still have immediate overhead control until that band is reclaimed."
      : nearest.distancePct <= 0.012
        ? "Price is approaching the first real overhead supply band."
        : "The nearest overhead band is present but not yet pressing directly on price.";

  return `Nearest overhead supply sits at $${nearest.level.toFixed(2)} (${nearest.label}), ${nearest.distancePct.toFixed(2)}% above price. ${clusterCount > 1 ? `${clusterCount} nearby bands are stacked within 1.5% of current price. ` : ""}${controlText}`;
}

export function getIntradayResistanceControl(
  levels: IntradayResistanceLevel[],
): IntradayResistanceControl {
  if (levels.length === 0) {
    return {
      label: "Buyers Clear Overhead",
      tone: "buyers-clear",
      detail:
        "No nearby opening-range, premarket, prior-day, or VWAP resistance is pressing directly on price.",
    };
  }

  const nearest = levels[0];
  if (nearest.distancePct <= 0.4) {
    return {
      label: "Sellers In Control",
      tone: "seller-control",
      detail: `Nearest supply at ${nearest.label} is only ${nearest.distancePct.toFixed(2)}% overhead.`,
    };
  }

  if (nearest.distancePct <= 1.2) {
    return {
      label: "Testing Overhead Supply",
      tone: "approaching-supply",
      detail: `Price is approaching ${nearest.label}, the first meaningful intraday resistance band.`,
    };
  }

  return {
    label: "Buyers Clear Overhead",
    tone: "buyers-clear",
    detail: `Nearest resistance band (${nearest.label}) is ${nearest.distancePct.toFixed(2)}% overhead.`,
  };
}

export function summarizeIntradaySupport(
  levels: IntradaySupportLevel[],
  currentPrice: number,
): string {
  if (levels.length === 0) {
    return "No nearby intraday support was detected from the opening range, premarket, prior-day carryover, or VWAP support bands.";
  }

  const nearest = levels[0];
  const clusteredLevels = levels.filter((level) => level.distancePct <= 1.5);
  const clusterCount = clusteredLevels.length;
  const controlText =
    nearest.distancePct <= 0.4
      ? "Buyers have immediate defense just below price if the pullback stays orderly."
      : nearest.distancePct <= 1.2
        ? "Price has identifiable support below, but buyers have not reached the first defense line yet."
        : "The nearest support band exists, but there is still air before buyers must defend it.";

  return `Nearest downside defense sits at $${nearest.level.toFixed(2)} (${nearest.label}), ${nearest.distancePct.toFixed(2)}% below price. ${clusterCount > 1 ? `${clusterCount} support bands are stacked within 1.5% of current price. ` : ""}${controlText}`;
}

export function getIntradaySupportControl(
  levels: IntradaySupportLevel[],
): IntradaySupportControl {
  if (levels.length === 0) {
    return {
      label: "Thin Support Below",
      tone: "thin-support",
      detail:
        "No nearby opening-range, premarket, prior-day, or VWAP support is stacked directly below price.",
    };
  }

  const nearest = levels[0];
  if (nearest.distancePct <= 0.4) {
    return {
      label: "Buyers Defending Nearby",
      tone: "buyer-control",
      detail: `Nearest support at ${nearest.label} is only ${nearest.distancePct.toFixed(2)}% below price.`,
    };
  }

  if (nearest.distancePct <= 1.2) {
    return {
      label: "Approaching Support",
      tone: "approaching-support",
      detail: `Price would meet ${nearest.label} as the first meaningful downside defense band.`,
    };
  }

  return {
    label: "Thin Support Below",
    tone: "thin-support",
    detail: `Nearest support band (${nearest.label}) is ${nearest.distancePct.toFixed(2)}% below price.`,
  };
}

function formatEtTime(candle: Candle): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(candleTimeMs(candle)));
}

function directionLabel(open: number, close: number): string {
  if (close > open) return "bullish";
  if (close < open) return "bearish";
  return "flat";
}

function percentMove(from: number, to: number): number {
  if (from === 0) return 0;
  return ((to - from) / from) * 100;
}

function levelDistanceLabel(distancePct: number): string {
  if (distancePct <= 0.4) return "immediate";
  if (distancePct <= 1.2) return "nearby";
  return "secondary";
}

export function summarizeIntradaySessionChronology(args: {
  intradayCandles: Candle[];
  dailyCandles: Candle[];
}): IntradaySessionNarrative[] {
  const sessionCandles = latestRegularSession(args.intradayCandles);
  if (sessionCandles.length < 6) return [];

  const currentPrice = sessionCandles[sessionCandles.length - 1].close;
  const openingRange = sessionCandles.slice(0, 6);
  const openingOpen = openingRange[0].open;
  const openingClose = openingRange[openingRange.length - 1].close;
  const openingHigh = Math.max(...openingRange.map((candle) => candle.high));
  const openingLow = Math.min(...openingRange.map((candle) => candle.low));
  const openingBias = directionLabel(openingOpen, openingClose);
  const openingMovePct = Math.abs(percentMove(openingOpen, openingClose));

  let sessionHigh = sessionCandles[0];
  let sessionLow = sessionCandles[0];
  for (const candle of sessionCandles) {
    if (candle.high > sessionHigh.high) sessionHigh = candle;
    if (candle.low < sessionLow.low) sessionLow = candle;
  }

  const highPrintedFirst =
    candleTimeMs(sessionHigh) <= candleTimeMs(sessionLow);
  const firstExtreme = highPrintedFirst
    ? `The session high printed first at ${formatEtTime(sessionHigh)}, then price rotated down into the session low at ${formatEtTime(sessionLow)}.`
    : `The session low printed first at ${formatEtTime(sessionLow)}, then price recovered into the session high at ${formatEtTime(sessionHigh)}.`;

  const resistance = buildIntradayResistanceLevels(args);
  const support = buildIntradaySupportLevels(args);
  const resistanceControl = getIntradayResistanceControl(resistance);
  const supportControl = getIntradaySupportControl(support);
  const nearestResistance = resistance[0] ?? null;
  const nearestSupport = support[0] ?? null;

  const priorSession = [...args.dailyCandles]
    .filter((candle) => {
      const time = candle.time;
      const dateKey =
        typeof time === "number"
          ? getEtParts(new Date(time * 1000)).dateKey
          : String(time).slice(0, 10);
      const currentSessionDate = latestSessionDateKey(args.intradayCandles);
      return currentSessionDate ? dateKey < currentSessionDate : false;
    })
    .sort((a, b) => candleTimeMs(a) - candleTimeMs(b))
    .at(-1);

  const sessionVwap = cumulativeVwap(sessionCandles);
  const closeVsVwap = currentPrice >= sessionVwap ? "above" : "below";
  const closeVsOpen =
    currentPrice >= sessionCandles[0].open ? "above" : "below";

  const narrative: IntradaySessionNarrative[] = [
    {
      title: "Opening Auction",
      detail:
        openingBias === "flat"
          ? `The first 30 minutes were balanced, holding a $${openingLow.toFixed(2)} to $${openingHigh.toFixed(2)} opening range with no clear directional edge.`
          : `The first 30 minutes were ${openingBias}, moving ${openingMovePct.toFixed(2)}% from the open while establishing an opening range between $${openingLow.toFixed(2)} and $${openingHigh.toFixed(2)}.`,
    },
    {
      title: "Intraday Sequence",
      detail: `${firstExtreme} That sequence matters because it frames whether the day behaved more like an opening drive that faded or an early shakeout that buyers repaired.`,
    },
    {
      title: "Closing Position",
      detail: `The session closed at $${currentPrice.toFixed(2)}, ${closeVsOpen} the cash open and ${closeVsVwap} session VWAP. ${supportControl.label} below price and ${resistanceControl.label.toLowerCase()} above it define the late-day positioning into the next session.`,
    },
  ];

  if (priorSession) {
    const priorContextParts: string[] = [];
    if (nearestResistance) {
      priorContextParts.push(
        `${levelDistanceLabel(nearestResistance.distancePct)} overhead supply sits at ${nearestResistance.label} ($${nearestResistance.level.toFixed(2)})`,
      );
    }
    if (nearestSupport) {
      priorContextParts.push(
        `${levelDistanceLabel(nearestSupport.distancePct)} support sits at ${nearestSupport.label} ($${nearestSupport.level.toFixed(2)})`,
      );
    }

    narrative.push({
      title: "Trade Framing",
      detail: `Relative to the prior session, traders should monitor prior-day high $${priorSession.high.toFixed(2)}, prior-day low $${priorSession.low.toFixed(2)}, and prior close $${priorSession.close.toFixed(2)}. ${priorContextParts.join(" while ") || "No nearby carryover levels are pressing immediately on price."} This gives day traders a cleaner map of what has to clear for continuation versus what must hold on a pullback.`,
    });
  }

  return narrative;
}

export function buildIntradayResistanceLevels(args: {
  intradayCandles: Candle[];
  dailyCandles: Candle[];
}): IntradayResistanceLevel[] {
  const sessionCandles = latestRegularSession(args.intradayCandles);
  if (sessionCandles.length < 6) return [];

  const currentPrice = sessionCandles[sessionCandles.length - 1].close;
  const sessionDate = latestSessionDateKey(args.intradayCandles);
  if (!sessionDate) return [];
  const candidates: IntradayResistanceLevel[] = [];

  const pushLevel = (
    level: number,
    label: string,
    strength: IntradayResistanceLevel["strength"],
    note: string,
    source: IntradayResistanceLevel["source"],
  ) => {
    if (level < currentPrice) return;

    candidates.push({
      level,
      label,
      strength,
      note,
      distanceFromPrice: level - currentPrice,
      distancePct: ((level - currentPrice) / currentPrice) * 100,
      source,
    });
  };

  const openingRange = sessionCandles.slice(0, 6);
  const openingRangeHigh = Math.max(
    ...openingRange.map((candle) => candle.high),
  );
  pushLevel(
    openingRangeHigh,
    "ORH",
    "strong",
    "Opening range high from the first 30 minutes",
    "opening-range",
  );

  const sameDayCandles = args.intradayCandles.filter((candle) => {
    if (typeof candle.time !== "number") return false;
    return getEtParts(new Date(candleTimeMs(candle))).dateKey === sessionDate;
  });
  const premarketCandles = sameDayCandles.filter(isPremarket);
  if (premarketCandles.length > 0) {
    pushLevel(
      Math.max(...premarketCandles.map((candle) => candle.high)),
      "PMH",
      "moderate",
      "Premarket high marking overnight supply",
      "premarket-high",
    );
  }

  let sessionLowIndex = 0;
  for (let index = 1; index < sessionCandles.length; index += 1) {
    if (sessionCandles[index].low < sessionCandles[sessionLowIndex].low) {
      sessionLowIndex = index;
    }
  }

  if (sessionLowIndex < sessionCandles.length - 1) {
    pushLevel(
      anchoredVwapFromIndex(sessionCandles, sessionLowIndex),
      "AVWAP LOD",
      "moderate",
      "Anchored VWAP from the session low showing buyer cost basis after the reversal point",
      "anchored-vwap",
    );
  }

  const previousDaily = [...args.dailyCandles]
    .filter((candle) => {
      const time = candle.time;
      const dateKey =
        typeof time === "number"
          ? getEtParts(new Date(time * 1000)).dateKey
          : String(time).slice(0, 10);
      return dateKey < sessionDate;
    })
    .sort((a, b) => candleTimeMs(a) - candleTimeMs(b))
    .at(-1);

  if (previousDaily) {
    pushLevel(
      previousDaily.high,
      "PDH",
      "strong",
      "Prior-day high carryover resistance",
      "prior-day-high",
    );

    pushLevel(
      previousDaily.close,
      "PDC",
      "moderate",
      "Prior-day closing balance",
      "prior-day-close",
    );
  }

  const sessionVwap = cumulativeVwap(sessionCandles);
  const sessionStdDev = weightedStdDev(sessionCandles);
  const upperBand = sessionVwap + sessionStdDev;
  if (upperBand > 0) {
    pushLevel(
      upperBand,
      "VWAP +1σ",
      "moderate",
      "Upper VWAP deviation band showing stretched intraday value",
      "vwap-band",
    );
  }

  return sortAndTrimLevels(dedupeNearbyLevels(candidates));
}

export function buildIntradaySupportLevels(args: {
  intradayCandles: Candle[];
  dailyCandles: Candle[];
}): IntradaySupportLevel[] {
  const sessionCandles = latestRegularSession(args.intradayCandles);
  if (sessionCandles.length < 6) return [];

  const currentPrice = sessionCandles[sessionCandles.length - 1].close;
  const sessionDate = latestSessionDateKey(args.intradayCandles);
  if (!sessionDate) return [];
  const candidates: IntradaySupportLevel[] = [];

  const pushLevel = (
    level: number,
    label: string,
    strength: IntradaySupportLevel["strength"],
    note: string,
    source: IntradaySupportLevel["source"],
  ) => {
    if (level > currentPrice) return;

    candidates.push({
      level,
      label,
      strength,
      note,
      distanceFromPrice: currentPrice - level,
      distancePct: ((currentPrice - level) / currentPrice) * 100,
      source,
    });
  };

  const openingRange = sessionCandles.slice(0, 6);
  const openingRangeLow = Math.min(...openingRange.map((candle) => candle.low));
  pushLevel(
    openingRangeLow,
    "ORL",
    "strong",
    "Opening range low from the first 30 minutes",
    "opening-range-low",
  );

  const sameDayCandles = args.intradayCandles.filter((candle) => {
    if (typeof candle.time !== "number") return false;
    return getEtParts(new Date(candleTimeMs(candle))).dateKey === sessionDate;
  });
  const premarketCandles = sameDayCandles.filter(isPremarket);
  if (premarketCandles.length > 0) {
    pushLevel(
      Math.min(...premarketCandles.map((candle) => candle.low)),
      "PML",
      "moderate",
      "Premarket low marking overnight downside defense",
      "premarket-low",
    );
  }

  let sessionHighIndex = 0;
  for (let index = 1; index < sessionCandles.length; index += 1) {
    if (sessionCandles[index].high > sessionCandles[sessionHighIndex].high) {
      sessionHighIndex = index;
    }
  }

  if (sessionHighIndex < sessionCandles.length - 1) {
    pushLevel(
      anchoredVwapFromIndex(sessionCandles, sessionHighIndex),
      "AVWAP HOD",
      "moderate",
      "Anchored VWAP from the session high showing post-breakout buyer cost basis on pullbacks",
      "anchored-vwap-high",
    );
  }

  const previousDaily = [...args.dailyCandles]
    .filter((candle) => {
      const time = candle.time;
      const dateKey =
        typeof time === "number"
          ? getEtParts(new Date(time * 1000)).dateKey
          : String(time).slice(0, 10);
      return dateKey < sessionDate;
    })
    .sort((a, b) => candleTimeMs(a) - candleTimeMs(b))
    .at(-1);

  if (previousDaily) {
    pushLevel(
      previousDaily.low,
      "PDL",
      "strong",
      "Prior-day low carryover support",
      "prior-day-low",
    );

    pushLevel(
      previousDaily.close,
      "PDC",
      "moderate",
      "Prior-day closing balance acting as support",
      "prior-day-close",
    );
  }

  const sessionVwap = cumulativeVwap(sessionCandles);
  const sessionStdDev = weightedStdDev(sessionCandles);
  const lowerBand = sessionVwap - sessionStdDev;
  if (lowerBand > 0) {
    pushLevel(
      lowerBand,
      "VWAP -1σ",
      "moderate",
      "Lower VWAP deviation band showing stretched downside value",
      "vwap-band-lower",
    );
  }

  return sortAndTrimSupportLevels(dedupeNearbySupportLevels(candidates));
}
