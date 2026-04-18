import type { Correlation, RecommendationInput } from "@/types/analysis";
import type { WhaleAlertRow } from "@/types/whale";

function sortWhalesByRecency(matches: WhaleAlertRow[]): WhaleAlertRow[] {
  return [...matches].sort(
    (left, right) =>
      Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? ""),
  );
}

function buildWhaleRefMetadata(
  recentWhales: WhaleAlertRow[],
  ticker: string,
): {
  primaryWhaleId: number | null;
  whaleIds: number[];
  whaleIntentHint: string | null;
} {
  const matches = sortWhalesByRecency(
    recentWhales.filter((whale) => whale.ticker === ticker),
  );

  return {
    primaryWhaleId: matches[0]?.id ?? null,
    whaleIds: matches.slice(0, 5).map((whale) => whale.id),
    whaleIntentHint: matches[0]?.intentHint ?? null,
  };
}

function whaleDirectionFromCallPut(
  callPut: string | null | undefined,
): "bullish" | "bearish" | "neutral" {
  if (callPut === "P") return "bearish";
  if (callPut === "C") return "bullish";
  return "neutral";
}

export function buildCorrelationRecommendationInput(
  correlation: Correlation,
  recentWhales: WhaleAlertRow[],
): RecommendationInput {
  const ticker = correlation.whale_trade.ticker;
  const whaleRef = buildWhaleRefMetadata(recentWhales, ticker);

  return {
    ticker,
    source: "correlation",
    correlation,
    whaleDirection: correlation.smart_money_signal.includes("bullish")
      ? "bullish"
      : correlation.smart_money_signal.includes("bearish")
        ? "bearish"
        : "neutral",
    whaleIntentHint: whaleRef.whaleIntentHint,
    expiryForEarningsContext: correlation.whale_trade.expiry,
    primaryWhaleId: whaleRef.primaryWhaleId,
    whaleIds: whaleRef.whaleIds,
    inputRefs: {
      correlationTicker: ticker,
      correlationConfidence: correlation.correlation_confidence,
      primaryWhaleId: whaleRef.primaryWhaleId,
      whaleIds: whaleRef.whaleIds,
    },
  };
}

export function buildWhaleSignalRecommendationInput(
  whaleRow: WhaleAlertRow,
): RecommendationInput {
  const ticker = whaleRow.ticker;
  const optionType = whaleRow.callPut === "P" ? "put" : "call";
  const premium = whaleRow.premium ?? 0;
  const direction = whaleDirectionFromCallPut(whaleRow.callPut);

  return {
    ticker,
    source: "whale_signal",
    correlation: {
      whale_trade: {
        ticker,
        strike: whaleRow.strike ?? 0,
        expiry: whaleRow.expiry ?? "",
        type: optionType,
        premium,
        volume: whaleRow.volume ?? 0,
      },
      related_event: {
        headline: "No specific news catalyst — pure whale-signal trade",
        impact_score: 0,
        event_type: "whale_signal_only",
      },
      correlation_confidence: 0,
      alignment: "confirming",
      thesis: `${optionType === "put" ? "Put" : "Call"} $${(premium / 1e6).toFixed(1)}M premium`,
      smart_money_signal:
        direction === "bearish"
          ? "bearish"
          : direction === "bullish"
            ? "bullish"
            : "neutral",
    },
    whaleDirection: direction,
    whaleIntentHint: whaleRow.intentHint ?? null,
    expiryForEarningsContext: whaleRow.expiry ?? "",
    primaryWhaleId: whaleRow.id ?? null,
    whaleIds: whaleRow.id != null ? [whaleRow.id] : [],
    inputRefs: {
      whaleSignalTicker: ticker,
      whaleSignalOnly: true,
      primaryWhaleId: whaleRow.id ?? null,
      whaleIds: whaleRow.id != null ? [whaleRow.id] : [],
    },
  };
}

export function buildRecommendationQueue(args: {
  correlations: Correlation[];
  recentWhales: WhaleAlertRow[];
  minRecommendations: number;
}): RecommendationInput[] {
  const inputs = args.correlations.map((correlation) =>
    buildCorrelationRecommendationInput(correlation, args.recentWhales),
  );

  const seenTickers = new Set(inputs.map((input) => input.ticker));
  if (inputs.length >= args.minRecommendations) {
    return inputs;
  }

  const remaining = args.minRecommendations - inputs.length;
  const fallbackWhales = [...args.recentWhales]
    .sort((left, right) => (right.premium ?? 0) - (left.premium ?? 0))
    .filter((whale) => {
      if (seenTickers.has(whale.ticker)) {
        return false;
      }
      seenTickers.add(whale.ticker);
      return true;
    })
    .slice(0, remaining);

  return [
    ...inputs,
    ...fallbackWhales.map((whale) =>
      buildWhaleSignalRecommendationInput(whale),
    ),
  ];
}
