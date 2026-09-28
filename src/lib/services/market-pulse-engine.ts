import { and, desc, eq, gte, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  newsEvents,
  marketPulseClassifications,
  marketPulseCorrelations,
  marketPulseNarratives,
  marketPulseRuns,
} from "@/lib/db/schema";
import {
  activateStage,
  completeStage,
  failStage,
  finishTickerProgress,
  initTickerProgress,
  updateStageProgress,
} from "@/lib/services/market-pulse-progress";
import {
  buildClassifierPrompt,
  MARKET_PULSE_CLASSIFIER_RESPONSE_SCHEMA,
  MARKET_PULSE_CLASSIFIER_SYSTEM_INSTRUCTION,
  marketPulseClassifierZodSchema,
} from "@/lib/prompts/market-pulse-classifier";
import {
  buildCorrelatorPrompt,
  MARKET_PULSE_CORRELATOR_RESPONSE_SCHEMA,
  MARKET_PULSE_CORRELATOR_SYSTEM_INSTRUCTION,
  marketPulseCorrelatorZodSchema,
} from "@/lib/prompts/market-pulse-correlator";
import {
  buildSynthesizerPrompt,
  MARKET_PULSE_SYNTHESIZER_RESPONSE_SCHEMA,
  MARKET_PULSE_SYNTHESIZER_SYSTEM_INSTRUCTION,
  marketPulseSynthesizerZodSchema,
} from "@/lib/prompts/market-pulse-synthesizer";
import {
  MARKET_PULSE_DEFAULT_WINDOW_SIZE,
  fetchCandleWindow,
} from "@/lib/services/market-pulse-candles";
import {
  callLlmWithRetry,
  getMarketPulseModel,
  getTokenUsageSnapshot,
} from "@/lib/services/llm-client";
import { getCachedCalendar } from "@/lib/services/live-economic-calendar";
import { getRecentReleaseSummary } from "@/lib/services/post-release-analyzer";
import type { EconomicEvent } from "@/lib/utils/economic-calendar";
import type { NewsEventRow } from "@/types/news";
import {
  marketPulseNarrativePayloadSchema,
  marketPulseTickerSchema,
  type MarketPulseClassificationPayload,
  type MarketPulseClassificationResponse,
  type MarketPulseCorrelationPayload,
  type MarketPulseNarrativePayload,
  type MarketPulsePreparedCandle,
} from "@/types/market-pulse";

const CLASSIFICATION_BATCH_SIZE = 32;
const CLASSIFICATION_CALL_TYPE = "marketPulseClassify";
const CORRELATION_CALL_TYPE = "marketPulseCorrelate";
const SYNTHESIS_CALL_TYPE = "marketPulseNarrative";

// ── LLM enum coercion ───────────────────────────────────────────────────────
// Models sometimes return synonyms, capitalisations, or entirely novel values
// for enum fields. This coercer normalises to the canonical Zod enum value,
// falling back to a sensible default for anything truly unrecognisable.
const VALID_VOLATILITY = new Set(["expansion", "compression", "neutral"]);
const VOLATILITY_ALIASES: Record<string, string> = {
  expanding: "expansion",
  expand: "expansion",
  contracting: "compression",
  contraction: "compression",
  compressing: "compression",
  compressed: "compression",
  stable: "neutral",
  normal: "neutral",
  low: "compression",
  high: "expansion",
};

const VALID_MOMENTUM = new Set(["expanding", "weakening", "stable"]);
const MOMENTUM_ALIASES: Record<string, string> = {
  expansion: "expanding",
  strong: "expanding",
  growing: "expanding",
  compression: "weakening",
  weak: "weakening",
  declining: "weakening",
  fading: "weakening",
  neutral: "stable",
  flat: "stable",
};

const VALID_STRUCTURE = new Set([
  "trend_continuation",
  "pullback",
  "consolidation",
  "reversal_attempt",
]);
const STRUCTURE_ALIASES: Record<string, string> = {
  continuation: "trend_continuation",
  trend: "trend_continuation",
  trending: "trend_continuation",
  reversal: "reversal_attempt",
  reversing: "reversal_attempt",
  consolidating: "consolidation",
  range: "consolidation",
  ranging: "consolidation",
  pullback_rally: "pullback",
  retracement: "pullback",
};

// ── Narrative enum coercion ─────────────────────────────────────────────────
const VALID_CURRENT_CONTROL = new Set(["buyers", "sellers", "neutral"]);
const CURRENT_CONTROL_ALIASES: Record<string, string> = {
  buy: "buyers",
  buying: "buyers",
  bulls: "buyers",
  bullish: "buyers",
  sell: "sellers",
  selling: "sellers",
  bears: "sellers",
  bearish: "sellers",
  mixed: "neutral",
  balanced: "neutral",
  flat: "neutral",
  none: "neutral",
};

const VALID_MARKET_PHASE = new Set(["trend", "consolidation", "transition"]);
const MARKET_PHASE_ALIASES: Record<string, string> = {
  trending: "trend",
  trend_continuation: "trend",
  continuation: "trend",
  consolidating: "consolidation",
  range: "consolidation",
  ranging: "consolidation",
  reversal: "transition",
  reversal_attempt: "transition",
  shifting: "transition",
  transitioning: "transition",
};

