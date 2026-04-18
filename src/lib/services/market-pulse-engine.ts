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

const CLASSIFICATION_BATCH_SIZE = 8;
const CLASSIFICATION_CALL_TYPE = "marketPulseClassify";
const CORRELATION_CALL_TYPE = "marketPulseCorrelate";
const SYNTHESIS_CALL_TYPE = "marketPulseNarrative";

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
  trigger?: "manual" | "scheduled";
  windowSize?: number;
  runId?: string;
}): Promise<MarketPulseClassificationRunResult> {
  const ticker = marketPulseTickerSchema.parse(options.ticker);
  const trigger = options.trigger ?? "manual";
  const windowSize = options.windowSize ?? MARKET_PULSE_DEFAULT_WINDOW_SIZE;
  const candles = await fetchCandleWindow(ticker, windowSize);

  if (candles.length === 0) {
    throw new Error(`No 15-minute candle data available for ${ticker}`);
  }

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
  for (const batch of batches) {
    try {
      const prompt = buildClassifierPrompt(batch);
      const response = await callLlmWithRetry(
        MARKET_PULSE_CLASSIFIER_SYSTEM_INSTRUCTION,
        prompt,
        MARKET_PULSE_CLASSIFIER_RESPONSE_SCHEMA,
        marketPulseClassifierZodSchema,
        {
          callType: CLASSIFICATION_CALL_TYPE,
          temperature: 0,
          maxOutputTokens: 4096,
        },
      );

      successfulClassifications.push(...validateBatchResponse(batch, response));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[MarketPulse] Classification batch failed for ${ticker}:`,
        error,
      );
      errors.push(message);
    }
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
  trigger?: "manual" | "scheduled";
  windowSize?: number;
  runId?: string;
}): Promise<MarketPulseOrchestrationResult> {
  const ticker = marketPulseTickerSchema.parse(options.ticker);
  const runId = options.runId ?? crypto.randomUUID();
  const beforeCorrelationTokens = getCallTypeTokens(CORRELATION_CALL_TYPE);
  const beforeNarrativeTokens = getCallTypeTokens(SYNTHESIS_CALL_TYPE);
  const runStartedAtMs = Date.now();

  const classificationRun = await classifyCandles({
    ticker,
    trigger: options.trigger,
    windowSize: options.windowSize,
    runId,
  });

  const allEvents = [
    ...classificationRun.classifications,
    ...classificationRun.sequenceEvents,
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
  try {
    correlations = await correlateCatalysts({
      runId,
      ticker,
      classifications: allEvents,
    });
    const correlationTokens =
      getCallTypeTokens(CORRELATION_CALL_TYPE) - beforeCorrelationTokens;
    telemetry.stages.correlation = {
      durationMs: Date.now() - correlationStartedAt,
      llmTokensUsed: Math.max(0, correlationTokens),
      itemCount: correlations.length,
      averageConfidence: buildAverageConfidence(correlations),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`correlation: ${message}`);
  }

  const priorNarrative = await previousNarrative(ticker);
  const narrativeStartedAt = Date.now();
  try {
    narrative = await synthesizeNarrative({
      runId,
      ticker,
      classifications: allEvents,
      correlations,
      priorNarrative: priorNarrative?.payload ?? null,
    });
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
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`narrative: ${message}`);
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

async function previousNarrative(
  ticker: string,
): Promise<{
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
      temperature: 0,
      maxOutputTokens: 3072,
    },
  );

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
      temperature: 0.3,
      maxOutputTokens: 2048,
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
