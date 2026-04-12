#!/usr/bin/env tsx
/**
 * Story 39.12 — Recommendation Backtest
 *
 * Pulls the last 30 days of trade_recommendation analyses from the DB,
 * checks each recommendation's directional accuracy against how the stock
 * moved within the recommended timeframe, and prints a summary table.
 *
 * Usage:
 *   npx tsx scripts/backtest-recommendations.ts
 *   npx tsx scripts/backtest-recommendations.ts --days 14
 *   npx tsx scripts/backtest-recommendations.ts --tickers AAPL,TSLA,NVDA
 */

import { db } from "@/lib/db/client";
import { analyses } from "@/lib/db/schema";
import { gte, eq, desc } from "drizzle-orm";
import YahooFinance from "yahoo-finance2";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const yf = new YahooFinance() as any;

// ---------- CLI args ----------
const args = process.argv.slice(2);
const daysArg =
  args.find((a) => a.startsWith("--days=")) ?? args[args.indexOf("--days") + 1];
const lookbackDays = daysArg ? Math.max(1, parseInt(String(daysArg), 10)) : 30;
const tickersArg =
  args.find((a) => a.startsWith("--tickers=")) ??
  (args.includes("--tickers") ? args[args.indexOf("--tickers") + 1] : null);
const filterTickers = tickersArg
  ? String(tickersArg)
      .split(",")
      .map((t) => t.trim().toUpperCase())
  : null;

// ---------- Types ----------
interface RecRow {
  id: number;
  ticker: string;
  createdAt: string;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  strategyName: string;
  recommendedExpiry: string | null;
  whaleMatchesRec: boolean;
}

interface PriceCheck {
  ticker: string;
  priceAtRec: number;
  priceAtExpiry: number;
  actualDirection: "bullish" | "bearish" | "neutral";
  changePct: number;
}

interface BacktestResult extends RecRow, PriceCheck {
  correct: boolean;
}

