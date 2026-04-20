import OpenAI from "openai";

const DEFAULT_OPEN_ROUTER_MODEL = "moonshotai/kimi-k2.5";
// Ordered fallback chain for both empty-response and rate-limit recovery.
// Each model is tried in order; once exhausted, it's never revisited.
const RATE_LIMIT_FALLBACK_CHAIN = [
  "moonshotai/kimi-k2.5",
  "google/gemini-2.0-flash-001",
  "qwen/qwen3-30b-a3b",
];

let client: OpenAI | null = null;

interface TokenUsageRecord {
  callType: string;
  outputTokens: number;
  maxOutputTokens: number;
  usagePct: number;
  timestamp: string;
}

const tokenUsageLog: TokenUsageRecord[] = [];
const MAX_TOKEN_LOG_SIZE = 200;

function isPreviewModel(model: string): boolean {
  return model.toLowerCase().includes("preview");
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as {
    code?: number | string;
    status?: number;
    message?: string;
    error?: { message?: string; metadata?: { raw?: string } };
  };

  const raw =
    `${maybeError.message ?? ""} ${maybeError.error?.message ?? ""} ${maybeError.error?.metadata?.raw ?? ""}`.toLowerCase();
  return (
    maybeError.code === 429 ||
    maybeError.code === "429" ||
    maybeError.status === 429 ||
    raw.includes("429") ||
    raw.includes("rate limit") ||
    raw.includes("provider returned error")
  );
}

function isPreviewRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as {
    code?: number | string;
    error?: { metadata?: { raw?: string } };
  };

  const raw = maybeError.error?.metadata?.raw?.toLowerCase() ?? "";
  return maybeError.code === 429 && raw.includes("preview");
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  let json: string;

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    json = trimmed;
  } else {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      json = fenced[1].trim();
    } else {
      const objMatch = trimmed.match(/(\{[\s\S]*\})/);
      if (objMatch) {
        json = objMatch[1];
      } else {
        const arrMatch = trimmed.match(/(\[[\s\S]*\])/);
        json = arrMatch ? arrMatch[1] : trimmed;
      }
    }
  }

  return repairJson(json);
}

function repairJson(json: string): string {
  let repaired = json.replace(/^\s*\/\/.*$/gm, "");
  repaired = repaired.replace(/,\s*(?=[}\]])/g, "");
  return repaired;
}

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPEN_ROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPEN_ROUTER_API_KEY environment variable is required");
    }

    client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
      defaultHeaders: {
        "HTTP-Referer": "https://options-dashboard.local",
        "X-Title": "Options Dashboard",
      },
    });
  }

  return client;
}

export function getModel(): string {
  return process.env.OPEN_ROUTER_MODEL ?? DEFAULT_OPEN_ROUTER_MODEL;
}

/** Model used exclusively for Market Pulse pipeline calls. */
export function getMarketPulseModel(): string {
  return process.env.MARKET_PULSE_MODEL ?? getModel();
}

function getStableModelOverride(
  override: string | undefined,
  label: string,
): string | null {
  if (!override) return null;
  if (!isPreviewModel(override)) {
    return override;
  }

  console.warn(
    `[LLM] Ignoring preview ${label} override (${override}) and using stable fallback ${DEFAULT_OPEN_ROUTER_MODEL}`,
  );
  return DEFAULT_OPEN_ROUTER_MODEL;
}

export function getClassifyNewsModel(): string {
  const override = getStableModelOverride(
    process.env.OPEN_ROUTER_NEWS_MODEL,
    "news model",
  );
  if (override) return override;

  const defaultModel = getModel();
  return isPreviewModel(defaultModel)
    ? DEFAULT_OPEN_ROUTER_MODEL
    : defaultModel;
}

export function resetLlmClient(): void {
  client = null;
}