const VALID_EXPECTED_BEHAVIOR = new Set([
  "continuation",
  "range",
  "reversal_risk",
]);
const EXPECTED_BEHAVIOR_ALIASES: Record<string, string> = {
  continue: "continuation",
  continued: "continuation",
  trend_continuation: "continuation",
  trending: "continuation",
  ranging: "range",
  consolidation: "range",
  sideways: "range",
  reversal: "reversal_risk",
  reverse: "reversal_risk",
  risk: "reversal_risk",
};

function coerceEnum(
  value: string,
  valid: Set<string>,
  aliases: Record<string, string>,
  fallback: string,
): string {
  const lower = value.toLowerCase().trim().replace(/-/g, "_");
  if (valid.has(lower)) return lower;
  return aliases[lower] ?? fallback;
}

function coerceClassificationEnums(data: unknown): unknown {
  if (data == null || typeof data !== "object") return data;
  const obj = data as Record<string, unknown>;
  const classifications = obj.classifications;
  if (!Array.isArray(classifications)) return data;

  for (const item of classifications) {
    if (item == null || typeof item !== "object") continue;
    const cls = (item as Record<string, unknown>).classification;
    if (cls == null || typeof cls !== "object") continue;
    const c = cls as Record<string, unknown>;

    if (typeof c.volatility_state === "string") {
      c.volatility_state = coerceEnum(
        c.volatility_state,
        VALID_VOLATILITY,
        VOLATILITY_ALIASES,
        "neutral",
      );
    }
    if (typeof c.momentum_state === "string") {
      c.momentum_state = coerceEnum(
        c.momentum_state,
        VALID_MOMENTUM,
        MOMENTUM_ALIASES,
        "stable",
      );
    }
    if (typeof c.structure_state === "string") {
      c.structure_state = coerceEnum(
        c.structure_state,
        VALID_STRUCTURE,
        STRUCTURE_ALIASES,
        "consolidation",
      );
    }

    // Handle non-string enum values (null/undefined/number) by falling back
    if (c.volatility_state != null && typeof c.volatility_state !== "string") {
      c.volatility_state = "neutral";
    }
    if (c.momentum_state != null && typeof c.momentum_state !== "string") {
      c.momentum_state = "stable";
    }
    if (c.structure_state != null && typeof c.structure_state !== "string") {
      c.structure_state = "consolidation";
    }

    // Clamp numeric fields to valid Zod ranges
    if (typeof c.control_strength === "number") {
      c.control_strength = Math.max(
        1,
        Math.min(10, Math.round(c.control_strength)),
      );
    }
    if (typeof c.rejection_strength === "number") {
      c.rejection_strength = Math.max(
        0,
        Math.min(10, Math.round(c.rejection_strength)),
      );
    }
  }
  return data;
}

function coerceNarrativeEnums(data: unknown): unknown {
  if (data == null || typeof data !== "object") return data;
  const obj = data as Record<string, unknown>;

  if (typeof obj.current_control === "string") {
    obj.current_control = coerceEnum(
      obj.current_control,
      VALID_CURRENT_CONTROL,
      CURRENT_CONTROL_ALIASES,
      "neutral",
    );
  }
  if (typeof obj.market_phase === "string") {
    obj.market_phase = coerceEnum(
      obj.market_phase,
      VALID_MARKET_PHASE,
      MARKET_PHASE_ALIASES,
      "consolidation",
    );
  }
  if (typeof obj.expected_behavior === "string") {
    obj.expected_behavior = coerceEnum(
      obj.expected_behavior,
      VALID_EXPECTED_BEHAVIOR,
      EXPECTED_BEHAVIOR_ALIASES,
      "range",
    );
  }

  // Clamp control_strength to 1–10 integer
  if (typeof obj.control_strength === "number") {
    obj.control_strength = Math.max(
      1,
      Math.min(10, Math.round(obj.control_strength)),
    );
  }
  // Clamp confidence_in_assessment to 0–1
  if (typeof obj.confidence_in_assessment === "number") {
    obj.confidence_in_assessment = Math.max(
      0,
      Math.min(1, obj.confidence_in_assessment),
    );
  }

  return data;
}

/**
 * Build a basic narrative from classification data when the LLM narrative
 * stage fails. This ensures users always see *something* after events are
 * classified — no more blank "will appear after initial run" state.
 */
