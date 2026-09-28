/**
 * Story S4 — Jev judgment ledger.
 *
 * Builds the bucketed `state` we send to Jev for news and recommendations,
 * fans every question out in one `askJev` call per item, logs every raw
 * answer to `jev_judgments`, and later scores the directional answers
 * against realized returns (see scoreMaturedJudgments / getJevCalibration).
 *
 * IMPORTANT: Jev's probabilities are evidence readings over the `state` we
 * hand it, not calibrated forecasts of what the market will do (one
 * bullish headline got 100% on "up over 5 days"). Never surface a raw Jev
 * probability as "P(price goes up)" — log it, then score it here.
 */
import { createHash } from "crypto";
import YahooFinance from "yahoo-finance2";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { jevJudgments, marketSnapshots } from "@/lib/db/schema";
import {
  askJev,
  warnIfJevKeyMissing,
  type JevAnswer,
  type JevChoiceAnswer,
  type JevQuestion,
} from "@/lib/services/jev-client";
import type { TradeRecommendation } from "@/types/analysis";
import { parseDbTime } from "@/lib/utils/formatters";

// yahoo-finance2 v3 class API — types export `never` but methods exist at runtime
// (same workaround used in src/lib/services/market-fetcher.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new YahooFinance() as any;

const DIRECTION_HORIZON_DAYS = 5;
const MAX_STATE_TEXT_LEN = 600;

// ── Question sets (tune wording here — one place) ──────────────────────

export const NEWS_QUESTIONS: Record<string, JevQuestion> = {
  relevance: {
    type: "noul",
    instructions:
      "Is `headline` (and `summary`, if present) materially about `ticker` — i.e. `ticker` is the main subject of the story — rather than a passing mention, or a story primarily about a different company or topic that only tangentially involves `ticker`?",
  },
  direction: {
    type: "choice",
    instructions:
      "Over the next 5 trading days, does the evidence in `headline` and `summary` favor `ticker`'s stock price moving up, moving down, or is it unclear?",
    criteria: {
      up: "The news is evidence that favors the stock price rising over the next 5 trading days.",
      down: "The news is evidence that favors the stock price falling over the next 5 trading days.",
      unclear:
        "The evidence is mixed, the news is already known or priced in, or it is not clearly positive or negative for this company.",
    },
  },
  surprise: {
    type: "score",
    instructions:
      "How surprising is this news relative to what informed investors already expected for `ticker`?",
    criteria: [
      "Routine or already expected — a recap, scheduled release, or previously known information.",
      "Mildly surprising — an incremental update investors were partially anticipating.",
      "Surprising — a meaningful deviation from consensus expectations.",
      "Highly surprising — materially changes the outlook for the company.",
    ],
  },
  magnitude: {
    type: "score",
    instructions:
      "If this news were the primary driver of `ticker`'s stock price on the day it is published, how large a one-day price move is plausible?",
    criteria: [
      "Under 1% — negligible expected price impact.",
      "1% to 3% — a modest, routine-news-sized move.",
      "3% to 7% — a notable move for a single news item.",
      "7% to 15% — a large move, typical of a major surprise.",
      "Over 15% — an extreme move.",
    ],
  },
};

export const RECOMMENDATION_QUESTIONS: Record<string, JevQuestion> = {
  thesis_supported: {
    type: "choice",
    instructions:
      "Does the evidence in `risk_factors`, `market_context`, and `whale_alignment` support, partially support, contradict, or have no clear bearing on `thesis`?",
    criteria: {
      supports: "The evidence is consistent with and reinforces the thesis.",
      partial:
        "Some of the evidence supports the thesis and some cuts against it.",
      contradicts:
        "The evidence largely undermines or conflicts with the thesis.",
      unrelated:
        "The evidence has no clear bearing on the thesis either way.",
    },
  },
  scheduled_catalyst: {
    type: "noul",
    instructions:
      "Does the evidence mention a scheduled event (such as earnings, a Fed decision, or a product launch) occurring before the option position's expiry that could move `ticker`'s stock sharply in either direction?",
  },
  direction: {
    type: "choice",
    instructions:
      "Over the next 5 trading days, does the evidence favor `ticker`'s stock price moving up, moving down, or is it unclear?",
    criteria: {
      up: "The evidence favors the stock price rising over the next 5 trading days.",
      down: "The evidence favors the stock price falling over the next 5 trading days.",
      unclear:
        "The evidence is balanced, insufficient, or does not clearly favor either direction.",
    },
  },
};

