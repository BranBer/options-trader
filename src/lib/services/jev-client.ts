/**
 * Story S4 — Raw fetch client for TypeSafe "Jev" (System One).
 *
 * We call the endpoint directly instead of the `@typesafe-ai/sdk` package:
 * a few lines of fetch + retry cover our needs and avoid taking on a
 * pre-1.0, fast-moving dependency (see docs/research/jev-typesafe-api.md
 * gotcha #3 — the SDK had a breaking Score.criteria change in 0.6.0).
 *
 * Contract (verified in docs/research/jev-typesafe-api.md):
 *   POST https://api.typesafe.ai/v1/systemone
 *   Authorization: Bearer <JEV_KEY>   (NOT the SDK's default TYPESAFE_API_KEY)
 *   body: { state, model, questions }
 *   response: { model, answers, usage }
 *
 * Jev is not a calibrated market forecaster — see jev-judgments.ts for how
 * we log every answer and score it against realized returns instead of
 * trusting the raw probabilities.
 */

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

/** Pinned per the story spec — log the `model` the response actually returns. */
export const JEV_MODEL = "jev-1.13.0";

const MAX_ATTEMPTS = 3; // 1 initial + 2 retries
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 529]);
const BASE_BACKOFF_MS = 500;

export type JevQuestionType = "choice" | "score" | "noul";

export interface JevChoiceQuestion {
  type: "choice";
  instructions: string;
  /** optionName -> description (description may be null per the docs) */
  criteria: Record<string, string | null>;
}

export interface JevScoreQuestion {
  type: "score";
  instructions: string;
  /** Ordered array; level number = array index (0-based). 2–10 levels. */
  criteria: string[];
}

export interface JevNoulQuestion {
  type: "noul";
  instructions: string;
  criteria?: { true?: string; false?: string };
}

export type JevQuestion = JevChoiceQuestion | JevScoreQuestion | JevNoulQuestion;

export interface JevChoiceAnswer {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface JevScoreAnswer {
  type: "score";
  /** Expected value (levels x probability) — fractional, 0-based. */
  score: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface JevNoulAnswer {
  type: "noul";
  /** P(yes), 0..1. No confidence field for Noul. */
  noul: number;
}

export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer;

export interface AskJevResult {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number };
}

export interface AskJevOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class JevApiError extends Error {
  readonly status: number;
  readonly requestId?: string;
  readonly body?: unknown;

  constructor(
    message: string,
    status: number,
    opts?: { requestId?: string; body?: unknown },
  ) {
    super(message);
    this.name = "JevApiError";
    this.status = status;
    this.requestId = opts?.requestId;
    this.body = opts?.body;
  }
}

let missingKeyLogged = false;

/** Whether JEV_KEY is configured. Callers should skip Jev entirely (and log once) when false. */
export function hasJevKey(): boolean {
  return !!process.env.JEV_KEY;
}

/** Logs the missing-key warning exactly once per process. Returns true iff a key is present. */
export function warnIfJevKeyMissing(): boolean {
  if (hasJevKey()) return true;
  if (!missingKeyLogged) {
    console.warn(
      "[JevClient] JEV_KEY is not set — skipping Jev judgments for this and subsequent calls",
    );
    missingKeyLogged = true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Jev System One with a single state + a map of questions (fan-out:
 * every question in `questions` is answered in one request/response).
 *
 * Retries 429/5xx/529 up to twice with exponential backoff. Throws a
 * `JevApiError` (with `status`) on final failure. Throws immediately
 * (no retry) if JEV_KEY is missing — callers should check
 * `warnIfJevKeyMissing()` first and skip the call entirely.
 */
export async function askJev(
  state: unknown,
  questions: Record<string, JevQuestion>,
  options?: AskJevOptions,
): Promise<AskJevResult> {
  const apiKey = process.env.JEV_KEY;
  if (!apiKey) {
    throw new JevApiError("JEV_KEY is not set", 0);
  }

  const timeoutMs = options?.timeoutMs ?? 15_000;
  const externalSignal = options?.signal;

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
    const onExternalAbort = () => controller.abort();
    externalSignal?.addEventListener("abort", onExternalAbort);

    try {
      const res = await fetch(JEV_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ state, model: JEV_MODEL, questions }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const requestId =
          res.headers.get("x-typesafe-request-id") ?? undefined;
        let body: unknown;
        try {
          body = await res.json();
        } catch {
          /* undocumented error body shape — best effort only */
        }

        const canRetry =
          RETRYABLE_STATUSES.has(res.status) && attempt < MAX_ATTEMPTS - 1;
        const error = new JevApiError(
          `Jev request failed with status ${res.status}`,
          res.status,
          { requestId, body },
        );

        if (canRetry) {
          lastError = error;
          await sleep(BASE_BACKOFF_MS * 2 ** attempt);
          continue;
        }
        throw error;
      }

      const json = (await res.json()) as AskJevResult;
      return json;
    } catch (err) {
      if (err instanceof JevApiError) throw err;

      // Network error or abort (e.g. our own timeout) — retry like a 5xx.
      lastError = err;
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(BASE_BACKOFF_MS * 2 ** attempt);
        continue;
      }
      throw new JevApiError(
        err instanceof Error ? err.message : "Jev request failed",
        0,
      );
    } finally {
      clearTimeout(timeoutHandle);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }
  }

  // Unreachable in practice (the loop always returns or throws), but keeps
  // TypeScript happy and gives a sane error if it ever were.
  throw lastError instanceof Error
    ? lastError
    : new JevApiError("Jev request failed", 0);
}