function buildFallbackNarrative(
  classifications: MarketPulseClassificationPayload[],
): MarketPulseNarrativePayload {
  if (classifications.length === 0) {
    return {
      current_control: "neutral",
      control_strength: 1,
      narrative_summary: "No classification data available yet.",
      market_phase: "consolidation",
      expected_behavior: "range",
      key_conflicts: [],
      confidence_in_assessment: 0.1,
    };
  }

  // Determine control from event keywords
  let buyerSignals = 0;
  let sellerSignals = 0;
  for (const c of classifications) {
    const ev = c.event.toLowerCase();
    const cls = c.classification as unknown as Record<string, unknown> | undefined;
    const control = (cls?.control as string | undefined)?.toLowerCase() ?? "";
    if (
      control.includes("buyer") ||
      ev.includes("buyer") ||
      ev.includes("absorption") ||
      ev.includes("bullish")
    ) {
      buyerSignals += c.significance === "high" ? 2 : 1;
    } else if (
      control.includes("seller") ||
      ev.includes("seller") ||
      ev.includes("breakdown") ||
      ev.includes("bearish")
    ) {
      sellerSignals += c.significance === "high" ? 2 : 1;
    }
  }

  const current_control: "buyers" | "sellers" | "neutral" =
    buyerSignals > sellerSignals + 2
      ? "buyers"
      : sellerSignals > buyerSignals + 2
        ? "sellers"
        : "neutral";

  const total = buyerSignals + sellerSignals;
  const control_strength = Math.max(
    1,
    Math.min(
      10,
      total > 0
        ? Math.round((Math.abs(buyerSignals - sellerSignals) / total) * 10)
        : 1,
    ),
  );

  // Derive phase from structure_state distribution
  const structureCounts: Record<string, number> = {};
  for (const c of classifications) {
    const cls = c.classification as unknown as Record<string, unknown> | undefined;
    const state = (cls?.structure_state as string | undefined) ?? "consolidation";
    structureCounts[state] = (structureCounts[state] ?? 0) + 1;
  }
  const topStructure = Object.entries(structureCounts).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0];

  const market_phase: "trend" | "consolidation" | "transition" =
    topStructure === "trend_continuation"
      ? "trend"
      : topStructure === "reversal_attempt"
        ? "transition"
        : "consolidation";

  const expected_behavior: "continuation" | "range" | "reversal_risk" =
    market_phase === "trend"
      ? "continuation"
      : market_phase === "transition"
        ? "reversal_risk"
        : "range";

  const recentEvents = classifications.slice(-5).map((c) => c.event);
  const narrative_summary = `Auto-generated summary from ${classifications.length} classified events. ${
    current_control === "neutral"
      ? "Neither buyers nor sellers have clear control."
      : `${current_control === "buyers" ? "Buyers" : "Sellers"} appear to hold the edge.`
  } Recent activity: ${recentEvents.join("; ")}.`;

  return {
    current_control,
    control_strength,
    narrative_summary,
    market_phase,
    expected_behavior,
    key_conflicts:
      current_control === "neutral"
        ? ["Mixed buyer/seller signals — no clear directional conviction"]
        : [],
    confidence_in_assessment: 0.3,
  };
}

type ClassificationRunStatus = "success" | "partial" | "error";

export interface MarketPulseClassificationRunResult {
  runId: string;
  ticker: string;
  status: ClassificationRunStatus;
  classifications: MarketPulseClassificationPayload[];
  sequenceEvents: MarketPulseClassificationPayload[];
  llmTokensUsed: number;
  candleCount: number;
  errorMessages: string[];
  telemetry: MarketPulseRunTelemetry;
}

export interface MarketPulseOrchestrationResult {
  runId: string;
  ticker: string;
  status: "success" | "partial" | "error";
  classifications: MarketPulseClassificationPayload[];
  sequenceEvents: MarketPulseClassificationPayload[];
  correlations: MarketPulseCorrelationPayload[];
  narrative: MarketPulseNarrativePayload | null;
  errorMessages: string[];
}

type MarketPulseStageTelemetry = {
  durationMs: number;
  llmTokensUsed: number;
  itemCount?: number;
  distribution?: Record<string, number>;
  averageConfidence?: number | null;
  changedFromPrior?: boolean;
};

type MarketPulseRunTelemetry = {
  candleCount: number;
  stages: {
    classification?: MarketPulseStageTelemetry;
    correlation?: MarketPulseStageTelemetry;
    narrative?: MarketPulseStageTelemetry;
  };
};

function batchCandles<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

function getCallTypeTokens(callType: string): number {
  return getTokenUsageSnapshot()?.[callType]?.totalTokens ?? 0;
}

function summarizeWindow(candles: MarketPulsePreparedCandle[]): string {
  return JSON.stringify({
    start: candles[0]?.candleTime ?? null,
    end: candles.at(-1)?.candleTime ?? null,
    count: candles.length,
  });
}

function buildControlDistribution(
  classifications: MarketPulseClassificationPayload[],
): Record<string, number> {
  return classifications.reduce<Record<string, number>>(
    (distribution, item) => {
      const control = item.classification.control;
      distribution[control] = (distribution[control] ?? 0) + 1;
      return distribution;
    },
    {},
  );
}

function buildAverageConfidence(
  correlations: MarketPulseCorrelationPayload[],
): number | null {
  if (correlations.length === 0) return null;

  const total = correlations.reduce(
    (sum, item) => sum + item.correlation_confidence,
    0,
  );
  return Number((total / correlations.length).toFixed(4));
}

const SIGNIFICANCE_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Return the top `limit` classifications ranked by significance (high > medium
 * > low), preserving chronological order within each tier.
 */
function capBySignificance(
  classifications: MarketPulseClassificationPayload[],
  limit: number,
): MarketPulseClassificationPayload[] {
  if (classifications.length <= limit) return classifications;

  const sorted = [...classifications].sort(
    (a, b) =>
      (SIGNIFICANCE_RANK[a.significance] ?? 3) -
      (SIGNIFICANCE_RANK[b.significance] ?? 3),
  );
  const kept = new Set(sorted.slice(0, limit));
  // Return in original order
  return classifications.filter((c) => kept.has(c));
}