// ── Bucketing helpers (Jev cannot do arithmetic or order dates — bucket
//    everything numeric/date-shaped into words before it reaches `state`) ──

export function truncateText(
  text: string,
  max: number = MAX_STATE_TEXT_LEN,
): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

function etParts(date: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

function etDateStr(date: Date): string {
  const p = etParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function etMinutesOfDay(date: Date): number {
  const p = etParts(date);
  return parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
}

/** "pre-market" | "regular session" | "after-hours" | "weekend" | "unknown" */
export function publishTimeBucket(publishedAt: string | null | undefined): string {
  if (!publishedAt) return "unknown";
  const d = new Date(publishedAt);
  if (Number.isNaN(d.getTime())) return "unknown";
  const p = etParts(d);
  if (p.weekday === "Sat" || p.weekday === "Sun") return "weekend";
  const minutes = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
  if (minutes < 9 * 60 + 30) return "pre-market";
  if (minutes < 16 * 60) return "regular session";
  return "after-hours";
}

function parseNumericFromString(s: string | undefined | null): number | null {
  if (!s) return null;
  const match = s.match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

/**
 * Best-effort word-bucket for the move required to reach breakeven, e.g.
 * "3% to 7%". Returns null when we can't resolve a price (never blocks the
 * judgment — the field is simply omitted from state in that case).
 */
async function computeRequiredMoveBucket(
  ticker: string,
  breakevenStr: string | undefined,
  createdAt: string | null,
): Promise<string | null> {
  const breakeven = parseNumericFromString(breakevenStr);
  if (breakeven == null) return null;

  try {
    const rows = await db
      .select()
      .from(marketSnapshots)
      .where(eq(marketSnapshots.ticker, ticker))
      .orderBy(desc(marketSnapshots.capturedAt))
      .limit(10);

    const candidate =
      rows.find((r) => !createdAt || (r.capturedAt ?? "") <= createdAt) ??
      rows[0];
    const price = candidate?.price;
    if (!price || price <= 0) return null;

    const pct = (Math.abs(breakeven - price) / price) * 100;
    if (pct < 3) return "under 3%";
    if (pct < 7) return "3% to 7%";
    if (pct < 15) return "7% to 15%";
    return "over 15%";
  } catch {
    return null;
  }
}

function hashState(state: unknown): string {
  return createHash("sha256").update(JSON.stringify(state)).digest("hex");
}

// ── Ledger writes ───────────────────────────────────────────────────────

interface LedgerRowInput {
  contextType: "news" | "recommendation";
  contextRef: string;
  ticker: string;
  model: string;
  answers: Record<string, JevAnswer>;
  stateHash: string;
  horizonDaysByQuestion?: Record<string, number>;
}

async function insertLedgerRows(input: LedgerRowInput): Promise<number> {
  const rows = Object.entries(input.answers).map(([questionId, answer]) => ({
    contextType: input.contextType,
    contextRef: input.contextRef,
    ticker: input.ticker,
    questionId,
    questionType: answer.type,
    model: input.model,
    answer: JSON.stringify(answer),
    stateHash: input.stateHash,
    horizonDays: input.horizonDaysByQuestion?.[questionId] ?? null,
  }));
  if (rows.length === 0) return 0;
  await db.insert(jevJudgments).values(rows);
  return rows.length;
}

/**
 * Returns the set of "contextRef:ticker" pairs already judged for the given
 * context type, so pipelines can skip already-judged (row, ticker) pairs
 * without an N-query loop.
 */
export async function getJudgedContextRefs(
  contextType: "news" | "recommendation",
  contextRefs: string[],
): Promise<Set<string>> {
  if (contextRefs.length === 0) return new Set();
  const rows = await db
    .select({
      contextRef: jevJudgments.contextRef,
      ticker: jevJudgments.ticker,
    })
    .from(jevJudgments)
    .where(
      and(
        eq(jevJudgments.contextType, contextType),
        inArray(jevJudgments.contextRef, contextRefs),
      ),
    );
  return new Set(rows.map((r) => `${r.contextRef}:${r.ticker}`));
}

export interface NewsRowForJudgment {
  id: number;
  headline: string;
  rawSummary: string | null;
  source: string | null;
  publishedAt: string | null;
}

/**
 * Judge one (news row, ticker) pair: independent-signal questions only —
 * deliberately excludes the existing LLM's own sentiment/impact fields.
 * Wrapped so a Jev failure never propagates to the caller; returns the
 * number of ledger rows written (0 on skip/failure).
 */
export async function judgeNewsForTicker(
  newsRow: NewsRowForJudgment,
  ticker: string,
): Promise<number> {
  if (!warnIfJevKeyMissing()) return 0;

  const state = {
    ticker,
    headline: newsRow.headline,
    summary: truncateText(newsRow.rawSummary ?? ""),
    source: newsRow.source ?? "unknown",
    publish_time: publishTimeBucket(newsRow.publishedAt),
  };

  try {
    const result = await askJev(state, NEWS_QUESTIONS);
    return await insertLedgerRows({
      contextType: "news",
      contextRef: String(newsRow.id),
      ticker,
      model: result.model,
      answers: result.answers,
      stateHash: hashState(state),
      horizonDaysByQuestion: { direction: DIRECTION_HORIZON_DAYS },
    });
  } catch (err) {
    console.warn(
      `[JevJudgments] Failed to judge news ${newsRow.id} for ${ticker}:`,
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

export interface AnalysisRowForJudgment {
  id: number;
  createdAt: string | null;
  output: string | null;
}

/**
 * Judge one trade_recommendation analysis row. Wrapped so a Jev failure
 * never propagates to the caller; returns the number of ledger rows
 * written (0 on skip/failure).
 */
export async function judgeRecommendation(
  analysisRow: AnalysisRowForJudgment,
): Promise<number> {
  if (!warnIfJevKeyMissing()) return 0;

  let parsed: TradeRecommendation;
  try {
    parsed = JSON.parse(analysisRow.output ?? "{}") as TradeRecommendation;
  } catch {
    return 0;
  }
  if (!parsed.ticker || !parsed.thesis) return 0;

  const requiredMove = await computeRequiredMoveBucket(
    parsed.ticker,
    parsed.primary_strategy?.breakeven,
    analysisRow.createdAt,
  );

  const state: Record<string, unknown> = {
    ticker: parsed.ticker,
    recommended_direction: parsed.direction,
    thesis: truncateText(parsed.thesis),
    risk_factors: parsed.risk_factors ?? [],
    market_context: {
      iv_assessment: parsed.market_context?.iv_assessment ?? "unknown",
      volume_assessment: parsed.market_context?.volume_assessment ?? "unknown",
      has_scheduled_catalyst_before_expiry:
        parsed.market_context?.catalyst_date != null,
    },
    whale_alignment: parsed.whale_alignment ?? null,
  };
  if (requiredMove) {
    state.required_move_to_breakeven = requiredMove;
  }

  try {
    const result = await askJev(state, RECOMMENDATION_QUESTIONS);
    return await insertLedgerRows({
      contextType: "recommendation",
      contextRef: String(analysisRow.id),
      ticker: parsed.ticker,
      model: result.model,
      answers: result.answers,
      stateHash: hashState(state),
      horizonDaysByQuestion: { direction: DIRECTION_HORIZON_DAYS },
    });
  } catch (err) {
    console.warn(
      `[JevJudgments] Failed to judge recommendation ${analysisRow.id}:`,
      err instanceof Error ? err.message : err,
    );
    return 0;
  }
}

// ── Scoring against realized returns ────────────────────────────────────

export interface JevOutcome {
  ret: number;
  spyRet: number;
  excess: number;
  label: "up" | "down" | "flat";
}

interface DailyBar {
  dateStr: string;
  open: number;
  close: number;
}

async function fetchDailyBars(
  ticker: string,
  period1: string,
  period2: string,
): Promise<DailyBar[]> {
  const hist = await yf.chart(ticker, { period1, period2, interval: "1d" });
  const quotes = hist?.quotes ?? [];
  return quotes
    .filter(
      (q: { open?: number; close?: number }) =>
        q.open != null && q.close != null,
    )
    .map((q: { date: string | Date; open: number; close: number }) => ({
      dateStr: new Date(q.date).toISOString().slice(0, 10),
      open: q.open,
      close: q.close,
    }));
}

/**
 * Entry index = the first bar at/after `createdAt`'s ET calendar date; if
 * created after 09:30 ET, skip to the next trading day per the spec.
 */
function findEntryIndex(bars: DailyBar[], createdAt: string): number {
  const created = parseDbTime(createdAt);
  if (Number.isNaN(created.getTime())) return -1;
  const createdDateStr = etDateStr(created);
  const afterCutoff = etMinutesOfDay(created) >= 9 * 60 + 30;

  const idx = bars.findIndex((b) => b.dateStr >= createdDateStr);
  if (idx === -1) return -1;
  if (afterCutoff && bars[idx].dateStr === createdDateStr) {
    return idx + 1;
  }
  return idx;
}

function computeOutcome(
  createdAt: string | null,
  horizonDays: number,
  tickerBars: DailyBar[],
  spyBars: DailyBar[],
): JevOutcome | null {
  if (!createdAt) return null;
  const entryIdx = findEntryIndex(tickerBars, createdAt);
  if (entryIdx === -1) return null;

  const exitIdx = entryIdx + horizonDays;
  if (exitIdx >= tickerBars.length) return null; // not matured yet (or missing data)

  const entryBar = tickerBars[entryIdx];
  const exitBar = tickerBars[exitIdx];
  if (!entryBar.open || !exitBar.close) return null;

  const spyEntryIdx = spyBars.findIndex((b) => b.dateStr === entryBar.dateStr);
  const spyExitIdx = spyBars.findIndex((b) => b.dateStr === exitBar.dateStr);
  if (spyEntryIdx === -1 || spyExitIdx === -1) return null;
  const spyEntry = spyBars[spyEntryIdx];
  const spyExit = spyBars[spyExitIdx];
  if (!spyEntry.open || !spyExit.close) return null;

  const ret = (exitBar.close - entryBar.open) / entryBar.open;
  const spyRet = (spyExit.close - spyEntry.open) / spyEntry.open;
  const excess = ret - spyRet;
  const label: JevOutcome["label"] =
    excess > 0.01 ? "up" : excess < -0.01 ? "down" : "flat";

  return { ret, spyRet, excess, label };
}

/**
 * Scores every judgment with a horizon that has (or may have) elapsed and
 * no outcome yet. Batches Yahoo calls per ticker. Rows whose horizon
 * hasn't actually elapsed (insufficient bars past entry) are left
 * unscored and retried on the next run.
 */
export async function scoreMaturedJudgments(): Promise<{
  scored: number;
  skipped: number;
}> {
  const rows = await db
    .select()
    .from(jevJudgments)
    .where(
      and(isNotNull(jevJudgments.horizonDays), isNull(jevJudgments.outcome)),
    );

  if (rows.length === 0) return { scored: 0, skipped: 0 };

  const byTicker = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byTicker.get(row.ticker) ?? [];
    list.push(row);
    byTicker.set(row.ticker, list);
  }

  let scored = 0;
  let skipped = 0;

  for (const [ticker, tickerRows] of byTicker) {
    try {
      const earliestCreated = tickerRows.reduce<string>((min, r) => {
        const created = r.createdAt ?? new Date().toISOString();
        return created < min ? created : min;
      }, tickerRows[0].createdAt ?? new Date().toISOString());

      const period1 = new Date(
        parseDbTime(earliestCreated).getTime() - 3 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .slice(0, 10);
      const period2 = new Date().toISOString().slice(0, 10);

      const [tickerBars, spyBars] = await Promise.all([
        fetchDailyBars(ticker, period1, period2),
        fetchDailyBars("SPY", period1, period2),
      ]);

      for (const row of tickerRows) {
        const outcome = computeOutcome(
          row.createdAt,
          row.horizonDays ?? 0,
          tickerBars,
          spyBars,
        );
        if (!outcome) {
          skipped++;
          continue;
        }
        await db
          .update(jevJudgments)
          .set({
            outcome: JSON.stringify(outcome),
            scoredAt: new Date().toISOString(),
          })
          .where(eq(jevJudgments.id, row.id));
        scored++;
      }
    } catch (err) {
      console.warn(
        `[JevJudgments] Scoring failed for ${ticker}:`,
        err instanceof Error ? err.message : err,
      );
      skipped += tickerRows.length;
    }
  }

  return { scored, skipped };
}

// ── Calibration ──────────────────────────────────────────────────────────

export interface JevCalibrationRow {
  contextType: string;
  questionId: string;
  n: number;
  /** Hit rate of the top choice vs realized label (unclear counts as a "flat" prediction). Null for non-directional questions. */
  hitRate: number | null;
  /** Mean excess return grouped by the top choice value. Null for non-directional questions. */
  meanExcessReturnByChoice: Record<string, number> | null;
  /** Brier score for P(up) vs the realized up/not-up label, alongside a naive base-rate baseline. Null for non-directional questions. */
  brier: { jev: number; baseline: number } | null;
}

/**
 * Per (context_type, question_id): n scored, hit rate of the top choice vs
 * realized label, mean excess return by top choice, and a Brier score vs a
 * naive base-rate baseline. Only "direction"-shaped choice questions (with
 * up/down probabilities) get the directional stats; other question types
 * report n only.
 */
export async function getJevCalibration(): Promise<JevCalibrationRow[]> {
  const rows = await db
    .select()
    .from(jevJudgments)
    .where(isNotNull(jevJudgments.outcome));

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.contextType}:${row.questionId}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const result: JevCalibrationRow[] = [];

  for (const [key, groupRows] of groups) {
    const [contextType, questionId] = key.split(":");
    const n = groupRows.length;

    const parsed = groupRows.map((r) => ({
      answer: JSON.parse(r.answer) as JevAnswer,
      outcome: JSON.parse(r.outcome as string) as JevOutcome,
    }));

    const directional = parsed.filter(
      (p): p is { answer: JevChoiceAnswer; outcome: JevOutcome } =>
        p.answer.type === "choice" &&
        "up" in p.answer.probabilities &&
        "down" in p.answer.probabilities,
    );

    let hitRate: number | null = null;
    let meanExcessReturnByChoice: Record<string, number> | null = null;
    let brier: { jev: number; baseline: number } | null = null;

    if (directional.length > 0) {
      let hits = 0;
      const excessByChoice = new Map<string, number[]>();
      for (const p of directional) {
        const predicted = p.answer.choice === "unclear" ? "flat" : p.answer.choice;
        if (predicted === p.outcome.label) hits++;
        const list = excessByChoice.get(p.answer.choice) ?? [];
        list.push(p.outcome.excess);
        excessByChoice.set(p.answer.choice, list);
      }
      hitRate = hits / directional.length;

      meanExcessReturnByChoice = {};
      for (const [choice, excessList] of excessByChoice) {
        meanExcessReturnByChoice[choice] =
          excessList.reduce((a, b) => a + b, 0) / excessList.length;
      }

      const ys: number[] = directional.map((p) =>
        p.outcome.label === "up" ? 1 : 0,
      );
      const ps = directional.map((p) => p.answer.probabilities.up ?? 0);
      const baseRate = ys.reduce((a, b) => a + b, 0) / ys.length;
      const jevBrier =
        ps.reduce((sum, p, i) => sum + (p - ys[i]) ** 2, 0) / ps.length;
      const baselineBrier =
        ys.reduce((sum, y) => sum + (baseRate - y) ** 2, 0) / ys.length;
      brier = { jev: jevBrier, baseline: baselineBrier };
    }

    result.push({
      contextType,
      questionId,
      n,
      hitRate,
      meanExcessReturnByChoice,
      brier,
    });
  }

  return result.sort(
    (a, b) =>
      a.contextType.localeCompare(b.contextType) ||
      a.questionId.localeCompare(b.questionId),
  );
}