// ---------- Main ----------
async function main() {
  const since = new Date(
    Date.now() - lookbackDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  console.log(`\n=== Recommendation Backtest — last ${lookbackDays} days ===`);
  if (filterTickers) console.log(`Filtering to: ${filterTickers.join(", ")}`);

  // Fetch recommendations
  const rows = await db
    .select()
    .from(analyses)
    .where(gte(analyses.createdAt, since))
    .orderBy(desc(analyses.createdAt));

  const recRows = rows.filter((r) => r.type === "trade_recommendation");
  console.log(`Found ${recRows.length} trade_recommendation rows`);

  const parsed: RecRow[] = [];
  for (const row of recRows) {
    try {
      const out = JSON.parse(row.output ?? "{}");
      const ticker: string = out.ticker ?? "";
      if (!ticker) continue;
      if (filterTickers && !filterTickers.includes(ticker)) continue;

      // Extract first leg expiry as recommended expiry
      const firstLeg = out.primary_strategy?.legs?.[0];
      const recommendedExpiry: string | null = firstLeg?.expiry ?? null;

      parsed.push({
        id: row.id,
        ticker,
        createdAt: row.createdAt ?? "",
        direction: out.direction ?? "neutral",
        confidence: row.confidence ?? 0,
        strategyName: out.primary_strategy?.name ?? "unknown",
        recommendedExpiry,
        whaleMatchesRec: out.whale_alignment?.matches_whale ?? false,
      });
    } catch {
      // skip
    }
  }

  console.log(`Parsed ${parsed.length} recommendations\n`);

  if (parsed.length === 0) {
    console.log("No recommendations found. Have you run the pipeline?");
    process.exit(0);
  }

  // Deduplicate: keep only the most recent rec per ticker
  const deduped = new Map<string, RecRow>();
  for (const r of parsed) {
    if (!deduped.has(r.ticker)) deduped.set(r.ticker, r);
  }
  const uniqueRecs = [...deduped.values()];
  console.log(`Unique tickers: ${uniqueRecs.length}`);

  // Fetch price data + compute direction accuracy
  const results: BacktestResult[] = [];
  for (const rec of uniqueRecs) {
    try {
      const recDate = new Date(rec.createdAt);
      const expiryDate = rec.recommendedExpiry
        ? new Date(rec.recommendedExpiry)
        : new Date(recDate.getTime() + 30 * 24 * 60 * 60 * 1000);
      const checkDate = expiryDate < new Date() ? expiryDate : new Date();

      // Fetch historical range from rec date to check date
      const startStr = recDate.toISOString().split("T")[0];
      const endStr = checkDate.toISOString().split("T")[0];

      if (startStr === endStr) {
        console.warn(`  [${rec.ticker}] Same day — skipping price check`);
        continue;
      }

      const hist = await yf.chart(rec.ticker, {
        period1: startStr,
        period2: endStr,
        interval: "1d",
      });

      const quotes = hist?.quotes ?? [];
      if (quotes.length < 2) {
        console.warn(`  [${rec.ticker}] Insufficient price data`);
        continue;
      }

      const priceAtRec = quotes[0]?.close ?? 0;
      const priceAtExpiry = quotes[quotes.length - 1]?.close ?? 0;
      if (priceAtRec === 0) continue;

      const changePct = ((priceAtExpiry - priceAtRec) / priceAtRec) * 100;
      const actualDirection: "bullish" | "bearish" | "neutral" =
        changePct > 1 ? "bullish" : changePct < -1 ? "bearish" : "neutral";

      const correct =
        rec.direction === "neutral"
          ? Math.abs(changePct) <= 1
          : rec.direction === actualDirection;

      results.push({
        ...rec,
        priceAtRec,
        priceAtExpiry,
        actualDirection,
        changePct,
        correct,
      });

      const mark = correct ? "✅" : "❌";
      console.log(
        `  ${mark} ${rec.ticker.padEnd(6)} rec=${rec.direction.padEnd(7)} actual=${actualDirection.padEnd(7)} ` +
          `Δ${changePct > 0 ? "+" : ""}${changePct.toFixed(1)}%  conf=${rec.confidence.toFixed(2)} ` +
          `whale_match=${rec.whaleMatchesRec}`,
      );
    } catch (err) {
      console.warn(`  [${rec.ticker}] Price fetch failed: ${err}`);
    }
  }

  if (results.length === 0) {
    console.log("\nNo results with price data.");
    process.exit(0);
  }

  // Summary
  const correct = results.filter((r) => r.correct).length;
  const incorrect = results.filter((r) => !r.correct).length;
  const hitRate = ((correct / results.length) * 100).toFixed(1);

  const whaleAgreements = results.filter((r) => r.whaleMatchesRec);
  const whaleConflicts = results.filter((r) => !r.whaleMatchesRec);
  const whaleAgreementHitRate =
    whaleAgreements.length > 0
      ? (
          (whaleAgreements.filter((r) => r.correct).length /
            whaleAgreements.length) *
          100
        ).toFixed(1)
      : "N/A";
  const whaleConflictHitRate =
    whaleConflicts.length > 0
      ? (
          (whaleConflicts.filter((r) => r.correct).length /
            whaleConflicts.length) *
          100
        ).toFixed(1)
      : "N/A";

  console.log(`
=== SUMMARY ===
Total checked:          ${results.length}
Directionally correct:  ${correct} (${hitRate}%)
Directionally wrong:    ${incorrect}

Breakdown by whale alignment:
  Whale agrees with rec:     ${whaleAgreements.length} recs → ${whaleAgreementHitRate}% hit rate
  Whale conflicts with rec:  ${whaleConflicts.length} recs → ${whaleConflictHitRate}% hit rate

Per-ticker detail:`);

  for (const r of results.sort((a, b) => b.confidence - a.confidence)) {
    const mark = r.correct ? "✅" : "❌";
    console.log(
      `  ${mark} ${r.ticker.padEnd(6)} ${r.direction.padEnd(7)} conf=${r.confidence.toFixed(2)} ` +
        `Δ${r.changePct > 0 ? "+" : ""}${r.changePct.toFixed(1)}% (${r.strategyName})`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Backtest failed:", err);
  process.exit(1);
});