function normalizeNarrativePayload(
  narrative: MarketPulseNarrativePayload,
): Record<string, unknown> {
  return {
    current_control: narrative.current_control,
    control_strength: narrative.control_strength,
    narrative_summary: narrative.narrative_summary,
    market_phase: narrative.market_phase,
    expected_behavior: narrative.expected_behavior,
    key_conflicts: [...(narrative.key_conflicts ?? [])].sort(),
    confidence_in_assessment: narrative.confidence_in_assessment ?? null,
  };
}

function validateBatchResponse(
  inputBatch: MarketPulsePreparedCandle[],
  response: MarketPulseClassificationResponse,
): MarketPulseClassificationPayload[] {
  if (response.classifications.length !== inputBatch.length) {
    throw new Error(
      `Expected ${inputBatch.length} classifications, received ${response.classifications.length}`,
    );
  }

  return inputBatch.map((candle, index) => {
    const classification = response.classifications[index];
    if (classification.candle_time !== candle.candleTime) {
      throw new Error(
        `Classification candle_time mismatch at index ${index}: expected ${candle.candleTime}, received ${classification.candle_time}`,
      );
    }
    return classification;
  });
}

function buildSequenceEvents(
  classifications: MarketPulseClassificationPayload[],
): MarketPulseClassificationPayload[] {
  const sequenceEvents: MarketPulseClassificationPayload[] = [];
  let streakStart = 0;

  for (let index = 1; index <= classifications.length; index += 1) {
    const current = classifications[index];
    const prior = classifications[index - 1];
    const streakBroken =
      !current ||
      current.classification.control !== prior.classification.control;

    if (!streakBroken) continue;

    const streak = classifications.slice(streakStart, index);
    if (streak.length >= 3) {
      const dominantControl = prior.classification.control;
      const avgStrength = Math.round(
        streak.reduce(
          (sum, item) => sum + item.classification.control_strength,
          0,
        ) / streak.length,
      );

      sequenceEvents.push({
        candle_time: prior.candle_time,
        classification: {
          ...prior.classification,
          control: dominantControl,
          control_strength: avgStrength,
        },
        event:
          dominantControl === "neutral"
            ? `Price stayed contested for ${streak.length} consecutive candles, reinforcing a consolidation read rather than directional control.`
            : `${dominantControl === "buyers" ? "Buyers" : "Sellers"} held control across ${streak.length} consecutive candles, confirming the move as a sequence rather than a single-candle anomaly.`,
        significance:
          streak.length >= 4 || avgStrength >= 7 ? "high" : "medium",
        tradability:
          dominantControl === "neutral"
            ? "no_action"
            : avgStrength >= 6
              ? "actionable"
              : "watch",
        level: "sequence",
      });
    }

    streakStart = index;
  }

  return sequenceEvents;
}

async function persistClassifications(
  runId: string,
  ticker: string,
  candles: MarketPulsePreparedCandle[],
  classifications: MarketPulseClassificationPayload[],
  sequenceEvents: MarketPulseClassificationPayload[],
): Promise<void> {
  const candleMap = new Map(
    candles.map((candle) => [candle.candleTime, candle]),
  );

  const candleRows = classifications.map((item) => {
    const source = candleMap.get(item.candle_time);
    if (!source) {
      throw new Error(
        `Missing source candle for classification ${item.candle_time}`,
      );
    }

    return {
      runId,
      ticker,
      candleTime: item.candle_time,
      candleData: JSON.stringify(source.payload.candle),
      indicators: JSON.stringify(source.payload.indicators),
      classification: JSON.stringify(item.classification),
      eventBlurb: item.event,
      significance: item.significance,
      tradability: item.tradability,
      level: "candle" as const,
    };
  });

  const sequenceRows = sequenceEvents.map((item) => {
    const source = candleMap.get(item.candle_time);
    return {
      runId,
      ticker,
      candleTime: item.candle_time,
      candleData: JSON.stringify({
        sequence_anchor: item.candle_time,
        source_candle: source?.payload.candle ?? null,
      }),
      indicators: JSON.stringify({
        sequence_level: true,
        source_indicators: source?.payload.indicators ?? null,
      }),
      classification: JSON.stringify(item.classification),
      eventBlurb: item.event,
      significance: item.significance,
      tradability: item.tradability,
      level: "sequence" as const,
    };
  });

  await db
    .insert(marketPulseClassifications)
    .values([...candleRows, ...sequenceRows]);
}