export function getTokenUsageStats(): {
  recentCalls: TokenUsageRecord[];
  byCallType: Record<
    string,
    { count: number; avgTokens: number; maxTokens: number; avgUsagePct: number }
  >;
} {
  const byCallType: Record<
    string,
    { count: number; totalTokens: number; maxTokens: number; totalPct: number }
  > = {};

  for (const record of tokenUsageLog) {
    const entry = byCallType[record.callType] ?? {
      count: 0,
      totalTokens: 0,
      maxTokens: 0,
      totalPct: 0,
    };
    entry.count++;
    entry.totalTokens += record.outputTokens;
    entry.maxTokens = Math.max(entry.maxTokens, record.outputTokens);
    entry.totalPct += record.usagePct;
    byCallType[record.callType] = entry;
  }

  const summary: Record<
    string,
    { count: number; avgTokens: number; maxTokens: number; avgUsagePct: number }
  > = {};

  for (const [callType, value] of Object.entries(byCallType)) {
    summary[callType] = {
      count: value.count,
      avgTokens: Math.round(value.totalTokens / value.count),
      maxTokens: value.maxTokens,
      avgUsagePct: Math.round(value.totalPct / value.count),
    };
  }

  return { recentCalls: tokenUsageLog.slice(-20), byCallType: summary };
}

export function getTokenUsageSnapshot(): Record<
  string,
  { count: number; totalTokens: number }
> {
  const snapshot: Record<string, { count: number; totalTokens: number }> = {};

  for (const record of tokenUsageLog) {
    const entry = snapshot[record.callType] ?? { count: 0, totalTokens: 0 };
    entry.count += 1;
    entry.totalTokens += record.outputTokens;
    snapshot[record.callType] = entry;
  }

  return snapshot;
}

