import { db } from "../src/lib/db/client";
import { marketPulseRuns } from "../src/lib/db/schema";
import { eq, desc } from "drizzle-orm";

const rows = db
  .select({
    runId: marketPulseRuns.runId,
    ticker: marketPulseRuns.ticker,
    status: marketPulseRuns.status,
    startedAt: marketPulseRuns.startedAt,
    completedAt: marketPulseRuns.completedAt,
    errorMessage: marketPulseRuns.errorMessage,
  })
  .from(marketPulseRuns)
  .where(eq(marketPulseRuns.status, "running"))
  .all();

console.log("Running rows:", rows.length);
for (const r of rows) {
  console.log(`  ${r.ticker} | ${r.runId} | started ${r.startedAt}`);
}

// Also show recent runs for NVDA
const nvda = db
  .select({
    runId: marketPulseRuns.runId,
    status: marketPulseRuns.status,
    startedAt: marketPulseRuns.startedAt,
    errorMessage: marketPulseRuns.errorMessage,
  })
  .from(marketPulseRuns)
  .where(eq(marketPulseRuns.ticker, "NVDA"))
  .orderBy(desc(marketPulseRuns.startedAt))
  .limit(5)
  .all();

console.log("\nRecent NVDA runs:");
for (const r of nvda) {
  console.log(
    `  ${r.status} | ${r.runId?.substring(0, 8)} | ${r.startedAt} | ${r.errorMessage ?? ""}`,
  );
}