export async function classifyCandles(options: {
  ticker: string;
  trigger?: "manual" | "scheduled" | "initial";
  windowSize?: number;
  runId?: string;
  signal?: AbortSignal;
}): Promise<MarketPulseClassificationRunResult> {
  const ticker = marketPulseTickerSchema.parse(options.ticker);
  const trigger = options.trigger ?? "manual";
  const windowSize = options.windowSize ?? MARKET_PULSE_DEFAULT_WINDOW_SIZE;

  activateStage(ticker, "candles");
  const candles = await fetchCandleWindow(ticker, windowSize);

  if (candles.length === 0) {
    failStage(ticker, "candles");
    throw new Error(`No 15-minute candle data available for ${ticker}`);
  }
  completeStage(ticker, "candles");

  const runId = options.runId ?? crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const beforeTokens = getCallTypeTokens(CLASSIFICATION_CALL_TYPE);

  await db.insert(marketPulseRuns).values({
    runId,
    ticker,
    status: "running",
    trigger,
    candleWindow: summarizeWindow(candles),
    startedAt,
  });

  const successfulClassifications: MarketPulseClassificationPayload[] = [];
  const errors: string[] = [];
  const stageStartedAt = Date.now();

  const batches = batchCandles(candles, CLASSIFICATION_BATCH_SIZE);
  const MAX_CONCURRENT_BATCHES = 3;
  activateStage(ticker, "classification", 0);

  const batchEntries = [...batches.entries()];
  for (let i = 0; i < batchEntries.length; i += MAX_CONCURRENT_BATCHES) {
    if (options.signal?.aborted) break;

    const chunk = batchEntries.slice(i, i + MAX_CONCURRENT_BATCHES);
    const results = await Promise.allSettled(
      chunk.map(async ([, batch]) => {
        const prompt = buildClassifierPrompt(batch);
        const response = await callLlmWithRetry(
          MARKET_PULSE_CLASSIFIER_SYSTEM_INSTRUCTION,
          prompt,
          MARKET_PULSE_CLASSIFIER_RESPONSE_SCHEMA,
          marketPulseClassifierZodSchema,
          {
            callType: CLASSIFICATION_CALL_TYPE,
            model: getMarketPulseModel(),
            temperature: 0,
            maxOutputTokens: 8192,
            signal: options.signal,
            preprocessParsedJson: coerceClassificationEnums,
          },
        );
        return validateBatchResponse(batch, response);
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        successfulClassifications.push(...result.value);
      } else {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        console.error(
          `[MarketPulse] Classification batch failed for ${ticker}:`,
          result.reason,
        );
        errors.push(message);
      }
    }
    updateStageProgress(
      ticker,
      "classification",
      Math.min(i + MAX_CONCURRENT_BATCHES, batchEntries.length) /
        batches.length,
    );
  }

  // If the run was cancelled mid-classification, clean up and stop
  if (options.signal?.aborted) {
    await db
      .update(marketPulseRuns)
      .set({
        status: "error",
        errorMessage: "Cancelled",
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(startedAt).getTime(),
      })
      .where(
        and(
          eq(marketPulseRuns.runId, runId),
          eq(marketPulseRuns.ticker, ticker),
        ),
      );
    failStage(ticker, "classification");
    throw new DOMException("Market Pulse run cancelled", "AbortError");
  }

  const sequenceEvents = buildSequenceEvents(successfulClassifications);
  if (successfulClassifications.length > 0) {
    await persistClassifications(
      runId,
      ticker,
      candles,
      successfulClassifications,
      sequenceEvents,
    );
  }
  completeStage(ticker, "classification");

  const completedAt = new Date().toISOString();
  const llmTokensUsed =
    getCallTypeTokens(CLASSIFICATION_CALL_TYPE) - beforeTokens;
  const telemetry: MarketPulseRunTelemetry = {
    candleCount: candles.length,
    stages: {
      classification: {
        durationMs: Date.now() - stageStartedAt,
        llmTokensUsed,
        itemCount: successfulClassifications.length + sequenceEvents.length,
        distribution: buildControlDistribution(successfulClassifications),
      },
    },
  };
  const status: ClassificationRunStatus =
    successfulClassifications.length === 0
      ? "error"
      : errors.length > 0
        ? "partial"
        : "success";

  await db
    .update(marketPulseRuns)
    .set({
      status,
      llmTokensUsed,
      durationMs:
        new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      stages: JSON.stringify(telemetry),
      completedAt,
      errorMessage: errors.length > 0 ? errors.join(" | ") : null,
    })
    .where(
      and(eq(marketPulseRuns.runId, runId), eq(marketPulseRuns.ticker, ticker)),
    );

  if (successfulClassifications.length === 0) {
    throw new Error(
      `Market Pulse classification failed for ${ticker}: ${errors.join(" | ")}`,
    );
  }

  return {
    runId,
    ticker,
    status,
    classifications: successfulClassifications,
    sequenceEvents,
    llmTokensUsed,
    candleCount: candles.length,
    errorMessages: errors,
    telemetry,
  };
}

export async function orchestrateTickerPulse(options: {
  ticker: string;
  trigger?: "manual" | "scheduled" | "initial";
  windowSize?: number;
  runId?: string;
  signal?: AbortSignal;
}): Promise<MarketPulseOrchestrationResult> {
  const ticker = marketPulseTickerSchema.parse(options.ticker);
  const runId = options.runId ?? crypto.randomUUID();
  const beforeCorrelationTokens = getCallTypeTokens(CORRELATION_CALL_TYPE);
  const beforeNarrativeTokens = getCallTypeTokens(SYNTHESIS_CALL_TYPE);
  const runStartedAtMs = Date.now();

  initTickerProgress(ticker, runId, options.trigger ?? "manual");

  let classificationRun: MarketPulseClassificationRunResult;
  try {
    classificationRun = await classifyCandles({
      ticker,
      trigger: options.trigger,
      windowSize: options.windowSize,
      runId,
      signal: options.signal,
    });
  } catch (err) {
    // Update the DB row so it doesn't stay stuck at "running" forever
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(marketPulseRuns)
      .set({
        status: "error",
        errorMessage: message,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - runStartedAtMs,
      })
      .where(
        and(
          eq(marketPulseRuns.runId, runId),
          eq(marketPulseRuns.ticker, ticker),
        ),
      );
    finishTickerProgress(ticker, true);
    throw err;
  }

  const currentRunEvents = [
    ...classificationRun.classifications,
    ...classificationRun.sequenceEvents,
  ];

  // Fetch all of today's prior classifications (from earlier rolling runs) and
  // merge them with the current window so correlators and synthesizers have the
  // full-day narrative context, not just the last 12 candles.
  const priorTodayEvents = await fetchTodaysClassifications(ticker, runId);

  // Dedup by (candle_time, level): current-run events take precedence.
  const currentRunKeys = new Set(
    currentRunEvents.map((e) => `${e.candle_time}|${e.level}`),
  );
  const dedupedPrior = priorTodayEvents.filter(
    (e) => !currentRunKeys.has(`${e.candle_time}|${e.level}`),
  );

  // enrichedEvents = full day oldest → newest; current-run events at the tail
  const enrichedEvents: MarketPulseClassificationPayload[] = [
    ...dedupedPrior.sort(
      (a, b) =>
        new Date(a.candle_time).getTime() - new Date(b.candle_time).getTime(),
    ),
    ...currentRunEvents,
  ];

  let correlations: MarketPulseCorrelationPayload[] = [];
  let narrative: MarketPulseNarrativePayload | null = null;
  const errors = [...classificationRun.errorMessages];
  const telemetry: MarketPulseRunTelemetry = {
    candleCount: classificationRun.telemetry.candleCount,
    stages: {
      classification: classificationRun.telemetry.stages.classification,
    },
  };

  const correlationStartedAt = Date.now();

  // Bail out before the next LLM stage if the run was cancelled
  if (options.signal?.aborted) {
    finishTickerProgress(ticker, true);
    return {
      runId,
      ticker,
      status: "error",
      classifications: classificationRun.classifications,
      sequenceEvents: classificationRun.sequenceEvents,
      correlations: [],
      narrative: null,
      errorMessages: ["Cancelled"],
    };
  }

  activateStage(ticker, "correlation");
  try {
    // Cap correlator input to the 20 most significant events to keep the
    // prompt within reasonable token bounds on high-volume days.
    const correlatorEvents = capBySignificance(enrichedEvents, 20);
    correlations = await correlateCatalysts({
      runId,
      ticker,
      classifications: correlatorEvents,
      signal: options.signal,
    });
    completeStage(ticker, "correlation");
    const correlationTokens =
      getCallTypeTokens(CORRELATION_CALL_TYPE) - beforeCorrelationTokens;
    telemetry.stages.correlation = {
      durationMs: Date.now() - correlationStartedAt,
      llmTokensUsed: Math.max(0, correlationTokens),
      itemCount: correlations.length,
      averageConfidence: buildAverageConfidence(correlations),
    };
  } catch (error) {
    failStage(ticker, "correlation");
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`correlation: ${message}`);
  }

  const priorNarrative = await previousNarrative(ticker);
  const narrativeStartedAt = Date.now();

  // Bail out before narrative if the run was cancelled
  if (options.signal?.aborted) {
    finishTickerProgress(ticker, true);
    return {
      runId,
      ticker,
      status: errors.length > 0 ? "partial" : "success",
      classifications: classificationRun.classifications,
      sequenceEvents: classificationRun.sequenceEvents,
      correlations,
      narrative: null,
      errorMessages: [...errors, "Cancelled before narrative"],
    };
  }

  activateStage(ticker, "narrative");
  try {
    narrative = await synthesizeNarrative({
      runId,
      ticker,
      classifications: enrichedEvents,
      correlations,
      priorNarrative: priorNarrative?.payload ?? null,
      signal: options.signal,
    });
    completeStage(ticker, "narrative");
    const narrativeTokens =
      getCallTypeTokens(SYNTHESIS_CALL_TYPE) - beforeNarrativeTokens;
    telemetry.stages.narrative = {
      durationMs: Date.now() - narrativeStartedAt,
      llmTokensUsed: Math.max(0, narrativeTokens),
      itemCount: narrative.key_conflicts?.length ?? 0,
      changedFromPrior:
        priorNarrative == null
          ? true
          : JSON.stringify(
              normalizeNarrativePayload(priorNarrative.payload),
            ) !== JSON.stringify(normalizeNarrativePayload(narrative)),
    };
  } catch (error) {
    failStage(ticker, "narrative");
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`narrative: ${message}`);

    // Fallback: carry forward prior narrative, or build a basic one from
    // classification data so the user always sees *something*.
    const fallback =
      priorNarrative?.payload ?? buildFallbackNarrative(enrichedEvents);
    narrative = fallback;

    // Persist the fallback so the API can serve it
    try {
      await db.insert(marketPulseNarratives).values({
        runId,
        ticker,
        currentControl: fallback.current_control,
        controlStrength: fallback.control_strength,
        marketPhase: fallback.market_phase,
        expectedBehavior: fallback.expected_behavior,
        narrativeSummary: fallback.narrative_summary,
        keyConflicts: JSON.stringify(fallback.key_conflicts ?? []),
        confidenceInAssessment: fallback.confidence_in_assessment ?? null,
        structuredOutput: JSON.stringify(fallback),
        inputEventCount: enrichedEvents.length,
        priorRunId: priorNarrative?.runId ?? null,
      });
    } catch {
      /* best-effort — don't crash the pipeline */
    }
  }

  const correlationTokens =
    getCallTypeTokens(CORRELATION_CALL_TYPE) - beforeCorrelationTokens;
  const narrativeTokens =
    getCallTypeTokens(SYNTHESIS_CALL_TYPE) - beforeNarrativeTokens;
  const finalStatus: "success" | "partial" | "error" =
    classificationRun.status === "error"
      ? "error"
      : classificationRun.status === "partial" || errors.length > 0
        ? "partial"
        : "success";

  await db
    .update(marketPulseRuns)
    .set({
      status: finalStatus,
      llmTokensUsed:
        classificationRun.llmTokensUsed +
        Math.max(0, correlationTokens) +
        Math.max(0, narrativeTokens),
      durationMs: Date.now() - runStartedAtMs,
      stages: JSON.stringify(telemetry),
      errorMessage: errors.length > 0 ? errors.join(" | ") : null,
    })
    .where(
      and(eq(marketPulseRuns.runId, runId), eq(marketPulseRuns.ticker, ticker)),
    );

  finishTickerProgress(ticker, finalStatus === "error");

  return {
    runId,
    ticker,
    status: finalStatus,
    classifications: classificationRun.classifications,
    sequenceEvents: classificationRun.sequenceEvents,
    correlations,
    narrative,
    errorMessages: errors,
  };
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Pulls all candle-level and sequence-level classifications stored for this
 * ticker in the past 24 hours, excluding the current run's rows.
 * Used to enrich the correlator and synthesizer with full-day context.
 */
