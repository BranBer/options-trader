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

for (const ticker of ["NVDA", "AMZN"]) {
  const runs = db
    .select({
      runId: marketPulseRuns.runId,
      status: marketPulseRuns.status,
      startedAt: marketPulseRuns.startedAt,
      errorMessage: marketPulseRuns.errorMessage,
    })
    .from(marketPulseRuns)
    .where(eq(marketPulseRuns.ticker, ticker))
    .orderBy(desc(marketPulseRuns.startedAt))
    .limit(5)
    .all();

  console.log(`\nRecent ${ticker} runs:`);
  for (const r of runs) {
    console.log(
      `  ${r.status} | ${r.runId?.substring(0, 8)} | ${r.startedAt} | ${r.errorMessage ?? ""}`,
    );
  }
}
