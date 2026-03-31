import type { WhaleAlert } from "@/types/whale";

export type InferredSentiment =
  | "strongly_bullish"
  | "bullish"
  | "neutral"
  | "bearish"
  | "strongly_bearish";

export type SentimentConfidence = "high" | "medium" | "low";
export type IntentHint = "speculative" | "institutional" | "hedge" | "unknown";

export interface SentimentInference {
  inferred: InferredSentiment;
  confidence: SentimentConfidence;
  intent: IntentHint;
}

/**
 * Infer nuanced sentiment from available trade data + Greeks.
 *
 * Signals used:
 *  1. Contract type (call/put) — base direction
 *  2. Delta magnitude — directional conviction (|delta| near 1 = deep ITM, near 0 = far OTM)
 *  3. OTM distance — speculative vs hedge indicator
 *  4. Vol/OI ratio — new-position conviction
 *  5. Premium size — institutional scale indicator
 */
export function inferSentiment(
  alert: WhaleAlert,
  underlyingPrice?: number,
): SentimentInference {
  const price = underlyingPrice ?? alert.underlyingPrice ?? 0;
  const isCall = alert.callPut === "C";

  // --- Direction score: -100 (strongly bearish) to +100 (strongly bullish) ---
  let direction = isCall ? 40 : -40; // base from contract type

  // Delta modifier: delta ranges from -1 to +1
  // For calls: high delta (>0.7) = deep ITM (could be hedge), low delta (<0.3) = far OTM (speculative bullish)
  // For puts: very negative delta = deep ITM put, mildly negative = OTM put
  if (alert.delta != null) {
    const absDelta = Math.abs(alert.delta);
    if (isCall) {
      // OTM calls (low delta) with high volume = aggressive bullish bet
      if (absDelta < 0.3) direction += 20;
      else if (absDelta > 0.7) direction -= 10; // deep ITM call — could be covered/hedge
    } else {
      // OTM puts (low |delta|) with high volume = aggressive bearish
      if (absDelta < 0.3) direction -= 20;
      else if (absDelta > 0.7) direction += 10; // deep ITM put — could be protective
    }
  }

  // OTM distance modifier (when no Greeks available)
  if (alert.delta == null && price > 0 && alert.strike > 0) {
    const otmPct = isCall
      ? (alert.strike - price) / price
      : (price - alert.strike) / price;
    if (otmPct > 0.05) {
      // Significantly OTM — amplify directional signal
      direction += isCall ? 15 : -15;
    } else if (otmPct < -0.05) {
      // Deep ITM — dampen signal (likely hedge)
      direction += isCall ? -10 : 10;
    }
  }

  // --- Confidence ---
  let confidenceScore = 0;

  // Vol/OI ratio
  if (alert.openInterest > 0) {
    const ratio = alert.volume / alert.openInterest;
    if (ratio > 5) confidenceScore += 40;
    else if (ratio > 3) confidenceScore += 30;
    else if (ratio > 1) confidenceScore += 15;
  } else if (alert.volume > 0) {
    confidenceScore += 35; // no OI = brand new strike
  }

  // Premium size
  if (alert.premium >= 1_000_000) confidenceScore += 30;
  else if (alert.premium >= 500_000) confidenceScore += 20;
  else if (alert.premium >= 200_000) confidenceScore += 10;

  // Volume magnitude
  if (alert.volume >= 5000) confidenceScore += 20;
  else if (alert.volume >= 1000) confidenceScore += 10;

  // IV signal — high IV = more speculative market, reduce confidence slightly
  if (alert.impliedVolatility != null && alert.impliedVolatility > 1.0) {
    confidenceScore -= 10;
  }

  const confidence: SentimentConfidence =
    confidenceScore >= 60 ? "high" : confidenceScore >= 30 ? "medium" : "low";

  // --- Intent hint ---
  let intent: IntentHint = "unknown";
  const otmPct =
    price > 0 && alert.strike > 0
      ? isCall
        ? (alert.strike - price) / price
        : (price - alert.strike) / price
      : 0;

  if (
    otmPct > 0.1 &&
    alert.openInterest > 0 &&
    alert.volume > 3 * alert.openInterest
  ) {
    intent = "speculative"; // far OTM + high vol/OI = speculative bet
  } else if (alert.premium >= 1_000_000 && Math.abs(otmPct) < 0.03) {
    intent = "institutional"; // large premium near ATM = institutional block
  } else if (
    otmPct < -0.03 ||
    (alert.delta != null && Math.abs(alert.delta) > 0.7)
  ) {
    intent = "hedge"; // ITM or high-delta = likely hedging
  }

  // --- Map direction score to sentiment label ---
  let inferred: InferredSentiment;
  if (direction >= 50) inferred = "strongly_bullish";
  else if (direction >= 15) inferred = "bullish";
  else if (direction > -15) inferred = "neutral";
  else if (direction > -50) inferred = "bearish";
  else inferred = "strongly_bearish";

  return { inferred, confidence, intent };
}

/**
 * Compute aggregate put/call metrics for a set of alerts.
 */
export interface MarketPulse {
  totalAlerts: number;
  callCount: number;
  putCount: number;
  pcRatio: number; // put/call ratio (0 = all calls, >1 = more puts)
  callPremium: number;
  putPremium: number;
  netSentimentScore: number; // -100 to +100
  sentimentLabel: string;
  topBearishSignals: Array<{
    ticker: string;
    strike: number;
    premium: number;
    type: string;
  }>;
}

interface AlertLike {
  callPut: string | null;
  premium: number | null;
  ticker: string;
  strike: number | null;
  inferredSentiment?: string | null;
}

export function computeMarketPulse(alerts: AlertLike[]): MarketPulse {
  const calls = alerts.filter((a) => a.callPut === "C");
  const puts = alerts.filter((a) => a.callPut === "P");

  const callPremium = calls.reduce((s, a) => s + (a.premium ?? 0), 0);
  const putPremium = puts.reduce((s, a) => s + (a.premium ?? 0), 0);

  const pcRatio = calls.length > 0 ? puts.length / calls.length : 0;

  // Net sentiment: weighted by premium
  const totalPremium = callPremium + putPremium;
  const netSentimentScore =
    totalPremium > 0
      ? Math.round(((callPremium - putPremium) / totalPremium) * 100)
      : 0;

  let sentimentLabel: string;
  if (pcRatio === 0 && calls.length > 0)
    sentimentLabel = "Extreme Bullish Skew";
  else if (pcRatio < 0.3) sentimentLabel = "Strong Bullish";
  else if (pcRatio < 0.7) sentimentLabel = "Moderately Bullish";
  else if (pcRatio < 1.0) sentimentLabel = "Slightly Bullish";
  else if (pcRatio < 1.3) sentimentLabel = "Neutral";
  else if (pcRatio < 2.0) sentimentLabel = "Moderately Bearish";
  else sentimentLabel = "Strong Bearish";

  // Highlight bearish signals even when few
  const topBearishSignals = puts
    .sort((a, b) => (b.premium ?? 0) - (a.premium ?? 0))
    .slice(0, 5)
    .map((a) => ({
      ticker: a.ticker,
      strike: a.strike ?? 0,
      premium: a.premium ?? 0,
      type: "PUT",
    }));

  return {
    totalAlerts: alerts.length,
    callCount: calls.length,
    putCount: puts.length,
    pcRatio: Math.round(pcRatio * 1000) / 1000,
    callPremium,
    putPremium,
    netSentimentScore,
    sentimentLabel,
    topBearishSignals,
  };
}