async function fetchTodaysClassifications(
  ticker: string,
  excludeRunId: string,
): Promise<MarketPulseClassificationPayload[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await db
    .select()
    .from(marketPulseClassifications)
    .where(
      and(
        eq(marketPulseClassifications.ticker, ticker),
        gte(marketPulseClassifications.createdAt, since),
      ),
    )
    .orderBy(marketPulseClassifications.candleTime);

  return rows
    .filter((row) => row.runId !== excludeRunId)
    .map((row) => ({
      candle_time: row.candleTime,
      classification: parseJson<
        MarketPulseClassificationPayload["classification"]
      >(row.classification) ?? { control: "neutral", control_strength: 5 },
      event: row.eventBlurb,
      significance:
        row.significance as MarketPulseClassificationPayload["significance"],
      tradability:
        row.tradability as MarketPulseClassificationPayload["tradability"],
      level: row.level as MarketPulseClassificationPayload["level"],
    }));
}

function recentMacroEvents(now: Date = new Date()): EconomicEvent[] {
  const today = now.toISOString().slice(0, 10);
  const calendar = getCachedCalendar();
  const { recentReleases } = getRecentReleaseSummary();

  const upcoming = calendar.filter((event) => event.date >= today).slice(0, 5);
  const recent = recentReleases.map((event) => ({
    date: event.event.date,
    name: event.event.name,
    impact: event.event.impact,
    description: event.event.description,
    source: event.event.source,
  }));

  const seen = new Set<string>();
  return [...recent, ...upcoming].filter((event) => {
    const key = `${event.date}|${event.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function recentNewsForTicker(ticker: string): Promise<NewsEventRow[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await db
    .select()
    .from(newsEvents)
    .where(
      and(
        gte(newsEvents.createdAt, since),
        like(newsEvents.tickers, `%${ticker}%`),
      ),
    )
    .orderBy(desc(newsEvents.impactScore), desc(newsEvents.createdAt))
    .limit(10);

  return rows.filter((row) => parseStringArray(row.tickers).includes(ticker));
}

async function previousNarrative(ticker: string): Promise<{
  runId: string | null;
  payload: MarketPulseNarrativePayload;
} | null> {
  const rows = await db
    .select()
    .from(marketPulseNarratives)
    .where(eq(marketPulseNarratives.ticker, ticker))
    .orderBy(desc(marketPulseNarratives.createdAt))
    .limit(1);

  const row = rows[0] ?? null;
  if (!row) return null;

  if (row.structuredOutput) {
    return {
      runId: row.runId,
      payload: marketPulseNarrativePayloadSchema.parse(
        parseJson(row.structuredOutput),
      ),
    };
  }

  return {
    runId: row.runId,
    payload: marketPulseNarrativePayloadSchema.parse({
      current_control: row.currentControl,
      control_strength: row.controlStrength,
      narrative_summary: row.narrativeSummary,
      market_phase: row.marketPhase,
      expected_behavior: row.expectedBehavior,
      key_conflicts: row.keyConflicts ? parseJson(row.keyConflicts) : [],
      confidence_in_assessment: row.confidenceInAssessment ?? undefined,
    }),
  };
}

export async function correlateCatalysts(options: {
  runId: string;
  ticker: string;
  classifications: MarketPulseClassificationPayload[];
  signal?: AbortSignal;
}): Promise<MarketPulseCorrelationPayload[]> {
  const ticker = marketPulseTickerSchema.parse(options.ticker);
  const news = await recentNewsForTicker(ticker);
  const macro = recentMacroEvents();

  if (news.length === 0 && macro.length === 0) {
    return [];
  }

  const response = await callLlmWithRetry(
    MARKET_PULSE_CORRELATOR_SYSTEM_INSTRUCTION,
    buildCorrelatorPrompt(options.classifications, news, macro),
    MARKET_PULSE_CORRELATOR_RESPONSE_SCHEMA,
    marketPulseCorrelatorZodSchema,
    {
      callType: CORRELATION_CALL_TYPE,
      model: getMarketPulseModel(),
      temperature: 0,
      maxOutputTokens: 6144,
      signal: options.signal,
    },
  );

  if (response.correlations.length === 0) {
    return [];
  }

  const newsByHeadline = new Map(news.map((event) => [event.headline, event]));
  await db.insert(marketPulseCorrelations).values(
    response.correlations.map((correlation) => {
      const matchedNews = correlation.external_event.headline
        ? newsByHeadline.get(correlation.external_event.headline)
        : null;

      return {
        runId: options.runId,
        ticker,
        priceEvent: correlation.price_event,
        candleTime: correlation.candle_time,
        externalEventType: correlation.external_event.type,
        externalEventId: matchedNews?.id ?? null,
        externalEventSummary:
          correlation.external_event.headline ?? correlation.price_event,
        externalEventPayload: JSON.stringify(correlation.external_event),
        sentiment: correlation.external_event.sentiment,
        correlationConfidence: correlation.correlation_confidence,
        reasoning: correlation.reasoning ?? null,
      };
    }),
  );

  return response.correlations;
}

export async function synthesizeNarrative(options: {
  runId: string;
  ticker: string;
  classifications: MarketPulseClassificationPayload[];
  correlations: MarketPulseCorrelationPayload[];
  priorNarrative?: MarketPulseNarrativePayload | null;
  signal?: AbortSignal;
}): Promise<MarketPulseNarrativePayload> {
  const ticker = marketPulseTickerSchema.parse(options.ticker);
  const prior =
    options.priorNarrative !== undefined
      ? { runId: null, payload: options.priorNarrative }
      : await previousNarrative(ticker);

  const response = await callLlmWithRetry(
    MARKET_PULSE_SYNTHESIZER_SYSTEM_INSTRUCTION,
    buildSynthesizerPrompt(
      options.classifications,
      prior?.payload ?? null,
      options.correlations,
    ),
    MARKET_PULSE_SYNTHESIZER_RESPONSE_SCHEMA,
    marketPulseSynthesizerZodSchema,
    {
      callType: SYNTHESIS_CALL_TYPE,
      model: getMarketPulseModel(),
      temperature: 0.3,
      maxOutputTokens: 8192,
      signal: options.signal,
      preprocessParsedJson: coerceNarrativeEnums,
    },
  );

  await db.insert(marketPulseNarratives).values({
    runId: options.runId,
    ticker,
    currentControl: response.current_control,
    controlStrength: response.control_strength,
    marketPhase: response.market_phase,
    expectedBehavior: response.expected_behavior,
    narrativeSummary: response.narrative_summary,
    keyConflicts: JSON.stringify(response.key_conflicts ?? []),
    confidenceInAssessment: response.confidence_in_assessment ?? null,
    structuredOutput: JSON.stringify(response),
    inputEventCount: options.classifications.length,
    priorRunId: prior?.runId ?? null,
  });

  return response;
}

export async function getMarketPulseRunDetails(runId: string) {
  const runs = await db
    .select()
    .from(marketPulseRuns)
    .where(eq(marketPulseRuns.runId, runId))
    .limit(1);

  const run = runs[0] ?? null;
  if (!run) return null;

  const classifications = await db
    .select()
    .from(marketPulseClassifications)
    .where(eq(marketPulseClassifications.runId, runId));
  const correlations = await db
    .select()
    .from(marketPulseCorrelations)
    .where(eq(marketPulseCorrelations.runId, runId));
  const narratives = await db
    .select()
    .from(marketPulseNarratives)
    .where(eq(marketPulseNarratives.runId, runId));

  return {
    run: {
      ...run,
      candleWindow: parseJson(run.candleWindow),
      stages: parseJson(run.stages ?? "null"),
    },
    classifications: classifications.map((row) => ({
      ...row,
      candleData: parseJson(row.candleData),
      indicators: parseJson(row.indicators),
      classification: parseJson(row.classification),
    })),
    correlations: correlations.map((row) => ({
      ...row,
      externalEventPayload: row.externalEventPayload
        ? parseJson(row.externalEventPayload)
        : null,
    })),
    narratives: narratives.map((row) => ({
      ...row,
      keyConflicts: row.keyConflicts ? parseJson(row.keyConflicts) : [],
      structuredOutput: row.structuredOutput
        ? parseJson(row.structuredOutput)
        : null,
    })),
  };
}
