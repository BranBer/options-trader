#!/usr/bin/env tsx
/**
 * Story S4 — Jev judgment scorer CLI.
 *
 * Scores every matured (horizon elapsed, no outcome yet) Jev judgment
 * against realized returns, then prints a calibration table per
 * (context_type, question_id).
 *
 * Usage:
 *   npx tsx scripts/score-jev-judgments.ts
 */
import {
  getJevCalibration,
  scoreMaturedJudgments,
} from "@/lib/services/jev-judgments";

async function main() {
  const { scored, skipped } = await scoreMaturedJudgments();
  console.log(
    `Scored ${scored} judgment(s); ${skipped} not yet matured or missing price data.`,
  );

  const calibration = await getJevCalibration();
  if (calibration.length === 0) {
    console.log("No scored judgments yet — nothing to calibrate.");
    process.exit(0);
  }

  console.log("\n=== Jev Calibration ===");
  console.log(
    "context_type".padEnd(16) +
      "question_id".padEnd(20) +
      "n".padEnd(6) +
      "hit_rate".padEnd(10) +
      "mean_excess_by_choice".padEnd(44) +
      "brier (jev/baseline)",
  );
  for (const row of calibration) {
    const hitRate =
      row.hitRate != null ? `${(row.hitRate * 100).toFixed(1)}%` : "n/a";
    const excess = row.meanExcessReturnByChoice
      ? Object.entries(row.meanExcessReturnByChoice)
          .map(([k, v]) => `${k}=${(v * 100).toFixed(2)}%`)
          .join(", ")
      : "n/a";
    const brier = row.brier
      ? `${row.brier.jev.toFixed(3)} / ${row.brier.baseline.toFixed(3)}`
      : "n/a";
    console.log(
      row.contextType.padEnd(16) +
        row.questionId.padEnd(20) +
        String(row.n).padEnd(6) +
        hitRate.padEnd(10) +
        excess.padEnd(44) +
        brier,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Jev scoring failed:", err);
  process.exit(1);
});