export async function callLlmWithRetry<T>(
  systemInstruction: string,
  userPrompt: string,
  responseSchema: object,
  zodSchema: { parse: (data: unknown) => T },
  options: {
    callType?: string;
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
    maxRetries?: number;
    preprocessParsedJson?: (data: unknown) => unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const {
    callType = "unknown",
    model: requestedModel,
    temperature = 0.1,
    maxOutputTokens = 8192,
    maxRetries = 3,
    preprocessParsedJson,
    signal,
  } = options;

  const openai = getClient();
  let activeModel = requestedModel ?? getModel();
  let emptyResponseCount = 0;
  let rateLimitSwitchCount = 0;
  // Track models that have been exhausted (empty or rate-limited) so the
  // fallback logic never cycles back to a known-bad model.
  const exhaustedModels = new Set<string>();

  const schemaGuidance = `\n\nYou MUST respond with ONLY a valid JSON object matching this exact schema — no markdown, no commentary, no explanation:\n${JSON.stringify(responseSchema, null, 2)}`;
  const fullSystemPrompt = systemInstruction + schemaGuidance;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let rawText = "";

    // Check abort signal before each attempt
    if (signal?.aborted) {
      throw new DOMException("LLM call cancelled", "AbortError");
    }

    try {
      const params: Record<string, unknown> = {
        model: activeModel,
        messages: [
          { role: "system", content: fullSystemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature,
        max_tokens: maxOutputTokens,
      };

      const modelLower = activeModel.toLowerCase();
      if (
        modelLower.includes("qwen3.5") ||
        modelLower.includes("qwen/qwen3.5")
      ) {
        params.reasoning = { effort: "none" };
      }

      const result = await openai.chat.completions.create(
        params as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming,
        { timeout: 60_000, signal: signal ?? undefined },
      );

      rawText = result.choices[0]?.message?.content ?? "";
      if (!rawText || rawText.trim().length === 0) {
        emptyResponseCount++;
        // Mark current model as exhausted and walk the fallback chain to find
        // the next model that hasn't already failed.
        exhaustedModels.add(activeModel);
        const nextModel = RATE_LIMIT_FALLBACK_CHAIN.find(
          (m) => !exhaustedModels.has(m),
        );
        if (nextModel && nextModel !== activeModel) {
          console.warn(
            `[LLM] ${callType} got ${emptyResponseCount} empty responses from ${activeModel}; switching to ${nextModel}`,
          );
          activeModel = nextModel;
        }
        throw new Error("Empty response from model — retrying");
      }
      // Reset on a successful non-empty response
      emptyResponseCount = 0;

      const outputTokens =
        result.usage?.completion_tokens ?? Math.round(rawText.length / 4);
      const totalTokens = result.usage?.total_tokens ?? 0;
      const usagePct = Math.round((outputTokens / maxOutputTokens) * 100);

      console.log(
        `[LLM] ${callType} response: ${outputTokens} tokens out, ${totalTokens} total (model: ${activeModel})`,
      );
      if (usagePct > 80) {
        console.warn(
          `[LLM] ⚠️ ${callType} used ${usagePct}% of token limit — consider increasing maxOutputTokens`,
        );
      }

      tokenUsageLog.push({
        callType,
        outputTokens: Math.round(outputTokens),
        maxOutputTokens,
        usagePct,
        timestamp: new Date().toISOString(),
      });
      if (tokenUsageLog.length > MAX_TOKEN_LOG_SIZE) {
        tokenUsageLog.splice(0, tokenUsageLog.length - MAX_TOKEN_LOG_SIZE);
      }

      const jsonText = extractJson(rawText);
      const parsed = preprocessParsedJson
        ? preprocessParsedJson(JSON.parse(jsonText))
        : JSON.parse(jsonText);

      return zodSchema.parse(parsed);
    } catch (error) {
      if (
        (callType === "simTradeEval" || callType === "classifyNews") &&
        isPreviewModel(activeModel) &&
        isPreviewRateLimitError(error)
      ) {
        console.warn(
          `[LLM] ${callType} preview model ${activeModel} was rate-limited; retrying with stable fallback ${DEFAULT_OPEN_ROUTER_MODEL}`,
        );
        activeModel = DEFAULT_OPEN_ROUTER_MODEL;
        continue;
      }

      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[LLM] ${callType} attempt ${attempt + 1}/${maxRetries} failed:`,
        errMsg.slice(0, 500),
      );
      if (isRateLimitError(error)) {
        console.warn(
          `[LLM] ${callType} appears rate-limited on model ${activeModel}; backing off before retry`,
        );
        // Mark current model as exhausted and walk the fallback chain to find
        // the next model that hasn't already failed.
        exhaustedModels.add(activeModel);
        const nextModel = RATE_LIMIT_FALLBACK_CHAIN.find(
          (m) => !exhaustedModels.has(m),
        );
        if (
          nextModel &&
          rateLimitSwitchCount < RATE_LIMIT_FALLBACK_CHAIN.length - 1
        ) {
          console.warn(
            `[LLM] ${callType} switching from rate-limited ${activeModel} → ${nextModel}`,
          );
          activeModel = nextModel;
          rateLimitSwitchCount++;
          attempt = -1; // reset — loop increments to 0
          continue;
        }
      }
      if (rawText) {
        console.error(`[LLM] Raw response preview: ${rawText.slice(0, 400)}`);
      }
      if (attempt === maxRetries - 1) throw error;

      const isEmptyResponse =
        error instanceof Error &&
        error.message.includes("Empty response from model");
      // Empty responses: retry fast (500ms flat) since the issue is the model,
      // not rate-limiting. Rate limits: 5s base with exponential backoff.
      // Other errors: 2s base with exponential backoff.
      const delayMs = isEmptyResponse
        ? 500
        : isRateLimitError(error)
          ? 5000 * Math.pow(2, attempt)
          : 2000 * Math.pow(2, attempt);

      // Abort-aware sleep: don't burn seconds waiting if the caller cancelled
      if (signal?.aborted)
        throw new DOMException("LLM call cancelled", "AbortError");
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("LLM call cancelled", "AbortError"));
          },
          { once: true },
        );
      });
    }
  }

  throw new Error(`LLM ${callType} call failed after retries`);
}
